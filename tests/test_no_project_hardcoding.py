import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEARCH_ROOTS = [ROOT / "src", ROOT / "watcher"]
FORBIDDEN = ["THE BIG", "GLORIA", "the-big", "gloria"]

class NoProjectHardcodingTests(unittest.TestCase):
    def test_runtime_source_has_no_sample_project_branches(self):
        hits = []
        for base in SEARCH_ROOTS:
            for path in base.rglob("*"):
                if path.suffix.lower() not in {".py", ".ts", ".tsx", ".js", ".jsx"}:
                    continue
                text = path.read_text(encoding="utf-8", errors="ignore")
                for token in FORBIDDEN:
                    if token in text:
                        hits.append(f"{path.relative_to(ROOT)} -> {token}")
        self.assertEqual(hits, [], "Project-specific names found in runtime source:\n" + "\n".join(hits))

if __name__ == "__main__":
    unittest.main()
