'use client';

import { useEffect, useState } from 'react';
import { AppShell, Metric, SectionTitle, card, muted } from '../components/ops-ui';
import { AlertTriageCard, BaselineIndicator, SystemHealthCard, ThreatTimeline, LogViewer } from '../components/security-components';

interface AgentStatusItem {
  id: string;
  status: 'Working' | 'Idle' | 'Offline';
  busy: boolean;
}

interface HealthData {
  ok: boolean;
  overall: 'green' | 'amber' | 'red';
  checks: Record<string, { status: string; detail?: string }>;
  checked_at: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [agents, setAgents] = useState<AgentStatusItem[]>([]);
  const [overviewTs, setOverviewTs] = useState<string | null>(null);

  useEffect(() => {
    const loadAll = async () => {
      // Health data
      fetch('/api/health', { cache: 'no-store' })
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => {});

      // Agent status
      fetch('/api/agents/status', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => setAgents(j.agents ?? []))
        .catch(() => {});

      // Overview API (for timestamp)
      fetch('/api/overview', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => setOverviewTs(j.ts ?? null))
        .catch(() => {});
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

  const liveAgents = agents.filter((a) => a.status === 'Working').length;
  const totalAgents = agents.length;

  const panicLatched = health?.checks?.['panic_latch']?.status === 'error';
  const appOk = health?.checks?.['app']?.status === 'ok';

  const systemStatus = panicLatched ? 'PANIC' : overallHealth === 'green' ? 'Nominal' : overallHealth === 'amber' ? 'Degraded' : 'Critical';
  const systemStatusMetricStatus = panicLatched ? 'critical' : overallHealth === 'green' ? 'healthy' : overallHealth === 'amber' ? 'warning' : 'critical';

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Metric cards — wired to live data */}
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

        {/* Health + anomaly summary */}
        <section className="grid gap-4 xl:grid-cols-2">
          <div className={card + ' p-5'}>
            <SectionTitle title="Threat summary" subtitle="What changed and why it matters" />
            <div className="space-y-3">
              <div className="text-[15px] font-semibold">Critical SSH bursts from mixed geos</div>
              <div className={muted}>Top IPs cluster around repeated auth failures and path probing.</div>
              <BaselineIndicator state="alert" reason="+38% auth failures vs baseline" />
            </div>
          </div>
          <div className={card + ' p-5'}>
            <SectionTitle title="Health summary" subtitle="Baseline vs anomaly" />
            <div className="grid gap-3 md:grid-cols-2">
              <SystemHealthCard host="bazza" state="healthy" summary="Stable, within expected range" anomalies={['CPU 4% above baseline', 'No auth spikes']} />
              <SystemHealthCard host="prod" state="degraded" summary="Auth and disk IO elevated" anomalies={['+38% failures vs baseline', 'Disk IO 2.1× baseline']} />
            </div>
          </div>
        </section>

        {/* Incidents + timeline */}
        <section className="grid gap-4 xl:grid-cols-2">
          <ThreatTimeline />
          <div className={card + ' p-5'}>
            <SectionTitle title="Latest incidents" />
            <div className="space-y-3">
              <AlertTriageCard title="Repeated SSH authentication failures" host="prod" severity="critical" evidence={['44 failed attempts in 8m', 'source 185.193.*.*', 'touching /root and /etc/ssh']} />
              <AlertTriageCard title="Suspicious nginx path probing" host="bazza" severity="warning" evidence={['/wp-login.php', '/.git', 'suspicious user agents']} />
            </div>
          </div>
        </section>

        {/* Recent signal feed */}
        <section className={card + ' p-5'}>
          <SectionTitle title="Recent signal feed" subtitle="Structured evidence instead of raw noise" />
          <LogViewer rows={[
            { ts: '20:01:02', host: 'prod', source: 'ssh', actor: '185.193.*.*', action: 'failed login', outcome: 'critical', detail: 'root password rejected' },
            { ts: '20:01:18', host: 'bazza', source: 'nginx', actor: '94.102.*.*', action: 'path probe', outcome: 'warning', detail: 'GET /.git/config' },
            { ts: '20:01:41', host: 'prod', source: 'audit', actor: 'agent', action: 'baseline drift', outcome: 'info', detail: 'CPU and disk IO above band' },
          ]} />
          {overviewTs ? <div className="mt-4 text-[12px] text-slate-500">API online · {overviewTs}</div> : null}
        </section>
      </div>
    </AppShell>
  );
}
