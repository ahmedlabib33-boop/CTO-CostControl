"use client";

import { money, num } from "@/lib/normalized";

const COLORS = ["#22d3ee","#a78bfa","#fb923c","#34d399","#fbbf24","#38bdf8","#fb7185","#60a5fa","#c084fc","#2dd4bf"];
const safe = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : 0;

export function ChartShell({title,description,children,badge}:{title:string;description?:string;children:React.ReactNode;badge?:string}) {
  return <div className="card chartCard"><div className="chartHeading"><div><h3>{title}</h3>{description&&<p className="sub">{description}</p>}</div>{badge&&<span className="sourceBadge">{badge}</span>}</div>{children}</div>;
}

export function GroupedBarChart({labels,series,onSelect,horizontal=false,valueFormatter=money}:{labels:string[];series:{label:string;values:(number|null|undefined)[]}[];onSelect?:(i:number)=>void;horizontal?:boolean;valueFormatter?:(v:number)=>string}) {
  const all=series.flatMap(s=>s.values.map(v=>Math.abs(safe(v)))); const max=Math.max(1,...all);
  if(horizontal) return <div className="hbarChart">{labels.map((label,i)=><button type="button" className="hbarRow" key={`${label}-${i}`} onClick={()=>onSelect?.(i)}><span className="hbarLabel" title={label}>{label}</span><span className="hbarTracks">{series.map((s,si)=>{const v=safe(s.values[i]);return <span className="hbarTrack" key={s.label}><i style={{width:`${Math.abs(v)/max*100}%`,background:COLORS[si%COLORS.length]}}/><b>{valueFormatter(v)}</b><em>{s.label}</em></span>})}</span></button>)}</div>;
  const W=760,H=320,padL=55,padR=16,padT=22,padB=66,plotW=W-padL-padR,plotH=H-padT-padB,groupW=plotW/Math.max(1,labels.length),barW=Math.max(3,Math.min(24,(groupW-8)/Math.max(1,series.length)));
  return <div className="svgWrap"><svg className="viz" viewBox={`0 0 ${W} ${H}`} role="img"><line className="axis" x1={padL} y1={H-padB} x2={W-padR} y2={H-padB}/><line className="axis" x1={padL} y1={padT} x2={padL} y2={H-padB}/>{[0,.25,.5,.75,1].map(t=><g key={t}><line className="gridline" x1={padL} x2={W-padR} y1={padT+plotH*(1-t)} y2={padT+plotH*(1-t)}/><text className="tick" x={padL-6} y={padT+plotH*(1-t)+3} textAnchor="end">{money(max*t)}</text></g>)}{labels.map((label,i)=>{const gx=padL+i*groupW+groupW/2;return <g key={`${label}-${i}`} className={onSelect?"clickable":""} onClick={()=>onSelect?.(i)}>{series.map((s,si)=>{const v=safe(s.values[i]);const h=Math.abs(v)/max*plotH;const x=gx-(series.length*barW)/2+si*barW;const y=H-padB-h;return <rect key={s.label} x={x} y={y} width={barW-2} height={h} rx="2" fill={COLORS[si%COLORS.length]}><title>{`${label} · ${s.label}: ${valueFormatter(v)}`}</title></rect>})}<text className="xtick" x={gx} y={H-padB+15} transform={`rotate(-35 ${gx} ${H-padB+15})`} textAnchor="end">{label.length>28?label.slice(0,27)+"…":label}</text></g>})}</svg><Legend series={series.map(s=>s.label)}/></div>;
}

export function LineChart({labels,series,valueFormatter=money}:{labels:string[];series:{label:string;values:(number|null|undefined)[]}[];valueFormatter?:(v:number)=>string}) {
  const vals=series.flatMap(s=>s.values.filter(v=>typeof v==="number"&&Number.isFinite(v)) as number[]); const min=Math.min(0,...vals), max=Math.max(1,...vals),range=max-min||1;
  const W=760,H=300,L=55,R=18,T=22,B=55,pw=W-L-R,ph=H-T-B;
  const x=(i:number)=>L+(labels.length<=1?pw/2:i/(labels.length-1)*pw); const y=(v:number)=>T+(max-v)/range*ph;
  return <div className="svgWrap"><svg className="viz" viewBox={`0 0 ${W} ${H}`}><line className="axis" x1={L} y1={H-B} x2={W-R} y2={H-B}/><line className="axis" x1={L} y1={T} x2={L} y2={H-B}/>{[0,.25,.5,.75,1].map(t=>{const v=min+range*t;return <g key={t}><line className="gridline" x1={L} x2={W-R} y1={y(v)} y2={y(v)}/><text className="tick" x={L-6} y={y(v)+3} textAnchor="end">{valueFormatter(v)}</text></g>})}{series.map((s,si)=>{let d="";s.values.forEach((vv,i)=>{if(typeof vv!=="number"||!Number.isFinite(vv))return;d+=`${d?" L":"M"} ${x(i)} ${y(vv)}`});return <g key={s.label}><path d={d} fill="none" stroke={COLORS[si%COLORS.length]} strokeWidth="2.4"/>{s.values.map((vv,i)=>typeof vv==="number"&&Number.isFinite(vv)?<circle key={i} cx={x(i)} cy={y(vv)} r="3" fill={COLORS[si%COLORS.length]}><title>{`${labels[i]} · ${s.label}: ${valueFormatter(vv)}`}</title></circle>:null)}</g>})}{labels.map((l,i)=><text key={i} className="xtick" x={x(i)} y={H-B+17} transform={`rotate(-35 ${x(i)} ${H-B+17})`} textAnchor="end">{l}</text>)}</svg><Legend series={series.map(s=>s.label)}/></div>;
}

