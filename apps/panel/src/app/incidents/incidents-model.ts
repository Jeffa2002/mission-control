export type UiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
export type IncidentState = 'open' | 'monitoring' | 'contained';

export interface AgentProcess { id: string; label?: string; status: string; restarts?: number; uptime?: number | string; lastSeen?: string | null; currentTask?: string | null; }
export interface HealthCheck { status: 'ok' | 'degraded' | 'error' | 'unknown'; detail?: string; }
export interface HealthData { ok: boolean; overall: 'green' | 'amber' | 'red'; checks: Record<string, HealthCheck>; checked_at: string; }
export interface PromAlert { labels?: Record<string, string>; annotations?: Record<string, string>; state?: string; activeAt?: string; value?: string; }
export interface IncidentRecord { id: string; title: string; source: string; severity: UiStatus; state: IncidentState; owner: string; updatedAt: string | null; detail: string; evidence: string[]; nextAction: string; }

export const RESTART_THRESHOLD = 5;
export function severityRank(severity: UiStatus) { return { critical: 0, warning: 1, info: 2, healthy: 3, neutral: 4 }[severity]; }

export function buildIncidents(agents: AgentProcess[], health: HealthData | null, alerts: PromAlert[]): IncidentRecord[] {
  const agentIncidents = agents.flatMap((agent) => {
    const records: IncidentRecord[] = [];
    const label = agent.label ?? agent.id;
    const restarts = agent.restarts ?? 0;
    const status = (agent.status ?? '').toLowerCase();
    if (restarts > RESTART_THRESHOLD) records.push({ id: `agent-restarts-${agent.id}`, title: `${label} restart threshold exceeded`, source: 'agent mesh', severity: 'critical', state: 'open', owner: 'Dev', updatedAt: agent.lastSeen ?? null, detail: `${restarts} restarts recorded; threshold is ${RESTART_THRESHOLD}.`, evidence: [`agent=${agent.id}`, `status=${agent.status}`, `restarts=${restarts}`, `task=${agent.currentTask ?? 'none'}`], nextAction: 'Inspect recent activity and process logs before restarting dependent automation.' });
    else if (status === 'offline') records.push({ id: `agent-offline-${agent.id}`, title: `${label} is offline`, source: 'agent mesh', severity: 'warning', state: 'monitoring', owner: 'Archie', updatedAt: agent.lastSeen ?? null, detail: 'Agent is registered but not currently reporting activity.', evidence: [`agent=${agent.id}`, `lastSeen=${agent.lastSeen ?? 'never'}`, `status=${agent.status}`], nextAction: 'Confirm whether this agent is expected to be idle before escalating.' });
    return records;
  });
  const healthIncidents: IncidentRecord[] = Object.entries(health?.checks ?? {}).filter(([, check]) => check.status === 'error' || check.status === 'degraded').map(([name, check]) => ({ id: `health-${name}`, title: `${name.replaceAll('_', ' ')} health check is ${check.status}`, source: 'health API', severity: check.status === 'error' ? 'critical' : 'warning', state: 'open', owner: name.includes('panic') ? 'SecSpy' : 'Mission Control', updatedAt: health?.checked_at ?? null, detail: check.detail ?? 'No detail supplied by health endpoint.', evidence: [`check=${name}`, `status=${check.status}`, `detail=${check.detail ?? 'none'}`], nextAction: name.includes('panic') ? 'Reset or investigate the panic latch before proceeding.' : 'Open the related system page and inspect the backing service.' }));
  const alertIncidents: IncidentRecord[] = alerts.map((alert, index) => {
    const rawSeverity = alert.labels?.severity ?? alert.labels?.alertseverity ?? '';
    const severity: UiStatus = rawSeverity.toLowerCase().includes('crit') ? 'critical' : rawSeverity.toLowerCase().includes('warn') ? 'warning' : 'info';
    const name = alert.labels?.alertname ?? alert.annotations?.summary ?? `Prometheus alert ${index + 1}`;
    return { id: `prom-${name}-${index}`, title: name, source: alert.labels?.job ? `prometheus/${alert.labels.job}` : 'prometheus', severity, state: alert.state === 'firing' ? 'open' : 'monitoring', owner: 'SecSpy', updatedAt: alert.activeAt ?? null, detail: alert.annotations?.description ?? alert.annotations?.summary ?? 'Prometheus alert is active.', evidence: [`state=${alert.state ?? 'unknown'}`, `instance=${alert.labels?.instance ?? 'unknown'}`, `value=${alert.value ?? 'n/a'}`], nextAction: 'Correlate alert timing with host and security telemetry before closing.' };
  });
  return [...healthIncidents, ...alertIncidents, ...agentIncidents].sort((left, right) => severityRank(left.severity) - severityRank(right.severity) || new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime());
}

export function incidentChanges(previous: IncidentRecord[], current: IncidentRecord[]) {
  const before = new Map(previous.map((incident) => [incident.id, incident]));
  const after = new Map(current.map((incident) => [incident.id, incident]));
  return {
    opened: current.filter((incident) => !before.has(incident.id)),
    changed: current.filter((incident) => { const prior = before.get(incident.id); return prior && JSON.stringify(prior) !== JSON.stringify(incident); }),
    cleared: previous.filter((incident) => !after.has(incident.id)),
  };
}
