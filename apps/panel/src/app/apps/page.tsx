'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgentActivityDrawer } from '../../components/AgentActivityDrawer';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, card, card2, muted, sevPill } from '../../components/ops-ui';

type CheckStatus = 'ok' | 'degraded' | 'error' | 'unknown';
type UiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

interface HealthCheck {
  status: CheckStatus;
  detail?: string;
}

interface HealthData {
  ok: boolean;
  overall: 'green' | 'amber' | 'red';
  checks: Record<string, HealthCheck>;
  checked_at: string;
}

interface AgentStatus {
  id: string;
  label: string;
  emoji: string;
  status: string;
  lastSeen: string | null;
  currentTask: string | null;
  role?: string;
  model?: string;
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

interface ServiceNode {
  id: string;
  label: string;
  group: string;
  status: UiStatus;
  signal: string;
  dependency: string;
  owner: string;
  lastEvent: string;
}

function statusFromCheck(check?: HealthCheck): UiStatus {
  if (!check) return 'neutral';
  if (check.status === 'ok') return 'healthy';
  if (check.status === 'degraded') return 'warning';
  if (check.status === 'error') return 'critical';
  return 'neutral';
}

function statusLabel(status: UiStatus) {
  if (status === 'healthy') return 'Healthy';
  if (status === 'warning') return 'Degraded';
  if (status === 'critical') return 'Critical';
  if (status === 'info') return 'Watching';
  return 'Unknown';
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'unknown';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function deployState(deploys: Deploy[]): UiStatus {
  const latest = deploys[0];
  if (!latest) return 'neutral';
  if (latest.status === 'failure') return 'critical';
  if (latest.status === 'running') return 'warning';
  return 'healthy';
}

function agentState(agent: AgentStatus): UiStatus {
  if (agent.status === 'Working') return 'healthy';
  if (agent.status === 'Idle') return 'warning';
  return 'neutral';
}

function MetricTile({ label, value, hint, status }: { label: string; value: string; hint: string; status: UiStatus }) {
  return (
    <div className={card + ' p-5'}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <StatusBadge label={statusLabel(status)} status={status} pulse={status === 'critical'} />
      </div>
      <div className="text-[28px] font-extrabold leading-none text-slate-50">{value}</div>
      <div className={muted + ' mt-2'}>{hint}</div>
    </div>
  );
}

function SignalBar({ status }: { status: UiStatus }) {
  const color = status === 'critical'
    ? 'var(--sev-critical)'
    : status === 'warning'
      ? 'var(--sev-warning)'
      : status === 'healthy'
        ? 'var(--sev-healthy)'
        : 'var(--sev-neutral)';

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: status === 'neutral' ? '36%' : status === 'warning' ? '68%' : '100%', background: color, boxShadow: `0 0 14px ${color}` }}
      />
    </div>
  );
}

function ServiceCard({ node }: { node: ServiceNode }) {
  return (
    <div className={card2 + ' p-4'}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div style={{ minWidth: 0 }}>
          <div className="truncate text-[15px] font-bold text-slate-100">{node.label}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">{node.group}</div>
        </div>
        <StatusBadge label={statusLabel(node.status)} status={node.status} pulse={node.status === 'critical'} />
      </div>
      <SignalBar status={node.status} />
      <div className="mt-4 grid gap-3 text-[12px] text-slate-400">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Signal</div>
          <div className="mt-1 text-slate-200">{node.signal}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Depends On</div>
            <div className="mt-1 truncate text-slate-300">{node.dependency}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Owner</div>
            <div className="mt-1 truncate text-slate-300">{node.owner}</div>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] text-slate-400">{node.lastEvent}</div>
      </div>
    </div>
  );
}

