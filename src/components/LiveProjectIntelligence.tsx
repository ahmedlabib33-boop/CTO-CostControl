"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BubbleChart, DonutChart, GroupedBarChart, LineChart, SimpleWaterfall } from "@/components/Charts";
import { portfolioBase, scoped } from "@/lib/normalized";
import type { NormalizedData, ProjectData, ProjectRegistryItem } from "@/lib/types";
import {
  DEFAULT_INTELLIGENCE_POLICY,
  attachMlMapping,
  buildApplicationDescriptors,
  buildPortfolioDescriptors,
  buildProjectDescriptors,
  buildWholeProjectDescriptors,
  evaluateDescriptor,
  sortIntelligenceResults,
  summarizeApplicationCoverage,
  validateIntelligencePolicy,
  type ApplicationIntelligenceContext,
  type DashboardIntelligenceContext,
  type InsightKind,
  type InsightStatus,
  type IntelligencePolicy,
  type IntelligenceDescriptor,
  type IntelligenceResult,
  type PortfolioIntelligenceContext,
} from "@/lib/liveIntelligence";

type Scope = "application" | "current" | "project" | "portfolio";
type LiveView = "overview" | "charts" | "decisions" | "evidence";
type MlMapping = { family: string; score: number };
type MlState = { state: "loading" | "ready" | "fallback"; progress: number; message: string; mappings: Record<string, MlMapping> };

const STATUS_LABEL: Record<InsightStatus, string> = { critical: "Critical", caution: "Caution", favorable: "Favorable", mixed: "Mixed", informational: "Informational", unavailable: "Unable to assess" };
const POLICY_FIELDS: { key: Exclude<keyof IntelligencePolicy, "version">; label: string; step: number; min?: number; max?: number }[] = [
  { key: "cpiFavorable", label: "CPI favorable", step: .01, min: 0 },
  { key: "cpiCaution", label: "CPI caution floor", step: .01, min: 0 },
  { key: "cvCautionPct", label: "CV / EV critical %", step: .5, max: 0 },
  { key: "vacCautionPct", label: "VAC / BAC critical %", step: .5, max: 0 },
  { key: "marginTargetPct", label: "Margin target %", step: .5 },
  { key: "cashDeficitCautionPct", label: "Cash deficit caution %", step: .5, min: 0 },
  { key: "cashDeficitCriticalPct", label: "Cash deficit critical %", step: .5, min: 0 },
  { key: "wasteCautionPoints", label: "Waste caution points", step: .25, min: 0 },
  { key: "wasteCriticalPoints", label: "Waste critical points", step: .25, min: 0 },
  { key: "reconciliationCautionPct", label: "Reconciliation caution %", step: .25, min: 0 },
  { key: "reconciliationCriticalPct", label: "Reconciliation critical %", step: .25, min: 0 },
  { key: "concentrationCautionPct", label: "Concentration caution %", step: 1, min: 0, max: 100 },
  { key: "concentrationCriticalPct", label: "Concentration critical %", step: 1, min: 0, max: 100 },
  { key: "minimumTrendPeriods", label: "Minimum trend periods", step: 1, min: 2 },
  { key: "trendRSquaredCautionFloor", label: "Cash trend minimum R²", step: .05, min: 0, max: 1 },
  { key: "trendAnomalyCautionZ", label: "Cash trend anomaly caution z", step: .1, min: .1 },
  { key: "trendAnomalyCriticalZ", label: "Cash trend anomaly critical z", step: .1, min: .1 },
];

function policyStorageKey(context: DashboardIntelligenceContext | null) {
  return `cto-live-intelligence-policy-v1:${context?.kind === "project" ? context.data.project_id : "portfolio"}`;
}

function loadPolicy(key: string): IntelligencePolicy {
  try { return validateIntelligencePolicy(JSON.parse(localStorage.getItem(key) || "null")) || DEFAULT_INTELLIGENCE_POLICY; } catch { return DEFAULT_INTELLIGENCE_POLICY; }
}

