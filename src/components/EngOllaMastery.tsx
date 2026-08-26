"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_QUESTIONS_PER_PAGE, OLLA_MODULES, type ExecutiveQuestion } from "@/lib/ollaMasteryContent";

type Screen = "hero" | "modules" | "learning" | "complete";

function Lines({text}:{text:string}) {
  return <>{text.split("\n").map((line,index)=>line ? <span className={line.startsWith("•")||/^\d+\./.test(line)?"ollaListLine":""} key={index}>{line}</span> : <span className="ollaBreak" key={index}/>)}</>;
}

function ExecutiveCallout({children}:{children:React.ReactNode}) {
  return <aside className="ollaCallout"><strong>Eng. OLLA,</strong><span>{children}</span></aside>;
}

function OllaQuestion({item,revealed,onReveal}:{item:ExecutiveQuestion;revealed:boolean;onReveal:()=>void}) {
  return <article className={`ollaQuestion ${revealed?"isRevealed":""}`}>
    <div className="ollaQuestionHead"><div><span className="ollaEyebrow">Question · {item.id}</span><h3>{item.question}</h3></div><button type="button" className="ollaReveal" aria-expanded={revealed} aria-controls={`${item.id}-answer`} onClick={onReveal}>{revealed?"Answer Revealed":"Show Answer"}</button></div>
    <div className="ollaAnswer" id={`${item.id}-answer`} aria-hidden={!revealed}>
      <div className="ollaAnswerInner">
        <section><span className="ollaAnswerLabel">Core answer</span><p className="ollaCore"><Lines text={item.answer}/></p></section>
        <section><span className="ollaAnswerLabel">Plain English</span><p><Lines text={item.plainEnglish}/></p></section>
        <ExecutiveCallout>{item.engOlla}</ExecutiveCallout>
        {item.managementChallenge&&<section className="ollaChallenge"><span className="ollaAnswerLabel">Management challenge</span><p><Lines text={item.managementChallenge}/></p></section>}
      </div>
    </div>
  </article>;
}

function OllaExit({onExit}:{onExit:()=>void}) {
  return <button type="button" className="ollaDashboardExit" onClick={onExit}>← Return to CTO Dashboard</button>;
}

