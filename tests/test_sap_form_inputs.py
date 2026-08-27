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
