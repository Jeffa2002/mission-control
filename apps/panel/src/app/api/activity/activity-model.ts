import { createHash } from 'node:crypto';

export type ActivitySeverity = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
export type TimestampQuality = 'observed' | 'fallback';
export type Relationship = 'confirmed' | 'correlated' | 'unknown';
export type SourceCoverageStatus = 'current' | 'stale' | 'partial' | 'missing' | 'error' | 'unsupported';

export type NormalizedActivityEvent = {
  eventId: string;
  id: string;
  source: string;
  sourceEventId?: string;
  eventType: string;
  ts: string;
  tsQuality: TimestampQuality;
  severity: ActivitySeverity;
  title: string;
  detail: string;
  entityRefs: string[];
  app?: string;
  host?: string;
  agentId?: string;
  environment?: string;
  href?: string;
  evidence: Record<string, string | number | boolean | null>;
  raw?: Record<string, string | number | boolean | null>;
  sourceFreshness: SourceCoverageStatus;
  relationship: Relationship;
  relationshipBasis: string;
  explicitLinkKey?: string;
  dedupeCount: number;
  memberEventIds: string[];
  provenance?: Record<string, unknown>;
};

export type ActivityCoverage = {
  source: string;
  status: SourceCoverageStatus;
  checkedAt: string;
  detail: string;
  eventCount: number;
};

export type CorrelationWindow = {
  windowId: string;
  relationship: Exclude<Relationship, 'unknown'>;
  basis: string;
  title: string;
  detail: string;
  startTs: string;
  endTs: string;
  entityRefs: string[];
  eventIds: string[];
  severity: ActivitySeverity;
};

const SEVERITY_RANK: Record<ActivitySeverity, number> = { critical: 5, warning: 4, info: 3, healthy: 2, neutral: 1 };

export function stableId(...parts: unknown[]) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex').slice(0, 20);
}

export function boundedText(value: unknown, max = 500) {
  return String(value ?? '')
    .replace(/(token|secret|password|authorization|cookie|private[_-]?key)=?\s*[^\s]+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\/(?:root|home|workspace|var\/www)\/[^\s]+/g, '[path redacted]')
    .slice(0, max);
}

export function normalizeTimestamp(value: unknown, fallbackIso: string): { ts: string; tsQuality: TimestampQuality } {
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return { ts: new Date(timestamp).toISOString(), tsQuality: 'observed' };
  }
  return { ts: fallbackIso, tsQuality: 'fallback' };
}

function dedupeKey(event: NormalizedActivityEvent) {
  return `${event.source}|${event.sourceEventId || event.eventId}`;
}

export function dedupeActivityEvents(events: NormalizedActivityEvent[]) {
  const groups = new Map<string, NormalizedActivityEvent[]>();
  events.forEach((event) => groups.set(dedupeKey(event), [...(groups.get(dedupeKey(event)) ?? []), event]));
  return [...groups.values()].map((members) => {
    const ordered = [...members].sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts) || left.eventId.localeCompare(right.eventId));
    const winner = ordered[0];
    return {
      ...winner,
      dedupeCount: members.length,
      memberEventIds: members.map((member) => member.eventId).sort(),
      severity: ordered.sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity])[0].severity,
    };
  }).sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts) || left.eventId.localeCompare(right.eventId));
}

export function correlateActivityEvents(events: NormalizedActivityEvent[], proximityMs = 30 * 60_000) {
  const windows: CorrelationWindow[] = [];
  const membership = new Map<string, { relationship: Relationship; basis: string }>();
  const explicit = new Map<string, NormalizedActivityEvent[]>();
  events.forEach((event) => {
    if (event.explicitLinkKey) explicit.set(event.explicitLinkKey, [...(explicit.get(event.explicitLinkKey) ?? []), event]);
  });
  explicit.forEach((members, key) => {
    if (members.length < 2) return;
    const ordered = [...members].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const eventIds = ordered.map((event) => event.eventId);
    const basis = `Explicit linkage key ${key} is shared by ${members.length} source records.`;
    windows.push({ windowId: `confirmed:${stableId(key, ...eventIds)}`, relationship: 'confirmed', basis, title: 'Explicitly linked activity', detail: 'Records share an explicit source linkage key. This confirms association, not causation.', startTs: ordered[0].ts, endTs: ordered.at(-1)!.ts, entityRefs: [...new Set(ordered.flatMap((event) => event.entityRefs))], eventIds, severity: ordered.sort((a,b)=>SEVERITY_RANK[b.severity]-SEVERITY_RANK[a.severity])[0].severity });
    members.forEach((event) => membership.set(event.eventId, { relationship: 'confirmed', basis }));
  });

  const byEntity = new Map<string, NormalizedActivityEvent[]>();
  events.forEach((event) => event.entityRefs.forEach((entity) => byEntity.set(entity, [...(byEntity.get(entity) ?? []), event])));
  byEntity.forEach((entityEvents, entity) => {
    const ordered = [...entityEvents].sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts) || left.eventId.localeCompare(right.eventId));
    const clusters: NormalizedActivityEvent[][] = [];
    ordered.forEach((event) => {
      const cluster = clusters.at(-1);
      const previous = cluster?.at(-1);
      if (!previous || Date.parse(event.ts) - Date.parse(previous.ts) > proximityMs) clusters.push([event]);
      else cluster.push(event);
    });
    clusters.forEach((cluster) => {
      const sources = new Set(cluster.map((event) => event.source));
      if (cluster.length < 2 || sources.size < 2) return;
      const eventIds = cluster.map((event) => event.eventId);
      const spanMinutes = Math.max(1, Math.round((Date.parse(cluster.at(-1)!.ts) - Date.parse(cluster[0].ts)) / 60_000));
      const basis = `Same entity (${entity}) observed across ${sources.size} sources within ${spanMinutes} minutes.`;
      windows.push({ windowId: `correlated:${stableId(entity, ...eventIds)}`, relationship: 'correlated', basis, title: `${entity} activity window`, detail: 'Events are associated by entity and bounded time proximity. No causal relationship is asserted.', startTs: cluster[0].ts, endTs: cluster.at(-1)!.ts, entityRefs: [entity], eventIds, severity: [...cluster].sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity])[0].severity });
      cluster.forEach((event) => { if (!membership.has(event.eventId)) membership.set(event.eventId, { relationship: 'correlated', basis }); });
    });
  });

  const projected = events.map((event) => {
    const linked = membership.get(event.eventId);
    return { ...event, relationship: linked?.relationship ?? 'unknown', relationshipBasis: linked?.basis ?? 'No explicit linkage or same-entity bounded-time association was found.' };
  });
  windows.sort((a,b)=>Date.parse(b.endTs)-Date.parse(a.endTs)||a.windowId.localeCompare(b.windowId));
  return { events: projected, windows };
}