function metricValue(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function evidenceLabel(result: Pick<IntelligenceResult, "confidence" | "status">) {
  if (result.status === "unavailable" || result.confidence <= 0) return "Evidence gap";
  if (result.confidence >= .99) return "Exact source match";
  if (result.confidence >= .85) return "Strong source support";
  if (result.confidence >= .7) return "Partial source support";
  return "Limited source support";
}

type ApplicationLiveState = {
  context: ApplicationIntelligenceContext | null;
  loading: boolean;
  error: string;
  refreshedAt: string | null;
};

function useApplicationContext(): ApplicationLiveState {
  const [state, setState] = useState<ApplicationLiveState>({ context: null, loading: true, error: "", refreshedAt: null });
  const signatureRef = useRef("");
  useEffect(() => {
    let cancelled = false;
    const load = async (force = false) => {
      try {
        const registryResponse = await fetch("/generated/projects.json", { cache: "no-store" });
        if (!registryResponse.ok) throw new Error("The generated project registry is unavailable.");
        const projects = await registryResponse.json() as ProjectRegistryItem[];
        const signature = projects.map(project => `${project.project_id}:${project.source_fingerprint}:${project.normalized_path || ""}`).join("|");
        if (!force && signature === signatureRef.current) {
          if (!cancelled) setState(current => ({ ...current, loading: false, refreshedAt: new Date().toISOString() }));
          return;
        }
        const [contexts, conflicts] = await Promise.all([
          Promise.all(projects.map(async registry => {
            try {
              const latestResponse = await fetch(`/generated/projects/${encodeURIComponent(registry.project_id)}/latest.json`, { cache: "no-store" });
              if (!latestResponse.ok) return null;
              const data = await latestResponse.json() as ProjectData;
              let normalized: NormalizedData | Record<string, never> = {};
              if (data.normalized_path) {
                const normalizedResponse = await fetch(data.normalized_path, { cache: "no-store" });
                if (normalizedResponse.ok) normalized = await normalizedResponse.json() as NormalizedData;
              }
              return { kind: "project" as const, view: "executive-overview" as const, data, normalized };
            } catch { return null; }
          })),
          fetch("/generated/identity-conflicts.json", { cache: "no-store" }).then(response => response.ok ? response.json() : []).catch(() => []),
        ]);
        if (cancelled) return;
        const projectContexts = contexts.filter((item): item is NonNullable<typeof item> => item != null);
        const normalizedByProject = Object.fromEntries(projectContexts.map(item => [item.data.project_id, item.normalized]));
        const active = projects.map(registry => scoped(portfolioBase({ registry, normalized: normalizedByProject[registry.project_id] || null }), "dashboard"));
        signatureRef.current = signature;
        setState({
          context: { portfolio: { kind: "portfolio", view: "charts", scope: "dashboard", projects, active, conflicts: Array.isArray(conflicts) ? conflicts : [] }, projects: projectContexts },
          loading: false,
          error: projectContexts.length === projects.length ? "" : `${projects.length - projectContexts.length} registered project source(s) could not be loaded and remain an evidence gap.`,
          refreshedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!cancelled) setState(current => ({ ...current, loading: false, error: String((error as Error)?.message || error), refreshedAt: new Date().toISOString() }));
      }
    };
    load(true);
    const timer = window.setInterval(() => load(false), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  return state;
}

function useMl(descriptors: { componentId: string; componentName: string; semanticType: string }[]): MlState {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<MlState>({ state: "loading", progress: 0, message: "Preparing local semantic model…", mappings: {} });
  const signature = descriptors.map(x => `${x.componentId}:${x.componentName}:${x.semanticType}`).join("|");
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/intelligence.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = event => {
        const msg = event.data || {};
        if (msg.type === "progress") setState(s => ({ ...s, state: "loading", progress: Number(msg.progress) || 0, message: msg.message || "Loading local model…" }));
        if (msg.type === "ready") setState(s => ({ ...s, state: "ready", progress: 100, message: msg.backend ? `Local ML ready · ${msg.backend}` : "Local ML ready", mappings: msg.mappings || {} }));
        if (msg.type === "fallback") setState(s => ({ ...s, state: "fallback", progress: 0, message: `Deterministic engine active · ML unavailable: ${msg.message || "initialization failed"}`, mappings: {} }));
      };
      worker.onerror = () => setState(s => ({ ...s, state: "fallback", progress: 0, message: "Deterministic engine active · ML worker unavailable", mappings: {} }));
      worker.postMessage({ type: "classify", items: descriptors });
    } catch {
      setState(s => ({ ...s, state: "fallback", message: "Deterministic engine active · browser worker unavailable", mappings: {} }));
      return;
    }
    return () => { try { worker.postMessage({ type: "dispose" }); } catch {} worker.terminate(); workerRef.current = null; };
  }, [signature]);
  return state;
}

function PolicySettings({ policy, onChange, storageKey, onClose }: { policy: IntelligencePolicy; onChange: (value: IntelligencePolicy) => void; storageKey: string; onClose: () => void }) {
  const [draft, setDraft] = useState(policy), [message, setMessage] = useState("");
  const save = () => { const valid = validateIntelligencePolicy(draft); if (!valid) { setMessage("Threshold relationships are invalid."); return; } localStorage.setItem(storageKey, JSON.stringify(valid)); onChange(valid); setMessage("Saved locally in this browser."); };
  const reset = () => { localStorage.removeItem(storageKey); setDraft(DEFAULT_INTELLIGENCE_POLICY); onChange(DEFAULT_INTELLIGENCE_POLICY); setMessage("Defaults restored."); };
  const download = () => { const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "CTO-Intelligence-Policy.json"; a.click(); URL.revokeObjectURL(url); };
  const upload = async (file?: File) => { if (!file) return; try { const valid = validateIntelligencePolicy(JSON.parse(await file.text())); if (!valid) throw new Error(); setDraft(valid); setMessage("Policy imported. Press Save to apply."); } catch { setMessage("Invalid policy file. Nothing was changed."); } };
  return <section className="livePolicy" aria-label="Intelligence threshold settings"><div className="livePolicyHead"><div><span className="ollaEyebrow">Local decision policy</span><h2>Threshold Settings</h2><p>Saved per project or portfolio in this browser only. Source JSON is never changed.</p></div><button type="button" onClick={onClose}>Close</button></div><div className="livePolicyGrid">{POLICY_FIELDS.map(field => <label key={field.key}><span>{field.label}</span><input type="number" value={draft[field.key]} step={field.step} min={field.min} max={field.max} onChange={event => setDraft(value => ({ ...value, [field.key]: Number(event.target.value) }))}/></label>)}</div><div className="livePolicyActions"><button type="button" className="primary" onClick={save}>Save locally</button><button type="button" onClick={reset}>Reset defaults</button><button type="button" onClick={download}>Export JSON</button><label className="liveImport">Import JSON<input type="file" accept="application/json,.json" onChange={event => upload(event.target.files?.[0])}/></label></div>{message && <p className="livePolicyMessage">{message}</p>}</section>;
}

function InsightCard({ result }: { result: IntelligenceResult }) {
  return <details className={`liveInsightCard ${result.status}`} open={result.status === "critical"}><summary><div><span className="liveStatus">{STATUS_LABEL[result.status]}</span><h3>{result.componentName}</h3><p>{result.indication}</p></div><span className="liveConfidence">{evidenceLabel(result)}</span></summary><div className="liveInsightBody"><div className="liveMetricStrip">{Object.entries(result.metrics).slice(0, 10).map(([key, value]) => <div key={key}><span>{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</span><b>{metricValue(value)}</b></div>)}</div><div className="liveNarrativeGrid"><section><span>What it measures</span><p>{result.meaning}</p></section><section><span>Why</span><p>{result.reason}</p></section><section className="decision"><span>Management decision</span><p>{result.decision}</p></section>{result.risks.length > 0 && <section><span>Risk</span><ul>{result.risks.map(item => <li key={item}>{item}</li>)}</ul></section>}{result.benefits.length > 0 && <section><span>Benefit</span><ul>{result.benefits.map(item => <li key={item}>{item}</li>)}</ul></section>}{result.mitigation.length > 0 && <section><span>Mitigation</span><ul>{result.mitigation.map(item => <li key={item}>{item}</li>)}</ul></section>}{result.keepOnTrack.length > 0 && <section><span>Keep on track</span><ul>{result.keepOnTrack.map(item => <li key={item}>{item}</li>)}</ul></section>}</div><div className="liveEvidence"><span><b>Evidence support:</b> {evidenceLabel(result)}</span><span><b>Rule:</b> {result.ruleApplied}</span><span><b>Basis:</b> {result.assessmentBasis}</span><span><b>Project / period:</b> {result.projectName} · {result.period}</span><span><b>Revision:</b> {result.revision ? `${result.revision.slice(0, 20)}…` : "—"}</span>{result.sourceEvidence.slice(0, 4).map(item => <span key={item}><b>Evidence:</b> {item}</span>)}</div></div></details>;
}

function StatusChart({ results, onSelect }: { results: IntelligenceResult[]; onSelect: (status: InsightStatus) => void }) {
  const total = Math.max(1, results.length);
  const critical = results.filter(item => item.status === "critical").length;
  const caution = results.filter(item => item.status === "caution").length;
  const unavailable = results.filter(item => item.status === "unavailable").length;
  const favorable = results.filter(item => item.status === "favorable").length;
  const criticalEnd = critical / total * 360, cautionEnd = (critical + caution) / total * 360, unavailableEnd = (critical + caution + unavailable) / total * 360;
  return <article className="liveDashboardChart"><header><div><span>Live control distribution</span><h3>What the current evidence indicates</h3></div><small>Click a status to inspect its evidence</small></header><div className="liveStatusChartBody"><div className="liveStatusDonut" style={{ "--live-critical": `${criticalEnd}deg`, "--live-caution": `${cautionEnd}deg`, "--live-gap": `${unavailableEnd}deg` } as CSSProperties}><div><b>{results.length}</b><span>controlled<br/>components</span></div></div><div className="liveStatusLegend"><button className="critical" onClick={() => onSelect("critical")}><i/><span>Critical</span><b>{critical}</b></button><button className="caution" onClick={() => onSelect("caution")}><i/><span>Caution</span><b>{caution}</b></button><button className="unavailable" onClick={() => onSelect("unavailable")}><i/><span>Unable to assess</span><b>{unavailable}</b></button><button className="favorable" onClick={() => onSelect("favorable")}><i/><span>Favorable</span><b>{favorable}</b></button></div></div><footer><b>How to read it</b><p>Red and amber require management attention. Grey is an evidence gap, not a safe result. Green is favorable only where the active rule has a valid comparison basis.</p></footer></article>;
}

function FamilyChart({ results, onSelect }: { results: IntelligenceResult[]; onSelect: (family: string) => void }) {
  const rows = [...new Set(results.map(item => item.family))].map(family => {
    const items = results.filter(item => item.family === family);
    return { family, total: items.length, critical: items.filter(item => item.status === "critical").length, caution: items.filter(item => item.status === "caution").length, unavailable: items.filter(item => item.status === "unavailable").length };
  }).sort((a, b) => (b.critical * 100 + b.caution * 10 + b.unavailable) - (a.critical * 100 + a.caution * 10 + a.unavailable));
  const max = Math.max(1, ...rows.map(item => item.total));
  return <article className="liveDashboardChart"><header><div><span>Exposure by business family</span><h3>Where management attention is concentrated</h3></div><small>Bars retain the source-backed status mix</small></header><div className="liveFamilyBars">{rows.map(row => <button key={row.family} onClick={() => onSelect(row.family)}><span>{row.family}</span><div><i className="critical" style={{ width: `${row.critical / max * 100}%` }}/><i className="caution" style={{ width: `${row.caution / max * 100}%` }}/><i className="unavailable" style={{ width: `${row.unavailable / max * 100}%` }}/></div><b>{row.total}</b></button>)}</div><footer><b>Management meaning</b><p>The highest red family is the first escalation area. Amber families need active monitoring. Grey families require source correction before a conclusion is made.</p></footer></article>;
}

function EvidenceConfidenceChart({ results }: { results: IntelligenceResult[] }) {
  const rows = results.slice(0, 12);
  return <article className="liveDashboardChart liveConfidenceChart"><header><div><span>Evidence support chart</span><h3>How strongly each conclusion is supported</h3></div><small>Support tiers describe source traceability; they are not accuracy or probability</small></header><div className="liveConfidenceBars">{rows.length ? rows.map(result => <div key={`${result.projectId}-${result.componentId}`}><span>{result.componentName}</span><div><i className={result.status} style={{ width: `${Math.max(2, result.confidence * 100)}%` }}/></div><b>{evidenceLabel(result)}</b></div>) : <p>No controlled evidence is available for this scope.</p>}</div><footer><b>How to read it</b><p>Limited support prevents a strong conclusion. It does not convert missing evidence into a favorable result.</p></footer></article>;
}

function ResultTable({ results, title, note, limit = 14 }: { results: IntelligenceResult[]; title: string; note: string; limit?: number }) {
  const rows = results.slice(0, limit);
  return <article className="liveDashboardTable"><header><div><span>Controlled data table</span><h3>{title}</h3></div><small>{note}</small></header><div className="liveTableWrap"><table><thead><tr><th>Component</th><th>Project / period</th><th>Status</th><th>Current metric</th><th>Evidence</th><th>Management reading</th></tr></thead><tbody>{rows.length ? rows.map(result => {
    const metric = Object.entries(result.metrics).find((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]));
    return <tr key={`${result.projectId}-${result.componentId}`}><td><b>{result.componentName}</b><small>{result.family} · {result.kind}</small></td><td><b>{result.projectName}</b><small>{result.period}</small></td><td><span className={`liveTableStatus ${result.status}`}>{STATUS_LABEL[result.status]}</span></td><td>{metric ? <><b>{metricValue(metric[1])}</b><small>{metric[0].replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</small></> : <span>—</span>}</td><td><b>{evidenceLabel(result)}</b><small>{result.sourceEvidence[0] || "No source reference"}</small></td><td><p>{result.indication}</p><small>{result.decision}</small></td></tr>;
  }) : <tr><td colSpan={6}><div className="liveTableEmpty">No controlled rows are available for this selection.</div></td></tr>}</tbody></table></div><footer>Showing {rows.length} of {results.length} controlled components. Values are read from the active project, period, revision and scope.</footer></article>;
}

const chartRows = (descriptor: IntelligenceDescriptor) => Array.isArray(descriptor.rows) ? descriptor.rows : [];
const chartNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const chartText = (row: Record<string, unknown>, keys: string[], fallback: string) => {
  for (const key of keys) if (row[key] != null && String(row[key]).trim()) return String(row[key]);
  return fallback;
};
const rowNumber = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) { const value = chartNumber(row[key]); if (value != null) return value; }
  return null;
};
const aggregateChartRows = (rows: Record<string, unknown>[], labelKeys: string[], valueKeys: string[], limit = 16) => {
  const totals = new Map<string, number>();
  rows.forEach((row, index) => {
    const label = chartText(row, labelKeys, `Row ${index + 1}`), value = rowNumber(row, valueKeys);
    if (value != null) totals.set(label, (totals.get(label) || 0) + value);
  });
  return [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit);
};

function ApplicationChart({ descriptor, context }: { descriptor: IntelligenceDescriptor; context: DashboardIntelligenceContext | null }) {
  const rows = chartRows(descriptor), metrics = descriptor.metrics;
  const componentIs = (id: string) => descriptor.componentId === id || descriptor.componentId.endsWith(`-${id}`);
  const portfolioContext = context?.kind === "portfolio" ? context : null;
  const active = portfolioContext?.active || [];
  if (componentIs("portfolio-position") && active.length) return <GroupedBarChart labels={active.map(item => item.name)} series={[{ label: "Budget", values: active.map(item => item.budget) }, { label: "EV", values: active.map(item => item.ev) }, { label: "Actual Cost", values: active.map(item => item.ac) }]}/>;
  if (componentIs("portfolio-margin") && active.length) return <BubbleChart points={active.map(item => ({ label: item.name, x: item.cpi || 0, y: item.gpPct * 100, size: item.contract, detail: `${item.name} · CPI ${item.cpi?.toFixed(2) ?? "—"} · GP ${(item.gpPct * 100).toFixed(1)}%` }))}/>;
  if (componentIs("portfolio-mix") && active.length) return <GroupedBarChart labels={active.map(item => item.name)} series={[{ label: "Direct AC", values: active.map(item => item.directAc) }, { label: "Indirect AC", values: active.map(item => item.indirectAc) }]}/>;
  if (componentIs("portfolio-profit") && active.length) return <GroupedBarChart labels={active.map(item => item.name)} series={[{ label: "Revenue", values: active.map(item => item.revenue) }, { label: "Actual Cost", values: active.map(item => item.ac) }, { label: "Gross Profit", values: active.map(item => item.gp) }]}/>;
  if (componentIs("portfolio-cashflow") && active.length) {
    const months = [...new Set<string>(active.flatMap(item => (item.cashflow || []).map((row: Record<string, unknown>) => String(row.month))))].sort();
    return <LineChart labels={months} series={active.flatMap(item => [{ label: `${item.name} · Cash In`, values: months.map(month => chartNumber((item.cashflow || []).find((row: Record<string, unknown>) => String(row.month) === month)?.cash_in_cum)) }, { label: `${item.name} · Cash Out`, values: months.map(month => chartNumber((item.cashflow || []).find((row: Record<string, unknown>) => String(row.month) === month)?.cash_out_cum)) }])}/>;
  }
  if (componentIs("monthly-comparison-chart") && active.length) {
    const months = [...new Set<string>(active.flatMap(item => (item.cashflow || []).map((row: Record<string, unknown>) => String(row.month))))].sort();
    const series = active.map(item => ({
      label: item.name,
      values: months.map(month => chartNumber((item.cashflow || []).find((row: Record<string, unknown>) => String(row.month) === month)?.cash_in)),
    }));
    return <GroupedBarChart labels={months} series={series}/>;
  }
  if (descriptor.componentId === "division-cost-position") {
    const divisions = [...new Set(rows.map((row, index) => chartText(row, ["division"], `Division ${index + 1}`)))];
    const total = (division: string, keys: string[]) => rows.filter((row, index) => chartText(row, ["division"], `Division ${index + 1}`) === division).reduce((sum, row) => sum + (rowNumber(row, keys) || 0), 0);
    return <GroupedBarChart labels={divisions} series={[{ label: "Budget", values: divisions.map(name => total(name, ["original_budget", "budget", "bac"])) }, { label: "EV", values: divisions.map(name => total(name, ["ev"])) }, { label: "AC", values: divisions.map(name => total(name, ["ac", "actual_cost"])) }]}/>;
  }
  if (descriptor.componentId === "cost-performance-map") return <BubbleChart points={rows.filter(row => rowNumber(row, ["cpi_to_date", "cpi"]) != null).map((row, index) => ({ label: chartText(row, ["item", "main_code"], `Item ${index + 1}`), x: (rowNumber(row, ["completion"]) || 0) * 100, y: rowNumber(row, ["cpi_to_date", "cpi"]) || 0, size: rowNumber(row, ["original_budget", "budget", "bac"]) || 0 }))}/>;
  if (descriptor.componentId === "profitability") return <GroupedBarChart horizontal labels={rows.map((row, index) => chartText(row, ["method", "source"], `Method ${index + 1}`))} series={[{ label: "Profit / Net Profit", values: rows.map(row => rowNumber(row, ["profit"])) }]}/>;
  if (descriptor.componentId === "monthly-cashflow") return <GroupedBarChart labels={rows.map((row, index) => chartText(row, ["month"], `Period ${index + 1}`))} series={[{ label: "Cash In", values: rows.map(row => rowNumber(row, ["cash_in"])) }, { label: "Cash Out", values: rows.map(row => rowNumber(row, ["cash_out"])) }, { label: "Net", values: rows.map(row => { const cashIn = rowNumber(row, ["cash_in"]), cashOut = rowNumber(row, ["cash_out"]); return cashIn != null && cashOut != null ? cashIn - cashOut : null; }) }]}/>;
  if (["cumulative-cashflow", "cashflow-trend"].includes(descriptor.componentId)) return <LineChart labels={rows.map((row, index) => chartText(row, ["month"], `Period ${index + 1}`))} series={descriptor.componentId === "cumulative-cashflow" ? [{ label: "Cumulative Cash In", values: rows.map(row => rowNumber(row, ["cash_in_cum"])) }, { label: "Cumulative Cash Out", values: rows.map(row => rowNumber(row, ["cash_out_cum"])) }] : [{ label: "Cumulative Net Cash", values: rows.map(row => { const cashIn = rowNumber(row, ["cash_in_cum"]), cashOut = rowNumber(row, ["cash_out_cum"]); return cashIn != null && cashOut != null ? cashIn - cashOut : null; }) }]}/>;
  if (["resource-pareto", "boq-resource-chart", "top-cost-codes"].includes(descriptor.componentId)) {
    const values = aggregateChartRows(rows, ["resource", "resource_code", "code", "name", "label", "main_code"], ["actual_cost", "value", "total", "cost"]);
    return <GroupedBarChart horizontal labels={values.map(item => item.name)} series={[{ label: "Actual Cost", values: values.map(item => item.value) }]}/>;
  }
  if (descriptor.componentId === "waste-efficiency") return <GroupedBarChart labels={["Steel", "Concrete"]} series={[{ label: "Actual Waste %", values: [(metrics.steelActual || 0) * 100, (metrics.concreteActual || 0) * 100] }, { label: "Budget Waste %", values: [(metrics.steelBudget || 0) * 100, (metrics.concreteBudget || 0) * 100] }]} valueFormatter={value => `${value.toFixed(2)}%`}/>;
  if (descriptor.componentId === "classification-bridge") {
    const raw = metrics.rawDirect || 0, equipment = metrics.equipment || 0, other = metrics.other || 0;
    return <SimpleWaterfall labels={["Raw direct ledger", "+ Equipment realloc.", "+ Other-cost realloc.", "Reported direct AC"]} levels={[raw, raw + equipment, raw + equipment + other, metrics.reported || 0]}/>;
  }
  if (descriptor.componentId === "ledger-trend") return <GroupedBarChart labels={rows.map((row, index) => chartText(row, ["month"], `Period ${index + 1}`))} series={[{ label: "Ledger actual cost", values: rows.map(row => rowNumber(row, ["total", "value"])) }]}/>;
  if (descriptor.componentId === "expense-source-mix") {
    const values = aggregateChartRows(rows, ["source", "name", "label", "category"], ["value", "total", "cost"]);
    return <DonutChart items={values}/>;
  }
  if (descriptor.componentId === "ledger-reconciliation") return <GroupedBarChart labels={["Dashboard Actual Cost", "Accounting ledger", "Raw direct ledger", "Raw indirect ledger"]} series={[{ label: "EGP", values: [metrics.reported, metrics.accounting, metrics.rawDirect, metrics.rawIndirect] }]}/>;
  if (componentIs("scenario-lab")) return <GroupedBarChart labels={["Current AC", "Scenario EAC", "Scenario Revenue", "Scenario Profit"]} series={[{ label: "Scenario", values: [metrics.currentAc, metrics.eac, metrics.revenue, metrics.profit] }]}/>;
  const fallbackRows = rows.slice(0, 14), labelKeys = ["item", "description", "boq_item", "main_code", "code", "category", "month", "source", "label", "name"];
  const preferred = ["budget", "original_budget", "bac", "ev", "ac", "actual_cost", "cost", "value", "total", "etc", "eac", "vac", "steel", "concrete"];
  const availableKeys = preferred.filter(key => fallbackRows.some(row => rowNumber(row, [key]) != null)).slice(0, 3);
  if (fallbackRows.length && availableKeys.length) return <GroupedBarChart labels={fallbackRows.map((row, index) => chartText(row, labelKeys, `Row ${index + 1}`))} series={availableKeys.map(key => ({ label: key.replaceAll("_", " "), values: fallbackRows.map(row => rowNumber(row, [key])) }))}/>;
  const metricEntries = Object.entries(metrics).filter((entry): entry is [string, number] => chartNumber(entry[1]) != null).slice(0, 10);
  return <GroupedBarChart horizontal labels={metricEntries.map(([key]) => key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " "))} series={[{ label: "Current controlled value", values: metricEntries.map(([, value]) => value) }]}/>;
}

