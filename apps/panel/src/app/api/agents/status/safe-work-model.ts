export const SAFE_WORK_STATUSES = [
  'queued', 'running', 'waiting_for_tool', 'waiting_for_approval', 'blocked', 'retrying',
  'completed', 'failed', 'cancelled', 'stale', 'unknown',
] as const;

export type SafeWorkStatus = typeof SAFE_WORK_STATUSES[number];
export type WorkFreshness = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface SafeWorkProjection {
  workId: string;
  parentWorkId: string | null;
  source: 'session' | 'task' | 'cron' | 'subagent' | 'acp' | 'unknown';
  title: string | null;
  goal: string | null;
  status: SafeWorkStatus;
  phase: 'intake' | 'research' | 'implementation' | 'validation' | 'delivery' | 'unknown';
  startedAt: string | null;
  lastEventAt: string | null;
  elapsedMs: number | null;
  freshness: WorkFreshness;
  lastEvent: { category: 'lifecycle' | 'tool' | 'approval' | 'child' | 'retry' | 'blocker' | 'unknown'; summary: string } | null;
  childCount: number;
  blockerCategory: 'approval' | 'tool' | 'dependency' | 'resource' | 'policy' | 'unknown' | null;
  progress: { kind: 'indeterminate' } | { kind: 'milestones'; completed: number; total: number; unit: string };
}

export interface SafeAgentSnapshot {
  id: string;
  label: string;
  emoji: string;
  busy: boolean;
  status: 'Working' | 'Idle' | 'Offline';
  lastSeen: string | null;
  work: SafeWorkProjection | null;
}

export interface SafeStatusSnapshot {
  schemaVersion: 1;
  ok: boolean;
  ts: string;
  agents: SafeAgentSnapshot[];
}

const SNAPSHOT_KEYS = new Set(['schemaVersion', 'ok', 'ts', 'agents']);
const AGENT_KEYS = new Set(['id', 'label', 'emoji', 'busy', 'status', 'lastSeen', 'work']);
const WORK_KEYS = new Set(['workId', 'parentWorkId', 'source', 'title', 'goal', 'status', 'phase', 'startedAt', 'lastEventAt', 'elapsedMs', 'freshness', 'lastEvent', 'childCount', 'blockerCategory', 'progress']);
const EVENT_KEYS = new Set(['category', 'summary']);
const PROGRESS_KEYS = new Set(['kind', 'completed', 'total', 'unit']);
const FORBIDDEN_KEYS = /^(?:prompt|thinking|reasoning|content|message|toolInput|toolOutput|toolArguments|toolResult|command|environment|env|tokens?|logs?|transcript)$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertKeys(value: Record<string, unknown>, allowed: Set<string>, path: string) {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.test(key)) throw new Error(`${path}.${key} is forbidden`);
    if (!allowed.has(key)) throw new Error(`${path}.${key} is not allowed`);
  }
}

function safeId(value: unknown, path: string) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) throw new Error(`${path} is invalid`);
  return value;
}

export function redactDeclaredText(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('declared text must be a string');
  const singleLine = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!singleLine) return null;
  return singleLine
    .replace(/\b(?:bearer|token|password|secret|api[-_ ]?key)\s*[:=]?\s*[^\s]+/gi, '[redacted]')
    .replace(/(?:^|\s)(?:\/[\w.-]+){2,}(?=\s|$)/g, ' [redacted-path]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]');
}

