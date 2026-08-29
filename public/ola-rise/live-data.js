const POLICY = {
  cpiCritical: 0.95,
  varianceCriticalPct: -5,
  cashDeficitCriticalPct: 15,
  concentrationCriticalPct: 40,
  concentrationCautionPct: 25,
  reconciliationCriticalPct: 5,
  reconciliationCautionPct: 1,
};

const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const rows = (value) => (Array.isArray(value) ? value : []);
const money = (value) => {
  const number = finite(value);
  if (number == null) return "unavailable";
  const absolute = Math.abs(number);
  if (absolute >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
  if (absolute >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
  if (absolute >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
  return number.toFixed(2);
};
const pct = (value) => `${Number(value).toFixed(1)}%`;
const sourceRef = (project, detail) =>
  `${project.project_name} · ${project.reporting_period} · ${detail}`;

function mission(status, title, reading, decision, correct, distractors, evidence) {
  return [status, title, reading, decision, [correct, ...distractors], 0, evidence];
}

function unavailable(project, title, requirement) {
  return mission(
    "UNABLE",
    title,
    `${requirement} is not available on a controlled comparable basis for this period.`,
    `Recover and validate ${requirement.toLowerCase()} before drawing a conclusion.`,
    `Keep the conclusion unavailable and recover ${requirement.toLowerCase()}`,
    ["Assume the missing value is neutral", "Copy a value from another project"],
    sourceRef(project, `missing controlled evidence: ${requirement}`),
  );
}

function costPerformance(project, normalized) {
  const metrics = project.metrics || {},
    kpis = normalized.kpis || {},
    ev = finite(metrics.earned_value ?? kpis.ev_dashboard_scope),
    ac = finite(metrics.actual_cost ?? kpis.actual_cost_dashboard_scope),
    cpi = finite(metrics.cpi ?? kpis.derived_cpi),
    cv = finite(metrics.cost_variance ?? kpis.derived_cv);
  if (ev == null || ac == null || cpi == null || cv == null)
    return unavailable(project, "Cost Performance", "comparable EV, AC, CPI and CV");
  const status = cpi < POLICY.cpiCritical ? "CRITICAL" : cpi < 1 || cv < 0 ? "CAUTION" : "FAVORABLE";
  const decision =
    status === "CRITICAL"
      ? "Require a cost-recovery plan for the largest adverse work packages before approving the next forecast."
      : status === "CAUTION"
        ? "Keep CPI and negative-CV items under weekly exception review."
        : "Maintain cost-code controls and protect the favorable efficiency from unapproved scope.";
  return mission(
    status,
    "Cost Performance",
    `Current CPI is ${cpi.toFixed(2)}; EV is ${money(ev)}, AC is ${money(ac)}, and CV is ${money(cv)}.`,
    decision,
    decision,
    ["Replace EV with budget to improve the ratio", "Wait for year-end before reviewing performance"],
    sourceRef(project, `controlled headline metrics; source fingerprint ${project.source_fingerprint || "unavailable"}`),
  );
}

function forecast(project, normalized) {
  const sourceRows = rows(normalized.boq_forecasts).length
      ? rows(normalized.boq_forecasts)
      : rows(normalized.project_items),
    detail = sourceRows.filter(
    (row) => finite(row.bac ?? row.original_budget) != null,
  );
  if (!detail.length) return unavailable(project, "Forecast Exposure", "BAC, EAC, ETC or VAC detail");
  const bac = detail.reduce((sum, row) => sum + (finite(row.bac ?? row.original_budget) || 0), 0),
    vac = detail.reduce((sum, row) => sum + (finite(row.vac) || 0), 0),
    adverse = detail.filter((row) => (finite(row.vac) || 0) < 0),
    variancePct = bac ? (vac / Math.abs(bac)) * 100 : null;
  if (variancePct == null) return unavailable(project, "Forecast Exposure", "a non-zero forecast budget basis");
  const status = variancePct < POLICY.varianceCriticalPct ? "CRITICAL" : variancePct < 0 ? "CAUTION" : "FAVORABLE";
  const decision =
    status === "CRITICAL"
      ? "Revalidate remaining quantities, productivity, commitments and forecast rates by the largest negative-VAC rows."
      : status === "CAUTION"
        ? "Assign owners to adverse forecast rows and refresh bottom-up ETC before the next report."
        : "Maintain monthly bottom-up ETC validation and protect the remaining forecast buffer.";
  return mission(
    status,
    "Forecast Exposure",
    `${adverse.length} of ${detail.length} forecast rows are adverse; aggregate VAC is ${money(vac)} (${pct(variancePct)} of BAC).`,
    decision,
    decision,
    ["Carry every ETC forward without revalidation", "Remove adverse rows from the management view"],
    sourceRef(project, `${detail.length} controlled forecast rows`),
  );
}

function profitability(project, normalized) {
  const methods = rows(normalized.profitability),
    selected = methods.find((item) => String(item.method || "").toLowerCase().includes("revenue")) || methods[0],
    profit = finite(selected?.profit ?? project.metrics?.gross_profit),
    margin = finite(selected?.profit_pct);
  if (profit == null) return unavailable(project, "Profitability", "a controlled profit method");
  const marginPct = margin == null ? null : margin * 100,
    status = profit < 0 || (marginPct != null && marginPct < 0) ? "CRITICAL" : marginPct == null ? "CAUTION" : "FAVORABLE",
    decision =
      status === "CRITICAL"
        ? "Escalate the loss drivers and approve a documented revenue-and-cost recovery scenario."
        : status === "CAUTION"
          ? "Validate the margin basis, remaining revenue and remaining cost before calling the return favorable."
          : "Protect revenue realization, deductions and forecast-to-complete discipline.";
  return mission(
    status,
    "Profitability",
    `Controlled profit is ${money(profit)}${marginPct == null ? "; margin is unavailable" : ` at ${pct(marginPct)} margin`}.`,
    decision,
    decision,
    ["Merge all profit methods into one average", "Treat positive cash as proof of profit"],
    sourceRef(project, selected?.method || "headline gross-profit metric"),
  );
}

function cashflow(project, normalized) {
  const cash = rows(normalized.cashflow),
    latest = cash.at(-1) || {},
    cashIn = finite(latest.cash_in_cum ?? latest.cash_in),
    cashOut = finite(latest.cash_out_cum ?? latest.cash_out);
  if (cashIn == null || cashOut == null) return unavailable(project, "Cashflow Control", "cash in and cash out");
  const net = cashIn - cashOut,
    deficitPct = net < 0 ? (cashIn ? (Math.abs(net) / Math.abs(cashIn)) * 100 : 100) : 0,
    status = deficitPct >= POLICY.cashDeficitCriticalPct ? "CRITICAL" : net < 0 ? "CAUTION" : "FAVORABLE",
    decision =
      status === "CRITICAL"
        ? "Approve an immediate cash-recovery and payment-prioritization plan."
        : status === "CAUTION"
          ? "Review collection timing and near-term payment commitments every week."
          : "Maintain collection discipline and verify the next three-month billing and payment forecast.";
  return mission(
    status,
    "Cashflow Control",
    `Across ${cash.length} reported periods, cumulative cash in is ${money(cashIn)}, cash out is ${money(cashOut)}, and net cash is ${money(net)}.`,
    decision,
    decision,
    ["Delay every supplier payment without prioritization", "Use revenue as a substitute for collected cash"],
    sourceRef(project, `latest of ${cash.length} cashflow periods`),
  );
}

function reconciliation(project, normalized) {
  const kpis = normalized.kpis || {},
    accounting = finite(kpis.ledger_accounting_cost),
    reported = finite(kpis.actual_cost_dashboard_scope ?? project.metrics?.actual_cost);
  if (accounting == null || reported == null || reported === 0)
    return unavailable(project, "Cost Reconciliation", "ledger and reported actual cost on comparable scopes");
  const gap = accounting - reported,
    gapPct = (Math.abs(gap) / Math.abs(reported)) * 100,
    status = gapPct > POLICY.reconciliationCriticalPct ? "CRITICAL" : gapPct > POLICY.reconciliationCautionPct ? "CAUTION" : "FAVORABLE",
    decision =
      status === "CRITICAL"
        ? "Reconcile every difference by source, timing, classification and approved reallocation before using a combined total."
        : status === "CAUTION"
          ? "Track the remaining difference as a controlled reconciliation item with an owner."
          : "Keep both source values visible and continue the monthly reconciliation trail.";
  return mission(
    status,
    "Cost Reconciliation",
    `Ledger cost is ${money(accounting)}, reported cost is ${money(reported)}, and the absolute gap is ${pct(gapPct)}.`,
    decision,
    decision,
    ["Overwrite one source with the other", "Average the two scopes without reconciling"],
    sourceRef(project, "ledger accounting cost versus dashboard actual-cost scope"),
  );
}

function indirectPressure(project, normalized) {
  const kpis = normalized.kpis || {},
    budget = finite(kpis.indirect_budget_cost),
    actual = finite(kpis.indirect_actual ?? project.metrics?.indirect_cost);
  if (budget == null || actual == null || budget <= 0)
    return unavailable(project, "Indirect Cost Pressure", "comparable indirect budget and actual cost");
  const variance = budget - actual,
    variancePct = (variance / Math.abs(budget)) * 100,
    status = variancePct < POLICY.varianceCriticalPct ? "CRITICAL" : variancePct < 0 ? "CAUTION" : "FAVORABLE",
    decision =
      status === "CRITICAL"
        ? "Require an indirect-cost recovery plan by pool, duration driver and accountable owner."
        : status === "CAUTION"
          ? "Review the leading indirect pools and remaining time-related exposure."
          : "Maintain pool-level controls and watch duration-driven exposure.";
  return mission(
    status,
    "Indirect Cost Pressure",
    `Indirect budget is ${money(budget)}, actual is ${money(actual)}, and variance is ${pct(variancePct)}.`,
    decision,
    decision,
    ["Hide indirect cost inside direct codes", "Assume favorable direct cost cancels indirect pressure"],
    sourceRef(project, "indirect budget and actual-cost controls"),
  );
}

function concentration(project, normalized) {
  const sourceRows = rows(normalized.boq_resources).length
      ? rows(normalized.boq_resources)
      : rows(normalized.ledger_aggregates),
    candidates = sourceRows
    .map((row) => ({
      label: String(row.resource || row.resource_code || row.code || row.name || row.label || "Recorded driver"),
      value: finite(row.actual_cost ?? row.cost ?? row.value ?? row.total),
    }))
    .filter((row) => row.value != null && row.value > 0);
  if (!candidates.length) return unavailable(project, "Cost Driver Concentration", "ranked positive cost-driver values");
  const total = candidates.reduce((sum, row) => sum + row.value, 0),
    leader = candidates.sort((a, b) => b.value - a.value)[0],
    share = total ? (leader.value / total) * 100 : 0,
    status = share > POLICY.concentrationCriticalPct ? "CRITICAL" : share > POLICY.concentrationCautionPct ? "CAUTION" : "FAVORABLE",
    decision =
      status === "CRITICAL"
        ? "Apply dedicated forecast, procurement and productivity controls to the leading cost driver."
        : status === "CAUTION"
          ? "Track the leading driver as a separate management exception."
          : "Maintain ranked Pareto review and watch for concentration shifts.";
  return mission(
    status,
    "Cost Driver Concentration",
    `${leader.label} is the leading recorded driver at ${money(leader.value)}, representing ${pct(share)} of the analyzed positive total.`,
    decision,
    decision,
    ["Split the code so the percentage looks smaller", "Ignore concentration until it reaches half of all cost"],
    sourceRef(project, `${candidates.length} ranked cost-driver rows`),
  );
}

function dataQuality(project, normalized) {
  if (!Object.prototype.hasOwnProperty.call(normalized, "data_quality"))
    return unavailable(project, "Data Quality & Source Assurance", "source-quality findings or a confirmed zero-finding result");
  const findings = rows(normalized.data_quality),
    severe = findings.filter((row) => /critical|error|conflict/i.test(String(row.severity || row.level || row.status || ""))).length,
    warnings = findings.filter((row) => /warn|caution/i.test(String(row.severity || row.level || row.status || ""))).length,
    status = severe > 0 ? "CRITICAL" : warnings > 0 || findings.length > 0 ? "CAUTION" : "FAVORABLE",
    decision =
      status === "CRITICAL"
        ? "Resolve critical source conflicts before relying on affected financial conclusions."
        : status === "CAUTION"
          ? "Assign owners and close source warnings in priority order."
          : "Preserve the source-audit trail and repeat validation after the next upload.";
  return mission(
    status,
    "Data Quality & Source Assurance",
    `${findings.length} parser findings are recorded for this snapshot: ${severe} critical/error and ${warnings} warning/caution.`,
    decision,
    decision,
    ["Delete incomplete rows without an audit trail", "Treat every warning as harmless"],
    sourceRef(project, `${findings.length} source-quality findings`),
  );
}

export function buildLiveProject(project, normalized = {}, index = 0, total = 1) {
  const angle = total <= 1 ? 0 : (index / total) * Math.PI * 2 - Math.PI / 2,
    radius = total <= 2 ? 9 : 11 + Math.floor(index / 8) * 5,
    period = project.reporting_period || normalized.meta?.report_period || "period unavailable",
    metrics = project.metrics || {},
    missions = [
      costPerformance(project, normalized),
      forecast(project, normalized),
      profitability(project, normalized),
      cashflow(project, normalized),
      reconciliation(project, normalized),
      indirectPressure(project, normalized),
      concentration(project, normalized),
      dataQuality(project, normalized),
    ];
  return {
    id: project.project_id,
    alias: project.project_name,
    name: project.project_name,
    source: `${period} · live generated snapshot`,
    period,
    fingerprint: project.source_fingerprint || "unavailable",
    pos: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
    metrics: {
      Critical: missions.filter((item) => item[0] === "CRITICAL").length,
      Caution: missions.filter((item) => item[0] === "CAUTION").length,
      Favorable: missions.filter((item) => item[0] === "FAVORABLE").length,
      EvidenceGap: missions.filter((item) => item[0] === "UNABLE").length,
      CPI: finite(metrics.cpi) == null ? "—" : Number(metrics.cpi).toFixed(2),
      Budget: money(metrics.budget),
      Profit: money(metrics.gross_profit),
    },
    missions,
  };
}

async function fetchJson(url, fetcher) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetcher(`${url}${separator}game_live=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

export async function loadLiveGameProjects(fetcher = fetch) {
  const portfolio = await fetchJson("/generated/portfolio/latest.json", fetcher);
  const entries = rows(portfolio.projects).filter((item) => item?.project_id && item?.project_name);
  if (!entries.length) throw new Error("No current generated projects are available.");
  const projects = await Promise.all(
    entries.map(async (entry, index) => {
      let normalized = {};
      if (entry.normalized_path) {
        try {
          normalized = await fetchJson(entry.normalized_path, fetcher);
        } catch (error) {
          console.warn(`Normalized detail unavailable for ${entry.project_id}`, error);
        }
      }
      return buildLiveProject(entry, normalized, index, entries.length);
    }),
  );
  const signature = entries
    .map((entry) => `${entry.project_id}:${entry.reporting_period}:${entry.source_fingerprint || "none"}`)
    .sort()
    .join("|");
  return {
    projects,
    signature,
    generatedAt: portfolio.generated_at || null,
    registryFingerprint: portfolio.registry_fingerprint || null,
  };
}
