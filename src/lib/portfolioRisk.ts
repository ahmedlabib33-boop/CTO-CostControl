import {
  DEFAULT_INTELLIGENCE_POLICY,
  buildPortfolioDescriptors,
  cashflowTrendMetrics,
  evaluateDescriptor,
  validateIntelligencePolicy,
  type InsightStatus,
  type IntelligenceDescriptor,
  type IntelligencePolicy,
  type IntelligenceResult,
  type PortfolioIntelligenceContext,
  type SemanticType,
} from "@/lib/liveIntelligence";

export const PORTFOLIO_RISK_SETTINGS_KEY = "cto-portfolio-risk-settings-v1";

export type RiskSettingsAnswers = {
  cpiCritical: number;
  adverseVarianceCriticalPct: number;
  minimumMarginPct: number;
  cashDeficitCriticalPct: number;
  concentrationCriticalPct: number;
  reconciliationCriticalPct: number;
};

export type SavedRiskSettings = {
  version: 1;
  savedAt: string;
  answers: RiskSettingsAnswers;
  policy: IntelligencePolicy;
};

export type PortfolioRiskAssessment = {
  id: string;
  severity: "critical" | "caution" | "unavailable";
  title: string;
  family: string;
  scope: "portfolio" | "project";
  affectedProjectIds: string[];
  affectedProjects: string[];
  metrics: Record<string, number | null>;
  evidence: string[];
  reason: string;
  consequence: string;
  decision: string;
  mitigation: string[];
  confidence: number;
  period: string;
  revision: string;
  rule: string;
  unavailableReason: string | null;
};

export type PortfolioRiskReport = {
  evaluatedCount: number;
  criticalCount: number;
  cautionCount: number;
  unavailableCount: number;
  favorableCount: number;
  informationalCount: number;
  risks: PortfolioRiskAssessment[];
  highestPriority: PortfolioRiskAssessment | null;
  scenario: IntelligenceResult | null;
};

export type PortfolioRiskCluster = {
  id: string;
  family: string;
  severity: "critical" | "caution" | "unavailable";
  criticalCount: number;
  cautionCount: number;
  unavailableCount: number;
  assessmentCount: number;
  affectedProjectIds: string[];
  affectedProjects: string[];
  periods: string[];
  confidenceFloor: number;
  decisions: string[];
  mitigations: string[];
  assessments: PortfolioRiskAssessment[];
};

export const DEFAULT_RISK_SETTINGS_ANSWERS: RiskSettingsAnswers = {
  cpiCritical: DEFAULT_INTELLIGENCE_POLICY.cpiCaution,
  adverseVarianceCriticalPct: Math.abs(DEFAULT_INTELLIGENCE_POLICY.cvCautionPct),
  minimumMarginPct: DEFAULT_INTELLIGENCE_POLICY.marginTargetPct,
  cashDeficitCriticalPct: DEFAULT_INTELLIGENCE_POLICY.cashDeficitCriticalPct,
  concentrationCriticalPct: DEFAULT_INTELLIGENCE_POLICY.concentrationCriticalPct,
  reconciliationCriticalPct: DEFAULT_INTELLIGENCE_POLICY.reconciliationCriticalPct,
};

const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const rows = (value: unknown): Record<string, any>[] => Array.isArray(value) ? value : [];
const total = (items: Record<string, any>[], key: string) => items.reduce((sum, item) => sum + (finite(item?.[key]) || 0), 0);

