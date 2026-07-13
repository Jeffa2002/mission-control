import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { requireSessionAuth } from '../_session-auth';
import { readAuditLog } from '../_util';
import { readDeployFeed } from '../_deploys';
import { GET as getAlerts } from '../alerts/route';
import { GET as getEstate } from '../estate/route';
import { GET as getHealth } from '../health/route';
import { GET as getSecurity } from '../security/route';
import { buildCanonicalRoster, type RawAgentStatus } from '../../office/roster';
import {
  boundedText,
  correlateActivityEvents,
  dedupeActivityEvents,
  normalizeTimestamp,
  stableId,
  type ActivityCoverage,
  type ActivitySeverity,
  type NormalizedActivityEvent,
  type SourceCoverageStatus,
} from './activity-model';

const AGENT_PATHS = [
  '/workspace/mission-control/agent-status.json', '/workspace-data/mission-control/agent-status.json',
  '/workspace/agent-status.json', '/agent-data/agent-status.json', '/var/www/mission-control/agent-status.json', '/app/agent-status.json',
];

async function readAgentSnapshot() {
  for (const filePath of AGENT_PATHS) {
    try {
      const [raw, fileStat] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
      return { data: JSON.parse(raw) as { ts?: string; agents?: RawAgentStatus[] }, fileMtime: fileStat.mtime.toISOString() };
    } catch {}
  }
  return null;
}

function auditSeverity(event: Record<string, unknown>): ActivitySeverity {
  if (event.error || event.result === 'error') return 'critical';
  if (event.result === 'blocked' || event.severity === 'warning') return 'warning';
  if (event.result === 'ok') return 'healthy';
  return 'neutral';
}

function sourceStatusFromAge(checkedAt: string, now: number, staleMs: number): SourceCoverageStatus {
  const timestamp = Date.parse(checkedAt);
  if (!Number.isFinite(timestamp)) return 'partial';
  return now - timestamp > staleMs ? 'stale' : 'current';
}

function makeEvent(input: Omit<NormalizedActivityEvent, 'eventId'|'id'|'dedupeCount'|'memberEventIds'|'relationship'|'relationshipBasis'> & { eventId?: string }): NormalizedActivityEvent {
  const eventId = input.eventId || `${input.source}:${stableId(input.source, input.sourceEventId, input.eventType, input.ts, input.title)}`;
  return { ...input, eventId, id: eventId, dedupeCount: 1, memberEventIds: [eventId], relationship: 'unknown', relationshipBasis: 'Correlation has not been evaluated.' };
}

