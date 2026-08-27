'use client';

/**
 * /office — Digital Office
 *
 * Shows a grid of agent "desks" — avatar, name, status badge, and a
 * small work-area panel showing what the agent is doing.
 *
 * Refreshes from authenticated SSE, with the one-minute snapshot poll retained.
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, card, card2, muted } from '../../components/ops-ui';
import { statusColor } from '../../lib/status';
import { buildActiveRoster, type RawAgentStatus, type RosterHealth } from './roster';
import type { SafeWorkProjection } from '../api/agents/status/safe-work-model';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentStatus {
  id: string;
  canonicalId: string;
  sourceId: string;
  sourceIds: string[];
  suppressedSourceIds: string[];
  label: string;
  emoji: string;
  busy: boolean;
  status: 'Working' | 'Idle' | 'Offline';
  lastSeen: string | null;
  currentTask: string | null;
  sessionId: string | null;
  work: SafeWorkProjection | null;
}

interface LiveAgentEvent {
  schemaVersion: 1;
  eventId: string;
  occurredAt: string;
  agentId: string;
  workId: string;
  parentWorkId: string | null;
  kind: string;
  phase: string;
  status: string;
  toolCategory: string | null;
  outcome: string | null;
  blockerCategory: string | null;
  artifactRef: string | null;
  retryCount: number | null;
  summary: string;
}

// ─── Colour + theme helpers ───────────────────────────────────────────────────

const STATUS_COLORS: Record<AgentStatus['status'], string> = {
  Working: statusColor('working'),
  Idle:    statusColor('idle'),
  Offline: statusColor('offline'),
};

/** Alpha-tint a status token colour without breaking CSS variable composition. */
function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function fmtDuration(milliseconds: number | null): string {
  if (milliseconds === null) return 'elapsed unknown';
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return '<1m elapsed';
  if (minutes < 60) return `${minutes}m elapsed`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m elapsed`;
}

// ─── Avatar SVG ───────────────────────────────────────────────────────────────

function AgentAvatar({ emoji, status, busy }: { emoji: string; status: string; busy: boolean }) {
  const color = STATUS_COLORS[status as AgentStatus['status']] ?? statusColor('neutral');
  const isWorking = status === 'Working';
  const isOffline = status === 'Offline';

  return (
    <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
      {/* Circle background */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: isOffline
            ? 'rgba(40,50,70,0.6)'
            : `radial-gradient(circle at 35% 35%, ${tint(color, 13)}, ${tint(color, 3)})`,
          border: `2px solid ${isOffline ? tint(color, 30) : color}`,
          boxShadow: isWorking ? `0 0 20px ${tint(color, 33)}` : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          filter: isOffline ? 'grayscale(0.8) opacity(0.5)' : undefined,
          transition: 'all 0.4s ease',
          // Subtle pulse when working
          animation: isWorking ? 'officeAvatarPulse 2.5s ease-in-out infinite' : undefined,
        }}
      >
        {emoji}
      </div>

      {/* Status dot */}
      <div
        style={{
          position: 'absolute',
          bottom: 3,
          right: 3,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: color,
          border: '2px solid #040814',
          boxShadow: isWorking ? `0 0 8px ${color}` : undefined,
          animation: isWorking ? 'officeDotPulse 1.5s ease-in-out infinite' : undefined,
        }}
      />
    </div>
  );
}

// ─── Computer / Work Area ─────────────────────────────────────────────────────

function WorkArea({ agent }: { agent: AgentStatus }) {
  const isWorking = agent.status === 'Working';
  const isOffline = agent.status === 'Offline';
  const work = agent.work;
  const title = work?.title || work?.goal || 'Declared work unavailable';

  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(0,0,0,0.28)',
        border: '1px solid rgba(124,232,255,0.10)',
        minHeight: 64,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div aria-hidden="true">
          <MonitorSVG active={isWorking} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isOffline && !work ? (
            <div style={{ color: statusColor('offline'), fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>
              No recent activity
            </div>
          ) : (
            <div style={{ marginTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  color: isWorking ? statusColor('working') : statusColor('idle'),
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {work?.status ?? 'unknown'} · {work?.phase ?? 'unknown'}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#bff7ff', fontWeight: 650, overflowWrap: 'anywhere' }}>{title}</div>
              <div style={{ marginTop: 5, fontSize: 10, color: '#9fefff', opacity: 0.72 }}>
                {fmtDuration(work?.elapsedMs ?? null)} · {work?.freshness ?? 'unknown'} freshness
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#b7c8dc' }}>
                {work?.lastEvent ? `${work.lastEvent.category}: ${work.lastEvent.summary}` : 'No safe event available'}
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#8195ad' }}>
                {work?.childCount ?? 0} children · blocker {work?.blockerCategory ?? 'none'} · progress {work?.progress.kind === 'milestones' ? `${work.progress.completed}/${work.progress.total} ${work.progress.unit}` : 'indeterminate'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A tiny inline SVG monitor icon with blinking "screen" when active */
function MonitorSVG({ active }: { active: boolean }) {
  return (
    <svg
      width="32"
      height="28"
      viewBox="0 0 32 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, marginTop: 4 }}
    >
      {/* Monitor body */}
      <rect x="1" y="1" width="30" height="20" rx="3" fill="rgba(0,0,0,0.6)" stroke="rgba(124,232,255,0.3)" strokeWidth="1.2" />
      {/* Screen fill */}
      <rect
        x="3" y="3" width="26" height="16" rx="2"
        fill={active ? 'rgba(51,255,204,0.18)' : 'rgba(40,50,80,0.4)'}
        style={{ transition: 'fill 0.5s ease' }}
      />
      {/* Screen content lines (fake) */}
      {active ? (
        <>
          <rect x="6" y="7"  width="12" height="1.5" rx="0.7" fill="rgba(51,255,204,0.6)" style={{ animation: 'officeLineWave 1.8s ease-in-out infinite' }} />
          <rect x="6" y="11" width="18" height="1.5" rx="0.7" fill="rgba(51,255,204,0.35)" />
          <rect x="6" y="15" width="10" height="1.5" rx="0.7" fill="rgba(51,255,204,0.25)" />
        </>
      ) : (
        <>
          <rect x="6" y="7"  width="12" height="1.5" rx="0.7" fill="rgba(100,130,160,0.25)" />
          <rect x="6" y="11" width="18" height="1.5" rx="0.7" fill="rgba(100,130,160,0.18)" />
          <rect x="6" y="15" width="10" height="1.5" rx="0.7" fill="rgba(100,130,160,0.15)" />
        </>
      )}
      {/* Stand */}
      <rect x="13" y="21" width="6" height="4" rx="1" fill="rgba(124,232,255,0.2)" />
      {/* Base */}
      <rect x="10" y="24" width="12" height="2" rx="1" fill="rgba(124,232,255,0.25)" />
    </svg>
  );
}

// ─── Agent Desk Card ──────────────────────────────────────────────────────────

function DeskCard({ agent, selected, onSelect }: { agent: AgentStatus; selected: boolean; onSelect: () => void }) {
  const color  = STATUS_COLORS[agent.status] ?? statusColor('neutral');
  const bg     = tint(color, 10);
  const border = tint(color, 25);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Open live window for ${agent.label}`}
      style={{
        borderRadius: 18,
        border: `1px solid ${border}`,
        background: `linear-gradient(160deg, ${bg}, rgba(255,255,255,0.015))`,
        boxShadow: agent.status === 'Working'
          ? `0 0 0 1px rgba(0,0,0,0.3), 0 0 40px ${tint(color, 9)}`
          : '0 0 0 1px rgba(0,0,0,0.3)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.4s ease, transform 0.2s ease, border-color 0.2s ease',
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        outline: selected ? `2px solid ${color}` : undefined,
        outlineOffset: selected ? 2 : undefined,
        width: '100%',
      }}
    >
      {/* Header: avatar + name + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <AgentAvatar emoji={agent.emoji} status={agent.status} busy={agent.busy} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: '#d6f6ff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {agent.label}
          </div>
          <div
            style={{
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 9px',
              borderRadius: 999,
              background: tint(color, 9),
              border: `1px solid ${tint(color, 33)}`,
              fontSize: 11,
              fontWeight: 700,
              color,
              letterSpacing: 0.5,
            }}
          >
            {agent.status === 'Working' && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  display: 'inline-block',
                  animation: 'officeDotPulse 1s ease-in-out infinite',
                }}
              />
            )}
            {agent.status}
          </div>
        </div>
      </div>

      {/* Work area */}
      <WorkArea agent={agent} />

      {/* Footer: last seen */}
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: '#9fefff',
          opacity: 0.55,
          textAlign: 'right',
        }}
      >
        {agent.lastSeen ? `Last seen ${fmtRelative(agent.lastSeen)}` : 'No activity'}
      </div>
    </button>
  );
}