export function BubbleChart({points,onSelect}:{points:{label:string;group?:string;x:number;y:number;size:number;detail?:string}[];onSelect?:(i:number)=>void}) {
  const maxX=Math.max(1,...points.map(p=>p.x)),maxY=Math.max(1,...points.map(p=>p.y)),maxSize=Math.max(1,...points.map(p=>Math.abs(p.size))); const W=760,H=320,L=55,R=18,T=20,B=50,pw=W-L-R,ph=H-T-B;
  return <div className="svgWrap"><svg className="viz" viewBox={`0 0 ${W} ${H}`}><line className="axis" x1={L} y1={H-B} x2={W-R} y2={H-B}/><line className="axis" x1={L} y1={T} x2={L} y2={H-B}/>{points.map((p,i)=>{const cx=L+(Math.max(0,p.x)/maxX)*pw,cy=T+(1-Math.max(0,p.y)/maxY)*ph,r=6+Math.sqrt(Math.abs(p.size)/maxSize)*20;return <g key={`${p.label}-${i}`} className="point clickable" onClick={()=>onSelect?.(i)}><circle cx={cx} cy={cy} r={r} fill={COLORS[i%COLORS.length]} fillOpacity=".55" stroke={COLORS[i%COLORS.length]}/><text x={cx+r+3} y={cy-2} className="bubbleLabel">{p.label.length>22?p.label.slice(0,21)+"…":p.label}</text><title>{p.detail||`${p.label} · X ${num(p.x)} · Y ${num(p.y)} · Size ${money(p.size)}`}</title></g>})}<text className="axisLabel" x={W-90} y={H-9}>Completion % →</text><text className="axisLabel" x="7" y="18">CPI</text></svg></div>;
}

export function DonutChart({items}:{items:{name:string;value:number}[]}) {
  const total=items.reduce((a,x)=>a+Math.max(0,x.value),0)||1; const r=72,c=2*Math.PI*r;let offset=0;
  return <div className="donutLayout"><svg className="donut" viewBox="0 0 200 200"><circle cx="100" cy="100" r={r} fill="none" stroke="#17253b" strokeWidth="28"/>{items.map((it,i)=>{const len=Math.max(0,it.value)/total*c;const node=<circle key={it.name} cx="100" cy="100" r={r} fill="none" stroke={COLORS[i%COLORS.length]} strokeWidth="28" strokeDasharray={`${len} ${c-len}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)"><title>{`${it.name}: ${money(it.value)}`}</title></circle>;offset+=len;return node})}<text x="100" y="96" className="donutMain" textAnchor="middle">{money(total)}</text><text x="100" y="114" className="donutSub" textAnchor="middle">total</text></svg><div className="donutLegend">{items.map((x,i)=><div key={x.name}><i style={{background:COLORS[i%COLORS.length]}}/><span>{x.name}</span><b>{money(x.value)}</b></div>)}</div></div>;
}

export function SimpleWaterfall({labels,levels}:{labels:string[];levels:number[]}) {
  return <GroupedBarChart labels={labels} series={[{label:"EGP",values:levels}]} valueFormatter={money}/>;
}

function Legend({series}:{series:string[]}) { return <div className="legendline">{series.map((s,i)=><span key={s}><i className="legend" style={{background:COLORS[i%COLORS.length]}}/>{s}</span>)}</div> }

export function ExcelSourceChart({chart}:{chart:any}) {
  const series=(chart?.series||[]).map((s:any,idx:number)=>({label:s.name||s.title||`Series ${idx+1}`,values:Array.isArray(s.values)?s.values:Array.isArray(s.cached_values)?s.cached_values.filter((v:any)=>typeof v==="number"):[]}));
  const categories=chart?.series?.[0]?.categories || series[0]?.values?.map((_:any,i:number)=>String(i+1)) || [];
  if(!series.some((s:any)=>s.values.length)) return <div className="chartEmpty">Chart definition preserved. Source references: {(chart?.series||[]).flatMap((s:any)=>s.formulas||s.references||[]).join(" · ")||"—"}</div>;
  const t=String(chart?.types?.[0]||chart?.type||"").toLowerCase();
  if(t.includes("pie")||t.includes("doughnut")) return <DonutChart items={(categories as string[]).map((n,i)=>({name:n,value:safe(series[0]?.values[i])})).filter(x=>x.value!==0)}/>;
  return t.includes("line") ? <LineChart labels={categories} series={series}/> : <GroupedBarChart labels={categories} series={series}/>;
}
