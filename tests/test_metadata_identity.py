import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from watcher.identity import (extract_metadata, identifier_from_cell, load_identity_registry,
                              parse_date_cell, resolve_identity, save_identity_registry)
from watcher.xlsx_engine import XlsxWorkbook, parse_workbook, regenerate_portfolio


def _cell(row, col, value, **extra):
    return {"row": row, "col": col, "ref": f"{'AB'[col-1]}{row}", "value": value, "formula": None, **extra}


def _metadata(sap="SAP-1", code="CODE/1", name="Project One", start="2026-01-01", finish="2026-01-31", state="visible"):
    values = [("Project SAP ID", sap), ("Project Code", code), ("Project Name", name), ("Report Start", start), ("Report Finish", finish)]
    return {"name": " MeTaDaTa ", "state": state, "cells": [_cell(r, c, v) for r, pair in enumerate(values, 1) for c, v in enumerate(pair, 1)]}


def _write_xlsx(path: Path, *, sap="SAP-1", code="CODE/1", name="Project One", start="2026-01-01", finish="2026-01-31", hidden=False, amount=100):
    state = ' state="hidden"' if hidden else ""
    def inline(ref, value):
        if value is None:
            return ""
        return f'<c r="{ref}" t="inlineStr"><is><t>{value}</t></is></c>'
    rows = [("Project SAP ID", sap), ("Project Code", code), ("Project Name", name), ("Report Start", start), ("Report Finish", finish)]
    metadata_rows = "".join(f'<row r="{i}">{inline(f"A{i}", a)}{inline(f"B{i}", b)}</row>' for i, (a, b) in enumerate(rows, 1))
    content_types = '''<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'''
    root_rels = '''<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'''
    workbook = f'''<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="metadata" sheetId="1"{state} r:id="rId1"/><sheet name="Dashboard" sheetId="2" r:id="rId2"/></sheets></workbook>'''
    wb_rels = '''<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'''
    metadata_xml = f'''<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B5"/><sheetData>{metadata_rows}</sheetData></worksheet>'''
    dashboard = f'''<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B3"/><sheetData><row r="1">{inline("A1", "Total Budget Cost")}<c r="B1"><v>{amount}</v></c></row><row r="2">{inline("A2", "Total Earned Value")}<c r="B2"><v>{amount*.8}</v></c></row><row r="3">{inline("A3", "Total Actual Cost")}<c r="B3"><v>{amount*.7}</v></c></row></sheetData></worksheet>'''
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types); z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", workbook); z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        z.writestr("xl/worksheets/sheet1.xml", metadata_xml); z.writestr("xl/worksheets/sheet2.xml", dashboard)


class MetadataParsingTests(unittest.TestCase):
    def test_visible_and_hidden_metadata_are_detected_from_columns_a_b(self):
        for state in ("visible", "hidden"):
            with self.subTest(state=state):
                parsed = extract_metadata([_metadata(sap="001245", code="SAP/A-440", state=state)])
                self.assertTrue(parsed["sheet_found"]); self.assertEqual(parsed["sheet_state"], state)
                self.assertEqual(parsed["project_sap_id"], "001245"); self.assertEqual(parsed["project_code"], "SAP/A-440")

    def test_identifier_strings_and_numeric_display_formats_are_preserved(self):
        cases = [
            (_cell(1, 2, 1245, number_format="000000"), "001245"),
            (_cell(1, 2, "ABC/2026-04"), "ABC/2026-04"),
            (_cell(1, 2, "P#001-A"), "P#001-A"),
            (_cell(1, 2, "SAP-001"), "SAP-001"),
        ]
        for cell, expected in cases:
            with self.subTest(expected=expected): self.assertEqual(identifier_from_cell(cell), expected)

    def test_supported_date_representations_and_excel_serials(self):
        cases = [
            ("3/14/12", "2012-03-14"), ("2012-03-14", "2012-03-14"),
            ("14-Mar-2012", "2012-03-14"), ("14/03/2012", "2012-03-14"), ("14.03.2012", "2012-03-14"),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw): self.assertEqual(parse_date_cell({"value": raw})[0], expected)
        self.assertEqual(parse_date_cell({"value": 40982, "is_date_format": True})[0], "2012-03-14")
        self.assertIn("ambiguous", parse_date_cell({"value": "03/04/2012"})[1])

    def test_real_xlsx_metadata_sheet_visible_and_hidden(self):
        for hidden in (False, True):
            with tempfile.TemporaryDirectory() as td:
                path = Path(td) / "source.xlsx"; _write_xlsx(path, hidden=hidden)
                wb = XlsxWorkbook(path)
                try: parsed = extract_metadata([wb.read_sheet(s) for s in wb.sheets])
                finally: wb.close()
                self.assertEqual(parsed["sheet_state"], "hidden" if hidden else "visible")
                self.assertEqual(parsed["reporting_period"], "2026-01-01_to_2026-01-31")


class IdentityDecisionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.out = Path(self.tmp.name) / "public" / "generated"
        save_identity_registry(self.out, {"schema_version": 1, "projects": [
            {"internal_project_id": "one", "project_sap_id": "SAP-1", "project_code": "CODE-1", "project_name": "One"},
            {"internal_project_id": "two", "project_sap_id": "SAP-2", "project_code": "CODE-2", "project_name": "Two"},
        ]})
    def tearDown(self): self.tmp.cleanup()
    def resolve(self, sap, code): return resolve_identity(self.out, extract_metadata([_metadata(sap=sap, code=code)]))

    def test_exact_pair_and_single_identifier_existing_cases(self):
        self.assertEqual(self.resolve("SAP-1", "CODE-1")["project_id"], "one")
        self.assertEqual(self.resolve("SAP-1", None)["project_id"], "one")
        self.assertEqual(self.resolve(None, "CODE-2")["project_id"], "two")

    def test_new_pair_and_single_identifier_cases(self):
        for sap, code in (("SAP-NEW", "CODE-NEW"), ("SAP-ONLY", None), (None, "CODE-ONLY")):
            with self.subTest(sap=sap, code=code): self.assertEqual(self.resolve(sap, code)["status"], "new")

    def test_all_critical_conflict_combinations(self):
        for sap, code in (("SAP-NEW", "CODE-1"), ("SAP-1", "CODE-NEW"), ("SAP-1", "CODE-2")):
            with self.subTest(sap=sap, code=code): self.assertEqual(self.resolve(sap, code)["status"], "conflict")

    def test_both_identifiers_missing_is_unresolved(self):
        self.assertEqual(self.resolve(None, None)["status"], "unresolved")

    def test_legacy_same_name_requires_controlled_migration_instead_of_duplicate(self):
        registry = load_identity_registry(self.out)
        registry["projects"].append({"internal_project_id": "legacy", "project_name": "Legacy Name", "project_sap_id": None, "project_code": None})
        save_identity_registry(self.out, registry)
        outcome = resolve_identity(self.out, extract_metadata([_metadata(sap="NEW-SAP", code="NEW-CODE", name="Legacy Name")]))
        self.assertEqual(outcome["status"], "unresolved")
        self.assertIn("migration", outcome["reason"].lower())


class PersistenceAndIsolationTests(unittest.TestCase):
    def test_new_month_and_same_period_revision_preserve_history_after_input_deletion(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "public" / "generated"
            jan = root / "jan.xlsx"; _write_xlsx(jan, start="2026-01-01", finish="2026-01-31", amount=100)
            first = parse_workbook(jan, out); jan_fp = first["source"]["sha256"]; jan.unlink()
            feb = root / "feb.xlsx"; _write_xlsx(feb, start="2026-02-01", finish="2026-02-28", amount=200)
            second = parse_workbook(feb, out)
            self.assertEqual(first["project_id"], second["project_id"])
            self.assertTrue((out / "projects" / first["project_id"] / "history" / first["reporting_period"] / f"{jan_fp}.json").exists())
            revised = root / "feb-revised.xlsx"; _write_xlsx(revised, start="2026-02-01", finish="2026-02-28", amount=250)
            third = parse_workbook(revised, out)
            period_dir = out / "projects" / first["project_id"] / "history" / second["reporting_period"]
            self.assertTrue((period_dir / f"{second['source']['sha256']}.json").exists())
            self.assertTrue((period_dir / f"{third['source']['sha256']}.json").exists())
            self.assertEqual(json.loads((period_dir / "latest.json").read_text())["source"]["sha256"], third["source"]["sha256"])

    def test_conflict_does_not_update_existing_project_or_registry(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "public" / "generated"
            good = root / "good.xlsx"; _write_xlsx(good); valid = parse_workbook(good, out)
            latest = out / "projects" / valid["project_id"] / "latest.json"; before = latest.read_bytes()
            conflict = root / "conflict.xlsx"; _write_xlsx(conflict, sap="SAP-NEW", code="CODE/1", amount=999)
            blocked = parse_workbook(conflict, out)
            self.assertEqual(blocked["status"], "identity_conflict"); self.assertFalse(blocked["published_project"])
            self.assertEqual(latest.read_bytes(), before)
            self.assertEqual(len(load_identity_registry(out)["projects"]), 1)
            alerts = json.loads((out / "identity-conflicts.json").read_text())
            self.assertEqual(alerts[0]["severity"], "critical")
            evidence_copy = root / alerts[0]["evidence"]["local_evidence_copy"]
            self.assertTrue(evidence_copy.exists())
            self.assertEqual(evidence_copy.read_bytes(), conflict.read_bytes())

    def test_new_project_enters_registry_and_portfolio_automatically(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); out = root / "public" / "generated"; src = root / "new.xlsx"
            _write_xlsx(src, sap="P#001-A", code="ABC/2026-04", name="Automatic Project")
            summary = parse_workbook(src, out); portfolio = regenerate_portfolio(out)
            self.assertIn(summary["project_id"], [p["internal_project_id"] for p in load_identity_registry(out)["projects"]])
            self.assertIn(summary["project_id"], [p["project_id"] for p in portfolio["projects"]])
            raw = json.loads((Path(td) / "public" / summary["manifest"]["sheets"][0]["raw_path"].lstrip("/")).read_text())
            self.assertEqual(raw["identity"]["project_sap_id"], "P#001-A")


if __name__ == "__main__":
    unittest.main()
