"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { DEFAULT_INTELLIGENCE_POLICY, type PortfolioIntelligenceContext } from "@/lib/liveIntelligence";
import {
  DEFAULT_RISK_SETTINGS_ANSWERS,
  PORTFOLIO_RISK_SETTINGS_KEY,
  buildPortfolioRiskClusters,
  buildPortfolioRiskReport,
  parseSavedRiskSettings,
  riskPolicyFromAnswers,
  type PortfolioRiskAssessment,
  type PortfolioRiskCluster,
  type RiskSettingsAnswers,
  type SavedRiskSettings,
} from "@/lib/portfolioRisk";

type RiskView = "overview" | "settings";
type RiskFilter = "ALL" | "critical" | "caution" | "unavailable";

const QUESTIONS: { key: keyof RiskSettingsAnswers; short: string; question: string; explanation: string; effect: string; unit: string; step: number; min: number; max: number }[] = [
  { key: "cpiCritical", short: "Cost efficiency", question: "At what CPI should cost performance become critical?", explanation: "CPI below this value means cost is being consumed faster than value is earned.", effect: "A higher threshold escalates cost-efficiency concerns earlier.", unit: "CPI", step: .01, min: .01, max: 1 },
  { key: "adverseVarianceCriticalPct", short: "Adverse variance", question: "What unfavorable cost or forecast variance requires escalation?", explanation: "Tests the adverse percentage against earned value, budget, or remaining forecast capacity.", effect: "A smaller percentage makes the app more sensitive to adverse variance.", unit: "%", step: .5, min: 0, max: 100 },
  { key: "minimumMarginPct", short: "Margin floor", question: "What is the minimum acceptable project profit margin?", explanation: "A reported or scenario margin below this floor becomes management pressure.", effect: "A higher floor requires a stronger commercial buffer.", unit: "%", step: .5, min: -100, max: 100 },
  { key: "cashDeficitCriticalPct", short: "Cash deficit", question: "At what cumulative cash deficit is immediate recovery required?", explanation: "The deficit is normalized against reported cumulative cash in.", effect: "A lower percentage escalates funding pressure earlier.", unit: "%", step: .5, min: 5, max: 100 },
  { key: "concentrationCriticalPct", short: "Concentration", question: "What share controlled by one cost driver is excessive?", explanation: "Tests reliance on one positive-cost resource, vendor, or cost code.", effect: "A lower percentage flags concentration risk earlier.", unit: "%", step: 1, min: 25, max: 100 },
  { key: "reconciliationCriticalPct", short: "Reconciliation", question: "What unexplained accounting-versus-reported-cost gap is critical?", explanation: "Keeps both accounting scopes separate and measures their unexplained difference.", effect: "A lower percentage requires tighter reconciliation.", unit: "%", step: .25, min: 1, max: 100 },
];

const STATUS_LABEL = { critical: "Critical", caution: "Watch", unavailable: "Evidence gap" } as const;

function labelize(value: string) {
  return value.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()).trim();
}

function RiskGlyph({ severity }: { severity: PortfolioRiskAssessment["severity"] }) {
  return <span className={`riskGlyph ${severity}`} aria-hidden="true">{severity === "critical" ? "!" : severity === "caution" ? "↗" : "?"}</span>;
}

