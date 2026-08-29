"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { portfolioBase, scoped } from "@/lib/normalized";
import type { NormalizedData, ProjectRegistryItem } from "@/lib/types";
import {
  DEFAULT_INTELLIGENCE_POLICY,
  attachMlMapping,
  buildPortfolioDescriptors,
  buildProjectDescriptors,
  buildWholeProjectDescriptors,
  evaluateDescriptor,
  sortIntelligenceResults,
  validateIntelligencePolicy,
  type DashboardIntelligenceContext,
  type InsightKind,
  type InsightStatus,
  type IntelligencePolicy,
  type IntelligenceResult,
  type PortfolioIntelligenceContext,
} from "@/lib/liveIntelligence";

type Scope = "current" | "project" | "portfolio";
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

function usePortfolioContext(): PortfolioIntelligenceContext | null {
  const [context, setContext] = useState<PortfolioIntelligenceContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/generated/projects.json").then(r => r.ok ? r.json() : []).then(async (projects: ProjectRegistryItem[]) => {
      const normalized = await Promise.all(projects.map(async project => {
        if (!project.normalized_path) return [project.project_id, null] as const;
        try { const r = await fetch(project.normalized_path); return [project.project_id, r.ok ? await r.json() as NormalizedData : null] as const; } catch { return [project.project_id, null] as const; }
      }));
      if (cancelled) return;
      const map = Object.fromEntries(normalized);
      const active = projects.map(registry => scoped(portfolioBase({ registry, normalized: map[registry.project_id] }), "dashboard"));
      setContext({ kind: "portfolio", view: "charts", scope: "dashboard", projects, active });
    }).catch(() => { if (!cancelled) setContext(null); });
    return () => { cancelled = true; };
  }, []);
  return context;
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
  return <details className={`liveInsightCard ${result.status}`} open={result.status === "critical"}><summary><div><span className="liveStatus">{STATUS_LABEL[result.status]}</span><h3>{result.componentName}</h3><p>{result.indication}</p></div><span className="liveConfidence">{Math.round(result.confidence * 100)}% evidence</span></summary><div className="liveInsightBody"><div className="liveMetricStrip">{Object.entries(result.metrics).slice(0, 10).map(([key, value]) => <div key={key}><span>{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</span><b>{metricValue(value)}</b></div>)}</div><div className="liveNarrativeGrid"><section><span>What it measures</span><p>{result.meaning}</p></section><section><span>Why</span><p>{result.reason}</p></section><section className="decision"><span>Management decision</span><p>{result.decision}</p></section>{result.risks.length > 0 && <section><span>Risk</span><ul>{result.risks.map(item => <li key={item}>{item}</li>)}</ul></section>}{result.benefits.length > 0 && <section><span>Benefit</span><ul>{result.benefits.map(item => <li key={item}>{item}</li>)}</ul></section>}{result.mitigation.length > 0 && <section><span>Mitigation</span><ul>{result.mitigation.map(item => <li key={item}>{item}</li>)}</ul></section>}{result.keepOnTrack.length > 0 && <section><span>Keep on track</span><ul>{result.keepOnTrack.map(item => <li key={item}>{item}</li>)}</ul></section>}</div><div className="liveEvidence"><span><b>Rule:</b> {result.ruleApplied}</span><span><b>Basis:</b> {result.assessmentBasis}</span><span><b>Project / period:</b> {result.projectName} · {result.period}</span><span><b>Revision:</b> {result.revision ? `${result.revision.slice(0, 20)}…` : "—"}</span>{result.sourceEvidence.slice(0, 4).map(item => <span key={item}><b>Evidence:</b> {item}</span>)}</div></div></details>;
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
  return <article className="liveDashboardChart liveConfidenceChart"><header><div><span>Evidence confidence chart</span><h3>How strongly each conclusion is supported</h3></div><small>Confidence is extraction and assessment evidence, not probability</small></header><div className="liveConfidenceBars">{rows.length ? rows.map(result => <div key={`${result.projectId}-${result.componentId}`}><span>{result.componentName}</span><div><i className={result.status} style={{ width: `${Math.max(2, result.confidence * 100)}%` }}/></div><b>{Math.round(result.confidence * 100)}%</b></div>) : <p>No controlled evidence is available for this scope.</p>}</div><footer><b>How to read it</b><p>Low confidence prevents a strong conclusion. It does not convert missing evidence into a favorable result.</p></footer></article>;
}

