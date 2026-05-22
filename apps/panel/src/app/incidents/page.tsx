'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, ToolbarButton, card, muted, sevPill } from '../../components/ops-ui';

type UiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
type IncidentState = 'open' | 'monitoring' | 'contained';

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
}

interface HealthCheck {
  status: 'ok' | 'degraded' | 'error' | 'unknown';
  detail?: string;
}

interface HealthData {
  ok: boolean;
  overall: 'green' | 'amber' | 'red';
  checks: Record<string, HealthCheck>;
  checked_at: string;
}

interface PromAlert {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  state?: string;
  activeAt?: string;
  value?: string;
}

interface IncidentRecord {
  id: string;
  title: string;
  source: string;
  severity: UiStatus;
  state: IncidentState;
  owner: string;
  updatedAt: string | null;
  detail: string;
  evidence: string[];
  nextAction: string;
}

const RESTART_THRESHOLD = 5;

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return 'unknown';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function severityRank(severity: UiStatus) {
  const rank: Record<UiStatus, number> = { critical: 0, warning: 1, info: 2, healthy: 3, neutral: 4 };
  return rank[severity];
}

function severityLabel(severity: UiStatus) {
  if (severity === 'critical') return 'Critical';
  if (severity === 'warning') return 'Warning';
  if (severity === 'info') return 'Info';
  if (severity === 'healthy') return 'Healthy';
  return 'Neutral';
}

function stateLabel(state: IncidentState) {
  if (state === 'open') return 'Open';
  if (state === 'monitoring') return 'Monitoring';
  return 'Contained';
}

function MetricTile({ label, value, hint, status }: { label: string; value: string; hint: string; status: UiStatus }) {
  return (
    <div className={card + ' p-5'}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <StatusBadge label={severityLabel(status)} status={status} pulse={status === 'critical'} />
      </div>
      <div className="text-[28px] font-extrabold leading-none text-slate-50">{value}</div>
      <div className={muted + ' mt-2'}>{hint}</div>
    </div>
  );
}

