"use client";

import { useMemo, useState } from "react";
import type { PortfolioModel, ProjectData } from "@/lib/types";
import { buildPortfolioDataMappings, buildProjectDataMappings, type DataMappingRow, type MappingStatus } from "@/lib/dataMapping";

const STATUS_LABEL:Record<MappingStatus,string>={wired:"Exact evidence",derived:"Derived / aggregated",adaptive:"Adaptive evidence",unavailable:"Unavailable"};

function MappingTable({rows,portfolio=false,onOpen}:{rows:DataMappingRow[];portfolio?:boolean;onOpen?:(id:string)=>void}){
 const [query,setQuery]=useState(""),[page,setPage]=useState("ALL"),[status,setStatus]=useState("ALL");
 const pages=useMemo(()=>[...new Set(rows.map(row=>row.outputPage))].sort(),[rows]);
 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return rows.filter(row=>(page==="ALL"||row.outputPage===page)&&(status==="ALL"||row.status===status)&&(!q||[row.outputFamily,row.outputPage,row.outputComponent,row.projectName,row.sourceFile,...row.inputLocations,...row.jsonPaths].join(" ").toLowerCase().includes(q)))},[rows,query,page,status]);
 const uniqueOutputs=new Set(rows.map(row=>`${row.outputPage}|${row.outputComponent}`)).size;
 const exact=rows.filter(row=>row.status==="wired"||row.status==="adaptive").length;
 return <>
  <div className="mappingStats"><div><span>Mapped outputs</span><b>{uniqueOutputs}</b></div><div><span>Project links</span><b>{rows.length}</b></div><div><span>Exact source evidence</span><b>{exact}</b></div><div><span>Unavailable links</span><b>{rows.filter(row=>row.status==="unavailable").length}</b></div></div>
  <div className="mappingTools"><input className="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search output, input, sheet, row or JSON path…"/><select value={page} onChange={event=>setPage(event.target.value)}><option value="ALL">All output pages</option>{pages.map(value=><option key={value}>{value}</option>)}</select><select value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">All mapping states</option>{Object.entries(STATUS_LABEL).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div>
  <div className="tablewrap mappingTable"><table><thead><tr><th>{portfolio?"Command Center output":"Dashboard output"}</th><th>{portfolio?"Project input":"Workbook input"}</th><th>JSON bridge</th><th>Rule / current value</th><th>Mapping state</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id} className={portfolio&&onOpen?"clickable-row":""} onClick={()=>portfolio&&onOpen?.(row.projectId)}><td><b>{row.outputComponent}</b><small>{row.outputFamily} · {row.outputPage}</small></td><td><b>{portfolio?row.projectName:row.sourceFile}</b><small>{portfolio?row.period:(row.inputLocations.length?row.inputLocations.join(" · "):"Exact workbook row/cell evidence is not available for this output.")}</small></td><td>{row.jsonPaths.length?<div className="mappingPaths">{row.jsonPaths.map(path=><code key={path}>{path}</code>)}</div>:<span className="muted">No JSON path available</span>}</td><td><b>{row.currentValue}</b><small>{row.transform}{row.sourceRecords?` · ${row.sourceRecords.toLocaleString()} source records`:""}</small></td><td><span className={`mappingState ${row.status}`}>{STATUS_LABEL[row.status]}</span>{row.confidence!=null&&<small>{Math.round(row.confidence*100)}% extraction confidence</small>}</td></tr>)}</tbody></table></div>
  <div className="mappingFoot">Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} live mapping links. Missing evidence remains unavailable; no workbook address or financial value is fabricated.</div>
 </>;
}

export function ProjectDataMapping({data,norm}:{data:ProjectData;norm:any}){
 const rows=useMemo(()=>buildProjectDataMappings(data,norm||{}),[data,norm]);
 return <section aria-label="Project data mapping"><div className="sectionTitle" id="data-mapping"><h2>Data mapping</h2><p>Live lineage from this project’s workbook evidence, through generated JSON, to every current dashboard output.</p></div><div className="mappingFlow" aria-label="Project mapping flow"><div><span>1 · Input</span><b>{data.source.filename}</b><small>Workbook sheets, cells, rows and detected tables</small></div><i>→</i><div><span>2 · Controlled bridge</span><b>Project JSON</b><small>{data.reporting_period} · fingerprint {data.source.sha256.slice(0,16)}</small></div><i>→</i><div><span>3 · Output</span><b>Project dashboard</b><small>KPIs, charts, tables and assurance pages</small></div></div><div className="card"><MappingTable rows={rows}/></div></section>;
}

export function PortfolioDataMapping({models,onOpen}:{models:PortfolioModel[];onOpen:(id:string)=>void}){
 const rows=useMemo(()=>buildPortfolioDataMappings(models),[models]);
 return <section aria-label="Portfolio data mapping"><div className="mappingFlow" aria-label="Portfolio mapping flow"><div><span>1 · Inputs</span><b>Current project outputs</b><small>Latest isolated period and revision for each project</small></div><i>→</i><div><span>2 · Controlled bridge</span><b>Portfolio JSON + live aggregation</b><small>Selected projects and selected cost scope</small></div><i>→</i><div><span>3 · Output</span><b>Portfolio Command Center</b><small>Headline KPIs, charts, analysis and risk</small></div></div><div className="card"><h3>Portfolio Command Center mapping</h3><p className="sub">Every row identifies the project contribution used by a Command Center output. Future projects appear automatically when they enter the generated project registry.</p><MappingTable rows={rows} portfolio onOpen={onOpen}/></div></section>;
}
