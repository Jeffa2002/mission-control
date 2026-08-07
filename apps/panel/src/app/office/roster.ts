export const CANONICAL_AGENT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  main: 'archie', archie: 'archie', designer: 'nova', nova: 'nova', research: 'scout', scout: 'scout',
  sec: 'secspy', secspy: 'secspy', product: 'piper', piper: 'piper', writer: 'quin', quin: 'quin',
  travel: 'bazza-travel', 'bazza-travel': 'bazza-travel', rook: 'rook', dev: 'dev', 'archie-pro': 'archie-pro',
});

export const TEAM_ROLE_DIRECTORY = Object.freeze([
  { canonicalId: 'archie', role: 'Lead Assistant', name: 'Archie', emoji: '🤖' },
  { canonicalId: 'nova', role: 'Designer', name: 'Nova', emoji: '🎨' },
  { canonicalId: 'scout', role: 'Research', name: 'Scout', emoji: '🔍' },
  { canonicalId: 'secspy', role: 'Security', name: 'SecSpy', emoji: '🕵️' },
  { canonicalId: 'dev', role: 'Developer', name: 'Dev', emoji: '👨‍💻' },
  { canonicalId: 'quin', role: 'Writer', name: 'Quin', emoji: '✍️' },
  { canonicalId: 'piper', role: 'Product & Growth', name: 'Piper', emoji: '📈' },
  { canonicalId: 'rook', role: 'Reliability', name: 'Rook', emoji: '🏰' },
  { canonicalId: 'bazza-travel', role: 'Travel Assistant', name: 'Bazza-Travel', emoji: '🧳' },
] as const);

export const SNAPSHOT_FRESH_MS = 2 * 60_000;
export const ACTIVE_LAST_SEEN_MS = 20 * 60_000;
export const WORKING_LAST_SEEN_MS = 2 * 60_000;
export const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export type UpstreamAgentStatus = 'Working' | 'Idle' | 'Offline';
export type CanonicalAvailability = 'Working' | 'Available' | 'Inactive' | 'Unconfirmed';
export type ActiveAgentStatus = 'Working' | 'Idle';

export interface RawAgentStatus {
  id: string; label?: string; emoji?: string; busy?: boolean; status?: string; lastSeen?: string | null;
  currentTask?: string | null; sessionId?: string | null; model?: string | null;
  work?: SafeWorkProjection | null;
}

export interface CanonicalAgentIdentity {
  canonicalId: string;
  sourceId: string;
  sourceIds: string[];
  suppressedSourceIds: string[];
  label: string;
  emoji: string;
  busy: boolean;
  availability: CanonicalAvailability;
  upstreamStatus: UpstreamAgentStatus | 'Unknown';
  lastSeen: string | null;
  currentTask: string | null;
  sessionId: string | null;
  model: string | null;
  work: SafeWorkProjection | null;
  inactiveReason: string | null;
}

export interface ActiveRosterAgent extends CanonicalAgentIdentity {
  id: string;
  status: ActiveAgentStatus;
  lastSeen: string;
  upstreamStatus: UpstreamAgentStatus;
}

export interface RosterHealth {
  state: 'fresh' | 'stale' | 'clock-skew' | 'invalid';
  snapshotAt: string | null;
  detail: string;
  invalidLastSeenIds: string[];
  futureLastSeenIds: string[];
}

export interface CanonicalRosterProjection {
  identities: CanonicalAgentIdentity[];
  active: CanonicalAgentIdentity[];
  health: RosterHealth;
  canonicalCount: number;
  suppressedCount: number;
}

export interface TeamRoleEntry {
  canonicalId: string;
  role: string;
  name: string;
  emoji: string;
  identity: CanonicalAgentIdentity | null;
  availability: CanonicalAvailability;
}

export interface TeamDirectoryProjection {
  roles: TeamRoleEntry[];
  active: CanonicalAgentIdentity[];
  unassignedActive: CanonicalAgentIdentity[];
  aliasHistory: Array<{ canonicalId: string; sourceId: string; keptSourceId: string; reason: string }>;
  health: RosterHealth;
}

export interface ActiveRosterResult {
  agents: ActiveRosterAgent[];
  health: RosterHealth;
  canonicalCount: number;
  suppressedCount: number;
}

