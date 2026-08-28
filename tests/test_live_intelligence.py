import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
MASTERY = (ROOT / "src/components/EngOllaMastery.tsx").read_text(encoding="utf-8")
LIVE = (ROOT / "src/components/LiveProjectIntelligence.tsx").read_text(encoding="utf-8")
ENGINE = (ROOT / "src/lib/liveIntelligence.ts").read_text(encoding="utf-8")
WORKER = (ROOT / "src/workers/intelligence.worker.ts").read_text(encoding="utf-8")
CSS = (ROOT / "src/app/globals.css").read_text(encoding="utf-8")


class LiveIntelligenceIntegrationTests(unittest.TestCase):
    def test_existing_trick_triggers_and_mastery_are_preserved(self):
        self.assertIn('const expected=String(seq.current+1)', DASHBOARD)
        self.assertIn('taps.current.length>=3', DASHBOARD)
        self.assertIn('I Really Hope You Feel Satisfied', MASTERY)
        self.assertIn('Live Project Intelligence', MASTERY)
        self.assertIn('OLLA_MODULES.map', MASTERY)

    def test_live_context_and_scope_are_wired(self):
        self.assertIn('INTELLIGENCE_CONTEXT_EVENT', DASHBOARD)
        self.assertIn('intelligenceContext={context}', DASHBOARD)
        self.assertIn('Current page', LIVE)
        self.assertIn('Whole project', LIVE)
        self.assertIn('Portfolio', LIVE)

    def test_no_fabrication_and_scope_controls_exist(self):
        self.assertIn('Missing-data guard', ENGINE)
        self.assertIn('No-target safeguard', ENGINE)
        self.assertIn('Unable to assess.', ENGINE)
        self.assertIn('not source facts', ENGINE)
        self.assertIn('Source JSON is never changed', LIVE)

    def test_ml_is_local_only_and_has_fallback(self):
        self.assertIn('env.allowRemoteModels = false', WORKER)
        self.assertIn('env.allowLocalModels = true', WORKER)
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


if __name__ == "__main__":
    unittest.main()
