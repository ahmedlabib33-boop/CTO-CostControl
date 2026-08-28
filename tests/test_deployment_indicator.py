from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DeploymentIndicatorTests(unittest.TestCase):
    def test_indicator_uses_exact_copy_and_real_vercel_status(self):
        component = (ROOT / "src/components/DeploymentIndicator.tsx").read_text(encoding="utf-8")
        route = (ROOT / "src/app/api/deployment-status/route.ts").read_text(encoding="utf-8")
        self.assertIn("↑ uploading", component)
        self.assertIn('status.context || "").trim().toLowerCase() === "vercel"', route)
        self.assertIn('state === "pending"', route)
        self.assertNotIn("NEXT_PUBLIC_GITHUB", component + route)

    def test_token_is_server_only_and_unknown_never_uploads(self):
        component = (ROOT / "src/components/DeploymentIndicator.tsx").read_text(encoding="utf-8")
        route = (ROOT / "src/app/api/deployment-status/route.ts").read_text(encoding="utf-8")
        self.assertIn("process.env.GITHUB_STATUS_TOKEN", route)
        self.assertNotIn("GITHUB_STATUS_TOKEN", component)
        self.assertIn("revalidate: 8", route)
        self.assertIn("token ? FAST_POLL_MS : PUBLIC_POLL_MS", route)
        self.assertIn("poll_after_ms", component)
        self.assertIn("show_uploading: false", route)
        self.assertIn("A network/API failure must never create a false uploading state.", component)

    def test_indicator_is_global_responsive_and_reload_is_throttled(self):
        dashboard = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
        component = (ROOT / "src/components/DeploymentIndicator.tsx").read_text(encoding="utf-8")
        css = (ROOT / "src/app/globals.css").read_text(encoding="utf-8")
        self.assertEqual(dashboard.count("<DeploymentIndicator/>"), 2)
        self.assertIn("RELOAD_THROTTLE_MS", component)
        self.assertIn("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", component)
        self.assertIn("visibilitychange", component)
        self.assertIn(".deploymentUploading", css)
        self.assertIn("prefers-reduced-motion:reduce", css)


if __name__ == "__main__":
    unittest.main()
