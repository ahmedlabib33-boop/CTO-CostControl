"use client";

import type { OllaVisualSpec } from "@/lib/ollaCeoVisuals";
import { CEO_VISUALS } from "@/lib/ollaCeoVisuals";

const toneClass = (tone?: string) => tone ? ` is-${tone}` : "";

function Legend({items}:{items:{label:string;tone:string}[]}) {
  return <div className="ollaVisualLegend">{items.map((item)=><span key={item.label} className={`ollaVisualLegendItem is-${item.tone}`}><i/>{item.label}</span>)}</div>;
}

function SeriesVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"series"}>}) {
  const all=spec.series.flatMap(s=>s.values);
  const max=Math.max(1,...all), min=Math.min(0,...all);
  const range=Math.max(1,max-min);
  const W=640,H=210,padX=38,padTop=20,padBottom=34;
  const x=(i:number)=>padX+(i*Math.max(1,W-padX*2))/Math.max(1,spec.labels.length-1);
  const y=(v:number)=>padTop+((max-v)*(H-padTop-padBottom))/range;
  return <div className="ollaVisualChart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
      {[0,1,2,3].map(i=><line key={i} x1={padX} x2={W-padX} y1={padTop+i*42} y2={padTop+i*42} className="ollaVisualGrid"/>)}
      <line x1={padX} x2={padX} y1={padTop} y2={H-padBottom} className="ollaVisualAxis"/>
      <line x1={padX} x2={W-padX} y1={H-padBottom} y2={H-padBottom} className="ollaVisualAxis"/>
      {spec.series.map((s)=> {
        const points=s.values.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
        return <g key={s.label} className={`ollaVisualSeries is-${s.tone}`}>
          <polyline points={points} fill="none"/>
          {s.values.map((v,i)=><circle key={i} cx={x(i)} cy={y(v)} r="3.5"/>)}
        </g>
      })}
      {spec.labels.map((label,i)=><text key={label} x={x(i)} y={H-10} textAnchor="middle" className="ollaVisualTick">{label}</text>)}
    </svg>
    <Legend items={spec.series.map(s=>({label:s.label,tone:s.tone}))}/>
  </div>;
}

function BarsVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"bars"}>}) {
  const max=Math.max(1,...spec.rows.flatMap(r=>[r.value,r.secondary||0]));
  return <div className="ollaVisualBars">{spec.rows.map((row)=><div className="ollaVisualBarRow" key={row.label}>
    <span>{row.label}</span>
    <div className="ollaVisualBarTrack">
      <i className={toneClass(row.tone)} style={{width:`${Math.max(4,row.value/max*100)}%`}}/>
      {row.secondary!==undefined&&<b style={{left:`${Math.min(100,row.secondary/max*100)}%`}} title={`Secondary: ${row.secondary}`}/>}
    </div>
    <em>{row.value}</em>
  </div>)}</div>;
}

function QuadrantVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"quadrant"}>}) {
  const positions=[
    {left:"70%",top:"24%"},{left:"28%",top:"22%"},{left:"72%",top:"70%"},{left:"28%",top:"70%"}
  ];
  return <div className="ollaQuadrant">
    <div className="ollaQuadrantGrid"><i/><i/><span className="ollaQuadrantX">{spec.xLabel}</span><span className="ollaQuadrantY">{spec.yLabel}</span>
      {spec.zones.map((z,i)=><div key={z.label} className={`ollaBubble is-${z.size} is-${z.status}`} style={positions[i]}><b>{z.label}</b></div>)}
    </div>
  </div>;
}

function DonutVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"donut"}>}) {
  const total=Math.max(1,spec.slices.reduce((a,b)=>a+b.value,0));
  let acc=0;
  const stops=spec.slices.map((s,i)=>{const start=acc/total*100;acc+=s.value;const end=acc/total*100;return `var(--olla-v${(i%5)+1}) ${start}% ${end}%`}).join(",");
  return <div className="ollaDonutLayout">
    <div className="ollaDonut" style={{background:`conic-gradient(${stops})`}}><div><b>{spec.center||"Mix"}</b><span>100%</span></div></div>
    <div className="ollaDonutLegend">{spec.slices.map((s,i)=><div key={s.label}><i className={`v${(i%5)+1}`}/><span>{s.label}</span><b>{s.value}%</b></div>)}</div>
  </div>;
}

function MatrixVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"matrix"}>}) {
  return <div className="ollaVisualTableWrap"><table className="ollaVisualTable"><thead><tr>{spec.headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{spec.rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div>;
}

function BridgeVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"bridge"}>}) {
  return <div className="ollaBridge">{spec.nodes.map((n,i)=><div className="ollaBridgeStep" key={n}><span>{n}</span>{i<spec.nodes.length-1&&<b>→</b>}</div>)}</div>;
}

function MetricVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"metric"}>}) {
  return <div className="ollaMetricGrid">{spec.items.map(i=><div className="ollaMetricCard" key={i.metric}><strong>{i.metric}</strong>{i.formula&&<code>{i.formula}</code>}<p>{i.meaning}</p>{i.direction&&<small>{i.direction}</small>}</div>)}</div>;
}

function ScenarioVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"scenario"}>}) {
  return <div className="ollaScenarioVisual">
    <div className="ollaScenarioColumn"><span className="ollaVisualMiniLabel">Before</span>{spec.before.map(i=><div className="ollaScenarioMetric" key={i.label}><span>{i.label}</span><b>{i.value}</b></div>)}</div>
    {spec.after.length>0&&<div className="ollaScenarioArrow">→</div>}
    {spec.after.length>0&&<div className="ollaScenarioColumn"><span className="ollaVisualMiniLabel">After</span>{spec.after.map(i=><div className={`ollaScenarioMetric${toneClass(i.status)}`} key={i.label}><span>{i.label}</span><b>{i.value}</b></div>)}</div>}
    <div className="ollaScenarioChain">{spec.chain.map((n,i)=><span key={n}>{n}{i<spec.chain.length-1&&<b>→</b>}</span>)}</div>
  </div>;
}

function FlowVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"flow"}>}) {
  return <div className="ollaCeoFlow">{spec.nodes.map((n,i)=><span key={n}>{n}{i<spec.nodes.length-1&&<b>→</b>}</span>)}</div>;
}

function NoDataVisual({spec}:{spec:Extract<OllaVisualSpec,{kind:"noData"}>}) {
  return <div className="ollaNoData"><span>—</span><strong>{spec.message}</strong></div>;
}

export function OllaMasteryVisual({questionId}:{questionId:string}) {
  const spec=CEO_VISUALS[questionId];
  if(!spec)return null;
  let body:React.ReactNode=null;
  if(spec.kind==="series")body=<SeriesVisual spec={spec}/>;
  else if(spec.kind==="bars")body=<BarsVisual spec={spec}/>;
  else if(spec.kind==="quadrant")body=<QuadrantVisual spec={spec}/>;
  else if(spec.kind==="donut")body=<DonutVisual spec={spec}/>;
  else if(spec.kind==="matrix")body=<MatrixVisual spec={spec}/>;
  else if(spec.kind==="bridge")body=<BridgeVisual spec={spec}/>;
  else if(spec.kind==="metric")body=<MetricVisual spec={spec}/>;
  else if(spec.kind==="scenario")body=<ScenarioVisual spec={spec}/>;
  else if(spec.kind==="flow")body=<FlowVisual spec={spec}/>;
  else body=<NoDataVisual spec={spec}/>;

  return <figure className="ollaVisualFrame">
    <figcaption><span>Visual illustration</span><strong>{spec.title}</strong></figcaption>
    {body}
    {spec.footer&&<p className="ollaVisualFoot">{spec.footer}</p>}
  </figure>;
}
