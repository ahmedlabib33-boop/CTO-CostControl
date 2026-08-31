import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
MASTERY = (ROOT / "src/components/EngOllaMastery.tsx").read_text(encoding="utf-8")
LIVE = (ROOT / "src/components/LiveProjectIntelligence.tsx").read_text(encoding="utf-8")
ENGINE = (ROOT / "src/lib/liveIntelligence.ts").read_text(encoding="utf-8")
WORKER = (ROOT / "src/workers/intelligence.worker.ts").read_text(encoding="utf-8")
PORTFOLIO = (ROOT / "src/components/PortfolioWorkspace.tsx").read_text(encoding="utf-8")
RISK = (ROOT / "src/components/PortfolioRisk.tsx").read_text(encoding="utf-8")
RISK_ENGINE = (ROOT / "src/lib/portfolioRisk.ts").read_text(encoding="utf-8")
CSS = (ROOT / "src/app/globals.css").read_text(encoding="utf-8")


class LiveIntelligenceIntegrationTests(unittest.TestCase):
    def test_existing_trick_triggers_and_mastery_are_preserved(self):
        self.assertIn('const masteryExpected=mastery[masterySeq.current]', DASHBOARD)
        self.assertIn('masteryTaps.current.length>=3', DASHBOARD)
        self.assertIn('I Really Hope You Feel Satisfied', MASTERY)
        self.assertIn('Live Project Intelligence', MASTERY)
        self.assertIn('OLLA_MODULES.map', MASTERY)

    def test_live_context_and_scope_are_wired(self):
        self.assertIn('INTELLIGENCE_CONTEXT_EVENT', DASHBOARD)
        self.assertIn('intelligenceContext={context}', DASHBOARD)
        self.assertIn('Current page', LIVE)
        self.assertIn('Whole project', LIVE)
        self.assertIn('Portfolio', LIVE)
        self.assertIn('Entire app', LIVE)
        self.assertIn('buildApplicationDescriptors', LIVE)
        self.assertIn('rechecked every 15 seconds', LIVE)

    def test_no_fabrication_and_scope_controls_exist(self):
        self.assertIn('Missing-data guard', ENGINE)
        self.assertIn('No-target safeguard', ENGINE)
        self.assertIn('Unable to assess.', ENGINE)
        self.assertIn('not source facts', ENGINE)
        self.assertIn('Source JSON is never changed', LIVE)
        self.assertIn('No accuracy percentage is invented', LIVE)
        self.assertIn('Exact source match', LIVE)
        self.assertNotIn('% evidence', LIVE)

    def test_ml_is_local_only_and_has_fallback(self):
        self.assertIn('env.allowRemoteModels = false', WORKER)
        self.assertIn('env.allowLocalModels = true', WORKER)
        self.assertTrue((ROOT / "public/models/wasm/ort-wasm-simd-threaded.jsep.mjs").exists())
        self.assertTrue((ROOT / "public/models/wasm/ort-wasm-simd-threaded.mjs").exists())
        self.assertIn('WASM fallback', WORKER)
        self.assertIn('type: "fallback"', WORKER)
        self.assertIn('extractor.dispose()', WORKER)

    def test_responsive_status_and_policy_ui_exist(self):
        self.assertIn('.liveInsightCard.critical', CSS)
        self.assertIn('.liveInsightCard.favorable', CSS)
        self.assertIn('@media(max-width:600px)', CSS)
        self.assertIn('Export JSON', LIVE)
        self.assertIn('Import JSON', LIVE)
        self.assertIn('Reset defaults', LIVE)

    def test_portfolio_risk_is_a_peer_tab_with_controlled_data(self):
        self.assertIn('setPortfolioTab("risk")', PORTFOLIO)
        self.assertIn('<PortfolioRisk', PORTFOLIO)
        self.assertIn('view:"risk"', PORTFOLIO)
        self.assertIn('buildPortfolioRiskReport(context, policy)', RISK)
        self.assertIn('No adverse risk detected from available evidence', RISK)

    def test_management_settings_require_clear_then_save(self):
        self.assertIn('Using default risk policy', RISK)
        self.assertIn('Clear for Replacement', RISK)
        self.assertIn('Save Policy', RISK)
        self.assertIn('The saved policy remains active. These draft answers affect nothing until Save Policy.', RISK)
        self.assertIn('localStorage.setItem(PORTFOLIO_RISK_SETTINGS_KEY', RISK)
        self.assertIn('riskPolicyFromAnswers', RISK_ENGINE)

    def test_project_risk_is_not_hidden_and_scenarios_are_separate(self):
        self.assertIn('buildSelectedProjectDescriptors', RISK_ENGINE)
        self.assertIn('const projectDescriptors = buildSelectedProjectDescriptors(context)', RISK_ENGINE)
        self.assertIn('Scenario exposure', RISK)
        self.assertIn('What-if only', RISK)
        self.assertIn('item.semanticType === "scenario"', RISK_ENGINE)
        self.assertIn('.portfolioTabNav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))', CSS)
        self.assertIn('@media(max-width:780px)', CSS)


if __name__ == "__main__":
    unittest.main()
