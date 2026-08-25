"use client";

import { useMemo, useState } from "react";
import { moneyFull, num, pct, text } from "@/lib/normalized";

export type Col = { key:string; label:string; format?:"money"|"num"|"pct"|"text"; className?:(row:any)=>string };
const fmt=(v:any,t?:Col["format"])=> t==="money"?moneyFull(typeof v==="number"?v:null):t==="num"?num(typeof v==="number"?v:null):t==="pct"?pct(typeof v==="number"?v:null,true):text(v);

export function DataTable({rows,columns,searchKeys,filters,pageSize=0,onRowClick,title,subtitle}:{rows:any[];columns:Col[];searchKeys?:string[];filters?:{label:string;key:string;options?:string[]}[];pageSize?:number;onRowClick?:(row:any)=>void;title?:string;subtitle?:string}) {
  const [q,setQ]=useState(""); const [sort,setSort]=useState(columns[0]?.key||""); const [dir,setDir]=useState(1); const [page,setPage]=useState(0); const [filterVals,setFilterVals]=useState<Record<string,string>>({});
  const availableFilters=useMemo(()=> (filters||[]).map(f=>({ ...f, options:f.options||[...new Set(rows.map(r=>String(r?.[f.key]??"")).filter(Boolean))].sort() })),[filters,rows]);
  const data=useMemo(()=>{const low=q.trim().toLowerCase();let x=rows.filter(r=>(!low||(searchKeys||columns.map(c=>c.key)).some(k=>String(r?.[k]??"").toLowerCase().includes(low)))&&availableFilters.every(f=>!filterVals[f.key]||String(r?.[f.key]??"")===filterVals[f.key]));if(sort)x=[...x].sort((a,b)=>{const av=a?.[sort],bv=b?.[sort];if(typeof av==="number"||typeof bv==="number")return ((Number(av)||0)-(Number(bv)||0))*dir;return String(av??"").localeCompare(String(bv??""))*dir});return x},[rows,q,sort,dir,filterVals,availableFilters,columns,searchKeys]);
  const pages=pageSize?Math.max(1,Math.ceil(data.length/pageSize)):1;const p=Math.min(page,pages-1);const shown=pageSize?data.slice(p*pageSize,(p+1)*pageSize):data;
  return <div className="dataBlock">{(title||subtitle)&&<div className="sectionIntro">{title&&<h3>{title}</h3>}{subtitle&&<p className="sub">{subtitle}</p>}</div>}<div className="tableTools"><input value={q} onChange={e=>{setQ(e.target.value);setPage(0)}} placeholder="Search…"/>{availableFilters.map(f=><select key={f.key} value={filterVals[f.key]||""} onChange={e=>{setFilterVals(v=>({...v,[f.key]:e.target.value}));setPage(0)}}><option value="">All {f.label}</option>{f.options!.map(o=><option key={o}>{o}</option>)}</select>)}<span className="rowcount">{data.length} of {rows.length} rows</span></div><div className="tablewrap"><table><thead><tr>{columns.map(c=><th key={c.key} onClick={()=>{if(sort===c.key)setDir(-dir);else{setSort(c.key);setDir(1)}}}>{c.label}{sort===c.key?<span className="sortArrow">{dir>0?" ▲":" ▼"}</span>:null}</th>)}</tr></thead><tbody>{shown.map((r,i)=><tr key={r.sn??r.main_code??r.row??`${p}-${i}`} className={onRowClick?"clickable-row":""} onClick={()=>onRowClick?.(r)}>{columns.map(c=><td key={c.key} className={c.className?.(r)||""}>{fmt(r?.[c.key],c.format)}</td>)}</tr>)}</tbody></table></div>{pageSize>0&&<div className="pager"><span className="rowcount">Page {p+1} of {pages}</span><button onClick={()=>setPage(Math.max(0,p-1))} disabled={p<=0}>Previous</button><button onClick={()=>setPage(Math.min(pages-1,p+1))} disabled={p>=pages-1}>Next</button></div>}</div>;
}

export function PlainMatrix({rows,headers}:{rows:any[][];headers?:string[]}) { return <div className="tablewrap"><table><thead>{headers&&<tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr>}</thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{typeof v==="number"?num(v):text(v)}</td>)}</tr>)}</tbody></table></div> }

export function SourceSnapshot({rows}:{rows:any[]}) {
  const cols=useMemo(()=>{const s=new Set<string>();rows.forEach(r=>Object.keys(r.cells||{}).forEach(c=>s.add(c)));const colNum=(x:string)=>x.split("").reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);return [...s].sort((a,b)=>colNum(a)-colNum(b))},[rows]);
  return <><div className="sourceMeta"><span>{rows.length} populated source rows</span><span>{cols.length} used columns</span></div><div className="tablewrap raw"><table><thead><tr><th>Row</th>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.row}</td>{cols.map(c=><td key={c} className="rawcell">{text(r.cells?.[c])}</td>)}</tr>)}</tbody></table></div></>;
}