function ResultTable({ results, title, note, limit = 14 }: { results: IntelligenceResult[]; title: string; note: string; limit?: number }) {
  const rows = results.slice(0, limit);
  return <article className="liveDashboardTable"><header><div><span>Controlled data table</span><h3>{title}</h3></div><small>{note}</small></header><div className="liveTableWrap"><table><thead><tr><th>Component</th><th>Project / period</th><th>Status</th><th>Current metric</th><th>Evidence</th><th>Management reading</th></tr></thead><tbody>{rows.length ? rows.map(result => {
    const metric = Object.entries(result.metrics).find((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]));
    return <tr key={`${result.projectId}-${result.componentId}`}><td><b>{result.componentName}</b><small>{result.family} · {result.kind}</small></td><td><b>{result.projectName}</b><small>{result.period}</small></td><td><span className={`liveTableStatus ${result.status}`}>{STATUS_LABEL[result.status]}</span></td><td>{metric ? <><b>{metricValue(metric[1])}</b><small>{metric[0].replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</small></> : <span>—</span>}</td><td><b>{Math.round(result.confidence * 100)}%</b><small>{result.sourceEvidence[0] || "No source reference"}</small></td><td><p>{result.indication}</p><small>{result.decision}</small></td></tr>;
  }) : <tr><td colSpan={6}><div className="liveTableEmpty">No controlled rows are available for this selection.</div></td></tr>}</tbody></table></div><footer>Showing {rows.length} of {results.length} controlled components. Values are read from the active project, period, revision and scope.</footer></article>;
}

function ExplainedMetricChart({ result }: { result: IntelligenceResult }) {
  const values = Object.entries(result.metrics).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])).slice(0, 8);
  const max = Math.max(1, ...values.map(([, value]) => Math.abs(value)));
  return <article className={`liveExplainedChart ${result.status}`}><header><div><span>{STATUS_LABEL[result.status]} · {result.family}</span><h3>{result.componentName}</h3><p>{result.projectName} · {result.period}</p></div><b>{Math.round(result.confidence * 100)}% evidence</b></header>{values.length ? <div className="liveMetricChart">{values.map(([key, value]) => <div key={key}><span>{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</span><div><i className={value < 0 ? "negative" : ""} style={{ width: `${Math.max(3, Math.abs(value) / max * 100)}%` }}/></div><b>{metricValue(value)}</b></div>)}</div> : <div className="liveChartUnavailable">No comparable numeric series is available for this component.</div>}<div className="liveChartExplanation"><section><span>What this chart measures</span><p>{result.meaning}</p></section><section><span>Current reading</span><p>{result.indication}</p></section><section><span>Why it matters</span><p>{result.reason}</p></section><section className="decision"><span>Recommended decision</span><p>{result.decision}</p></section></div></article>;
}

function DecisionCard({ result }: { result: IntelligenceResult }) {
  const actions = result.status === "favorable" ? result.keepOnTrack : result.mitigation;
  return <article className={`liveDecisionCard ${result.status}`}><header><div><span>{STATUS_LABEL[result.status]} · {result.family}</span><h3>{result.componentName}</h3><p>{result.projectName} · {result.period}</p></div><b>{Math.round(result.confidence * 100)}%</b></header><section><span>What the data indicates</span><p>{result.indication}</p></section><section><span>Why</span><p>{result.reason}</p></section><section className="decision"><span>Management decision</span><p>{result.decision}</p></section><section><span>{result.status === "favorable" ? "Keep on track" : "Mitigation and actions"}</span>{actions.length ? <ol>{actions.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, "0")}</b><p>{item}</p></li>)}</ol> : <p>No action is asserted until the missing evidence is resolved.</p>}</section></article>;
}

function openingLiveView(context: DashboardIntelligenceContext | null): LiveView {
  if (context?.kind === "portfolio") {
    if (context.view === "analysis") return "overview";
    if (context.view === "risk") return "decisions";
  }
  return "charts";
}