function RiskDetail({ cluster, onOpen }: { cluster: PortfolioRiskCluster; onOpen: (id: string) => void }) {
  const total = Math.max(1, cluster.assessmentCount);
  const drivers = cluster.assessments.filter(item => item.severity === cluster.severity);
  return <article className={`riskDecisionBrief ${cluster.severity}`} aria-live="polite">
    <header className="riskDecisionHead">
      <div className="riskDecisionIdentity"><RiskGlyph severity={cluster.severity}/><div><span className="riskDecisionKicker">Overall portfolio · {STATUS_LABEL[cluster.severity]}</span><h3>{labelize(cluster.family)} Exposure</h3><p>{cluster.assessmentCount} source-backed control{cluster.assessmentCount === 1 ? "" : "s"} · {cluster.affectedProjects.length} contributing project{cluster.affectedProjects.length === 1 ? "" : "s"}</p></div></div>
      <div className="riskEvidenceScore"><b>{Math.round(cluster.confidenceFloor * 100)}%</b><span>minimum evidence confidence</span></div>
    </header>
    <section className="riskClusterDistribution">
      <header><span>Overall signal distribution</span><small>Counts are controls, not invented probability</small></header>
      <div className="riskStack"><i className="critical" style={{ width: `${cluster.criticalCount / total * 100}%` }}/><i className="caution" style={{ width: `${cluster.cautionCount / total * 100}%` }}/><i className="unavailable" style={{ width: `${cluster.unavailableCount / total * 100}%` }}/></div>
      <footer><span><i className="critical"/>{cluster.criticalCount} critical</span><span><i className="caution"/>{cluster.cautionCount} watch</span><span><i className="unavailable"/>{cluster.unavailableCount} evidence gap</span></footer>
    </section>
    <section className="riskExecutiveCall"><span>Why this is {cluster.severity === "critical" ? "critical" : cluster.severity === "caution" ? "on watch" : "unable to assess"}</span><h4>{cluster.severity === "critical" ? `${cluster.criticalCount} ${labelize(cluster.family).toLowerCase()} control${cluster.criticalCount === 1 ? "" : "s"} breached the active management threshold.` : cluster.severity === "caution" ? `${cluster.cautionCount} control${cluster.cautionCount === 1 ? "" : "s"} show emerging pressure below the critical boundary.` : "The required portfolio evidence is incomplete, so a safe conclusion cannot be produced."}</h4></section>
    <div className="riskContributorTags"><span>Evidence contributors</span><div>{cluster.affectedProjects.map((name, index) => <button key={name} type="button" onClick={() => cluster.affectedProjectIds[index] && onOpen(cluster.affectedProjectIds[index])}>{name}<i>↗</i></button>)}</div></div>
    <section className="riskDriverTable">
      <header><span>Critical evidence and explanation</span><small>{drivers.length} highest-severity source signal{drivers.length === 1 ? "" : "s"}</small></header>
      <div className="tablewrap"><table><thead><tr><th>Contributor</th><th>Period</th><th>What the data indicates</th><th>Why it matters</th><th>Rule</th></tr></thead><tbody>{drivers.map(item => <tr key={item.id}><td className="pname">{item.scope === "portfolio" ? "Selected portfolio" : item.affectedProjects.join(", ")}</td><td>{item.period}</td><td>{item.reason}</td><td>{item.consequence}</td><td>{item.rule}</td></tr>)}</tbody></table></div>
    </section>
    <section className="riskDecisionPortfolio"><header><span>Recommended portfolio decisions</span><small>Advisory actions from the active source-backed rules</small></header><div>{cluster.decisions.length ? cluster.decisions.map((decision, index) => <article key={decision}><b>{String(index + 1).padStart(2, "0")}</b><p>{decision}</p></article>) : <p>No management decision is asserted until the evidence gap is resolved.</p>}</div></section>
    <section className="riskActionPlan"><header><span>Mitigation and action plan</span><small>{cluster.mitigations.length} portfolio action{cluster.mitigations.length === 1 ? "" : "s"}</small></header>{cluster.mitigations.length ? <ol>{cluster.mitigations.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></li>)}</ol> : <p>Resolve the missing source evidence, then allow the live engine to reassess this family.</p>}</section>
    <footer className="riskAuditStrip"><div><span>Overall scope</span><b>Selected portfolio</b></div><div><span>Periods represented</span><b>{cluster.periods.join(" · ") || "—"}</b></div><div><span>Control family</span><b>{labelize(cluster.family)}</b></div><div><span>Source assessments</span><b>{cluster.assessmentCount}</b></div></footer>
  </article>;
}

