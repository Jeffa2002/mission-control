'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, StatusBadge } from '../../components/ops-ui';
import styles from './agent-activity.module.css';

type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';
type EventItem = {
  eventId: string;
  occurredAt: string;
  agentId: string;
  workId: string;
  parentWorkId: string | null;
  kind: string;
  phase: string | null;
  status: string | null;
  toolCategory: string | null;
  outcome: string | null;
  blockerCategory: string | null;
  artifactRef: string | null;
  retryCount: number | null;
  summary: string;
};
type WorkItem = {
  workId: string;
  parentWorkId: string | null;
  agentId: string;
  source: string;
  title: string | null;
  goal: string | null;
  status: string;
  phase: string;
  startedAt: string | null;
  lastEventAt: string | null;
  elapsedMs: number | null;
  freshness: string;
  lastEvent: { category: string; summary: string };
  childCount: number;
  blockerCategory: string | null;
  terminal: boolean;
};
type Payload = {
  generatedAt: string;
  collector: { status: 'healthy' | 'stale' | 'unknown'; startedAt: string | null; heartbeatAt: string | null; lastEventAt: string | null; rejectedEvents: number };
  events: EventItem[];
  work?: WorkItem[];
};
type Window = '1h' | '24h' | 'all';
type Selection = { kind: 'event'; id: string } | { kind: 'work'; id: string } | null;

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_for_tool', 'waiting_for_approval', 'blocked', 'retrying']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const relative = (value: string | null) => {
  if (!value) return 'never';
  const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
  return seconds < 60 ? 'just now' : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h ago` : `${Math.floor(seconds / 86400)}d ago`;
};
const time = (value: string) => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Perth', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
const duration = (value: number | null) => {
  if (value == null) return 'unknown';
  const seconds = Math.floor(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};
const label = (value: string | null | undefined) => value && value !== 'unknown' ? value.replaceAll('_', ' ') : 'unknown';
const eventCategory = (kind: string) => kind.split('.')[0] || 'event';
const cutoffFor = (window: Window) => window === 'all' ? -Infinity : Date.now() - (window === '1h' ? 3_600_000 : 86_400_000);
const eventTone = (event: EventItem): Tone => {
  if (event.outcome === 'error' || event.outcome === 'failure' || event.status === 'failed' || event.kind.includes('failed')) return 'bad';
  if (event.kind.includes('blocker') || event.kind.includes('approval') || event.status?.startsWith('waiting') || event.status === 'blocked' || event.status === 'retrying') return 'warn';
  if (event.outcome === 'success' || event.status === 'completed' || event.kind.includes('completed')) return 'good';
  return 'info';
};
const workTone = (work: WorkItem): Tone => {
  if (work.status === 'failed') return 'bad';
  if (work.status === 'blocked' || work.status.startsWith('waiting') || work.status === 'retrying' || work.freshness === 'stale') return 'warn';
  if (work.status === 'completed') return 'good';
  if (ACTIVE_STATUSES.has(work.status)) return 'info';
  return 'neutral';
};

function countBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function Metric({ label: metricLabel, value, detail }: { label: string; value: string | number; detail: string }) {
  return <article><span>{metricLabel}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function MiniBar({ label: barLabel, count, max }: { label: string; count: number; max: number }) {
  return <div className={styles.bar}><span>{label(barLabel)}</span><div><i style={{ width: `${max ? Math.max(8, (count / max) * 100) : 0}%` }} /></div><b>{count}</b></div>;
}

function DetailInspector({ selection, events, work }: { selection: Selection; events: EventItem[]; work: WorkItem[] }) {
  const selectedEvent = selection?.kind === 'event' ? events.find((event) => event.eventId === selection.id) ?? null : null;
  const selectedWork = selection?.kind === 'work' ? work.find((item) => item.workId === selection.id) ?? null : selectedEvent ? work.find((item) => item.workId === selectedEvent.workId) ?? null : null;
  const workEvents = selectedWork ? events.filter((event) => event.workId === selectedWork.workId).slice(0, 12) : [];

  if (!selectedEvent && !selectedWork) {
    return <aside className={styles.inspector}><p>INSPECTOR</p><h2>Select activity</h2><span>Choose a work item or event to inspect timing, state, safe IDs, and related metadata.</span></aside>;
  }

  return <aside className={styles.inspector}>
    <p>{selectedEvent ? 'EVENT DETAIL' : 'WORK DETAIL'}</p>
    <h2>{selectedEvent?.summary ?? selectedWork?.lastEvent.summary ?? 'Selected activity'}</h2>
    <div className={styles.detailGrid}>
      {selectedEvent ? <>
        <div><span>Agent</span><b>{selectedEvent.agentId}</b></div>
        <div><span>Kind</span><b>{label(selectedEvent.kind)}</b></div>
        <div><span>When</span><b>{time(selectedEvent.occurredAt)}</b></div>
        <div><span>Age</span><b>{relative(selectedEvent.occurredAt)}</b></div>
        <div><span>Status</span><b>{label(selectedEvent.status)}</b></div>
        <div><span>Outcome</span><b>{label(selectedEvent.outcome)}</b></div>
        <div><span>Tool category</span><b>{label(selectedEvent.toolCategory)}</b></div>
        <div><span>Blocker</span><b>{label(selectedEvent.blockerCategory)}</b></div>
        <div><span>Retry</span><b>{selectedEvent.retryCount ?? 0}</b></div>
        <div><span>Artifact</span><b>{selectedEvent.artifactRef ?? 'none'}</b></div>
      </> : null}
      {selectedWork ? <>
        <div><span>Work ID</span><b>{selectedWork.workId}</b></div>
        <div><span>Parent</span><b>{selectedWork.parentWorkId ?? 'none'}</b></div>
        <div><span>Source</span><b>{label(selectedWork.source)}</b></div>
        <div><span>Phase</span><b>{label(selectedWork.phase)}</b></div>
        <div><span>Elapsed</span><b>{duration(selectedWork.elapsedMs)}</b></div>
        <div><span>Freshness</span><b>{label(selectedWork.freshness)}</b></div>
        <div><span>Children</span><b>{selectedWork.childCount}</b></div>
        <div><span>Terminal</span><b>{selectedWork.terminal ? 'yes' : 'no'}</b></div>
      </> : null}
    </div>
    {selectedWork ? <div className={styles.relatedEvents}><h3>Related events</h3>{workEvents.length ? workEvents.map((event) => <div key={event.eventId} data-tone={eventTone(event)}><span>{relative(event.occurredAt)}</span><b>{label(event.kind)}</b><small>{event.summary}</small></div>) : <small>No retained events are attached to this work ID.</small>}</div> : null}
  </aside>;
}

export default function AgentActivityPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agent, setAgent] = useState('all');
  const [kind, setKind] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [status, setStatus] = useState('all');
  const [window, setWindow] = useState<Window>('24h');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    try {
      const response = await fetch('/api/agents/live', { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      setData(await response.json());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); const timer = setInterval(() => load(true), 15_000); return () => clearInterval(timer); }, [load]);

  const events = useMemo(() => [...(data?.events ?? [])].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)), [data]);
  const work = useMemo(() => [...(data?.work ?? [])].sort((a, b) => Date.parse(b.lastEventAt ?? '') - Date.parse(a.lastEventAt ?? '')), [data]);
  const cutoff = cutoffFor(window);
  const windowedEvents = useMemo(() => events.filter((event) => Date.parse(event.occurredAt) >= cutoff), [events, cutoff]);
  const windowedWork = useMemo(() => work.filter((item) => Date.parse(item.lastEventAt ?? item.startedAt ?? '') >= cutoff), [work, cutoff]);
  const agents = useMemo(() => [...new Set([...events.map((event) => event.agentId), ...work.map((item) => item.agentId)])].sort(), [events, work]);
  const kinds = useMemo(() => [...new Set(events.map((event) => event.kind))].sort(), [events]);
  const statuses = useMemo(() => [...new Set([...events.map((event) => event.status).filter(Boolean) as string[], ...work.map((item) => item.status)])].sort(), [events, work]);
  const outcomes = useMemo(() => [...new Set(events.map((event) => event.outcome).filter(Boolean) as string[])].sort(), [events]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return windowedEvents.filter((event) =>
      (agent === 'all' || event.agentId === agent) &&
      (kind === 'all' || event.kind === kind) &&
      (outcome === 'all' || event.outcome === outcome) &&
      (status === 'all' || event.status === status) &&
      (!needle || `${event.agentId} ${event.kind} ${event.summary} ${event.toolCategory ?? ''} ${event.workId} ${event.parentWorkId ?? ''} ${event.phase ?? ''} ${event.status ?? ''} ${event.outcome ?? ''}`.toLowerCase().includes(needle))
    ).slice(0, 500);
  }, [agent, kind, outcome, query, status, windowedEvents]);

  const filteredWork = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return windowedWork.filter((item) =>
      (agent === 'all' || item.agentId === agent) &&
      (status === 'all' || item.status === status) &&
      (!needle || `${item.agentId} ${item.workId} ${item.parentWorkId ?? ''} ${item.status} ${item.phase} ${item.source} ${item.lastEvent?.summary ?? ''}`.toLowerCase().includes(needle))
    );
  }, [agent, query, status, windowedWork]);

  const activeAgents = new Set([...filtered.map((event) => event.agentId), ...filteredWork.map((item) => item.agentId)]).size;
  const failures = filtered.filter((event) => eventTone(event) === 'bad').length;
  const blockers = filtered.filter((event) => eventTone(event) === 'warn').length;
  const activeWork = filteredWork.filter((item) => ACTIVE_STATUSES.has(item.status) && item.freshness !== 'stale').length;
  const staleWork = filteredWork.filter((item) => item.freshness === 'stale').length;
  const terminalWork = filteredWork.filter((item) => TERMINAL_STATUSES.has(item.status)).length;
  const kindCounts = countBy(filtered, (event) => event.kind).slice(0, 8);
  const toolCounts = countBy(filtered.filter((event) => event.toolCategory), (event) => event.toolCategory).slice(0, 8);
  const maxKindCount = Math.max(0, ...kindCounts.map(([, count]) => count), ...toolCounts.map(([, count]) => count));
  const agentRows = agents.map((agentId) => {
    const agentEvents = windowedEvents.filter((event) => event.agentId === agentId);
    const agentWork = windowedWork.filter((item) => item.agentId === agentId);
    const latest = agentWork[0]?.lastEventAt ?? agentEvents[0]?.occurredAt ?? null;
    return {
      agentId,
      latest,
      eventCount: agentEvents.length,
      workCount: agentWork.length,
      activeCount: agentWork.filter((item) => ACTIVE_STATUSES.has(item.status) && item.freshness !== 'stale').length,
      issueCount: agentEvents.filter((event) => ['bad', 'warn'].includes(eventTone(event))).length + agentWork.filter((item) => ['bad', 'warn'].includes(workTone(item))).length,
    };
  }).filter((row) => row.eventCount || row.workCount).sort((a, b) => Date.parse(b.latest ?? '') - Date.parse(a.latest ?? ''));

  return <AppShell><main className={styles.page}>
    <header className={styles.header}>
      <div><p>AGENT OBSERVABILITY</p><h1>Agent Activity</h1><span>Privacy-safe lifecycle, work, blocker, retry, and tool-category telemetry from Bazza.</span></div>
      <div className={styles.live}><StatusBadge label={data?.collector.status === 'healthy' ? 'Live - 15s' : data?.collector.status ?? 'Connecting'} status={data?.collector.status === 'healthy' ? 'healthy' : 'warning'} pulse={data?.collector.status === 'healthy'} /><small>Heartbeat {relative(data?.collector.heartbeatAt ?? null)}</small><button type="button" onClick={() => load(true)} disabled={refreshing}>{refreshing ? 'Refreshing' : 'Refresh'}</button></div>
    </header>

    {error ? <div className={styles.error}>Agent telemetry: {error}</div> : null}

    <section className={styles.stats}>
      <Metric label="Visible events" value={loading ? '-' : filtered.length.toLocaleString()} detail="newest 500 after filters" />
      <Metric label="Active work" value={loading ? '-' : activeWork} detail={`${terminalWork} terminal in window`} />
      <Metric label="Agents" value={loading ? '-' : activeAgents} detail="reporting in selected window" />
      <Metric label="Warnings" value={loading ? '-' : blockers} detail="approval, blocker, wait, retry" />
      <Metric label="Failures" value={loading ? '-' : failures} detail="error outcomes and failed states" />
      <Metric label="Rejected" value={loading ? '-' : data?.collector.rejectedEvents ?? 0} detail={`${staleWork} stale work projections`} />
    </section>

    <section className={styles.filters}>
      <div className={styles.windows}>{(['1h', '24h', 'all'] as Window[]).map((value) => <button type="button" key={value} aria-pressed={window === value} onClick={() => setWindow(value)}>{value === 'all' ? 'Retained' : value.toUpperCase()}</button>)}</div>
      <input aria-label="Search agent activity" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search summary, work ID, category..." />
      <select aria-label="Filter agent" value={agent} onChange={(event) => setAgent(event.target.value)}><option value="all">All agents</option>{agents.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter event kind" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All event kinds</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="all">All outcomes</option>{outcomes.map((value) => <option key={value}>{value}</option>)}</select>
      <button type="button" onClick={() => { setAgent('all'); setKind('all'); setOutcome('all'); setStatus('all'); setWindow('24h'); setQuery(''); }}>Clear</button>
    </section>

    <section className={styles.overview}>
      <article className={styles.panel}>
        <div className={styles.panelHead}><div><p>AGENT POSTURE</p><h2>Who is doing what</h2></div><span>{agentRows.length} visible</span></div>
        <div className={styles.agentTable}>{agentRows.length ? agentRows.slice(0, 12).map((row) => <button type="button" key={row.agentId} onClick={() => setAgent(row.agentId)}><b>{row.agentId}</b><span>{row.activeCount ? `${row.activeCount} active` : `${row.workCount} work`}</span><small>{row.eventCount} events</small><em data-hot={row.issueCount > 0}>{row.issueCount ? `${row.issueCount} review` : relative(row.latest)}</em></button>) : <div className={styles.empty}>No agent telemetry in this window.</div>}</div>
      </article>
      <article className={styles.panel}>
        <div className={styles.panelHead}><div><p>WORK CONTEXT</p><h2>Current and recent work</h2></div><span>{filteredWork.length} items</span></div>
        <div className={styles.workList}>{filteredWork.length ? filteredWork.slice(0, 10).map((item) => <button type="button" key={item.workId} data-tone={workTone(item)} data-selected={selection?.kind === 'work' && selection.id === item.workId} onClick={() => setSelection({ kind: 'work', id: item.workId })}><span><b>{item.agentId}</b><em>{label(item.status)}</em><em>{label(item.phase)}</em></span><strong>{item.lastEvent?.summary ?? item.title ?? 'Work activity'}</strong><small>{item.workId} · {duration(item.elapsedMs)} · last {relative(item.lastEventAt)}</small></button>) : <div className={styles.empty}>No retained work matches the filters.</div>}</div>
      </article>
      <article className={styles.panel}>
        <div className={styles.panelHead}><div><p>EVENT MIX</p><h2>Shape of activity</h2></div><span>{filtered.length} events</span></div>
        <div className={styles.bars}>{kindCounts.length ? kindCounts.map(([value, count]) => <MiniBar key={value} label={value} count={count} max={maxKindCount} />) : <div className={styles.empty}>No event mix loaded.</div>}</div>
        {toolCounts.length ? <><h3>Tool categories</h3><div className={styles.bars}>{toolCounts.map(([value, count]) => <MiniBar key={value} label={value} count={count} max={maxKindCount} />)}</div></> : null}
      </article>
    </section>

    <section className={styles.workspace}>
      <section className={styles.log}>
        <div className={styles.logHead}><div><p>ALLOWLISTED EVENT STREAM</p><h2>Recent agent events</h2></div><span>{events.length.toLocaleString()} retained · last event {relative(data?.collector.lastEventAt ?? null)}</span></div>
        {loading ? <div className={styles.empty}>Loading activity...</div> : filtered.length ? <div className={styles.rows}>{filtered.map((event) => <article key={event.eventId} data-tone={eventTone(event)} data-selected={selection?.kind === 'event' && selection.id === event.eventId} onClick={() => setSelection({ kind: 'event', id: event.eventId })} tabIndex={0} onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter' || keyEvent.key === ' ') setSelection({ kind: 'event', id: event.eventId }); }}>
          <time>{time(event.occurredAt)}<small>{relative(event.occurredAt)}</small></time>
          <span className={styles.dot} />
          <div className={styles.body}><div><b>{event.agentId}</b><em>{eventCategory(event.kind)}</em><em>{label(event.kind)}</em>{event.toolCategory ? <em>{label(event.toolCategory)}</em> : null}{event.outcome ? <em>{label(event.outcome)}</em> : null}</div><strong>{event.summary}</strong><small>Work {event.workId}{event.parentWorkId ? ` · parent ${event.parentWorkId}` : ''}{event.phase && event.phase !== 'unknown' ? ` · ${label(event.phase)}` : ''}{event.status ? ` · ${label(event.status)}` : ''}</small></div>
        </article>)}</div> : <div className={styles.empty}>No retained events match these filters.</div>}
      </section>
      <DetailInspector selection={selection} events={events} work={work} />
    </section>

    <footer>Only declared metadata is shown: time, agent, lifecycle kind, tool category, outcome, phase, status, sanitized summary, opaque work IDs, and work rollups. Prompts, reasoning, commands, arguments, tool results, secrets, environment data, and transcript text are rejected by the collector schema.</footer>
  </main></AppShell>;
}