function eventTone(kind: string, outcome: string | null) {
  if (kind.includes('failed') || outcome === 'failure') return '#ff7f8e';
  if (kind.includes('approval') || kind.includes('blocker')) return '#ffd060';
  if (kind.includes('completed') || kind.includes('produced')) return '#75e7b3';
  return '#8eb9ec';
}

function LiveWindow({ agent, events, streamConnected }: { agent: AgentStatus; events: LiveAgentEvent[]; streamConnected: boolean }) {
  const [filter, setFilter] = useState<'all' | 'tools' | 'lifecycle'>('all');
  const [follow, setFollow] = useState(true);
  const consoleRef = useRef<HTMLDivElement>(null);
  const agentEvents = useMemo(() => events
    .filter((event) => event.agentId === agent.sourceId || event.agentId === agent.id || event.agentId === agent.canonicalId)
    .filter((event) => filter === 'all' || (filter === 'tools' ? event.kind.startsWith('tool.') : !event.kind.startsWith('tool.')))
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)), [agent, events, filter]);

  useEffect(() => {
    if (follow) consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight, behavior: 'smooth' });
  }, [agentEvents.length, follow]);

  return (
    <section className={card + ' overflow-hidden'} aria-labelledby="agent-window-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(124,232,255,0.12)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-[rgba(124,232,255,0.16)] bg-white/[0.03] text-2xl">{agent.emoji}</span>
          <div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/60">Agent window</div><h2 id="agent-window-title" className="mt-1 text-base font-extrabold text-slate-100">{agent.label} live console</h2></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={streamConnected ? 'stream live' : 'snapshot mode'} status={streamConnected ? 'healthy' : 'warning'} pulse={streamConnected} />
          <Link className="rounded-lg border border-cyan-300/20 px-3 py-2 text-[10px] font-bold text-cyan-200 no-underline hover:bg-cyan-300/10" href={`/agents/${encodeURIComponent(agent.id)}`}>Full profile →</Link>
        </div>
      </header>
      <div className="grid lg:grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)]">
        <aside className="border-b border-[rgba(124,232,255,0.10)] p-5 lg:border-b-0 lg:border-r">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Current assignment</div>
          <p className="mt-3 text-sm font-semibold leading-6 text-cyan-50">{agent.work?.title || agent.work?.goal || agent.currentTask || 'No declared task available'}</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-[10px]">
            <div><dt className="text-slate-500">Phase</dt><dd className="mt-1 font-bold text-slate-200">{agent.work?.phase ?? 'unknown'}</dd></div>
            <div><dt className="text-slate-500">State</dt><dd className="mt-1 font-bold text-slate-200">{agent.work?.status ?? agent.status}</dd></div>
            <div><dt className="text-slate-500">Elapsed</dt><dd className="mt-1 font-bold text-slate-200">{fmtDuration(agent.work?.elapsedMs ?? null)}</dd></div>
            <div><dt className="text-slate-500">Children</dt><dd className="mt-1 font-bold text-slate-200">{agent.work?.childCount ?? 0}</dd></div>
          </dl>
          <div className="mt-5 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[10px] leading-5 text-slate-400">Sanitized event output only. Prompts, reasoning, messages, commands, tool payloads, credentials and transcripts never reach this view.</div>
        </aside>
        <div className="min-w-0 bg-[#05090d]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div className="flex gap-1">{(['all', 'tools', 'lifecycle'] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider ${filter === value ? 'bg-cyan-300/15 text-cyan-200' : 'text-slate-500 hover:text-slate-300'}`}>{value}</button>)}</div>
            <label className="flex cursor-pointer items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-slate-500"><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} /> Auto-follow</label>
          </div>
          <div ref={consoleRef} className="h-[320px] overflow-y-auto px-4 py-3 font-mono text-[11px] leading-5" aria-live="polite">
            {agentEvents.length ? agentEvents.map((event) => <div key={event.eventId} className="grid grid-cols-[72px_10px_minmax(0,1fr)] gap-2 border-b border-white/[0.035] py-1.5"><time className="text-slate-600">{new Date(event.occurredAt).toLocaleTimeString([], { hour12: false })}</time><span style={{ color: eventTone(event.kind, event.outcome) }}>●</span><span className="min-w-0"><strong style={{ color: eventTone(event.kind, event.outcome) }} className="font-semibold">{event.kind}</strong><span className="text-slate-400"> — {event.summary}</span>{event.toolCategory ? <span className="ml-2 text-slate-600">[{event.toolCategory}]</span> : null}</span></div>) : <div className="grid h-full place-items-center text-center text-slate-600"><span>No sanitized events in the current telemetry window.<br />The current-work panel remains available from the snapshot.</span></div>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Floor Plan / Floor Stats ─────────────────────────────────────────────────

function FloorSummary({ agents }: { agents: AgentStatus[] }) {
  const working = agents.filter((a) => a.status === 'Working').length;
  const idle    = agents.filter((a) => a.status === 'Idle').length;
  const lastActive = agents
    .map((a) => a.lastSeen)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className={card2 + ' p-4'}>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Floor Load</div>
        <div className="mt-2 text-2xl font-bold text-slate-100">{agents.length}</div>
        <div className={muted}>Active roster</div>
      </div>
      <div className={card2 + ' p-4'}>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Active</div>
        <div className="mt-2 flex items-center gap-2">
          <div className="text-2xl font-bold text-slate-100">{working}</div>
          <StatusBadge label="working" status="healthy" pulse={working > 0} />
        </div>
        <div className={muted}>Tool activity now</div>
      </div>
      <div className={card2 + ' p-4'}>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Available</div>
        <div className="mt-2 flex items-center gap-2">
          <div className="text-2xl font-bold text-slate-100">{idle}</div>
          <StatusBadge label="idle" status="warning" />
        </div>
        <div className={muted}>Seen within 20 minutes</div>
      </div>
      <div className={card2 + ' p-4'}>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Last Signal</div>
        <div className="mt-2 text-[15px] font-semibold text-slate-100">{lastActive ? fmtRelative(lastActive) : 'No signal'}</div>
        <div className={muted}>Newest agent heartbeat</div>
      </div>
    </div>
  );
}

