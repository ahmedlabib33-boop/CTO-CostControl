import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
MASTERY = (ROOT / "src/components/EngOllaMastery.tsx").read_text(encoding="utf-8")
CONTENT = (ROOT / "src/lib/ollaMasteryContent.ts").read_text(encoding="utf-8")
CSS = (ROOT / "src/app/globals.css").read_text(encoding="utf-8")


class EngOllaMasteryTests(unittest.TestCase):
    def test_original_hidden_triggers_are_preserved(self):
        self.assertIn('const expected=String(seq.current+1)', DASHBOARD)
        self.assertIn('if(e.key===expected)', DASHBOARD)
        self.assertIn('if(seq.current===5)', DASHBOARD)
        self.assertIn('e.pointerType!=="touch"', DASHBOARD)
        self.assertIn('taps.current.length>=3', DASHBOARD)
        self.assertIn('window.addEventListener("pointerup",touch', DASHBOARD)

    def test_content_is_data_driven_and_has_exact_question_count(self):
        base_ids = re.findall(r'id: "(M[12]-Q\d{2})"', CONTENT)
        ceo_content = (ROOT / "src/lib/ollaCeoMasteryContent.ts").read_text(encoding="utf-8")
        ceo_ids = re.findall(r'id: "(M3-Q\d{2})"', ceo_content)
        ids = base_ids + ceo_ids
        self.assertEqual(66, len(ids))
        self.assertEqual(66, len(set(ids)))
        self.assertEqual(12, len([item for item in ids if item.startswith("M1-")]))
        self.assertEqual(12, len([item for item in ids if item.startswith("M2-")]))
        self.assertEqual(42, len([item for item in ids if item.startswith("M3-")]))
        self.assertIn("export const MAX_QUESTIONS_PER_PAGE = 3", CONTENT)
        self.assertIn("slice(page*MAX_QUESTIONS_PER_PAGE", MASTERY)

    def test_ceo_visual_module_is_wired_without_replacing_existing_layer(self):
        modules = (ROOT / "src/lib/ollaMasteryModules.ts").read_text(encoding="utf-8")
        visual = (ROOT / "src/components/OllaMasteryVisual.tsx").read_text(encoding="utf-8")
        visual_data = (ROOT / "src/lib/ollaCeoVisuals.ts").read_text(encoding="utf-8")
        self.assertIn("CEO_COST_CONTROL_MASTERY", modules)
        self.assertIn("...BASE_OLLA_MODULES", modules)
        self.assertIn("OllaMasteryVisual", MASTERY)
        self.assertIn('questionId={item.id}', MASTERY)
        self.assertIn("CEO_VISUALS", visual)
        self.assertIn('"M3-Q42"', visual_data)
        visual_ids = re.findall(r'"(M3-Q\d{2})":', visual_data)
        self.assertEqual(42, len(visual_ids))
        self.assertEqual(42, len(set(visual_ids)))

    def test_requested_learning_flow_and_controls_exist(self):
        self.assertIn("Eng. Olla,", MASTERY)
        self.assertIn("I Really Hope You Feel Satisfied", MASTERY)
        self.assertIn("← Return to CTO Dashboard", MASTERY)
        self.assertIn("{heroReady&&<button", MASTERY)
        self.assertIn("setTimeout(()=>setHeroReady(true),3300)", MASTERY)
        self.assertIn('aria-expanded={revealed}', MASTERY)
        self.assertIn('event.key==="Enter"||event.key==="ArrowRight"', MASTERY)
        self.assertIn('event.key==="ArrowLeft"', MASTERY)
        self.assertIn('if(event.key==="Escape")return', MASTERY)
        self.assertIn("You are not reviewing numbers.", MASTERY)

    def test_static_mastery_remains_decoupled_while_live_module_receives_controlled_context(self):
        self.assertNotIn("/generated/", MASTERY)
        self.assertNotIn("fetch(", MASTERY)
        self.assertNotIn("ProjectWorkspace", MASTERY)
        self.assertIn("<EngOllaMastery onExit={dismiss} intelligenceContext={context}/>", DASHBOARD)
        self.assertIn("LiveProjectIntelligence", MASTERY)

    def test_trick_layer_uses_peer_tabs_and_explained_charts(self):
        live = (ROOT / "src/components/LiveProjectIntelligence.tsx").read_text(encoding="utf-8")
        self.assertIn('className="ollaPrimaryTabs"', MASTERY)
        self.assertIn('className="ollaPageTabs"', MASTERY)
        self.assertIn('className="ollaExplainedVisual"', MASTERY)
        self.assertIn('Charts & Explanations', live)
        self.assertIn('function ExplainedApplicationChart', live)
        self.assertIn('function ApplicationChart', live)
        self.assertIn('function SupportingApplicationCharts', live)
        self.assertEqual(live.count('<SupportingApplicationCharts'), 3)
        self.assertIn('GroupedBarChart', live)
        self.assertIn('LineChart', live)
        self.assertIn('BubbleChart', live)
        self.assertIn('DonutChart', live)
        self.assertIn('SimpleWaterfall', live)
        self.assertNotIn('function ExplainedMetricChart', live)
        self.assertIn('What this chart measures', live)
        self.assertIn('Recommended decision', live)
        self.assertIn('Main app Charts · second-layer reading', live)
        self.assertIn('Main app CTO Analysis · interpreted', live)
        self.assertIn('Main app Risk · actions and mitigation', live)
        self.assertIn('function ResultTable', live)
        self.assertGreaterEqual(live.count('<ResultTable'), 4)
        self.assertIn('function EvidenceConfidenceChart', live)
        self.assertIn('openingLiveView(context)', live)
        self.assertIn('.ollaPrimaryTabs', CSS)
        self.assertIn('.liveChartExplanation', CSS)
        self.assertIn('.liveApplicationChartPlot', CSS)
        self.assertIn('.liveDashboardTable', CSS)

    def test_responsive_and_motion_accessibility_rules_exist(self):
        self.assertIn("@media(max-width:760px)", CSS)
        self.assertIn("@media(max-height:780px)", CSS)
        self.assertIn("@media(prefers-reduced-motion:reduce)", CSS)
        self.assertIn("overflow-x:hidden", CSS)
        self.assertIn(".ollaLearningScroll", CSS)


if __name__ == "__main__":
    unittest.main()
