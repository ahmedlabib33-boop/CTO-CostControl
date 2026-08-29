import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RISK_SETTINGS_ANSWERS,
  buildPortfolioRiskClusters,
  buildPortfolioRiskReport,
  parseSavedRiskSettings,
  riskPolicyFromAnswers,
  type SavedRiskSettings,
} from "../src/lib/portfolioRisk";
import { DEFAULT_INTELLIGENCE_POLICY, type PortfolioIntelligenceContext } from "../src/lib/liveIntelligence";

function active(id: string, name: string, ev: number, ac: number, options: Record<string, any> = {}) {
  const period = options.period || "2026-06";
  const sourceFingerprint = options.sourceFingerprint || `${id}-sha`;
  const cashflow = options.cashflow || [
    { month: "2026-04", cash_in: 20, cash_out: 10, cash_in_cum: 20, cash_out_cum: 10 },
    { month: "2026-05", cash_in: 20, cash_out: 10, cash_in_cum: 40, cash_out_cum: 20 },
    { month: "2026-06", cash_in: 20, cash_out: 10, cash_in_cum: 60, cash_out_cum: 30 },
  ];
  const normalized = {
    kpis: {
      total_budget_cost: 100,
      ev_dashboard_scope: ev,
      actual_cost_dashboard_scope: ac,
      revenue_gross_profit: 150,
      indirect_budget_cost: 20,
      indirect_actual: 10,
      ledger_accounting_cost: ac,
    },
    profitability: [{ method: "Revenue", profit: 30, profit_pct: .2 }],
    cashflow,
    boq_forecasts: [{ bac: 100, etc: 20, remaining_budget: 30 }],
    boq_resources: [{ resource: "Concrete", actual_cost: 20 }, { resource: "Steel", actual_cost: 30 }],
    data_quality: [{ severity: "info", title: "Coverage" }],
    ...options.normalized,
  };
  return {
    id, name, projectName: name, period, contract: 200, price: 200, budget: 100,
    directBudget: 80, indirectBudget: 20, evDashboard: ev, evTotal: ev, acDashboard: ac, acTotal: ac,
    ev, ac, cv: ev - ac, cpi: ac ? ev / ac : null, directAc: ac - 10, indirectAc: 10,
    indirectVar: 10, ledger: ac, revenue: 150, gp: 30, gpPct: .2, deductions: 0,
    cashflow, projectItems: [], normalized,
    registry: { project_id: id, project_name: name, reporting_period: period, source_fingerprint: sourceFingerprint, approved_parity: false, metrics: { earned_value: ev, actual_cost: ac, gross_profit: 30 }, capabilities: {}, quality_count: 0, sheet_count: 3, chart_count: 2 },
  };
}

function context(items: any[], scenario?: any): PortfolioIntelligenceContext {
  return { kind: "portfolio", view: "risk", scope: "dashboard", projects: items.map(item => item.registry), active: items, scenario };
}

test("a critical project remains visible when the combined portfolio is favorable", () => {
  const strong = active("strong", "Strong", 200, 100);
  const weak = active("weak", "Weak", 10, 20);
  const report = buildPortfolioRiskReport(context([strong, weak]), DEFAULT_INTELLIGENCE_POLICY);
  assert.ok(report.risks.some(risk => risk.scope === "project" && risk.affectedProjectIds.includes("weak") && risk.family === "cost performance" && risk.severity === "critical"));
  assert.equal(report.risks.filter(risk => risk.scope === "portfolio" && risk.family === "cost performance").length, 0);
});

test("changed source metrics recalculate the project risk without stale identity", () => {
  const adverse = buildPortfolioRiskReport(context([active("alpha", "Alpha", 80, 100)]), DEFAULT_INTELLIGENCE_POLICY);
  const recovered = buildPortfolioRiskReport(context([active("alpha", "Alpha", 110, 100)]), DEFAULT_INTELLIGENCE_POLICY);
  assert.ok(adverse.risks.some(risk => risk.id === "project:alpha:cost_performance" && risk.severity === "critical"));
  assert.ok(!recovered.risks.some(risk => risk.id === "project:alpha:cost_performance"));
  assert.ok(recovered.favorableCount > adverse.favorableCount);
});

test("equivalent portfolio components are deduplicated", () => {
  const report = buildPortfolioRiskReport(context([active("alpha", "Alpha", 80, 100)]), DEFAULT_INTELLIGENCE_POLICY);
  assert.equal(report.risks.filter(risk => risk.scope === "portfolio" && risk.family === "cost performance").length, 1);
  assert.equal(new Set(report.risks.map(risk => risk.id)).size, report.risks.length);
});

test("scenario exposure is separate from current-risk totals", () => {
  const base = context([active("alpha", "Alpha", 110, 100)]);
  const withoutScenario = buildPortfolioRiskReport(base, DEFAULT_INTELLIGENCE_POLICY);
  const withScenario = buildPortfolioRiskReport({ ...base, scenario: { who: "ALL", costStress: 50, revenueRealization: 50, indirectStress: 50, currentAc: 100, eac: 250, revenue: 100, profit: -150, margin: -1.5 } }, DEFAULT_INTELLIGENCE_POLICY);
  assert.equal(withScenario.scenario?.status, "critical");
  assert.equal(withScenario.criticalCount, withoutScenario.criticalCount);
  assert.equal(withScenario.cautionCount, withoutScenario.cautionCount);
  assert.equal(withScenario.unavailableCount, withoutScenario.unavailableCount);
});

