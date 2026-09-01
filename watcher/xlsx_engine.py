from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import tempfile
import unicodedata
import zipfile
from html.parser import HTMLParser
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET
from .identity import (extract_metadata, load_identity_registry, record_identity_problem,
                       register_validated_identity, resolve_identity, save_identity_registry)

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "c": "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

METRIC_RULES: dict[str, list[str]] = {
    "contract_value": [r"\bcontract(?:ed)?\s+(?:value|price)\b", r"\bcontract\s+amount\b"],
    "budget": [r"\btotal\s+budget(?:ed)?\s+cost\b", r"\bbudget\s+cost\b", r"\boriginal\s+budget\b"],
    "earned_value": [r"\btotal\s+earned\s+value\b", r"\bearned\s+value\b", r"\bev\b"],
    "actual_cost": [r"\btotal\s+actual\s+cost\b", r"\bactual\s+cost\b", r"\bac\b"],
    "cost_variance": [r"\bcost\s+variance\b", r"\bcv\b"],
    "cpi": [r"\bcpi\b", r"cost\s+performance\s+index"],
    "revenue": [r"\brevenue\b", r"cash\s*in"],
    "gross_profit": [r"\bgross\s+profit\b", r"\bnet\s+profit\b"],
    "direct_cost": [r"\bactual\s+direct\s+cost\b", r"\bdirect\s+actual\s+cost\b", r"\bdirect\s+cost\b"],
    "indirect_cost": [r"\bactual\s+indirect\s+cost\b", r"\bindirect\s+actual\s+cost\b", r"\bindirect\s+cost\b"],
}

CAPABILITY_KEYWORDS = {
    "overview": ["dashboard", "summary"],
    "project_summary": ["project summary", "wbs"],
    "cashflow": ["cashflow", "cash flow", "cash-flow"],
    "direct_cost": ["direct", "resource"],
    "indirect_cost": ["indirect"],
    "boq": ["boq"],
    "forecast": ["forecast", "eac", "etc", "vac"],
    "ledger": ["expense", "ledger", "transaction"],
    "cost_codes": ["cost code"],
    "waste": ["waste", "wastage"],
    "wages": ["wage", "salary", "payroll"],
    "reallocation": ["reallocation", "realloc"],
    "assets": ["asset"],
    "balance": ["balance", "reconciliation"],
}

SUPPORTED_SOURCE_EXTENSIONS = {".xlsx", ".xlsm", ".otf", ".xsf", ".xdf", ".xml", ".html", ".htm"}
SAP_FORM_EXTENSIONS = SUPPORTED_SOURCE_EXTENSIONS - {".xlsx", ".xlsm"}
RAW_PRIMARY_CELL_LIMIT = 5000
RAW_CELL_CHUNK_SIZE = 25000