export default function EngOllaMastery({onExit}:{onExit:()=>void}) {
  const [screen,setScreen]=useState<Screen>("hero");
  const [heroReady,setHeroReady]=useState(false);
  const [moduleIndex,setModuleIndex]=useState(0);
  const [page,setPage]=useState(0);
  const [revealed,setRevealed]=useState<Record<string,boolean>>({});
  const [direction,setDirection]=useState<"next"|"back">("next");
  const contentRef=useRef<HTMLDivElement>(null);
  const module=OLLA_MODULES[moduleIndex];
  const questionPages=Math.ceil(module.questions.length/MAX_QUESTIONS_PER_PAGE);
  const totalPages=questionPages+1;
  const isSummary=page===questionPages;
  const questions=useMemo(()=>module.questions.slice(page*MAX_QUESTIONS_PER_PAGE,(page+1)*MAX_QUESTIONS_PER_PAGE),[module,page]);

  useEffect(()=>{const timer=setTimeout(()=>setHeroReady(true),3300);return()=>clearTimeout(timer)},[]);
  useEffect(()=>{try{const raw=sessionStorage.getItem("olla-mastery-v1");if(!raw)return;const saved=JSON.parse(raw);if(saved.revealed)setRevealed(saved.revealed);if(Number.isInteger(saved.moduleIndex))setModuleIndex(Math.min(OLLA_MODULES.length-1,Math.max(0,saved.moduleIndex)));if(Number.isInteger(saved.page))setPage(Math.max(0,saved.page))}catch{}},[]);
  useEffect(()=>{try{sessionStorage.setItem("olla-mastery-v1",JSON.stringify({moduleIndex,page,revealed}))}catch{}},[moduleIndex,page,revealed]);

  const change=useCallback((nextScreen:Screen,nextModule=moduleIndex,nextPage=page,nextDirection:"next"|"back"="next")=>{setDirection(nextDirection);setScreen(nextScreen);setModuleIndex(nextModule);setPage(nextPage);requestAnimationFrame(()=>contentRef.current?.scrollTo({top:0,behavior:"smooth"}))},[moduleIndex,page]);
  const chooseModule=(index:number)=>change("learning",index,0,"next");
  const goBack=useCallback(()=>{if(screen==="modules"){change("hero",moduleIndex,page,"back");return}if(screen==="complete"){change("learning",OLLA_MODULES.length-1,Math.ceil(OLLA_MODULES.at(-1)!.questions.length/MAX_QUESTIONS_PER_PAGE),"back");return}if(screen!=="learning")return;if(page===0)change("modules",moduleIndex,0,"back");else change("learning",moduleIndex,page-1,"back")},[screen,page,moduleIndex,change]);
  const goNext=useCallback(()=>{if(screen==="hero"){if(heroReady)change("modules",moduleIndex,page,"next");return}if(screen==="modules")return;if(screen==="complete")return;if(page<totalPages-1){change("learning",moduleIndex,page+1,"next");return}if(moduleIndex<OLLA_MODULES.length-1)change("learning",moduleIndex+1,0,"next");else change("complete",moduleIndex,page,"next")},[screen,heroReady,page,totalPages,moduleIndex,change]);

  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==="Escape")return;if((event.key==="Enter"||event.key==="ArrowRight")&&screen!=="modules"&&!event.repeat){event.preventDefault();goNext()}else if(event.key==="ArrowLeft"&&screen!=="hero"&&!event.repeat){event.preventDefault();goBack()}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[screen,goNext,goBack]);

  return <div id="olaTrickOverlay" role="dialog" aria-modal="true" aria-label="Eng. Olla Executive Mastery">
    <OllaExit onExit={onExit}/>
    {screen==="hero"&&<section className="ollaHero" aria-labelledby="olla-hero-title"><h1 id="olla-hero-title" className="trickSentence"><strong>Eng. Olla,</strong><span> I Really Hope You Feel Satisfied</span></h1>{heroReady&&<button type="button" className="ollaContinue show" onClick={goNext}>Continue <span>→</span></button>}</section>}
    {screen==="modules"&&<section className={`ollaExperience ollaEnter ${direction}`}><header className="ollaMasteryHead"><span>ENG. OLLA</span><h1>EXECUTIVE MASTERY</h1><p>Project Finance <i>•</i> Executive Decision Intelligence</p></header><div className="ollaModuleChoices">{OLLA_MODULES.map((item,index)=><button type="button" className="ollaModuleChoice" key={item.id} onClick={()=>chooseModule(index)}><span className="ollaModuleNumber">{item.number}</span><span className="ollaModuleText"><b>{item.title}</b><small>{item.description}</small></span><span className="ollaModuleArrow">→</span></button>)}</div></section>}
    {screen==="learning"&&<section className={`ollaExperience ollaLearning ollaEnter ${direction}`}><header className="ollaLearningHead"><div><span className="ollaEyebrow">Module {module.number}</span><h1>{module.title}</h1><p>{module.subtitle}</p></div><span className="ollaPageIndicator">{String(page+1).padStart(2,"0")} / {String(totalPages).padStart(2,"0")}</span></header><div className="ollaGoldLine"/><div className="ollaLearningScroll" ref={contentRef}>{isSummary?<div className="ollaSummary"><span className="ollaEyebrow">Executive Summary</span><div className="ollaSummarySteps">{module.summary.steps.map((step,index)=><div className="ollaSummaryStep" key={step.label}><b>{step.label}</b>{step.detail&&<span>{step.detail}</span>}{index<module.summary.steps.length-1&&<i>↓</i>}</div>)}</div><ExecutiveCallout>{module.summary.engOlla.map(line=><span key={line}>{line}</span>)}</ExecutiveCallout>{module.summary.executiveNumbers&&<div className="ollaExecutiveNumbers"><h2>The seven executive numbers management should request</h2><ol>{module.summary.executiveNumbers.map(item=><li key={item}>{item}</li>)}</ol></div>}</div>:<div className="ollaQuestions">{questions.map(item=><OllaQuestion key={item.id} item={item} revealed={Boolean(revealed[item.id])} onReveal={()=>setRevealed(state=>({...state,[item.id]:true}))}/>)}</div>}</div><nav className="ollaLearningNav" aria-label="Learning page navigation"><button type="button" onClick={goBack}>← Return</button><button type="button" onClick={goNext}>Continue →</button></nav></section>}
    {screen==="complete"&&<section className={`ollaExperience ollaComplete ollaEnter ${direction}`}><div><span className="ollaEyebrow">Executive Mastery • Project Finance</span><h1><strong>Eng. OLLA,</strong><span>You are not reviewing numbers.</span><span>You are deciding what those numbers mean for the business.</span></h1><p>Executive Mastery <i>•</i> Project Finance</p><div className="ollaCompleteActions"><button type="button" onClick={()=>change("modules",0,0,"back")}>Return to Modules</button><button type="button" onClick={onExit}>Return to CTO Dashboard</button></div></div></section>}
  </div>;
}
