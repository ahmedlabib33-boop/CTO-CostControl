from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
PORTFOLIO = (ROOT / "src/components/PortfolioWorkspace.tsx").read_text(encoding="utf-8")


class ScopeEquationTests(unittest.TestCase):
    def test_selected_scope_displays_its_exact_equation(self):
        self.assertIn("Selected equation:", PORTFOLIO)
        self.assertIn("Operational Scope = Direct + Indirect", PORTFOLIO)
        self.assertIn("Full Project Scope = Direct + Indirect + Fees/Sponsorship charges", PORTFOLIO)
        self.assertIn('scope==="dashboard"?', PORTFOLIO)


if __name__ == "__main__":
    unittest.main()
