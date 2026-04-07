'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export function cn(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(' '); }
export const card = 'rounded-[14px] border border-white/10 bg-[#111827] shadow-[0_12px_30px_rgba(0,0,0,0.28)]';
export const card2 = 'rounded-[14px] border border-white/10 bg-[#172033]';
export const pill = 'inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200';
export const muted = 'text-[13px] text-slate-400';

export function hostPill(host: 'bazza' | 'prod') { return host === 'bazza' ? 'text-[#7c8cff] border-[#7c8cff]/30 bg-[#7c8cff]/10' : 'text-[#ff9f43] border-[#ff9f43]/30 bg-[#ff9f43]/10'; }
export function sevPill(sev: string) { const map: Record<string,string> = { healthy:'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10', warning:'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10', critical:'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10', info:'text-[#22d3ee] border-[#22d3ee]/30 bg-[#22d3ee]/10', neutral:'text-slate-300 border-white/10 bg-white/5'}; return cn(pill, map[sev] ?? map.neutral); }

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [health, setHealth] = useState<any>(null);
  const [updated, setUpdated] = useState('');
  const items = [
    ['/','Overview'], ['/security','Threats'], ['/incidents','Incidents'], ['/systems','Systems'], ['/apps','Agents'], ['/actions','Audit Log'],
  ];
  useEffect(() => { let alive=true; const load=async()=>{ try{ const r=await fetch('/api/health',{cache:'no-store'}); if(r.ok) setHealth(await r.json()); setUpdated(new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})); }catch{} }; load(); const t=setInterval(load, 30000); return ()=>{alive=false; clearInterval(t);} }, []);
  const alerts = health?.checks ? Object.values(health.checks).filter((c:any)=>c.status==='error' || c.status==='degraded').length : 0;
  return <div className="min-h-screen bg-[#06080d] text-slate-100"><div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)]"><aside className="border-r border-white/10 bg-[#0b1020] px-4 py-5"><div className="mb-6"><div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Mission Control</div><div className="mt-1 text-[24px] font-semibold">Security Console</div></div><nav className="space-y-6 text-[14px]">{items.map(([href,label]) => <Link key={href} href={href} className={cn('block rounded-[12px] px-3 py-2 transition', path===href || (href!=='/' && path.startsWith(href)) ? 'bg-white/8 text-white border border-white/10' : 'text-slate-300 hover:bg-white/5')}>{label}</Link>)}<div className="pt-2"><div className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">Context</div><div className="flex gap-2"><span className={cn(pill,'border-[#7c8cff]/30 bg-[#7c8cff]/10')}>bazza</span><span className={cn(pill,'border-[#ff9f43]/30 bg-[#ff9f43]/10')}>prod</span></div></div></nav></aside><div><header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1020]/90 backdrop-blur-xl"><div className="h-1 bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 opacity-80" /><div className="flex items-center justify-between gap-4 px-6 py-3 xl:px-8"><div className="flex items-center gap-3 text-sm text-slate-300"><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1"><span className="h-2 w-2 rounded-full bg-[#22c55e]" />{alerts} open alerts</span><span>refreshed {updated || '—'}</span><span className="text-slate-500">•</span><span className="text-slate-200">prod</span></div><div className="flex items-center gap-2"><input className="w-56 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-[#8ddcff]" placeholder="Search IP, user, path" /><button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">Refresh</button></div></div></header><main className="px-6 py-6 xl:px-8">{children}</main></div></div></div>;
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) { return <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-[18px] font-semibold tracking-tight text-slate-100">{title}</h2>{subtitle ? <p className="text-[13px] text-slate-400">{subtitle}</p> : null}</div>{action}</div>; }

export function Metric({ label, value, delta }: { label: string; value: string; delta?: string }) { return <div className={cn(card,'p-5')}><div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div><div className="mt-3 text-[32px] leading-[38px] font-semibold">{value}</div>{delta ? <div className="mt-2 text-[13px] text-slate-400">{delta}</div> : null}</div>; }
