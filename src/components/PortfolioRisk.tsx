"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_INTELLIGENCE_POLICY, type PortfolioIntelligenceContext } from "@/lib/liveIntelligence";
import {
  DEFAULT_RISK_SETTINGS_ANSWERS,
  PORTFOLIO_RISK_SETTINGS_KEY,
  buildPortfolioRiskReport,
  parseSavedRiskSettings,
  riskPolicyFromAnswers,
  type PortfolioRiskAssessment,
  type RiskSettingsAnswers,
  type SavedRiskSettings,
} from "@/lib/portfolioRisk";

type RiskView = "overview" | "settings";
type RiskFilter = "ALL" | "critical" | "caution" | "unavailable";

const QUESTIONS: { key: keyof RiskSettingsAnswers; question: string; explanation: string; effect: string; unit: string; step: number; min: number; max: number }[] = [
  { key: "cpiCritical", question: "At what CPI should cost performance become critical?", explanation: "CPI below this value indicates that cost is being consumed faster than value is earned.", effect: "A higher threshold escalates cost-efficiency concerns earlier.", unit: "CPI", step: .01, min: .01, max: 1 },
  { key: "adverseVarianceCriticalPct", question: "What unfavorable cost or forecast variance requires escalation?", explanation: "This is the adverse percentage against earned value, budget, or remaining forecast capacity.", effect: "A smaller percentage makes the app more sensitive to adverse variance.", unit: "%", step: .5, min: 0, max: 100 },
  { key: "minimumMarginPct", question: "What is the minimum acceptable project profit margin?", explanation: "A reported or scenario margin below this floor is treated as management pressure.", effect: "A higher floor requires a stronger commercial buffer.", unit: "%", step: .5, min: -100, max: 100 },
  { key: "cashDeficitCriticalPct", question: "At what cumulative cash deficit is immediate recovery required?", explanation: "The deficit is normalized against reported cumulative cash in.", effect: "A lower percentage escalates funding pressure earlier.", unit: "%", step: .5, min: 5, max: 100 },
  { key: "concentrationCriticalPct", question: "What share controlled by one cost driver is excessive?", explanation: "This tests reliance on one positive-cost resource, vendor, or cost code.", effect: "A lower percentage flags concentration risk earlier.", unit: "%", step: 1, min: 25, max: 100 },
  { key: "reconciliationCriticalPct", question: "What unexplained accounting-versus-reported-cost gap is critical?", explanation: "The comparison keeps both accounting scopes separate and measures their unexplained difference.", effect: "A lower percentage requires tighter reconciliation.", unit: "%", step: .25, min: 1, max: 100 },
];

const STATUS_LABEL = { critical: "Critical", caution: "Caution", unavailable: "Unable to assess" } as const;

