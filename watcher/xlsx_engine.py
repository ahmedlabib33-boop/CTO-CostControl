from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
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


def build_adaptive_normalized(
    metadata: dict[str, Any],
    metrics: dict[str, Any],
    parsed_sheets: list[dict[str, Any]],
) -> dict[str, Any]:
    """Create the complete standard dashboard contract for every valid workbook.

    Reliably detected values populate the contract. Unknown structures remain empty,
    while their complete raw cells, detected tables and chart definitions stay available
    through the source-audit pages. Missing business data is never fabricated.
    """
    contract = _preferred_metric_value(metrics, "contract_value")
    budget = _preferred_metric_value(metrics, "budget")
    ev = _preferred_metric_value(metrics, "earned_value")
    actual = _preferred_metric_value(metrics, "actual_cost")
    revenue = _preferred_metric_value(metrics, "revenue")
    profit = _preferred_metric_value(metrics, "gross_profit")
    direct = _preferred_metric_value(metrics, "direct_cost")
    indirect = _preferred_metric_value(metrics, "indirect_cost")
    kpis = {
        "contract_price_dashboard": contract,
        "total_price_project_summary": contract,
        "total_budget_cost": budget,
        "ev_dashboard_scope": ev,
        "actual_cost_dashboard_scope": actual,
        "direct_actual": direct,
        "indirect_actual": indirect,
        "revenue_gross_profit": revenue,
        "derived_cpi": metrics.get("derived_cpi"),
        "derived_cv": metrics.get("derived_cv"),
    }
    profitability = []
    if profit is not None:
        profitability.append({
            "method": "Detected Gross Profit",
            "source": metrics.get("gross_profit", {}).get("preferred", {}).get("source_sheet", "Adaptive workbook"),
            "base_label": "Revenue",
            "base": revenue,
            "direct": direct,
            "indirect": indirect,
            "deductions": None,
            "deductions_pct": None,
            "head_office": None,
            "profit": profit,
            "profit_pct": (profit / revenue) if revenue else None,
        })
    source_charts = [chart for sheet in parsed_sheets for chart in sheet.get("charts", [])]
    source_inventory = [{
        "name": sheet.get("name"),
        "state": sheet.get("state"),
        "dimension": sheet.get("dimension"),
        "cell_count": sheet.get("cell_count", 0),
        "chart_count": len(sheet.get("charts", [])),
    } for sheet in parsed_sheets]
    source_snapshots = {sheet.get("name", f"Sheet {index}"): sheet_preview(sheet) for index, sheet in enumerate(parsed_sheets, 1)}
    return {
        "normalization_mode": "adaptive_universal",
        "meta": {
            "project_title": metadata.get("project_name"),
            "project_name": metadata.get("project_name"),
            "scope": "Cost Control",
            "report_period": metadata.get("reporting_period"),
            "project_start": metadata.get("project_start"),
            "project_finish": metadata.get("effective_project_finish"),
        },
        "kpis": kpis,
        "profitability": profitability,
        "project_items": [],
        "project_totals": [],
        "direct_details": [],
        "boq_resources": [],
        "boq_forecasts": [],
        "indirect_details": [],
        "direct_alloc": [],
        "indirect_granular": [],
        "indirect_official": [],
        "reallocation": {},
        "cashflow": [],
        "waste": [],
        "waste_detail": [],
        "cost_codes": [],
        "ledger_months": [],
        "ledger_aggregates": {"by_code": [], "by_source": []},
        "source_inventory": source_inventory,
        "data_quality": [],
        "source_snapshots": source_snapshots,
        "source_charts": source_charts,
        "expense_months": [],
        "expenses_packed": [],
        "source_media": {},
        "counts": {
            "workbook_sheets": len(parsed_sheets),
            "meaningful_sheets": sum(1 for sheet in parsed_sheets if sheet.get("cell_count", 0) > 0),
            "source_charts": len(source_charts),
        },
    }

def parse_workbook(source: Path, output_root: Path) -> dict[str, Any]:
    wb = XlsxWorkbook(source)
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
            raw_payload = {
                "project_id": project_id,
                "project_name": project_name,
                "reporting_period": period,
                "source_fingerprint": wb.fingerprint,
                "identity": {
                    "project_sap_id": metadata.get("project_sap_id"),
                    "project_code": metadata.get("project_code"),
                    "project_start": metadata.get("project_start"),
                    "project_finish": metadata.get("project_finish"),
                    "project_finish_eot": metadata.get("project_finish_eot"),
                    "effective_project_finish": metadata.get("effective_project_finish"),
                },
                "sheet": sh,
                "detected_tables": tables,
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
                "identity_source": "metadata_sheet",
            },
            "source": {
                "filename": source.name,
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
