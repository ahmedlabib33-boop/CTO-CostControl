from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class RepoLastModifiedTests(unittest.TestCase):
    def test_timestamp_comes_from_deployed_repository_commit(self):
        route = (ROOT / "src/app/api/repo-last-modified/route.ts").read_text(encoding="utf-8")
        component = (ROOT / "src/components/RepoLastModified.tsx").read_text(encoding="utf-8")
        dashboard = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
        self.assertIn("VERCEL_GIT_COMMIT_SHA", route)
        self.assertIn("payload.commit?.committer?.date", route)
        self.assertIn("Last modified from repo", component)
        self.assertIn("<RepoLastModified/>", dashboard)
        self.assertNotIn("NEXT_PUBLIC_", route)


if __name__ == "__main__":
    unittest.main()
