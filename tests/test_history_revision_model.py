import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "public" / "generated"

class HistoryTests(unittest.TestCase):
    def test_revision_history_keeps_fingerprint_named_copy(self):
        projects = json.loads((GEN / "projects.json").read_text(encoding="utf-8"))
        for p in projects:
            latest = json.loads((GEN / "projects" / p["project_id"] / "latest.json").read_text(encoding="utf-8"))
            period = latest["reporting_period"]
            fp = latest["source"]["sha256"]
            history = GEN / "projects" / p["project_id"] / "history" / period / f"{fp}.json"
            period_latest = GEN / "projects" / p["project_id"] / "history" / period / "latest.json"
            self.assertTrue(history.exists())
            self.assertTrue(period_latest.exists())

if __name__ == "__main__":
    unittest.main()
