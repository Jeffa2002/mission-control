'use client';

import { useMemo, useState } from 'react';
import { card, card2, cn, hostPill, pill, sevPill } from './ops-ui';

export function BaselineIndicator({ state, reason }: { state: 'normal' | 'watch' | 'alert' | 'stale'; reason: string }) {
  const cls = state === 'normal' ? 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10' : state === 'watch' ? 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10' : state === 'alert' ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10' : 'text-slate-300 border-white/10 bg-white/5';
  return <div className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px]', cls)}><span className="font-semibold uppercase">{state}</span><span className="text-slate-300">{reason}</span></div>;
}

export function LogViewer({ rows }: { rows: Array<{ ts: string; host: string; source: string; actor: string; action: string; outcome: string; detail: string }> }) {
  return <div className={cn(card,'overflow-hidden')}><div className="border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">Log viewer</div><div className="max-h-[420px] overflow-auto"><table className="w-full text-left text-[13px]"><thead className="sticky top-0 bg-[#151f36] text-[11px] uppercase tracking-[0.22em] text-slate-400"><tr><th className="px-4 py-3">Time</th><th>Host</th><th>Source</th><th>Actor</th><th>Action</th><th>Outcome</th><th>Details</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-b border-white/5 hover:bg-white/[0.03]"><td className="px-4 py-3 text-slate-400">{r.ts}</td><td><span className={cn(pill, hostPill(r.host as 'bazza' | 'prod'))}>{r.host}</span></td><td className="text-slate-300">{r.source}</td><td>{r.actor}</td><td>{r.action}</td><td><span className={sevPill(r.outcome)}>{r.outcome}</span></td><td className="pr-4 text-slate-400">{r.detail}</td></tr>)}</tbody></table></div></div>;
}

export function SystemHealthCard({ host, state, summary, anomalies }: { host: 'bazza' | 'prod'; state: 'healthy' | 'degraded' | 'stale' | 'critical'; summary: string; anomalies: string[] }) {
  return <div className={cn(card,'p-4 border-l-2', state==='critical' ? 'border-l-[#ef4444]' : state==='degraded' ? 'border-l-[#f59e0b]' : state==='stale' ? 'border-l-slate-500' : 'border-l-[#22c55e]')}><div className="flex items-center justify-between"><span className={cn(pill, hostPill(host))}>{host}</span><span className={sevPill(state)}>{state}</span></div><div className="mt-3 text-[15px] font-semibold">{summary}</div><ul className="mt-3 space-y-1 text-[13px] text-slate-400">{anomalies.map((a) => <li key={a}>• {a}</li>)}</ul></div>;
}

export function ThreatTimeline() { return <div className={cn(card,'p-4')}><div className="mb-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">Threat timeline</div><div className="grid grid-cols-12 gap-1">{Array.from({length:12}).map((_,i)=><div key={i} className={cn('h-20 rounded-md border', i%4===0?'border-[#ef4444]/40 bg-[#ef4444]/15':i%3===0?'border-[#f59e0b]/40 bg-[#f59e0b]/15':'border-white/10 bg-white/5')} />)}</div></div>; }

export function AlertTriageCard({ title, host, severity, evidence }: { title: string; host: 'bazza' | 'prod'; severity: 'info' | 'warning' | 'critical'; evidence: string[] }) {
  const [status, setStatus] = useState('open');
  return <div className={cn(card,'p-4 border-l-2', severity==='critical'?'border-l-[#ef4444]':severity==='warning'?'border-l-[#f59e0b]':'border-l-[#22d3ee]')}><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className={cn(sevPill(severity))}>{severity}</span><span className={cn(pill, hostPill(host))}>{host}</span><span className={pill}>{status}</span></div><div className="mt-3 text-[15px] font-semibold">{title}</div></div><div className="flex gap-2 text-[12px]"><button className={pill} onClick={()=>setStatus('ack')}>Acknowledge</button><button className={pill} onClick={()=>setStatus('assign')}>Assign</button><button className={pill} onClick={()=>setStatus('silenced')}>Silence</button><button className={pill} onClick={()=>setStatus('closed')}>Close</button></div></div><div className="mt-3 space-y-1 text-[13px] text-slate-400">{evidence.map((e)=><div key={e}>• {e}</div>)}</div></div>;
}

export function DrillDownDrawer({ open, title, items, onClose }: { open: boolean; title: string; items: string[]; onClose: ()=>void }) { if (!open) return null; return <div className="fixed inset-0 z-50"><div className="absolute inset-0 bg-black/50" onClick={onClose} /><aside className="absolute right-0 top-0 h-full w-[min(560px,100vw)] border-l border-white/10 bg-[#0a0f1a] shadow-[-16px_0_40px_rgba(0,0,0,0.35)] p-5"><div className="flex items-center justify-between"><div className="text-lg font-semibold">{title}</div><button className={pill} onClick={onClose}>Close</button></div><div className="mt-4 space-y-3">{items.map((i)=><div key={i} className={card2 + ' p-3 text-[13px] text-slate-300'}>{i}</div>)}</div></aside></div>; }
