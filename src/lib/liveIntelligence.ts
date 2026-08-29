import type { ProjectData, ProjectRegistryItem } from "@/lib/types";
import type { ProjectView } from "@/lib/projectViews";
import { aggregate, firstNum, portfolioBase, scoped, unpackExpenses } from "@/lib/normalized";

export type InsightStatus = "critical" | "caution" | "favorable" | "mixed" | "informational" | "unavailable";
export type InsightKind = "kpi" | "chart" | "table" | "scenario" | "assurance";
export type SemanticType =
  | "cost_performance" | "profitability" | "cashflow" | "cumulative_cashflow"
  | "cashflow_trend"
  | "cost_mix" | "concentration" | "waste" | "reconciliation" | "forecast" | "indirect_variance"
  | "cost_table" | "ledger_trend" | "data_quality" | "scenario" | "inventory";

export type IntelligencePolicy = {
  version: 1;
  cpiFavorable: number;
  cpiCaution: number;
  cvCautionPct: number;
  vacCautionPct: number;
  marginTargetPct: number;
  cashDeficitCautionPct: number;
  cashDeficitCriticalPct: number;
  wasteCautionPoints: number;
  wasteCriticalPoints: number;
  reconciliationCautionPct: number;
  reconciliationCriticalPct: number;
  concentrationCautionPct: number;
  concentrationCriticalPct: number;
  minimumTrendPeriods: number;
  trendRSquaredCautionFloor: number;
  trendAnomalyCautionZ: number;
  trendAnomalyCriticalZ: number;
};

export const DEFAULT_INTELLIGENCE_POLICY: IntelligencePolicy = {
  version: 1,
  cpiFavorable: 1,
  cpiCaution: .95,
  cvCautionPct: -5,
  vacCautionPct: -5,
  marginTargetPct: 0,
  cashDeficitCautionPct: 5,
  cashDeficitCriticalPct: 15,
  wasteCautionPoints: 1,
  wasteCriticalPoints: 3,
  reconciliationCautionPct: 1,
  reconciliationCriticalPct: 5,
  concentrationCautionPct: 25,
  concentrationCriticalPct: 40,
  minimumTrendPeriods: 3,
  trendRSquaredCautionFloor: .5,
  trendAnomalyCautionZ: 2,
  trendAnomalyCriticalZ: 3,
};

export type IntelligenceDescriptor = {
  componentId: string;
  componentName: string;
  kind: InsightKind;
  family: string;
  semanticType: SemanticType;
  projectId: string;
  projectName: string;
  period: string;
  revision: string;
  metrics: Record<string, number | null>;
  rows?: Record<string, unknown>[];
  series?: { label: string; values: (number | null)[] }[];
  labels?: string[];
  sourceEvidence: string[];
  extractionConfidence: number;
  assessmentBasis: "source" | "derived" | "scenario" | "evidence";
  filters?: Record<string, string>;
};

export type IntelligenceResult = {
  componentId: string;
  componentName: string;
  projectId: string;
  projectName: string;
  period: string;
  revision: string;
  kind: InsightKind;
  family: string;
  status: InsightStatus;
  confidence: number;
  assessmentBasis: string;
  metrics: Record<string, number | null>;
  sourceEvidence: string[];
  meaning: string;
  indication: string;
  reason: string;
  risks: string[];
  benefits: string[];
  decision: string;
  mitigation: string[];
  keepOnTrack: string[];
  ruleApplied: string;
  thresholds: Record<string, number>;
  mlMappingScore: number | null;
  mlMappedFamily: string | null;
  unavailableReason: string | null;
};

export type ProjectIntelligenceContext = {
  kind: "project";
  view: ProjectView;
  data: ProjectData;
  normalized: Record<string, any>;
};

export type PortfolioScenario = { who: string; costStress: number; revenueRealization: number; indirectStress: number; currentAc: number; eac: number; revenue: number; profit: number; margin: number };
export type PortfolioIntelligenceContext = {
  kind: "portfolio";
  view: "charts" | "analysis" | "risk" | "projects" | "intelligence" | "output";
  scope: "dashboard" | "total";
  projects: ProjectRegistryItem[];
  active: any[];
  scenario?: PortfolioScenario;
  conflicts?: { severity?: string; code?: string; title?: string }[];
};
export type DashboardIntelligenceContext = ProjectIntelligenceContext | PortfolioIntelligenceContext;

export const INTELLIGENCE_CONTEXT_EVENT = "cto:live-intelligence-context";
export function publishIntelligenceContext(detail: DashboardIntelligenceContext) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(INTELLIGENCE_CONTEXT_EVENT, { detail }));
}

const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const number = (value: unknown): number => finite(value) ?? 0;
const rows = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value : [];
const total = (items: Record<string, any>[], key: string) => items.reduce((sum, item) => sum + number(item?.[key]), 0);
const ratioPct = (value: number, base: number) => base ? value / Math.abs(base) * 100 : null;
const source = (data: ProjectData, label: string) => [`${data.source.filename} · ${data.reporting_period}`, `${label} · SHA-256 ${data.source.sha256.slice(0, 16)}…`];
const descriptor = (data: ProjectData, view: ProjectView, componentId: string, componentName: string, kind: InsightKind, semanticType: SemanticType, metrics: Record<string, number | null>, extra: Partial<IntelligenceDescriptor> = {}): IntelligenceDescriptor => ({
  componentId, componentName, kind, semanticType, family: view.split("-")[0], projectId: data.project_id,
  projectName: data.project_name, period: data.reporting_period, revision: data.source.sha256,
  metrics, sourceEvidence: source(data, componentName), extractionConfidence: data.approved_parity?.matched ? 1 : .86,
  assessmentBasis: "derived", ...extra,
});

export function cashflowTrendMetrics(items: Record<string, any>[]) {
  const points = items.map(item => {
    const cashIn = finite(item.cash_in_cum), cashOut = finite(item.cash_out_cum);
    return cashIn != null && cashOut != null ? { cashIn, cashOut, net: cashIn - cashOut } : null;
  }).filter((item): item is { cashIn: number; cashOut: number; net: number } => item != null);
  const periods = points.length, last = points.at(-1);
  if (periods < 2) return { periods, slope: null, intercept: null, rSquared: null, forecastNextNet: null, maxResidualZ: null, lastNet: last?.net ?? null, latestCashIn: last?.cashIn ?? null, latestCashOut: last?.cashOut ?? null };
  const meanX = (periods - 1) / 2, meanY = points.reduce((sum, point) => sum + point.net, 0) / periods;
  const ssXX = points.reduce((sum, _point, index) => sum + (index - meanX) ** 2, 0);
  const ssXY = points.reduce((sum, point, index) => sum + (index - meanX) * (point.net - meanY), 0);
  const slope = ssXX ? ssXY / ssXX : 0, intercept = meanY - slope * meanX;
  const residuals = points.map((point, index) => point.net - (slope * index + intercept));
  const ssTotal = points.reduce((sum, point) => sum + (point.net - meanY) ** 2, 0);
  const ssResidual = residuals.reduce((sum, residual) => sum + residual ** 2, 0);
  const rSquared = ssTotal ? Math.max(0, Math.min(1, 1 - ssResidual / ssTotal)) : 1;
  const residualMean = residuals.reduce((sum, residual) => sum + residual, 0) / periods;
  const residualStd = Math.sqrt(residuals.reduce((sum, residual) => sum + (residual - residualMean) ** 2, 0) / periods);
  const maxResidualZ = residualStd ? Math.max(...residuals.map(residual => Math.abs((residual - residualMean) / residualStd))) : 0;
  return { periods, slope, intercept, rSquared, forecastNextNet: slope * periods + intercept, maxResidualZ, lastNet: last?.net ?? null, latestCashIn: last?.cashIn ?? null, latestCashOut: last?.cashOut ?? null };
}

