import json
import tempfile
import unittest
from pathlib import Path

from watcher.watch import scan
from watcher.xlsx_engine import open_source_document, parse_workbook


METADATA = {
    "PROJECT_SAP_ID": "SAP-OT-001",
    "PROJECT_CODE": "FORM/2026",
    "PROJECT_NAME": "SAP Form Project",
    "REPORT_START": "2026-07-01",
    "REPORT_FINISH": "2026-07-31",
    "PROJECT_START": "2025-01-01",
    "PROJECT_FINISH": "2026-12-31",
    "PROJECT_FINISH_EOT": "2027-02-15",
}


def _xsf() -> str:
    symbols = "".join(f'<sym name="{key}">{value}</sym>' for key, value in METADATA.items())
    return f'<?xml version="1.0" encoding="UTF-8"?><XSF>{symbols}<sym name="TOTAL_BUDGET_COST">1250</sym></XSF>'


def _xdf() -> str:
    fields = "".join(f"<{key}>{value}</{key}>" for key, value in METADATA.items())
    return f'<?xml version="1.0" encoding="UTF-8"?><XDF><PROJECT>{fields}<TOTAL_ACTUAL_COST>900</TOTAL_ACTUAL_COST></PROJECT></XDF>'


def _xdf_workbook() -> str:
    return '''<?xml version="1.0" encoding="UTF-8"?>
<XDF><METADATA>
<PROJECT_SAP_ID>SAP-WB-002</PROJECT_SAP_ID><PROJECT_CODE>WB02</PROJECT_CODE>
<PROJECT_NAME>XDF Workbook Project</PROJECT_NAME><REPORT_START>01-Jun-26</REPORT_START>
<REPORT_FINISH>30-Jun-26</REPORT_FINISH><PROJECT_START>11-Sep-26</PROJECT_START>
<PROJECT_FINISH>10-Apr-27</PROJECT_FINISH><PROJECT_FINISH_EOT></PROJECT_FINISH_EOT>
</METADATA><WORKBOOK><SHEET name="Dashboard" state="visible">
<ROW index="1"><A ref="A1">Total Budget Cost</A><B ref="B1">1500</B></ROW>
<ROW index="2"><A ref="A2">Earned Value</A><B ref="B2">1100</B></ROW>
<ROW index="3"><A ref="A3">Actual Cost</A><B ref="B3">900</B></ROW>
</SHEET></WORKBOOK></XDF>'''


def _html() -> str:
    rows = "".join(f"<tr><td>{key}</td><td>{value}</td></tr>" for key, value in METADATA.items())
    return f"<html><body><table>{rows}<tr><td>Earned Value</td><td>1000</td></tr></table></body></html>"


def _otf() -> str:
    rows = "\n".join(f"TX {key}: {value}" for key, value in METADATA.items())
    return rows + "\nTX Total Budget Cost: 1250\n"