export function canonicalAgentId(rawId: string) {
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

function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }

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
  return lexical(left.id, right.id);
}

function availabilityFor(agent: RawAgentStatus, snapshotFresh: boolean, nowMs: number): { availability: CanonicalAvailability; reason: string | null } {
  if (!snapshotFresh) return { availability: 'Unconfirmed', reason: 'Collector snapshot is not fresh.' };
  const lastSeenMs = parseIsoTimestamp(agent.lastSeen);
  if (lastSeenMs === null) return { availability: 'Inactive', reason: 'Last seen is missing or invalid.' };
  const age = nowMs - lastSeenMs;
  if (age < -MAX_FUTURE_SKEW_MS) return { availability: 'Inactive', reason: 'Last seen is more than five minutes in the future.' };
  if (age > ACTIVE_LAST_SEEN_MS) return { availability: 'Inactive', reason: 'Last seen is older than 20 minutes.' };
  if (agent.status === 'Offline') return { availability: 'Inactive', reason: 'Upstream status is Offline.' };
  if (agent.status !== 'Working' && agent.status !== 'Idle') return { availability: 'Inactive', reason: 'Upstream status is not active.' };
  if (agent.status === 'Working' && age <= WORKING_LAST_SEEN_MS) return { availability: 'Working', reason: null };
  return { availability: 'Available', reason: agent.status === 'Working' ? 'Working heartbeat aged beyond two minutes.' : null };
}

function activeSort(left: CanonicalAgentIdentity, right: CanonicalAgentIdentity) {
  if (left.availability !== right.availability) return left.availability === 'Working' ? -1 : 1;
  const seenDifference = Date.parse(right.lastSeen ?? '') - Date.parse(left.lastSeen ?? '');
  if (Number.isFinite(seenDifference) && seenDifference) return seenDifference;
  return lexical(left.canonicalId, right.canonicalId);
}

