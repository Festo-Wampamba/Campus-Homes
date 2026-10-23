"use client";
import { useState } from "react";
import { SUPPORT_FAQS } from "@campushomes/shared";
const TOPICS=[{label:"All questions",pattern:null},{label:"Reservations and booking",pattern:/reserv|book|held/i},{label:"Costs and payments",pattern:/cost|pay|rent/i},{label:"Inspection and help",pattern:/verif|help|see the room/i}];
export function FaqTopics() {
  const [query,setQuery]=useState("");const [topic,setTopic]=useState(0);
  const rows=SUPPORT_FAQS.filter(faq=>(!TOPICS[topic].pattern||TOPICS[topic].pattern!.test(faq.question))&&`${faq.question} ${faq.answer}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <label className="block font-semibold" htmlFor="faq-search">Search help topics</label>
    <input id="faq-search" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Try deposits, viewing or free reservations" className="mt-3 min-h-12 w-full rounded-xl border border-border bg-card px-4 text-base"/>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Help topics">{TOPICS.map((item,index)=><button type="button" key={item.label} aria-pressed={topic===index} onClick={()=>setTopic(index)} className={`min-h-11 rounded-full border border-border px-4 text-sm font-semibold ${topic===index ? "bg-primary text-primary-foreground" : "bg-card"}`}>{item.label}</button>)}</div>
    <p className="my-5 text-sm text-muted-foreground" aria-live="polite">{rows.length} answers found</p>
    {rows.length ? <div className="ch-faq-list">{rows.map(faq=><details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div> : <p className="rounded-xl border border-dashed border-border p-6 text-muted-foreground">No answers match this search. Try a different word or contact our support team below.</p>}
  </>;
}
