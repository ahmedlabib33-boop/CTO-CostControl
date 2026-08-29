// @ts-nocheck -- runtime contract tests intentionally import browser-native ES modules.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applySimAction,
  buildStageExam,
  decisionHint,
  moodFor,
  normalizeGameState,
  projectIsControlled,
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

test("legacy saves gain all Sims needs and tea visibly changes the state", () => {
  const initial = normalizeGameState({ energy: 40, patience: 50, hour: 23.9 });
  assert.equal(initial.social, 82);
  assert.equal(initial.fun, 76);
  const result = applySimAction(initial, "tea");
  assert.equal(result.state.energy, 62);
  assert.equal(result.state.patience, 62);
  assert.equal(result.state.teaServed, 1);
  assert.equal(result.state.day, 2);
  assert.match(result.line, /Tea first/);
});

test("mood reflects the weakest needs rather than fabricating success", () => {
  assert.equal(moodFor(normalizeGameState({ energy: 10 })).tone, "critical");
  assert.equal(moodFor(normalizeGameState({ energy: 100, focus: 100, patience: 100, social: 100, fun: 100 })).tone, "excellent");
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