function ExplainedApplicationChart({ descriptor, result, context }: { descriptor: IntelligenceDescriptor; result: IntelligenceResult; context: DashboardIntelligenceContext | null }) {
  return <article className={`liveExplainedChart liveApplicationChart ${result.status}`}><header><div><span>{STATUS_LABEL[result.status]} · {result.family}</span><h3>{result.componentName}</h3><p>{result.projectName} · {result.period}</p></div><b>{evidenceLabel(result)}</b></header><div className="liveApplicationChartPlot"><ApplicationChart descriptor={descriptor} context={context}/></div><div className="liveChartExplanation"><section><span>What this chart measures</span><p>{result.meaning}</p></section><section><span>Current reading</span><p>{result.indication}</p></section><section><span>Why it matters</span><p>{result.reason}</p></section><section className="decision"><span>Recommended decision</span><p>{result.decision}</p></section></div></article>;
}

function SupportingApplicationCharts({ pairs, context, title }: { pairs: { descriptor: IntelligenceDescriptor; result: IntelligenceResult }[]; context: DashboardIntelligenceContext | null; title: string }) {
  return <section className="liveSupportingCharts"><header><div><span className="ollaEyebrow">Current-data charts</span><h2>{title}</h2><p>These are the same controlled chart components and values used by the main application, followed by the second-layer management reading.</p></div></header><div className="liveChartGallery liveChartGalleryCompact">{pairs.slice(0, 2).map(({ descriptor, result }) => <ExplainedApplicationChart key={`${result.projectId}-${result.componentId}`} descriptor={descriptor} result={result} context={context}/>)}</div></section>;
}