export function buildCanonicalRoster(rawAgents: RawAgentStatus[], snapshotAt: unknown, nowMs = Date.now()): CanonicalRosterProjection {
  const snapshotMs = parseIsoTimestamp(snapshotAt);
  const snapshotAge = snapshotMs === null ? null : nowMs - snapshotMs;
  const invalidLastSeenIds = rawAgents.filter((agent) => parseIsoTimestamp(agent.lastSeen) === null).map((agent) => agent.id).sort();
  const futureLastSeenIds = rawAgents.filter((agent) => {
    const timestamp = parseIsoTimestamp(agent.lastSeen);
    return timestamp !== null && timestamp - nowMs > MAX_FUTURE_SKEW_MS;
  }).map((agent) => agent.id).sort();

  let state: RosterHealth['state'] = 'fresh';
  let detail = 'Collector snapshot is fresh.';
  if (snapshotMs === null) { state = 'invalid'; detail = 'Collector snapshot timestamp is missing or invalid.'; }
  else if (snapshotAge! < -MAX_FUTURE_SKEW_MS) { state = 'clock-skew'; detail = 'Collector snapshot timestamp is more than five minutes in the future.'; }
  else if (snapshotAge! > SNAPSHOT_FRESH_MS) { state = 'stale'; detail = 'Collector snapshot is older than two minutes.'; }
  else if (futureLastSeenIds.length) { state = 'clock-skew'; detail = `${futureLastSeenIds.length} agent timestamp${futureLastSeenIds.length === 1 ? ' is' : 's are'} more than five minutes in the future.`; }

  const groups = new Map<string, RawAgentStatus[]>();
  rawAgents.forEach((agent) => {
    if (!agent.id?.trim()) return;
    const id = canonicalAgentId(agent.id);
    groups.set(id, [...(groups.get(id) ?? []), agent]);
  });

  const snapshotFresh = snapshotMs !== null && snapshotAge! >= -MAX_FUTURE_SKEW_MS && snapshotAge! <= SNAPSHOT_FRESH_MS;
  let suppressedCount = 0;
  const identities: CanonicalAgentIdentity[] = [];

  groups.forEach((representations, id) => {
    const trusted = representations.filter((agent) => {
      const timestamp = parseIsoTimestamp(agent.lastSeen);
      return timestamp !== null && timestamp - nowMs <= MAX_FUTURE_SKEW_MS;
    });
    const ordered = [
      ...[...trusted].sort(compareRepresentations),
      ...representations.filter((agent) => !trusted.includes(agent)).sort(compareRepresentations),
    ];
    const winner = ordered[0];
    const sourceIds = ordered.map((agent) => agent.id);
    const availability = availabilityFor(winner, snapshotFresh, nowMs);
    suppressedCount += Math.max(0, ordered.length - 1);
    identities.push({
      canonicalId: id,
      sourceId: winner.id,
      sourceIds,
      suppressedSourceIds: sourceIds.slice(1),
      label: winner.label?.trim() || id.replace(/(^|-)(\w)/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`),
      emoji: winner.emoji || '🤖',
      busy: Boolean(winner.busy),
      availability: availability.availability,
      upstreamStatus: statusRank(winner.status) ? winner.status as UpstreamAgentStatus : 'Unknown',
      lastSeen: parseIsoTimestamp(winner.lastSeen) === null ? null : winner.lastSeen as string,
      currentTask: winner.currentTask?.trim() || null,
      sessionId: winner.sessionId?.trim() || null,
      model: winner.model?.trim() || null,
      work: winner.work ?? null,
      inactiveReason: availability.reason,
    });
  });

  identities.sort((left, right) => lexical(left.canonicalId, right.canonicalId));
  const active = identities.filter((identity) => identity.availability === 'Working' || identity.availability === 'Available').sort(activeSort);
  return { identities, active, health: { state, snapshotAt: typeof snapshotAt === 'string' ? snapshotAt : null, detail, invalidLastSeenIds, futureLastSeenIds }, canonicalCount: groups.size, suppressedCount };
}

export function buildActiveRoster(rawAgents: RawAgentStatus[], snapshotAt: unknown, nowMs = Date.now()): ActiveRosterResult {
  const projection = buildCanonicalRoster(rawAgents, snapshotAt, nowMs);
  const agents = projection.active.map((identity): ActiveRosterAgent => ({
    ...identity,
    id: identity.canonicalId,
    status: identity.availability === 'Working' ? 'Working' : 'Idle',
    lastSeen: identity.lastSeen as string,
    upstreamStatus: identity.upstreamStatus as UpstreamAgentStatus,
  })).sort((left, right) => {
    if (left.status !== right.status) return left.status === 'Working' ? -1 : 1;
    const seenDifference = Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
    if (seenDifference) return seenDifference;
    const busyDifference = Number(right.busy) - Number(left.busy);
    if (busyDifference) return busyDifference;
    const taskDifference = Number(Boolean(right.currentTask)) - Number(Boolean(left.currentTask));
    if (taskDifference) return taskDifference;
    return lexical(left.canonicalId, right.canonicalId);
  });
  return { agents, health: projection.health, canonicalCount: projection.canonicalCount, suppressedCount: projection.suppressedCount };
}

export function buildTeamDirectory(rawAgents: RawAgentStatus[], snapshotAt: unknown, nowMs = Date.now()): TeamDirectoryProjection {
  const projection = buildCanonicalRoster(rawAgents, snapshotAt, nowMs);
  const identities = new Map(projection.identities.map((identity) => [identity.canonicalId, identity]));
  const configuredIds = new Set<string>(TEAM_ROLE_DIRECTORY.map((role) => role.canonicalId));
  const roles = TEAM_ROLE_DIRECTORY.map((role) => {
    const identity = identities.get(role.canonicalId) ?? null;
    return { ...role, identity, availability: identity?.availability ?? (projection.health.state === 'fresh' ? 'Inactive' : 'Unconfirmed') };
  });
  const unassignedActive = projection.active.filter((identity) => !configuredIds.has(identity.canonicalId));
  const aliasHistory = projection.identities.flatMap((identity) => identity.suppressedSourceIds.map((sourceId) => ({
    canonicalId: identity.canonicalId,
    sourceId,
    keptSourceId: identity.sourceId,
    reason: `Suppressed alias; ${identity.sourceId} has the winning canonical representation.`,
  })));
  return { roles, active: projection.active, unassignedActive, aliasHistory, health: projection.health };
}
import type { SafeWorkProjection } from '../api/agents/status/safe-work-model';
