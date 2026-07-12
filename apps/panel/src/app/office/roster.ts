export const CANONICAL_AGENT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  main: 'archie',
  archie: 'archie',
  designer: 'nova',
  nova: 'nova',
  research: 'scout',
  scout: 'scout',
  sec: 'secspy',
  secspy: 'secspy',
  'archie-pro': 'archie-pro',
});

export const SNAPSHOT_FRESH_MS = 2 * 60_000;
export const ACTIVE_LAST_SEEN_MS = 20 * 60_000;
export const WORKING_LAST_SEEN_MS = 2 * 60_000;
export const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export type UpstreamAgentStatus = 'Working' | 'Idle' | 'Offline';
export type ActiveAgentStatus = 'Working' | 'Idle';

export interface RawAgentStatus {
  id: string;
  label?: string;
  emoji?: string;
  busy?: boolean;
  status?: string;
  lastSeen?: string | null;
  currentTask?: string | null;
  sessionId?: string | null;
}

export interface ActiveRosterAgent {
  id: string;
  canonicalId: string;
  sourceId: string;
  sourceIds: string[];
  suppressedSourceIds: string[];
  label: string;
  emoji: string;
  busy: boolean;
  status: ActiveAgentStatus;
  upstreamStatus: UpstreamAgentStatus;
  lastSeen: string;
  currentTask: string | null;
  sessionId: string | null;
}

export interface RosterHealth {
  state: 'fresh' | 'stale' | 'clock-skew' | 'invalid';
  snapshotAt: string | null;
  detail: string;
  invalidLastSeenIds: string[];
  futureLastSeenIds: string[];
}

export interface ActiveRosterResult {
  agents: ActiveRosterAgent[];
  health: RosterHealth;
  canonicalCount: number;
  suppressedCount: number;
}

function canonicalId(rawId: string) {
  const normalized = rawId.trim().toLowerCase();
  return CANONICAL_AGENT_ALIASES[normalized] ?? normalized;
}

function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function statusRank(status?: string) {
  if (status === 'Working') return 3;
  if (status === 'Idle') return 2;
  if (status === 'Offline') return 1;
  return 0;
}

