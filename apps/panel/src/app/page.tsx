'use client';

import { useEffect, useState } from 'react';
import { AppShell, Metric, SectionTitle, card, muted } from '../components/ops-ui';

// ─── Types ─────────────────────────────────────────────────────────────────

interface AgentStatusItem {
  id: string;
  label?: string;
  emoji?: string;
  status: 'Working' | 'Idle' | 'Offline' | 'working' | 'idle' | 'offline';
  busy?: boolean;
  uptime?: string;
  restarts?: number;
  pm_id?: number;
}

interface HealthData {
  ok: boolean;
  overall: 'green' | 'amber' | 'red';
  checks: Record<string, { status: string; detail?: string }>;
  checked_at: string;
}

interface EffectxApp {
  id: string;
  name: string;
  emoji: string;
  url: string;
  status: 'up' | 'degraded' | 'down' | 'unknown';
  latencyMs?: number;
  ssl?: { daysRemaining: number; valid: boolean };
}

interface Deploy {
  id: string;
  app: string;
  repo: string;
  commit: string;
  commitMsg: string;
  branch: string;
  status: 'success' | 'failure' | 'running';
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  durationS?: number;
}

interface ShazzaData {
  ok: boolean;
  reachable: boolean;
  memory?: { used_pct?: number; usedMb?: number; totalMb?: number; pct?: number } | null;
  disk?: { used_pct?: number; pct?: string } | null;
  uptime?: { pretty?: string | null; since?: string | null } | string | null;
  error?: string;
}

// ─── Helper components ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'up' | 'degraded' | 'down' | 'unknown' }) {
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    up: { label: 'Online', color: 'var(--sev-healthy)', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
    degraded: { label: 'Degraded', color: 'var(--sev-warning)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
    down: { label: 'Down', color: 'var(--sev-critical)', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
    unknown: { label: 'Unknown', color: 'var(--text-3)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.10)' },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  );
}

function ServerCard({ label, memPct, diskPct, uptime, online }: {
  label: string;
  memPct?: number;
  diskPct?: number;
  uptime?: string;
  online: boolean;
}) {
  const barColor = (pct?: number) => {
    if (!pct) return 'var(--sev-healthy)';
    if (pct > 90) return 'var(--sev-critical)';
    if (pct > 75) return 'var(--sev-warning)';
    return 'var(--sev-healthy)';
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{label}</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 700,
          color: online ? 'var(--sev-healthy)' : 'var(--sev-critical)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: online ? 'var(--sev-healthy)' : 'var(--sev-critical)',
            display: 'inline-block',
          }} />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      {online ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {memPct !== undefined && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>
                <span>Memory</span><span>{memPct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ width: `${Math.min(memPct, 100)}%`, height: '100%', borderRadius: 2, background: barColor(memPct), transition: 'width 0.4s' }} />
              </div>
            </div>
          )}
          {diskPct !== undefined && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>
                <span>Disk</span><span>{diskPct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ width: `${Math.min(diskPct, 100)}%`, height: '100%', borderRadius: 2, background: barColor(diskPct), transition: 'width 0.4s' }} />
              </div>
            </div>
          )}
          {uptime && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Up {uptime}</div>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Unreachable</div>
      )}
    </div>
  );
}