export function riskPolicyFromAnswers(answers: RiskSettingsAnswers): IntelligencePolicy | null {
  const values = Object.values(answers);
  if (values.some(value => typeof value !== "number" || !Number.isFinite(value))) return null;
  if (answers.cpiCritical <= 0 || answers.cpiCritical > DEFAULT_INTELLIGENCE_POLICY.cpiFavorable) return null;
  if (answers.adverseVarianceCriticalPct < 0 || answers.adverseVarianceCriticalPct > 100) return null;
  if (answers.minimumMarginPct < -100 || answers.minimumMarginPct > 100) return null;
  if (answers.cashDeficitCriticalPct < DEFAULT_INTELLIGENCE_POLICY.cashDeficitCautionPct || answers.cashDeficitCriticalPct > 100) return null;
  if (answers.concentrationCriticalPct < DEFAULT_INTELLIGENCE_POLICY.concentrationCautionPct || answers.concentrationCriticalPct > 100) return null;
  if (answers.reconciliationCriticalPct < DEFAULT_INTELLIGENCE_POLICY.reconciliationCautionPct || answers.reconciliationCriticalPct > 100) return null;
  return validateIntelligencePolicy({
    ...DEFAULT_INTELLIGENCE_POLICY,
    cpiCaution: answers.cpiCritical,
    cvCautionPct: -Math.abs(answers.adverseVarianceCriticalPct),
    vacCautionPct: -Math.abs(answers.adverseVarianceCriticalPct),
    marginTargetPct: answers.minimumMarginPct,
    cashDeficitCriticalPct: answers.cashDeficitCriticalPct,
    concentrationCriticalPct: answers.concentrationCriticalPct,
    reconciliationCriticalPct: answers.reconciliationCriticalPct,
  });
}

export function parseSavedRiskSettings(raw: string | null): SavedRiskSettings | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedRiskSettings>;
    if (value.version !== 1 || typeof value.savedAt !== "string" || !value.answers) return null;
    const policy = riskPolicyFromAnswers(value.answers);
    if (!policy) return null;
    return { version: 1, savedAt: value.savedAt, answers: value.answers, policy };
  } catch {
    return null;
  }
}

function projectDescriptor(item: any, componentId: string, componentName: string, semanticType: SemanticType, metrics: Record<string, number | null>, extra: Partial<IntelligenceDescriptor> = {}): IntelligenceDescriptor {
  const fingerprint = String(item.registry?.source_fingerprint || "");
  return {
    componentId,
    componentName,
    kind: "chart",
    family: semanticType.replaceAll("_", " "),
    semanticType,
    projectId: String(item.id || item.registry?.project_id || ""),
    projectName: String(item.name || item.registry?.project_name || "Unknown project"),
    period: String(item.period || item.registry?.reporting_period || "Unknown period"),
    revision: fingerprint,
    metrics,
    sourceEvidence: [`${item.name} · ${item.period} · ${fingerprint.slice(0, 16)}…`],
    extractionConfidence: item.registry?.approved_parity ? 1 : .86,
    assessmentBasis: "derived",
    ...extra,
  };
}

function positiveConcentration(items: Record<string, any>[], labelKey: string, valueKey: string) {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const amount = finite(item[valueKey]);
    if (amount == null || amount <= 0) continue;
    const label = String(item[labelKey] || item.resource_code || item.code || "Other").trim().toLowerCase();
    grouped.set(label, (grouped.get(label) || 0) + amount);
  }
  const values = [...grouped.values()].sort((a, b) => b - a);
  return { rowCount: grouped.size, total: values.reduce((sum, value) => sum + value, 0), top: values[0] ?? null };
}