function RiskSettings({ saved, setSaved }: { saved: SavedRiskSettings | null; setSaved: (value: SavedRiskSettings) => void }) {
  const [editing, setEditing] = useState(!saved);
  const [draft, setDraft] = useState<RiskSettingsAnswers>(saved?.answers || DEFAULT_RISK_SETTINGS_ANSWERS);
  const [message, setMessage] = useState("");
  useEffect(() => { setEditing(!saved); setDraft(saved?.answers || DEFAULT_RISK_SETTINGS_ANSWERS); }, [saved?.savedAt]);
  const save = () => {
    const policy = riskPolicyFromAnswers(draft);
    if (!policy) { setMessage("Settings are incomplete or contradict the validated warning bands. The active policy was not changed."); return; }
    const value: SavedRiskSettings = { version: 1, savedAt: new Date().toISOString(), answers: { ...draft }, policy };
    localStorage.setItem(PORTFOLIO_RISK_SETTINGS_KEY, JSON.stringify(value)); setSaved(value); setEditing(false); setMessage("Management policy saved, applied and locked.");
  };
  const clearForReplacement = () => { setDraft(DEFAULT_RISK_SETTINGS_ANSWERS); setEditing(true); setMessage("Replacement draft opened with validated defaults. The saved policy remains active until Save Policy."); };
  const change = (key: keyof RiskSettingsAnswers, value: number) => setDraft(current => ({ ...current, [key]: value }));
  return <section className="riskPolicyStudio" aria-label="Portfolio risk settings">
    <header className="riskPolicyHero"><div><span className="riskEyebrow">Management control standard</span><h2>Risk Policy Studio</h2><p>Six decisions control escalation across every selected project. A draft never changes the live risk view until it is validated and saved.</p></div><div className={`riskPolicySeal ${saved ? "saved" : "default"}`}><span>{saved ? "Policy locked" : "Validated baseline"}</span><b>{saved ? "Management policy active" : "Using default risk policy"}</b><small>{saved ? `Saved ${new Date(saved.savedAt).toLocaleString()}` : "No browser override has been saved"}</small></div></header>
    {editing && saved && <div className="riskDraftNotice"><b>Replacement mode</b><span>The saved policy remains active. These draft answers affect nothing until Save Policy.</span></div>}
    <div className="riskPolicyProgress"><span>Policy definition</span><div>{QUESTIONS.map((question, index) => <i key={question.key} className={editing ? "editing" : "locked"}>{index + 1}</i>)}</div><b>{editing ? "Draft open" : "6 controls locked"}</b></div>
    <div className="riskQuestionGrid">{QUESTIONS.map((question, index) => <article key={question.key} className={!editing ? "locked" : ""}>
      <header><span>{String(index + 1).padStart(2, "0")}</span><div><b>{question.short}</b><small>{question.question}</small></div></header><p>{question.explanation}</p>
      <div className="riskThresholdControl"><input aria-label={`${question.short} slider`} type="range" disabled={!editing} value={draft[question.key]} min={question.min} max={question.max} step={question.step} onChange={event => change(question.key, Number(event.target.value))}/><label><input aria-label={question.question} type="number" disabled={!editing} value={draft[question.key]} min={question.min} max={question.max} step={question.step} onChange={event => change(question.key, Number(event.target.value))}/><b>{question.unit}</b></label></div>
      <footer><span>Validated default <b>{DEFAULT_RISK_SETTINGS_ANSWERS[question.key]} {question.unit}</b></span><em>{question.effect}</em></footer>
    </article>)}</div>
    <div className="riskSettingsDock"><div><b>{editing ? "Review all six answers before saving" : "Direct editing is protected"}</b><span>{editing ? "Only a complete valid policy can replace the active settings." : "Clear for Replacement opens a new draft without changing the active policy."}</span></div><div>{saved && !editing && <button type="button" onClick={clearForReplacement}>Clear for Replacement</button>}{editing && <button type="button" className="primary" onClick={save}>Save Policy <span>→</span></button>}</div></div>
    {message && <p className="riskSettingsMessage" role="status">{message}</p>}
  </section>;
}