export default function LiveProjectIntelligence({ context, onBack }: { context: DashboardIntelligenceContext | null; onBack: () => void }) {
  const [scope, setScope] = useState<Scope>("current"), [view, setView] = useState<LiveView>(() => openingLiveView(context)), [family, setFamily] = useState("ALL"), [kind, setKind] = useState<InsightKind | "ALL">("ALL"), [status, setStatus] = useState<InsightStatus | "ALL">("ALL"), [settings, setSettings] = useState(false);
  const portfolio = usePortfolioContext(), storageKey = policyStorageKey(context), [policy, setPolicy] = useState<IntelligencePolicy>(DEFAULT_INTELLIGENCE_POLICY);
  useEffect(() => setPolicy(loadPolicy(storageKey)), [storageKey]);
  useEffect(() => setView(openingLiveView(context)), [context?.kind, context?.view]);
  useEffect(() => { if (context?.kind === "portfolio" && scope === "project") setScope("current"); }, [context?.kind, scope]);
  const descriptors = useMemo(() => {
    if (!context) return [];
    if (scope === "current") return context.kind === "project" ? buildProjectDescriptors(context) : buildPortfolioDescriptors(context);
    if (scope === "project" && context.kind === "project") return buildWholeProjectDescriptors(context);
    const p = context.kind === "portfolio" ? context : portfolio;
    if (!p) return [];
    const charts = buildPortfolioDescriptors({ ...p, view: "charts" }), analysis = buildPortfolioDescriptors({ ...p, view: "analysis" });
    return [...charts, ...analysis].filter((item, index, all) => all.findIndex(other => other.componentId === item.componentId) === index);
  }, [context, scope, portfolio]);
  const ml = useMl(descriptors);
  const results = useMemo(() => sortIntelligenceResults(descriptors.map(item => {
    const result = evaluateDescriptor(item, policy), mapping = ml.mappings[item.componentId];
    return mapping ? attachMlMapping(result, mapping.family, mapping.score) : result;
  })), [descriptors, policy, ml.mappings]);
  const families = [...new Set(results.map(item => item.family))];
  const shown = results.filter(item => (family === "ALL" || item.family === family) && (kind === "ALL" || item.kind === kind) && (status === "ALL" || item.status === status));
  const counts = (Object.keys(STATUS_LABEL) as InsightStatus[]).map(key => ({ key, count: results.filter(item => item.status === key).length }));
  const priority = results.find(item => item.status === "critical") || results.find(item => item.status === "caution") || results.find(item => item.status === "unavailable") || results[0];
  const chartResults = results.filter(item => item.kind === "chart" || item.kind === "kpi");
  const decisionResults = results.filter(item => ["critical", "caution", "mixed", "unavailable", "favorable"].includes(item.status));
  const openStatus = (next: InsightStatus) => { setStatus(next); setFamily("ALL"); setKind("ALL"); setView("evidence"); };
  const openFamily = (next: string) => { setFamily(next); setStatus("ALL"); setKind("ALL"); setView("evidence"); };
  if (settings) return <PolicySettings policy={policy} onChange={setPolicy} storageKey={storageKey} onClose={() => setSettings(false)}/>;
  return <section className="liveIntelligence"><header className="liveIntelligenceHead"><div><span className="ollaEyebrow">Eng. OLLA · Live Project Intelligence</span><h1>Decision Intelligence</h1><p>The current controlled data is converted into charts, tables, explanations, decisions and evidence without inventing values.</p></div><div className="liveHeadActions"><button type="button" onClick={() => setSettings(true)}>Threshold Settings</button><button type="button" onClick={onBack}>← Mastery Home</button></div></header><div className="liveScope"><button className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}>Current page</button>{context?.kind === "project" && <button className={scope === "project" ? "active" : ""} onClick={() => setScope("project")}>Whole project</button>}<button className={scope === "portfolio" ? "active" : ""} onClick={() => setScope("portfolio")}>Portfolio</button></div><nav className="liveViewTabs" aria-label="Decision intelligence pages">{([{ id: "charts", label: "Charts & Explanations", note: "Main app Charts · second-layer reading" }, { id: "overview", label: "Analysis & Tables", note: "Main app CTO Analysis · interpreted" }, { id: "decisions", label: "Risk & Decisions", note: "Main app Risk · actions and mitigation" }, { id: "evidence", label: "Evidence & Sources", note: "Rules, sources and revisions" }] as { id: LiveView; label: string; note: string }[]).map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><b>{item.label}</b><span>{item.note}</span></button>)}</nav><div className="liveViewViewport" key={view}>
    {view === "overview" && <div className="liveOverview"><div className="liveSummary">{counts.map(item => <button key={item.key} className={item.key} onClick={() => openStatus(item.key)}><span>{STATUS_LABEL[item.key]}</span><b>{item.count}</b></button>)}</div>{priority ? <section className={`livePriority ${priority.status}`}><div><span>Highest current management signal</span><h2>{priority.componentName}</h2><p>{priority.indication}</p></div><div><span>Recommended decision</span><b>{priority.decision}</b><button onClick={() => { setStatus(priority.status); setView("decisions"); }}>Open decision and actions →</button></div></section> : <div className="liveEmpty"><b>No controlled components are available.</b><span>Open a populated project or portfolio page before activating the Trick layer.</span></div>}<div className="liveDashboardGrid"><StatusChart results={results} onSelect={openStatus}/><FamilyChart results={results} onSelect={openFamily}/></div><ResultTable results={results} title="Executive control register" note="The chart signals and their exact current-data rows"/></div>}
    {view === "charts" && <div className="liveChartsPage"><header><div><span className="ollaEyebrow">Current data · visual reading</span><h2>Charts with their management explanation</h2><p>Every bar uses a current registered metric. Its explanation, status and decision come from the same controlled component.</p></div><select value={family} onChange={event => setFamily(event.target.value)}><option value="ALL">All business families</option>{families.map(item => <option key={item}>{item}</option>)}</select></header><div className="liveChartGallery">{chartResults.filter(item => family === "ALL" || item.family === family).length ? chartResults.filter(item => family === "ALL" || item.family === family).map(result => <ExplainedMetricChart key={`${result.projectId}-${result.componentId}`} result={result}/>) : <div className="liveEmpty"><b>No chart metrics are available for this selection.</b><span>The application will not draw or explain a chart without controlled numeric evidence.</span></div>}</div><ResultTable results={chartResults.filter(item => family === "ALL" || item.family === family)} title="Chart metric register" note="Exact values behind every chart displayed above"/></div>}
    {view === "decisions" && <div className="liveDecisionsPage"><header><div><span className="ollaEyebrow">Management action register</span><h2>Decision, mitigation and keep-on-track actions</h2><p>Critical and caution items appear first. Favorable controls remain visible with the actions required to preserve them.</p></div><select value={status} onChange={event => setStatus(event.target.value as InsightStatus | "ALL")}><option value="ALL">All decision statuses</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></header><div className="liveDashboardGrid"><StatusChart results={decisionResults.filter(item => status === "ALL" || item.status === status)} onSelect={openStatus}/><FamilyChart results={decisionResults.filter(item => status === "ALL" || item.status === status)} onSelect={openFamily}/></div><ResultTable results={decisionResults.filter(item => status === "ALL" || item.status === status)} title="Decision control table" note="Every decision remains tied to its metric, evidence and current status"/><div className="liveDecisionGrid">{decisionResults.filter(item => status === "ALL" || item.status === status).map(result => <DecisionCard key={`${result.projectId}-${result.componentId}`} result={result}/>)}</div></div>}
    {view === "evidence" && <div className="liveEvidencePage"><div className="liveFilters"><select value={family} onChange={event => setFamily(event.target.value)}><option value="ALL">All families</option>{families.map(item => <option key={item}>{item}</option>)}</select><select value={kind} onChange={event => setKind(event.target.value as InsightKind | "ALL")}><option value="ALL">All component types</option>{["kpi", "chart", "table", "scenario", "assurance"].map(item => <option key={item}>{item}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value as InsightStatus | "ALL")}><option value="ALL">All statuses</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><span>{shown.length} of {results.length} components · full datasets; pagination never limits analysis</span></div><div className="liveDashboardGrid"><EvidenceConfidenceChart results={shown}/><FamilyChart results={shown} onSelect={openFamily}/></div><ResultTable results={shown} title="Source and evidence audit table" note="Current source, confidence, period and management interpretation"/><div className="liveResults">{shown.length ? shown.map(result => <InsightCard key={`${result.projectId}-${result.componentId}`} result={result}/>) : <div className="liveEmpty"><b>No assessable business components in this scope.</b><span>Raw source tables, embedded workbook visuals, media and report previews remain evidence-only.</span></div>}</div></div>}
  </div></section>;
}