_METADATA_DISPLAY_LABELS = {
    "project sap id": "project sap id",
    "sap project id": "project sap id",
    "project code": "project code",
    "project name": "project name",
    "report start": "report start",
    "report finish": "report finish",
    "project start": "project start",
    "project finish": "project finish",
    "project finish eot": "project finish-EOT",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return value or "project"


def col_to_num(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n


def num_to_col(n: int) -> str:
    out = ""
    while n:
        n, r = divmod(n - 1, 26)
        out = chr(65 + r) + out
    return out or "A"


def split_ref(ref: str) -> tuple[int, int]:
    m = re.match(r"([A-Z]+)(\d+)", ref.upper())
    if not m:
        return 0, 0
    return int(m.group(2)), col_to_num(m.group(1))


def clean_text(v: Any) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()


def as_number(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)) and math.isfinite(float(v)):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace(",", "").replace("EGP", "").replace("$", "").replace("%", "")
        if re.fullmatch(r"[-+]?\d+(?:\.\d+)?", s):
            try:
                return float(s)
            except ValueError:
                return None
    return None


def _xml(z: zipfile.ZipFile, name: str) -> ET.Element | None:
    try:
        return ET.fromstring(z.read(name))
    except KeyError:
        return None


def _resolve(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    parts = base.split("/")[:-1]
    for p in target.split("/"):
        if p == "..":
            if parts:
                parts.pop()
        elif p not in ("", "."):
            parts.append(p)
    return "/".join(parts)


@dataclass
class SheetInfo:
    name: str
    state: str
    path: str
    rel_id: str


class XlsxWorkbook:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.fingerprint = sha256_file(self.path)
        self.source_format = self.path.suffix.lower().lstrip(".")
        self.z = zipfile.ZipFile(self.path)
        self.shared_strings = self._shared_strings()
        self.number_formats = self._number_formats()
        self.sheets = self._sheet_infos()

    def close(self) -> None:
        self.z.close()

    def _shared_strings(self) -> list[str]:
        """Stream shared strings to avoid materializing very large XML trees."""
        try:
            fh = self.z.open("xl/sharedStrings.xml")
        except KeyError:
            return []
        out: list[str] = []
        si_tag = f"{{{NS['m']}}}si"
        t_tag = f"{{{NS['m']}}}t"
        with fh:
            for _event, elem in ET.iterparse(fh, events=("end",)):
                if elem.tag == si_tag:
                    out.append("".join(t.text or "" for t in elem.iter(t_tag)))
                    elem.clear()
        return out

    def _sheet_infos(self) -> list[SheetInfo]:
        wb = _xml(self.z, "xl/workbook.xml")
        rels = _xml(self.z, "xl/_rels/workbook.xml.rels")
        if wb is None or rels is None:
            raise ValueError("Invalid XLSX: workbook metadata missing")
        relmap = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall("pr:Relationship", NS)}
        out: list[SheetInfo] = []
        for sh in wb.findall("m:sheets/m:sheet", NS):
            rid = sh.attrib.get(f"{{{NS['r']}}}id", "")
            target = relmap.get(rid, "")
            out.append(SheetInfo(
                name=sh.attrib.get("name", "Sheet"),
                state=sh.attrib.get("state", "visible"),
                path=_resolve("xl/workbook.xml", target),
                rel_id=rid,
            ))
        return out

    def _number_formats(self) -> dict[int, tuple[str, bool]]:
        root = _xml(self.z, "xl/styles.xml")
        if root is None:
            return {}
        builtins = {
            14: "mm-dd-yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy",
            18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm",
            45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0",
        }
        custom = {int(n.attrib["numFmtId"]): n.attrib.get("formatCode", "") for n in root.findall("m:numFmts/m:numFmt", NS)}
        out: dict[int, tuple[str, bool]] = {}
        for idx, xf in enumerate(root.findall("m:cellXfs/m:xf", NS)):
            num_id = int(xf.attrib.get("numFmtId", "0"))
            fmt = custom.get(num_id, builtins.get(num_id, ""))
            stripped = re.sub(r'"[^"]*"|\\.|\[[^\]]*\]', "", fmt).lower()
            is_date = num_id in builtins or bool(re.search(r"(^|[^a-z])[dmyhs]+([^a-z]|$)", stripped))
            out[idx] = (fmt, is_date)
        return out

    def read_sheet(self, info: SheetInfo) -> dict[str, Any]:
        """Stream one worksheet and retain only its logical content.

        ElementTree.fromstring() can require several times the worksheet XML size in RAM.
        Iterative parsing keeps memory bounded while preserving every populated cell, formula,
        merge, dimension and chart relationship needed by the adaptive source explorer.
        """
        try:
            fh = self.z.open(info.path)
        except KeyError:
            return {"name": info.name, "state": info.state, "cells": [], "merges": [], "dimension": None, "charts": []}

        cell_tag = f"{{{NS['m']}}}c"
        dim_tag = f"{{{NS['m']}}}dimension"
        merge_tag = f"{{{NS['m']}}}mergeCell"
        drawing_tag = f"{{{NS['m']}}}drawing"
        f_tag = f"{{{NS['m']}}}f"
        v_tag = f"{{{NS['m']}}}v"
        is_tag = f"{{{NS['m']}}}is"
        t_tag = f"{{{NS['m']}}}t"
        rid_key = f"{{{NS['r']}}}id"

        cells: list[dict[str, Any]] = []
        merges: list[str] = []
        dimension: str | None = None
        drawing_rid: str | None = None
        with fh:
            for _event, elem in ET.iterparse(fh, events=("end",)):
                tag = elem.tag
                if tag == dim_tag:
                    dimension = elem.attrib.get("ref")
                elif tag == merge_tag:
                    merges.append(elem.attrib.get("ref", ""))
                elif tag == drawing_tag:
                    drawing_rid = elem.attrib.get(rid_key)
                elif tag == cell_tag:
                    ref = elem.attrib.get("r", "")
                    typ = elem.attrib.get("t", "n")
                    style_id = int(elem.attrib.get("s", "0"))
                    number_format, is_date_format = self.number_formats.get(style_id, ("", False))
                    formula_el = elem.find(f_tag)
                    formula = formula_el.text if formula_el is not None else None
                    value: Any = None
                    if typ == "inlineStr":
                        inline = elem.find(is_tag)
                        if inline is not None:
                            value = "".join(t.text or "" for t in inline.iter(t_tag))
                    else:
                        v = elem.find(v_tag)
                        raw = v.text if v is not None else None
                        if raw is not None:
                            if typ == "s":
                                try:
                                    value = self.shared_strings[int(raw)]
                                except Exception:
                                    value = raw
                            elif typ == "b":
                                value = raw == "1"
                            elif typ in ("str", "e"):
                                value = raw
                            else:
                                try:
                                    fv = float(raw)
                                    value = int(fv) if fv.is_integer() else fv
                                except Exception:
                                    value = raw
                    if value is not None or formula is not None:
                        row, col = split_ref(ref)
                        cells.append({"ref": ref, "row": row, "col": col, "value": value, "formula": formula,
                                      "style_id": style_id, "number_format": number_format, "is_date_format": is_date_format})
                    elem.clear()
        charts = self._charts_for_sheet(info, drawing_rid)
        return {
            "name": info.name,
            "state": info.state,
            "dimension": dimension,
            "merges": merges,
            "cell_count": len(cells),
            "cells": cells,
            "charts": charts,
        }

    def _charts_for_sheet(self, info: SheetInfo, rid: str | None) -> list[dict[str, Any]]:
        if not rid:
            return []
        relpath = str(Path(info.path).parent / "_rels" / (Path(info.path).name + ".rels")).replace("\\", "/")
        relroot = _xml(self.z, relpath)
        if relroot is None:
            return []
        target = None
        for rel in relroot.findall("pr:Relationship", NS):
            if rel.attrib.get("Id") == rid:
                target = _resolve(info.path, rel.attrib.get("Target", ""))
                break
        if not target:
            return []
        drawroot = _xml(self.z, target)
        if drawroot is None:
            return []
        draw_relpath = str(Path(target).parent / "_rels" / (Path(target).name + ".rels")).replace("\\", "/")
        drawrels = _xml(self.z, draw_relpath)
        if drawrels is None:
            return []
        rmap = {r.attrib.get("Id"): _resolve(target, r.attrib.get("Target", "")) for r in drawrels.findall("pr:Relationship", NS)}
        out: list[dict[str, Any]] = []
        for gf in drawroot.findall(".//xdr:graphicFrame", NS):
            chart_el = gf.find(".//c:chart", NS)
            if chart_el is None:
                continue
            crid = chart_el.attrib.get(f"{{{NS['r']}}}id")
            cpath = rmap.get(crid)
            if not cpath:
                continue
            parsed = self._parse_chart(cpath)
            if parsed:
                parsed["source_sheet"] = info.name
                parsed["chart_path"] = cpath
                out.append(parsed)
        return out

    def _parse_chart(self, path: str) -> dict[str, Any] | None:
        root = _xml(self.z, path)
        if root is None:
            return None
        title = " ".join((t.text or "") for t in root.findall(".//c:title//a:t", NS)).strip()
        chart_type = "unknown"
        for tag in ["barChart", "lineChart", "pieChart", "scatterChart", "areaChart", "doughnutChart"]:
            if root.find(f".//c:{tag}", NS) is not None:
                chart_type = tag.replace("Chart", "")
                break
        series: list[dict[str, Any]] = []
        for ser in root.findall(".//c:ser", NS):
            stitle = " ".join((t.text or "") for t in ser.findall(".//c:tx//c:v", NS)).strip()
            if not stitle:
                stitle = " ".join((t.text or "") for t in ser.findall(".//c:tx//a:t", NS)).strip()
            refs = [f.text or "" for f in ser.findall(".//c:f", NS)]
            cached: list[Any] = []
            for pt in ser.findall(".//c:numCache/c:pt", NS) + ser.findall(".//c:strCache/c:pt", NS):
                v = pt.find("c:v", NS)
                if v is not None:
                    n = as_number(v.text)
                    cached.append(n if n is not None else v.text)
            series.append({"title": stitle, "references": refs, "cached_values": cached})
        return {"title": title or "Untitled Excel chart", "type": chart_type, "series": series}


def _decode_source_bytes(payload: bytes) -> str:
    if payload.startswith((b"\xff\xfe", b"\xfe\xff")):
        return payload.decode("utf-16")
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("latin-1", errors="replace")


def _field_label(value: Any) -> str:
    text = clean_text(value)
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    text = re.sub(r"[._/\\:-]+", " ", text)
    return clean_text(text).casefold()


def _metadata_label(value: Any) -> str | None:
    label = _field_label(value)
    if label in _METADATA_DISPLAY_LABELS:
        return _METADATA_DISPLAY_LABELS[label]
    for known, display in _METADATA_DISPLAY_LABELS.items():
        if label.endswith(" " + known):
            return display
    return None


def _cell(ref: str, row: int, col: int, value: Any) -> dict[str, Any]:
    return {
        "ref": ref, "row": row, "col": col, "value": value, "formula": None,
        "style_id": 0, "number_format": "", "is_date_format": False,
    }


def _sheet_from_rows(name: str, rows: list[list[Any]], state: str = "visible") -> dict[str, Any]:
    cells: list[dict[str, Any]] = []
    width = 0
    for row_number, values in enumerate(rows, 1):
        width = max(width, len(values))
        for col_number, value in enumerate(values, 1):
            if value not in (None, ""):
                cells.append(_cell(f"{num_to_col(col_number)}{row_number}", row_number, col_number, value))
    dimension = f"A1:{num_to_col(width)}{len(rows)}" if rows and width else None
    return {
        "name": name, "state": state, "dimension": dimension, "merges": [],
        "cell_count": len(cells), "cells": cells, "charts": [],
    }


def _metadata_rows(pairs: Iterable[tuple[Any, Any]]) -> list[list[Any]]:
    found: dict[str, Any] = {}
    for label, value in pairs:
        display = _metadata_label(label)
        if display and clean_text(value) and display not in found:
            found[display] = value
    order = [
        "project sap id", "project code", "project name", "report start", "report finish",
        "project start", "project finish", "project finish-EOT",
    ]
    return [[label, found[label]] for label in order if label in found]


class _SapHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self.fields: list[tuple[str, str]] = []
        self._row: list[str] | None = None
        self._cell_parts: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {k.casefold(): v or "" for k, v in attrs}
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell_parts = []
        elif tag in {"input", "meta"}:
            name = values.get("name") or values.get("id") or values.get("property")
            value = values.get("value") or values.get("content")
            if name and value:
                self.fields.append((name, value))
        if values.get("data-field") and values.get("data-value"):
            self.fields.append((values["data-field"], values["data-value"]))

    def handle_data(self, data: str) -> None:
        if self._cell_parts is not None:
            self._cell_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._cell_parts is not None and self._row is not None:
            self._row.append(clean_text(" ".join(self._cell_parts)))
            self._cell_parts = None
        elif tag == "tr" and self._row is not None:
            if any(self._row):
                self.rows.append(self._row)
                if len(self._row) >= 2:
                    self.fields.append((self._row[0], self._row[1]))
            self._row = None


def _xml_rows(text: str) -> tuple[list[list[Any]], list[tuple[str, Any]], str]:
    root = ET.fromstring(text.lstrip("\ufeff\x00 \t\r\n"))
    rows: list[list[Any]] = []
    pairs: list[tuple[str, Any]] = []
    for element in root.iter():
        children = list(element)
        tag = element.tag.rsplit("}", 1)[-1]
        value = clean_text(" ".join(element.itertext()))
        name = element.attrib.get("name") or element.attrib.get("NAME") or tag
        if not children and value:
            pairs.append((name, value))
            rows.append([name, value])
        elif children and all(not list(child) for child in children):
            record = []
            for child in children:
                child_tag = child.tag.rsplit("}", 1)[-1]
                child_value = clean_text(" ".join(child.itertext()))
                if child_value:
                    record.extend([child_tag, child_value])
            if record:
                rows.append(record)
    return rows, pairs, root.tag.rsplit("}", 1)[-1].upper()


def _xdf_workbook_sheets(path: Path) -> tuple[list[dict[str, Any]], list[tuple[str, Any]], str]:
    """Stream an XDF workbook envelope without flattening or duplicating its cells."""
    parsed_sheets: list[dict[str, Any]] = []
    metadata_pairs: list[tuple[str, Any]] = []
    current_name: str | None = None
    current_state = "visible"
    current_cells: list[dict[str, Any]] = []
    in_metadata = False
    root_name = ""
    for event, element in ET.iterparse(path, events=("start", "end")):
        tag = element.tag.rsplit("}", 1)[-1]
        upper = tag.upper()
        if event == "start":
            if not root_name:
                root_name = upper
            if upper == "METADATA":
                in_metadata = True
            elif upper == "SHEET":
                current_name = element.attrib.get("name") or element.attrib.get("NAME") or f"Sheet {len(parsed_sheets) + 1}"
                current_state = element.attrib.get("state") or element.attrib.get("STATE") or "visible"
                current_cells = []
            continue

        value = clean_text(" ".join(element.itertext()))
        if in_metadata and upper != "METADATA" and value and not list(element):
            metadata_pairs.append((tag, value))
        if current_name is not None:
            ref = element.attrib.get("ref") or element.attrib.get("REF")
            if ref and value:
                row, col = split_ref(ref)
                if row and col:
                    number = as_number(value)
                    current_cells.append(_cell(ref.upper(), row, col, number if number is not None else value))
        if upper == "SHEET" and current_name is not None:
            max_row = max((cell["row"] for cell in current_cells), default=0)
            max_col = max((cell["col"] for cell in current_cells), default=0)
            parsed_sheets.append({
                "name": current_name,
                "state": current_state,
                "dimension": f"A1:{num_to_col(max_col)}{max_row}" if max_row and max_col else None,
                "merges": [],
                "cell_count": len(current_cells),
                "cells": current_cells,
                "charts": [],
            })
            current_name = None
            current_cells = []
        if upper == "METADATA":
            in_metadata = False
        element.clear()
    return parsed_sheets, metadata_pairs, root_name


def _text_rows(text: str) -> tuple[list[list[Any]], list[tuple[str, Any]]]:
    rows: list[list[Any]] = []
    pairs: list[tuple[str, Any]] = []
    for raw_line in text.replace("\x00", "").splitlines():
        line = clean_text("".join(ch if ch.isprintable() or ch == "\t" else " " for ch in raw_line))
        if not line:
            continue
        match = re.match(r"^(.{2,80}?)(?:\s*[:=|\t]\s*|\s{2,})(.+)$", line)
        if match:
            label, value = clean_text(match.group(1)), clean_text(match.group(2))
            pairs.append((label, value))
            rows.append([label, value])
        else:
            rows.append([line])
    return rows, pairs


class SapFormDocument:
    """Read SAP Smart Forms exports as auditable, sheet-shaped source data."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.fingerprint = sha256_file(self.path)
        self.source_format = self.path.suffix.lower().lstrip(".")
        suffix = self.path.suffix.lower()
        pairs: list[tuple[str, Any]] = []
        rows: list[list[Any]] = []
        parsed_content_sheets: list[dict[str, Any]] = []
        if suffix in {".xsf", ".xdf", ".xml"}:
            with self.path.open("rb") as source_file:
                prefix = _decode_source_bytes(source_file.read(65536))
            if re.search(r"<WORKBOOK\b", prefix, re.I) and re.search(r"<SHEET\b", prefix, re.I):
                parsed_content_sheets, pairs, root_name = _xdf_workbook_sheets(self.path)
            else:
                text = _decode_source_bytes(self.path.read_bytes())
                rows, pairs, root_name = _xml_rows(text)
            if suffix == ".xml" and root_name not in {"XSF", "XDF"}:
                raise ValueError("Unsupported XML input: expected an SAP XSF or XDF document")
            if suffix == ".xsf" and root_name != "XSF":
                raise ValueError("Invalid XSF input: root element must be XSF")
            if suffix == ".xdf" and root_name != "XDF":
                raise ValueError("Invalid XDF input: root element must be XDF")
        elif suffix in {".html", ".htm"}:
            text = _decode_source_bytes(self.path.read_bytes())
            parser = _SapHtmlParser()
            parser.feed(text)
            rows, pairs = parser.rows, parser.fields
            if not rows:
                rows, text_pairs = _text_rows(re.sub(r"<[^>]+>", " ", text))
                pairs.extend(text_pairs)
        else:
            text = _decode_source_bytes(self.path.read_bytes())
            rows, pairs = _text_rows(text)
        metadata = _metadata_rows(pairs)
        self._parsed_sheets = []
        if metadata:
            self._parsed_sheets.append(_sheet_from_rows("metadata", metadata))
        if parsed_content_sheets:
            self._parsed_sheets.extend(parsed_content_sheets)
        else:
            self._parsed_sheets.append(_sheet_from_rows(f"SAP {self.source_format.upper()} Content", rows))
        self.sheets = list(range(len(self._parsed_sheets)))

    def read_sheet(self, info: int) -> dict[str, Any]:
        return self._parsed_sheets[info]

    def close(self) -> None:
        return None


def open_source_document(path: Path) -> XlsxWorkbook | SapFormDocument:
    suffix = Path(path).suffix.lower()
    if suffix not in SUPPORTED_SOURCE_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_SOURCE_EXTENSIONS))
        raise ValueError(f"Unsupported input format {suffix or '(none)'}; supported: {supported}")
    return XlsxWorkbook(path) if suffix in {".xlsx", ".xlsm"} else SapFormDocument(path)


def _matrix(sheet: dict[str, Any]) -> dict[tuple[int, int], Any]:
    return {(c["row"], c["col"]): c["value"] for c in sheet["cells"] if c.get("value") is not None}



def detect_metrics(sheets: list[dict[str, Any]]) -> dict[str, Any]:
    candidates: dict[str, list[dict[str, Any]]] = {k: [] for k in METRIC_RULES}
    for sh in sheets:
        grid = _matrix(sh)
        for c in sh["cells"]:
            if not isinstance(c.get("value"), str):
                continue
            label = clean_text(c["value"])
            low = label.lower()
            for metric, patterns in METRIC_RULES.items():
                if not any(re.search(p, low, re.I) for p in patterns):
                    continue
                found = None
                distance = 99
                for d in range(1, 7):
                    v = grid.get((c["row"], c["col"] + d))
                    n = as_number(v)
                    if n is not None:
                        found, distance = n, d
                        break
                if found is None:
                    for d in range(1, 4):
                        v = grid.get((c["row"] + d, c["col"]))
                        n = as_number(v)
                        if n is not None:
                            found, distance = n, 6 + d
                            break
                if found is not None:
                    score = 100 - distance
                    if "total" in low:
                        score += 20
                    if "actual" in low:
                        score += 25
                    if sh["name"].lower().strip(" .") in {"dashboard", "gross profit", "project summary", "1. project summary"}:
                        score += 15
                    candidates[metric].append({
                        "value": found,
                        "source_sheet": sh["name"],
                        "source_cell": c["ref"],
                        "source_label": label,
                        "score": score,
                    })
    out: dict[str, Any] = {}
    for metric, vals in candidates.items():
        vals.sort(key=lambda x: x["score"], reverse=True)
        out[metric] = {"preferred": vals[0] if vals else None, "candidates": vals[:30]}
    # derive when the source does not explicitly contain values
    ev = out.get("earned_value", {}).get("preferred")
    ac = out.get("actual_cost", {}).get("preferred")
    if ev and ac and ac["value"]:
        out["derived_cpi"] = ev["value"] / ac["value"]
        out["derived_cv"] = ev["value"] - ac["value"]
    return out


def detect_capabilities(sheets: list[dict[str, Any]]) -> dict[str, bool]:
    corpus = []
    for sh in sheets:
        corpus.append(sh["name"].lower())
        for c in sh["cells"][:2000]:
            if isinstance(c.get("value"), str):
                corpus.append(c["value"].lower())
    blob = "\n".join(corpus)
    return {cap: any(k in blob for k in keys) for cap, keys in CAPABILITY_KEYWORDS.items()}


def detect_tables(sheet: dict[str, Any]) -> list[dict[str, Any]]:
    """Detect contiguous table-like blocks without project-specific names or fixed ranges.

    Populated rows are grouped once, so very long ledgers remain linear-time to discover.
    """
    by_row: dict[int, list[dict[str, Any]]] = {}
    for c in sheet["cells"]:
        by_row.setdefault(c["row"], []).append(c)
    qualified = sorted(r for r, cells in by_row.items() if len(cells) >= 2)
    if not qualified:
        return []
    blocks: list[tuple[int, int]] = []
    start = prev = qualified[0]
    for r in qualified[1:]:
        if r - prev > 2:
            blocks.append((start, prev))
            start = r
        prev = r
    blocks.append((start, prev))

    tables: list[dict[str, Any]] = []
    for block_start, block_end in blocks:
        block_rows = [r for r in qualified if block_start <= r <= block_end]
        if len(block_rows) < 3:
            continue
        header_row = None
        header_cells: list[dict[str, Any]] = []
        for r in block_rows:
            cells = sorted(by_row[r], key=lambda x: x["col"])
            text_cells = [c for c in cells if isinstance(c.get("value"), str) and len(clean_text(c["value"])) >= 2]
            if len(text_cells) >= 2 and sum(1 for rr in block_rows if rr > r) >= 2:
                header_row = r
                header_cells = cells
                break
        if header_row is None:
            continue
        data_rows = [r for r in block_rows if r >= header_row]
        cols = sorted({c["col"] for rr in data_rows for c in by_row.get(rr, [])})
        if len(cols) < 2:
            continue
        headers = [clean_text(next((c["value"] for c in header_cells if c["col"] == col), "")) for col in cols]
        tables.append({
            "id": f"{slugify(sheet['name'])}-r{header_row}",
            "header_row": header_row,
            "end_row": block_end,
            "columns": cols,
            "headers": headers,
            "row_count": max(0, len([r for r in data_rows if r > header_row])),
        })
        if len(tables) >= 24:
            break
    return tables

def sheet_preview(sheet: dict[str, Any], max_rows: int = 30, max_cols: int = 16) -> list[list[Any]]:
    grid = _matrix(sheet)
    if not grid:
        return []
    rows = sorted({r for r, c in grid})[:max_rows]
    cols = sorted({c for r, c in grid})[:max_cols]
    return [[grid.get((r, c)) for c in cols] for r in rows]




def semantic_workbook_fingerprint(parsed_sheets: list[dict[str, Any]]) -> str:
    """Hash workbook values/formulas while intentionally excluding metadata and formatting.

    Adding or hiding the authoritative metadata sheet must not invalidate an otherwise
    byte-for-byte equivalent approved cost workbook. Styles are also excluded because
    Excel may renumber style records when a sheet is inserted without changing data.
    """
    semantic = []
    for sheet in parsed_sheets:
        if clean_text(sheet.get("name", "")).casefold() == "metadata":
            continue
        semantic.append({
            "name": sheet.get("name"),
            "cells": [
                {"ref": cell.get("ref"), "value": cell.get("value"), "formula": cell.get("formula")}
                for cell in sheet.get("cells", [])
            ],
        })
    payload = json.dumps(semantic, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_parity_reference(
    repo_root: Path,
    source: Path,
    fingerprint: str,
    parsed_sheets: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Load an approved normalized reference by exact file or semantic workbook SHA-256.

    This is data-driven acceptance enrichment, not project-specific runtime branching.
    New workbooks without a matching approved fixture continue through the generic adaptive path.
    """
    index_path = repo_root / "docs" / "parity" / "data" / "index.json"
    if not index_path.exists():
        return None
    try:
        entries = json.loads(index_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    content_fingerprint = semantic_workbook_fingerprint(parsed_sheets) if parsed_sheets is not None else None
    for entry in entries if isinstance(entries, list) else []:
        exact_match = entry.get("source_sha256") == fingerprint
        semantic_match = bool(content_fingerprint and entry.get("content_sha256") == content_fingerprint)
        if not exact_match and not semantic_match:
            continue
        rel = entry.get("data_file")
        if not rel:
            continue
        path = repo_root / rel
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        return {
            "entry": entry,
            "data": data,
            "match_mode": "exact_file_sha256" if exact_match else "semantic_workbook_sha256",
            "content_sha256": content_fingerprint,
        }
    return None


def _preferred_metric_value(metrics: dict[str, Any], key: str) -> float | None:
    block = metrics.get(key)
    if not isinstance(block, dict):
        return None
    preferred = block.get("preferred")
    if not isinstance(preferred, dict):
        return None
    value = preferred.get("value")
    return float(value) if isinstance(value, (int, float)) else None


def _norm_header(value: Any) -> str:
    text = clean_text(value).casefold()
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[#%()\[\]{}:_/\\.-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _header_match_score(value: Any, aliases: Iterable[str]) -> float:
    text = _norm_header(value)
    if not text:
        return 0.0
    tokens = set(text.split())
    best = 0.0
    for alias in aliases:
        a = _norm_header(alias)
        if not a:
            continue
        if text == a:
            best = max(best, 10.0)
            continue
        at = set(a.split())
        if len(a) <= 3:
            if a in tokens:
                best = max(best, 8.5)
            continue
        if a in text or text in a:
            best = max(best, 7.5 + min(len(a), len(text)) / max(len(a), len(text)))
        if at and tokens:
            overlap = len(at & tokens) / len(at | tokens)
            best = max(best, overlap * 7.0)
    return best


def _grid(sheet: dict[str, Any]) -> dict[tuple[int, int], Any]:
    return {(int(c.get("row", 0)), int(c.get("col", 0))): c.get("value") for c in sheet.get("cells", [])}


def _max_row_col(sheet: dict[str, Any]) -> tuple[int, int]:
    rows = [int(c.get("row", 0)) for c in sheet.get("cells", [])]
    cols = [int(c.get("col", 0)) for c in sheet.get("cells", [])]
    return (max(rows, default=0), max(cols, default=0))


def _schema_header(sheet: dict[str, Any], schema: dict[str, list[str]], max_scan_rows: int = 50) -> tuple[int, dict[str, int], float]:
    """Infer a header row and canonical column mapping from semantic aliases."""
    by_row: dict[int, list[dict[str, Any]]] = {}
    for cell in sheet.get("cells", []):
        row = int(cell.get("row", 0))
        if 0 < row <= max_scan_rows:
            by_row.setdefault(row, []).append(cell)
    best_row, best_map, best_score = 0, {}, 0.0
    for row, cells in by_row.items():
        candidates: list[tuple[float, str, int]] = []
        for cell in cells:
            value = cell.get("value")
            if not isinstance(value, str):
                continue
            for field, aliases in schema.items():
                score = _header_match_score(value, aliases)
                if score >= 5.0:
                    candidates.append((score, field, int(cell.get("col", 0))))
        mapping: dict[str, tuple[int, float]] = {}
        used_columns: set[int] = set()
        for score, field, column in sorted(candidates, reverse=True):
            if field in mapping or column in used_columns:
                continue
            mapping[field] = (column, score)
            used_columns.add(column)
        if mapping:
            total = sum(v[1] for v in mapping.values()) + len(mapping) * 2.0
            if total > best_score:
                best_row = row
                best_map = {k: v[0] for k, v in mapping.items()}
                best_score = total
    return best_row, best_map, best_score


def _find_schema_sheet(
    sheets: list[dict[str, Any]],
    schema: dict[str, list[str]],
    required: Iterable[str],
    name_hints: Iterable[str] = (),
    max_scan_rows: int = 50,
) -> tuple[dict[str, Any] | None, int, dict[str, int], float]:
    required_set = set(required)
    best: tuple[dict[str, Any] | None, int, dict[str, int], float] = (None, 0, {}, 0.0)
    for sheet in sheets:
        row, mapping, score = _schema_header(sheet, schema, max_scan_rows=max_scan_rows)
        if not required_set.issubset(mapping):
            continue
        n = _norm_header(sheet.get("name", ""))
        hint_bonus = sum(8.0 for hint in name_hints if _norm_header(hint) in n)
        adjusted = score + hint_bonus
        if adjusted > best[3]:
            best = (sheet, row, mapping, adjusted)
    return best


def _codeish(value: Any) -> bool:
    text = clean_text(value)
    if not text or text.startswith("#") or len(text) > 80:
        return False
    if re.fullmatch(r"[A-Za-z]+(?:[.\-/][A-Za-z0-9]+)+", text):
        return True
    if re.fullmatch(r"[A-Za-z]+[.\-/]?[0-9][A-Za-z0-9.\-/]*", text):
        return True
    return bool(re.fullmatch(r"[A-Za-z]?\d+(?:[.\-/]\d+){1,}", text))


def _n(value: Any) -> float | None:
    return as_number(value)


def _source_evidence(sheet: dict[str, Any], row: int, header_row: int, confidence: float) -> dict[str, Any]:
    return {
        "source_sheet": sheet.get("name"),
        "source_row": row,
        "source_header_row": header_row,
        "mapping_confidence": round(confidence, 3),
    }


def _source_cell_state(value: Any) -> str:
    if value in (None, ""):
        return "missing"
    if isinstance(value, str) and value.strip().upper() in {"#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A"}:
        return "formula_error"
    return "value"


DIRECT_SCHEMA = {
    "budget_pct": ["budget percentage", "budget %"],
    "main_area": ["main area", "project area"],
    "division_code": ["division code"],
    "division": ["division name", "division"],
    "item": ["extra discrpation", "extra description", "item name", "work item"],
    "main_code": ["main code (w.b.s)", "main code wbs", "main code", "wbs code"],
    "sub_code": ["sub code"],
    "boq_item": ["boq item", "boq no"],
    "description": ["item description", "description"],
    "unit": ["unit"],
    "budget_rate": ["budget rate", "budget rate l e"],
    "contract_rate": ["original contract rate", "contract rate"],
    "modified_contract_rate": ["modified contract rate", "modifed contract rate"],
    "contract_qty": ["contract quantity", "contract qty"],
    "final_qs_qty": ["final qs qty", "final qs quantity"],
    "invoice_pct": ["clinte invoice %", "client invoice %", "invoice %"],
    "invoice_qty": ["client invoice quantity", "invoice quantity"],
    "work_qty": ["work performed qty", "work performed quantity"],
    "contract_amount": ["contract amount"],
    "modified_contract_amount": ["modified contract amount", "modifed contract amount"],
    "original_budget": ["original budget"],
    "bac": ["bac"],
    "work_invoice_amount": ["work performed invoice amount", "internal invoice"],
    "invoice_amount": ["invoice amount"],
    "unbilled": ["unbilled amount", "unbilled"],
    "ev": ["bcwp ev", "earned value", "ev"],
    "ac": ["acwp actual cost", "actual cost", "ac"],
    "cv": ["cost variance", "cv"],
    "remaining_qty": ["remaining quantity", "remaining qty"],
    "etc": ["etc"],
    "eac": ["eac"],
    "vac": ["vac"],
}


INDIRECT_SCHEMA = {
    "main_code": ["main code", "wbs code"],
    "serial": ["sr", "serial"],
    "description": ["item description", "description"],
    "unit": ["unit"],
    "forecast_monthly": ["forcast budget amount monthly", "forecast budget amount monthly"],
    "contract_duration": ["contract total duration", "contract duration"],
    "remaining_months": ["remaining month to complete project", "remaining months"],
    "original_budget": ["original budget"],
    "progress": ["project progress", "% project progress", "progress"],
    "ev": ["earned value", "ev"],
    "ac": ["actual cost", "ac"],
    "cv": ["cost variance", "cv"],
    "bac": ["bac"],
    "etc": ["etc"],
    "eac": ["eac"],
    "vac": ["vac"],
}


LEDGER_SCHEMA = {
    "di": ["d i", "direct indirect"],
    "main_code": ["main code", "wbs code"],
    "resource_code": ["sub code", "resource code"],
    "entry_sheet": ["entry sheet"],
    "po": ["po material service", "po & material service", "po"],
    "source": ["source"],
    "posting_date": ["posting date"],
    "description": ["description"],
    "unit": ["unit"],
    "currency": ["currency"],
    "total_qty": ["total qy", "total qty", "total quantity"],
    "avg_unit_price": ["avg u p", "average unit price"],
    "currency_factor": ["currency factor"],
    "total_cost": ["total cost"],
    "item": ["item"],
}


BOQ_RESOURCE_SCHEMA = {
    "resource": ["sub package", "resource", "resource name"],
    "resource_code": ["resource code", "resource code."],
    "actual_cost": ["actual cost"],
    "work_qty": ["work performed qty", "work performed quantity"],
    "actual_rate": ["actual rate", "actual rate l e"],
    "eac": ["eac"],
}


def _extract_direct_details(sheets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    sheet, header_row, mapping, score = _find_schema_sheet(
        sheets, DIRECT_SCHEMA,
        required=("main_code", "description", "original_budget", "ev", "ac"),
        name_hints=("direct details",), max_scan_rows=20,
    )
    if not sheet or len(mapping) < 8 or score < 70.0:
        return [], {"role": "direct_details", "confidence": 0.0}
    grid = _grid(sheet)
    max_row, _ = _max_row_col(sheet)
    out: list[dict[str, Any]] = []
    confidence = min(1.0, len(mapping) / max(1, len(DIRECT_SCHEMA)))
    numeric_fields = {
        "budget_rate", "contract_rate", "modified_contract_rate", "contract_qty", "final_qs_qty",
        "invoice_pct", "invoice_qty", "work_qty", "contract_amount", "modified_contract_amount",
        "original_budget", "bac", "work_invoice_amount", "invoice_amount", "unbilled", "ev", "ac",
        "cv", "remaining_qty", "etc", "eac", "vac",
    }
    for row in range(header_row + 1, max_row + 1):
        code = grid.get((row, mapping["main_code"]))
        description = grid.get((row, mapping["description"]))
        if not _codeish(code) or clean_text(description).startswith("#"):
            continue
        rec: dict[str, Any] = {"row": row, **_source_evidence(sheet, row, header_row, confidence)}
        source_to_dest = {
            "division": "division", "main_code": "main_code", "boq_item": "boq_item", "description": "description",
            "unit": "unit", "budget_rate": "budget_rate", "contract_rate": "contract_rate",
            "modified_contract_rate": "modified_contract_rate", "contract_qty": "contract_qty",
            "final_qs_qty": "final_qs_qty", "invoice_pct": "invoice_pct", "invoice_qty": "invoice_qty",
            "work_qty": "work_qty", "contract_amount": "contract_amount", "modified_contract_amount": "modified_contract_amount",
            "original_budget": "original_budget", "bac": "bac", "work_invoice_amount": "work_invoice_amount",
            "invoice_amount": "invoice_amount", "unbilled": "unbilled", "ev": "ev", "ac": "ac", "cv": "cv",
            "remaining_qty": "remaining_qty", "etc": "etc", "eac": "eac", "vac": "vac",
        }
        for src, dest in source_to_dest.items():
            if src not in mapping:
                rec[dest] = None
                continue
            value = grid.get((row, mapping[src]))
            rec[dest] = _n(value) if src in numeric_fields else (None if value in (None, "") else value)
        if "item" in mapping:
            rec["item"] = grid.get((row, mapping["item"]))
        out.append(rec)
    return out, {"role": "direct_details", "sheet": sheet.get("name"), "header_row": header_row, "mapped_fields": len(mapping), "confidence": round(confidence, 3), "score": round(score, 2)}


def _project_items_from_direct(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for row in rows:
        ev, ac = row.get("ev"), row.get("ac")
        cv = row.get("cv") if row.get("cv") is not None else ((ev - ac) if ev is not None and ac is not None else None)
        cpi = (ev / ac) if isinstance(ev, (int, float)) and isinstance(ac, (int, float)) and ac else (1.0 if ev == 0 and ac == 0 else None)
        final_qty, work_qty = row.get("final_qs_qty"), row.get("work_qty")
        completion = (work_qty / final_qty) if isinstance(work_qty, (int, float)) and isinstance(final_qty, (int, float)) and final_qty else row.get("invoice_pct")
        bac, eac = row.get("bac"), row.get("eac")
        vac = row.get("vac") if row.get("vac") is not None else ((bac - eac) if isinstance(bac, (int, float)) and isinstance(eac, (int, float)) else None)
        out.append({
            "item": row.get("item") or row.get("description"),
            "division": row.get("division"),
            "original_budget": row.get("original_budget"),
            "ev": ev, "ac": ac, "cv": cv,
            "status_to_date": "Over budget" if isinstance(cv, (int, float)) and cv < 0 else ("Under budget" if isinstance(cv, (int, float)) else "Unavailable"),
            "cpi_to_date": cpi, "completion": completion,
            "bac": bac, "eac": eac, "etc": row.get("etc"), "vac": vac,
            "forecast_status": "Over budget" if isinstance(vac, (int, float)) and vac < 0 else ("Under budget" if isinstance(vac, (int, float)) else "Unavailable"),
            "forecast_completion": completion,
            "cpi_forecast": (bac / eac) if isinstance(bac, (int, float)) and isinstance(eac, (int, float)) and eac else None,
            "main_code": row.get("main_code"),
            "source_sheet": row.get("source_sheet"), "source_row": row.get("source_row"),
            "source_header_row": row.get("source_header_row"), "mapping_confidence": row.get("mapping_confidence"),
        })
    return out


def _extract_indirect_details(sheets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    sheet, header_row, mapping, score = _find_schema_sheet(
        sheets, INDIRECT_SCHEMA,
        required=("main_code", "description", "original_budget", "ev", "ac"),
        name_hints=("indirect details",), max_scan_rows=30,
    )
    if not sheet or len(mapping) < 7 or score < 70.0:
        return [], {"role": "indirect_details", "confidence": 0.0}
    grid = _grid(sheet); max_row, _ = _max_row_col(sheet); out = []
    confidence = min(1.0, len(mapping) / max(1, len(INDIRECT_SCHEMA)))
    numeric = {"contract_duration", "remaining_months", "original_budget", "progress", "ev", "ac", "cv", "bac", "etc", "eac", "vac"}
    for row in range(header_row + 1, max_row + 1):
        code = grid.get((row, mapping["main_code"]))
        desc = grid.get((row, mapping["description"]))
        if not _codeish(code) or not clean_text(desc) or clean_text(desc).startswith("#"):
            continue
        rec = {"row": row, "main_code": code, "description": desc, **_source_evidence(sheet, row, header_row, confidence)}
        for field in ["contract_duration", "remaining_months", "original_budget", "progress", "ev", "ac", "cv", "bac", "etc", "eac", "vac"]:
            rec[field] = _n(grid.get((row, mapping[field]))) if field in mapping else None
        out.append(rec)
    return out, {"role": "indirect_details", "sheet": sheet.get("name"), "header_row": header_row, "mapped_fields": len(mapping), "confidence": round(confidence, 3), "score": round(score, 2)}


def _excel_month(value: Any) -> str | None:
    if isinstance(value, (int, float)) and 25000 <= float(value) <= 80000:
        try:
            dt = datetime(1899, 12, 30) + timedelta(days=float(value))
            return dt.strftime("%Y-%m")
        except Exception:
            return None
    text = clean_text(value)
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y", "%b-%y", "%b %Y", "%Y-%m"):
        try:
            return datetime.strptime(text[:10] if "%d" in fmt and len(text) >= 10 else text, fmt).strftime("%Y-%m")
        except Exception:
            pass
    m = re.search(r"\b(20\d{2})[-/.](0?[1-9]|1[0-2])\b", text)
    return f"{m.group(1)}-{int(m.group(2)):02d}" if m else None


def _extract_cashflow(sheets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    candidate = None; in_row = out_row = label_col = 0
    for sheet in sheets:
        local_in = local_out = local_col = 0
        for cell in sheet.get("cells", []):
            text = _norm_header(cell.get("value"))
            if "cashin" in text or "cash in" in text:
                local_in, local_col = int(cell.get("row", 0)), int(cell.get("col", 0))
            if "cashout" in text or "cash out" in text:
                local_out = int(cell.get("row", 0))
        if local_in and local_out:
            candidate, in_row, out_row, label_col = sheet, local_in, local_out, local_col
            break
    if not candidate:
        return [], {"role": "cashflow", "confidence": 0.0}
    grid = _grid(candidate); _, max_col = _max_row_col(candidate)
    header_row = 0
    for row in range(max(1, in_row - 6), in_row):
        date_count = sum(1 for col in range(label_col + 1, max_col + 1) if _excel_month(grid.get((row, col))))
        if date_count >= 2:
            header_row = row
    out = []; cin_cum = cout_cum = 0.0
    if header_row:
        seen = set()
        for col in range(label_col + 1, max_col + 1):
            month = _excel_month(grid.get((header_row, col)))
            if not month or month in seen:
                continue
            seen.add(month)
            raw_ci, raw_co = grid.get((in_row, col)), grid.get((out_row, col))
            ci, co = _n(raw_ci), _n(raw_co)
            cin_cum += ci or 0.0; cout_cum += co or 0.0
            out.append({
                "month": month, "cash_in": ci, "cash_out": co,
                "cash_in_cum": cin_cum, "cash_out_cum": cout_cum,
                "cash_in_source_state": _source_cell_state(raw_ci),
                "cash_out_source_state": _source_cell_state(raw_co),
                "cash_in_source_row": in_row, "cash_out_source_row": out_row,
                **_source_evidence(candidate, in_row, header_row, 0.95),
            })
    return out, {"role": "cashflow", "sheet": candidate.get("name"), "header_row": header_row, "confidence": 0.95 if out else 0.4}


def _extract_cost_codes(sheets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    best_sheet = None; best_headers: list[tuple[int, int]] = []
    for sheet in sheets:
        grid = _grid(sheet); max_row, max_col = _max_row_col(sheet); headers = []
        for row in range(1, min(max_row, 30) + 1):
            for col in range(1, max_col - 1):
                h1, h2, h3 = (_norm_header(grid.get((row, col + i))) for i in range(3))
                code_ok = h1 in {"code", "الكود"} or "code" in h1
                desc_ok = h2 in {"description", "البيان"} or "description" in h2
                type_ok = "type" in h3 or "نوع الحساب" in h3
                if code_ok and desc_ok and type_ok:
                    headers.append((row, col))
        if len(headers) > len(best_headers):
            best_sheet, best_headers = sheet, headers
    if not best_sheet or not best_headers:
        return [], {"role": "cost_codes", "confidence": 0.0}
    grid = _grid(best_sheet); max_row, _ = _max_row_col(best_sheet); out = []; seen = set()
    for header_row, col in best_headers:
        for row in range(header_row + 1, max_row + 1):
            code = grid.get((row, col))
            if not _codeish(code) and col > 1:
                code = grid.get((row, col - 1))
            if not _codeish(code):
                continue
            desc = grid.get((row, col + 1)); acct = grid.get((row, col + 2))
            key = clean_text(code)
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "code": code, "description": desc, "account_type": acct, "type": acct,
                **_source_evidence(best_sheet, row, header_row, 0.95),
            })
    return out, {"role": "cost_codes", "sheet": best_sheet.get("name"), "parallel_tables": len(best_headers), "confidence": 0.95 if out else 0.4}


def _extract_ledger(sheets: list[dict[str, Any]], direct_codes: set[str]) -> tuple[dict[str, Any], dict[str, Any]]:
    sheet, header_row, mapping, score = _find_schema_sheet(
        sheets, LEDGER_SCHEMA, required=("main_code", "source", "description", "currency"),
        name_hints=("expense", "ledger"), max_scan_rows=25,
    )
    empty = {"expense_months": [], "expenses_packed": [], "ledger_months": [], "ledger_aggregates": {"by_code": [], "by_source": []}, "raw_direct": None, "raw_indirect": None, "accounting_total": None}
    if not sheet or len(mapping) < 6 or score < 65.0:
        return empty, {"role": "ledger", "confidence": 0.0}
    grid = _grid(sheet); max_row, max_col = _max_row_col(sheet)
    subheader_row = header_row + 1
    month_cols: list[tuple[int, str]] = []
    for col in range(1, max_col + 1):
        month = _excel_month(grid.get((header_row, col)))
        sub = _norm_header(grid.get((subheader_row, col)))
        if month and (sub in {"qy", "qty", "quantity"} or not sub):
            month_cols.append((col, month))
    # Deduplicate months while retaining source order.
    dedup = []; seen_months = set()
    for col, month in month_cols:
        if month not in seen_months:
            dedup.append((col, month)); seen_months.add(month)
    month_cols = dedup
    expense_months = [m for _, m in month_cols]
    packed = []; by_month = {m: 0.0 for m in expense_months}; by_code: dict[str, float] = {}; by_source: dict[str, float] = {}
    direct_total = indirect_total = 0.0; sn = 0
    # Find trailing item columns and summary columns by their semantic headers.
    total_qty_col = mapping.get("total_qty"); avg_col = mapping.get("avg_unit_price"); factor_col = mapping.get("currency_factor"); total_col = mapping.get("total_cost")
    item_cols = [int(c.get("col", 0)) for c in sheet.get("cells", []) if int(c.get("row", 0)) == header_row and _norm_header(c.get("value", "")).startswith("item")]
    populated_rows = sorted({int(c.get("row", 0)) for c in sheet.get("cells", []) if int(c.get("row", 0)) > subheader_row})
    for row in populated_rows:
        code = grid.get((row, mapping["main_code"]))
        if not _codeish(code):
            continue
        sn += 1; code_text = clean_text(code)
        raw_di = clean_text(grid.get((row, mapping.get("di", 0)))).upper()
        di = "D" if code_text in direct_codes else ("D" if raw_di == "D" else "I")
        source = grid.get((row, mapping["source"])); description = grid.get((row, mapping["description"]))
        details = []
        for idx, (col, month) in enumerate(month_cols):
            qty, unit_price, total = _n(grid.get((row, col))), _n(grid.get((row, col + 1))), _n(grid.get((row, col + 2)))
            if total is not None and abs(total) > 0:
                details.append([idx, qty, unit_price, total]); by_month[month] += total
        total_cost = _n(grid.get((row, total_col))) if total_col else None
        if total_cost is None:
            total_cost = sum(x[3] for x in details)
        total_qty = _n(grid.get((row, total_qty_col))) if total_qty_col else None
        avg = _n(grid.get((row, avg_col))) if avg_col else None
        factor = _n(grid.get((row, factor_col))) if factor_col else None
        item = next((grid.get((row, col)) for col in reversed(item_cols) if clean_text(grid.get((row, col)))), None) or source
        packed.append([
            sn, code, grid.get((row, mapping.get("resource_code", 0))), grid.get((row, mapping.get("entry_sheet", 0))),
            di, source, item, description, grid.get((row, mapping.get("unit", 0))), grid.get((row, mapping.get("currency", 0))),
            details, total_qty, avg, factor, total_cost,
            _source_evidence(sheet, row, header_row, min(1.0, len(mapping) / max(1, len(LEDGER_SCHEMA)))),
        ])
        by_code[code_text] = by_code.get(code_text, 0.0) + (total_cost or 0.0)
        source_key = clean_text(source) or "Unknown"
        by_source[source_key] = by_source.get(source_key, 0.0) + (total_cost or 0.0)
        if di == "D": direct_total += total_cost or 0.0
        else: indirect_total += total_cost or 0.0
    confidence = min(1.0, len(mapping) / max(1, len(LEDGER_SCHEMA)))
    derived_evidence = _source_evidence(sheet, header_row, header_row, confidence)
    result = {
        "expense_months": expense_months,
        "expenses_packed": packed,
        "ledger_months": [
            {"month": m, "total": by_month[m], "derived_from": "expenses_packed", **derived_evidence}
            for m in expense_months
        ],
        "ledger_aggregates": {
            "by_code": [
                {"name": k, "value": v, "derived_from": "expenses_packed", **derived_evidence}
                for k, v in sorted(by_code.items(), key=lambda kv: kv[1], reverse=True)
            ],
            "by_source": [
                {"name": k, "value": v, "derived_from": "expenses_packed", **derived_evidence}
                for k, v in sorted(by_source.items(), key=lambda kv: kv[1], reverse=True)
            ],
        },
        "raw_direct": direct_total, "raw_indirect": indirect_total, "accounting_total": direct_total + indirect_total,
    }
    return result, {"role": "ledger", "sheet": sheet.get("name"), "header_row": header_row, "mapped_fields": len(mapping), "months": len(expense_months), "confidence": round(confidence, 3), "score": round(score, 2)}


def _extract_indirect_breakdowns(sheets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    best_sheet = None
    best_pairs: list[tuple[int, int, int, int]] = []
    for sheet in sheets:
        role_blob = " ".join(
            _norm_header(c.get("value"))
            for c in sheet.get("cells", [])[:500]
            if isinstance(c.get("value"), str)
        )
        role_name = _norm_header(sheet.get("name", ""))
        if "indirect" not in role_name and "total indirect cost" not in role_blob:
            continue
        grid = _grid(sheet)
        max_row, max_col = _max_row_col(sheet)
        pairs: list[tuple[int, int, int, int]] = []
        for header_row in range(1, min(max_row, 12) + 1):
            for cost_col in range(2, max_col + 1):
                if _norm_header(grid.get((header_row, cost_col))) != "cost":
                    continue
                label_col = cost_col - 1
                count = 0
                for row in range(header_row + 1, max_row + 1):
                    label = grid.get((row, label_col))
                    cost = _n(grid.get((row, cost_col)))
                    text = _norm_header(label)
                    if isinstance(label, str) and text and cost is not None and "total" not in text and "reallocated" not in text:
                        count += 1
                if count >= 3:
                    pairs.append((count, header_row, label_col, cost_col))
        pairs.sort(reverse=True)
        if sum(pair[0] for pair in pairs[:2]) > sum(pair[0] for pair in best_pairs[:2]):
            best_sheet, best_pairs = sheet, pairs
    if not best_sheet or not best_pairs:
        return [], [], {"role": "indirect_breakdown", "confidence": 0.0, "reason": "explicit category/cost headers not detected"}

    grid = _grid(best_sheet)
    max_row, _ = _max_row_col(best_sheet)
    chosen: list[tuple[int, int, int, int]] = []
    used_columns: set[int] = set()
    for pair in best_pairs:
        _, _, label_col, cost_col = pair
        if label_col in used_columns or cost_col in used_columns:
            continue
        chosen.append(pair)
        used_columns.update((label_col, cost_col))
        if len(chosen) == 2:
            break

    confidence = 0.9 if len(chosen) == 2 else 0.75
    datasets = []
    for _, header_row, label_col, cost_col in sorted(chosen, key=lambda pair: pair[2]):
        rows = []
        for row in range(header_row + 1, max_row + 1):
            label = grid.get((row, label_col))
            cost = _n(grid.get((row, cost_col)))
            text = _norm_header(label)
            if not isinstance(label, str) or not text or cost is None or "total" in text or "reallocated" in text or text in {"category", "cost"}:
                continue
            rows.append({"category": label, "cost": cost, **_source_evidence(best_sheet, row, header_row, confidence)})
        datasets.append(rows)
    granular = datasets[0] if datasets else []
    official = datasets[1] if len(datasets) > 1 else []
    return granular, official, {
        "role": "indirect_breakdown", "sheet": best_sheet.get("name"),
        "tables": len(chosen), "confidence": confidence,
    }


def _extract_direct_alloc(sheets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    final_sheet = None; header_row = resource_col = actual_col = 0
    for sheet in sheets:
        grid = _grid(sheet); max_row, max_col = _max_row_col(sheet)
        for row in range(1, min(max_row, 25) + 1):
            rcol = acol = 0
            for col in range(1, max_col + 1):
                text = _norm_header(grid.get((row, col)))
                if text == "resource": rcol = col
                if text == "actual cost": acol = col
            if rcol and acol:
                code_count = sum(1 for rr in range(row + 1, min(max_row, row + 80) + 1) for cc in range(max(1, rcol - 4), rcol) if _codeish(grid.get((rr, cc))))
                if code_count >= 2:
                    final_sheet, header_row, resource_col, actual_col = sheet, row, rcol, acol
                    break
        if final_sheet: break
    out = []; code_item: dict[str, str] = {}
    if final_sheet:
        grid = _grid(final_sheet); max_row, _ = _max_row_col(final_sheet); current_code = current_item = None
        for row in range(header_row + 1, max_row + 1):
            for col in range(max(1, resource_col - 4), resource_col):
                if _codeish(grid.get((row, col))):
                    current_code = clean_text(grid.get((row, col)))
                    # Prefer the closest textual cell between code and resource.
                    for cc in range(col + 1, resource_col):
                        v = grid.get((row, cc))
                        if isinstance(v, str) and clean_text(v) and not v.startswith("#"):
                            current_item = v
                    break
            resource = grid.get((row, resource_col)); actual = _n(grid.get((row, actual_col)))
            if current_code and isinstance(resource, str) and clean_text(resource) and not resource.startswith("#") and _n(resource) is None and actual is not None:
                code_item[current_code] = current_item or code_item.get(current_code, "")
                out.append({
                    "main_code": current_code, "item": current_item, "resource": resource,
                    "actual_cost": actual, "other_cost_realloc": 0.0, "equipment_realloc": 0.0,
                    **_source_evidence(final_sheet, row, header_row, 0.9),
                })
    # Detect the row-wise reallocation model. Group headers own three-column blocks; third column is allocated amount.
    realloc_sheet = None; other_col = equipment_col = 0
    for sheet in sheets:
        grid = _grid(sheet); max_row, max_col = _max_row_col(sheet)
        code_count = sum(1 for c in sheet.get("cells", []) if _codeish(c.get("value")))
        if code_count < 2: continue
        for row in range(1, min(max_row, 8) + 1):
            for col in range(1, max_col + 1):
                text = _norm_header(grid.get((row, col)))
                if text == "other costs" and col + 2 <= max_col: other_col = col + 2
                if text == "equipment" and col + 2 <= max_col: equipment_col = col + 2
        if other_col or equipment_col:
            realloc_sheet = sheet; break
        other_col = equipment_col = 0
    other_by: dict[str, float] = {}; equip_by: dict[str, float] = {}
    if realloc_sheet:
        grid = _grid(realloc_sheet); max_row, max_col = _max_row_col(realloc_sheet)
        for row in range(1, max_row + 1):
            code = next((clean_text(grid.get((row, col))) for col in range(1, min(max_col, 8) + 1) if _codeish(grid.get((row, col)))), None)
            if not code: continue
            if other_col: other_by[code] = _n(grid.get((row, other_col))) or 0.0
            if equipment_col: equip_by[code] = _n(grid.get((row, equipment_col))) or 0.0
    applied = set()
    for rec in out:
        code = rec["main_code"]
        if code not in applied:
            rec["other_cost_realloc"] = other_by.get(code, 0.0); rec["equipment_realloc"] = equip_by.get(code, 0.0); applied.add(code)
    reallocation = {"other_cost_total": sum(other_by.values()), "equipment_total": sum(equip_by.values()), "codes": len(set(other_by) | set(equip_by))}
    confidence = 0.9 if out else 0.0
    return out, reallocation, {"role": "direct_allocation", "sheet": final_sheet.get("name") if final_sheet else None, "reallocation_sheet": realloc_sheet.get("name") if realloc_sheet else None, "confidence": confidence}


def _extract_waste(sheets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    sheet = None; metric_rows: dict[str, int] = {}
    for sh in sheets:
        rows = {}
        for cell in sh.get("cells", []):
            if int(cell.get("col", 0)) != 1 or not isinstance(cell.get("value"), str):
                continue
            text = _norm_header(cell.get("value"))
            if "actual waste quantity" in text: rows["waste_qty"] = int(cell.get("row", 0))
            elif "actual waste" in text and "%" in clean_text(cell.get("value")): rows["waste_pct"] = int(cell.get("row", 0))
            elif "budget waste" in text: rows["budget_waste_pct"] = int(cell.get("row", 0))
            elif "waste variance" in text: rows["waste_variance"] = int(cell.get("row", 0))
            elif "الاستهلاك الفعلي" in text: rows["actual"] = int(cell.get("row", 0))
            elif "الاستهلاك الهندسي" in text: rows["engineering"] = int(cell.get("row", 0))
            elif "وحدة البند" in text: rows["unit"] = int(cell.get("row", 0))
            elif "تشوين" in text: rows["stock"] = int(cell.get("row", 0))
            elif "الكميه المدرجه" in text or "الكمية المدرجة" in text: rows["owner_qty"] = int(cell.get("row", 0))
            elif "متوسط سعر" in text: rows["avg_price"] = int(cell.get("row", 0))
            elif "total actual cost" in text and "waste" in text: rows.setdefault("waste_cost", int(cell.get("row", 0)))
        if len(rows) >= 5:
            sheet, metric_rows = sh, rows; break
    if not sheet:
        return [], [], {"role": "waste", "confidence": 0.0}
    grid = _grid(sheet); max_row, max_col = _max_row_col(sheet)
    steel_col = split_col = classification_header_row = 0
    for row in range(1, min(max_row, 8) + 1):
        for col in range(2, max_col + 1):
            heading = _norm_header(grid.get((row, col)))
            if "steel" in heading:
                steel_col = col
            if "concrete" in heading:
                split_col = col
        if steel_col and split_col:
            classification_header_row = row
            break
    if not steel_col or not split_col or split_col <= steel_col:
        return [], [], {"role": "waste", "sheet": sheet.get("name"), "confidence": 0.0, "reason": "explicit steel/concrete headers not detected"}
    waste = []
    for row in sorted(set(metric_rows.values())):
        label = grid.get((row, 1)); values_steel = [_n(grid.get((row, c))) for c in range(2, split_col)]; values_conc = [_n(grid.get((row, c))) for c in range(split_col, max_col + 1)]
        sv = [v for v in values_steel if v is not None]; cv = [v for v in values_conc if v is not None]
        is_pct = "%" in clean_text(label) or "percent" in _norm_header(label)
        waste.append({
            "label": label,
            "steel": (sum(sv) / len(sv) if is_pct and sv else sum(sv)),
            "concrete": (sum(cv) / len(cv) if is_pct and cv else sum(cv)),
            **_source_evidence(sheet, row, classification_header_row, 0.95),
        })
    actual_row = metric_rows.get("actual", 0); item_row = max(1, actual_row - 1)
    detail = []
    for col in range(2, max_col + 1):
        item = grid.get((item_row, col))
        actual = _n(grid.get((metric_rows.get("actual", 0), col))) if metric_rows.get("actual") else None
        engineering = _n(grid.get((metric_rows.get("engineering", 0), col))) if metric_rows.get("engineering") else None
        if not clean_text(item) and actual is None and engineering is None:
            continue
        waste_qty = _n(grid.get((metric_rows.get("waste_qty", 0), col))) if metric_rows.get("waste_qty") else ((actual - engineering) if actual is not None and engineering is not None else None)
        detail.append({
            "type": "Steel" if col < split_col else "Concrete", "item": item,
            "actual_consumption": actual, "engineering_consumption": engineering,
            "unit": grid.get((metric_rows.get("unit", 0), col)) if metric_rows.get("unit") else None,
            "stock": _n(grid.get((metric_rows.get("stock", 0), col))) if metric_rows.get("stock") else None,
            "owner_invoice_qty": _n(grid.get((metric_rows.get("owner_qty", 0), col))) if metric_rows.get("owner_qty") else None,
            "actual_waste_qty": waste_qty,
            "actual_waste_pct": _n(grid.get((metric_rows.get("waste_pct", 0), col))) if metric_rows.get("waste_pct") else ((waste_qty / engineering) if waste_qty is not None and engineering else None),
            "budget_waste_pct": _n(grid.get((metric_rows.get("budget_waste_pct", 0), col))) if metric_rows.get("budget_waste_pct") else None,
            "waste_variance": _n(grid.get((metric_rows.get("waste_variance", 0), col))) if metric_rows.get("waste_variance") else None,
            "avg_price": _n(grid.get((metric_rows.get("avg_price", 0), col))) if metric_rows.get("avg_price") else None,
            "waste_cost": _n(grid.get((metric_rows.get("waste_cost", 0), col))) if metric_rows.get("waste_cost") else None,
            **_source_evidence(sheet, item_row, classification_header_row, 0.95),
        })
    return waste, detail, {"role": "waste", "sheet": sheet.get("name"), "confidence": 0.95 if detail else 0.5}


def _extract_boq_resources(sheets: list[dict[str, Any]], direct_rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    by_code = {clean_text(r.get("main_code")): r for r in direct_rows if clean_text(r.get("main_code"))}
    resources = []; code_sheet: dict[str, str] = {}; learned_sheets = 0
    for sheet in sheets:
        header_row, mapping, score = _schema_header(sheet, BOQ_RESOURCE_SCHEMA, max_scan_rows=12)
        if not {"resource", "resource_code", "actual_cost", "work_qty"}.issubset(mapping):
            continue
        grid = _grid(sheet); max_row, max_col = _max_row_col(sheet)
        code = None
        for row in range(1, min(header_row + 1, 8) + 1):
            for col in range(1, min(max_col, 10) + 1):
                v = grid.get((row, col)); key = clean_text(v)
                if key in by_code:
                    code = key; break
            if code: break
        if not code:
            continue
        direct = by_code.get(code, {}); learned_sheets += 1; code_sheet.setdefault(code, clean_text(sheet.get("name")))
        for row in range(header_row + 1, max_row + 1):
            resource = grid.get((row, mapping["resource"])); rcode = grid.get((row, mapping["resource_code"])); actual = _n(grid.get((row, mapping["actual_cost"])))
            if not isinstance(resource, str) or not clean_text(resource) or resource.startswith("#") or actual is None:
                continue
            no = next((_n(grid.get((row, col))) for col in range(1, mapping["resource"]) if _n(grid.get((row, col))) is not None), None)
            work_qty = _n(grid.get((row, mapping["work_qty"])))
            actual_rate = _n(grid.get((row, mapping.get("actual_rate", 0)))) if mapping.get("actual_rate") else ((actual / work_qty) if work_qty else None)
            resources.append({
                "sheet": sheet.get("name"), "main_code": code, "boq_description": direct.get("description") or sheet.get("name"),
                "unit": direct.get("unit"), "no": no, "resource": resource, "resource_code": rcode,
                "actual_cost": actual, "work_qty": work_qty, "actual_rate": actual_rate,
                "eac": _n(grid.get((row, mapping.get("eac", 0)))) if mapping.get("eac") else None,
                **_source_evidence(sheet, row, header_row, min(1.0, len(mapping) / max(1, len(BOQ_RESOURCE_SCHEMA)))),
            })
    forecasts = []
    for direct in direct_rows:
        code = clean_text(direct.get("main_code")); bac, ev = direct.get("bac"), direct.get("ev"); eac = direct.get("eac"); final_qty = direct.get("final_qs_qty"); work_qty = direct.get("work_qty")
        base = {
            "sheet": code_sheet.get(code), "main_code": direct.get("main_code"), "boq_item": direct.get("boq_item"),
            "description": direct.get("description"), "division": direct.get("division"), "resource": "", "resource_code": "",
            "unit": direct.get("unit"), "budget_rate": direct.get("budget_rate"), "final_qs_qty": final_qty, "work_qty": work_qty,
            "remaining_qty": direct.get("remaining_qty"), "ev": ev, "bac": bac,
            "remaining_budget": (bac - ev) if isinstance(bac, (int, float)) and isinstance(ev, (int, float)) else None,
            "forecast_rate": (eac / final_qty) if isinstance(eac, (int, float)) and isinstance(final_qty, (int, float)) and final_qty else None,
            "etc": direct.get("etc"), "is_resource": False,
            "source_sheet": direct.get("source_sheet"), "source_row": direct.get("source_row"),
            "source_header_row": direct.get("source_header_row"), "mapping_confidence": direct.get("mapping_confidence"),
        }
        forecasts.append(base)
    for res in resources:
        direct = by_code.get(clean_text(res.get("main_code")), {})
        eac = res.get("eac"); work_qty = res.get("work_qty"); final_qty = direct.get("final_qs_qty")
        forecasts.append({
            "sheet": res.get("sheet"), "main_code": res.get("main_code"), "boq_item": direct.get("boq_item"), "description": direct.get("description") or res.get("boq_description"),
            "division": direct.get("division"), "resource": res.get("resource"), "resource_code": res.get("resource_code"), "unit": direct.get("unit"),
            "budget_rate": direct.get("budget_rate"), "final_qs_qty": final_qty, "work_qty": work_qty,
            "remaining_qty": direct.get("remaining_qty"), "ev": None, "bac": None, "remaining_budget": None,
            "forecast_rate": (eac / final_qty) if isinstance(eac, (int, float)) and isinstance(final_qty, (int, float)) and final_qty else res.get("actual_rate"),
            "etc": (eac - res.get("actual_cost")) if isinstance(eac, (int, float)) and isinstance(res.get("actual_cost"), (int, float)) else None,
            "is_resource": True,
            "source_sheet": res.get("source_sheet"), "source_row": res.get("source_row"),
            "source_header_row": res.get("source_header_row"), "mapping_confidence": res.get("mapping_confidence"),
        })
    return resources, forecasts, {"role": "boq_resources", "learned_sheets": learned_sheets, "rows": len(resources), "confidence": 0.95 if learned_sheets else 0.0}


def _extract_project_totals(sheets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidate = None
    for sheet in sheets:
        blob = " ".join(_norm_header(c.get("value")) for c in sheet.get("cells", [])[:600] if isinstance(c.get("value"), str))
        if "division name" in blob and "item description" in blob:
            candidate = sheet; break
    if not candidate:
        return []
    by_row: dict[int, list[dict[str, Any]]] = {}
    for c in candidate.get("cells", []): by_row.setdefault(int(c.get("row", 0)), []).append(c)
    out = []
    for row, cells in sorted(by_row.items()):
        values = [c.get("value") for c in sorted(cells, key=lambda x: int(x.get("col", 0))) if c.get("value") not in (None, "")]
        text = " ".join(_norm_header(v) for v in values if isinstance(v, str))
        if not values or any(x in text for x in ("under budget", "over budget")):
            continue
        if "total" in text or "indirect" in text or "fees" in text or ("works" in text and any(isinstance(v, (int, float)) for v in values)):
            full = []
            grid = _grid(candidate)
            for col in range(1, 18): full.append(grid.get((row, col), ""))
            out.append({"row": row, "values": full, **_source_evidence(candidate, row, 0, 0.7)})
    return out[:120]


def build_adaptive_normalized(
    metadata: dict[str, Any],
    metrics: dict[str, Any],
    parsed_sheets: list[dict[str, Any]],
) -> dict[str, Any]:
    """Infer the standard dashboard contract from workbook structure, not project fingerprints.

    The reader learns semantic roles from headers, repeated table shapes, code patterns and
    time-series layouts. It never fabricates missing business records: low-confidence or
    absent structures remain empty and are still retained in raw/source evidence.
    """
    contract = _preferred_metric_value(metrics, "contract_value")
    budget = _preferred_metric_value(metrics, "budget")
    ev = _preferred_metric_value(metrics, "earned_value")
    actual = _preferred_metric_value(metrics, "actual_cost")
    revenue = _preferred_metric_value(metrics, "revenue")
    profit = _preferred_metric_value(metrics, "gross_profit")
    direct_metric = _preferred_metric_value(metrics, "direct_cost")
    indirect_metric = _preferred_metric_value(metrics, "indirect_cost")

    direct_details, learn_direct = _extract_direct_details(parsed_sheets)
    indirect_details, learn_indirect = _extract_indirect_details(parsed_sheets)
    project_items = _project_items_from_direct(direct_details)
    direct_codes = {clean_text(r.get("main_code")) for r in direct_details if clean_text(r.get("main_code"))}
    cashflow, learn_cashflow = _extract_cashflow(parsed_sheets)
    cost_codes, learn_codes = _extract_cost_codes(parsed_sheets)
    ledger, learn_ledger = _extract_ledger(parsed_sheets, direct_codes)
    granular, official, learn_indirect_breakdown = _extract_indirect_breakdowns(parsed_sheets)
    direct_alloc, reallocation, learn_alloc = _extract_direct_alloc(parsed_sheets)
    waste, waste_detail, learn_waste = _extract_waste(parsed_sheets)
    boq_resources, boq_forecasts, learn_boq = _extract_boq_resources(parsed_sheets, direct_details)
    project_totals = _extract_project_totals(parsed_sheets)

    # Repair only an explicit formula error. A real zero or an empty cell remains untouched.
    ledger_month_map = {r["month"]: r["total"] for r in ledger["ledger_months"]}
    if cashflow and ledger_month_map:
        ci_cum = co_cum = 0.0
        for row in cashflow:
            if row.get("cash_out_source_state") == "formula_error" and ledger_month_map.get(row.get("month")) not in (None, 0):
                row["cash_out"] = ledger_month_map[row["month"]]
                row["cash_out_fallback"] = "same_month_transaction_ledger"
            ci_cum += row.get("cash_in") or 0.0; co_cum += row.get("cash_out") or 0.0
            row["cash_in_cum"] = ci_cum; row["cash_out_cum"] = co_cum

    direct_sum = sum(r.get("ac") or 0.0 for r in direct_details)
    direct_budget_sum = sum(r.get("original_budget") or 0.0 for r in direct_details)
    budget_candidates = metrics.get("budget", {}).get("candidates", []) if isinstance(metrics.get("budget"), dict) else []
    def _budget_component(label: str) -> float | None:
        target = _norm_header(label)
        for candidate in budget_candidates:
            if _norm_header(candidate.get("source_label")) == target and isinstance(candidate.get("value"), (int, float)):
                return float(candidate["value"])
        return None
    direct_budget_metric = _budget_component("Direct Budget Cost")
    indirect_budget_metric = _budget_component("Indirect Budget Cost")
    # Prefer learned detail when a headline formula is zero/unavailable but detailed source rows are populated.
    direct_actual = direct_sum if direct_sum and (not direct_metric or direct_metric == 0) else direct_metric
    indirect_actual = indirect_metric
    kpis = {
        "contract_price_dashboard": contract,
        "total_price_project_summary": contract,
        "total_budget_cost": budget,
        "direct_budget_cost": direct_budget_metric if direct_budget_metric is not None else (direct_budget_sum if not budget or direct_budget_sum <= budget * 1.05 else None),
        "indirect_budget_cost": indirect_budget_metric if indirect_budget_metric is not None else ((budget - direct_budget_sum) if isinstance(budget, (int, float)) and direct_budget_sum and budget >= direct_budget_sum else None),
        "ev_dashboard_scope": ev,
        "ev_total_project_scope": ev,
        "actual_cost_dashboard_scope": actual,
        "actual_cost_total_project_scope": actual,
        "direct_actual": direct_actual,
        "indirect_actual": indirect_actual,
        "direct_detail_actual": direct_sum or None,
        "indirect_detail_actual": sum(r.get("ac") or 0.0 for r in indirect_details) or None,
        "revenue_gross_profit": revenue,
        "derived_cpi": metrics.get("derived_cpi"),
        "derived_cv": metrics.get("derived_cv"),
        "ledger_accounting_cost": ledger.get("accounting_total"),
        "ledger_raw_direct": ledger.get("raw_direct"),
        "ledger_raw_indirect": ledger.get("raw_indirect"),
    }
    profitability = []
    if profit is not None:
        profitability.append({
            "method": "Detected Gross Profit",
            "source": metrics.get("gross_profit", {}).get("preferred", {}).get("source_sheet", "Adaptive workbook"),
            "base_label": "Revenue", "base": revenue, "direct": direct_actual, "indirect": indirect_actual,
            "deductions": None, "deductions_pct": None, "head_office": None, "profit": profit,
            "profit_pct": (profit / revenue) if revenue else None,
        })
    source_charts = [chart for sheet in parsed_sheets for chart in sheet.get("charts", [])]
    source_inventory = [{
        "name": sheet.get("name"), "state": sheet.get("state"), "dimension": sheet.get("dimension"),
        "cell_count": sheet.get("cell_count", 0), "chart_count": len(sheet.get("charts", [])),
    } for sheet in parsed_sheets]
    source_snapshots = {sheet.get("name", f"Sheet {index}"): sheet_preview(sheet) for index, sheet in enumerate(parsed_sheets, 1)}
    learning = [learn_direct, learn_indirect, learn_cashflow, learn_codes, learn_ledger, learn_indirect_breakdown, learn_alloc, learn_waste, learn_boq]
    indirect_detail_sum = sum(r.get("ac") or 0.0 for r in indirect_details)
    cost_scope_reconciliation = {
        "dashboard_actual": actual,
        "direct_detail_actual": direct_sum or None,
        "indirect_detail_actual": indirect_detail_sum or None,
        "detail_total": (direct_sum + indirect_detail_sum) if direct_sum or indirect_detail_sum else None,
        "ledger_actual": ledger.get("accounting_total"),
        "forced_reconciliation": False,
    }
    data_quality = [{
        "severity": "info" if float(x.get("confidence", 0)) >= 0.65 else "warning",
        "title": "Adaptive schema learning",
        "detail": f"{x.get('role')}: {x.get('sheet') or x.get('learned_sheets') or 'not detected'} · confidence {float(x.get('confidence', 0))*100:.0f}%",
        "evidence": x,
    } for x in learning]
    return {
        "normalization_mode": "adaptive_universal",
        "meta": {
            "project_title": metadata.get("project_name"), "project_name": metadata.get("project_name"), "scope": "Cost Control",
            "report_period": metadata.get("reporting_period"), "project_start": metadata.get("project_start"), "project_finish": metadata.get("effective_project_finish"),
        },
        "kpis": kpis, "profitability": profitability,
        "project_items": project_items, "project_totals": project_totals,
        "direct_details": direct_details, "boq_resources": boq_resources, "boq_forecasts": boq_forecasts,
        "indirect_details": indirect_details, "direct_alloc": direct_alloc,
        "indirect_granular": granular, "indirect_official": official, "reallocation": reallocation,
        "cashflow": cashflow, "waste": waste, "waste_detail": waste_detail, "cost_codes": cost_codes,
        "ledger_months": ledger["ledger_months"], "ledger_aggregates": ledger["ledger_aggregates"],
        "cost_scope_reconciliation": cost_scope_reconciliation,
        "source_inventory": source_inventory, "data_quality": data_quality, "source_snapshots": source_snapshots, "source_charts": source_charts,
        "expense_months": ledger["expense_months"], "expenses_packed": ledger["expenses_packed"], "source_media": {},
        "schema_learning": learning,
        "counts": {
            "workbook_sheets": len(parsed_sheets), "meaningful_sheets": sum(1 for sheet in parsed_sheets if sheet.get("cell_count", 0) > 0),
            "source_charts": len(source_charts), "project_items": len(project_items), "direct_details": len(direct_details),
            "boq_resources": len(boq_resources), "boq_forecasts": len(boq_forecasts), "indirect_details": len(indirect_details),
            "direct_alloc": len(direct_alloc), "cashflow": len(cashflow), "waste": len(waste), "cost_codes": len(cost_codes),
            "ledger_months": len(ledger["ledger_months"]), "expenses": len(ledger["expenses_packed"]),
        },
    }

def parse_workbook(source: Path, output_root: Path) -> dict[str, Any]:
    wb = open_source_document(source)
    try:
        parsed_sheets = [wb.read_sheet(info) for info in wb.sheets]
        metadata = extract_metadata(parsed_sheets)
        outcome = resolve_identity(output_root, metadata)
        if outcome["status"] not in {"existing", "new"}:
            problem = record_identity_problem(output_root, metadata, source, wb.fingerprint, outcome)
            return {
                "status": f"identity_{outcome['status']}", "project_id": None,
                "project_name": metadata.get("project_name") or "Unresolved Project",
                "reporting_period": metadata.get("reporting_period"), "source_fingerprint": wb.fingerprint,
                "quality": [problem], "published_project": False,
            }
        project_name = outcome["project_name"]
        project_id = outcome["project_id"]
        period = metadata["reporting_period"]
        identity_evidence = metadata["evidence"]
        metrics = detect_metrics(parsed_sheets)
        capabilities = detect_capabilities(parsed_sheets)
        generated_at = datetime.now(timezone.utc).isoformat()
        repo_root = output_root.parent.parent
        parity = load_parity_reference(repo_root, source, wb.fingerprint, parsed_sheets)
        project_dir = output_root / "projects" / project_id
        raw_dir = project_dir / "raw" / period / wb.fingerprint[:16]
        raw_dir.mkdir(parents=True, exist_ok=True)

        sheet_manifest = []
        total_tables = 0
        total_charts = 0
        for idx, sh in enumerate(parsed_sheets, 1):
            tables = detect_tables(sh)
            total_tables += len(tables)
            total_charts += len(sh["charts"])
            slug = f"{idx:03d}-{slugify(sh['name'])}.json"
            raw_sheet = sh
            cell_chunk_paths: list[str] = []
            if len(sh["cells"]) > RAW_PRIMARY_CELL_LIMIT:
                raw_sheet = dict(sh)
                raw_sheet["cells"] = sh["cells"][:RAW_PRIMARY_CELL_LIMIT]
                raw_sheet["cells_in_primary"] = len(raw_sheet["cells"])
                raw_sheet["cells_chunked"] = True
                chunk_stem = slug[:-5]
                for chunk_number, start in enumerate(range(0, len(sh["cells"]), RAW_CELL_CHUNK_SIZE), 1):
                    chunk_name = f"{chunk_stem}-cells-{chunk_number:03d}.json"
                    chunk_path = f"/generated/projects/{project_id}/raw/{period}/{wb.fingerprint[:16]}/{chunk_name}"
                    chunk_payload = {
                        "project_id": project_id,
                        "project_name": project_name,
                        "reporting_period": period,
                        "source_fingerprint": wb.fingerprint,
                        "source_format": wb.source_format,
                        "sheet_name": sh["name"],
                        "chunk_index": chunk_number,
                        "start_cell_index": start,
                        "cells": sh["cells"][start:start + RAW_CELL_CHUNK_SIZE],
                    }
                    (raw_dir / chunk_name).write_text(json.dumps(chunk_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                    cell_chunk_paths.append(chunk_path)
                raw_sheet["cell_chunks"] = cell_chunk_paths
            raw_payload = {
                "project_id": project_id,
                "project_name": project_name,
                "reporting_period": period,
                "source_fingerprint": wb.fingerprint,
                "source_format": wb.source_format,
                "identity": {
                    "project_sap_id": metadata.get("project_sap_id"),
                    "project_code": metadata.get("project_code"),
                    "project_start": metadata.get("project_start"),
                    "project_finish": metadata.get("project_finish"),
                    "project_finish_eot": metadata.get("project_finish_eot"),
                    "effective_project_finish": metadata.get("effective_project_finish"),
                },
                "sheet": raw_sheet,
                "detected_tables": tables,
                "cell_chunks": cell_chunk_paths,
            }
            (raw_dir / slug).write_text(json.dumps(raw_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            sheet_manifest.append({
                "index": idx,
                "name": sh["name"],
                "state": sh["state"],
                "dimension": sh["dimension"],
                "cell_count": sh["cell_count"],
                "chart_count": len(sh["charts"]),
                "table_count": len(tables),
                "raw_path": f"/generated/projects/{project_id}/raw/{period}/{wb.fingerprint[:16]}/{slug}",
                "preview": sheet_preview(sh),
            })

        all_charts = []
        for sh in parsed_sheets:
            for ch in sh["charts"]:
                all_charts.append(ch)

        normalized_path = None
        parity_quality: list[dict[str, Any]] = []
        normalized_data = parity["data"] if parity else build_adaptive_normalized(metadata, metrics, parsed_sheets)
        enriched_dir = project_dir / "enriched" / period / wb.fingerprint[:16]
        enriched_dir.mkdir(parents=True, exist_ok=True)
        normalized_file = enriched_dir / "normalized.json"
        normalized_file.write_text(json.dumps(normalized_data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        normalized_path = f"/generated/projects/{project_id}/enriched/{period}/{wb.fingerprint[:16]}/normalized.json"
        if parity:
            for i, q in enumerate(parity["data"].get("data_quality", []), 1):
                parity_quality.append({
                    "severity": q.get("severity", "info"),
                    "code": f"APPROVED_SOURCE_OBSERVATION_{i:02d}",
                    "project_id": project_id,
                    "period": period,
                    "message": f"{q.get('title', 'Source observation')}: {q.get('detail', '')}".strip(),
                    "source": "approved-parity-reference",
                })

        summary = {
            "schema_version": 3,
            "project_id": project_id,
            "project_name": project_name,
            "reporting_period": period,
            "identity": {
                "status": outcome["status"],
                "project_sap_id": metadata.get("project_sap_id"),
                "project_code": metadata.get("project_code"),
                "project_name": metadata.get("project_name"),
                "report_start": metadata.get("report_start"),
                "report_finish": metadata.get("report_finish"),
                "project_start": metadata.get("project_start"),
                "project_finish": metadata.get("project_finish"),
                "project_finish_eot": metadata.get("project_finish_eot"),
                "effective_project_finish": metadata.get("effective_project_finish"),
                "metadata_sheet_state": metadata.get("sheet_state"),
                "identity_source": "metadata_sheet" if wb.source_format in {"xlsx", "xlsm"} else "embedded_sap_form_metadata",
            },
            "source": {
                "filename": source.name,
                "format": wb.source_format,
                "sha256": wb.fingerprint,
                "bytes": source.stat().st_size,
                "identity_evidence": identity_evidence,
            },
            "generated_at": generated_at,
            "normalized_path": normalized_path,
            "approved_parity": {
                "matched": bool(parity),
                "reference_file": parity["entry"].get("data_file") if parity else None,
                "source_sha256": parity["entry"].get("source_sha256") if parity else None,
                "match_mode": parity.get("match_mode") if parity else None,
                "content_sha256": parity.get("content_sha256") if parity else semantic_workbook_fingerprint(parsed_sheets),
            },
            "metrics": metrics,
            "capabilities": capabilities,
            "manifest": {
                "sheet_count": len(parsed_sheets),
                "visible_sheet_count": sum(1 for s in parsed_sheets if s["state"] == "visible"),
                "hidden_sheet_count": sum(1 for s in parsed_sheets if s["state"] != "visible"),
                "cell_count": sum(s["cell_count"] for s in parsed_sheets),
                "detected_table_count": total_tables,
                "excel_chart_count": total_charts,
                "sheets": sheet_manifest,
                "charts": all_charts,
                "unaccounted_sheets": 0,
            },
            "quality": metadata.get("quality", []) + build_quality(parsed_sheets, metrics, project_id, period) + parity_quality,
        }
        if summary["manifest"]["sheet_count"] != len(summary["manifest"]["sheets"]) or summary["manifest"]["unaccounted_sheets"] != 0:
            raise ValueError("Workbook completeness validation failed before history/latest update")
        if not summary["identity"]["project_sap_id"] and not summary["identity"]["project_code"]:
            raise ValueError("Project identity validation failed before history/latest update")
        period_dir = project_dir / "history" / period
        period_dir.mkdir(parents=True, exist_ok=True)
        revision_file = period_dir / f"{wb.fingerprint}.json"
        revision_file.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        (period_dir / "latest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        project_latest = project_dir / "latest.json"
        should_update = True
        if project_latest.exists():
            try:
                old = json.loads(project_latest.read_text(encoding="utf-8"))
                old_period = old.get("reporting_period", "unknown")
                if old_period != "unknown" and period != "unknown" and old_period > period:
                    should_update = False
            except Exception:
                pass
        if should_update:
            project_latest.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        register_validated_identity(output_root, outcome, metadata, wb.fingerprint)
        summary["status"] = "parsed"
        summary["published_project"] = True
        return summary
    finally:
        wb.close()


def build_quality(sheets: list[dict[str, Any]], metrics: dict[str, Any], project_id: str, period: str) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for sh in sheets:
        for c in sh["cells"]:
            if c.get("value") in ("#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A"):
                issues.append({
                    "severity": "warning",
                    "code": "SOURCE_FORMULA_ERROR",
                    "project_id": project_id,
                    "period": period,
                    "message": f"{c['value']} in {sh['name']}!{c['ref']}",
                    "sheet": sh["name"],
                    "cell": c["ref"],
                })
    for key in ["budget", "earned_value", "actual_cost"]:
        if not metrics.get(key, {}).get("preferred"):
            issues.append({
                "severity": "info",
                "code": "STANDARD_METRIC_NOT_DETECTED",
                "project_id": project_id,
                "period": period,
                "message": f"No reliable standard mapping detected for {key}; source remains available in Source Explorer.",
            })
    return issues


def _registry_metrics(data: dict[str, Any]) -> dict[str, float]:
    metrics: dict[str, float] = {}
    for key, block in data.get("metrics", {}).items():
        if isinstance(block, dict) and block.get("preferred"):
            value = block["preferred"].get("value")
            if isinstance(value, (int, float)):
                metrics[key] = float(value)
    if "derived_cpi" in data.get("metrics", {}):
        metrics["cpi"] = float(data["metrics"]["derived_cpi"])
    if "derived_cv" in data.get("metrics", {}):
        metrics["cost_variance"] = float(data["metrics"]["derived_cv"])
    return metrics


def regenerate_portfolio(output_root: Path) -> dict[str, Any]:
    identity_registry = load_identity_registry(output_root)
    save_identity_registry(output_root, identity_registry)
    identity_by_project = {p.get("internal_project_id"): p for p in identity_registry.get("projects", [])}
    projects_root = output_root / "projects"
    projects = []
    if projects_root.exists():
        for latest in sorted(projects_root.glob("*/latest.json")):
            try:
                data = json.loads(latest.read_text(encoding="utf-8"))
            except Exception:
                continue
            history = []
            for period_latest in sorted(latest.parent.glob("history/*/latest.json")):
                try:
                    h = json.loads(period_latest.read_text(encoding="utf-8"))
                except Exception:
                    continue
                history.append({
                    "reporting_period": h.get("reporting_period", period_latest.parent.name),
                    "source_fingerprint": h.get("source", {}).get("sha256", ""),
                    "metrics": _registry_metrics(h),
                    "normalized_path": h.get("normalized_path"),
                })
            projects.append({
                "project_id": data["project_id"],
                "project_name": data["project_name"],
                "identity": data.get("identity") or {
                    "status": "legacy_migration_required",
                    "project_sap_id": identity_by_project.get(data["project_id"], {}).get("project_sap_id"),
                    "project_code": identity_by_project.get(data["project_id"], {}).get("project_code"),
                },
                "reporting_period": data["reporting_period"],
                "source_fingerprint": data["source"]["sha256"],
                "normalized_path": data.get("normalized_path"),
                "approved_parity": data.get("approved_parity", {}).get("matched", False),
                "metrics": _registry_metrics(data),
                "capabilities": data.get("capabilities", {}),
                "quality_count": len(data.get("quality", [])),
                "sheet_count": data.get("manifest", {}).get("sheet_count", 0),
                "chart_count": data.get("manifest", {}).get("excel_chart_count", 0),
                "history": history,
            })
    digest = hashlib.sha256(json.dumps(projects, sort_keys=True).encode()).hexdigest()
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "registry_fingerprint": digest,
        "project_count": len(projects),
        "projects": projects,
    }
    port = output_root / "portfolio"
    port.mkdir(parents=True, exist_ok=True)
    (port / "latest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_root / "projects.json").write_text(json.dumps(projects, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload
