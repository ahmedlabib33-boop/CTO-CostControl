from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class UniversalDashboardTests(unittest.TestCase):
    def test_every_project_uses_one_fixed_navigation_and_standard_component_order(self):
        src = (ROOT / "src/components/ProjectWorkspace.tsx").read_text(encoding="utf-8")
        nav = ["Executive Cost Position", "Cost & Forecast Engineering", "Cost Ledger & Controls", "Data Quality & Source Audit"]
        positions = [src.index(label) for label in nav]
        self.assertEqual(positions, sorted(positions))
        standard = ["ProjectSummaryWorkspace norm={standardNorm}", "Profitability norm={standardNorm}", "CashCharts norm={standardNorm}", "ResourceWasteBridge norm={standardNorm}"]
        standard_positions = [src.index(token) for token in standard]
        self.assertEqual(standard_positions, sorted(standard_positions))
        self.assertIn("CostForecastExplorer norm={standardNorm}", src)
        self.assertIn("ExpenseLedger norm={standardNorm}", src)

    def test_missing_data_keeps_standard_shells_and_renders_professional_empty_state(self):
        project = (ROOT / "src/components/ProjectWorkspace.tsx").read_text(encoding="utf-8")
        charts = (ROOT / "src/components/Charts.tsx").read_text(encoding="utf-8")
        self.assertIn("const standardNorm=norm||{}", project)
        self.assertIn("Source data unavailable for this reporting period.", charts)
        self.assertNotIn('view==="forecast"&&(norm?', project)
        self.assertNotIn('view==="ledger"&&(norm?', project)

    def test_identity_alert_precedes_normal_data_quality_tables(self):
        dashboard = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
        render = dashboard[dashboard.index('tab==="intelligence"'):]
        self.assertLess(render.index("IdentityConflictAlerts"), render.index("MonthlyHistory"))
        alerts = (ROOT / "src/components/PortfolioWorkspace.tsx").read_text(encoding="utf-8")
        self.assertIn("CRITICAL IDENTITY CONTROL", alerts)
        self.assertIn("identityAlert", alerts)


if __name__ == "__main__":
    unittest.main()
