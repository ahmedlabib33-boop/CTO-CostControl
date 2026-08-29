"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IdentityConflict, ProjectRegistryItem } from "@/lib/types";
import ProjectWorkspace from "@/components/ProjectWorkspace";
import { DEFAULT_PROJECT_VIEW, normalizeProjectView, type ProjectView } from "@/lib/projectViews";
import { IdentityConflictAlerts, MonthlyHistory, PortfolioCommandCenter, PortfolioQuality, ProjectCards, usePortfolioModels } from "@/components/PortfolioWorkspace";
import { PortfolioDataMapping } from "@/components/DataMapping";
import { money } from "@/lib/normalized";
import OutputStudio from "@/components/OutputStudio";
import EngOllaMastery from "@/components/EngOllaMastery";
import OlaRiseLayer, { advanceOlaRiseKnock, initialOlaRiseKnockState, OLA_RISE_KEY_SEQUENCE, type OlaRiseKnockState } from "@/components/OlaRiseLayer";
import DeploymentIndicator from "@/components/DeploymentIndicator";
import RepoLastModified from "@/components/RepoLastModified";
import { INTELLIGENCE_CONTEXT_EVENT, publishIntelligenceContext, type DashboardIntelligenceContext } from "@/lib/liveIntelligence";

type Tab="portfolio"|"projects"|"intelligence"|"output";
const NAV:{id:Tab;label:string}[]=[{id:"portfolio",label:"Portfolio Command Center"},{id:"projects",label:"Projects"},{id:"intelligence",label:"Monthly Intelligence & Data Quality"},{id:"output",label:"Output Studio"}];

function SourceRegistry({projects,onOpen}:{projects:ProjectRegistryItem[];onOpen:(id:string)=>void}){return <div className="card"><h3>Source Registry</h3><p className="sub">Every project source is isolated by permanent project ID, reporting period and source SHA-256.</p><div className="tablewrap"><table><thead><tr><th>Project</th><th>Period</th><th>Fingerprint</th><th>Sheets</th><th>Excel Charts</th><th>Capabilities</th><th>Current AC</th></tr></thead><tbody>{projects.map(p=><tr key={p.project_id} className="clickable-row" onClick={()=>onOpen(p.project_id)}><td className="pname">{p.project_name}</td><td>{p.reporting_period}</td><td className="mono">{p.source_fingerprint}</td><td>{p.sheet_count}</td><td>{p.chart_count}</td><td>{Object.entries(p.capabilities||{}).filter(([,v])=>v).map(([k])=>k.replaceAll("_"," ")).join(" · ")}</td><td>{money(p.metrics?.actual_cost)}</td></tr>)}</tbody></table></div></div>}

function OlaOverlay(){
 const [show,setShow]=useState<"mastery"|"rise"|null>(null);
 const [context,setContext]=useState<DashboardIntelligenceContext|null>(null);
 const masterySeq=useRef(0),riseSeq=useRef(0),masteryTaps=useRef<number[]>([]),riseKnock=useRef<OlaRiseKnockState>(initialOlaRiseKnockState()),showing=useRef(false);
 useEffect(()=>{
  const reveal=(layer:"mastery"|"rise")=>{if(showing.current)return;showing.current=true;setShow(layer);document.documentElement.classList.add("trick-open")};
  const key=(e:KeyboardEvent)=>{
   if(showing.current||e.repeat)return;
   const mastery="12345";
   const masteryExpected=mastery[masterySeq.current];
   masterySeq.current=e.key===masteryExpected?masterySeq.current+1:e.key===mastery[0]?1:0;
   if(masterySeq.current===mastery.length){masterySeq.current=0;riseSeq.current=0;reveal("mastery");return}
   const riseExpected=OLA_RISE_KEY_SEQUENCE[riseSeq.current];
   riseSeq.current=e.key===riseExpected?riseSeq.current+1:e.key===OLA_RISE_KEY_SEQUENCE[0]?1:0;
   if(riseSeq.current===OLA_RISE_KEY_SEQUENCE.length){riseSeq.current=0;masterySeq.current=0;reveal("rise")}
  };
  const touch=(e:PointerEvent)=>{
   if(e.pointerType!=="touch"||showing.current)return;
   const now=Date.now();
   const riseProgress=advanceOlaRiseKnock(riseKnock.current,now);
   riseKnock.current=riseProgress.state;
   if(riseProgress.complete){masteryTaps.current=[];reveal("rise");return}
   masteryTaps.current=[...masteryTaps.current.filter(t=>now-t<850),now];
   if(masteryTaps.current.length>=3){masteryTaps.current=[];riseKnock.current=initialOlaRiseKnockState();reveal("mastery")}
  };
  const intelligence=(event:Event)=>setContext((event as CustomEvent<DashboardIntelligenceContext>).detail);
  window.addEventListener("keydown",key);window.addEventListener("pointerup",touch,{passive:true});window.addEventListener(INTELLIGENCE_CONTEXT_EVENT,intelligence);
  return()=>{window.removeEventListener("keydown",key);window.removeEventListener("pointerup",touch);window.removeEventListener(INTELLIGENCE_CONTEXT_EVENT,intelligence);document.documentElement.classList.remove("trick-open")}
 },[]);
 const dismiss=()=>{setShow(null);showing.current=false;masterySeq.current=0;riseSeq.current=0;masteryTaps.current=[];riseKnock.current=initialOlaRiseKnockState();document.documentElement.classList.remove("trick-open")};
 if(!show)return null;
 return show==="rise"?<OlaRiseLayer onExit={dismiss}/>:<EngOllaMastery onExit={dismiss} intelligenceContext={context}/>;
}

