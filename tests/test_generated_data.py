import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "public" / "generated"

class GeneratedDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.projects = json.loads((GEN / "projects.json").read_text(encoding="utf-8"))

    def test_registry_has_unique_projects(self):
        ids = [p["project_id"] for p in self.projects]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(ids), 2)

    def test_project_isolation_and_completeness(self):
        for p in self.projects:
            pid = p["project_id"]
            data = json.loads((GEN / "projects" / pid / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual(data["project_id"], pid)
            self.assertEqual(data["manifest"]["sheet_count"], len(data["manifest"]["sheets"]))
            self.assertEqual(data["manifest"]["unaccounted_sheets"], 0)
            for sheet in data["manifest"]["sheets"]:
                raw_path = ROOT / "public" / sheet["raw_path"].lstrip("/")
                self.assertTrue(raw_path.exists(), raw_path)
                raw = json.loads(raw_path.read_text(encoding="utf-8"))
                self.assertEqual(raw["project_id"], pid)
                self.assertEqual(raw["source_fingerprint"], data["source"]["sha256"])

    def test_sample_workbooks_are_structurally_different(self):
        shapes = {(p["sheet_count"], p["chart_count"]) for p in self.projects}
        self.assertGreaterEqual(len(shapes), 2)

    def test_portfolio_cv_and_cpi_are_derived_from_project_ev_ac(self):
        for p in self.projects:
            ev = p["metrics"].get("earned_value")
            ac = p["metrics"].get("actual_cost")
            if ev is not None and ac:
                self.assertAlmostEqual(p["metrics"]["cost_variance"], ev - ac, places=4)
                self.assertAlmostEqual(p["metrics"]["cpi"], ev / ac, places=8)

if __name__ == "__main__":
    unittest.main()

class ApprovedParityTests(unittest.TestCase):
    def test_exact_approved_normalized_payloads_are_retained(self):
        index = json.loads((ROOT / "docs" / "parity" / "data" / "index.json").read_text(encoding="utf-8"))
        by_fp = {p["source_fingerprint"]: p for p in json.loads((GEN / "projects.json").read_text(encoding="utf-8"))}
        for entry in index:
            fp = entry["source_sha256"]
            self.assertIn(fp, by_fp, f"approved fixture not represented in generated registry: {entry['source_file']}")
            reg = by_fp[fp]
            self.assertTrue(reg.get("approved_parity"))
            latest = json.loads((GEN / "projects" / reg["project_id"] / "latest.json").read_text(encoding="utf-8"))
            normalized_path = latest.get("normalized_path")
            self.assertTrue(normalized_path)
            generated = json.loads((ROOT / "public" / normalized_path.lstrip("/")).read_text(encoding="utf-8"))
            approved = json.loads((ROOT / entry["data_file"]).read_text(encoding="utf-8"))
            self.assertEqual(generated, approved, f"approved normalized parity payload changed for {entry['source_file']}")