function timestamp(value: unknown, path: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${path} is invalid`);
  return value;
}

function parseWork(value: unknown, path: string): SafeWorkProjection | null {
  if (value == null) return null;
  if (!record(value)) throw new Error(`${path} must be an object`);
  assertKeys(value, WORK_KEYS, path);
  const statuses = new Set<string>(SAFE_WORK_STATUSES);
  const sources = new Set(['session', 'task', 'cron', 'subagent', 'acp', 'unknown']);
  const phases = new Set(['intake', 'research', 'implementation', 'validation', 'delivery', 'unknown']);
  const freshness = new Set(['fresh', 'aging', 'stale', 'unknown']);
  const blockers = new Set(['approval', 'tool', 'dependency', 'resource', 'policy', 'unknown']);
  if (!statuses.has(String(value.status))) throw new Error(`${path}.status is invalid`);
  if (!sources.has(String(value.source))) throw new Error(`${path}.source is invalid`);
  if (!phases.has(String(value.phase))) throw new Error(`${path}.phase is invalid`);
  if (!freshness.has(String(value.freshness))) throw new Error(`${path}.freshness is invalid`);

  let lastEvent: SafeWorkProjection['lastEvent'] = null;
  if (value.lastEvent != null) {
    if (!record(value.lastEvent)) throw new Error(`${path}.lastEvent must be an object`);
    assertKeys(value.lastEvent, EVENT_KEYS, `${path}.lastEvent`);
    const categories = new Set(['lifecycle', 'tool', 'approval', 'child', 'retry', 'blocker', 'unknown']);
    if (!categories.has(String(value.lastEvent.category))) throw new Error(`${path}.lastEvent.category is invalid`);
    const summary = redactDeclaredText(value.lastEvent.summary);
    if (!summary) throw new Error(`${path}.lastEvent.summary is required`);
    lastEvent = { category: value.lastEvent.category as NonNullable<SafeWorkProjection['lastEvent']>['category'], summary };
  }

  if (!record(value.progress)) throw new Error(`${path}.progress must be an object`);
  assertKeys(value.progress, PROGRESS_KEYS, `${path}.progress`);
  let progress: SafeWorkProjection['progress'];
  if (value.progress.kind === 'indeterminate') {
    if (Object.keys(value.progress).length !== 1) throw new Error(`${path}.progress has undeclared milestone fields`);
    progress = { kind: 'indeterminate' };
  } else if (value.progress.kind === 'milestones') {
    const completed = Number(value.progress.completed);
    const total = Number(value.progress.total);
    const unit = redactDeclaredText(value.progress.unit);
    if (!Number.isInteger(completed) || !Number.isInteger(total) || completed < 0 || total < 1 || completed > total || !unit) throw new Error(`${path}.progress is invalid`);
    progress = { kind: 'milestones', completed, total, unit };
  } else throw new Error(`${path}.progress.kind is invalid`);

  const elapsedMs = value.elapsedMs == null ? null : Number(value.elapsedMs);
  const childCount = Number(value.childCount);
  if (elapsedMs !== null && (!Number.isFinite(elapsedMs) || elapsedMs < 0)) throw new Error(`${path}.elapsedMs is invalid`);
  if (!Number.isInteger(childCount) || childCount < 0) throw new Error(`${path}.childCount is invalid`);
  if (value.blockerCategory != null && !blockers.has(String(value.blockerCategory))) throw new Error(`${path}.blockerCategory is invalid`);

  return {
    workId: safeId(value.workId, `${path}.workId`),
    parentWorkId: value.parentWorkId == null ? null : safeId(value.parentWorkId, `${path}.parentWorkId`),
    source: value.source as SafeWorkProjection['source'],
    title: redactDeclaredText(value.title), goal: redactDeclaredText(value.goal),
    status: value.status as SafeWorkStatus, phase: value.phase as SafeWorkProjection['phase'],
    startedAt: timestamp(value.startedAt, `${path}.startedAt`), lastEventAt: timestamp(value.lastEventAt, `${path}.lastEventAt`),
    elapsedMs, freshness: value.freshness as WorkFreshness, lastEvent, childCount,
    blockerCategory: value.blockerCategory == null ? null : value.blockerCategory as SafeWorkProjection['blockerCategory'], progress,
  };
}

export function parseSafeStatusSnapshot(value: unknown): SafeStatusSnapshot {
  if (!record(value)) throw new Error('snapshot must be an object');
  assertKeys(value, SNAPSHOT_KEYS, 'snapshot');
  if (value.schemaVersion !== 1 || typeof value.ok !== 'boolean' || !Array.isArray(value.agents)) throw new Error('snapshot contract is invalid');
  const ts = timestamp(value.ts, 'snapshot.ts');
  if (!ts) throw new Error('snapshot.ts is required');
  const agents = value.agents.map((candidate, index): SafeAgentSnapshot => {
    const path = `snapshot.agents[${index}]`;
    if (!record(candidate)) throw new Error(`${path} must be an object`);
    assertKeys(candidate, AGENT_KEYS, path);
    if (typeof candidate.busy !== 'boolean' || !['Working', 'Idle', 'Offline'].includes(String(candidate.status))) throw new Error(`${path} contract is invalid`);
    const label = redactDeclaredText(candidate.label);
    const emoji = redactDeclaredText(candidate.emoji);
    if (!label || !emoji) throw new Error(`${path} identity is invalid`);
    return { id: safeId(candidate.id, `${path}.id`), label, emoji, busy: candidate.busy, status: candidate.status as SafeAgentSnapshot['status'], lastSeen: timestamp(candidate.lastSeen, `${path}.lastSeen`), work: parseWork(candidate.work, `${path}.work`) };
  });
  return { schemaVersion: 1, ok: value.ok, ts, agents };
}

export function reconcileSafeAgents(agents: SafeAgentSnapshot[]): SafeAgentSnapshot[] {
  const byId = new Map<string, SafeAgentSnapshot>();
  for (const agent of agents) {
    const existing = byId.get(agent.id);
    if (!existing || Date.parse(agent.lastSeen ?? '') > Date.parse(existing.lastSeen ?? '') || (!existing.work && agent.work)) byId.set(agent.id, agent);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}
