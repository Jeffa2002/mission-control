'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell, SectionTitle, card, muted } from '../../components/ops-ui';

interface Agent {
  id: string;
  label?: string;
  emoji?: string;
  role?: string;
  model?: string;
  status: string;
  busy?: boolean;
  lastSeen?: string | null;
  currentTask?: string | null;
}

export const dynamic = 'force-dynamic';

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase();
  const cfg = s === 'working'
    ? { label: 'Working', color: 'var(--sev-healthy)', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.25)' }
    : s === 'idle'
      ? { label: 'Idle', color: 'var(--sev-warning)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.20)' }
      : { label: 'Offline', color: 'var(--text-3)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)' };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}

export default function TeamsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await fetch('/api/agents/status', { cache: 'no-store' });
      const j = await r.json();
      setAgents(j.agents ?? []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const working = agents.filter((a) => (a.status ?? '').toLowerCase() === 'working');
  const idle = agents.filter((a) => (a.status ?? '').toLowerCase() === 'idle');
  const offline = agents.filter((a) => (a.status ?? '').toLowerCase() === 'offline');

  return (
    <AppShell>
      <div className="space-y-8">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SectionTitle
            title="Agent Crew"
            subtitle="Live status of every agent — updates every 15 seconds"
          />
          <Link href="/office" style={{
            textDecoration: 'none', fontSize: 13, fontWeight: 600,
            color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            Live Office →
          </Link>
        </div>

        {loading ? (
          <div className={card + ' p-8 text-center text-slate-400 text-sm'}>Loading agent data…</div>
        ) : agents.length === 0 ? (
          <div className={card + ' p-8 text-center'}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>No agents found</div>
            <div className={'mt-2 text-sm ' + muted}>
              agent-status.json not found or empty. Agents appear here when running.
            </div>
          </div>
        ) : (
          <>
            {/* Summary row */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{
                padding: '8px 16px', borderRadius: 10,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)',
                fontSize: 13, fontWeight: 600, color: 'var(--sev-healthy)',
              }}>
                {working.length} Working
              </div>
              <div style={{
                padding: '8px 16px', borderRadius: 10,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)',
                fontSize: 13, fontWeight: 600, color: 'var(--sev-warning)',
              }}>
                {idle.length} Idle
              </div>
              <div style={{
                padding: '8px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)',
                fontSize: 13, fontWeight: 600, color: 'var(--text-3)',
              }}>
                {offline.length} Offline
              </div>
            </div>

            {/* Agent grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {agents.map((agent) => (
                <Link key={agent.id} href="/office" style={{ textDecoration: 'none' }}>
                  <div
                    className={card}
                    style={{
                      padding: '16px', cursor: 'pointer',
                      transition: 'background 0.12s, border-color 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = '';
                      (e.currentTarget as HTMLElement).style.borderColor = '';
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'rgba(103,213,255,0.08)', border: '1px solid rgba(103,213,255,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
                      }}>
                        {agent.emoji ?? '🤖'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {agent.label ?? agent.id}
                        </div>
                        {agent.role && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{agent.role}</div>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <StatusBadge status={agent.status} />

                    {/* Model */}
                    {agent.model && (
                      <div style={{
                        marginTop: 10, fontSize: 11,
                        color: 'var(--accent)', opacity: 0.8,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {agent.model}
                      </div>
                    )}

                    {/* Current task */}
                    {agent.currentTask && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                        <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>Now: </span>
                        {agent.currentTask.length > 60
                          ? agent.currentTask.slice(0, 60) + '…'
                          : agent.currentTask}
                      </div>
                    )}

                    {/* Last seen */}
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
                      Last seen: {relTime(agent.lastSeen)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
