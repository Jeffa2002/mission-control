'use client';

import { useEffect, useState } from 'react';
import { AppShell, card, muted } from '../../../components/ops-ui';
import Link from 'next/link';

interface AgentStatus {
  id: string;
  label: string;
  emoji: string;
  busy: boolean;
  status: 'Working' | 'Idle' | 'Offline';
  lastSeen: string | null;
  currentTask: string | null;
  sessionId: string | null;
  role?: string;
  model?: string;
}

const STATUS_COLORS: Record<string, string> = {
  Working: '#33ffcc',
  Idle:    '#ffd060',
  Offline: '#667799',
};

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5)  return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setAgentId(p.id));
  }, [params]);

  useEffect(() => {
    if (!agentId) return;
    async function load() {
      try {
        const res = await fetch('/api/agents/status', { cache: 'no-store' });
        if (!res.ok) throw new Error(await res.text());
        const j = await res.json();
        const agents: AgentStatus[] = j.agents ?? [];
        // H4: Override status if last_seen is stale (> 1 hour)
        const now = Date.now();
        const found = agents.find((a) => a.id === agentId);
        if (found) {
          if (found.status === 'Working' && found.lastSeen) {
            const diffH = (now - new Date(found.lastSeen).getTime()) / 3_600_000;
            if (diffH > 1) {
              setAgent({ ...found, status: 'Offline' });
              return;
            }
          }
          setAgent(found);
        } else {
          setErr(`Agent "${agentId}" not found.`);
        }
      } catch (e: any) {
        setErr(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [agentId]);

  const color = agent ? (STATUS_COLORS[agent.status] ?? '#667799') : '#667799';

  return (
    <AppShell>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/teams"
          style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', opacity: 0.8 }}
        >
          ← Back to Team
        </Link>
      </div>

      {loading && (
        <div className={card + ' p-8 text-center text-slate-400 text-sm'}>
          Loading agent data…
        </div>
      )}

      {err && (
        <div className={card + ' p-6'}>
          <div style={{ color: 'var(--sev-warning)', fontWeight: 600, marginBottom: 6 }}>Agent not found</div>
          <div className={muted}>{err}</div>
          <div style={{ marginTop: 12 }}>
            <Link href="/teams" style={{ color: 'var(--accent)', fontSize: 13 }}>← View all team members</Link>
          </div>
        </div>
      )}

      {agent && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header card */}
          <div className={card + ' p-6'} style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 44,
                background: `radial-gradient(circle at 35% 35%, ${color}22, ${color}08)`,
                border: `2px solid ${color}`,
                boxShadow: agent.status === 'Working' ? `0 0 24px ${color}55` : undefined,
              }}
            >
              {agent.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text-1)' }}>
                {agent.label}
              </h1>
              {agent.role && (
                <div style={{ fontSize: 14, color: 'var(--text-3)', marginTop: 4 }}>{agent.role}</div>
              )}
              <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: `${color}18`,
                    border: `1px solid ${color}55`,
                    fontSize: 12,
                    fontWeight: 700,
                    color,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: color,
                      display: 'inline-block',
                    }}
                  />
                  {agent.status}
                </span>
                {agent.lastSeen && (
                  <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>
                    Last seen {fmtRelative(agent.lastSeen)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Current task */}
          {agent.currentTask && (
            <div className={card + ' p-5'}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 8 }}>
                Current Task
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.6 }}>
                {agent.currentTask}
              </div>
            </div>
          )}

          {/* Details */}
          <div className={card + ' p-5'}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 12 }}>
              Agent Details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['ID', agent.id],
                ['Status', agent.status],
                ['Last Seen', agent.lastSeen ? new Date(agent.lastSeen).toLocaleString() : 'Never'],
                ...(agent.model ? [['Model', agent.model]] : []),
                ...(agent.sessionId ? [['Session', agent.sessionId]] : []),
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text-3)' }}>{k}</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 500, fontFamily: k === 'ID' || k === 'Session' ? 'monospace' : undefined }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <Link href="/office" style={{ fontSize: 13, color: 'var(--accent)', opacity: 0.8 }}>
              View in Digital Office →
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