export default function Dashboard({initialProjectId,initialProjectView=DEFAULT_PROJECT_VIEW}:{initialProjectId?:string;initialProjectView?:ProjectView}){
 const [projects,setProjects]=useState<ProjectRegistryItem[]>([]),[conflicts,setConflicts]=useState<IdentityConflict[]>([]),[,setPortfolio]=useState<any>(null),[tab,setTab]=useState<Tab>("portfolio"),[qualityView,setQualityView]=useState<"overview"|"mapping">("overview"),[projectId,setProjectId]=useState(initialProjectId||""),[projectView,setProjectView]=useState<ProjectView>(initialProjectView),[clock,setClock]=useState("");
 const portfolioModels=usePortfolioModels(projects);
 useEffect(()=>{Promise.all([fetch("/generated/projects.json").then(r=>r.json()),fetch("/generated/portfolio/latest.json").then(r=>r.json()),fetch("/generated/identity-conflicts.json").then(r=>r.ok?r.json():[]).catch(()=>[])]).then(([p,po,c])=>{setProjects(p);setPortfolio(po);setConflicts(Array.isArray(c)?c:[])}).catch(()=>{})},[]);
 useEffect(()=>{const t=()=>setClock(new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date()));t();const id=setInterval(t,30000);return()=>clearInterval(id)},[]);
 useEffect(()=>{const pop=()=>{const m=location.pathname.match(/^\/project\/([^/]+)(?:\/([^/]+))?/);setProjectId(m?decodeURIComponent(m[1]):"");setProjectView(normalizeProjectView(m?.[2]))};window.addEventListener("popstate",pop);return()=>window.removeEventListener("popstate",pop)},[]);
 useEffect(()=>{if(!projectId&&tab!=="portfolio")publishIntelligenceContext({kind:"portfolio",view:tab,scope:"dashboard",projects,active:[],conflicts})},[projectId,tab,projects,conflicts]);
 const open=(id:string)=>{setProjectId(id);setProjectView(DEFAULT_PROJECT_VIEW);history.pushState({},"",`/project/${encodeURIComponent(id)}/${DEFAULT_PROJECT_VIEW}`);window.scrollTo({top:0,behavior:"smooth"})};
 const navigateProject=(view:ProjectView)=>{setProjectView(view);history.pushState({},"",`/project/${encodeURIComponent(projectId)}/${view}`);window.scrollTo({top:0,behavior:"smooth"})};
 const back=()=>{setProjectId("");history.pushState({},"","/");setTab("portfolio");window.scrollTo({top:0,behavior:"smooth"})};
 if(projectId)return <main className="shell"><DeploymentIndicator/><OlaOverlay/><ProjectWorkspace projectId={projectId} view={projectView} onNavigate={navigateProject} onBack={back}/></main>;
 return <main className="shell"><DeploymentIndicator/><OlaOverlay/><header className="top"><div className="brandrow"><div><div className="title">CTO <em>Cost Intelligence</em> Command Center</div><div className="subtitle">Technical Director · Adaptive Workbook Intelligence · Cairo {clock}<RepoLastModified/></div></div><div className="approval">Designed &amp; Created | Eng. Ahmed Labib</div></div><nav className="nav">{NAV.map(n=><button key={n.id} className={tab===n.id?"active":""} onClick={()=>setTab(n.id)}>{n.label}</button>)}</nav></header>{tab==="portfolio"&&<PortfolioCommandCenter projects={projects} onOpen={open}/>} {tab==="projects"&&<ProjectCards projects={projects} onOpen={open}/>} {tab==="intelligence"&&<section className="qualityWorkspace"><nav className="qualityTabNav" aria-label="Data quality views"><button type="button" className={qualityView==="overview"?"active":""} aria-pressed={qualityView==="overview"} onClick={()=>setQualityView("overview")}><b>Quality Overview</b><span>History, findings and source registry</span></button><button type="button" className={qualityView==="mapping"?"active":""} aria-pressed={qualityView==="mapping"} onClick={()=>setQualityView("mapping")}><b>Data Mapping</b><span>Projects → JSON → Command Center</span></button></nav>{qualityView==="overview"?<><IdentityConflictAlerts conflicts={conflicts}/><MonthlyHistory projects={projects}/><PortfolioQuality projects={projects} onOpen={open}/><SourceRegistry projects={projects} onOpen={open}/></>:<PortfolioDataMapping models={portfolioModels} onOpen={open}/>}</section>} {tab==="output"&&<OutputStudio projects={projects}/>}</main>;
}
