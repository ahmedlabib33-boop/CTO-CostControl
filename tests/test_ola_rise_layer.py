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

    def test_touch_knock_requires_two_pause_three(self):
        launcher = (ROOT / "src/components/OlaRiseLayer.tsx").read_text(encoding="utf-8")
        self.assertIn("quickTapMaximumMs: 450", launcher)
        self.assertIn("tripleTapMaximumMs: 850", launcher)
        self.assertIn("firstBurstTapCount: 2", launcher)
        self.assertIn("secondBurstTapCount: 3", launcher)
        self.assertIn("pauseMinimumMs: 950", launcher)
        self.assertIn("stage: 0 | 1 | 2 | 3 | 4", launcher)
        self.assertIn("complete: true", launcher)

        dashboard = (ROOT / "src/components/Dashboard.tsx").read_text(encoding="utf-8")
        self.assertIn("masteryTaps.current.filter", dashboard)
        self.assertIn('reveal("rise")', dashboard)
        self.assertIn('reveal("mastery")', dashboard)

    def test_game_package_and_exact_name_are_present(self):
        game_root = ROOT / "public/ola-rise"
        for relative in [
            "index.html", "style.css", "game.js", "systems.js", "live-data.js", "manifest.webmanifest", "sw.js",
            "assets/layer_1.jpg", "assets/layer_2.jpg", "assets/layer_3.jpg",
            "assets/layer_4.jpg", "assets/layer_5.jpg",
            "assets/intro.mp3", "assets/crystalised.mp3", "assets/track-3.mp3",
        ]:
            self.assertTrue((game_root / relative).is_file(), relative)
        html = (game_root / "index.html").read_text(encoding="utf-8")
        manifest = (game_root / "manifest.webmanifest").read_text(encoding="utf-8")
        self.assertIn("OLA: RISE", html)
        self.assertIn("Memory. Decisions. Projects. Destiny.", html)
        self.assertIn('"short_name":"OLA: RISE"', manifest)

    def test_opening_keeps_continue_and_moves_guide_line_to_layer_two_bubble(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        self.assertIn('id="storyGuideBubble"', html)
        self.assertIn('id="storyGuideText"', html)
        self.assertIn('يا علا… محتاجينك في حوار صغير.', html)
        self.assertIn('guideBubble.classList.toggle("hidden", storyIndex !== 1)', script)
        self.assertIn('.story-copy > :not(#storyNext)', css)
        self.assertIn('.story-guide-bubble', css)

    def test_3d_game_has_direct_go_to_guidance_for_every_mission(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        self.assertIn('id="goToBtn"', html)
        self.assertIn("function goToProject", script)
        self.assertIn("function nextOpenProject", script)
        self.assertIn("TRAVELLING IN 3D", script)
        self.assertIn("GO TO →", script)
        self.assertIn("openProject(arrived)", script)
        self.assertIn(".go-to", css)

    def test_3d_redesign_has_a_life_simulation_world_and_animated_navigation(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        service_worker = (game_root / "sw.js").read_text(encoding="utf-8")
        for feature in [
            "hospitalBuilding",
            "gatewayBuilding",
            "projectBeacon",
            "drawNavigationLine",
            "animateOla",
            "updateDayLight",
            "streetLight",
            "playSimAction",
            "openStageExam",
            "awardStageTrophy",
            "showThought",
        ]:
            self.assertIn(f"function {feature}", script)
        self.assertIn("LIVE MANAGEMENT OBJECTIVE", html)
        self.assertIn("objective-marker", html)
        self.assertIn("goToPulse", css)
        self.assertIn("ola-rise-v20-khobar-food-district", service_worker)
        self.assertIn("self.skipWaiting()", service_worker)
        self.assertIn("self.clients.claim()", service_worker)

    def test_questions_are_built_from_current_generated_data(self):
        game_root = ROOT / "public/ola-rise"
        script = (game_root / "game.js").read_text(encoding="utf-8")
        live = (game_root / "live-data.js").read_text(encoding="utf-8")
        systems = (game_root / "systems.js").read_text(encoding="utf-8")
        self.assertIn("await loadLiveGameProjects()", script)
        self.assertIn('fetchJson("/generated/portfolio/latest.json"', live)
        self.assertIn('cache: "no-store"', live)
        self.assertIn("source_fingerprint", live)
        self.assertIn("reporting_period", live)
        self.assertIn("No older project questions were substituted", script)
        self.assertIn("buildStageExam", systems)

    def test_every_question_has_hint_exam_and_trophy_ui(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        for element_id in ["thoughtBubble", "decisionHint", "examSheet", "trophyModal", "trophyShelf"]:
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn("ENG. OLA · THINK ABOUT", html)
        self.assertIn(".thought-bubble", css)
        self.assertIn(".trophy-card", css)

    def test_soundtrack_has_ordered_tracks_and_windows_volume_controls(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        self.assertIn('id="musicPlayer"', html)
        self.assertIn('id="volumeDown"', html)
        self.assertIn('id="volumeUp"', html)
        self.assertIn("setMusicVolume(0.7)", script)
        self.assertIn('assets/intro.mp3', script)
        self.assertIn('assets/crystalised.mp3', script)
        self.assertIn('assets/track-3.mp3', script)
        self.assertIn('AudioVolumeDown', script)
        self.assertIn('AudioVolumeUp', script)

    def test_game_hud_and_final_labib_result_are_interactive(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        for element_id in ["campaignProgress", "campaignProgressBar", "collapseProject", "projectProgress", "labibResult"]:
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn("function finishGame", script)
        self.assertIn('"Congrats from Labib"', script)
        self.assertIn('"Hard Luck from Labib"', script)
        self.assertIn("state.day >= 30", script)
        self.assertIn(".bottom-sheet.compact", css)
        self.assertIn(".campaign-progress", css)
        self.assertIn(".labib-result", css)

    def test_day_cycle_sleep_lock_coffee_and_wellbeing_are_visible(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        systems = (game_root / "systems.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        for element_id in ["timePhase", "bedtimeGate", "sleepUntilMorning", "coffeeBtn", "wellbeingPrompt", "waterBtn", "wellbeingQuote"]:
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn('data-speed="2"', html)
        self.assertIn('data-speed="4"', html)
        self.assertIn("function timePhaseFor", systems)
        self.assertIn("function isBedtime", systems)
        self.assertIn("function sleepUntilMorning", systems)
        self.assertIn('runSimAction("coffee")', script)
        self.assertIn("Friedrich Nietzsche", script)
        self.assertIn("Leo Tolstoy", script)
        self.assertIn("function snowfall", script)
        self.assertIn("snowField.geometry.attributes.position.needsUpdate", script)
        self.assertIn("function foodCourt", script)
        self.assertIn('data-food="pizza"', html)
        self.assertIn('data-food="burger"', html)
        self.assertIn('data-food="tameez"', html)
        self.assertIn('data-food="shaabiyat"', html)
        self.assertIn('data-food="karak"', html)
        self.assertIn("شعبيات", html)
        self.assertIn("شاي كرك", html)
        self.assertIn("شعبيات لبيب", html)
        self.assertIn("g.scale.setScalar(0.65)", script)
        self.assertIn("glassesMaterial", script)
        self.assertIn("bagFlap", script)
        self.assertIn("sash", script)
        self.assertIn("BAHRAINI_CONVERSATIONS", script)
        self.assertIn("function positionAmbientConversations", script)
        self.assertIn("أم خالد", script)
        self.assertIn("مريم", script)
        self.assertIn("نور", script)
        self.assertIn("شابة بالغة", script)
        self.assertEqual(script.count("walks: true"), 4)
        self.assertEqual(script.count("walks: false"), 2)
        self.assertIn('id="goNightFoodCourt"', html)
        self.assertIn('id="nightSocialDock"', html)
        self.assertIn("night-social-mode", css)
        self.assertIn("Food and conversations only", html)
        self.assertIn("function foodCourt", script)
        self.assertIn("shopBlock", script)
        self.assertIn("AL KHOBAR AL SHAMALIA", script)
        self.assertIn("court.position.set(35, 0, 25)", script)
        self.assertIn("walkTarget.set(35, 0, 32.5)", script)
        self.assertIn("nightFoodTravel", script)
        self.assertIn("qualified professional", html)
        self.assertIn('body[data-time-phase="night"]', css)
        self.assertIn(".bedtime-card", css)
        self.assertNotIn("Brew Egyptian tea", html)


if __name__ == "__main__":
    unittest.main()