function positiveConcentration(items: Record<string, any>[], label: (item: Record<string, any>) => string, value: (item: Record<string, any>) => number | null) {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const amount = value(item);
    if (amount == null || amount <= 0) continue;
    const key = label(item).trim().toLowerCase() || "other";
    grouped.set(key, (grouped.get(key) || 0) + amount);
  }
  const values = [...grouped.values()].sort((a, b) => b - a);
  return { rowCount: grouped.size, total: values.reduce((sum, amount) => sum + amount, 0), top: values[0] ?? null };
}

function projectCostMetrics(data: ProjectData, norm: Record<string, any>) {
  const preferred = (key: string) => finite((data.metrics?.[key] as any)?.preferred?.value);
  const k = norm?.kpis || {};
  const ev = finite(firstNum(k.ev_dashboard_scope, preferred("earned_value")));
  const ac = finite(firstNum(k.actual_cost_dashboard_scope, preferred("actual_cost")));
  const budget = finite(firstNum(k.total_budget_cost, preferred("budget")));
  return { budget, ev, ac, cv: ev != null && ac != null ? ev - ac : null, cpi: ev != null && ac ? ev / ac : null };
}

export function buildProjectDescriptors(context: ProjectIntelligenceContext, requestedView = context.view): IntelligenceDescriptor[] {
  const { data, normalized: norm } = context;
  const k = norm?.kpis || {}, base = projectCostMetrics(data, norm), out: IntelligenceDescriptor[] = [];
  const add = (id: string, name: string, kind: InsightKind, semantic: SemanticType, metrics: Record<string, number | null>, extra: Partial<IntelligenceDescriptor> = {}) => out.push(descriptor(data, requestedView, id, name, kind, semantic, metrics, extra));
  const itemRows = rows(norm?.project_items), directRows = rows(norm?.direct_details), indirectRows = rows(norm?.indirect_details);
  if (requestedView === "executive-overview") {
    add("executive-kpis", "Executive KPI cards", "kpi", "cost_performance", { ...base, contract: finite(k.contract_price_dashboard), directActual: finite(k.direct_actual), indirectActual: finite(k.indirect_actual), revenue: finite(k.revenue_gross_profit), ledger: finite(k.ledger_accounting_cost) });
    add("division-cost-position", "Budget vs Earned Value vs Actual Cost — by division", "chart", "cost_performance", base, { rows: itemRows });
    add("cost-performance-map", "Cost Performance Map", "chart", "cost_table", { rowCount: itemRows.length, adverseRows: itemRows.filter(r => finite(r.cpi_to_date) != null && number(r.cpi_to_date) < 1).length }, { rows: itemRows });
  } else if (requestedView === "executive-commercial") {
    const p = rows(norm?.profitability), chosen = p.find(x => String(x.method || "").toLowerCase().includes("revenue")) || p[0] || {};
    add("profitability", "Profitability — source methods kept separate", "chart", "profitability", { profit: finite(chosen.profit), margin: finite(chosen.profit_pct), methodCount: p.length }, { rows: p });
    const cash = rows(norm?.cashflow), last = cash.at(-1) || {}, neg = cash.filter(x => number(x.cash_in) - number(x.cash_out) < 0).length;
    add("monthly-cashflow", "Monthly Cashflow — Cash In vs Cash Out", "chart", "cashflow", { periods: cash.length, negativePeriods: neg, latestCashIn: finite(last.cash_in), latestCashOut: finite(last.cash_out), latestNet: finite(last.cash_in) != null && finite(last.cash_out) != null ? number(last.cash_in) - number(last.cash_out) : null }, { rows: cash });
    add("cumulative-cashflow", "Cumulative Cashflow / S-Curve", "chart", "cumulative_cashflow", { periods: cash.length, cumulativeCashIn: finite(last.cash_in_cum), cumulativeCashOut: finite(last.cash_out_cum), cumulativeNet: finite(last.cash_in_cum) != null && finite(last.cash_out_cum) != null ? number(last.cash_in_cum) - number(last.cash_out_cum) : null }, { rows: cash });
    add("cashflow-trend", "Cashflow Trend Forecast", "chart", "cashflow_trend", cashflowTrendMetrics(cash), { rows: cash });
  } else if (requestedView === "executive-resources") {
    const resourceRows = rows(norm?.boq_resources), resources = aggregate(resourceRows, r => String(r.resource || r.resource_code || "Other"), r => number(r.actual_cost));
    add("resource-pareto", "Direct Resource Cost Pareto", "chart", "concentration", positiveConcentration(resourceRows, r => String(r.resource || r.resource_code || "Other"), r => finite(r.actual_cost)), { labels: resources.map(x => x.name), series: [{ label: "Actual Cost", values: resources.map(x => x.value) }] });
    const waste = rows(norm?.waste), actual = waste.find(x => String(x.label).toLowerCase().includes("% actual waste")) || {}, budget = waste.find(x => String(x.label).toLowerCase().includes("% budget waste")) || {};
    add("waste-efficiency", "Waste Efficiency", "chart", "waste", { steelActual: finite(actual.steel), steelBudget: finite(budget.steel), concreteActual: finite(actual.concrete), concreteBudget: finite(budget.concrete) });
    const raw = finite(k.ledger_raw_direct), equipment = finite(norm?.reallocation?.equipment), other = finite(norm?.reallocation?.other_costs), reported = finite(k.direct_actual);
    add("classification-bridge", "Accounting to Cost-Control Classification Bridge", "chart", "reconciliation", { accounting: raw != null ? raw + number(equipment) + number(other) : null, reported, rawDirect: raw, equipment, other });
  } else if (requestedView === "forecast-performance") {
    add("wbs-performance", "Project Summary / WBS table", "table", "cost_table", { ...base, rowCount: itemRows.length, adverseRows: itemRows.filter(r => finite(r.cpi_to_date) != null && number(r.cpi_to_date) < 1).length }, { rows: itemRows });
    add("project-total-rows", "Project Summary group / total rows", "table", "inventory", { rowCount: rows(norm?.project_totals).length }, { rows: rows(norm?.project_totals), assessmentBasis: "evidence" });
  } else if (requestedView === "forecast-boq-actual") {
    const boq = rows(norm?.boq_resources), common = positiveConcentration(boq, r => String(r.resource || r.resource_code || "Other"), r => finite(r.actual_cost));
    add("boq-resource-chart", "BOQ Resource Actual Cost chart", "chart", "concentration", common, { rows: boq });
    add("boq-resource-table", "Detailed BOQ Resource Explorer table", "table", "concentration", common, { rows: boq });
  } else if (requestedView === "forecast-boq-outlook") {
    const forecast = rows(norm?.boq_forecasts);
    add("boq-forecast", "Detailed BOQ Forecast Analysis table", "table", "forecast", { rowCount: forecast.length, bac: total(forecast, "bac"), ev: total(forecast, "ev"), etc: total(forecast, "etc"), remainingBudget: total(forecast, "remaining_budget") }, { rows: forecast });
  } else if (requestedView === "structure-direct") {
    add("direct-details", "Direct Details table", "table", "cost_table", { rowCount: directRows.length, budget: total(directRows, "original_budget"), ev: total(directRows, "ev"), ac: total(directRows, "ac"), cv: total(directRows, "cv"), vac: total(directRows, "vac") }, { rows: directRows });
  } else if (requestedView === "structure-indirect") {
    add("indirect-details", "Indirect Cost Detail table", "table", "cost_table", { rowCount: indirectRows.length, budget: total(indirectRows, "original_budget"), ev: total(indirectRows, "ev"), ac: total(indirectRows, "ac"), cv: total(indirectRows, "cv"), vac: total(indirectRows, "vac") }, { rows: indirectRows });
    const pools = [...rows(norm?.indirect_granular), ...rows(norm?.indirect_official)];
    add("indirect-pools", "Indirect Cost Pools table", "table", "cost_mix", { rowCount: pools.length, total: total(pools, "cost") }, { rows: pools, assessmentBasis: "source" });
  } else if (requestedView === "structure-allocation") {
    const alloc = rows(norm?.direct_alloc), waste = rows(norm?.waste), details = rows(norm?.waste_detail);
    add("direct-allocation", "Indirect-Direct Breakdown table", "table", "reconciliation", { rowCount: alloc.length, actual: total(alloc, "actual_cost"), equipment: total(alloc, "equipment_realloc"), other: total(alloc, "other_cost_realloc") }, { rows: alloc });
    add("waste-report", "Waste Report table", "table", "waste", { rowCount: waste.length }, { rows: waste });
    if (details.length) add("waste-detail", "Waste Detail table", "table", "waste", { rowCount: details.length }, { rows: details });
  } else if (requestedView === "ledger-analytics") {
    const trend = rows(norm?.ledger_months), last = trend.at(-1) || {}, bySource = rows(norm?.ledger_aggregates?.by_source), byCode = rows(norm?.ledger_aggregates?.by_code);
    add("ledger-trend", "Actual Expense Trend — source ledger", "chart", "ledger_trend", { periods: trend.length, latest: finite(last.total), total: total(trend, "total") }, { rows: trend });
    add("expense-source-mix", "Expense Source Mix", "chart", "cost_mix", { categoryCount: bySource.length, total: total(bySource, "value") }, { rows: bySource });
    add("top-cost-codes", "Top Cost Codes by Actual Ledger Cost", "chart", "concentration", positiveConcentration(byCode, r => String(r.code || r.name || r.label || "Other"), r => finite(r.value)), { rows: byCode });
    add("ledger-reconciliation", "Ledger Reconciliation", "chart", "reconciliation", { accounting: finite(k.ledger_accounting_cost), reported: finite(k.actual_cost_dashboard_scope), rawDirect: finite(k.ledger_raw_direct), rawIndirect: finite(k.ledger_raw_indirect) });
  } else if (requestedView === "ledger-transactions") {
    const expenseRows = unpackExpenses(norm);
    add("expense-ledger", "Actual Expense Ledger table", "table", "ledger_trend", { rowCount: expenseRows.length, total: total(expenseRows, "total_cost") }, { rows: expenseRows });
  } else if (requestedView === "ledger-codes") {
    const codes = rows(norm?.cost_codes);
    add("cost-code-register", "Cost Code Lookup table", "table", "inventory", { rowCount: codes.length }, { rows: codes, assessmentBasis: "evidence" });
  } else if (requestedView === "assurance-quality") {
    const quality = [...rows(norm?.data_quality), ...rows(data.quality).filter(x => !String(x.code).startsWith("APPROVED_SOURCE_OBSERVATION"))];
    const severe = quality.filter(x => ["critical", "error"].includes(String(x.severity).toLowerCase())).length;
    const warnings = quality.filter(x => String(x.severity).toLowerCase() === "warning").length;
    add("data-quality", "Data Quality findings", "assurance", "data_quality", { findings: quality.length, severe, warnings }, { rows: quality, assessmentBasis: "evidence" });
    add("source-lineage", "Source Lineage", "assurance", "inventory", { sheets: data.manifest.sheet_count, tables: data.manifest.detected_table_count, charts: data.manifest.excel_chart_count, cells: data.manifest.cell_count }, { assessmentBasis: "evidence" });
    add("adaptive-coverage", "Adaptive Workbook Coverage", "assurance", "data_quality", { sheets: data.manifest.sheet_count, tables: data.manifest.detected_table_count, charts: data.manifest.excel_chart_count, cells: data.manifest.cell_count, unaccountedSheets: data.manifest.unaccounted_sheets }, { assessmentBasis: "evidence" });
  }
  return out;
}