async function readRoute<T>(handler: (request: Request) => Promise<Response>, req: Request): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await handler(req);
    if (!response.ok) throw new Error(`Collector returned ${response.status}`);
    return { ok: true, data: await response.json() as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function sourceError(result: { ok: boolean; error?: string }) {
  return boundedText(result.error ?? 'Source failed without an error detail.');
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const limit = Math.min(240, Math.max(1, Number(url.searchParams.get('limit') || '120')));
  const generatedAt = new Date().toISOString();
  const now = Date.now();

  const [auditResult, deployResult, agentResult, healthResult, alertsResult, estateResult, securityResult] = await Promise.all([
    readAuditLog(100).then((items) => ({ ok: true as const, items })).catch((error) => ({ ok: false as const, error: String(error) })),
    readDeployFeed().then((feed) => ({ ok: true as const, feed })).catch((error) => ({ ok: false as const, error: String(error) })),
    readAgentSnapshot(),
    readRoute<any>(getHealth, req),
    readRoute<any>(getAlerts, req),
    readRoute<any>(getEstate, req),
    readRoute<any>(getSecurity, req),
  ]);

  const events: NormalizedActivityEvent[] = [];
  const coverage: ActivityCoverage[] = [];

  if (auditResult.ok) {
    auditResult.items.slice(0, 100).forEach((record, index) => {
      const timestamp = normalizeTimestamp(record.ts, generatedAt);
      const action = boundedText(record.action ?? record.raw ?? 'audit event', 120);
      const sourceEventId = typeof record.idempotency_key === 'string' ? record.idempotency_key : undefined;
      const entityRefs = [record.agentId && `agent:${record.agentId}`, record.app && `app:${record.app}`, record.host && `host:${record.host}`].filter(Boolean) as string[];
      events.push(makeEvent({ source: 'audit', sourceEventId: sourceEventId || `record:${stableId(record.ts, action, record.actor, index)}`, eventType: `audit.${action.replace(/\s+/g, '_')}`, ...timestamp, severity: auditSeverity(record), title: action.replaceAll('_', ' '), detail: boundedText(record.error ?? record.detail ?? record.result ?? 'No detail', 500), entityRefs, agentId: typeof record.agentId === 'string' ? record.agentId : undefined, app: typeof record.app === 'string' ? record.app : undefined, host: typeof record.host === 'string' ? record.host : undefined, href: '/actions', evidence: { action, result: boundedText(record.result ?? 'not reported', 80), actor: boundedText(record.actor ?? 'not reported', 80), authMethod: boundedText(record.auth_method ?? 'not reported', 80) }, raw: { action, result: boundedText(record.result ?? '', 80), severity: boundedText(record.severity ?? '', 40) }, sourceFreshness: 'current', explicitLinkKey: sourceEventId, provenance: { sourceRecord: 'audit log', index } }));
    });
    coverage.push({ source: 'audit', status: auditResult.items.length ? 'current' : 'missing', checkedAt: generatedAt, detail: auditResult.items.length ? `${auditResult.items.length} bounded audit records read.` : 'No audit records were available; absence is not treated as nominal activity.', eventCount: auditResult.items.length });
  } else coverage.push({ source: 'audit', status: 'error', checkedAt: generatedAt, detail: sourceError(auditResult), eventCount: 0 });

  if (deployResult.ok) {
    const feed = deployResult.feed;
    feed.deploys.slice(0, 50).forEach((deploy) => {
      const timestamp = normalizeTimestamp(deploy.finishedAt ?? deploy.startedAt, generatedAt);
      const severity: ActivitySeverity = deploy.status === 'failure' ? 'critical' : deploy.status === 'running' ? 'warning' : 'healthy';
      const appRef = `app:${deploy.repo || deploy.app}`;
      events.push(makeEvent({ source: 'deploys', sourceEventId: deploy.id, eventType: `deploy.${deploy.status}`, ...timestamp, severity, title: `${boundedText(deploy.app,120)} deploy ${deploy.status}`, detail: boundedText(`${deploy.branch || 'branch unknown'} · ${deploy.commitMsg || deploy.commit || 'no commit detail'}`, 500), entityRefs: [appRef, deploy.commit ? `commit:${deploy.commit}` : ''].filter(Boolean), app: deploy.app, environment: 'production-context', href: '/deploys', evidence: { workflow: boundedText(deploy.app,120), status: deploy.status, commit: boundedText(deploy.commit,80), branch: boundedText(deploy.branch,80), actor: boundedText(deploy.triggeredBy,80), durationS: deploy.durationS ?? null }, raw: { id: boundedText(deploy.id,100), status: deploy.status, startedAt: boundedText(deploy.startedAt,80), finishedAt: boundedText(deploy.finishedAt ?? '',80) }, sourceFreshness: feed.source === 'github-actions' ? 'current' : 'partial', provenance: { feedSource: feed.source } }));
    });
    coverage.push({ source: 'deploys', status: feed.source === 'github-actions' ? 'current' : feed.deploys.length ? 'partial' : 'missing', checkedAt: generatedAt, detail: feed.source === 'github-actions' ? `${feed.count} workflow records from GitHub Actions.` : `Local deploy fallback is partial. ${boundedText(feed.warning ?? '',160)}`, eventCount: feed.deploys.length });
  } else coverage.push({ source: 'deploys', status: 'error', checkedAt: generatedAt, detail: sourceError(deployResult), eventCount: 0 });

  if (agentResult) {
    const projection = buildCanonicalRoster(agentResult.data.agents ?? [], agentResult.data.ts ?? agentResult.fileMtime, now);
    projection.identities.slice(0, 100).forEach((agent) => {
      const timestamp = normalizeTimestamp(agent.lastSeen, generatedAt);
      const severity: ActivitySeverity = agent.availability === 'Inactive' ? 'warning' : agent.availability === 'Unconfirmed' ? 'neutral' : agent.availability === 'Working' ? 'healthy' : 'info';
      events.push(makeEvent({ source: 'agent-mesh', sourceEventId: agent.canonicalId, eventType: `agent.${agent.availability.toLowerCase()}`, ...timestamp, severity, title: `${agent.label} ${agent.availability}`, detail: boundedText(agent.currentTask || agent.inactiveReason || 'No current task reported.',500), entityRefs: [`agent:${agent.canonicalId}`], agentId: agent.canonicalId, href: `/agents/${encodeURIComponent(agent.canonicalId)}`, evidence: { canonicalId: agent.canonicalId, availability: agent.availability, upstreamStatus: agent.upstreamStatus, busy: agent.busy, task: boundedText(agent.currentTask ?? '',240) }, raw: { canonicalId: agent.canonicalId, winningSourceId: agent.sourceId, lastSeen: agent.lastSeen ?? '', status: agent.upstreamStatus }, sourceFreshness: projection.health.state === 'fresh' ? 'current' : projection.health.state === 'stale' ? 'stale' : 'partial', provenance: { winningSourceId: agent.sourceId, sourceIds: agent.sourceIds, suppressedSourceIds: agent.suppressedSourceIds } }));
    });
    coverage.push({ source: 'agent-mesh', status: projection.health.state === 'fresh' ? 'current' : projection.health.state === 'stale' ? 'stale' : 'partial', checkedAt: projection.health.snapshotAt ?? agentResult.fileMtime, detail: `${projection.canonicalCount} canonical identities; ${projection.suppressedCount} alias representations suppressed. ${projection.health.detail}`, eventCount: projection.identities.length });
  } else coverage.push({ source: 'agent-mesh', status: 'missing', checkedAt: generatedAt, detail: 'No agent status snapshot was found.', eventCount: 0 });

  if (healthResult.ok) {
    const health = healthResult.data;
    const timestamp = normalizeTimestamp(health.checked_at, generatedAt);
    const issues = Object.entries<any>(health.checks ?? {}).filter(([, check]) => check.status === 'error' || check.status === 'degraded');
    events.push(makeEvent({ source: 'health', sourceEventId: `snapshot:${timestamp.ts}`, eventType: 'health.snapshot', ...timestamp, severity: health.overall === 'red' ? 'critical' : health.overall === 'amber' ? 'warning' : 'healthy', title: `Current health ${health.overall ?? 'unknown'}`, detail: issues.length ? issues.map(([name, check]) => `${name}: ${check.detail || check.status}`).join('; ') : 'Current bounded health checks report no degraded or error state.', entityRefs: ['system:mission-control'], href: '/systems', evidence: { overall: health.overall ?? 'unknown', issueCount: issues.length, checkedAt: timestamp.ts }, raw: { overall: health.overall ?? 'unknown', checks: Object.keys(health.checks ?? {}).join(',') }, sourceFreshness: sourceStatusFromAge(timestamp.ts, now, 5*60_000) }));
    coverage.push({ source: 'health', status: sourceStatusFromAge(timestamp.ts, now, 5*60_000), checkedAt: timestamp.ts, detail: `${Object.keys(health.checks ?? {}).length} current checks. This is a snapshot, not history.`, eventCount: 1 });
  } else coverage.push({ source: 'health', status: 'error', checkedAt: generatedAt, detail: sourceError(healthResult), eventCount: 0 });

  if (alertsResult.ok) {
    const alertPayload = alertsResult.data;
    const alerts = Array.isArray(alertPayload?.data?.alerts) ? alertPayload.data.alerts : [];
    alerts.slice(0, 40).forEach((alert: any, index: number) => {
      const timestamp = normalizeTimestamp(alert.activeAt, generatedAt);
      const name = boundedText(alert.labels?.alertname || `Prometheus alert ${index + 1}`,120);
      const severityLabel = String(alert.labels?.severity || '').toLowerCase();
      events.push(makeEvent({ source: 'prometheus-alerts', sourceEventId: `${name}:${alert.activeAt || index}`, eventType: `alert.${alert.state || 'unknown'}`, ...timestamp, severity: severityLabel === 'critical' || severityLabel === 'page' ? 'critical' : alert.state === 'firing' ? 'warning' : 'info', title: name, detail: boundedText(alert.annotations?.summary || alert.annotations?.description || 'Prometheus alert record.',500), entityRefs: [alert.labels?.instance && `host:${alert.labels.instance}`, alert.labels?.job && `app:${alert.labels.job}`].filter(Boolean), host: alert.labels?.instance, app: alert.labels?.job, href: '/incidents', evidence: { state: boundedText(alert.state,40), severity: boundedText(alert.labels?.severity || 'not labelled',40), instance: boundedText(alert.labels?.instance || 'not labelled',120) }, raw: { alertname: name, state: boundedText(alert.state,40), activeAt: boundedText(alert.activeAt || '',80) }, sourceFreshness: 'current' }));
    });
    const unavailable = alertPayload?.status === 'unavailable';
    coverage.push({ source: 'prometheus-alerts', status: unavailable ? 'error' : 'current', checkedAt: generatedAt, detail: unavailable ? boundedText(alertPayload.error || 'Prometheus alerts unavailable.') : `${alerts.length} current alert records. Zero is only nominal when the source responded.`, eventCount: alerts.length });
  } else coverage.push({ source: 'prometheus-alerts', status: 'error', checkedAt: generatedAt, detail: sourceError(alertsResult), eventCount: 0 });

  if (securityResult.ok) {
    const security = securityResult.data;
    const timestamp = normalizeTimestamp(security.checkedAt, generatedAt);
    const signalCount = Number(security.auth?.failCount ?? 0) + Number(security.nginx?.errorCount ?? 0) + Number(security.firewall?.blockCount ?? 0) + Number(security.kernel?.issueCount ?? 0) + Number(security.system?.issueCount ?? 0);
    const missingHosts = (security.registeredHosts ?? []).filter((host:any) => !host.reporting);
    if (signalCount > 0 || missingHosts.length > 0) events.push(makeEvent({ source: 'security', sourceEventId: `snapshot:${timestamp.ts}`, eventType: 'security.snapshot', ...timestamp, severity: Number(security.kernel?.criticalCount ?? 0)+Number(security.system?.criticalCount ?? 0)>0?'critical':missingHosts.length?'warning':'info', title: 'Current security collector snapshot', detail: `${signalCount} bounded signals; ${missingHosts.length} registered coverage gaps. This is current state, not a historical event series.`, entityRefs: (security.hosts ?? []).map((host:any)=>`host:${host.id}`).slice(0,20), href: '/security', evidence: { signalCount, coverageGaps: missingHosts.length, activeBans: Number(security.fail2ban?.banned ?? 0), source: boundedText(security.source,80) }, raw: { checkedAt: timestamp.ts, source: boundedText(security.source,80), hasThreats: Boolean(security.hasThreats) }, sourceFreshness: security.stale ? 'stale' : security.source === 'empty-fallback' ? 'missing' : 'current' }));
    coverage.push({ source: 'security', status: security.source === 'empty-fallback' ? 'missing' : security.stale ? 'stale' : 'current', checkedAt: timestamp.ts, detail: security.source === 'empty-fallback' ? 'Security collector returned an empty fallback; zero signals are not nominal.' : `${signalCount} bounded current signals and ${missingHosts.length} coverage gaps.`, eventCount: signalCount > 0 || missingHosts.length ? 1 : 0 });
  } else coverage.push({ source: 'security', status: 'error', checkedAt: generatedAt, detail: sourceError(securityResult), eventCount: 0 });

  if (estateResult.ok) {
    const estate = estateResult.data;
    const timestamp = normalizeTimestamp(estate.summary?.checkedAt, generatedAt);
    const problematic = (estate.repos ?? []).filter((repo:any)=>repo.status==='critical'||repo.status==='warning');
    problematic.slice(0,20).forEach((repo:any)=>events.push(makeEvent({ source:'estate', sourceEventId:`snapshot:${repo.fullName}:${timestamp.ts}`, eventType:'estate.snapshot', ...timestamp, severity:repo.status==='critical'?'critical':'warning', title:`${boundedText(repo.name,120)} current estate ${repo.status}`, detail:'Current repository, dependency, and smoke aggregation. This is not persisted historical state.', entityRefs:[`app:${repo.fullName}`], app:repo.name, href:'/estate', evidence:{status:repo.status,productionBranch:boundedText(repo.productionBranch,80),smokeCount:Array.isArray(repo.smokes)?repo.smokes.length:0}, raw:{fullName:boundedText(repo.fullName,120),checkedAt:timestamp.ts,status:repo.status}, sourceFreshness:sourceStatusFromAge(timestamp.ts,now,10*60_000)})));
    coverage.push({source:'estate',status:sourceStatusFromAge(timestamp.ts,now,10*60_000),checkedAt:timestamp.ts,detail:`${estate.repos?.length ?? 0} current repository records; ${problematic.length} warning/critical snapshots emitted.`,eventCount:problematic.length});
  } else coverage.push({ source:'estate',status:'error',checkedAt:generatedAt,detail:sourceError(estateResult),eventCount:0 });

  coverage.push({ source: 'incidents', status: 'unsupported', checkedAt: generatedAt, detail: 'No dedicated incident event feed exists; incidents are currently derived in the client.', eventCount: 0 });

  const deduped = dedupeActivityEvents(events);
  const correlated = correlateActivityEvents(deduped);
  const items = correlated.events.slice(0, limit);
  const itemIds = new Set(items.map((item)=>item.eventId));
  const windows = correlated.windows.filter((window)=>window.eventIds.some((id)=>itemIds.has(id))).slice(0,40);
  const counts = items.reduce<Record<ActivitySeverity,number>>((result,item)=>{result[item.severity]=(result[item.severity]??0)+1;return result;},{healthy:0,warning:0,critical:0,info:0,neutral:0});
  const partialSources = coverage.filter((source)=>['stale','partial','missing','error'].includes(source.status));

  return NextResponse.json({
    ok: partialSources.length === 0,
    version: '2.0',
    ts: generatedAt,
    generatedAt,
    partial: partialSources.length > 0,
    partialSources: partialSources.map((source)=>source.source),
    count: items.length,
    counts,
    items,
    events: items,
    windows,
    coverage,
    capabilities: { historicalHealth: false, historicalEstate: false, historicalSecurity: false, causalAnalysis: false, persistedSavedViews: false },
  });
}
