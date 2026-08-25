"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectRegistryItem } from "@/lib/types";
import ProjectWorkspace, { type ProjectView } from "@/components/ProjectWorkspace";
import { MonthlyHistory, PortfolioCommandCenter, PortfolioQuality, ProjectCards } from "@/components/PortfolioWorkspace";
import { money } from "@/lib/normalized";
import OutputStudio from "@/components/OutputStudio";

type Tab="portfolio"|"projects"|"intelligence"|"output";
const NAV:{id:Tab;label:string}[]=[{id:"portfolio",label:"Portfolio Command Center"},{id:"projects",label:"Projects"},{id:"intelligence",label:"Monthly Intelligence & Data Quality"},{id:"output",label:"Output Studio"}];

function SourceRegistry({projects,onOpen}:{projects:ProjectRegistryItem[];onOpen:(id:string)=>void}){return <div className="card"><h3>Source Registry</h3><p className="sub">Every project source is isolated by permanent project ID, reporting period and source SHA-256.</p><div className="tablewrap"><table><thead><tr><th>Project</th><th>Period</th><th>Fingerprint</th><th>Sheets</th><th>Excel Charts</th><th>Capabilities</th><th>Current AC</th></tr></thead><tbody>{projects.map(p=><tr key={p.project_id} className="clickable-row" onClick={()=>onOpen(p.project_id)}><td className="pname">{p.project_name}</td><td>{p.reporting_period}</td><td className="mono">{p.source_fingerprint}</td><td>{p.sheet_count}</td><td>{p.chart_count}</td><td>{Object.entries(p.capabilities||{}).filter(([,v])=>v).map(([k])=>k.replaceAll("_"," ")).join(" · ")}</td><td>{money(p.metrics?.actual_cost)}</td></tr>)}</tbody></table></div></div>}

function OlaOverlay(){
 const [show,setShow]=useState(false),[ready,setReady]=useState(false);
 const seq=useRef(0),taps=useRef<number[]>([]),showing=useRef(false),readyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  const reveal=()=>{if(showing.current)return;showing.current=true;setReady(false);setShow(true);document.documentElement.classList.add("trick-open");if(readyTimer.current)clearTimeout(readyTimer.current);readyTimer.current=setTimeout(()=>setReady(true),3000)};
  const key=(e:KeyboardEvent)=>{const expected=String(seq.current+1);if(e.key===expected){seq.current++;if(seq.current===5){seq.current=0;reveal()}}else seq.current=e.key==="1"?1:0};
  const touch=(e:PointerEvent)=>{if(e.pointerType!=="touch"||showing.current)return;const now=Date.now();taps.current=[...taps.current.filter(t=>now-t<850),now];if(taps.current.length>=3){taps.current=[];reveal()}};
  window.addEventListener("keydown",key);window.addEventListener("pointerup",touch,{passive:true});
  return()=>{window.removeEventListener("keydown",key);window.removeEventListener("pointerup",touch);if(readyTimer.current)clearTimeout(readyTimer.current);document.documentElement.classList.remove("trick-open")}
 },[]);
 const dismiss=()=>{if(!ready)return;setShow(false);setReady(false);showing.current=false;document.documentElement.classList.remove("trick-open")};
 if(!show)return null;
 return <div id="olaTrickOverlay" className={ready?"ready":""} role="dialog" aria-modal="true" aria-label="Message for Eng. Olla" onClick={dismiss}>
  <div className="trickStage">
   <div className="trickSentence"><strong>Eng. Olla,</strong><span> I Really Hope You Feel Satisfied</span></div>
  </div>
  <div className="trickHint">Press anywhere to return</div>
 </div>
}

export default function Dashboard({initialProjectId,initialProjectView="executive"}:{initialProjectId?:string;initialProjectView?:ProjectView}){
 const [projects,setProjects]=useState<ProjectRegistryItem[]>([]),[,setPortfolio]=useState<any>(null),[tab,setTab]=useState<Tab>("portfolio"),[projectId,setProjectId]=useState(initialProjectId||""),[projectView,setProjectView]=useState<ProjectView>(initialProjectView),[clock,setClock]=useState("");
 useEffect(()=>{Promise.all([fetch("/generated/projects.json").then(r=>r.json()),fetch("/generated/portfolio/latest.json").then(r=>r.json())]).then(([p,po])=>{setProjects(p);setPortfolio(po)}).catch(()=>{})},[]);
 useEffect(()=>{const t=()=>setClock(new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date()));t();const id=setInterval(t,30000);return()=>clearInterval(id)},[]);
 useEffect(()=>{const pop=()=>{const m=location.pathname.match(/^\/project\/([^/]+)(?:\/([^/]+))?/);setProjectId(m?decodeURIComponent(m[1]):"");setProjectView((m?.[2] as ProjectView)||"executive")};window.addEventListener("popstate",pop);return()=>window.removeEventListener("popstate",pop)},[]);
 const open=(id:string)=>{setProjectId(id);setProjectView("executive");history.pushState({},"",`/project/${encodeURIComponent(id)}/executive`);window.scrollTo({top:0,behavior:"smooth"})};
 const navigateProject=(view:ProjectView)=>{setProjectView(view);history.pushState({},"",`/project/${encodeURIComponent(projectId)}/${view}`);window.scrollTo({top:0,behavior:"smooth"})};
 const back=()=>{setProjectId("");history.pushState({},"","/");setTab("portfolio");window.scrollTo({top:0,behavior:"smooth"})};
 if(projectId)return <main className="shell"><OlaOverlay/><ProjectWorkspace projectId={projectId} view={projectView} onNavigate={navigateProject} onBack={back}/></main>;
 return <main className="shell"><OlaOverlay/><header className="top"><div className="brandrow"><div><div className="title">CTO <em>Cost Intelligence</em> Command Center</div><div className="subtitle">Technical Director · Adaptive Workbook Intelligence · Cairo {clock}</div></div><div className="approval">NO HARD-CODED PROJECTS · STRICT PROJECT ISOLATION</div></div><nav className="nav">{NAV.map(n=><button key={n.id} className={tab===n.id?"active":""} onClick={()=>setTab(n.id)}>{n.label}</button>)}</nav></header>{tab==="portfolio"&&<PortfolioCommandCenter projects={projects} onOpen={open}/>} {tab==="projects"&&<ProjectCards projects={projects} onOpen={open}/>} {tab==="intelligence"&&<><MonthlyHistory projects={projects}/><PortfolioQuality projects={projects} onOpen={open}/><SourceRegistry projects={projects} onOpen={open}/></>} {tab==="output"&&<OutputStudio projects={projects}/>}</main>;
}
