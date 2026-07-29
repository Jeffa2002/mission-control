'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, StatusBadge } from '../../components/ops-ui';
import styles from './agent-activity.module.css';

type EventItem = {
  eventId: string; occurredAt: string; agentId: string; workId: string; parentWorkId: string|null;
  kind: string; phase: string|null; status: string|null; toolCategory: string|null; outcome: string|null;
  blockerCategory: string|null; artifactRef: string|null; retryCount: number|null; summary: string;
};
type Payload = { generatedAt:string; collector:{status:'healthy'|'stale'|'unknown';heartbeatAt:string|null;lastEventAt:string|null;rejectedEvents:number}; events:EventItem[] };
type Window='1h'|'24h'|'all';

const relative=(value:string|null)=>{if(!value)return'never';const seconds=Math.max(0,(Date.now()-Date.parse(value))/1000);return seconds<60?'just now':seconds<3600?`${Math.floor(seconds/60)}m ago`:seconds<86400?`${Math.floor(seconds/3600)}h ago`:`${Math.floor(seconds/86400)}d ago`};
const time=(value:string)=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value));
const tone=(event:EventItem)=>event.outcome==='failure'||event.kind.includes('failed')?'bad':event.outcome==='success'||event.kind.includes('completed')?'good':event.kind.includes('blocker')||event.kind.includes('approval')?'warn':'info';

export default function AgentActivityPage(){
  const[data,setData]=useState<Payload|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true);
  const[agent,setAgent]=useState('all'),[kind,setKind]=useState('all'),[outcome,setOutcome]=useState('all'),[window,setWindow]=useState<Window>('24h'),[query,setQuery]=useState('');
  const load=useCallback(async()=>{try{const response=await fetch('/api/agents/live',{cache:'no-store'});if(!response.ok)throw new Error(await response.text());setData(await response.json());setError(null)}catch(caught){setError(caught instanceof Error?caught.message:String(caught))}finally{setLoading(false)}},[]);
  useEffect(()=>{load();const timer=setInterval(load,15_000);return()=>clearInterval(timer)},[load]);
  const events=useMemo(()=>[...(data?.events??[])].sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)),[data]);
  const agents=useMemo(()=>[...new Set(events.map(event=>event.agentId))].sort(),[events]);
  const kinds=useMemo(()=>[...new Set(events.map(event=>event.kind))].sort(),[events]);
  const filtered=useMemo(()=>{const cutoff=window==='all'?-Infinity:Date.now()-(window==='1h'?3_600_000:86_400_000);const needle=query.trim().toLowerCase();return events.filter(event=>Date.parse(event.occurredAt)>=cutoff&&(agent==='all'||event.agentId===agent)&&(kind==='all'||event.kind===kind)&&(outcome==='all'||event.outcome===outcome)&&(!needle||`${event.agentId} ${event.kind} ${event.summary} ${event.toolCategory??''} ${event.workId}`.toLowerCase().includes(needle))).slice(0,500)},[events,window,agent,kind,outcome,query]);
  const activeAgents=new Set(filtered.map(event=>event.agentId)).size, failures=filtered.filter(event=>tone(event)==='bad').length, toolEvents=filtered.filter(event=>event.kind.startsWith('tool.')).length;
  return <AppShell><main className={styles.page}>
    <header className={styles.header}><div><p>AGENT OBSERVABILITY</p><h1>Agent Activity Log</h1><span>Privacy-safe lifecycle and tool-category history from Bazza. Prompt and transcript content is excluded.</span></div><div className={styles.live}><StatusBadge label={data?.collector.status==='healthy'?'Live · 15s':data?.collector.status??'Connecting'} status={data?.collector.status==='healthy'?'healthy':'warning'} pulse={data?.collector.status==='healthy'}/><small>Heartbeat {relative(data?.collector.heartbeatAt??null)}</small></div></header>
    {error?<div className={styles.error}>Agent telemetry: {error}</div>:null}
    <section className={styles.stats}><article><span>Visible events</span><strong>{loading?'—':filtered.length.toLocaleString()}</strong><small>Newest 500 after filters</small></article><article><span>Agents</span><strong>{loading?'—':activeAgents}</strong><small>Reporting in selected window</small></article><article><span>Tool events</span><strong>{loading?'—':toolEvents}</strong><small>Category only; payload excluded</small></article><article><span>Failures</span><strong>{loading?'—':failures}</strong><small>Failed outcomes and terminals</small></article></section>
    <section className={styles.filters}><div className={styles.windows}>{(['1h','24h','all'] as Window[]).map(value=><button key={value} aria-pressed={window===value} onClick={()=>setWindow(value)}>{value==='all'?'Retained':value.toUpperCase()}</button>)}</div><input aria-label="Search agent activity" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search summary, work ID, category…"/><select aria-label="Filter agent" value={agent} onChange={event=>setAgent(event.target.value)}><option value="all">All agents</option>{agents.map(value=><option key={value}>{value}</option>)}</select><select aria-label="Filter event kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="all">All event kinds</option>{kinds.map(value=><option key={value}>{value}</option>)}</select><select aria-label="Filter outcome" value={outcome} onChange={event=>setOutcome(event.target.value)}><option value="all">All outcomes</option>{['success','failure','cancelled','unknown'].map(value=><option key={value}>{value}</option>)}</select></section>
    <section className={styles.log}><div className={styles.logHead}><div><p>ALLOWLISTED EVENT STREAM</p><h2>Recent agent activity</h2></div><span>{events.length.toLocaleString()} retained · last event {relative(data?.collector.lastEventAt??null)}</span></div>{loading?<div className={styles.empty}>Loading activity…</div>:filtered.length?<div className={styles.rows}>{filtered.map(event=><article key={event.eventId} data-tone={tone(event)}><time>{time(event.occurredAt)}<small>{relative(event.occurredAt)}</small></time><span className={styles.dot}/><div className={styles.body}><div><b>{event.agentId}</b><em>{event.kind}</em>{event.toolCategory?<em>{event.toolCategory}</em>:null}{event.outcome?<em>{event.outcome}</em>:null}</div><strong>{event.summary}</strong><small>Work {event.workId}{event.phase&&event.phase!=='unknown'?` · ${event.phase}`:''}{event.status?` · ${event.status}`:''}</small></div></article>)}</div>:<div className={styles.empty}>No retained events match these filters.</div>}</section>
    <footer>Only declared metadata is shown: time, agent, lifecycle kind, tool category, outcome, phase, status, sanitized summary, and opaque work IDs. Prompts, reasoning, commands, arguments, tool results, secrets, environment data, and transcript text are rejected by the collector schema.</footer>
  </main></AppShell>;
}
