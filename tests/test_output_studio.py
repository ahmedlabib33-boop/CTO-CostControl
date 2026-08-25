from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class OutputStudioTests(unittest.TestCase):
    def test_output_studio_report_contract(self):
        src = (ROOT / "src/components/OutputStudio.tsx").read_text(encoding="utf-8")
        for name in [
            "SAP Cost Executive Report",
            "SAP Cost Detailed Report",
            "Cost Control Pack",
            "Monthly Cost Comparison",
            "Cost Reconciliation & Data Quality Report",
            "CTO Portfolio Cost Review",
            "Download Interactive HTML",
            "Export PDF",
            'option>A4</option>',
            'option>A3</option>',
            'value="portrait"',
            'value="landscape"',
            "Period / Revision",
        ]:
            self.assertIn(name, src)
        dashboard = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
        self.assertIn('label:"Output Studio"', dashboard)

    def test_output_studio_has_no_sample_project_branches(self):
        src = (ROOT / "src/components/OutputStudio.tsx").read_text(encoding="utf-8").lower()
        self.assertNotIn('the-big', src)
        self.assertNotIn('the big', src)
        self.assertNotIn('gloria', src)

if __name__ == "__main__":
    unittest.main()
