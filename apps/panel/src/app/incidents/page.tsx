'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, sevPill } from '../../components/ops-ui';
import { AgentProcess, buildIncidents, HealthData, IncidentRecord, incidentChanges, PromAlert, RESTART_THRESHOLD, UiStatus } from './incidents-model';
import styles from './incidents.module.css';

type SourceKey = 'agents' | 'health' | 'alerts';
type SourceState = Record<SourceKey, { ok: boolean; detail: string }>;
type Sample = { observedAt: string; incidents: IncidentRecord[]; sources: SourceState; agents: AgentProcess[]; alerts: PromAlert[] };

const SOURCE_LABELS: Record<SourceKey, string> = { agents: 'Agent mesh', health: 'Health API', alerts: 'Prometheus' };
const EMPTY_SOURCES: SourceState = { agents: { ok: false, detail: 'Not sampled' }, health: { ok: false, detail: 'Not sampled' }, alerts: { ok: false, detail: 'Not sampled' } };

function relTime(iso?: string | null) {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'unknown';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function timeLabel(iso: string) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso)); }
function severityLabel(status: UiStatus) { return status.charAt(0).toUpperCase() + status.slice(1); }
function stateLabel(state: IncidentRecord['state']) { return state.charAt(0).toUpperCase() + state.slice(1); }

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function IncidentButton({ incident, selected, onSelect }: { incident: IncidentRecord; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={styles.incident} data-selected={selected} aria-pressed={selected} onClick={onSelect}>
    <span className={styles.incidentMeta}><StatusBadge label={severityLabel(incident.severity)} status={incident.severity} pulse={incident.severity === 'critical'} /><span className={sevPill(incident.state === 'open' ? 'warning' : 'info')}>{stateLabel(incident.state)}</span><code>{incident.source}</code></span>
    <strong>{incident.title}</strong><span className={styles.incidentCopy}>{incident.detail}</span>
    <span className={styles.incidentFoot}><span>{incident.owner}</span><time dateTime={incident.updatedAt ?? undefined}>{relTime(incident.updatedAt)}</time></span>
  </button>;
}

function Replay({ samples, index, setIndex, selectedId }: { samples: Sample[]; index: number | null; setIndex: (value: number | null) => void; selectedId: string | null }) {
  const currentIndex = index ?? Math.max(0, samples.length - 1);
  const current = samples[currentIndex];
  const previous = currentIndex > 0 ? samples[currentIndex - 1] : null;
  const changes = current && previous ? incidentChanges(previous.incidents, current.incidents) : { opened: current?.incidents ?? [], changed: [], cleared: [] };
  const relevant = [...changes.opened.map((item) => ({ kind: 'Observed', item })), ...changes.changed.map((item) => ({ kind: 'Changed', item })), ...changes.cleared.map((item) => ({ kind: 'Cleared', item }))].filter(({ item }) => !selectedId || item.id === selectedId);
  return <section className={styles.replay} aria-labelledby="replay-title">
    <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Operational Replay</span><h2 id="replay-title">Browser-session observations</h2></div><span className={index === null ? sevPill('healthy') : sevPill('info')}>{index === null ? 'Live' : 'Replay'}</span></div>
    <p className={styles.honesty}>Snapshots begin when this page opens and are not a historical incident log. Refreshing the browser clears them.</p>
    <div className={styles.replayControls}>
      <button type="button" onClick={() => setIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>Previous</button>
      <input aria-label="Replay observation" type="range" min="0" max={Math.max(0, samples.length - 1)} value={currentIndex} onChange={(event) => setIndex(Number(event.target.value))} />
      <button type="button" onClick={() => setIndex(null)} disabled={index === null}>Return live</button>
    </div>
    <div className={styles.replayStamp}>{current ? `Observation ${currentIndex + 1} of ${samples.length} · ${timeLabel(current.observedAt)}` : 'Waiting for first observation'}</div>
    <div className={styles.changeList}>{relevant.length ? relevant.map(({ kind, item }) => <div key={`${kind}-${item.id}`}><span data-kind={kind.toLowerCase()}>{kind}</span><strong>{item.title}</strong></div>) : <p>No selected-signal change in this observation.</p>}</div>
  </section>;
}

export default function IncidentsPage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([fetchJson('/api/agents/status'), fetchJson('/api/health'), fetchJson('/api/alerts')]);
    setSamples((existing) => {
      const prior = existing.at(-1);
      const agents = results[0].status === 'fulfilled' ? results[0].value.agents ?? [] : prior?.agents ?? [];
      const health: HealthData | null = results[1].status === 'fulfilled' ? results[1].value : null;
      const alerts = results[2].status === 'fulfilled' ? results[2].value.data?.alerts ?? [] : prior?.alerts ?? [];
      const source = (key: SourceKey, result: PromiseSettledResult<unknown>) => result.status === 'fulfilled' ? { ok: true, detail: 'Current sample received' } : { ok: false, detail: `Unavailable; ${key === 'health' ? 'health incidents omitted' : 'last successful values retained'}` };
      const sample: Sample = { observedAt: new Date().toISOString(), incidents: buildIncidents(agents, health, alerts), agents, alerts, sources: { agents: source('agents', results[0]), health: source('health', results[1]), alerts: source('alerts', results[2]) } };
      return [...existing, sample].slice(-20);
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, [load]);
  const live = samples.at(-1);
  const sample = replayIndex === null ? live : samples[replayIndex] ?? live;
  const incidents = sample?.incidents ?? [];
  const selected = incidents.find((incident) => incident.id === selectedId) ?? incidents[0] ?? null;
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  const metrics = useMemo(() => ({ critical: incidents.filter((item) => item.severity === 'critical').length, warning: incidents.filter((item) => item.severity === 'warning').length, offline: (sample?.agents ?? []).filter((item) => item.status.toLowerCase() === 'offline').length }), [incidents, sample]);

  return <AppShell><main className={styles.incidents} data-focused={focused}>
    <SectionTitle title="Incidents" subtitle="Focused triage, live signal coverage, and session-scoped operational replay" action={<div className={styles.titleActions}><ToolbarButton onClick={() => setFocused((value) => !value)}>{focused ? 'Exit focus' : 'Focus mode'}</ToolbarButton><ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton></div>} />

    {!focused && <section className={styles.posture} aria-label="Incident posture">
      <article><span>Open signals</span><strong>{incidents.length}</strong><small>{metrics.critical} critical · {metrics.warning} warning</small></article>
      <article><span>Agents offline</span><strong>{metrics.offline}</strong><small>{sample?.agents.length ?? 0} tracked</small></article>
      <article><span>Prometheus alerts</span><strong>{sample?.alerts.length ?? 0}</strong><small>Active API records</small></article>
      <article><span>Observation buffer</span><strong>{samples.length}</strong><small>Maximum 20 in this browser tab</small></article>
    </section>}

    <section className={styles.coverage} aria-label="Source coverage">{(Object.keys(SOURCE_LABELS) as SourceKey[]).map((key) => <div key={key} data-ok={sample?.sources[key].ok ?? false}><span>{SOURCE_LABELS[key]}</span><strong>{sample?.sources[key].ok ? 'Current' : 'Unavailable'}</strong><small>{sample?.sources[key].detail ?? EMPTY_SOURCES[key].detail}</small></div>)}</section>

    <div className={styles.workspace}>
      <section className={styles.queue} aria-labelledby="queue-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>Severity Queue</span><h2 id="queue-title">{replayIndex === null ? 'Live incident signals' : 'Replayed observation'}</h2></div><span>{incidents.length} records</span></div>
        {loading && !samples.length ? <p className={styles.empty}>Loading incident signals…</p> : incidents.length ? incidents.map((incident) => <IncidentButton key={incident.id} incident={incident} selected={selected?.id === incident.id} onSelect={() => setSelectedId(incident.id)} />) : <div className={styles.clear}><strong>No derived incidents</strong><span>Available sources report no degraded health checks, active alerts, offline agents, or restart breaches.</span></div>}
      </section>

      <aside className={styles.detail} aria-live="polite">{selected ? <><div className={styles.detailHead}><div className={styles.incidentMeta}><StatusBadge label={severityLabel(selected.severity)} status={selected.severity} pulse={selected.severity === 'critical'} /><span className={sevPill(selected.state === 'open' ? 'warning' : 'info')}>{stateLabel(selected.state)}</span></div><h2>{selected.title}</h2><p>{selected.source} · owner {selected.owner} · signal {relTime(selected.updatedAt)}</p></div><div className={styles.detailBody}><section><span className={styles.eyebrow}>Recommended Next Action</span><p className={styles.nextAction}>{selected.nextAction}</p></section><section><span className={styles.eyebrow}>Current Evidence</span><div className={styles.evidence}>{selected.evidence.map((item) => <code key={item}>{item}</code>)}</div></section><section><span className={styles.eyebrow}>Evidence Bundle</span><p className={styles.honesty}>Exports available host evidence for the selected time window; it does not acknowledge or close this signal.</p><div className={styles.bundle}><a href="/api/incident/bundle?minutes=30">30 minutes</a><a href="/api/incident/bundle?minutes=60">60 minutes</a><a href="/api/incident/bundle?minutes=240">4 hours</a></div></section></div></> : <div className={styles.empty}>No incident selected.</div>}</aside>
    </div>

    <Replay samples={samples} index={replayIndex} setIndex={setReplayIndex} selectedId={selected?.id ?? null} />

    {!focused && sample?.agents.length ? <section className={styles.watchlist}><div className={styles.panelHeading}><div><span className={styles.eyebrow}>Process Watchlist</span><h2>Tracked agent processes</h2></div></div>{sample.agents.map((agent) => { const restarts = agent.restarts ?? 0; const status: UiStatus = restarts > RESTART_THRESHOLD ? 'critical' : agent.status === 'Working' ? 'healthy' : agent.status === 'Idle' ? 'warning' : 'neutral'; return <div className={styles.process} key={agent.id}><span><strong>{agent.label ?? agent.id}</strong><small>{agent.currentTask ?? `last seen ${relTime(agent.lastSeen)}`}</small></span><code>{restarts} restarts</code><code>{typeof agent.uptime === 'string' ? agent.uptime : agent.uptime ? `${Math.floor(agent.uptime / 60000)}m uptime` : 'uptime unknown'}</code><StatusBadge label={agent.status} status={status} /></div>; })}</section> : null}
  </main></AppShell>;
}