export function buildWholeProjectDescriptors(context: ProjectIntelligenceContext) {
  const views: ProjectView[] = ["executive-overview", "executive-commercial", "executive-resources", "forecast-performance", "forecast-boq-actual", "forecast-boq-outlook", "structure-direct", "structure-indirect", "structure-allocation", "ledger-analytics", "ledger-transactions", "ledger-codes", "assurance-quality"];
  return views.flatMap(view => buildProjectDescriptors(context, view));
}

export function buildPortfolioDescriptors(context: PortfolioIntelligenceContext): IntelligenceDescriptor[] {
  if (context.view === "risk") {
    const combined = [
      ...buildPortfolioDescriptors({ ...context, view: "charts" }),
      ...buildPortfolioDescriptors({ ...context, view: "analysis" }).filter(item => item.semanticType !== "scenario"),
    ];
    return combined.filter((item, index) => combined.findIndex(other => other.componentId === item.componentId) === index);
  }
  const active = context.active || [], projectName = active.length === 1 ? active[0].name : `${active.length} selected projects`;
  const period = [...new Set(active.map(x => x.period))].sort().join(" · ") || "No period";
  const revision = active.map(x => x.registry?.source_fingerprint || "").filter(Boolean).join("|");
  const d = (id: string, name: string, kind: InsightKind, semanticType: SemanticType, metrics: Record<string, number | null>, extra: Partial<IntelligenceDescriptor> = {}): IntelligenceDescriptor => ({ componentId: id, componentName: name, kind, semanticType, family: "portfolio", projectId: "portfolio", projectName, period, revision, metrics, sourceEvidence: active.map(x => `${x.name} · ${x.period} · ${String(x.registry?.source_fingerprint || "").slice(0, 12)}…`), extractionConfidence: active.length ? .9 : 0, assessmentBasis: "derived", ...extra });
  if (context.view === "projects") {
    const revisions = context.projects.reduce((sum, project) => sum + Math.max(project.history?.length || 0, 1), 0);
    return [{
      componentId: "project-registry-cards", componentName: "Project Registry cards", kind: "table", semanticType: "inventory", family: "projects",
      projectId: "portfolio", projectName: `${context.projects.length} registered projects`, period: "Current registry", revision: context.projects.map(project => project.source_fingerprint).join("|"),
      metrics: { projectCount: context.projects.length, revisionCount: revisions },
      rows: context.projects as unknown as Record<string, any>[], sourceEvidence: context.projects.map(project => `${project.project_name} · ${project.reporting_period} · ${project.source_fingerprint.slice(0, 12)}…`),
      extractionConfidence: 1, assessmentBasis: "evidence",
    }];
  }
  if (context.view === "intelligence") {
    const revisions = context.projects.reduce((sum, project) => sum + Math.max(project.history?.length || 0, 1), 0);
    const quality = context.projects.reduce((sum, project) => sum + number(project.quality_count), 0);
    const severe = (context.conflicts || []).filter(item => ["critical", "error"].includes(String(item.severity).toLowerCase())).length;
    const evidence = context.projects.map(project => `${project.project_name} · ${project.reporting_period} · ${project.source_fingerprint.slice(0, 12)}…`);
    const common = { projectId: "portfolio", projectName: `${context.projects.length} registered projects`, period: "All registered periods", revision: context.projects.map(project => project.source_fingerprint).join("|"), family: "intelligence", extractionConfidence: 1, sourceEvidence: evidence };
    return [
      { ...common, componentId: "monthly-history", componentName: "Validated Monthly / Revision History", kind: "table", semanticType: "inventory", metrics: { projectCount: context.projects.length, revisionCount: revisions }, rows: context.projects as unknown as Record<string, any>[], assessmentBasis: "evidence" },
      { ...common, componentId: "portfolio-data-quality", componentName: "Portfolio Data Quality", kind: "assurance", semanticType: "data_quality", metrics: { findings: quality + (context.conflicts?.length || 0), severe, warnings: Math.max(quality - severe, 0) }, rows: (context.conflicts || []) as Record<string, any>[], assessmentBasis: "evidence" },
      { ...common, componentId: "source-registry", componentName: "Source Registry", kind: "table", semanticType: "inventory", metrics: { projectCount: context.projects.length, sheetCount: context.projects.reduce((sum, project) => sum + number(project.sheet_count), 0), chartCount: context.projects.reduce((sum, project) => sum + number(project.chart_count), 0) }, rows: context.projects as unknown as Record<string, any>[], assessmentBasis: "evidence" },
    ];
  }
  if (context.view === "output") return [];
  const sumWhenAvailable = (available: (item: any) => boolean, value: (item: any) => unknown) => active.some(available) ? active.reduce((sum, item) => sum + number(value(item)), 0) : null;
  const budget = sumWhenAvailable(x => finite(x.normalized?.kpis?.total_budget_cost) != null || finite(x.registry?.metrics?.budget) != null, x => x.budget);
  const ev = sumWhenAvailable(x => finite(x.normalized?.kpis?.ev_dashboard_scope) != null || finite(x.registry?.metrics?.earned_value) != null, x => x.ev);
  const ac = sumWhenAvailable(x => finite(x.normalized?.kpis?.actual_cost_dashboard_scope) != null || finite(x.registry?.metrics?.actual_cost) != null, x => x.ac);
  const revenue = sumWhenAvailable(x => finite(x.normalized?.kpis?.revenue_gross_profit) != null || rows(x.normalized?.profitability).length > 0, x => x.revenue);
  const gp = sumWhenAvailable(x => rows(x.normalized?.profitability).some(row => finite(row.profit) != null) || finite(x.registry?.metrics?.gross_profit) != null, x => x.gp);
  const common = { budget, ev, ac, cv: ev != null && ac != null ? ev - ac : null, cpi: ev != null && ac ? ev / ac : null };
  const out = [d("portfolio-kpis", "Portfolio KPI cards", "kpi", "cost_performance", { ...common, revenue, profit: gp, margin: revenue && gp != null ? gp / revenue : null, projectCount: active.length })];
  if (context.view === "charts") {
    out.push(d("portfolio-position", "Portfolio Cost Position", "chart", "cost_performance", common, { rows: active }));
    out.push(d("portfolio-margin", "Margin vs Cost Performance", "chart", "profitability", { profit: gp, margin: revenue && gp != null ? gp / revenue : null, cpi: common.cpi }, { rows: active }));
    out.push(d("portfolio-mix", "Direct vs Indirect Actual Cost", "chart", "cost_mix", { direct: active.reduce((s, x) => s + number(x.directAc), 0), indirect: active.reduce((s, x) => s + number(x.indirectAc), 0) }, { rows: active }));
    out.push(d("portfolio-profit", "Revenue, Actual Cost & Gross Profit", "chart", "profitability", { revenue, actualCost: ac, profit: gp, margin: revenue && gp != null ? gp / revenue : null }, { rows: active }));
    const cash = active.flatMap(x => rows(x.cashflow)), latestCash = active.map(x => rows(x.cashflow).at(-1));
    const completeCumulativeCash = active.length > 0 && latestCash.every(row => finite(row?.cash_in_cum) != null && finite(row?.cash_out_cum) != null);
    const lastIn = completeCumulativeCash ? latestCash.reduce((sum, row) => sum + number(row?.cash_in_cum), 0) : null;
    const lastOut = completeCumulativeCash ? latestCash.reduce((sum, row) => sum + number(row?.cash_out_cum), 0) : null;
    out.push(d("portfolio-cashflow", "Portfolio Cashflow Comparison", "chart", "cumulative_cashflow", { periods: new Set(cash.map(x => x.month)).size, cumulativeCashIn: lastIn, cumulativeCashOut: lastOut, cumulativeNet: lastIn != null && lastOut != null ? lastIn - lastOut : null }, { rows: cash }));
  } else {
    out.push(d("technical-matrix", "CTO Technical Cost Matrix", "table", "cost_table", { ...common, rowCount: active.length, adverseRows: active.filter(x => x.cpi != null && x.cpi < 1).length }, { rows: active }));
    const cash = active.flatMap(x => rows(x.cashflow));
    const latestCash = active.map(x => rows(x.cashflow).at(-1));
    const completeLatestCash = active.length > 0 && latestCash.every(row => finite(row?.cash_in) != null && finite(row?.cash_out) != null);
    const latestCashIn = completeLatestCash ? latestCash.reduce((sum, row) => sum + number(row?.cash_in), 0) : null;
    const latestCashOut = completeLatestCash ? latestCash.reduce((sum, row) => sum + number(row?.cash_out), 0) : null;
    const cashMetrics = {
      periods: new Set(cash.map(x => x.month)).size,
      projectCount: active.length,
      negativePeriods: cash.filter(x => finite(x.cash_in) != null && finite(x.cash_out) != null && number(x.cash_in) - number(x.cash_out) < 0).length,
      latestCashIn,
      latestCashOut,
      latestNet: latestCashIn != null && latestCashOut != null ? latestCashIn - latestCashOut : null,
    };
    out.push(d("monthly-comparison-chart", "CTO Monthly Cost Comparison chart", "chart", "cashflow", cashMetrics, { rows: cash }));
    out.push(d("monthly-comparison-table", "CTO Monthly Cost Comparison table", "table", "cashflow", cashMetrics, { rows: cash }));
    const s = context.scenario;
    out.push(d("scenario-lab", "CTO Cost Scenario Lab", "scenario", "scenario", { currentAc: finite(s?.currentAc), eac: finite(s?.eac), revenue: finite(s?.revenue), profit: finite(s?.profit), margin: finite(s?.margin), costStress: finite(s?.costStress), revenueRealization: finite(s?.revenueRealization), indirectStress: finite(s?.indirectStress) }, { assessmentBasis: "scenario" }));
  }
  return out;
}