function buildSelectedProjectDescriptors(context: PortfolioIntelligenceContext): IntelligenceDescriptor[] {
  return (context.active || []).flatMap(item => {
    const norm = item.normalized || {}, k = norm.kpis || {}, registryMetrics = item.registry?.metrics || {};
    const out: IntelligenceDescriptor[] = [];
    const hasCost = finite(k.ev_dashboard_scope) != null || finite(registryMetrics.earned_value) != null;
    out.push(projectDescriptor(item, "risk-cost-performance", `${item.name} — Cost Performance`, "cost_performance", {
      budget: hasCost ? finite(item.budget) : null,
      ev: hasCost ? finite(item.ev) : null,
      ac: hasCost ? finite(item.ac) : null,
      cv: hasCost ? finite(item.cv) : null,
      cpi: hasCost ? finite(item.cpi) : null,
    }));

    const profitRows = rows(norm.profitability), hasProfit = profitRows.some(row => finite(row.profit) != null) || finite(registryMetrics.gross_profit) != null;
    out.push(projectDescriptor(item, "risk-profitability", `${item.name} — Profitability`, "profitability", {
      profit: hasProfit ? finite(item.gp) : null,
      margin: hasProfit && finite(item.revenue) ? finite(item.gp / item.revenue) : null,
      methodCount: profitRows.length,
    }));

    const cash = rows(item.cashflow), lastCash = cash.at(-1) || {}, cashIn = finite(lastCash.cash_in_cum), cashOut = finite(lastCash.cash_out_cum);
    out.push(projectDescriptor(item, "risk-cashflow", `${item.name} — Cumulative Cashflow`, "cumulative_cashflow", {
      periods: cash.length,
      cumulativeCashIn: cashIn,
      cumulativeCashOut: cashOut,
      cumulativeNet: cashIn != null && cashOut != null ? cashIn - cashOut : null,
    }, { rows: cash }));
    out.push(projectDescriptor(item, "risk-cash-trend", `${item.name} — Cashflow Trend`, "cashflow_trend", cashflowTrendMetrics(cash), { rows: cash }));

    const forecast = rows(norm.boq_forecasts);
    out.push(projectDescriptor(item, "risk-forecast", `${item.name} — Forecast Exposure`, "forecast", {
      rowCount: forecast.length,
      bac: forecast.length ? total(forecast, "bac") : null,
      etc: forecast.length ? total(forecast, "etc") : null,
      remainingBudget: forecast.length ? total(forecast, "remaining_budget") : null,
    }, { rows: forecast }));

    const resources = rows(norm.boq_resources);
    out.push(projectDescriptor(item, "risk-concentration", `${item.name} — Cost Driver Concentration`, "concentration", positiveConcentration(resources, "resource", "actual_cost"), { rows: resources }));

    const ledger = finite(k.ledger_accounting_cost), reported = finite(k.actual_cost_dashboard_scope);
    out.push(projectDescriptor(item, "risk-reconciliation", `${item.name} — Cost Reconciliation`, "reconciliation", { accounting: ledger, reported }));

    out.push(projectDescriptor(item, "risk-indirect", `${item.name} — Indirect Cost Pressure`, "indirect_variance", {
      budget: finite(k.indirect_budget_cost),
      actual: finite(k.indirect_actual),
      variance: finite(k.indirect_budget_cost) != null && finite(k.indirect_actual) != null ? Number(k.indirect_budget_cost) - Number(k.indirect_actual) : null,
    }));

    const quality = rows(norm.data_quality);
    if (quality.length) {
      out.push(projectDescriptor(item, "risk-data-quality", `${item.name} — Data Quality`, "data_quality", {
        findings: quality.length,
        severe: quality.filter(row => ["critical", "error"].includes(String(row.severity).toLowerCase())).length,
        warnings: quality.filter(row => String(row.severity).toLowerCase() === "warning").length,
        unaccountedSheets: null,
      }, { kind: "assurance", assessmentBasis: "evidence", rows: quality }));
    }
    return out;
  });
}

function normalizeSemantic(type: SemanticType) {
  if (type === "cost_table") return "cost_performance";
  return type;
}

function severityOf(status: InsightStatus): "critical" | "caution" | "unavailable" | null {
  if (status === "critical") return "critical";
  if (status === "caution" || status === "mixed") return "caution";
  if (status === "unavailable") return "unavailable";
  return null;
}

function toAssessment(result: IntelligenceResult, descriptor: IntelligenceDescriptor, context: PortfolioIntelligenceContext): PortfolioRiskAssessment | null {
  const severity = severityOf(result.status);
  if (!severity) return null;
  const projectScope = descriptor.projectId !== "portfolio";
  const affected = projectScope ? (context.active || []).filter(item => item.id === descriptor.projectId) : (context.active || []);
  return {
    id: `${projectScope ? "project" : "portfolio"}:${descriptor.projectId}:${normalizeSemantic(descriptor.semanticType)}`,
    severity,
    title: result.componentName,
    family: normalizeSemantic(descriptor.semanticType).replaceAll("_", " "),
    scope: projectScope ? "project" : "portfolio",
    affectedProjectIds: affected.map(item => String(item.id)),
    affectedProjects: affected.map(item => String(item.name)),
    metrics: result.metrics,
    evidence: result.sourceEvidence,
    reason: result.reason,
    consequence: result.risks[0] || (severity === "unavailable" ? "Management cannot safely assess this exposure until the missing evidence is resolved." : result.indication),
    decision: result.decision,
    mitigation: result.mitigation,
    confidence: result.confidence,
    period: result.period,
    revision: result.revision,
    rule: result.ruleApplied,
    unavailableReason: result.unavailableReason,
  };
}

