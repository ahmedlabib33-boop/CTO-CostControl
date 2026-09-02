// @ts-nocheck -- runtime contract tests intentionally import browser-native ES modules.
import assert from "node:assert/strict";
import test from "node:test";
import {
  PROJECT_HEALTH_RULES,
  applyProjectHealthImpact,
  applySimAction,
  buildDecisionLesson,
  buildLifePractice,
  buildStageExam,
  decisionHint,
  evaluateDecisionChoice,
  evaluateLifePractice,
  findCollisionSafeRoute,
  moodFor,
  normalizeGameState,
  projectHealthState,
  recordDecisionAttempt,
  trainingSummary,
  projectIsControlled,
  isBedtime,
  sleepUntilMorning,
  timePhaseFor,
} from "../public/ola-rise/systems.js";
import { buildLiveProject, loadLiveGameProjects } from "../public/ola-rise/live-data.js";

const julyProject = {
  project_id: "future-project",
  project_name: "Future Project",
  reporting_period: "2026-07-01_to_2026-07-31",
  source_fingerprint: "july-fingerprint-001",
  normalized_path: "/generated/projects/future-project/enriched/july/normalized.json",
  metrics: {
    budget: 1_000_000,
    earned_value: 420_000,
    actual_cost: 500_000,
    cost_variance: -80_000,
    cpi: 0.84,
    gross_profit: 75_000,
    indirect_cost: 120_000,
  },
};

const julyNormalized = {
  kpis: {
    ev_dashboard_scope: 420_000,
    actual_cost_dashboard_scope: 500_000,
    derived_cpi: 0.84,
    derived_cv: -80_000,
    indirect_budget_cost: 100_000,
    indirect_actual: 120_000,
    ledger_accounting_cost: 540_000,
  },
  profitability: [{ method: "Revenue Gross Profit", profit: 75_000, profit_pct: 0.075 }],
  project_items: [{ bac: 1_000_000, vac: -90_000 }],
  cashflow: [{ cash_in_cum: 400_000, cash_out_cum: 500_000 }],
  boq_resources: [
    { resource: "Steel", actual_cost: 70 },
    { resource: "Other", actual_cost: 30 },
  ],
  data_quality: [{ severity: "warning", message: "One controlled warning" }],
};

test("legacy saves gain all Sims needs and coffee visibly changes the state", () => {
  const initial = normalizeGameState({ energy: 40, patience: 50, hour: 23.9 });
  assert.equal(initial.social, 82);
  assert.equal(initial.fun, 76);
  const result = applySimAction(initial, "coffee");
  assert.equal(result.state.energy, 62);
  assert.equal(result.state.patience, 62);
  assert.equal(result.state.coffeeServed, 1);
  assert.equal(result.state.day, 2);
  assert.match(result.line, /Coffee first/);
});

test("food court choices restore needs and advance time without inventing project data", () => {
  const hungry = normalizeGameState({ energy: 35, fun: 30, social: 40, hour: 12 });
  const pizza = applySimAction(hungry, "food-pizza");
  assert.equal(pizza.state.energy, 51);
  assert.equal(pizza.state.fun, 46);
  assert.equal(pizza.state.hour, 12.5);
  assert.equal(pizza.state.mealsServed, 1);
  const karak = applySimAction(hungry, "food-karak");
  assert.equal(karak.state.patience, 100);
  assert.equal(karak.state.social, 48);
  assert.match(karak.line, /شاي كرك/);
});

test("mood reflects the weakest needs rather than fabricating success", () => {
  assert.equal(moodFor(normalizeGameState({ energy: 10 })).tone, "critical");
  assert.equal(moodFor(normalizeGameState({ energy: 100, focus: 100, patience: 100, social: 100, fun: 100 })).tone, "excellent");
});