function DecisionCard({ result }: { result: IntelligenceResult }) {
  const actions = result.status === "favorable" ? result.keepOnTrack : result.mitigation;
  return <article className={`liveDecisionCard ${result.status}`}><header><div><span>{STATUS_LABEL[result.status]} · {result.family}</span><h3>{result.componentName}</h3><p>{result.projectName} · {result.period}</p></div><b>{evidenceLabel(result)}</b></header><section><span>What the data indicates</span><p>{result.indication}</p></section><section><span>Why</span><p>{result.reason}</p></section><section className="decision"><span>Management decision</span><p>{result.decision}</p></section><section><span>{result.status === "favorable" ? "Keep on track" : "Mitigation and actions"}</span>{actions.length ? <ol>{actions.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, "0")}</b><p>{item}</p></li>)}</ol> : <p>No action is asserted until the missing evidence is resolved.</p>}</section></article>;
}

function openingLiveView(context: DashboardIntelligenceContext | null): LiveView {
  if (context?.kind === "portfolio") {
    if (context.view === "analysis") return "overview";
    if (context.view === "risk") return "decisions";
  }
  return "charts";
}

export default function LiveProjectIntelligence({ context, onBack }: { context: DashboardIntelligenceContext | null; onBack: () => void }) {
  const [scope, setScope] = useState<Scope>("application"), [view, setView] = useState<LiveView>(() => openingLiveView(context)), [family, setFamily] = useState("ALL"), [kind, setKind] = useState<InsightKind | "ALL">("ALL"), [status, setStatus] = useState<InsightStatus | "ALL">("ALL"), [settings, setSettings] = useState(false);
  const application = useApplicationContext(), portfolio = application.context?.portfolio || null, storageKey = policyStorageKey(context), [policy, setPolicy] = useState<IntelligencePolicy>(DEFAULT_INTELLIGENCE_POLICY);
  useEffect(() => setPolicy(loadPolicy(storageKey)), [storageKey]);
  useEffect(() => setView(openingLiveView(context)), [context?.kind, context?.view]);
  useEffect(() => { if (context?.kind === "portfolio" && scope === "project") setScope("current"); }, [context?.kind, scope]);
  const descriptors = useMemo(() => {
    if (scope === "application") return application.context ? buildApplicationDescriptors(application.context) : [];
    if (!context) return [];
    if (scope === "current") return context.kind === "project" ? buildProjectDescriptors(context) : buildPortfolioDescriptors(context);
    if (scope === "project" && context.kind === "project") return buildWholeProjectDescriptors(context);
    const p = context.kind === "portfolio" ? context : portfolio;
    if (!p) return [];
    const charts = buildPortfolioDescriptors({ ...p, view: "charts" }), analysis = buildPortfolioDescriptors({ ...p, view: "analysis" });
    return [...charts, ...analysis].filter((item, index, all) => all.findIndex(other => other.componentId === item.componentId) === index);
  }, [context, scope, portfolio, application.context]);
  const ml = useMl(descriptors);
  const results = useMemo(() => sortIntelligenceResults(descriptors.map(item => {
    const result = evaluateDescriptor(item, policy), mapping = ml.mappings[item.componentId];
    return mapping ? attachMlMapping(result, mapping.family, mapping.score) : result;
  })), [descriptors, policy, ml.mappings]);
  const families = [...new Set(results.map(item => item.family))];
  const shown = results.filter(item => (family === "ALL" || item.family === family) && (kind === "ALL" || item.kind === kind) && (status === "ALL" || item.status === status));
  const counts = (Object.keys(STATUS_LABEL) as InsightStatus[]).map(key => ({ key, count: results.filter(item => item.status === key).length }));
  const priority = results.find(item => item.status === "critical") || results.find(item => item.status === "caution") || results.find(item => item.status === "unavailable") || results[0];
  const resultByComponent = new Map(results.map(item => [`${item.projectId}:${item.componentId}`, item]));
  const sourceChartDescriptors = descriptors.filter(item => item.kind === "chart" || item.kind === "scenario");
  const visualDescriptors = sourceChartDescriptors.length ? sourceChartDescriptors : descriptors.filter(item => ["kpi", "table", "assurance"].includes(item.kind));
  const chartPairs = visualDescriptors.map(descriptor => ({ descriptor, result: resultByComponent.get(`${descriptor.projectId}:${descriptor.componentId}`) })).filter((item): item is { descriptor: IntelligenceDescriptor; result: IntelligenceResult } => Boolean(item.result));
  const chartResults = chartPairs.map(item => item.result);
  const chartContext = scope === "application" ? portfolio : scope === "portfolio" ? (context?.kind === "portfolio" ? context : portfolio) : context;
  const decisionResults = results.filter(item => ["critical", "caution", "mixed", "unavailable", "favorable"].includes(item.status));
  const coverage = scope === "application" && application.context ? summarizeApplicationCoverage(descriptors, application.context.portfolio.projects.length) : null;
  const openStatus = (next: InsightStatus) => { setStatus(next); setFamily("ALL"); setKind("ALL"); setView("evidence"); };
  const openFamily = (next: string) => { setFamily(next); setStatus("ALL"); setKind("ALL"); setView("evidence"); };
  if (settings) return <PolicySettings policy={policy} onChange={setPolicy} storageKey={storageKey} onClose={() => setSettings(false)}/>;
  const countByStatus = Object.fromEntries(counts.map(item => [item.key, item.count])) as Record<InsightStatus, number>;
  const coverageLabel = application.loading
    ? "Loading registry"
    : coverage
      ? `${coverage.coveredSurfaces} / ${coverage.expectedSurfaces}`
      : "Unavailable";
  const activeScopeLabel = scope === "application" ? "Entire application" : scope === "current" ? "Current page" : scope === "project" ? "Whole project" : "Portfolio";
  const viewItems: { id: LiveView; number: string; label: string; note: string }[] = [
    { id: "charts", number: "01", label: "Charts & Explanations", note: "Visual performance reading" },
    { id: "overview", number: "02", label: "Analysis & Tables", note: "Executive control register" },
    { id: "decisions", number: "03", label: "Risk & Decisions", note: "Actions and mitigation" },
    { id: "evidence", number: "04", label: "Evidence & Sources", note: "Rules and traceability" },
  ];
  return <section className="liveIntelligence">
    <header className="liveIntelligenceHead">
      <div className="liveTitleBlock">
        <span className="ollaEyebrow">Eng. OLLA · Live Project Intelligence</span>
        <div className="liveTitleRow"><h1>Decision Intelligence</h1><span className={`liveSourceBeacon ${application.error ? "warning" : ""}`}><i/>{application.error ? "Source check limited" : "Current controlled data"}</span></div>
        <p>Every registered business surface is read from the active controlled JSON. Missing, conflicting or unsupported evidence stays clearly unavailable.</p>
      </div>
      <div className="liveHeadActions"><button type="button" onClick={() => setSettings(true)}>Threshold Settings</button><button type="button" onClick={onBack}>← Mastery Home</button></div>
    </header>

    <section className="liveCommandBar" aria-label="Live intelligence controls">
      <div className="liveScopeGroup"><span>Analysis scope</span><div className="liveScope">
        <button aria-pressed={scope === "application"} className={scope === "application" ? "active" : ""} onClick={() => setScope("application")}>Entire app</button>
        <button aria-pressed={scope === "current"} className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}>Current page</button>
        {context?.kind === "project" && <button aria-pressed={scope === "project"} className={scope === "project" ? "active" : ""} onClick={() => setScope("project")}>Whole project</button>}
        <button aria-pressed={scope === "portfolio"} className={scope === "portfolio" ? "active" : ""} onClick={() => setScope("portfolio")}>Portfolio</button>
      </div></div>
      <div className="liveCommandMetrics">
        <div><span>Active scope</span><b>{activeScopeLabel}</b></div>
        <div><span>Registered surfaces</span><b>{scope === "application" ? coverageLabel : results.length}</b></div>
        <div className={countByStatus.unavailable ? "warning" : ""}><span>Evidence gaps</span><b>{countByStatus.unavailable}</b></div>
        <div><span>Source refreshed</span><b>{application.refreshedAt ? new Date(application.refreshedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "Waiting"}</b></div>
      </div>
      {scope === "application" && <p className={`liveCommandNote ${application.error ? "warning" : ""}`}>{application.error || "Registry fingerprints are rechecked every 15 seconds. Data reloads only when a controlled revision changes."}</p>}
    </section>

    <nav className="liveViewTabs" aria-label="Decision intelligence pages">{viewItems.map(item => <button type="button" key={item.id} aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span className="liveViewNumber">{item.number}</span><span><b>{item.label}</b><small>{item.note}</small></span></button>)}</nav>

    <section className="liveExecutivePulse" aria-label="Current executive intelligence pulse">
      <div className="livePulseLabel"><span>Live executive pulse</span><b>{results.length} controlled components</b></div>
      <div className="livePulseStatuses">
        {(["critical", "caution", "favorable", "unavailable"] as InsightStatus[]).map(item => <button type="button" key={item} className={item} onClick={() => openStatus(item)}><i/><span>{STATUS_LABEL[item]}</span><b>{countByStatus[item]}</b></button>)}
      </div>
      {priority ? <button type="button" className={`livePulsePriority ${priority.status}`} onClick={() => { setStatus(priority.status); setView("decisions"); }}><span>Management focus</span><b>{priority.componentName}</b><small>{priority.indication}</small><i>Open decision →</i></button> : <div className="livePulsePriority unavailable"><span>Management focus</span><b>Waiting for controlled data</b><small>No conclusion is shown until a registered business surface is available.</small></div>}
    </section>

    <div className="liveViewViewport" key={view}>
    {view === "overview" && <div className="liveOverview"><SupportingApplicationCharts pairs={chartPairs} context={chartContext} title="Analysis charts and interpreted signals"/><div className="liveSummary">{counts.map(item => <button key={item.key} className={item.key} onClick={() => openStatus(item.key)}><span>{STATUS_LABEL[item.key]}</span><b>{item.count}</b></button>)}</div>{priority ? <section className={`livePriority ${priority.status}`}><div><span>Highest current management signal</span><h2>{priority.componentName}</h2><p>{priority.indication}</p></div><div><span>Recommended decision</span><b>{priority.decision}</b><button onClick={() => { setStatus(priority.status); setView("decisions"); }}>Open decision and actions →</button></div></section> : <div className="liveEmpty"><b>No controlled components are available.</b><span>Open a populated project or portfolio page before activating the Trick layer.</span></div>}<div className="liveDashboardGrid"><StatusChart results={results} onSelect={openStatus}/><FamilyChart results={results} onSelect={openFamily}/></div><ResultTable results={results} title="Executive control register" note="The chart signals and their exact current-data rows"/></div>}
    {view === "charts" && <div className="liveChartsPage"><header><div><span className="ollaEyebrow">Current data · visual reading</span><h2>Main application charts with their management explanation</h2><p>The same chart components read the same active project, period, revision and scope as the main app. The Trick layer adds the controlled interpretation underneath.</p></div><select value={family} onChange={event => setFamily(event.target.value)}><option value="ALL">All business families</option>{families.map(item => <option key={item}>{item}</option>)}</select></header><div className="liveChartGallery">{chartPairs.filter(item => family === "ALL" || item.result.family === family).length ? chartPairs.filter(item => family === "ALL" || item.result.family === family).map(({ descriptor, result }) => <ExplainedApplicationChart key={`${result.projectId}-${result.componentId}`} descriptor={descriptor} result={result} context={chartContext}/>) : <div className="liveEmpty"><b>No chart data is available for this selection.</b><span>The application will not draw or explain a chart without controlled numeric evidence.</span></div>}</div><ResultTable results={chartResults.filter(item => family === "ALL" || item.family === family)} title="Chart metric register" note="Exact values behind every application chart displayed above"/></div>}
    {view === "decisions" && <div className="liveDecisionsPage"><header><div><span className="ollaEyebrow">Management action register</span><h2>Decision, mitigation and keep-on-track actions</h2><p>Critical and caution items appear first. Favorable controls remain visible with the actions required to preserve them.</p></div><select value={status} onChange={event => setStatus(event.target.value as InsightStatus | "ALL")}><option value="ALL">All decision statuses</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></header><SupportingApplicationCharts pairs={chartPairs} context={chartContext} title="Risk signals shown on their source charts"/><div className="liveDashboardGrid"><StatusChart results={decisionResults.filter(item => status === "ALL" || item.status === status)} onSelect={openStatus}/><FamilyChart results={decisionResults.filter(item => status === "ALL" || item.status === status)} onSelect={openFamily}/></div><ResultTable results={decisionResults.filter(item => status === "ALL" || item.status === status)} title="Decision control table" note="Every decision remains tied to its metric, evidence and current status"/><div className="liveDecisionGrid">{decisionResults.filter(item => status === "ALL" || item.status === status).map(result => <DecisionCard key={`${result.projectId}-${result.componentId}`} result={result}/>)}</div></div>}
    {view === "evidence" && <div className="liveEvidencePage"><SupportingApplicationCharts pairs={chartPairs} context={chartContext} title="Evidence charts tied to current sources"/><div className="liveFilters"><select value={family} onChange={event => setFamily(event.target.value)}><option value="ALL">All families</option>{families.map(item => <option key={item}>{item}</option>)}</select><select value={kind} onChange={event => setKind(event.target.value as InsightKind | "ALL")}><option value="ALL">All component types</option>{["kpi", "chart", "table", "scenario", "assurance"].map(item => <option key={item}>{item}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value as InsightStatus | "ALL")}><option value="ALL">All statuses</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><span>{shown.length} of {results.length} components · full datasets; pagination never limits analysis</span></div><div className="liveDashboardGrid"><EvidenceConfidenceChart results={shown}/><FamilyChart results={shown} onSelect={openFamily}/></div><ResultTable results={shown} title="Source and evidence audit table" note="Current source, confidence, period and management interpretation"/><div className="liveResults">{shown.length ? shown.map(result => <InsightCard key={`${result.projectId}-${result.componentId}`} result={result}/>) : <div className="liveEmpty"><b>No assessable business components in this scope.</b><span>Raw source tables, embedded workbook visuals, media and report previews remain evidence-only.</span></div>}</div></div>}
  </div></section>;
}