export function buildPortfolioRiskReport(context: PortfolioIntelligenceContext, policy: IntelligencePolicy): PortfolioRiskReport {
  const portfolioDescriptors = buildPortfolioDescriptors({ ...context, view: "risk" });
  const projectDescriptors = buildSelectedProjectDescriptors(context);
  const descriptors = [...portfolioDescriptors, ...projectDescriptors];
  const evaluated = descriptors.map(descriptor => ({ descriptor, result: evaluateDescriptor(descriptor, policy) }));
  const deduped = evaluated.filter((item, index) => {
    const key = `${item.descriptor.projectId}:${normalizeSemantic(item.descriptor.semanticType)}`;
    return evaluated.findIndex(other => `${other.descriptor.projectId}:${normalizeSemantic(other.descriptor.semanticType)}` === key) === index;
  });
  const rank = { critical: 0, caution: 1, unavailable: 2 } as const;
  const risks = deduped.map(item => toAssessment(item.result, item.descriptor, context)).filter((item): item is PortfolioRiskAssessment => item != null)
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.confidence - a.confidence || a.title.localeCompare(b.title));
  const scenarioDescriptor = buildPortfolioDescriptors({ ...context, view: "analysis" }).find(item => item.semanticType === "scenario");
  const scenario = scenarioDescriptor && Object.values(scenarioDescriptor.metrics).some(value => value != null)
    ? evaluateDescriptor(scenarioDescriptor, policy)
    : null;
  return {
    evaluatedCount: deduped.length,
    criticalCount: risks.filter(item => item.severity === "critical").length,
    cautionCount: risks.filter(item => item.severity === "caution").length,
    unavailableCount: risks.filter(item => item.severity === "unavailable").length,
    favorableCount: deduped.filter(item => item.result.status === "favorable").length,
    informationalCount: deduped.filter(item => item.result.status === "informational").length,
    risks,
    highestPriority: risks.find(item => item.severity !== "unavailable") || null,
    scenario,
  };
}

export function buildPortfolioRiskClusters(report: PortfolioRiskReport): PortfolioRiskCluster[] {
  const groups = new Map<string, PortfolioRiskAssessment[]>();
  for (const risk of report.risks) groups.set(risk.family, [...(groups.get(risk.family) || []), risk]);
  const rank = { critical: 0, caution: 1, unavailable: 2 } as const;
  return [...groups.entries()].map(([family, assessments]) => {
    const criticalCount = assessments.filter(item => item.severity === "critical").length;
    const cautionCount = assessments.filter(item => item.severity === "caution").length;
    const unavailableCount = assessments.filter(item => item.severity === "unavailable").length;
    const severity: PortfolioRiskCluster["severity"] = criticalCount ? "critical" : cautionCount ? "caution" : "unavailable";
    return {
      id: `portfolio-cluster:${family}`,
      family,
      severity,
      criticalCount,
      cautionCount,
      unavailableCount,
      assessmentCount: assessments.length,
      affectedProjectIds: [...new Set(assessments.flatMap(item => item.affectedProjectIds))],
      affectedProjects: [...new Set(assessments.flatMap(item => item.affectedProjects))],
      periods: [...new Set(assessments.map(item => item.period).filter(Boolean))].sort(),
      confidenceFloor: (() => {
        const assessable = assessments.filter(item => item.severity !== "unavailable");
        const basis = assessable.length ? assessable : assessments;
        return basis.length ? Math.min(...basis.map(item => item.confidence)) : 0;
      })(),
      decisions: [...new Set(assessments.filter(item => item.severity !== "unavailable").map(item => item.decision).filter(Boolean))],
      mitigations: [...new Set(assessments.flatMap(item => item.mitigation).filter(Boolean))],
      assessments,
    };
  }).sort((a, b) => rank[a.severity] - rank[b.severity] || b.criticalCount - a.criticalCount || b.cautionCount - a.cautionCount || a.family.localeCompare(b.family));
}