function compareRepresentations(left: RawAgentStatus, right: RawAgentStatus) {
  const leftSeen = parseIsoTimestamp(left.lastSeen) ?? Number.NEGATIVE_INFINITY;
  const rightSeen = parseIsoTimestamp(right.lastSeen) ?? Number.NEGATIVE_INFINITY;
  if (leftSeen !== rightSeen) return rightSeen - leftSeen;
  const statusDifference = statusRank(right.status) - statusRank(left.status);
  if (statusDifference) return statusDifference;
  const busyDifference = Number(Boolean(right.busy)) - Number(Boolean(left.busy));
  if (busyDifference) return busyDifference;
  const sessionDifference = Number(Boolean(right.sessionId)) - Number(Boolean(left.sessionId));
  if (sessionDifference) return sessionDifference;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function activeStatus(agent: RawAgentStatus, nowMs: number): ActiveAgentStatus | null {
  if (agent.status !== 'Working' && agent.status !== 'Idle') return null;
  const lastSeenMs = parseIsoTimestamp(agent.lastSeen);
  if (lastSeenMs === null) return null;
  const age = nowMs - lastSeenMs;
  if (age < -MAX_FUTURE_SKEW_MS || age > ACTIVE_LAST_SEEN_MS) return null;
  if (agent.status === 'Working' && age <= WORKING_LAST_SEEN_MS) return 'Working';
  return 'Idle';
}

export function buildActiveRoster(rawAgents: RawAgentStatus[], snapshotAt: unknown, nowMs = Date.now()): ActiveRosterResult {
  const snapshotMs = parseIsoTimestamp(snapshotAt);
  const snapshotAge = snapshotMs === null ? null : nowMs - snapshotMs;
  const invalidLastSeenIds = rawAgents.filter((agent) => parseIsoTimestamp(agent.lastSeen) === null).map((agent) => agent.id).sort();
  const futureLastSeenIds = rawAgents.filter((agent) => {
    const timestamp = parseIsoTimestamp(agent.lastSeen);
    return timestamp !== null && timestamp - nowMs > MAX_FUTURE_SKEW_MS;
  }).map((agent) => agent.id).sort();

  let state: RosterHealth['state'] = 'fresh';
  let detail = 'Collector snapshot is fresh.';
  if (snapshotMs === null) {
    state = 'invalid';
    detail = 'Collector snapshot timestamp is missing or invalid.';
  } else if (snapshotAge! < -MAX_FUTURE_SKEW_MS) {
    state = 'clock-skew';
    detail = 'Collector snapshot timestamp is more than five minutes in the future.';
  } else if (snapshotAge! > SNAPSHOT_FRESH_MS) {
    state = 'stale';
    detail = 'Collector snapshot is older than two minutes.';
  } else if (futureLastSeenIds.length) {
    state = 'clock-skew';
    detail = `${futureLastSeenIds.length} agent timestamp${futureLastSeenIds.length === 1 ? ' is' : 's are'} more than five minutes in the future.`;
  }

  const groups = new Map<string, RawAgentStatus[]>();
  rawAgents.forEach((agent) => {
    if (!agent.id?.trim()) return;
    const id = canonicalId(agent.id);
    groups.set(id, [...(groups.get(id) ?? []), agent]);
  });

  const snapshotFresh = snapshotMs !== null && snapshotAge! >= -MAX_FUTURE_SKEW_MS && snapshotAge! <= SNAPSHOT_FRESH_MS;
  const agents: ActiveRosterAgent[] = [];
  let suppressedCount = 0;

  groups.forEach((representations, id) => {
    const trusted = representations.filter((agent) => {
      const timestamp = parseIsoTimestamp(agent.lastSeen);
      return timestamp !== null && timestamp - nowMs <= MAX_FUTURE_SKEW_MS;
    });
    const orderedTrusted = [...trusted].sort(compareRepresentations);
    const orderedUntrusted = representations.filter((agent) => !trusted.includes(agent)).sort(compareRepresentations);
    const ordered = [...orderedTrusted, ...orderedUntrusted];
    const winner = ordered[0];
    const status = snapshotFresh ? activeStatus(winner, nowMs) : null;
    suppressedCount += Math.max(0, ordered.length - 1);
    if (!status) return;
    const sourceIds = ordered.map((agent) => agent.id);
    agents.push({
      id,
      canonicalId: id,
      sourceId: winner.id,
      sourceIds,
      suppressedSourceIds: sourceIds.slice(1),
      label: winner.label?.trim() || id.replace(/(^|-)(\w)/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`),
      emoji: winner.emoji || '🤖',
      busy: Boolean(winner.busy),
      status,
      upstreamStatus: winner.status as UpstreamAgentStatus,
      lastSeen: winner.lastSeen as string,
      currentTask: winner.currentTask?.trim() || null,
      sessionId: winner.sessionId?.trim() || null,
    });
  });

  agents.sort((left, right) => {
    if (left.status !== right.status) return left.status === 'Working' ? -1 : 1;
    const seenDifference = Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
    if (seenDifference) return seenDifference;
    const busyDifference = Number(right.busy) - Number(left.busy);
    if (busyDifference) return busyDifference;
    const taskDifference = Number(Boolean(right.currentTask)) - Number(Boolean(left.currentTask));
    if (taskDifference) return taskDifference;
    return left.canonicalId < right.canonicalId ? -1 : left.canonicalId > right.canonicalId ? 1 : 0;
  });

  return {
    agents,
    health: {
      state,
      snapshotAt: typeof snapshotAt === 'string' ? snapshotAt : null,
      detail,
      invalidLastSeenIds,
      futureLastSeenIds,
    },
    canonicalCount: groups.size,
    suppressedCount,
  };
}
