from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class OlaRiseLayerTests(unittest.TestCase):
    def test_new_hidden_sequence_and_existing_sequence_coexist(self):
        dashboard = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
        launcher = (ROOT / "src/components/OlaRiseLayer.tsx").read_text(encoding="utf-8")
        self.assertIn('export const OLA_RISE_KEY_SEQUENCE = "654123"', launcher)
        self.assertIn('const mastery="12345"', dashboard)
        self.assertIn('reveal("rise")', dashboard)
        self.assertIn('reveal("mastery")', dashboard)

    def test_touch_knock_requires_two_pause_one_pause_two(self):
        launcher = (ROOT / "src/components/OlaRiseLayer.tsx").read_text(encoding="utf-8")
        self.assertIn("quickTapMaximumMs: 450", launcher)
        self.assertIn("pauseMinimumMs: 950", launcher)
        self.assertIn("stage: 0 | 1 | 2 | 3 | 4", launcher)
        self.assertIn("complete: true", launcher)

    def test_game_package_and_exact_name_are_present(self):
        game_root = ROOT / "public/ola-rise"
        for relative in [
            "index.html", "style.css", "game.js", "manifest.webmanifest", "sw.js",
            "assets/layer_1.jpg", "assets/layer_2.jpg", "assets/layer_3.jpg",
            "assets/layer_4.jpg", "assets/layer_5.jpg",
        ]:
            self.assertTrue((game_root / relative).is_file(), relative)
        html = (game_root / "index.html").read_text(encoding="utf-8")
        manifest = (game_root / "manifest.webmanifest").read_text(encoding="utf-8")
        self.assertIn("OLA: RISE", html)
        self.assertIn("Memory. Decisions. Projects. Destiny.", html)
        self.assertIn('"short_name":"OLA: RISE"', manifest)


if __name__ == "__main__":
    unittest.main()