test("the real day path locks work at 21:00 and sleep returns at 06:00", () => {
  assert.equal(timePhaseFor(6).label, "Morning");
  assert.equal(timePhaseFor(12).label, "Afternoon");
  assert.equal(timePhaseFor(17).label, "Evening");
  assert.equal(timePhaseFor(20.99).label, "Evening");
  assert.equal(timePhaseFor(21).label, "Night");
  assert.equal(timePhaseFor(5.99).label, "Night");
  assert.equal(isBedtime(20.99), false);
  assert.equal(isBedtime(21), true);
  const rested = sleepUntilMorning(normalizeGameState({ day: 4, hour: 21, energy: 8, focus: 20 }));
  assert.equal(rested.day, 5);
  assert.equal(rested.hour, 6);
  assert.equal(rested.energy, 100);
  assert.equal(rested.speed, 1);
  assert.equal(rested.nightSocial, false);
  assert.equal(normalizeGameState({ speed: 2 }).speed, 2);
  assert.equal(normalizeGameState({ speed: 4 }).speed, 4);
});

test("every question has an Eng. Ola evidence-based thought hint", () => {
  const mission = ["CAUTION", "Cash", "Cash out exceeds cash in.", "Review collections weekly.", ["Review collections weekly.", "Ignore", "Average"], 0];
  assert.match(decisionHint({ source: "July live source" }, mission), /^Eng\. Ola, think about:/);
  assert.match(decisionHint({ source: "July live source" }, mission), /July live source/);
});

test("stage exam shuffles the correct option and requires all live questions controlled", () => {
  const project = buildLiveProject(julyProject, julyNormalized, 0, 1);
  const exam = buildStageExam(project, 3);
  assert.equal(exam.length, 3);
  assert.ok(exam.some((question) => question.correctIndex !== 0));
  assert.equal(projectIsControlled(project, {}), false);
  const resolved = Object.fromEntries(project.missions.map((_mission, index) => [index, true]));
  assert.equal(projectIsControlled(project, resolved), true);
});

test("July data creates July questions using current controlled values", () => {
  const project = buildLiveProject(julyProject, julyNormalized, 0, 1);
  assert.equal(project.period, "2026-07-01_to_2026-07-31");
  assert.equal(project.metrics.CPI, "0.84");
  assert.equal(project.missions.length, 8);
  assert.equal(project.missions[0][0], "CRITICAL");
  assert.match(project.missions[0][2], /0\.84/);
  assert.match(project.missions[0][6], /2026-07-01_to_2026-07-31/);
  assert.match(project.missions[3][2], /-100\.0K/);
});

test("live loader reads the current portfolio and normalized snapshot with no cache", async () => {
  const requests: Array<{ url: string; cache?: string }> = [];
  const fetcher = async (url: string, options: { cache?: string }) => {
    requests.push({ url, cache: options.cache });
    const payload = url.startsWith("/generated/portfolio/latest.json")
      ? { projects: [julyProject], generated_at: "2026-07-31T23:00:00Z", registry_fingerprint: "registry-july" }
      : julyNormalized;
    return { ok: true, status: 200, json: async () => payload } as Response;
  };
  const live = await loadLiveGameProjects(fetcher as typeof fetch);
  assert.equal(live.projects[0].period, julyProject.reporting_period);
  assert.match(live.signature, /july-fingerprint-001/);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.cache === "no-store"));
  assert.ok(requests.every((request) => request.url.includes("game_live=")));
});

test("missing chart evidence becomes an explicit unavailable question", () => {
  const project = buildLiveProject({ ...julyProject, metrics: {} }, {}, 0, 1);
  assert.ok(project.missions.some((mission) => mission[0] === "UNABLE"));
  assert.ok(project.missions.every((mission) => !mission[2].includes("undefined")));
});

test("every live mission becomes a teach-practice-reflect decision lesson", () => {
  const project = buildLiveProject(julyProject, julyNormalized, 0, 1);
  const mission = project.missions[0];
  const lesson = buildDecisionLesson(project, mission);
  assert.equal(lesson.family, "cost-performance");
  assert.match(lesson.principle, /evidence|performance/i);
  assert.deepEqual(lesson.steps.map((step) => step.id), ["observe", "diagnose", "decide", "protect"]);
  assert.match(lesson.reflectionPrompt, /why/i);
  assert.match(lesson.sourceBasis, /2026-07-01_to_2026-07-31/);
});

