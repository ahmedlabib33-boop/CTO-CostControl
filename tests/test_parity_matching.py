import json
import tempfile
import unittest
from pathlib import Path

from watcher.xlsx_engine import load_parity_reference, semantic_workbook_fingerprint


def sheet(name, value, style_id):
    return {
        "name": name,
        "cells": [{"ref": "A1", "value": value, "formula": None, "style_id": style_id}],
    }


class ParityMatchingTests(unittest.TestCase):
    def test_semantic_fingerprint_ignores_metadata_and_style_renumbering(self):
        approved = [sheet("Dashboard", 100, 4)]
        with_metadata = [sheet("metadata", "Project One", 99), sheet("Dashboard", 100, 725)]
        self.assertEqual(semantic_workbook_fingerprint(approved), semantic_workbook_fingerprint(with_metadata))

    def test_semantic_match_loads_approved_payload_when_file_sha_changes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            data_dir = root / "docs" / "parity" / "data"
            data_dir.mkdir(parents=True)
            approved_sheets = [sheet("Dashboard", 100, 4)]
            current_sheets = [sheet("metadata", "Project One", 99), sheet("Dashboard", 100, 725)]
            payload = {"kpis": {"budget": 100}}
            (data_dir / "approved.json").write_text(json.dumps(payload), encoding="utf-8")
            (data_dir / "index.json").write_text(json.dumps([{
                "source_file": "source.xlsx",
                "source_sha256": "old-file-sha",
                "content_sha256": semantic_workbook_fingerprint(approved_sheets),
                "data_file": "docs/parity/data/approved.json",
            }]), encoding="utf-8")
            match = load_parity_reference(root, root / "source.xlsx", "new-file-sha", current_sheets)
            self.assertIsNotNone(match)
            self.assertEqual(match["match_mode"], "semantic_workbook_sha256")
            self.assertEqual(match["data"], payload)

    def test_changed_financial_value_does_not_reuse_approved_payload(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            data_dir = root / "docs" / "parity" / "data"
            data_dir.mkdir(parents=True)
            approved_sheets = [sheet("Dashboard", 100, 4)]
            (data_dir / "approved.json").write_text("{}", encoding="utf-8")
            (data_dir / "index.json").write_text(json.dumps([{
                "source_sha256": "old-file-sha",
                "content_sha256": semantic_workbook_fingerprint(approved_sheets),
                "data_file": "docs/parity/data/approved.json",
            }]), encoding="utf-8")
            self.assertIsNone(load_parity_reference(root, root / "source.xlsx", "new-file-sha", [sheet("Dashboard", 101, 4)]))


if __name__ == "__main__":
    unittest.main()