// ─── Animation keyframes (injected as <style>) ────────────────────────────────

const KEYFRAMES = `
@keyframes officeAvatarPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(51,255,204,0.35); }
  50%       { box-shadow: 0 0 32px rgba(51,255,204,0.65); }
}
@keyframes officeDotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.55; transform: scale(0.82); }
}
@keyframes officeLineWave {
  0%, 100% { width: 12px; }
  40%       { width: 20px; }
  70%       { width: 8px; }
}
`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfficePage() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [lastFetch, setLastFetch] = useState<string>('');
  const [rosterHealth, setRosterHealth] = useState<RosterHealth | null>(null);
  const [suppressedCount, setSuppressedCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collectorState, setCollectorState] = useState<'healthy' | 'stale' | 'unknown'>('unknown');
  const [streamConnected, setStreamConnected] = useState(false);
  const [events, setEvents] = useState<LiveAgentEvent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/agents/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      const roster = buildActiveRoster((j.agents ?? []) as RawAgentStatus[], j.ts);
      setAgents(roster.agents);
      setRosterHealth(roster.health);
      setSuppressedCount(roster.suppressedCount);
      setLastFetch(typeof j.ts === 'string' ? j.ts : '');
      setCollectorState(['healthy', 'stale'].includes(j.telemetry?.status) ? j.telemetry.status : 'unknown');
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchLiveEvents() {
    try {
      const response = await fetch('/api/agents/live', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setEvents(Array.isArray(data.events) ? data.events.slice(-250) : []);
    } catch { /* snapshot fallback remains visible */ }
  }

  useEffect(() => {
    void Promise.all([fetchStatus(), fetchLiveEvents()]);
    const fallback = setInterval(() => void Promise.all([fetchStatus(), fetchLiveEvents()]), 60_000);
    const stream = new EventSource('/api/agents/live/stream');
    stream.addEventListener('telemetry', () => { setStreamConnected(true); void Promise.all([fetchStatus(), fetchLiveEvents()]); });
    stream.onopen = () => setStreamConnected(true);
    stream.onerror = () => setStreamConnected(false);
    return () => { clearInterval(fallback); stream.close(); };
  }, []);

  useEffect(() => {
    if (!agents.length) setSelectedAgentId(null);
    else if (!selectedAgentId || !agents.some((agent) => agent.id === selectedAgentId)) setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId]);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

  return (
    <AppShell>
      {/* Inject keyframes */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle
            title="Digital Office"
            subtitle="Canonical active roster. Select any desk to open a near-real-time window into current work and sanitized event output."
          />
          <div className="flex flex-col items-end gap-2 text-xs text-slate-400">
            <StatusBadge
              label={loading ? 'syncing' : collectorState === 'healthy' && streamConnected ? 'live ≤5s' : collectorState === 'stale' ? 'telemetry stale' : 'telemetry unknown'}
              status={loading ? 'info' : collectorState === 'healthy' && streamConnected ? 'healthy' : 'warning'}
              pulse={!loading && collectorState === 'healthy' && streamConnected}
            />
            {lastFetch ? <span>{new Date(lastFetch).toLocaleTimeString()}</span> : null}
          </div>
        </div>

        {!loading && rosterHealth && rosterHealth.state !== 'fresh' && (
          <div className="rounded-[12px] border border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.08)] p-4 text-sm text-[var(--sev-warning)]" role="status">
            <strong>Roster telemetry {rosterHealth.state}:</strong> {rosterHealth.detail}
            {rosterHealth.futureLastSeenIds.length > 0 && <div className="mt-2 text-xs opacity-80">Excluded future timestamps: {rosterHealth.futureLastSeenIds.join(', ')}</div>}
          </div>
        )}

        {!loading && (collectorState !== 'healthy' || !streamConnected) && (
          <div className="rounded-[12px] border border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.08)] p-4 text-sm text-[var(--sev-warning)]" role="status">
            <strong>Near-real-time telemetry {collectorState === 'stale' ? 'stale' : 'unknown'}.</strong> Showing the one-minute sanitized snapshot fallback; active state is not inferred while the collector is unavailable.
          </div>
        )}

        {/* Floor summary */}
        {agents.length > 0 && <FloorSummary agents={agents} />}

        {err && (
          <div className="rounded-[12px] border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-[var(--sev-critical)]">
            <strong>Error loading agent status:</strong> {err}
            <div className="mt-2 text-xs opacity-80">
              Make sure the panel container has <code>/agent-data</code> mounted from <code>/root/.openclaw/agents</code>.
            </div>
          </div>
        )}

        {/* Agent grid */}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {agents.map((agent) => (
            <DeskCard key={agent.id} agent={agent} selected={agent.id === selectedAgentId} onSelect={() => setSelectedAgentId(agent.id)} />
          ))}

          {/* Empty state */}
          {!loading && agents.length === 0 && !err && (
            <div className={card + ' col-span-full p-10 text-center text-sm text-slate-400'}>
              {rosterHealth?.state === 'fresh' ? 'No active agents in the last 20 minutes.' : 'Active roster unavailable until the collector snapshot is fresh.'}
            </div>
          )}
        </div>

        {selectedAgent ? <LiveWindow agent={selectedAgent} events={events} streamConnected={streamConnected} /> : null}

        <div className={card2 + ' flex flex-wrap gap-4 p-3 text-xs text-slate-400'}>
          <span><span style={{ color: statusColor('working') }}>Working</span>: supported task metadata reports active work</span>
          <span><span style={{ color: statusColor('idle') }}>Idle</span>: recent metadata heartbeat, no confirmed active task</span>
          {suppressedCount > 0 && <span>{suppressedCount} older alias representation{suppressedCount === 1 ? '' : 's'} suppressed</span>}
          <span className="ml-auto">Source: sanitized OpenClaw events + one-minute snapshot fallback</span>
        </div>
      </div>
    </AppShell>
  );
}