test("management answers are validated and serialized policy is reconstructed", () => {
  const policy = riskPolicyFromAnswers(DEFAULT_RISK_SETTINGS_ANSWERS);
  assert.ok(policy);
  assert.equal(policy?.cpiCaution, .95);
  assert.equal(policy?.cvCautionPct, -5);
  assert.equal(riskPolicyFromAnswers({ ...DEFAULT_RISK_SETTINGS_ANSWERS, cashDeficitCriticalPct: 2 }), null);
  const saved: SavedRiskSettings = { version: 1, savedAt: "2026-08-29T00:00:00.000Z", answers: DEFAULT_RISK_SETTINGS_ANSWERS, policy: policy! };
  assert.deepEqual(parseSavedRiskSettings(JSON.stringify(saved)), saved);
  assert.equal(parseSavedRiskSettings("{invalid"), null);
});

test("draft answers cannot alter results until their validated policy is supplied", () => {
  const item = active("alpha", "Alpha", 96, 100);
  const defaultReport = buildPortfolioRiskReport(context([item]), DEFAULT_INTELLIGENCE_POLICY);
  const draft = { ...DEFAULT_RISK_SETTINGS_ANSWERS, cpiCritical: .99 };
  const stillDefault = buildPortfolioRiskReport(context([item]), DEFAULT_INTELLIGENCE_POLICY);
  const savedPolicy = riskPolicyFromAnswers(draft)!;
  const afterSave = buildPortfolioRiskReport(context([item]), savedPolicy);
  assert.deepEqual(stillDefault.risks, defaultReport.risks);
  assert.ok(afterSave.risks.some(risk => risk.id === "project:alpha:cost_performance" && risk.severity === "critical"));
});

test("a stable negative cash position is adverse and never favorable", () => {
  const cashflow = [
    { month: "2026-04", cash_in: 10, cash_out: 20, cash_in_cum: 10, cash_out_cum: 20 },
    { month: "2026-05", cash_in: 10, cash_out: 20, cash_in_cum: 20, cash_out_cum: 40 },
    { month: "2026-06", cash_in: 10, cash_out: 20, cash_in_cum: 30, cash_out_cum: 60 },
  ];
  const report = buildPortfolioRiskReport(context([active("cash", "Cash Pressure", 110, 100, { cashflow })]), DEFAULT_INTELLIGENCE_POLICY);
  const cashRisks = report.risks.filter(risk => risk.affectedProjectIds.includes("cash") && ["cumulative cashflow", "cashflow trend"].includes(risk.family));
  assert.ok(cashRisks.length >= 2);
  assert.ok(cashRisks.every(risk => risk.severity === "critical" || risk.severity === "caution"));
});

test("missing cash evidence remains unavailable and is not converted to zero", () => {
  const complete = active("complete", "Complete", 110, 100);
  const missing = active("missing", "Missing", 110, 100, { cashflow: [{ month: "2026-06" }] });
  const report = buildPortfolioRiskReport(context([complete, missing]), DEFAULT_INTELLIGENCE_POLICY);
  assert.ok(report.risks.some(risk => risk.id === "portfolio:portfolio:cumulative_cashflow" && risk.severity === "unavailable"));
  assert.ok(report.risks.some(risk => risk.id === "project:missing:cumulative_cashflow" && risk.severity === "unavailable"));
});

test("project reporting periods and revisions stay isolated", () => {
  const april = active("april", "April Project", 80, 100, { period: "2026-04", sourceFingerprint: "april-revision-a" });
  const june = active("june", "June Project", 90, 100, { period: "2026-06", sourceFingerprint: "june-revision-b" });
  const report = buildPortfolioRiskReport(context([april, june]), DEFAULT_INTELLIGENCE_POLICY);
  const aprilRisk = report.risks.find(risk => risk.id === "project:april:cost_performance");
  const juneRisk = report.risks.find(risk => risk.id === "project:june:cost_performance");
  assert.equal(aprilRisk?.period, "2026-04");
  assert.equal(aprilRisk?.revision, "april-revision-a");
  assert.equal(juneRisk?.period, "2026-06");
  assert.equal(juneRisk?.revision, "june-revision-b");
});

test("portfolio clusters roll project findings into overall control families without losing contributors", () => {
  const report = buildPortfolioRiskReport(context([
    active("alpha", "Alpha", 80, 100),
    active("beta", "Beta", 85, 100),
  ]), DEFAULT_INTELLIGENCE_POLICY);
  const clusters = buildPortfolioRiskClusters(report);
  const cost = clusters.find(cluster => cluster.family === "cost performance");
  assert.ok(cost);
  assert.equal(cost?.severity, "critical");
  assert.ok((cost?.criticalCount || 0) >= 2);
  assert.deepEqual(cost?.affectedProjects.sort(), ["Alpha", "Beta"]);
  assert.ok(cost?.assessments.every(item => item.family === "cost performance"));
  assert.equal(new Set(clusters.map(cluster => cluster.family)).size, clusters.length);
});
