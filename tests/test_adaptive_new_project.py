import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from watcher.xlsx_engine import parse_workbook, regenerate_portfolio


def _write_minimal_xlsx(path: Path) -> None:
    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>'''
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''
    workbook = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
<sheet name="Cover" sheetId="1" r:id="rId1"/>
<sheet name="Dashboard" sheetId="2" r:id="rId2"/>
<sheet name="Extra Intelligence" sheetId="3" r:id="rId3"/>
</sheets></workbook>'''
    wb_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
</Relationships>'''
    cover = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:A2"/><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Project Phoenix</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Cost Report August 2026</t></is></c></row>
</sheetData></worksheet>'''
    dashboard = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B3"/><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Total Budget Cost</t></is></c><c r="B1"><v>1000</v></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Total Earned Value</t></is></c><c r="B2"><v>700</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Total Actual Cost</t></is></c><c r="B3"><v>500</v></c></row>
</sheetData></worksheet>'''
    extra = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C4"/><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>New Category</t></is></c><c r="B1" t="inlineStr"><is><t>Description</t></is></c><c r="C1" t="inlineStr"><is><t>Value</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Alpha</t></is></c><c r="B2" t="inlineStr"><is><t>First future structure</t></is></c><c r="C2"><v>10</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Beta</t></is></c><c r="B3" t="inlineStr"><is><t>Second future structure</t></is></c><c r="C3"><v>20</v></c></row>
<row r="4"><c r="A4" t="inlineStr"><is><t>Gamma</t></is></c><c r="B4" t="inlineStr"><is><t>Third future structure</t></is></c><c r="C4"><v>30</v></c></row>
</sheetData></worksheet>'''
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", workbook)
        z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        z.writestr("xl/worksheets/sheet1.xml", cover)
        z.writestr("xl/worksheets/sheet2.xml", dashboard)
        z.writestr("xl/worksheets/sheet3.xml", extra)


class AdaptiveNewProjectTests(unittest.TestCase):
    def test_unknown_project_variable_structure_is_created_and_accounted(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "anything.xlsx"
            out = root / "public" / "generated"
            _write_minimal_xlsx(source)
            summary = parse_workbook(source, out)
            self.assertEqual(summary["project_id"], "project-phoenix")
            self.assertEqual(summary["reporting_period"], "2026-08")
            self.assertEqual(summary["manifest"]["sheet_count"], 3)
            self.assertEqual(summary["manifest"]["unaccounted_sheets"], 0)
            self.assertGreaterEqual(summary["manifest"]["detected_table_count"], 1)
            # This intentionally sparse workbook has no ledger/cashflow, and they must stay unavailable.
            self.assertFalse(summary["capabilities"]["ledger"])
            self.assertFalse(summary["capabilities"]["cashflow"])
            self.assertAlmostEqual(summary["metrics"]["derived_cpi"], 1.4)
            self.assertAlmostEqual(summary["metrics"]["derived_cv"], 200.0)
            registry = regenerate_portfolio(out)
            self.assertEqual(registry["project_count"], 1)
            self.assertEqual(registry["projects"][0]["project_id"], "project-phoenix")
            extra_manifest = next(s for s in summary["manifest"]["sheets"] if s["name"] == "Extra Intelligence")
            raw = root / "public" / extra_manifest["raw_path"].lstrip("/")
            payload = json.loads(raw.read_text(encoding="utf-8"))
            self.assertEqual(payload["project_id"], "project-phoenix")
            self.assertGreaterEqual(len(payload["detected_tables"]), 1)
            values = [c.get("value") for c in payload["sheet"]["cells"]]
            self.assertIn("Third future structure", values)


if __name__ == "__main__":
    unittest.main()
