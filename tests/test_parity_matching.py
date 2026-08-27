import json
import tempfile
import unittest
from pathlib import Path

from watcher.xlsx_engine import build_adaptive_normalized, load_parity_reference, semantic_workbook_fingerprint


def sheet(name, value, style_id):
    return {
        "name": name,
        "cells": [{"ref": "A1", "value": value, "formula": None, "style_id": style_id}],
    }


class ParityMatchingTests(unittest.TestCase):
    def test_universal_contract_survives_when_all_cost_data_is_unavailable(self):
        normalized = build_adaptive_normalized(
            {"project_name": "Metadata Only", "reporting_period": "2026-01-01_to_2026-01-31"},
            {},
            [{"name": "metadata", "state": "visible", "dimension": "A1:B5", "cell_count": 10, "cells": [], "charts": []}],
        )
        self.assertEqual(normalized["normalization_mode"], "adaptive_universal")
        self.assertIsNone(normalized["kpis"]["total_budget_cost"])
        self.assertEqual(normalized["project_items"], [])
        self.assertEqual(normalized["cashflow"], [])
        self.assertEqual(normalized["cost_codes"], [])
        self.assertEqual(len(normalized["source_inventory"]), 1)

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
