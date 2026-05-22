'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, card, muted, sevPill } from '../../components/ops-ui';

type UiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

interface AuditEvent {
  ts?: string;
  action?: string;
  detail?: string;
  actor?: string;
  result?: string;
  error?: string;
  ip?: string;
  auth_method?: string;
  idempotency_key?: string;
  raw?: string;
  [key: string]: unknown;
}

function relTime(iso: string | undefined) {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'unknown';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function eventStatus(event: AuditEvent): UiStatus {
  if (event.error || event.result === 'error') return 'critical';
  if (event.result === 'blocked') return 'warning';
  if (event.result === 'ok') return 'healthy';
  if ((event.action ?? '').includes('login')) return 'info';
  return 'neutral';
}

function eventSource(event: AuditEvent) {
  if (event.auth_method) return String(event.auth_method);
  if (event.actor) return String(event.actor);
  if (event.ip) return 'network';
  return 'system';
}

function statusLabel(status: UiStatus) {
  if (status === 'critical') return 'Error';
  if (status === 'warning') return 'Blocked';
  if (status === 'healthy') return 'OK';
  if (status === 'info') return 'Info';
  return 'Event';
}

function MetricTile({ label, value, hint, status }: { label: string; value: string; hint: string; status: UiStatus }) {
  return (
    <div className={card + ' p-5'}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <StatusBadge label={statusLabel(status)} status={status} pulse={status === 'critical'} />
      </div>
      <div className="text-[28px] font-extrabold leading-none text-slate-50">{value}</div>
      <div className={muted + ' mt-2'}>{hint}</div>
    </div>
  );
}

function EventRow({
  event,
  active,
  onSelect,
}: {
  event: AuditEvent;
  active: boolean;
  onSelect: (event: AuditEvent) => void;
}) {
  const status = eventStatus(event);
  const source = eventSource(event);

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="grid w-full grid-cols-[130px_1fr_auto] gap-4 border-b border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/[0.025]"
      style={{ background: active ? 'rgba(103,213,255,0.07)' : undefined, borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent' }}
    >
      <div className="font-mono text-[11px] text-slate-500">
        <div>{event.ts ? new Date(event.ts).toLocaleTimeString() : '-'}</div>
        <div className="mt-1">{relTime(event.ts)}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge label={statusLabel(status)} status={status} pulse={status === 'critical'} />
          <span className={sevPill(source === 'hmac' ? 'healthy' : source === 'session' ? 'info' : 'neutral')}>{source}</span>
          {event.ip && event.ip !== 'unknown' ? <span className="font-mono text-[11px] text-slate-500">{event.ip}</span> : null}
        </div>
        <div className="truncate text-[14px] font-bold text-slate-100">{event.action ?? event.raw ?? 'unknown action'}</div>
        <div className="mt-1 truncate text-[12px] text-slate-500">{event.error ?? event.detail ?? 'no detail'}</div>
      </div>
      <div className="text-right text-[11px] text-slate-500">
        <div>{event.actor ? String(event.actor) : 'system'}</div>
        <div className="mt-1">{event.idempotency_key ? 'idempotent' : 'single'}</div>
      </div>
    </button>
  );
}

function DetailPanel({ event }: { event: AuditEvent | null }) {
  if (!event) {
    return (
      <aside className={card + ' p-5'}>
        <div className="text-[13px] font-bold text-slate-100">Event Detail</div>
        <div className={muted + ' mt-2'}>Select an audit event to inspect the raw payload.</div>
      </aside>
    );
  }

  const status = eventStatus(event);
  const entries = Object.entries(event).filter(([, value]) => value !== undefined && value !== '');

  return (
    <aside className={card + ' overflow-hidden'}>
      <div className="border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-2">
          <StatusBadge label={statusLabel(status)} status={status} pulse={status === 'critical'} />
          <span className={sevPill('info')}>{eventSource(event)}</span>
        </div>
        <div className="text-[15px] font-extrabold text-slate-50">{event.action ?? event.raw ?? 'unknown action'}</div>
        <div className="mt-1 text-[12px] text-slate-500">{event.ts ?? 'no timestamp'}</div>
      </div>
      <div className="space-y-2 p-4">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">{key}</div>
            <div className="mt-1 break-words font-mono text-[11px] text-slate-300">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function ActionsPage() {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/actions?limit=200', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, []);

  const sources = useMemo(() => Array.from(new Set(items.map(eventSource))).sort(), [items]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((event) => {
      const status = eventStatus(event);
      const source = eventSource(event);
      const blob = JSON.stringify(event).toLowerCase();
      return (!q || blob.includes(q))
        && (resultFilter === 'all' || status === resultFilter || event.result === resultFilter)
        && (sourceFilter === 'all' || source === sourceFilter);
    });
  }, [items, query, resultFilter, sourceFilter]);

  const selected = filtered[selectedIndex] ?? filtered[0] ?? null;
  const errors = items.filter((event) => eventStatus(event) === 'critical').length;
  const blocked = items.filter((event) => eventStatus(event) === 'warning').length;
  const sessions = items.filter((event) => eventSource(event) === 'session').length;
  const machine = items.filter((event) => eventSource(event) === 'hmac').length;

  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(0);
  }, [filtered.length, selectedIndex]);

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionTitle
          title="Audit Log"
          subtitle="Searchable forensic event stream with result, source, actor, and payload detail"
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

        {error ? (
          <div className={card + ' border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.07)] p-4'}>
            <div className="text-sm font-semibold text-[var(--sev-critical)]">Audit stream unavailable</div>
            <div className={muted + ' mt-1'}>{error}</div>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Events Loaded" value={loading ? '-' : String(items.length)} hint={`${filtered.length} visible after filters`} status="info" />
          <MetricTile label="Errors" value={loading ? '-' : String(errors)} hint="events with error result or error payload" status={errors ? 'critical' : 'healthy'} />
          <MetricTile label="Blocked" value={loading ? '-' : String(blocked)} hint="operator or guardrail blocked events" status={blocked ? 'warning' : 'healthy'} />
          <MetricTile label="Source Mix" value={`${sessions}/${machine}`} hint="session / hmac events" status="neutral" />
        </section>

        <section className={card + ' p-4'}>
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search action, detail, actor, IP, idempotency key..."
              className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-[rgba(103,213,255,0.45)]"
            />
            <select
              value={resultFilter}
              onChange={(event) => setResultFilter(event.target.value)}
              className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-[13px] text-slate-100 outline-none"
            >
              <option value="all">All results</option>
              <option value="healthy">OK</option>
              <option value="critical">Errors</option>
              <option value="warning">Blocked</option>
              <option value="info">Info</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-[13px] text-slate-100 outline-none"
            >
              <option value="all">All sources</option>
              {sources.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
            <ToolbarButton onClick={() => { setQuery(''); setResultFilter('all'); setSourceFilter('all'); }}>Clear</ToolbarButton>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
          <section className={card + ' overflow-hidden'}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
              <div>
                <div className="text-[13px] font-bold text-slate-100">Event Stream</div>
                <div className="mt-1 text-[12px] text-slate-500">Newest first, compact enough for repeated forensic scans</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={sevPill('critical')}>{errors} errors</span>
                <span className={sevPill('warning')}>{blocked} blocked</span>
                <span className={sevPill('info')}>{sources.length} sources</span>
              </div>
            </div>
            {loading ? (
              <div className="p-8 text-center text-[13px] text-slate-500">Loading audit stream...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-slate-500">No events match the current filters.</div>
            ) : (
              <div className="max-h-[720px] overflow-auto">
                {filtered.map((event, index) => (
                  <EventRow
                    key={`${event.ts ?? 'event'}-${index}`}
                    event={event}
                    active={selected === event}
                    onSelect={() => setSelectedIndex(index)}
                  />
                ))}
              </div>
            )}
          </section>

          <DetailPanel event={selected} />
        </div>
      </div>
    </AppShell>
  );
}
