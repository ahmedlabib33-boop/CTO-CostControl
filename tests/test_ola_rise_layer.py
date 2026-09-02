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

    def test_game_opens_directly_without_pre_game_story_layers(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        self.assertIn('<section id="game" class="screen active">', html)
        self.assertNotIn('<section id="story"', html)
        self.assertNotIn('id="storyNext"', html)
        self.assertIn("function startGameDirectly()", script)
        self.assertIn("await ensureLiveProjects();", script)
        self.assertIn("init3D();", script)
        self.assertIn('id="retryLiveGame"', script)
        self.assertNotIn("const story = [", script)
        self.assertNotIn("renderStory()", script)

    def test_mobile_controls_survive_cancelled_or_unsupported_pointer_capture(self):
        game_root = ROOT / "public/ola-rise"
        launcher = (ROOT / "src/components/OlaRiseLayer.tsx").read_text(encoding="utf-8")
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        self.assertIn('jr.setPointerCapture?.(jid)', script)
        self.assertIn('document.addEventListener("pointermove", moveJoystickPointer', script)
        self.assertIn('jr.addEventListener("pointercancel", finishJoystickPointer)', script)
        self.assertIn('jr.addEventListener("lostpointercapture", finishJoystickPointer)', script)
        self.assertIn('if (!("PointerEvent" in window))', script)
        self.assertIn('document.addEventListener("touchmove"', script)
        self.assertIn('addEventListener("blur", resetJoystick)', script)
        self.assertIn('addEventListener("keydown"', script)
        self.assertIn('project-sheet-open', script)
        self.assertIn('.project-sheet-open .joystick', css)
        self.assertIn('overscroll-behavior: none;', css)
        self.assertIn('release=20260902-v29', html)
        self.assertIn('release=20260902-v29', launcher)
        self.assertIn('capture: true', script)
        self.assertIn('function ensureSafeOlaPosition', script)
        self.assertIn('function collisionOverlapScore', script)

    def test_decisions_change_project_trajectory_and_food_court_is_one_tap_at_night(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        systems = (game_root / "systems.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        self.assertIn('id="projectTrajectory"', html)
        self.assertIn('id="decisionTrajectory"', html)
        self.assertIn('class="night-food-actions"', html)
        self.assertIn('function applyProjectDecisionImpact', script)
        self.assertIn('function updateProjectTrajectories', script)
        self.assertIn('state.projectMomentum', script)
        self.assertIn('runFoodAction(button.dataset.food)', script)
        self.assertIn('.project-trajectory.rising', css)
        self.assertIn('.night-food-actions button', css)

    def test_3d_game_has_direct_go_to_guidance_for_every_mission(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        self.assertIn('id="goToBtn"', html)
        self.assertIn("function goToProject", script)
        self.assertIn("function nextOpenProject", script)
        self.assertIn("TRAVELLING IN 3D", script)
        self.assertIn("DECIDE →", script)
        self.assertIn("function planWalkRoute", script)
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
            "completeStageExam",
            "showThought",
        ]:
            self.assertIn(f"function {feature}", script)
        self.assertIn("LIVE MANAGEMENT OBJECTIVE", html)
        self.assertIn("objective-marker", html)
        self.assertIn("goToPulse", css)
        self.assertIn('cache: "no-store"', service_worker)
        self.assertNotIn("caches.open", service_worker)
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
        for element_id in ["decisionHint", "examSheet", "trophyModal", "trophyShelf"]:
            self.assertIn(f'id="{element_id}"', html)
        self.assertNotIn('id="thoughtBubble"', html)
        self.assertNotIn(".thought-bubble", css)
        self.assertNotIn('id="decisionConfidence"', html)
        self.assertIn(".trophy-card", css)

    def test_decision_academy_teaches_practices_reflects_and_tracks_life_management(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        systems = (game_root / "systems.js").read_text(encoding="utf-8")
        css = (game_root / "style.css").read_text(encoding="utf-8")
        service_worker = (game_root / "sw.js").read_text(encoding="utf-8")
        for element_id in [
            "decisionLearning", "decisionFramework",
            "decisionFeedback", "decisionReflection", "decisionTrainingStats",
            "lifePractice", "lifePracticeOptions",
        ]:
            self.assertIn(f'id="{element_id}"', html)
        for symbol in [
            "buildDecisionLesson", "evaluateDecisionChoice", "recordDecisionAttempt",
            "trainingSummary", "buildLifePractice", "evaluateLifePractice",
        ]:
            self.assertIn(symbol, systems)
            self.assertIn(symbol, script)
        self.assertIn("completeDecisionReflection", script)
        self.assertIn("decisionOutcomes", script)
        self.assertIn("PROJECT_HEALTH_RULES", script)
        self.assertIn("reflectionCompleted", script)
        self.assertIn("The decision is final", systems)
        self.assertNotIn("Try the reflection again", script)
        self.assertIn("renderDecisionTraining", script)
        self.assertIn("renderLifePractice", script)
        self.assertIn("findCollisionSafeRoute", script)
        self.assertIn("planFoodCourtRoute", script)
        self.assertIn("arriveAtFoodCourt", script)
        self.assertIn("nightFoodFallbackTimer", script)
        self.assertIn(".decision-learning", css)
        self.assertIn(".life-practice", css)
        self.assertIn('cache: "no-store"', service_worker)
        self.assertNotIn("caches.open", service_worker)

    def test_decisions_are_final_and_drive_irreversible_project_health(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        systems = (game_root / "systems.js").read_text(encoding="utf-8")
        self.assertNotIn('id="thoughtBubble"', html)
        self.assertNotIn('id="decisionConfidence"', html)
        for text in [
            "decisionCorrect: 8",
            "decisionWrong: -10",
            "reflectionCorrect: 3",
            "reflectionWrong: -3",
            "examCorrect: 2",
            "examWrong: -2",
            'label: "FAILED"',
            'label: "OUT OF TRACK"',
            'label: "RISING"',
            'label: "THRIVING"',
        ]:
            self.assertIn(text, systems)
        self.assertIn("state.decisionOutcomes[p.id][i] = outcome", script)
        self.assertIn("button.disabled = true", script)
        self.assertIn("finishGame(false, { project: p, outcome })", script)
        self.assertIn("allRising", script)
        self.assertIn("installQAInterface", script)
        self.assertIn("__OLA_RISE_QA__", script)

    def test_soundtrack_has_ordered_tracks_and_windows_volume_controls(self):
        game_root = ROOT / "public/ola-rise"
        html = (game_root / "index.html").read_text(encoding="utf-8")
        script = (game_root / "game.js").read_text(encoding="utf-8")
        self.assertIn('id="musicPlayer"', html)
        self.assertIn('id="volumeDown"', html)
        self.assertIn('id="volumeUp"', html)
        self.assertIn("setMusicVolume(0);", script)
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
        self.assertIn('id="volumeValue" aria-label="Volume 0 percent">0%', html)
        self.assertIn("setMusicVolume(0);", script)
        self.assertNotIn('addEventListener("pointerdown", () => {\n    if (audio.paused) audio.play()', script)
        pause_logic = script.split("function simulationPausedByUI()", 1)[1].split("function animate()", 1)[0]
        self.assertNotIn('$("#drawer")', pause_logic)
        self.assertIn("lastInterfaceRefreshAt", script)
        self.assertIn("lastLightingRefreshAt", script)
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
        self.assertIn("GO TO FOOD COURT", html)
        self.assertNotIn("شعبيات لبيب", html)
        self.assertIn("g.scale.setScalar(0.65)", script)
        self.assertIn("glassesMaterial", script)
        self.assertIn("bagFlap", script)
        self.assertIn("sash", script)
        self.assertIn("BAHRAINI_CONVERSATIONS", script)
        self.assertIn("conversationActorIndex", script)
        self.assertIn("conversation-sequence", css)
        self.assertIn("function registerCollider", script)
        self.assertIn("function blockedAt", script)
        self.assertIn("function moveOlaWithCollision", script)
        self.assertIn("function externalLadder", script)
        self.assertIn("walkBlockedFrames", script)
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
        self.assertIn('textSprite("FOOD COURT"', script)
        self.assertNotIn("AL KHOBAR AL SHAMALIA", script)
        self.assertNotIn("Khobar-inspired", script)
        self.assertIn("court.position.set(35, 0, 25)", script)
        self.assertIn("FOOD_COURT_ARRIVAL = { x: 35, z: 32.5 }", script)
        self.assertIn("planFoodCourtRoute", script)
        self.assertIn("nightFoodTravel", script)
        self.assertIn("qualified professional", html)
        self.assertIn('body[data-time-phase="night"]', css)
        self.assertIn(".bedtime-card", css)
        self.assertNotIn("Brew Egyptian tea", html)


if __name__ == "__main__":
    unittest.main()