export function validateIntelligencePolicy(value: unknown): IntelligencePolicy | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>, out = { ...DEFAULT_INTELLIGENCE_POLICY } as Record<string, number>;
  for (const key of Object.keys(DEFAULT_INTELLIGENCE_POLICY)) {
    if (key === "version") continue;
    const v = candidate[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    out[key] = v;
  }
  if (out.cpiCaution > out.cpiFavorable || out.reconciliationCautionPct > out.reconciliationCriticalPct || out.cashDeficitCautionPct > out.cashDeficitCriticalPct || out.concentrationCautionPct > out.concentrationCriticalPct || out.wasteCautionPoints > out.wasteCriticalPoints || out.minimumTrendPeriods < 2 || out.trendRSquaredCautionFloor < 0 || out.trendRSquaredCautionFloor > 1 || out.trendAnomalyCautionZ <= 0 || out.trendAnomalyCautionZ > out.trendAnomalyCriticalZ) return null;
  return { ...(out as unknown as IntelligencePolicy), version: 1 };
}

const statusRank: Record<InsightStatus, number> = { critical: 0, caution: 1, mixed: 2, favorable: 3, informational: 4, unavailable: 5 };
export const sortIntelligenceResults = (items: IntelligenceResult[]) => [...items].sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.componentName.localeCompare(b.componentName));