function metricValue(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function RiskCard({ risk, onOpen }: { risk: PortfolioRiskAssessment; onOpen: (id: string) => void }) {
  const projectId = risk.scope === "project" ? risk.affectedProjectIds[0] : null;
  return <article className={`portfolioRiskCard ${risk.severity}`}>
    <header><div><span className="portfolioRiskSeverity">{STATUS_LABEL[risk.severity]}</span><h3>{risk.title}</h3><p>{risk.scope === "portfolio" ? "Selected portfolio" : risk.affectedProjects.join(", ")} · {risk.period}</p></div><span className="portfolioRiskConfidence">{Math.round(risk.confidence * 100)}% evidence</span></header>
    <div className="portfolioRiskMetrics">{Object.entries(risk.metrics).slice(0, 8).map(([key, value]) => <div key={key}><span>{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</span><b>{metricValue(value)}</b></div>)}</div>
    <div className="portfolioRiskNarrative"><section><span>Why this is a risk</span><p>{risk.reason}</p></section><section><span>Potential consequence</span><p>{risk.consequence}</p></section><section className="decision"><span>Recommended management decision</span><p>{risk.decision}</p></section>{risk.mitigation.length > 0 && <section><span>Mitigation</span><ul>{risk.mitigation.map(item => <li key={item}>{item}</li>)}</ul></section>}</div>
    <footer><span><b>Rule:</b> {risk.rule}</span><span><b>Scope:</b> {risk.scope}</span><span><b>Revision:</b> {risk.revision ? `${risk.revision.slice(0, 18)}…` : "—"}</span>{risk.evidence.slice(0, 2).map(item => <span key={item}><b>Evidence:</b> {item}</span>)}{projectId && <button type="button" onClick={() => onOpen(projectId)}>Open project</button>}</footer>
  </article>;
}

function RiskSettings({ saved, setSaved }: { saved: SavedRiskSettings | null; setSaved: (value: SavedRiskSettings) => void }) {
  const [editing, setEditing] = useState(!saved), [draft, setDraft] = useState<RiskSettingsAnswers>(saved?.answers || DEFAULT_RISK_SETTINGS_ANSWERS), [message, setMessage] = useState("");
  useEffect(() => { setEditing(!saved); setDraft(saved?.answers || DEFAULT_RISK_SETTINGS_ANSWERS); }, [saved?.savedAt]);
  const save = () => {
    const policy = riskPolicyFromAnswers(draft);
    if (!policy) { setMessage("Settings are incomplete or contradict the validated warning bands. Nothing changed."); return; }
    const value: SavedRiskSettings = { version: 1, savedAt: new Date().toISOString(), answers: { ...draft }, policy };
    localStorage.setItem(PORTFOLIO_RISK_SETTINGS_KEY, JSON.stringify(value));
    setSaved(value); setEditing(false); setMessage("Risk settings saved and applied. The answers are now locked.");
  };
  const clearForReplacement = () => { setDraft(DEFAULT_RISK_SETTINGS_ANSWERS); setEditing(true); setMessage("Default answers are ready as a replacement draft. The old saved settings remain active until Save Settings."); };
  return <section className="portfolioRiskSettings" aria-label="Portfolio risk settings">
    <header><div><span className="riskEyebrow">Top management risk policy</span><h2>Risk Settings</h2><p>Answer these questions in plain English terms. Draft answers never affect risk results until a valid Save Settings action.</p></div><div className={`riskPolicyState ${saved ? "saved" : "default"}`}><b>{saved ? "Saved management policy" : "Using default risk policy"}</b><span>{saved ? `Saved ${new Date(saved.savedAt).toLocaleString()}` : "No management override has been saved."}</span></div></header>
    {editing && saved && <div className="riskDraftNotice"><b>Old settings are still active.</b><span>Complete the replacement questions and press Save Settings to change the risk policy.</span></div>}
    <div className="riskQuestionGrid">{QUESTIONS.map(question => <label key={question.key} className={!editing ? "locked" : ""}><span className="riskQuestion">{question.question}</span><small>{question.explanation}</small><div className="riskAnswer"><input type="number" disabled={!editing} value={draft[question.key]} min={question.min} max={question.max} step={question.step} onChange={event => setDraft(value => ({ ...value, [question.key]: Number(event.target.value) }))}/><b>{question.unit}</b></div><em>Default: {DEFAULT_RISK_SETTINGS_ANSWERS[question.key]} {question.unit}. {question.effect}</em></label>)}</div>
    <div className="riskSettingsActions">{saved && !editing && <button type="button" onClick={clearForReplacement}>Clear for Replacement</button>}{editing && <button type="button" className="primary" onClick={save}>Save Settings</button>}</div>
    {message && <p className="riskSettingsMessage">{message}</p>}
  </section>;
}

export default function PortfolioRisk({ context, onOpen }: { context: PortfolioIntelligenceContext; onOpen: (id: string) => void }) {
  const [view, setView] = useState<RiskView>("overview"), [saved, setSaved] = useState<SavedRiskSettings | null>(null), [loaded, setLoaded] = useState(false);
  const [severity, setSeverity] = useState<RiskFilter>("ALL"), [project, setProject] = useState("ALL"), [family, setFamily] = useState("ALL");
  useEffect(() => { setSaved(parseSavedRiskSettings(localStorage.getItem(PORTFOLIO_RISK_SETTINGS_KEY))); setLoaded(true); }, []);
  const policy = saved?.policy || DEFAULT_INTELLIGENCE_POLICY;
  const report = useMemo(() => buildPortfolioRiskReport(context, policy), [context, policy]);
  const families = [...new Set(report.risks.map(item => item.family))].sort();
  const shown = report.risks.filter(item => (severity === "ALL" || item.severity === severity) && (project === "ALL" || item.affectedProjectIds.includes(project)) && (family === "ALL" || item.family === family));
  if (!loaded) return <section className="portfolioRiskPanel"><div className="riskEmpty">Loading current risk evidence…</div></section>;
  return <section className="portfolioRiskPanel" aria-label="Adaptive portfolio risk">
    <nav className="riskSubNav"><button type="button" className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Risk Overview</button><button type="button" className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>Risk Settings</button></nav>
    {view === "settings" ? <RiskSettings saved={saved} setSaved={setSaved}/> : <>
      <header className="portfolioRiskHead"><div><span className="riskEyebrow">Adaptive source-backed control</span><h2>Portfolio Risk Control</h2><p>Current risks are recalculated from the selected projects, scope, reporting periods and controlled data behind Portfolio Charts and CTO Analysis.</p></div><div className={`riskPolicyState ${saved ? "saved" : "default"}`}><b>{saved ? "Saved management policy active" : "Using default risk policy"}</b><span>{saved ? new Date(saved.savedAt).toLocaleString() : "Open Risk Settings to review the questions."}</span></div></header>
      <div className="riskSummary"><button className="critical" onClick={() => setSeverity(severity === "critical" ? "ALL" : "critical")}><span>Critical</span><b>{report.criticalCount}</b></button><button className="caution" onClick={() => setSeverity(severity === "caution" ? "ALL" : "caution")}><span>Caution</span><b>{report.cautionCount}</b></button><button className="unavailable" onClick={() => setSeverity(severity === "unavailable" ? "ALL" : "unavailable")}><span>Unable to assess</span><b>{report.unavailableCount}</b></button><div><span>Favorable controls</span><b>{report.favorableCount}</b></div><div><span>Components evaluated</span><b>{report.evaluatedCount}</b></div></div>
      {report.highestPriority ? <div className={`highestRisk ${report.highestPriority.severity}`}><span>Highest-priority current risk</span><b>{report.highestPriority.title}</b><p>{report.highestPriority.reason}</p></div> : <div className="highestRisk clear"><span>Current evidence</span><b>No adverse risk detected from available evidence</b><p>This does not claim that no risk exists. Unavailable evidence remains listed for resolution.</p></div>}
      <div className="riskFilters"><select value={severity} onChange={event => setSeverity(event.target.value as RiskFilter)}><option value="ALL">All adverse statuses</option><option value="critical">Critical</option><option value="caution">Caution</option><option value="unavailable">Unable to assess</option></select><select value={project} onChange={event => setProject(event.target.value)}><option value="ALL">Portfolio and all selected projects</option>{context.active.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={family} onChange={event => setFamily(event.target.value)}><option value="ALL">All risk families</option>{families.map(item => <option key={item}>{item}</option>)}</select><span>{shown.length} of {report.risks.length} current risk records</span></div>
      <div className="portfolioRiskList">{shown.length ? shown.map(risk => <RiskCard key={risk.id} risk={risk} onOpen={onOpen}/>) : <div className="riskEmpty"><b>No records match the current filters.</b><span>Change the filters to review other adverse or unavailable evidence.</span></div>}</div>
      {report.scenario && <section className="riskScenario"><span>Scenario Exposure — What-if, not source risk</span><h3>{report.scenario.indication}</h3><p>{report.scenario.reason}</p><b>Recommended decision: {report.scenario.decision}</b></section>}
    </>}
  </section>;
}
