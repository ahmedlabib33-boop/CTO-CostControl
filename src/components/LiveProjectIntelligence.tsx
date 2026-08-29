"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export default function LiveProjectIntelligence({ context, onBack }: { context: DashboardIntelligenceContext | null; onBack: () => void }) {
  const [scope, setScope] = useState<Scope>("current"), [family, setFamily] = useState("ALL"), [kind, setKind] = useState<InsightKind | "ALL">("ALL"), [status, setStatus] = useState<InsightStatus | "ALL">("ALL"), [settings, setSettings] = useState(false);
  const portfolio = usePortfolioContext(), storageKey = policyStorageKey(context), [policy, setPolicy] = useState<IntelligencePolicy>(DEFAULT_INTELLIGENCE_POLICY);
  useEffect(() => setPolicy(loadPolicy(storageKey)), [storageKey]);
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
  if (settings) return <PolicySettings policy={policy} onChange={setPolicy} storageKey={storageKey} onClose={() => setSettings(false)}/>;
  return <section className="liveIntelligence"><header className="liveIntelligenceHead"><div><span className="ollaEyebrow">Eng. OLLA · Live Project Intelligence</span><h1>Decision Intelligence</h1><p>Controlled metrics and validated management thresholds determine every status, explanation, risk, and recommended action.</p></div><div className="liveHeadActions"><button type="button" onClick={() => setSettings(true)}>Threshold Settings</button><button type="button" onClick={onBack}>← Modules</button></div></header><div className="liveScope"><button className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}>Current page</button>{context?.kind === "project" && <button className={scope === "project" ? "active" : ""} onClick={() => setScope("project")}>Whole project</button>}<button className={scope === "portfolio" ? "active" : ""} onClick={() => setScope("portfolio")}>Portfolio</button></div><div className="liveSummary">{counts.map(item => <button key={item.key} className={item.key} onClick={() => setStatus(status === item.key ? "ALL" : item.key)}><span>{STATUS_LABEL[item.key]}</span><b>{item.count}</b></button>)}</div><div className="liveFilters"><select value={family} onChange={event => setFamily(event.target.value)}><option value="ALL">All families</option>{families.map(item => <option key={item}>{item}</option>)}</select><select value={kind} onChange={event => setKind(event.target.value as InsightKind | "ALL")}><option value="ALL">All component types</option>{["kpi", "chart", "table", "scenario", "assurance"].map(item => <option key={item}>{item}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value as InsightStatus | "ALL")}><option value="ALL">All statuses</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><span>{shown.length} of {results.length} components · full registered datasets; dashboard pagination never limits analysis</span></div><div className="liveResults">{shown.length ? shown.map(result => <InsightCard key={`${result.projectId}-${result.componentId}`} result={result}/>) : <div className="liveEmpty"><b>No assessable business components in this scope.</b><span>Raw source tables, embedded workbook visuals, media, and report previews remain evidence-only and are intentionally not judged.</span></div>}</div></section>;
}
