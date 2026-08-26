import tempfile
import unittest
from pathlib import Path

from test_metadata_identity import _write_xlsx
from watcher.restore_history import restore


ROOT = Path(__file__).resolve().parents[1]


class RestoreHistoryTests(unittest.TestCase):
    def test_restore_adds_old_periods_keeps_newest_latest_and_skips_existing_fingerprints(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); old = root / "Old workbooks"
            old.mkdir()
            _write_xlsx(old / "01-january.xlsx", start="2026-01-01", finish="2026-01-31", amount=100)
            _write_xlsx(old / "02-february.xlsx", start="2026-02-01", finish="2026-02-28", amount=200)
            first = restore(root, old)
            self.assertEqual(len(first["restored"]), 2)
            project_id = first["restored"][0]["project_id"]
            latest = root / "public" / "generated" / "projects" / project_id / "latest.json"
            before = latest.read_bytes()
            self.assertIn(b"2026-02-01_to_2026-02-28", before)
            second = restore(root, old)
            self.assertEqual(len(second["restored"]), 0)
            self.assertEqual(len(second["already_present"]), 2)
            self.assertEqual(latest.read_bytes(), before)

    def test_restore_batch_is_local_only_and_old_workbooks_are_ignored(self):
        bat = (ROOT / "RESTORE_OLD_WORKBOOKS.bat").read_text(encoding="utf-8")
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("watcher.restore_history", bat)
        self.assertIn("does NOT publish", bat)
        self.assertNotIn("git push", bat.lower())
        self.assertIn("Old workbooks/", ignore)


if __name__ == "__main__":
    unittest.main()
