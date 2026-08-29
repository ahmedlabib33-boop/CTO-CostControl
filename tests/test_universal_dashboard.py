from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class UniversalDashboardTests(unittest.TestCase):
    def test_every_project_uses_five_families_with_focused_pages(self):
        views = (ROOT / "src/lib/projectViews.ts").read_text(encoding="utf-8")
        project = (ROOT / "src/components/ProjectWorkspace.tsx").read_text(encoding="utf-8")
        families = ["Executive", "Forecast Engineering", "Cost Structure", "Ledger & Controls", "Source & Assurance"]
        positions = [views.index(f'label: "{label}"') for label in families]
        self.assertEqual(positions, sorted(positions))
        page_ids = [
            "executive-overview", "executive-commercial", "executive-resources",
            "forecast-performance", "forecast-boq-actual", "forecast-boq-outlook",
            "structure-direct", "structure-indirect", "structure-allocation",
            "ledger-analytics", "ledger-transactions", "ledger-codes",
            "assurance-quality", "assurance-mapping", "assurance-workbooks", "assurance-visuals",
        ]
        for page_id in page_ids:
            self.assertIn(page_id, views)
        self.assertEqual(views.count("pages: ["), 5)
        self.assertIn('className="familyNav"', project)
        self.assertIn('className="pageNav"', project)
        self.assertIn('view.startsWith("forecast-")', project)
        self.assertIn('view.startsWith("structure-")', project)
        for page_id in ["executive-overview", "executive-commercial", "executive-resources", "ledger-analytics", "ledger-transactions", "ledger-codes", "assurance-quality", "assurance-mapping", "assurance-workbooks", "assurance-visuals"]:
            self.assertIn(page_id, project)

    def test_missing_data_keeps_standard_shells_and_renders_professional_empty_state(self):
        project = (ROOT / "src/components/ProjectWorkspace.tsx").read_text(encoding="utf-8")
        charts = (ROOT / "src/components/Charts.tsx").read_text(encoding="utf-8")
        self.assertIn("const standardNorm=norm||{}", project)
        self.assertIn("Source data unavailable for this reporting period.", charts)
        self.assertNotIn('view==="forecast-performance"&&(norm?', project)
        self.assertNotIn('view==="ledger-analytics"&&(norm?', project)

    def test_identity_alert_precedes_normal_data_quality_tables(self):
        dashboard = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
        render = dashboard[dashboard.index('tab==="intelligence"'):]
        self.assertLess(render.index("IdentityConflictAlerts"), render.index("MonthlyHistory"))
        alerts = (ROOT / "src/components/PortfolioWorkspace.tsx").read_text(encoding="utf-8")
        self.assertIn("CRITICAL IDENTITY CONTROL", alerts)
        self.assertIn("identityAlert", alerts)


if __name__ == "__main__":
    unittest.main()
