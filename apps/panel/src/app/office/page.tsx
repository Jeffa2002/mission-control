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
import { Nav } from '../nav';
import { AgentActivityDrawer } from '../../components/AgentActivityDrawer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentStatus {
  id: string;
  label: string;
  emoji: string;
  busy: boolean;
  status: 'Working' | 'Idle' | 'Offline';
  lastSeen: string | null;
  currentTask: string | null;
  sessionId: string | null;
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

function WorkArea({ agent, onOpen }: { agent: AgentStatus; onOpen: (agent: AgentStatus) => void }) {
  const isWorking = agent.status === 'Working';
  const isIdle    = agent.status === 'Idle';
  const isOffline = agent.status === 'Offline';

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
      {/* Monitor SVG */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(agent); }}
          aria-label={`Open activity for ${agent.label}`}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            borderRadius: 8,
            outline: 'none',
          }}
        >
          <MonitorSVG active={isWorking} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isOffline ? (
            <div style={{ color: '#667799', fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>
              Away from desk
            </div>
          ) : isIdle ? (
            <div style={{ color: '#ffd060', fontSize: 12, marginTop: 4 }}>
              💤 Idle
              {agent.currentTask && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: '#9fefff',
                    opacity: 0.7,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={agent.currentTask}
                >
                  Last: {agent.currentTask}
                </div>
              )}
            </div>
          ) : (
            // Working
            <div style={{ marginTop: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#33ffcc',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#33ffcc',
                    animation: 'officeDotPulse 1s ease-in-out infinite',
                  }}
                />
                Working
              </div>
              {agent.currentTask && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    color: '#bff7ff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%',
                  }}
                  title={agent.currentTask}
                >
                  {agent.currentTask}
                </div>
              )}
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

function DeskCard({ agent, onOpen }: { agent: AgentStatus; onOpen: (agent: AgentStatus) => void }) {
  const color  = STATUS_COLORS[agent.status] ?? '#667799';
  const bg     = STATUS_BG[agent.status]     ?? 'rgba(40,50,70,0.08)';
  const border = STATUS_BORDER[agent.status] ?? 'rgba(80,100,140,0.18)';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(agent)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(agent); }}
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
        cursor: 'pointer',
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
      <WorkArea agent={agent} onOpen={onOpen} />

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
  const offline = agents.filter((a) => a.status === 'Offline').length;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        marginTop: 16,
        marginBottom: 6,
      }}
    >
      {[
        { label: 'Working', count: working, color: '#33ffcc' },
        { label: 'Idle',    count: idle,    color: '#ffd060' },
        { label: 'Offline', count: offline, color: '#667799' },
      ].map(({ label, count, color }) => (
        <div
          key={label}
          style={{
            padding: '6px 16px',
            borderRadius: 999,
            border: `1px solid ${color}44`,
            background: `${color}0e`,
            fontSize: 12,
            fontWeight: 700,
            color,
            letterSpacing: 0.5,
          }}
        >
          {count} {label}
        </div>
      ))}
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
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/agents/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setAgents(j.agents ?? []);
      setLastFetch(j.ts ?? new Date().toISOString());
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

  const BG = 'radial-gradient(1200px 700px at 20% 10%, rgba(0,255,255,0.14), transparent 60%), radial-gradient(1000px 600px at 80% 30%, rgba(0,140,255,0.12), transparent 55%), radial-gradient(900px 600px at 50% 80%, rgba(140,0,255,0.10), transparent 60%), linear-gradient(180deg, #040814 0%, #030513 55%, #02030a 100%)';

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 24,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#d6f6ff',
        background: BG,
      }}
    >
      {/* Inject keyframes */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <div style={{ letterSpacing: 3, fontSize: 12, color: '#7ce8ff', opacity: 0.9 }}>MISSION CONTROL</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 34, textShadow: '0 0 18px rgba(0,220,255,0.25)' }}>
            Digital Office
          </h1>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#9fefff' }}>
          <div>{loading ? 'syncing…' : 'live · 10s refresh'}</div>
          {lastFetch && (
            <div style={{ opacity: 0.7, marginTop: 4 }}>
              {new Date(lastFetch).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      <Nav />

      {/* Floor summary */}
      {agents.length > 0 && <FloorSummary agents={agents} />}

      {err && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid rgba(255,80,120,0.35)',
            background: 'rgba(255,40,90,0.08)',
            color: '#ff7aa8',
            fontSize: 13,
          }}
        >
          <strong>Error loading agent status:</strong> {err}
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>
            Make sure the panel container has <code>/agent-data</code> mounted from{' '}
            <code>/root/.openclaw/agents</code>. See <code>apps/docker-compose.yml</code>.
          </div>
        </div>
      )}

      {/* Agent grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          marginTop: 18,
        }}
      >
        {agents.map((agent) => (
          <DeskCard key={agent.id} agent={agent} onOpen={setSelectedAgent} />
        ))}

        {/* Empty state */}
        {!loading && agents.length === 0 && !err && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', opacity: 0.5, padding: 40 }}>
            No agents found. Check the <code>/agent-data</code> mount.
          </div>
        )}
      </div>

      <AgentActivityDrawer
        agent={selectedAgent}
        open={!!selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />

      {/* Legend */}
      <div
        style={{
          marginTop: 32,
          padding: '10px 16px',
          borderRadius: 10,
          border: '1px solid rgba(124,232,255,0.10)',
          background: 'rgba(0,0,0,0.2)',
          fontSize: 11,
          color: '#9fefff',
          opacity: 0.7,
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <span>
          <span style={{ color: '#33ffcc' }}>● Working</span> — active toolCall in last 45 s
        </span>
        <span>
          <span style={{ color: '#ffd060' }}>● Idle</span> — last activity 45 s–20 min ago
        </span>
        <span>
          <span style={{ color: '#667799' }}>● Offline</span> — no activity in 20+ min
        </span>
        <span style={{ marginLeft: 'auto' }}>Source: <code>/agent-data/{'{agent}'}/sessions/*.jsonl</code></span>
      </div>
    </main>
  );
}
