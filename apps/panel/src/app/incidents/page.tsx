'use client';

import { useEffect, useState } from 'react';
import { AppShell, Metric, SectionTitle, card, muted } from '../../components/ops-ui';

interface AgentProcess {
  id: string;
  label?: string;
  emoji?: string;
  status: string;
  busy?: boolean;
  restarts?: number;
  uptime?: number | string;
  lastSeen?: string | null;
  currentTask?: string | null;
  pm_id?: number;
}

interface Incident {
  id: string;
  label: string;
  emoji: string;
  restarts: number;
  status: string;
  lastSeen: string | null;
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatUptime(uptime: number | string | undefined): string {
  if (!uptime) return '—';
  if (typeof uptime === 'string') return uptime;
  const ms = uptime;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function statusColor(s: string): string {
  const l = s.toLowerCase();
  if (l === 'working') return 'var(--sev-healthy)';
  if (l === 'idle') return 'var(--sev-warning)';
  return 'var(--sev-critical)';
}

const RESTART_THRESHOLD = 5;

export default function IncidentsPage() {
  const [agents, setAgents] = useState<AgentProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState<string>('');

  const load = async () => {
    try {
      const r = await fetch('/api/agents/status', { cache: 'no-store' });
      const j = await r.json();
      setAgents(j.agents ?? []);
      setTs(j.ts ?? new Date().toISOString());
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const incidents: Incident[] = agents
    .filter((a) => (a.restarts ?? 0) > RESTART_THRESHOLD)
    .map((a) => ({
      id: a.id,
      label: a.label ?? a.id,
      emoji: a.emoji ?? '🤖',
      restarts: a.restarts ?? 0,
      status: a.status ?? 'Offline',
      lastSeen: a.lastSeen ?? null,
    }));

  const stableCount = agents.length - incidents.length;
  const offlineCount = agents.filter((a) => (a.status ?? '').toLowerCase() === 'offline').length;

  return (
    <AppShell>
      <div className="space-y-8">
        <SectionTitle title="Incidents" subtitle="PM2 crash events and high-restart processes" />

        {/* Metric row */}
        <section className="grid gap-4 md:grid-cols-4">
          <Metric
            label="Flagged processes"
            value={loading ? '—' : String(incidents.length)}
            delta={incidents.length > 0 ? `>${RESTART_THRESHOLD} restarts` : 'None flagged'}
            status={incidents.length > 0 ? 'critical' : 'healthy'}
          />
          <Metric
            label="Stable processes"
            value={loading ? '—' : String(stableCount)}
            delta={stableCount > 0 ? `≤${RESTART_THRESHOLD} restarts` : 'No data'}
            status={stableCount > 0 ? 'healthy' : 'neutral'}
          />
          <Metric
            label="Offline"
            value={loading ? '—' : String(offlineCount)}
            delta={offlineCount === 0 ? 'All processes reachable' : `${offlineCount} unreachable`}
            status={offlineCount > 0 ? 'warning' : 'healthy'}
          />
          <Metric
            label="Total tracked"
            value={loading ? '—' : String(agents.length)}
            delta={ts ? `updated ${relTime(ts)}` : undefined}
            status="neutral"
          />
        </section>

        {/* Incident list */}
        {loading ? (
          <div className={card + ' p-8 text-center text-slate-400 text-sm'}>
            Loading process data…
          </div>
        ) : incidents.length === 0 ? (
          <div className={card + ' p-10'}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 42 }}>✅</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--sev-healthy)' }}>All systems stable</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 360 }}>
                No processes have exceeded {RESTART_THRESHOLD} restarts.{' '}
                {agents.length > 0
                  ? `${agents.length} process${agents.length !== 1 ? 'es' : ''} are running normally.`
                  : 'No process data available — check agent-status.json.'}
              </div>
            </div>
          </div>
        ) : (
          <div className={card + ' p-5'}>
            <SectionTitle
              title="Flagged processes"
              subtitle={`Processes with more than ${RESTART_THRESHOLD} restarts`}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                    alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 12,
                    background: 'rgba(239,68,68,0.04)',
                    border: '1px solid rgba(239,68,68,0.20)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{inc.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{inc.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        Last seen: {relTime(inc.lastSeen)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-3)' }}>
                    <span>
                      <span style={{ color: 'var(--sev-critical)', fontWeight: 700, fontSize: 15 }}>{inc.restarts}</span>
                      {' '}restarts
                    </span>
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 12px', borderRadius: 999,
                    fontSize: 12, fontWeight: 700,
                    color: statusColor(inc.status),
                    background: `${statusColor(inc.status)}14`,
                    border: `1px solid ${statusColor(inc.status)}40`,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(inc.status), display: 'inline-block' }} />
                    {inc.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All processes table */}
        {!loading && agents.length > 0 && (
          <div className={card + ' p-5'}>
            <SectionTitle title="All processes" subtitle="Current state of every tracked agent/process" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {agents.map((a) => {
                const flagged = (a.restarts ?? 0) > RESTART_THRESHOLD;
                return (
                  <div
                    key={a.id}
                    style={{
                      display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
                      alignItems: 'center', gap: 12,
                      padding: '8px 12px', borderRadius: 8,
                      background: flagged ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${flagged ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{a.emoji ?? '🤖'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{a.label ?? a.id}</span>
                    <span style={{ fontSize: 12, color: (a.restarts ?? 0) > RESTART_THRESHOLD ? 'var(--sev-critical)' : 'var(--text-3)' }}>
                      ↺ {a.restarts ?? 0}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      color: statusColor(a.status), background: `${statusColor(a.status)}14`,
                      border: `1px solid ${statusColor(a.status)}30`,
                    }}>
                      {a.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