export default function PortfolioRisk({ context, onOpen }: { context: PortfolioIntelligenceContext; onOpen: (id: string) => void }) {
  const [view, setView] = useState<RiskView>("overview"), [saved, setSaved] = useState<SavedRiskSettings | null>(null), [loaded, setLoaded] = useState(false);
  const [severity, setSeverity] = useState<RiskFilter>("ALL"), [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { setSaved(parseSavedRiskSettings(localStorage.getItem(PORTFOLIO_RISK_SETTINGS_KEY))); setLoaded(true); }, []);
  const policy = saved?.policy || DEFAULT_INTELLIGENCE_POLICY;
  const report = useMemo(() => buildPortfolioRiskReport(context, policy), [context, policy]);
  const clusters = useMemo(() => buildPortfolioRiskClusters(report), [report]);
  const shown = clusters.filter(item => severity === "ALL" || item.severity === severity);
  const selected = shown.find(item => item.id === selectedId) || shown[0] || null;
  const coverage = report.evaluatedCount ? Math.round(((report.evaluatedCount - report.unavailableCount) / report.evaluatedCount) * 100) : 0;
  const adverse = report.criticalCount + report.cautionCount;
  const priorityCluster = clusters.find(item => item.severity !== "unavailable") || clusters[0] || null;
  const mixTotal = Math.max(1, report.criticalCount + report.cautionCount + report.unavailableCount + report.favorableCount + report.informationalCount);
  const familyMax = Math.max(1, ...clusters.map(item => item.assessmentCount));
  const latestPeriod = [...new Set(context.active.map(item => String(item.period || item.registry?.reporting_period || "")))].filter(Boolean).sort().at(-1) || "No period";
  if (!loaded) return <section className="portfolioRiskPanel"><div className="riskEmpty">Loading current risk evidence…</div></section>;
  return <section className="portfolioRiskPanel" aria-label="Adaptive portfolio risk">
    <nav className="riskSubNav"><button type="button" className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span>01</span><b>Risk Command</b><small>Live exposure and decisions</small></button><button type="button" className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><span>02</span><b>Policy Settings</b><small>Management escalation rules</small></button></nav>
    {view === "settings" ? <RiskSettings saved={saved} setSaved={setSaved}/> : <>
      <header className="riskCommandHeader"><div className="riskCommandTitle"><span className="riskEyebrow">Live source-backed portfolio control</span><h2>Risk Command</h2><p>One management queue built from the current Charts and CTO Analysis data. Every finding retains its project, period, rule, source and revision.</p></div><div className="riskCommandMeta"><span><i className="riskLiveDot"/>Live assessment</span><b>{context.active.length} selected project{context.active.length === 1 ? "" : "s"}</b><small>{latestPeriod} · {context.scope === "dashboard" ? "Operational Scope" : "Full Project Scope"}</small></div></header>
      <section className="riskPostureDeck">
        <div className={`riskPosture ${report.criticalCount ? "critical" : report.cautionCount ? "caution" : "clear"}`}><div className="riskPulseRing" style={{ "--risk-coverage": `${coverage * 3.6}deg` } as CSSProperties}><div><b>{coverage}%</b><span>evidence<br/>coverage</span></div></div><div><span>Portfolio posture</span><h3>{report.criticalCount ? "Immediate attention" : report.cautionCount ? "Active watch" : "No adverse signal detected"}</h3><p>{adverse} adverse signal{adverse === 1 ? "" : "s"} across {report.evaluatedCount} evaluated controls.</p></div></div>
        <button type="button" className={`riskCountTile critical ${severity === "critical" ? "active" : ""}`} onClick={() => setSeverity(severity === "critical" ? "ALL" : "critical")}><span>Critical now</span><b>{report.criticalCount}</b><small>Requires a management decision</small></button>
        <button type="button" className={`riskCountTile caution ${severity === "caution" ? "active" : ""}`} onClick={() => setSeverity(severity === "caution" ? "ALL" : "caution")}><span>Watch list</span><b>{report.cautionCount}</b><small>Emerging pressure to monitor</small></button>
        <button type="button" className={`riskCountTile unavailable ${severity === "unavailable" ? "active" : ""}`} onClick={() => setSeverity(severity === "unavailable" ? "ALL" : "unavailable")}><span>Evidence gaps</span><b>{report.unavailableCount}</b><small>Cannot be safely assessed</small></button>
        <div className="riskCountTile favorable"><span>Controls on track</span><b>{report.favorableCount}</b><small>Compact favorable summary</small></div>
      </section>
      {priorityCluster ? <section className={`riskPriorityCall ${priorityCluster.severity}`}><div><span>Highest portfolio exposure</span><h3>{labelize(priorityCluster.family)} Exposure</h3><p>{priorityCluster.criticalCount ? `${priorityCluster.criticalCount} critical control${priorityCluster.criticalCount === 1 ? "" : "s"} breached the active policy.` : priorityCluster.cautionCount ? `${priorityCluster.cautionCount} control${priorityCluster.cautionCount === 1 ? "" : "s"} require active monitoring.` : "The portfolio evidence required for this control family is incomplete."}</p></div><div><span>Portfolio response</span><b>{priorityCluster.decisions[0] || "Resolve the evidence gap before asserting a management conclusion."}</b><button type="button" onClick={() => { setSeverity("ALL"); setSelectedId(priorityCluster.id); }}>Open overall decision brief <i>→</i></button></div></section> : <section className="riskPriorityCall clear"><div><span>Current evidence</span><h3>No adverse risk detected from available evidence</h3><p>This does not claim that no risk exists. Evidence gaps remain visible for resolution.</p></div></section>}

      <section className="riskVisualGrid" aria-label="Interactive portfolio risk charts">
        <article className="riskMixChart">
          <header><div><span>Smart chart 01</span><h3>Portfolio control distribution</h3></div><small>Click a status to filter every overall exposure below</small></header>
          <div className="riskMixBody">
            <div className="riskMixDonut" style={{ "--mix-critical": `${report.criticalCount / mixTotal * 360}deg`, "--mix-caution": `${(report.criticalCount + report.cautionCount) / mixTotal * 360}deg`, "--mix-gap": `${(report.criticalCount + report.cautionCount + report.unavailableCount) / mixTotal * 360}deg` } as CSSProperties}><div><b>{report.evaluatedCount}</b><span>controls<br/>evaluated</span></div></div>
            <div className="riskMixLegend"><button className="critical" onClick={() => setSeverity(severity === "critical" ? "ALL" : "critical")}><i/><span>Critical</span><b>{report.criticalCount}</b></button><button className="caution" onClick={() => setSeverity(severity === "caution" ? "ALL" : "caution")}><i/><span>Watch</span><b>{report.cautionCount}</b></button><button className="unavailable" onClick={() => setSeverity(severity === "unavailable" ? "ALL" : "unavailable")}><i/><span>Evidence gap</span><b>{report.unavailableCount}</b></button><div className="favorable"><i/><span>On track</span><b>{report.favorableCount}</b></div></div>
          </div>
          <footer><b>What it indicates</b><p>{report.criticalCount ? `${report.criticalCount} controls require immediate decisions; favorable controls do not cancel those breaches.` : report.cautionCount ? "No critical breach is detected, but emerging pressures require active monitoring." : "No adverse signal was detected from available evidence; unresolved evidence remains separate."}</p></footer>
        </article>
        <article className="riskFamilyChart">
          <header><div><span>Smart chart 02</span><h3>Exposure by control family</h3></div><small>Click a family to open its overall decision brief</small></header>
          <div>{clusters.map(cluster => <button type="button" key={cluster.id} className={`${cluster.severity} ${selected?.id === cluster.id ? "active" : ""}`} onClick={() => { setSeverity("ALL"); setSelectedId(cluster.id); }}><span>{labelize(cluster.family)}</span><div className="riskFamilyBar"><i className="critical" style={{ width: `${cluster.criticalCount / familyMax * 100}%` }}/><i className="caution" style={{ width: `${cluster.cautionCount / familyMax * 100}%` }}/><i className="unavailable" style={{ width: `${cluster.unavailableCount / familyMax * 100}%` }}/></div><b>{cluster.assessmentCount}</b><small>{STATUS_LABEL[cluster.severity]}</small></button>)}</div>
          <footer><b>How to read it</b><p>Each bar is the count of source-backed controls in that family. Red is critical, amber is watch, and slate is unavailable evidence—not probability.</p></footer>
        </article>
      </section>

      <div className="riskWorkspace">
        <aside className="riskQueue"><header><div><span>Overall portfolio exposures</span><b>{shown.length} control famil{shown.length === 1 ? "y" : "ies"}</b></div><button type="button" onClick={() => setSeverity("ALL")}>Show all</button></header><div className="riskFilterBar"><select aria-label="Filter overall exposure by severity" value={severity} onChange={event => setSeverity(event.target.value as RiskFilter)}><option value="ALL">All portfolio exposures</option><option value="critical">Critical overall exposures</option><option value="caution">Overall watch list</option><option value="unavailable">Overall evidence gaps</option></select></div>
          <div className="riskQueueList">{shown.length ? shown.map((cluster, index) => <button type="button" key={cluster.id} className={`${cluster.severity} ${selected?.id === cluster.id ? "active" : ""}`} onClick={() => setSelectedId(cluster.id)}><RiskGlyph severity={cluster.severity}/><div><span>{String(index + 1).padStart(2, "0")} · Overall portfolio · {STATUS_LABEL[cluster.severity]}</span><b>{labelize(cluster.family)} Exposure</b><small>{cluster.assessmentCount} control{cluster.assessmentCount === 1 ? "" : "s"} · {cluster.affectedProjects.length} evidence contributor{cluster.affectedProjects.length === 1 ? "" : "s"}</small></div><i>→</i></button>) : <div className="riskQueueEmpty"><b>No matching overall exposure</b><span>Show all portfolio statuses to continue.</span></div>}</div>
        </aside>
        <main className="riskDecisionStage">{selected ? <RiskDetail cluster={selected} onOpen={onOpen}/> : <div className="riskEmpty"><b>No adverse portfolio exposure detected from available evidence.</b><span>Evidence gaps remain separately visible when present.</span></div>}</main>
      </div>
      {report.scenario && <details className="riskScenario"><summary><div><span>Scenario exposure</span><b>What-if only — excluded from current risk totals</b></div><i>+</i></summary><div><span>{report.scenario.status}</span><h3>{report.scenario.indication}</h3><p>{report.scenario.reason}</p><b>Recommended scenario decision</b><p>{report.scenario.decision}</p></div></details>}
      <footer className="riskMethodNote"><span>Deterministic control</span><p>Severity and decisions come from the active policy and controlled JSON. Missing or conflicting evidence remains unavailable; no probability or monetary exposure is invented.</p><b>{saved ? "Saved management policy active" : "Using validated default risk policy"}</b></footer>
    </>}
  </section>;
}
