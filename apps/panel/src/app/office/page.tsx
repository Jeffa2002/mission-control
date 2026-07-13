'use client';

/**
 * /office — Digital Office
 *
 * Shows a grid of agent "desks" — avatar, name, status badge, and a
 * small work-area panel showing what the agent is doing.
 *
 * Refreshes every 10 seconds from /api/agents/status (server-side cached 5 s).
 */

import { useEffect, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, card, card2, muted } from '../../components/ops-ui';
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

// ─── Colour + theme helpers ───────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Working: '#33ffcc',
  Idle:    '#ffd060',
  Offline: '#667799',
};

const STATUS_BG: Record<string, string> = {
  Working: 'rgba(51,255,204,0.10)',
  Idle:    'rgba(255,208,96,0.08)',
  Offline: 'rgba(80,100,140,0.08)',
};

const STATUS_BORDER: Record<string, string> = {
  Working: 'rgba(51,255,204,0.30)',
  Idle:    'rgba(255,208,96,0.22)',
  Offline: 'rgba(80,100,140,0.18)',
};

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
  const color = STATUS_COLORS[status] ?? '#667799';
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
            : `radial-gradient(circle at 35% 35%, ${color}22, ${color}08)`,
          border: `2px solid ${isOffline ? 'rgba(80,100,140,0.3)' : color}`,
          boxShadow: isWorking ? `0 0 20px ${color}55` : undefined,
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
            <div style={{ color: '#667799', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>
              No recent activity
            </div>
          ) : (
            <div style={{ marginTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  color: isWorking ? '#33ffcc' : '#ffd060',
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

function DeskCard({ agent }: { agent: AgentStatus }) {
  const color  = STATUS_COLORS[agent.status] ?? '#667799';
  const bg     = STATUS_BG[agent.status]     ?? 'rgba(40,50,70,0.08)';
  const border = STATUS_BORDER[agent.status] ?? 'rgba(80,100,140,0.18)';

  return (
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${border}`,
        background: `linear-gradient(160deg, ${bg}, rgba(255,255,255,0.015))`,
        boxShadow: agent.status === 'Working'
          ? `0 0 0 1px rgba(0,0,0,0.3), 0 0 40px ${color}18`
          : '0 0 0 1px rgba(0,0,0,0.3)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.4s ease, transform 0.2s ease, border-color 0.2s ease',
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
              background: `${color}18`,
              border: `1px solid ${color}55`,
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
    </div>
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
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <AppShell>
      {/* Inject keyframes */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle
            title="Digital Office"
            subtitle="Canonical active roster with allowlisted live work state. No prompts, transcripts, reasoning, or tool payloads."
          />
          <div className="flex flex-col items-end gap-2 text-xs text-slate-400">
            <StatusBadge
              label={loading ? 'syncing' : rosterHealth?.state === 'fresh' ? 'live 10s' : rosterHealth?.state ?? 'unknown'}
              status={loading ? 'info' : rosterHealth?.state === 'fresh' ? 'healthy' : rosterHealth?.state === 'clock-skew' ? 'critical' : 'warning'}
              pulse={!loading && rosterHealth?.state === 'fresh'}
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
            <DeskCard key={agent.id} agent={agent} />
          ))}

          {/* Empty state */}
          {!loading && agents.length === 0 && !err && (
            <div className={card + ' col-span-full p-10 text-center text-sm text-slate-400'}>
              {rosterHealth?.state === 'fresh' ? 'No active agents in the last 20 minutes.' : 'Active roster unavailable until the collector snapshot is fresh.'}
            </div>
          )}
        </div>

        <div className={card2 + ' flex flex-wrap gap-4 p-3 text-xs text-slate-400'}>
          <span><span style={{ color: '#33ffcc' }}>Working</span>: supported task metadata reports active work</span>
          <span><span style={{ color: '#ffd060' }}>Idle</span>: recent metadata heartbeat, no confirmed active task</span>
          {suppressedCount > 0 && <span>{suppressedCount} older alias representation{suppressedCount === 1 ? '' : 's'} suppressed</span>}
          <span className="ml-auto">Source: allowlisted OpenClaw metadata snapshot</span>
        </div>
      </div>
    </AppShell>
  );
}