function baseResult(d: IntelligenceDescriptor): IntelligenceResult {
  return { componentId: d.componentId, componentName: d.componentName, projectId: d.projectId, projectName: d.projectName, period: d.period, revision: d.revision, kind: d.kind, family: d.family, status: "informational", confidence: d.extractionConfidence, assessmentBasis: d.assessmentBasis, metrics: d.metrics, sourceEvidence: d.sourceEvidence, meaning: "This component presents controlled project-cost evidence.", indication: "The values are available for management review.", reason: "No unsupported judgment has been applied.", risks: [], benefits: [], decision: "Review the controlled evidence in its stated accounting and reporting scope.", mitigation: [], keepOnTrack: [], ruleApplied: "Evidence-only assessment", thresholds: {}, mlMappingScore: null, mlMappedFamily: null, unavailableReason: null };
}

function unavailable(d: IntelligenceDescriptor, reason: string): IntelligenceResult {
  return { ...baseResult(d), status: "unavailable", confidence: 0, indication: "Unable to assess.", reason, decision: "Resolve the missing or low-confidence source data before making a financial decision.", ruleApplied: "Missing-data guard", unavailableReason: reason };
}

export function evaluateDescriptor(d: IntelligenceDescriptor, p: IntelligencePolicy): IntelligenceResult {
  const r = baseResult(d), m = d.metrics, valueCount = Object.values(m).filter(v => v != null && Number.isFinite(v)).length;
  if (!valueCount || d.extractionConfidence < .5) return unavailable(d, valueCount ? "Source mapping confidence is below the safe assessment threshold." : "Required controlled metrics are unavailable for this component.");
  if (d.semanticType === "cost_performance" || d.semanticType === "cost_table") {
    const ev = m.ev, ac = m.ac, cpi = m.cpi ?? (ev != null && ac ? ev / ac : null), cv = m.cv ?? (ev != null && ac != null ? ev - ac : null);
    if (ev === 0 && ac === 0) return unavailable(d, "Earned Value and Actual Cost are both zero, so cost efficiency cannot yet be assessed.");
    if (cpi == null && cv == null) return unavailable(d, "Earned Value and Actual Cost are not both available on a comparable scope.");
    const cvPct = cv != null && ev ? cv / Math.abs(ev) * 100 : null;
    r.meaning = "Compares value earned with cost consumed on the same reporting scope.";
    r.thresholds = { cpiFavorable: p.cpiFavorable, cpiCaution: p.cpiCaution, cvCautionPct: p.cvCautionPct };
    if ((cpi != null && cpi < p.cpiCaution) || (cvPct != null && cvPct < p.cvCautionPct)) {
      r.status = "critical"; r.indication = "Cost performance is materially off track."; r.reason = `CPI/CV crossed the critical policy boundary${m.adverseRows ? `; ${m.adverseRows} detailed rows are below CPI 1.00` : ""}.`; r.risks = ["Forecast cost growth and margin erosion if the current efficiency continues.", "Adverse work packages may contaminate the remaining-cost forecast."]; r.decision = "Require a cost-recovery plan by the largest adverse work packages before approving the next forecast."; r.mitigation = ["Rank negative-CV items by value and assign an accountable owner.", "Reforecast ETC using current productivity and committed-cost evidence.", "Separate recoverable commercial exposure from operational overrun."];
    } else if ((cpi != null && cpi < p.cpiFavorable) || (cvPct != null && cvPct < 0)) {
      r.status = "caution"; r.indication = "Cost performance is under pressure but remains within the warning band."; r.reason = "CPI is below the on-track target or CV is slightly adverse."; r.risks = ["A small efficiency loss can compound across the remaining scope."]; r.decision = "Keep the project under weekly exception review until CPI returns to target."; r.mitigation = ["Review the top adverse cost codes and remaining quantities."];
    } else {
      r.status = "favorable"; r.indication = "Cost efficiency is on track against the current earned-value evidence."; r.reason = "CPI and CV meet the configured favorable boundaries."; r.benefits = ["The project is earning at least as much value as the cost consumed on this scope."]; r.decision = "Maintain the current controls and protect the favorable variance from unapproved scope or productivity loss."; r.keepOnTrack = ["Continue monthly CPI/CV trend review.", "Preserve the current cost-code and commitment controls."];
    }
    r.ruleApplied = "CPI and normalized CV/EV policy"; return r;
  }
  if (d.semanticType === "profitability") {
    const profit = m.profit, margin = m.margin, marginPct = margin != null ? margin * 100 : null;
    if (profit == null && margin == null) return unavailable(d, "No controlled profit method is available.");
    r.meaning = "Shows commercial return without merging different workbook profit methods."; r.thresholds = { marginTargetPct: p.marginTargetPct };
    if ((profit != null && profit < 0) || (marginPct != null && marginPct < 0)) { r.status = "critical"; r.indication = "The selected commercial basis indicates a loss."; r.reason = "Profit or margin is negative."; r.risks = ["Direct erosion of project return and possible funding pressure."]; r.decision = "Escalate loss drivers and approve a documented recovery scenario."; r.mitigation = ["Separate cost overrun, revenue shortfall, deductions, and claims exposure."]; }
    else if (marginPct == null || marginPct < p.marginTargetPct) { r.status = "caution"; r.indication = "Profit is non-negative but does not meet the configured margin target."; r.reason = "Positive profit alone is not treated as sufficient performance."; r.risks = ["The remaining margin may be too thin to absorb forecast risk."]; r.decision = "Protect margin and validate remaining revenue and cost exposure."; }
    else { r.status = "favorable"; r.indication = "The selected source method meets the configured margin target."; r.reason = "Profit is positive and margin meets policy."; r.benefits = ["Current commercial evidence provides a positive buffer against remaining uncertainty."]; r.decision = "Maintain revenue realization and cost discipline; continue keeping source methods separate."; r.keepOnTrack = ["Track deductions, unbilled revenue, and forecast-to-complete monthly."]; }
    r.ruleApplied = "Profit sign and configured margin floor"; return r;
  }
  if (d.semanticType === "cashflow" || d.semanticType === "cumulative_cashflow") {
    const cashIn = m.cumulativeCashIn ?? m.latestCashIn, cashOut = m.cumulativeCashOut ?? m.latestCashOut, net = m.cumulativeNet ?? m.latestNet;
    if (net == null && cashIn == null && cashOut == null) return unavailable(d, "Cash-in and cash-out values are unavailable.");
    if (cashIn === 0 && cashOut === 0 && net === 0) return unavailable(d, "Cash in and cash out are both zero, so no cash-performance conclusion is supported.");
    const deficitPct = net != null && net < 0 ? (cashIn ? Math.abs(net) / Math.abs(cashIn) * 100 : cashOut != null && cashOut > 0 ? 100 : 0) : 0;
    r.meaning = d.semanticType === "cumulative_cashflow" ? "Compares cumulative cash recovery with cumulative cash expenditure." : "Shows monthly cash movement and deficit frequency.";
    r.thresholds = { cashDeficitCautionPct: p.cashDeficitCautionPct, cashDeficitCriticalPct: p.cashDeficitCriticalPct };
    if (deficitPct >= p.cashDeficitCriticalPct) { r.status = "critical"; r.indication = "Cash out materially exceeds cash in."; r.reason = `The normalized deficit is ${deficitPct.toFixed(1)}% of cash in.`; r.risks = ["Funding pressure and delayed supplier/subcontractor obligations."]; r.decision = "Approve an immediate cash-recovery and payment-prioritization plan."; r.mitigation = ["Accelerate certified billing and collection.", "Sequence discretionary payments against critical-path needs."]; }
    else if ((net != null && net < 0) || number(m.negativePeriods) > 0) { r.status = "caution"; r.indication = "The cash position contains a deficit or adverse months."; r.reason = "Cash out exceeds cash in for part or all of the reviewed period."; r.risks = ["Repeated monthly deficits can become a cumulative funding gap."]; r.decision = "Review collection timing and near-term payment commitments weekly."; }
    else { r.status = "favorable"; r.indication = "Reported cash recovery covers reported cash expenditure."; r.reason = "Net cash is non-negative on the available source timeline."; r.benefits = ["Lower immediate project funding pressure."]; r.decision = "Maintain collection discipline and verify the position against upcoming commitments."; r.keepOnTrack = ["Monitor the next three-month payment and billing forecast."]; }
    r.ruleApplied = "Cash deficit normalized to cash in"; return r;
  }
  if (d.semanticType === "cashflow_trend") {
    const periods = number(m.periods);
    if (periods < p.minimumTrendPeriods) return unavailable(d, `At least ${p.minimumTrendPeriods} valid cumulative cash periods are required for trend analysis; ${periods} are available.`);
    const slope = m.slope, rSquared = m.rSquared, forecast = m.forecastNextNet, lastNet = m.lastNet, maxZ = m.maxResidualZ;
    if ([slope, rSquared, forecast, lastNet, maxZ].some(value => value == null)) return unavailable(d, "The controlled cashflow series could not produce a complete trend model.");
    const cashIn = m.latestCashIn, cashOut = m.latestCashOut;
    const deficitPct = lastNet! < 0 ? (cashIn ? Math.abs(lastNet!) / Math.abs(cashIn) * 100 : cashOut != null && cashOut > 0 ? 100 : 0) : 0;
    r.assessmentBasis = "derived";
    r.meaning = "Fits a local least-squares line to reported cumulative net cash. It is a diagnostic projection, not a source fact or approved forecast.";
    r.thresholds = { minimumTrendPeriods: p.minimumTrendPeriods, rSquaredCautionFloor: p.trendRSquaredCautionFloor, anomalyCautionZ: p.trendAnomalyCautionZ, anomalyCriticalZ: p.trendAnomalyCriticalZ, cashDeficitCriticalPct: p.cashDeficitCriticalPct };
    if (lastNet! < 0) {
      r.status = deficitPct >= p.cashDeficitCriticalPct ? "critical" : "caution";
      r.indication = "The modeled series ends in a cash deficit.";
      r.reason = `Latest cumulative net cash is ${lastNet!.toFixed(2)}; a stable negative position is never classified as favorable.`;
      r.risks = ["Existing funding pressure remains even when the fitted trend is statistically stable."];
      r.decision = "Prioritize cash recovery and validate the model against billing and payment schedules.";
      r.mitigation = ["Reconcile cumulative cash balances to certified billing, collections, and committed payments."];
    } else if (forecast! < 0) {
      r.status = "critical"; r.indication = "The diagnostic trend projects a move from non-negative to negative net cash."; r.reason = `The next-point projection is ${forecast!.toFixed(2)}.`; r.risks = ["A near-term funding deficit may emerge if the fitted direction continues."]; r.decision = "Validate the projected reversal against the approved cash forecast before committing funds."; r.mitigation = ["Accelerate near-term collections and sequence non-critical payments."];
    } else if (slope! < 0 || rSquared! < p.trendRSquaredCautionFloor || maxZ! >= p.trendAnomalyCautionZ) {
      r.status = "caution"; r.indication = "The cash trend is declining, weakly fitted, or contains an anomalous period."; r.reason = `Slope ${slope!.toFixed(2)}, R² ${rSquared!.toFixed(2)}, maximum residual z-score ${maxZ!.toFixed(2)}.`; r.risks = ["Trend uncertainty can make the next-point projection unreliable."]; r.decision = "Treat the projection as diagnostic only and investigate the underlying periods before action.";
    } else {
      r.status = "favorable"; r.indication = "The reported cumulative net-cash trend is non-negative and stable without a material anomaly."; r.reason = `Latest net cash and the next-point projection are non-negative; R² is ${rSquared!.toFixed(2)}.`; r.benefits = ["The controlled history supports a stable near-term cash direction."]; r.decision = "Maintain collection and payment controls; refit when the next period arrives."; r.keepOnTrack = ["Compare the diagnostic projection with the approved cash forecast each month."];
    }
    r.ruleApplied = "Guarded least-squares cash trend with current-position and anomaly safeguards"; return r;
  }
  if (d.semanticType === "waste") {
    const gaps = [[m.steelActual, m.steelBudget], [m.concreteActual, m.concreteBudget]].filter(x => x[0] != null && x[1] != null).map(x => (number(x[0]) - number(x[1])) * 100);
    if (!gaps.length) return unavailable(d, "Actual and budget waste percentages are not both available.");
    const gap = Math.max(...gaps); r.meaning = "Compares actual material waste with the approved waste allowance."; r.thresholds = { wasteCautionPoints: p.wasteCautionPoints, wasteCriticalPoints: p.wasteCriticalPoints };
    if (gap > p.wasteCriticalPoints) { r.status = "critical"; r.indication = "Material waste materially exceeds allowance."; r.reason = `The worst variance is ${gap.toFixed(2)} percentage points.`; r.risks = ["Unrecoverable material cost and possible productivity or quality leakage."]; r.decision = "Open a material-loss root-cause action with measured recovery targets."; r.mitigation = ["Reconcile issued, installed, returned, and scrapped quantities by work package."]; }
    else if (gap > p.wasteCautionPoints) { r.status = "caution"; r.indication = "Waste is above allowance."; r.reason = `The worst variance is ${gap.toFixed(2)} percentage points.`; r.decision = "Correct handling, cutting, storage, or measurement leakage before the next report."; }
    else { r.status = "favorable"; r.indication = "Actual waste is within the configured allowance."; r.reason = "Actual-to-budget waste gaps remain within policy."; r.benefits = ["Material consumption is not showing an adverse waste signal."]; r.decision = "Maintain material reconciliation and site controls."; r.keepOnTrack = ["Continue measuring actual waste separately for steel and concrete."]; }
    r.ruleApplied = "Actual waste minus budget waste"; return r;
  }
  if (d.semanticType === "reconciliation") {
    const accounting = m.accounting, reported = m.reported;
    if (accounting == null || reported == null) return unavailable(d, "Both compared accounting scopes are not available.");
    if (accounting === 0 && reported === 0) return unavailable(d, "Both reconciliation scopes are zero, so alignment cannot be established from activity.");
    const gap = accounting - reported, gapPct = ratioPct(gap, reported) ?? 0; r.meaning = "Keeps accounting and cost-control scopes visible and tests their difference without forcing equality."; r.thresholds = { reconciliationCautionPct: p.reconciliationCautionPct, reconciliationCriticalPct: p.reconciliationCriticalPct };
    if (Math.abs(gapPct) > p.reconciliationCriticalPct) { r.status = "critical"; r.indication = "A material scope/reconciliation difference requires explanation."; r.reason = `The gap is ${gapPct.toFixed(2)}% of reported cost.`; r.risks = ["Management may compare unlike scopes or miss unclassified cost."]; r.decision = "Reconcile the difference by source, timing, classification, and approved reallocation before relying on a combined total."; r.mitigation = ["Do not overwrite either source value.", "Document every reconciling item and owner."]; }
    else if (Math.abs(gapPct) > p.reconciliationCautionPct) { r.status = "caution"; r.indication = "A limited reconciliation difference remains."; r.reason = `The gap is ${gapPct.toFixed(2)}% of reported cost.`; r.decision = "Track the difference as a controlled reconciliation item."; }
    else { r.status = "favorable"; r.indication = "The compared scopes are closely aligned within policy."; r.reason = `The gap is ${gapPct.toFixed(2)}% of reported cost.`; r.benefits = ["Lower risk of a material unexplained accounting difference."]; r.decision = "Maintain separate source values and continue monthly reconciliation."; r.keepOnTrack = ["Retain the reconciliation trail by source and period."]; }
    r.ruleApplied = "Absolute reconciliation gap / reported cost"; return r;
  }
  if (d.semanticType === "concentration") {
    const top = m.top, sum = m.total, share = top != null && sum ? Math.abs(top) / Math.abs(sum) * 100 : null;
    if (share == null || top == null || sum == null || top <= 0 || sum <= 0 || top > sum) return unavailable(d, "A valid positive top-driver value and positive exposure total are not both available.");
    r.meaning = "Measures how much cost is concentrated in the leading resource or cost code."; r.thresholds = { concentrationCautionPct: p.concentrationCautionPct, concentrationCriticalPct: p.concentrationCriticalPct };
    if (share > p.concentrationCriticalPct) { r.status = "critical"; r.indication = "Cost exposure is highly concentrated."; r.reason = `The leading driver represents ${share.toFixed(1)}% of the analyzed total.`; r.risks = ["A single resource, vendor, or cost code can dominate project outcome."]; r.decision = "Apply dedicated forecast, procurement, and productivity controls to the leading driver."; r.mitigation = ["Validate quantity, rate, commitment, and remaining exposure for the top driver."]; }
    else if (share > p.concentrationCautionPct) { r.status = "caution"; r.indication = "The leading cost driver deserves focused monitoring."; r.reason = `Its share is ${share.toFixed(1)}%.`; r.decision = "Track the leading driver as a separate management exception."; }
    else { r.status = "favorable"; r.indication = "No single leading driver breaches the concentration threshold."; r.reason = `The top share is ${share.toFixed(1)}%.`; r.benefits = ["Cost exposure is less dependent on one recorded driver."]; r.decision = "Maintain ranked Pareto review and watch for concentration shifts."; }
    r.ruleApplied = "Largest driver / analyzed total"; return r;
  }
  if (d.semanticType === "forecast") {
    if (!number(m.rowCount)) return unavailable(d, "No forecast rows are available.");
    const remaining = m.remainingBudget, etc = m.etc, delta = remaining != null && etc != null ? remaining - etc : null;
    r.meaning = "Tests whether remaining budget can cover the current estimate to complete.";
    if (delta == null) { r.status = "informational"; r.indication = "Forecast rows exist, but comparable remaining-budget and ETC totals are incomplete."; r.reason = "No forced forecast conclusion is permitted."; r.decision = "Complete the missing forecast fields before approving an EAC position."; }
    else if (delta < 0) { const pct = ratioPct(delta, m.bac || 0); r.status = pct != null && pct < p.vacCautionPct ? "critical" : "caution"; r.indication = "ETC exceeds the remaining budget."; r.reason = `Forecast remaining variance is ${delta.toFixed(2)}.`; r.risks = ["Current forecast implies budget pressure on the remaining work."]; r.decision = "Revalidate remaining quantities, productivity, commitments, and forecast rates."; r.mitigation = ["Assign recovery actions to the largest negative forecast rows."]; }
    else { r.status = "favorable"; r.indication = "Remaining budget covers current ETC on the available rows."; r.reason = "The forecast remaining variance is non-negative."; r.benefits = ["The current detailed forecast retains a remaining budget buffer."]; r.decision = "Maintain monthly bottom-up ETC validation."; }
    r.ruleApplied = "Remaining budget minus ETC"; r.thresholds = { vacCautionPct: p.vacCautionPct }; return r;
  }
  if (d.semanticType === "indirect_variance") {
    const budget = m.budget, actual = m.actual, variance = m.variance ?? (budget != null && actual != null ? budget - actual : null);
    if (budget == null || actual == null || variance == null || budget <= 0) return unavailable(d, "Comparable indirect budget and actual cost are not both available.");
    const variancePct = variance / Math.abs(budget) * 100;
    r.meaning = "Compares indirect actual cost with its controlled budget without merging it into direct-cost performance.";
    r.thresholds = { adverseVarianceCriticalPct: p.cvCautionPct };
    if (variancePct < p.cvCautionPct) { r.status = "critical"; r.indication = "Indirect cost materially exceeds its controlled budget."; r.reason = `Indirect variance is ${variancePct.toFixed(2)}% of indirect budget.`; r.risks = ["Continued indirect-cost pressure can erode remaining project margin."]; r.decision = "Require an indirect-cost recovery plan by cost pool and responsible owner."; r.mitigation = ["Reforecast remaining staff, facilities, equipment, and time-related indirect exposure."]; }
    else if (variancePct < 0) { r.status = "caution"; r.indication = "Indirect actual cost is above budget but remains inside the warning band."; r.reason = `Indirect variance is ${variancePct.toFixed(2)}% of indirect budget.`; r.risks = ["A limited overrun can compound if project duration or support requirements increase."]; r.decision = "Review the leading indirect pools before the next reporting period."; }
    else { r.status = "favorable"; r.indication = "Indirect actual cost remains within the controlled budget."; r.reason = `Indirect variance is ${variancePct.toFixed(2)}% of indirect budget.`; r.benefits = ["Current indirect spending retains a budget buffer."]; r.decision = "Maintain pool-level controls and watch time-related exposure."; }
    r.ruleApplied = "Indirect budget minus indirect actual / indirect budget"; return r;
  }
  if (d.semanticType === "data_quality") {
    const severe = number(m.severe), warnings = number(m.warnings), unaccounted = number(m.unaccountedSheets); r.meaning = "Tests whether source coverage and parser findings support management reliance.";
    if (severe > 0 || unaccounted > 0) { r.status = "critical"; r.indication = "Critical data-quality or coverage issues require resolution."; r.reason = `${severe} severe finding(s); ${unaccounted} unaccounted sheet(s).`; r.risks = ["Decisions may rely on incomplete or contradictory evidence."]; r.decision = "Resolve critical findings before approving affected conclusions."; r.mitigation = ["Trace each issue to its source sheet/cell and responsible owner."]; }
    else if (warnings > 0) { r.status = "caution"; r.indication = "The dataset is usable with explicit warnings."; r.reason = `${warnings} warning finding(s) remain.`; r.decision = "Proceed only with the stated limitations and close warnings by priority."; }
    else { r.status = "favorable"; r.indication = "No critical parser-level quality signal is present."; r.reason = "Severe findings and unaccounted sheets are zero."; r.benefits = ["The controlled dataset has stronger auditability for the reviewed scope."]; r.decision = "Maintain source lineage and repeat validation on every update."; }
    r.ruleApplied = "Quality severity and source-coverage guard"; return r;
  }
  if (d.semanticType === "scenario") {
    const margin = m.margin, profit = m.profit;
    if (margin == null || profit == null) return unavailable(d, "The active scenario has not been published by the Scenario Lab.");
    r.meaning = "Tests a reversible management scenario; these values are not source facts."; r.assessmentBasis = "scenario"; r.thresholds = { marginTargetPct: p.marginTargetPct };
    if (profit < 0 || margin * 100 < 0) { r.status = "critical"; r.indication = "The active scenario produces a loss."; r.reason = "Scenario profit or margin is negative."; r.risks = ["The tested cost/revenue combination is commercially unsustainable."]; r.decision = "Reject or redesign this scenario before using it as a management target."; r.mitigation = ["Reduce remaining-cost stress, improve revenue realization, or secure recovery actions."]; }
    else if (margin * 100 < p.marginTargetPct) { r.status = "caution"; r.indication = "The scenario remains profitable but below target margin."; r.reason = "Scenario margin does not meet the configured floor."; r.decision = "Improve the scenario buffer before approval."; }
    else { r.status = "favorable"; r.indication = "The active scenario meets the configured margin floor."; r.reason = "Scenario profit is positive and margin meets target."; r.benefits = ["The tested assumptions preserve a positive commercial outcome."]; r.decision = "Keep the scenario as a controlled case and validate its assumptions against source evidence."; }
    r.ruleApplied = "Scenario profit and margin floor"; return r;
  }
  if (d.semanticType === "ledger_trend") {
    const periods = number(m.periods) || d.rows?.length || 0;
    if (periods < p.minimumTrendPeriods) return unavailable(d, `At least ${p.minimumTrendPeriods} periods are required for a confirmed trend; ${periods} are available.`);
    const first = finite(d.rows?.[0]?.total), last = finite(d.rows?.at(-1)?.total);
    r.status = "informational";
    r.meaning = "Shows accounting-ledger movement across enough periods to identify direction without treating higher or lower absolute cost as inherently good or bad.";
    r.indication = first != null && last != null ? `The ledger moved ${last > first ? "up" : last < first ? "down" : "flat"} from the first to the latest available period.` : "The minimum period count is met; review the source trend against an approved plan or activity basis.";
    r.reason = "A trend direction is observable, but no verified target is available for a favorable/adverse judgment.";
    r.decision = "Compare the ledger movement with approved progress, budget phasing, and commitments before intervention.";
    r.ruleApplied = "Minimum-period trend guard and no-target safeguard";
    r.thresholds = { minimumTrendPeriods: p.minimumTrendPeriods };
    return r;
  }
  if (d.semanticType === "cost_mix" || d.semanticType === "inventory") {
    r.status = "informational"; r.meaning = d.semanticType === "inventory" ? "Confirms controlled records and coverage without judging the magnitude." : "Shows composition or movement that is not inherently good or bad without a verified target."; r.indication = "The component is available for management review, but no unsupported favorable/adverse label is applied."; r.reason = "Absolute cost, mix, or inventory size has no universal performance direction."; r.decision = d.semanticType === "inventory" ? "Use this as controlled lookup or lineage evidence." : "Compare the movement or mix with an approved target, prior period, or valid peer before intervention."; r.ruleApplied = "No-target safeguard"; return r;
  }
  return r;
}

export function attachMlMapping(result: IntelligenceResult, family: string | null, score: number | null): IntelligenceResult {
  return { ...result, mlMappedFamily: family, mlMappingScore: score };
}
