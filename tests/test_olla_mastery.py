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
        ids = re.findall(r'id: "(M[12]-Q\d{2})"', CONTENT)
        self.assertEqual(24, len(ids))
        self.assertEqual(24, len(set(ids)))
        self.assertEqual(12, len([item for item in ids if item.startswith("M1-")]))
        self.assertEqual(12, len([item for item in ids if item.startswith("M2-")]))
        self.assertIn("export const MAX_QUESTIONS_PER_PAGE = 3", CONTENT)
        self.assertIn("slice(page*MAX_QUESTIONS_PER_PAGE", MASTERY)

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

    def test_overlay_is_decoupled_from_dashboard_data(self):
        self.assertNotIn("/generated/", MASTERY)
        self.assertNotIn("fetch(", MASTERY)
        self.assertNotIn("ProjectWorkspace", MASTERY)
        self.assertIn("<EngOllaMastery onExit={dismiss}/>", DASHBOARD)

    def test_responsive_and_motion_accessibility_rules_exist(self):
        self.assertIn("@media(max-width:760px)", CSS)
        self.assertIn("@media(max-height:780px)", CSS)
        self.assertIn("@media(prefers-reduced-motion:reduce)", CSS)
        self.assertIn("overflow-x:hidden", CSS)
        self.assertIn(".ollaLearningScroll", CSS)


if __name__ == "__main__":
    unittest.main()
