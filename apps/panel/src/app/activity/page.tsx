'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, card, muted, sevPill } from '../../components/ops-ui';

type UiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

interface ActivityItem {
  id: string;
  ts: string;
  source: string;
  title: string;
  detail: string;
  severity: UiStatus;
  href?: string;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'unknown';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function label(status: UiStatus) {
  if (status === 'critical') return 'Critical';
  if (status === 'warning') return 'Warning';
  if (status === 'healthy') return 'OK';
  if (status === 'info') return 'Info';
  return 'Signal';
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const inner = (
    <div className="grid grid-cols-[130px_1fr_auto] gap-4 border-b border-white/10 px-4 py-3 transition-colors hover:bg-white/[0.025]">
      <div className="font-mono text-[11px] text-slate-500">
        <div>{new Date(item.ts).toLocaleTimeString()}</div>
        <div className="mt-1">{relTime(item.ts)}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge label={label(item.severity)} status={item.severity} pulse={item.severity === 'critical'} />
          <span className={sevPill(item.source === 'deploys' ? 'info' : item.source === 'agent mesh' ? 'healthy' : 'neutral')}>{item.source}</span>
        </div>
        <div className="truncate text-[14px] font-bold text-slate-100">{item.title}</div>
        <div className="mt-1 truncate text-[12px] text-slate-500">{item.detail}</div>
      </div>
      <div className="self-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Open</div>
    </div>
  );

  return item.href ? <Link href={item.href}>{inner}</Link> : inner;
}

function MetricTile({ labelText, value, hint, status }: { labelText: string; value: string; hint: string; status: UiStatus }) {
  return (
    <div className={card + ' p-5'}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{labelText}</div>
        <StatusBadge label={label(status)} status={status} pulse={status === 'critical'} />
      </div>
      <div className="text-[28px] font-extrabold leading-none text-slate-50">{value}</div>
      <div className={muted + ' mt-2'}>{hint}</div>
    </div>
  );
}

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [ts, setTs] = useState('');

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/activity?limit=100', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items ?? []);
      setTs(data.ts ?? new Date().toISOString());
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const blob = `${item.title} ${item.detail} ${item.source}`.toLowerCase();
      return (!q || blob.includes(q)) && (filter === 'all' || item.severity === filter || item.source === filter);
    });
  }, [items, query, filter]);

  const critical = items.filter((item) => item.severity === 'critical').length;
  const warning = items.filter((item) => item.severity === 'warning').length;
  const healthy = items.filter((item) => item.severity === 'healthy').length;
  const sources = Array.from(new Set(items.map((item) => item.source))).sort();

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionTitle
          title="Unified Activity"
          subtitle="Audit events, deployments, and agent signals in one operational timeline"
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

        {error ? (
          <div className={card + ' border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.07)] p-4'}>
            <div className="text-sm font-semibold text-[var(--sev-critical)]">Activity stream unavailable</div>
            <div className={muted + ' mt-1'}>{error}</div>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile labelText="Signals" value={loading ? '-' : String(items.length)} hint={`${filtered.length} visible after filters`} status="info" />
          <MetricTile labelText="Critical" value={loading ? '-' : String(critical)} hint="error events, failed deploys, or hot agents" status={critical ? 'critical' : 'healthy'} />
          <MetricTile labelText="Warnings" value={loading ? '-' : String(warning)} hint="blocked events, running deploys, offline agents" status={warning ? 'warning' : 'healthy'} />
          <MetricTile labelText="Nominal" value={loading ? '-' : String(healthy)} hint={ts ? `updated ${relTime(ts)}` : 'waiting for stream'} status="healthy" />
        </section>

        <section className={card + ' p-4'}>
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, detail, source..."
              className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-[rgba(103,213,255,0.45)]"
            />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-[13px] text-slate-100 outline-none"
            >
              <option value="all">All signals</option>
              <option value="critical">Critical</option>
              <option value="warning">Warnings</option>
              <option value="healthy">OK</option>
              {sources.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
            <ToolbarButton onClick={() => { setQuery(''); setFilter('all'); }}>Clear</ToolbarButton>
          </div>
        </section>

        <section className={card + ' overflow-hidden'}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
            <div>
              <div className="text-[13px] font-bold text-slate-100">Live Timeline</div>
              <div className="mt-1 text-[12px] text-slate-500">Newest first, linked back to the owning Mission Control surface</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={sevPill('critical')}>{critical} critical</span>
              <span className={sevPill('warning')}>{warning} warning</span>
              <span className={sevPill('healthy')}>{healthy} ok</span>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-[13px] text-slate-500">Loading activity stream...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-[17px] font-bold text-[var(--sev-healthy)]">No matching activity</div>
              <div className={muted + ' mx-auto mt-2 max-w-md'}>Clear filters or wait for the next telemetry refresh.</div>
            </div>
          ) : (
            <div>
              {filtered.map((item) => <ActivityRow key={item.id} item={item} />)}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