function IncidentRow({
  incident,
  active,
  onSelect,
}: {
  incident: IncidentRecord;
  active: boolean;
  onSelect: (incident: IncidentRecord) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(incident)}
      className="grid w-full grid-cols-[1fr_auto] gap-4 border-b border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/[0.025]"
      style={{
        background: active ? 'rgba(103,213,255,0.07)' : undefined,
        borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge label={severityLabel(incident.severity)} status={incident.severity} pulse={incident.severity === 'critical'} />
          <span className={sevPill(incident.state === 'open' ? 'warning' : incident.state === 'monitoring' ? 'info' : 'healthy')}>
            {stateLabel(incident.state)}
          </span>
          <span className="font-mono text-[11px] text-slate-500">{incident.source}</span>
        </div>
        <div className="truncate text-[14px] font-bold text-slate-100">{incident.title}</div>
        <div className="mt-1 truncate text-[12px] text-slate-500">{incident.detail}</div>
      </div>
      <div className="text-right text-[11px] text-slate-500">
        <div>{incident.owner}</div>
        <div className="mt-1">{relTime(incident.updatedAt)}</div>
      </div>
    </button>
  );
}

function DetailPanel({ incident }: { incident: IncidentRecord | null }) {
  if (!incident) {
    return (
      <aside className={card + ' p-5'}>
        <div className="text-[13px] font-bold text-slate-100">Incident Detail</div>
        <div className={muted + ' mt-2'}>Select an incident to inspect evidence, owner, and next action.</div>
      </aside>
    );
  }

  return (
    <aside className={card + ' overflow-hidden'}>
      <div className="border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-2">
          <StatusBadge label={severityLabel(incident.severity)} status={incident.severity} pulse={incident.severity === 'critical'} />
          <span className={sevPill(incident.state === 'open' ? 'warning' : incident.state === 'monitoring' ? 'info' : 'healthy')}>{stateLabel(incident.state)}</span>
        </div>
        <div className="text-[15px] font-extrabold text-slate-50">{incident.title}</div>
        <div className="mt-1 text-[12px] text-slate-500">{incident.source} · owner {incident.owner}</div>
      </div>
      <div className="space-y-5 p-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Next Action</div>
          <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3 text-[13px] text-slate-200">{incident.nextAction}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Evidence</div>
          <div className="mt-2 space-y-2">
            {incident.evidence.map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-slate-400">{item}</div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button className="mc-toolbar-button" type="button">Ack</button>
          <button className="mc-toolbar-button" type="button">Assign</button>
          <button className="mc-toolbar-button" type="button">Close</button>
        </div>
      </div>
    </aside>
  );
}

function buildIncidents(agents: AgentProcess[], health: HealthData | null, alerts: PromAlert[]): IncidentRecord[] {
  const fromAgents: IncidentRecord[] = agents.flatMap((agent) => {
    const records: IncidentRecord[] = [];
    const label = agent.label ?? agent.id;
    const restarts = agent.restarts ?? 0;
    const status = (agent.status ?? '').toLowerCase();

    if (restarts > RESTART_THRESHOLD) {
      records.push({
        id: `agent-restarts-${agent.id}`,
        title: `${label} restart threshold exceeded`,
        source: 'agent mesh',
        severity: 'critical',
        state: 'open',
        owner: 'Dev',
        updatedAt: agent.lastSeen ?? null,
        detail: `${restarts} restarts recorded; threshold is ${RESTART_THRESHOLD}.`,
        evidence: [`agent=${agent.id}`, `status=${agent.status}`, `restarts=${restarts}`, `task=${agent.currentTask ?? 'none'}`],
        nextAction: 'Inspect recent activity and process logs before restarting dependent automation.',
      });
    } else if (status === 'offline') {
      records.push({
        id: `agent-offline-${agent.id}`,
        title: `${label} is offline`,
        source: 'agent mesh',
        severity: 'warning',
        state: 'monitoring',
        owner: 'Archie',
        updatedAt: agent.lastSeen ?? null,
        detail: 'Agent is registered but not currently reporting activity.',
        evidence: [`agent=${agent.id}`, `lastSeen=${agent.lastSeen ?? 'never'}`, `status=${agent.status}`],
        nextAction: 'Confirm whether this agent is expected to be idle before escalating.',
      });
    }

    return records;
  });

  const fromHealth: IncidentRecord[] = Object.entries(health?.checks ?? {})
    .filter(([, check]) => check.status === 'error' || check.status === 'degraded')
    .map(([name, check]) => ({
      id: `health-${name}`,
      title: `${name.replaceAll('_', ' ')} health check is ${check.status}`,
      source: 'health API',
      severity: check.status === 'error' ? 'critical' : 'warning',
      state: 'open',
      owner: name.includes('panic') ? 'SecSpy' : 'Mission Control',
      updatedAt: health?.checked_at ?? null,
      detail: check.detail ?? 'No detail supplied by health endpoint.',
      evidence: [`check=${name}`, `status=${check.status}`, `detail=${check.detail ?? 'none'}`],
      nextAction: name.includes('panic') ? 'Reset or investigate the panic latch before proceeding.' : 'Open the related system page and inspect the backing service.',
    }));

  const fromAlerts: IncidentRecord[] = alerts.map((alert, index) => {
    const rawSeverity = alert.labels?.severity ?? alert.labels?.alertseverity ?? '';
    const severity: UiStatus = rawSeverity.toLowerCase().includes('crit') ? 'critical' : rawSeverity.toLowerCase().includes('warn') ? 'warning' : 'info';
    const name = alert.labels?.alertname ?? alert.annotations?.summary ?? `Prometheus alert ${index + 1}`;
    return {
      id: `prom-${name}-${index}`,
      title: name,
      source: alert.labels?.job ? `prometheus/${alert.labels.job}` : 'prometheus',
      severity,
      state: alert.state === 'firing' ? 'open' : 'monitoring',
      owner: 'SecSpy',
      updatedAt: alert.activeAt ?? null,
      detail: alert.annotations?.description ?? alert.annotations?.summary ?? 'Prometheus alert is active.',
      evidence: [
        `state=${alert.state ?? 'unknown'}`,
        `instance=${alert.labels?.instance ?? 'unknown'}`,
        `value=${alert.value ?? 'n/a'}`,
      ],
      nextAction: 'Correlate alert timing with host and security telemetry before closing.',
    };
  });

  return [...fromHealth, ...fromAlerts, ...fromAgents].sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
  });
}

