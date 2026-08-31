import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_INTELLIGENCE_POLICY as policy,
  PORTFOLIO_INTELLIGENCE_VIEWS,
  PROJECT_INTELLIGENCE_VIEWS,
  buildApplicationDescriptors,
  buildPortfolioDescriptors,
  buildProjectDescriptors,
  buildWholeProjectDescriptors,
  cashflowTrendMetrics,
  evaluateDescriptor,
  summarizeApplicationCoverage,
  validateIntelligencePolicy,
  type IntelligenceDescriptor,
  type SemanticType,
} from "../src/lib/liveIntelligence";
import type { ProjectData } from "../src/lib/types";

const descriptor = (semanticType: SemanticType, metrics: Record<string, number | null>): IntelligenceDescriptor => ({
  componentId: semanticType,
  componentName: semanticType,
  kind: semanticType === "scenario" ? "scenario" : "chart",
  family: "test",
  semanticType,
  projectId: "alpha",
  projectName: "Alpha",
  period: "2026-06",
  revision: "abc",
  metrics,
  sourceEvidence: ["controlled fixture"],
  extractionConfidence: 1,
  assessmentBasis: semanticType === "scenario" ? "scenario" : "derived",
});

function loadFirstCurrentProject() {
  const projects = JSON.parse(fs.readFileSync(path.resolve("public/generated/projects.json"), "utf8"));
  assert.ok(projects.length > 0, "at least one generated project is required for the live contract test");
  const registry = projects[0];
  const latestPath = path.resolve(`public/generated/projects/${registry.project_id}/latest.json`);
  const data = JSON.parse(fs.readFileSync(latestPath, "utf8")) as ProjectData;
  const normalizedPath = path.resolve("public", String(data.normalized_path).replace(/^\/generated\//, "generated/"));
  const normalized = JSON.parse(fs.readFileSync(normalizedPath, "utf8"));
  return { projects, registry, data, normalized };
}

test("cost performance covers favorable, caution, critical, zero and missing", () => {
  assert.equal(evaluateDescriptor(descriptor("cost_performance", { ev: 110, ac: 100, cv: 10, cpi: 1.1 }), policy).status, "favorable");
  assert.equal(evaluateDescriptor(descriptor("cost_performance", { ev: 97, ac: 100, cv: -3, cpi: .97 }), policy).status, "caution");
  assert.equal(evaluateDescriptor(descriptor("cost_performance", { ev: 80, ac: 100, cv: -20, cpi: .8 }), policy).status, "critical");
  assert.equal(evaluateDescriptor(descriptor("cost_performance", { ev: 0, ac: 0, cv: 0, cpi: null }), policy).status, "unavailable");
  assert.equal(evaluateDescriptor(descriptor("cost_performance", { ev: null, ac: null, cv: null, cpi: null }), policy).status, "unavailable");
});

test("profit, cashflow, waste, reconciliation and concentration rules are evidence based", () => {
  assert.equal(evaluateDescriptor(descriptor("profitability", { profit: -1, margin: -.01 }), policy).status, "critical");
  assert.equal(evaluateDescriptor(descriptor("profitability", { profit: 10, margin: .1 }), policy).status, "favorable");
  assert.equal(evaluateDescriptor(descriptor("cumulative_cashflow", { cumulativeCashIn: 100, cumulativeCashOut: 120, cumulativeNet: -20 }), policy).status, "critical");
  assert.equal(evaluateDescriptor(descriptor("cumulative_cashflow", { cumulativeCashIn: 120, cumulativeCashOut: 100, cumulativeNet: 20 }), policy).status, "favorable");
  assert.equal(evaluateDescriptor(descriptor("cumulative_cashflow", { cumulativeCashIn: 0, cumulativeCashOut: 0, cumulativeNet: 0 }), policy).status, "unavailable");
  assert.equal(evaluateDescriptor(descriptor("cumulative_cashflow", { cumulativeCashIn: 0, cumulativeCashOut: 100, cumulativeNet: -100 }), policy).status, "critical");
  assert.equal(evaluateDescriptor(descriptor("waste", { steelActual: .08, steelBudget: .02, concreteActual: .01, concreteBudget: .01 }), policy).status, "critical");
  assert.equal(evaluateDescriptor(descriptor("waste", { steelActual: .01, steelBudget: .02, concreteActual: .01, concreteBudget: .01 }), policy).status, "favorable");
  assert.equal(evaluateDescriptor(descriptor("reconciliation", { accounting: 110, reported: 100 }), policy).status, "critical");
  assert.equal(evaluateDescriptor(descriptor("reconciliation", { accounting: 100.5, reported: 100 }), policy).status, "favorable");
  assert.equal(evaluateDescriptor(descriptor("reconciliation", { accounting: 0, reported: 0 }), policy).status, "unavailable");
  assert.equal(evaluateDescriptor(descriptor("concentration", { top: 50, total: 100 }), policy).status, "critical");
  assert.equal(evaluateDescriptor(descriptor("concentration", { top: 20, total: 100 }), policy).status, "favorable");
  assert.equal(evaluateDescriptor(descriptor("concentration", { top: 100, total: 1 }), policy).status, "unavailable");
});

test("cashflow trend is guarded against stable deficits and insufficient history", () => {
  const negative = cashflowTrendMetrics([
    { cash_in_cum: 0, cash_out_cum: 100 },
    { cash_in_cum: 10, cash_out_cum: 110 },
    { cash_in_cum: 20, cash_out_cum: 120 },
  ]);
  const result = evaluateDescriptor(descriptor("cashflow_trend", negative), policy);
  assert.equal(result.status, "critical");
  assert.match(result.reason, /never classified as favorable/i);
  const short = cashflowTrendMetrics([{ cash_in_cum: 10, cash_out_cum: 5 }, { cash_in_cum: 20, cash_out_cum: 10 }]);
  assert.equal(evaluateDescriptor(descriptor("cashflow_trend", short), policy).status, "unavailable");
});

test("forecast, data quality and scenario rules do not mix scenario and source facts", () => {
  const forecast = evaluateDescriptor(descriptor("forecast", { rowCount: 4, bac: 100, remainingBudget: 30, etc: 40 }), policy);
  assert.equal(forecast.status, "critical");
  assert.equal(evaluateDescriptor(descriptor("forecast", { rowCount: 4, bac: 100, remainingBudget: 50, etc: 40 }), policy).status, "favorable");
  assert.equal(evaluateDescriptor(descriptor("data_quality", { severe: 1, warnings: 0, unaccountedSheets: 0 }), policy).status, "critical");
  assert.equal(evaluateDescriptor(descriptor("data_quality", { severe: 0, warnings: 2, unaccountedSheets: 0 }), policy).status, "caution");
  const scenario = evaluateDescriptor(descriptor("scenario", { profit: -10, margin: -.1 }), policy);
  assert.equal(scenario.status, "critical");
  assert.equal(scenario.assessmentBasis, "scenario");
  assert.match(scenario.meaning, /not source facts/i);
});

test("no-target safeguards keep accounting mix and inventory informational", () => {
  assert.equal(evaluateDescriptor(descriptor("cost_mix", { direct: 90, indirect: 10 }), policy).status, "informational");
  assert.equal(evaluateDescriptor(descriptor("inventory", { rowCount: 1000 }), policy).status, "informational");
  assert.equal(evaluateDescriptor({ ...descriptor("ledger_trend", { periods: 2 }), rows: [{ total: 10 }, { total: 20 }] }, policy).status, "unavailable");
  assert.equal(evaluateDescriptor({ ...descriptor("ledger_trend", { periods: 3 }), rows: [{ total: 10 }, { total: 20 }, { total: 30 }] }, policy).status, "informational");
});

test("policy import validates ordering and finite values", () => {
  assert.deepEqual(validateIntelligencePolicy(policy), policy);
  assert.equal(validateIntelligencePolicy({ ...policy, cpiCaution: 2 }), null);
  assert.equal(validateIntelligencePolicy({ ...policy, concentrationCriticalPct: Number.NaN }), null);
  assert.equal(validateIntelligencePolicy({ ...policy, minimumTrendPeriods: 1 }), null);
  assert.equal(validateIntelligencePolicy({ ...policy, trendAnomalyCautionZ: 4, trendAnomalyCriticalZ: 3 }), null);
});

test("actual project contract covers all business dashboard families without cross-project identity", () => {
  const { data, normalized } = loadFirstCurrentProject();
  const context = { kind: "project" as const, view: "executive-overview" as const, data, normalized };
  const current = buildProjectDescriptors(context);
  const expectedKpis = ["Contract Price", "Total Budget Cost", "Earned Value", "Actual Cost", "Cost Variance", "CPI", "Direct Actual", "Indirect Actual", "Revenue", "Ledger Cost"];
  for (const title of expectedKpis) assert.ok(current.some(item => item.componentName === title), `missing KPI ${title}`);
  assert.ok(current.some(item => item.componentName === "Budget vs Earned Value vs Actual Cost — by division"));
  assert.ok(current.some(item => item.componentName === "Cost Performance Map"));
  const all = buildWholeProjectDescriptors(context);
  const expected = ["Monthly Cashflow — Cash In vs Cash Out", "Cashflow Trend Forecast", "Waste Efficiency", "Detailed BOQ Forecast Analysis table", "Direct Details table", "Indirect Cost Detail table", "Ledger Reconciliation", "Actual Expense Ledger table", "Cost Code Lookup table", "Data Quality findings"];
  for (const title of expected) assert.ok(all.some(item => item.componentName === title), `missing ${title}`);
  assert.ok(all.length >= 25);
  assert.ok(all.every(item => item.projectId === data.project_id && item.period === data.reporting_period && item.revision === data.source.sha256));
  for (const view of PROJECT_INTELLIGENCE_VIEWS) assert.ok(all.some(item => item.filters?.surface === view), `missing project surface ${view}`);
  assert.equal(all.find(item => item.componentId === "direct-details")?.rows?.length, normalized.direct_details.length);
  assert.equal(all.find(item => item.componentId === "expense-ledger")?.rows?.length, normalized.expenses?.length || normalized.expenses_packed?.length);
});

test("portfolio, project-registry, intelligence and output pages register only supported business evidence", () => {
  const projects = JSON.parse(fs.readFileSync(path.resolve("public/generated/projects.json"), "utf8"));
  const common = { kind: "portfolio" as const, scope: "dashboard" as const, projects, active: [] };
  assert.deepEqual(buildPortfolioDescriptors({ ...common, view: "projects" }).map(item => item.componentName), ["Project Registry cards"]);
  assert.deepEqual(buildPortfolioDescriptors({ ...common, view: "intelligence" }).map(item => item.componentName), ["Validated Monthly / Revision History", "Portfolio Data Quality", "Source Registry", "Portfolio Command Center Data Mapping"]);
  assert.deepEqual(buildPortfolioDescriptors({ ...common, view: "output" }).map(item => item.componentName), ["Output Studio"]);
});

test("multiple profitability methods stay separate and the weakest valid method remains visible", () => {
  const mixed = evaluateDescriptor({ ...descriptor("profitability_methods", { methodCount: 2 }), rows: [{ method: "Revenue basis", profit: 10, profit_pct: .1 }, { method: "Deduction basis", profit: -2, profit_pct: -.02 }] }, policy);
  assert.equal(mixed.status, "mixed");
  assert.match(mixed.reason, /do not overwrite/i);
  const favorable = evaluateDescriptor({ ...descriptor("profitability_methods", { methodCount: 2 }), rows: [{ profit: 10, profit_pct: .1 }, { profit: 5, profit_pct: .05 }] }, policy);
  assert.equal(favorable.status, "favorable");
  assert.equal(evaluateDescriptor({ ...descriptor("profitability_methods", { methodCount: 0 }), rows: [] }, policy).status, "unavailable");
});

test("entire-app scope registers every project and portfolio surface without claiming missing evidence", () => {
  const { data, normalized, registry } = loadFirstCurrentProject();
  const portfolio = { kind: "portfolio" as const, view: "charts" as const, scope: "dashboard" as const, projects: [registry], active: [] };
  const descriptors = buildApplicationDescriptors({ portfolio, projects: [{ kind: "project", view: "executive-overview", data, normalized }] });
  const coverage = summarizeApplicationCoverage(descriptors, 1);
  assert.equal(coverage.coveredSurfaces, PROJECT_INTELLIGENCE_VIEWS.length + PORTFOLIO_INTELLIGENCE_VIEWS.length);
  assert.equal(coverage.coveragePct, 100);
  assert.ok(descriptors.every(item => item.sourceEvidence.length > 0 || evaluateDescriptor(item, policy).status === "unavailable"));
  assert.ok(descriptors.some(item => item.componentName === "Data Mapping"));
  assert.ok(descriptors.some(item => item.componentName === "Workbook Sources and Detected Tables"));
  assert.ok(descriptors.some(item => item.componentName === "Workbook Charts and Source Media"));
  assert.ok(descriptors.some(item => item.componentName === "Output Studio"));
});

test("local ML assets are self hosted and remote loading is disabled", () => {
  const worker = fs.readFileSync(path.resolve("src/workers/intelligence.worker.ts"), "utf8");
  assert.match(worker, /env\.allowRemoteModels = false/);
  assert.match(worker, /env\.localModelPath = "\/models\/"/);
  const model = path.resolve("public/models/all-MiniLM-L6-v2/onnx/model_quantized.onnx");
  assert.ok(fs.statSync(model).size > 20_000_000);
  assert.ok(fs.existsSync(path.resolve("public/models/wasm/ort-wasm-simd-threaded.wasm")));
  assert.ok(fs.existsSync(path.resolve("public/models/wasm/ort-wasm-simd-threaded.mjs")));
  assert.ok(fs.existsSync(path.resolve("public/models/wasm/ort-wasm-simd-threaded.jsep.wasm")));
  assert.ok(fs.existsSync(path.resolve("public/models/wasm/ort-wasm-simd-threaded.jsep.mjs")));
});