function deployStatusColor(s: string) {
  if (s === 'success') return 'var(--sev-healthy)';
  if (s === 'failure') return 'var(--sev-critical)';
  return 'var(--sev-warning)';
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatUptime(ms: number) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [agents, setAgents] = useState<AgentStatusItem[]>([]);
  const [effectx, setEffectx] = useState<EffectxApp[] | null>(null);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [shazza, setShazza] = useState<ShazzaData | null>(null);
  const [overviewTs, setOverviewTs] = useState<string | null>(null);

  useEffect(() => {
    const loadAll = async () => {
      fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()).then(setHealth).catch(() => {});
      fetch('/api/agents/status', { cache: 'no-store' }).then((r) => r.json()).then((j) => setAgents(j.agents ?? [])).catch(() => {});
      fetch('/api/effectx', { cache: 'no-store' }).then((r) => r.json()).then((j) => setEffectx(j.apps ?? [])).catch(() => {});
      fetch('/api/deploys', { cache: 'no-store' }).then((r) => r.json()).then((j) => setDeploys((j.deploys ?? []).slice(0, 5))).catch(() => {});
      fetch('/api/shazza', { cache: 'no-store' }).then((r) => r.json()).then(setShazza).catch(() => {});
      fetch('/api/overview', { cache: 'no-store' }).then((r) => r.json()).then((j) => setOverviewTs(j.ts ?? null)).catch(() => {});
    };
    loadAll();
    const t = setInterval(loadAll, 30_000);
    return () => clearInterval(t);
  }, []);

  // Derived metrics
  const alertCount = health?.checks
    ? Object.values(health.checks).filter((c) => c.status === 'error' || c.status === 'degraded').length
    : 0;
  const overallHealth = health?.overall ?? 'amber';
  const liveAgents = agents.filter((a) => {
    const s = (a.status ?? '').toLowerCase();
    return s === 'working';
  }).length;
  const totalAgents = agents.length;
  const panicLatched = health?.checks?.['panic_latch']?.status === 'error';
  const appOk = health?.checks?.['app']?.status === 'ok';
  const systemStatus = panicLatched ? 'PANIC' : overallHealth === 'green' ? 'Nominal' : overallHealth === 'amber' ? 'Degraded' : 'Critical';
  const systemStatusMetricStatus = panicLatched ? 'critical' : overallHealth === 'green' ? 'healthy' : overallHealth === 'amber' ? 'warning' : 'critical';

  // PM2 processes from agent data
  const pm2Processes = agents.filter((a) => a.pm_id !== undefined || a.restarts !== undefined || a.uptime !== undefined);

  return (
    <AppShell>
      <div className="space-y-8">
        {/* ── Metric row ─────────────────────────────────────────────────── */}
        <section className="grid gap-4 lg:grid-cols-5">
          <Metric
            label="Open alerts"
            value={health ? String(alertCount) : '—'}
            delta={alertCount > 0 ? `${alertCount} check${alertCount !== 1 ? 's' : ''} degraded` : 'All checks passing'}
            status={alertCount > 0 ? (alertCount >= 3 ? 'critical' : 'warning') : 'healthy'}
          />
          <Metric
            label="System status"
            value={health ? systemStatus : '—'}
            delta={health?.checked_at ? `checked ${new Date(health.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : undefined}
            status={systemStatusMetricStatus as any}
          />
          <Metric
            label="Panel"
            value={appOk ? 'Online' : health ? 'Error' : '—'}
            delta={health?.checks?.['app']?.detail ?? undefined}
            status={appOk ? 'healthy' : 'critical'}
          />
          <Metric
            label="Agents live"
            value={totalAgents > 0 ? `${liveAgents} / ${totalAgents}` : '—'}
            delta={liveAgents > 0 ? `${liveAgents} working` : totalAgents > 0 ? 'All idle' : 'No agents found'}
            status={liveAgents > 0 ? 'healthy' : 'neutral'}
          />
          <Metric
            label="Panic latch"
            value={panicLatched ? 'LATCHED' : health ? 'Clear' : '—'}
            delta={health?.checks?.['panic_latch']?.detail ?? undefined}
            status={panicLatched ? 'critical' : 'healthy'}
          />
        </section>

        {/* ── App Health grid ─────────────────────────────────────────────── */}
        <section>
          <SectionTitle title="App Health" subtitle="Live status of all Effectx suite apps" />
          {effectx === null ? (
            <div className={card + ' p-6 text-center ' + 'text-slate-400 text-sm'}>Loading app health…</div>
          ) : effectx.length === 0 ? (
            <div className={card + ' p-6 text-center text-slate-400 text-sm'}>No apps configured</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {effectx.map((app) => (
                <a
                  key={app.id}
                  href={app.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    className={card}
                    style={{
                      padding: '14px 16px',
                      cursor: 'pointer',
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{app.emoji}</span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{app.name}</span>
                      </div>
                      <StatusBadge status={app.status} />
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-3)' }}>
                      {app.latencyMs !== undefined && (
                        <span>{app.latencyMs}ms</span>
                      )}
                      {app.ssl?.daysRemaining !== undefined && (
                        <span style={{ color: app.ssl.daysRemaining < 14 ? 'var(--sev-warning)' : 'var(--text-3)' }}>
                          SSL {app.ssl.daysRemaining}d
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* ── Server Health + Recent Deploys ──────────────────────────────── */}
        <section className="grid gap-4 xl:grid-cols-2">
          {/* Server Health */}
          <div className={card + ' p-5'}>
            <SectionTitle title="Server Health" subtitle="Memory · Disk · Uptime" />
            <div className="grid gap-3 sm:grid-cols-2">
              {/* bazza — this machine, always online */}
              <ServerCard
                label="bazza"
                online={true}
                uptime={undefined}
              />
              {/* prod */}
              <ServerCard
                label="prod"
                online={health?.checks?.['app']?.status === 'ok'}
                uptime={undefined}
              />
              {/* shazza */}
              <ServerCard
                label="shazza"
                online={shazza?.reachable ?? false}
                memPct={shazza?.memory ? (shazza.memory.used_pct ?? undefined) : undefined}
                diskPct={shazza?.disk ? (shazza.disk.used_pct ?? undefined) : undefined}
                uptime={typeof shazza?.uptime === 'string' ? shazza.uptime : (shazza?.uptime as any)?.pretty ?? undefined}
              />
              {/* crm8 — check health endpoint */}
              <ServerCard
                label="crm8"
                online={false}
              />
            </div>
          </div>

          {/* Recent Deploys */}
          <div className={card + ' p-5'}>
            <SectionTitle title="Recent Deploys" subtitle="Last 5 deployments" />
            {deploys.length === 0 ? (
              <div className={'text-sm ' + muted}>No deployments recorded yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {deploys.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: deployStatusColor(d.status),
                      boxShadow: `0 0 6px ${deployStatusColor(d.status)}`,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.app}
                        {d.commitMsg && <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 6 }}>— {d.commitMsg.slice(0, 40)}{d.commitMsg.length > 40 ? '…' : ''}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {d.branch} · {d.triggeredBy} · {relTime(d.startedAt)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      color: deployStatusColor(d.status),
                      background: d.status === 'success' ? 'rgba(34,197,94,0.08)' : d.status === 'failure' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                      border: `1px solid ${deployStatusColor(d.status)}40`,
                      textTransform: 'capitalize',
                    }}>
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── PM2 processes ───────────────────────────────────────────────── */}
        <section className={card + ' p-5'}>
          <SectionTitle title="PM2 Processes" subtitle="Agent process status from agent-data" />
          {agents.length === 0 ? (
            <div className={'text-sm ' + muted}>No process data available — agent-status.json not found</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {agents.map((a) => {
                const statusStr = (a.status ?? '').toLowerCase();
                const isOnline = statusStr === 'working' || statusStr === 'idle';
                const dotColor = statusStr === 'working' ? 'var(--sev-healthy)' : statusStr === 'idle' ? 'var(--sev-warning)' : 'var(--text-3)';
                return (
                  <div
                    key={a.id}
                    style={{
                      padding: '10px 12px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      {a.emoji && <span style={{ fontSize: 15 }}>{a.emoji}</span>}
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{a.label ?? a.id}</span>
                      <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: dotColor, boxShadow: `0 0 5px ${dotColor}`, display: 'inline-block' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                      <span style={{ textTransform: 'capitalize' }}>{a.status}</span>
                      {a.restarts !== undefined && <span>↺ {a.restarts}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {overviewTs && <div className="mt-4 text-[12px] text-slate-500">API online · {overviewTs}</div>}
        </section>
      </div>
    </AppShell>
  );
}