class SapFormInputTests(unittest.TestCase):
    def test_all_sap_form_formats_create_isolated_project_json(self):
        sources = {".xsf": _xsf(), ".xdf": _xdf(), ".html": _html(), ".otf": _otf()}
        for suffix, content in sources.items():
            with self.subTest(suffix=suffix), tempfile.TemporaryDirectory() as td:
                root = Path(td)
                source = root / f"source{suffix}"
                source.write_text(content, encoding="utf-8")
                output = root / "public" / "generated"
                summary = parse_workbook(source, output)
                self.assertTrue(summary["published_project"])
                self.assertEqual(summary["source"]["format"], suffix.lstrip("."))
                self.assertEqual(summary["identity"]["project_sap_id"], "SAP-OT-001")
                self.assertEqual(summary["identity"]["project_finish_eot"], "2027-02-15")
                self.assertEqual(summary["reporting_period"], "2026-07-01_to_2026-07-31")
                normalized_path = root / "public" / summary["normalized_path"].lstrip("/")
                normalized = json.loads(normalized_path.read_text(encoding="utf-8"))
                self.assertEqual(normalized["normalization_mode"], "adaptive_universal")
                self.assertGreaterEqual(normalized["counts"]["meaningful_sheets"], 1)

    def test_xml_extension_requires_xsf_or_xdf_root(self):
        with tempfile.TemporaryDirectory() as td:
            source = Path(td) / "not-sap.xml"
            source.write_text("<ROOT><PROJECT_CODE>X</PROJECT_CODE></ROOT>", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "expected an SAP XSF or XDF"):
                open_source_document(source)

    def test_streamed_xdf_workbook_preserves_sheets_cells_and_sap_dates(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "workbook.xml"
            source.write_text(_xdf_workbook(), encoding="utf-8")
            summary = parse_workbook(source, root / "public" / "generated")
            self.assertTrue(summary["published_project"])
            self.assertEqual(summary["reporting_period"], "2026-06-01_to_2026-06-30")
            self.assertEqual(summary["identity"]["project_start"], "2026-09-11")
            self.assertEqual(summary["identity"]["project_finish"], "2027-04-10")
            self.assertEqual(summary["manifest"]["sheet_count"], 2)
            self.assertEqual(summary["manifest"]["sheets"][1]["name"], "Dashboard")
            self.assertEqual(summary["metrics"]["budget"]["preferred"]["value"], 1500)

    def test_large_xdf_sheet_is_preserved_in_publishable_audit_chunks(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "large.xml"
            rows = "".join(f'<ROW index="{i}"><A ref="A{i}">Value {i}</A></ROW>' for i in range(1, 6002))
            source.write_text(
                '<?xml version="1.0"?><XDF><METADATA>'
                '<PROJECT_SAP_ID>SAP-LARGE</PROJECT_SAP_ID><PROJECT_CODE>LARGE01</PROJECT_CODE>'
                '<PROJECT_NAME>Large XDF</PROJECT_NAME><REPORT_START>01-Jun-26</REPORT_START>'
                '<REPORT_FINISH>30-Jun-26</REPORT_FINISH></METADATA>'
                f'<WORKBOOK><SHEET name="Large Sheet">{rows}</SHEET></WORKBOOK></XDF>',
                encoding="utf-8",
            )
            summary = parse_workbook(source, root / "public" / "generated")
            manifest = next(item for item in summary["manifest"]["sheets"] if item["name"] == "Large Sheet")
            primary = json.loads((root / "public" / manifest["raw_path"].lstrip("/")).read_text(encoding="utf-8"))
            self.assertTrue(primary["sheet"]["cells_chunked"])
            self.assertEqual(primary["sheet"]["cell_count"], 6001)
            self.assertEqual(len(primary["sheet"]["cells"]), 5000)
            self.assertEqual(len(primary["cell_chunks"]), 1)
            chunk = json.loads((root / "public" / primary["cell_chunks"][0].lstrip("/")).read_text(encoding="utf-8"))
            self.assertEqual(len(chunk["cells"]), 6001)

    def test_source_without_embedded_metadata_is_blocked_without_project_json(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / "no-metadata.otf"
            source.write_text("TX Total Budget Cost: 1250", encoding="utf-8")
            output = root / "public" / "generated"
            summary = parse_workbook(source, output)
            self.assertFalse(summary["published_project"])
            self.assertEqual(summary["status"], "identity_unresolved")
            self.assertFalse((output / "projects").exists())

    def test_watcher_scan_accepts_all_supported_extensions(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            expected = {"a.xlsx", "b.xlsm", "c.otf", "d.xsf", "e.xdf", "f.xml", "g.html", "h.htm"}
            for name in expected | {"ignore.pdf"}:
                (root / name).write_bytes(b"x")
            self.assertEqual({path.name for path in scan(root)}, expected)


if __name__ == "__main__":
    unittest.main()