test("decision evaluation makes the first choice final and explains its consequence", () => {
  const mission = ["CRITICAL", "Cost Performance", "CPI is 0.84.", "Recover cost performance.", ["Recover cost performance.", "Ignore the variance", "Hide the period"], 0, "July evidence"];
  const wrong = evaluateDecisionChoice(mission, 1);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.selectedIndex, 1);
  assert.equal(wrong.correctIndex, 0);
  assert.match(wrong.nextAction, /final/i);
  assert.match(wrong.consequence, /exposure|control/i);
  const right = evaluateDecisionChoice(mission, 0);
  assert.equal(right.correct, true);
  assert.equal(right.requiresReflection, true);
  assert.match(right.reason, /evidence|controlled/i);
});

test("training state records attempts, review due items, reflections, and mastery without inventing project values", () => {
  let state = normalizeGameState({ day: 3 });
  state.training = recordDecisionAttempt(state.training, { key: "p:0", correct: false, confidence: 3, day: 3 });
  state.training = recordDecisionAttempt(state.training, { key: "p:0", correct: true, confidence: 2, day: 3, reflected: true });
  const summary = trainingSummary(state.training, 3);
  assert.equal(summary.attempts, 2);
  assert.equal(summary.correct, 1);
  assert.equal(summary.reflections, 1);
  assert.equal(summary.reviewDue, 1);
  assert.ok(summary.xp > 0);
  assert.equal(state.training.attempts["p:0"].length, 2);
});

test("life practice adapts to Ola's current needs and applies only the selected real Sims action", () => {
  const tired = normalizeGameState({ day: 5, hour: 18, energy: 22, focus: 50, patience: 50 });
  const challenge = buildLifePractice(tired);
  assert.equal(challenge.correctAction, "rest");
  assert.match(challenge.situation, /energy|tired/i);
  const wrong = evaluateLifePractice(challenge, "coffee");
  assert.equal(wrong.correct, false);
  const right = evaluateLifePractice(challenge, "rest");
  assert.equal(right.correct, true);
  assert.match(right.feedback, /recover|rest|judgment/i);
});

test("food-court navigation finds a route around building collisions", () => {
  const blocked = (x, z) => x >= 3 && x <= 7 && z >= -4 && z <= 4;
  const route = findCollisionSafeRoute({ x: 0, z: 0 }, { x: 10, z: 0 }, blocked, { step: 1, limit: 20 });
  assert.ok(route.length >= 3);
  assert.deepEqual(route.at(-1), { x: 10, z: 0 });
  assert.ok(route.some((point) => Math.abs(point.z) > 4));
  assert.ok(route.every((point) => !blocked(point.x, point.z)));
});

test("project health uses the final decision, reflection, exam, failure, and victory thresholds", () => {
  assert.equal(PROJECT_HEALTH_RULES.failure, 35);
  assert.equal(PROJECT_HEALTH_RULES.rising, 65);
  assert.deepEqual(applyProjectHealthImpact(50, PROJECT_HEALTH_RULES.decisionCorrect).after, 58);
  assert.deepEqual(applyProjectHealthImpact(50, PROJECT_HEALTH_RULES.decisionWrong).after, 40);
  assert.deepEqual(applyProjectHealthImpact(40, PROJECT_HEALTH_RULES.reflectionWrong).after, 37);
  assert.equal(projectHealthState(35).label, "FAILED");
  assert.equal(projectHealthState(36).label, "OUT OF TRACK");
  assert.equal(projectHealthState(50).label, "ON TRACK");
  assert.equal(projectHealthState(65).label, "RISING");
  assert.equal(projectHealthState(80).label, "THRIVING");
});

test("saved decision outcomes and legacy campaign state survive normalization", () => {
  const state = normalizeGameState({
    projectMomentum: { gloria: 42 },
    resolved: { gloria: { 0: true } },
    decisionOutcomes: { gloria: { 0: { correct: false, selectedIndex: 2 } } },
    failedProjects: { big: { health: 35 } },
    stageExamResults: { gloria: { score: 2, total: 3 } },
    gameRulesVersion: 2,
  });
  assert.equal(state.projectMomentum.gloria, 42);
  assert.equal(state.resolved.gloria[0], true);
  assert.equal(state.decisionOutcomes.gloria[0].selectedIndex, 2);
  assert.equal(state.failedProjects.big.health, 35);
  assert.equal(state.stageExamResults.gloria.score, 2);
  assert.equal(state.gameRulesVersion, 2);
});