function AgentRow({ agent, onOpen }: { agent: AgentStatus; onOpen: (agent: AgentStatus) => void }) {
  const status = agentState(agent);
  return (
    <button
      type="button"
      onClick={() => onOpen(agent)}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/[0.025]"
    >
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-[20px]">{agent.emoji}</div>
      <div style={{ minWidth: 0 }}>
        <div className="truncate text-[13px] font-bold text-slate-100">{agent.label}</div>
        <div className="mt-1 truncate text-[11px] text-slate-500">{agent.currentTask || `last seen ${timeAgo(agent.lastSeen)}`}</div>
      </div>
      <StatusBadge label={agent.status} status={status} pulse={agent.status === 'Working'} />
    </button>
  );
}

export default function AppsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [healthRes, agentsRes, deploysRes] = await Promise.allSettled([
        fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/agents/status', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/deploys', { cache: 'no-store' }).then((r) => r.json()),
      ]);

      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.agents ?? []);
      if (deploysRes.status === 'fulfilled') setDeploys(deploysRes.value.deploys ?? []);

      const failed = [healthRes, agentsRes, deploysRes].filter((r) => r.status === 'rejected').length;
      if (failed) setError(`${failed} app telemetry source${failed === 1 ? '' : 's'} failed to respond`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const serviceNodes = useMemo<ServiceNode[]>(() => {
    const latestDeploy = deploys[0];
    const deployStatus = deployState(deploys);
    const activeAgents = agents.filter((a) => a.status === 'Working').length;

    return [
      {
        id: 'mission-panel',
        label: 'Mission Panel',
        group: 'frontend',
        status: statusFromCheck(health?.checks?.app),
        signal: health?.checks?.app?.detail ?? (loading ? 'probing app endpoint' : 'responding'),
        dependency: 'Next.js panel + session guard',
        owner: 'Archie',
        lastEvent: `health probe ${timeAgo(health?.checked_at)}`,
      },
      {
        id: 'panic-latch',
        label: 'Panic Latch',
        group: 'control plane',
        status: statusFromCheck(health?.checks?.panic_latch),
        signal: health?.checks?.panic_latch?.detail ?? 'not latched',
        dependency: 'panic reset API',
        owner: 'SecSpy',
        lastEvent: `state checked ${timeAgo(health?.checked_at)}`,
      },
      {
        id: 'agent-mesh',
        label: 'Agent Mesh',
        group: 'automation',
        status: activeAgents > 0 ? 'healthy' : agents.length > 0 ? 'warning' : 'neutral',
        signal: `${activeAgents} active / ${agents.length} registered`,
        dependency: 'agent-status.json',
        owner: 'OpenClaw',
        lastEvent: agents.length ? `latest activity ${timeAgo(agents.find((a) => a.lastSeen)?.lastSeen)}` : 'no agents reporting',
      },
      {
        id: 'deploy-stream',
        label: 'Deploy Stream',
        group: 'release',
        status: deployStatus,
        signal: latestDeploy ? `${latestDeploy.status} · ${latestDeploy.app}` : 'no deploy records yet',
        dependency: 'deploy-log.json',
        owner: latestDeploy?.triggeredBy ?? 'GitHub Actions',
        lastEvent: latestDeploy ? `${latestDeploy.branch} @ ${latestDeploy.commit?.slice(0, 7) || 'unknown'} · ${timeAgo(latestDeploy.startedAt)}` : 'waiting for first release event',
      },
      {
        id: 'monitoring',
        label: 'Metrics Backplane',
        group: 'telemetry',
        status: statusFromCheck(health?.checks?.prometheus),
        signal: health?.checks?.prometheus?.detail ?? 'unchecked',
        dependency: 'Prometheus + Grafana',
        owner: 'Mission Control',
        lastEvent: `probe ${timeAgo(health?.checked_at)}`,
      },
      {
        id: 'heartbeat',
        label: 'Heartbeat Bus',
        group: 'scheduler',
        status: statusFromCheck(health?.checks?.heartbeat),
        signal: health?.checks?.heartbeat?.detail ?? 'unchecked',
        dependency: 'OpenClaw heartbeat',
        owner: 'Archie',
        lastEvent: `pulse ${timeAgo(health?.checked_at)}`,
      },
    ];
  }, [agents, deploys, health, loading]);

  const critical = serviceNodes.filter((n) => n.status === 'critical').length;
  const degraded = serviceNodes.filter((n) => n.status === 'warning').length;
  const healthy = serviceNodes.filter((n) => n.status === 'healthy').length;
  const latestDeploy = deploys[0];
  const commandStatus: UiStatus = critical ? 'critical' : degraded ? 'warning' : healthy ? 'healthy' : 'neutral';

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionTitle
          title="App Health"
          subtitle="Service state, agent activity, release signal, and dependency pressure"
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

        {error && (
          <div className={card + ' border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.07)] p-4'}>
            <div className="text-sm font-semibold text-[var(--sev-warning)]">Partial telemetry</div>
            <div className={muted + ' mt-1'}>{error}</div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Command State" value={statusLabel(commandStatus)} hint={`${critical} critical · ${degraded} degraded · ${healthy} healthy`} status={commandStatus} />
          <MetricTile label="Agents" value={`${agents.filter((a) => a.status === 'Working').length}/${agents.length}`} hint="working agents in the current mesh" status={agents.some((a) => a.status === 'Working') ? 'healthy' : agents.length ? 'warning' : 'neutral'} />
          <MetricTile label="Release" value={latestDeploy?.status ?? 'none'} hint={latestDeploy ? `${latestDeploy.app} · ${timeAgo(latestDeploy.startedAt)}` : 'no deploy events recorded'} status={deployState(deploys)} />
          <MetricTile label="Probe Age" value={timeAgo(health?.checked_at)} hint="latest application health probe" status={statusFromCheck(health?.checks?.app)} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <section className={card + ' overflow-hidden'}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
              <div>
                <div className="text-[13px] font-bold text-slate-100">Service Dependency Map</div>
                <div className="mt-1 text-[12px] text-slate-500">Operational surfaces ranked by live signal and dependency health</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={sevPill('critical')}>{critical} critical</span>
                <span className={sevPill('warning')}>{degraded} degraded</span>
                <span className={sevPill('healthy')}>{healthy} healthy</span>
              </div>
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {serviceNodes.map((node) => <ServiceCard key={node.id} node={node} />)}
            </div>
          </section>

          <aside className={card + ' overflow-hidden'}>
            <div className="border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
              <div className="text-[13px] font-bold text-slate-100">Agent Activity</div>
              <div className="mt-1 text-[12px] text-slate-500">Open a live session stream from the active crew</div>
            </div>
            <div className="max-h-[580px] overflow-auto">
              {agents.length === 0 ? (
                <div className="p-5 text-[13px] text-slate-500">No agent statuses are currently reporting.</div>
              ) : agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} onOpen={setSelectedAgent} />
              ))}
            </div>
          </aside>
        </div>

        <section className={card + ' overflow-hidden'}>
          <div className="grid gap-0 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Next Action</div>
              <div className="mt-2 text-[15px] font-bold text-slate-100">
                {critical ? 'Triage critical services before lower-signal polish.' : degraded ? 'Review degraded dependencies and confirm whether they are intentionally unchecked.' : 'Continue hardening Systems and Incident workflows.'}
              </div>
            </div>
            <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Latest Release</div>
              <div className="mt-2 text-[15px] font-bold text-slate-100">{latestDeploy?.app ?? 'No deploys recorded'}</div>
              <div className={muted + ' mt-1'}>{latestDeploy ? `${latestDeploy.branch} · ${latestDeploy.commitMsg || latestDeploy.commit?.slice(0, 7) || 'unknown commit'}` : 'Deploy stream is ready for GitHub Actions input.'}</div>
            </div>
            <div className="p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Telemetry Sources</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={sevPill(health ? 'healthy' : 'neutral')}>health API</span>
                <span className={sevPill(agents.length ? 'healthy' : 'neutral')}>agent mesh</span>
                <span className={sevPill(deploys.length ? 'healthy' : 'neutral')}>deploy stream</span>
              </div>
            </div>
          </div>
        </section>

        <AgentActivityDrawer agent={selectedAgent} open={Boolean(selectedAgent)} onClose={() => setSelectedAgent(null)} />
      </div>
    </AppShell>
  );
}