export default function IncidentsPage() {
  const [agents, setAgents] = useState<AgentProcess[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [alerts, setAlerts] = useState<PromAlert[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState<string>('');

  async function load() {
    const [agentRes, healthRes, alertRes] = await Promise.allSettled([
      fetch('/api/agents/status', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/alerts', { cache: 'no-store' }).then((r) => r.json()),
    ]);

    if (agentRes.status === 'fulfilled') {
      setAgents(agentRes.value.agents ?? []);
      setTs(agentRes.value.ts ?? new Date().toISOString());
    }
    if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
    if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.data?.alerts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  const incidents = useMemo(() => buildIncidents(agents, health, alerts), [agents, health, alerts]);
  const selected = incidents.find((incident) => incident.id === selectedId) ?? incidents[0] ?? null;
  const critical = incidents.filter((incident) => incident.severity === 'critical').length;
  const warning = incidents.filter((incident) => incident.severity === 'warning').length;
  const offlineCount = agents.filter((agent) => (agent.status ?? '').toLowerCase() === 'offline').length;
  const containedCount = incidents.filter((incident) => incident.state === 'contained').length;

  useEffect(() => {
    if (!selectedId && incidents[0]) setSelectedId(incidents[0].id);
  }, [incidents, selectedId]);

  return (
    <AppShell>
      <div className="space-y-6">
        <SectionTitle
          title="Incidents"
          subtitle="Severity queue, evidence timeline, owner controls, and response bundles"
          action={<ToolbarButton onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</ToolbarButton>}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Open Incidents" value={loading ? '-' : String(incidents.length)} hint={`${critical} critical · ${warning} warning`} status={critical ? 'critical' : warning ? 'warning' : 'healthy'} />
          <MetricTile label="Agents Offline" value={loading ? '-' : String(offlineCount)} hint={`${agents.length} agents tracked`} status={offlineCount ? 'warning' : 'healthy'} />
          <MetricTile label="Prom Alerts" value={loading ? '-' : String(alerts.length)} hint="from Prometheus alert manager API" status={alerts.length ? 'warning' : 'neutral'} />
          <MetricTile label="Contained" value={loading ? '-' : String(containedCount)} hint={ts ? `updated ${relTime(ts)}` : 'waiting for data'} status="info" />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <section className={card + ' overflow-hidden'}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
              <div>
                <div className="text-[13px] font-bold text-slate-100">Severity Queue</div>
                <div className="mt-1 text-[12px] text-slate-500">Health checks, Prometheus alerts, and agent process signals in one queue</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={sevPill('critical')}>{critical} critical</span>
                <span className={sevPill('warning')}>{warning} warning</span>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-[13px] text-slate-500">Loading incident signals...</div>
            ) : incidents.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-[17px] font-bold text-[var(--sev-healthy)]">No open incidents</div>
                <div className={muted + ' mx-auto mt-2 max-w-md'}>Health checks are clean, Prometheus has no active alerts, and no process restart thresholds are breached.</div>
              </div>
            ) : (
              <div>
                {incidents.map((incident) => (
                  <IncidentRow key={incident.id} incident={incident} active={selected?.id === incident.id} onSelect={(item) => setSelectedId(item.id)} />
                ))}
              </div>
            )}
          </section>

          <DetailPanel incident={selected} />
        </div>

        <section className={card + ' overflow-hidden'}>
          <div className="grid gap-0 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Evidence Timeline</div>
              <div className="mt-2 text-[15px] font-bold text-slate-100">{selected ? selected.title : 'No selected incident'}</div>
              <div className={muted + ' mt-1'}>{selected ? `${selected.source} · ${relTime(selected.updatedAt)}` : 'The incident stream is currently clear.'}</div>
            </div>
            <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Bundle Export</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="mc-toolbar-button" href="/api/incident/bundle?minutes=30">30m</a>
                <a className="mc-toolbar-button" href="/api/incident/bundle?minutes=60">60m</a>
                <a className="mc-toolbar-button" href="/api/incident/bundle?minutes=240">4h</a>
              </div>
            </div>
            <div className="p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Response Posture</div>
              <div className="mt-2 text-[15px] font-bold text-slate-100">
                {critical ? 'Immediate triage required' : warning ? 'Monitor and verify owner intent' : 'Ready for next incident'}
              </div>
              <div className={muted + ' mt-1'}>Controls are staged for acknowledge, assign, close, and evidence export workflows.</div>
            </div>
          </div>
        </section>

        {!loading && agents.length > 0 && (
          <section className={card + ' overflow-hidden'}>
            <div className="border-b border-white/10 bg-[var(--bg-2)] px-4 py-3">
              <div className="text-[13px] font-bold text-slate-100">Process Watchlist</div>
              <div className="mt-1 text-[12px] text-slate-500">Every tracked process with restart count, state, and uptime context</div>
            </div>
            <div className="divide-y divide-white/10">
              {agents.map((agent) => {
                const restarts = agent.restarts ?? 0;
                const flagged = restarts > RESTART_THRESHOLD;
                const status: UiStatus = flagged ? 'critical' : agent.status === 'Working' ? 'healthy' : agent.status === 'Idle' ? 'warning' : 'neutral';
                return (
                  <div key={agent.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-[13px]">
                    <div style={{ minWidth: 0 }}>
                      <div className="truncate font-bold text-slate-100">{agent.label ?? agent.id}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-500">{agent.currentTask ?? `last seen ${relTime(agent.lastSeen)}`}</div>
                    </div>
                    <div className="font-mono text-[12px] text-slate-400">restart {restarts}</div>
                    <div className="font-mono text-[12px] text-slate-500">uptime {typeof agent.uptime === 'string' ? agent.uptime : agent.uptime ? `${Math.floor(agent.uptime / 60000)}m` : '-'}</div>
                    <StatusBadge label={agent.status} status={status} pulse={agent.status === 'Working'} />
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
