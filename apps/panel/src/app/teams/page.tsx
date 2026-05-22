'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell, SectionTitle, StatusBadge as OpsStatusBadge, card, card2, muted } from '../../components/ops-ui';

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

// Stale = last seen more than 7 days ago (168 hours)
function isStale(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const diffH = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return diffH > 168;
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
  const stale = agents.filter((a) => isStale(a.lastSeen));
  const liveRatio = agents.length ? Math.round((working.length / agents.length) * 100) : 0;
  const priority = working[0]?.currentTask
    ? `${working[0].label ?? working[0].id}: ${working[0].currentTask}`
    : stale.length
      ? `${stale.length} inactive agent${stale.length === 1 ? '' : 's'} need review`
      : idle.length
        ? `${idle.length} idle agent${idle.length === 1 ? '' : 's'} available`
        : 'No active operators';

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle
            title="Team Command"
            subtitle="Live operator roster, current work, and stale-session review queue."
          />
          <Link href="/office" className="rounded-[10px] border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-[var(--accent)] transition hover:border-[rgba(103,213,255,0.35)] hover:bg-[rgba(103,213,255,0.08)]">
            Live Office
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
            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.9fr_0.9fr]">
              <div className={card2 + ' p-4'}>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Current Focus</div>
                <div className="mt-2 line-clamp-2 text-[15px] font-semibold leading-6 text-slate-100">{priority}</div>
                <div className={muted + ' mt-2'}>Refresh cadence: 15 seconds</div>
              </div>
              <div className={card2 + ' p-4'}>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Live Load</div>
                <div className="mt-2 flex items-end gap-2">
                  <div className="text-3xl font-bold text-slate-100">{liveRatio}%</div>
                  <div className="pb-1 text-xs text-slate-400">{working.length}/{agents.length} working</div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[var(--sev-healthy)]" style={{ width: `${liveRatio}%` }} />
                </div>
              </div>
              <div className={card2 + ' p-4'}>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Roster State</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <OpsStatusBadge label={`${working.length} working`} status="healthy" pulse={working.length > 0} />
                  <OpsStatusBadge label={`${idle.length} idle`} status="warning" />
                  <OpsStatusBadge label={`${offline.length} offline`} status="neutral" />
                </div>
                {stale.length > 0 ? <div className="mt-3 text-xs text-[var(--sev-warning)]">{stale.length} inactive beyond 7 days</div> : null}
              </div>
            </div>

            {/* Agent grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {agents.map((agent) => {
                const stale = isStale(agent.lastSeen);
                return (
                <Link key={agent.id} href={`/agents/${agent.id}`} style={{ textDecoration: 'none' }}>
                  <div
                    className={card}
                    style={{
                      padding: '16px', cursor: 'pointer',
                      transition: 'background 0.12s, border-color 0.12s',
                      opacity: stale ? 0.6 : 1,
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
                        filter: stale ? 'grayscale(0.7)' : undefined,
                      }}>
                        {agent.emoji ?? '🤖'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {agent.label ?? agent.id}
                          {stale && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 4,
                              background: 'rgba(100,116,139,0.25)', color: '#94a3b8',
                              fontWeight: 600, flexShrink: 0,
                            }}>
                              Inactive
                            </span>
                          )}
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
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
