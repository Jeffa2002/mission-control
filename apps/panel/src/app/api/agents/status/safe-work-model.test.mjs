import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSafeStatusSnapshot, reconcileSafeAgents, redactDeclaredText } from './safe-work-model.ts';

const work = (overrides = {}) => ({
  workId: 'work-1', parentWorkId: null, source: 'task', title: 'Safe declared title', goal: null,
  status: 'running', phase: 'unknown', startedAt: '2026-07-13T01:00:00.000Z',
  lastEventAt: '2026-07-13T01:01:00.000Z', elapsedMs: 60_000, freshness: 'fresh',
  lastEvent: { category: 'lifecycle', summary: 'Task running' }, childCount: 0,
  blockerCategory: null, progress: { kind: 'indeterminate' }, ...overrides,
});

const snapshot = (agents) => ({ schemaVersion: 1, ok: true, ts: '2026-07-13T01:01:00.000Z', agents });
const agent = (overrides = {}) => ({ id: 'dev', label: 'Dev', emoji: '🛠️', busy: true, status: 'Working', lastSeen: '2026-07-13T01:01:00.000Z', work: work(), ...overrides });

test('rejects transcript and unknown schema fields', () => {
  assert.throws(() => parseSafeStatusSnapshot(snapshot([{ ...agent(), transcript: 'private' }])), /forbidden/);
  assert.throws(() => parseSafeStatusSnapshot(snapshot([{ ...agent(), work: { ...work(), toolArguments: { secret: true } } }])), /forbidden/);
  assert.throws(() => parseSafeStatusSnapshot({ ...snapshot([agent()]), extra: true }), /not allowed/);
});

test('redacts credential, path, and email patterns in declared text', () => {
  const redacted = redactDeclaredText('Deploy token=abc /root/private/file ops@example.com');
  assert.equal(redacted?.includes('abc'), false);
  assert.equal(redacted?.includes('/root/private/file'), false);
  assert.equal(redacted?.includes('ops@example.com'), false);
});

test('accepts explicit stale and unknown states without inventing progress', () => {
  const parsed = parseSafeStatusSnapshot(snapshot([
    agent({ work: work({ status: 'stale', freshness: 'stale', title: null }) }),
    agent({ id: 'scout', label: 'Scout', busy: false, status: 'Idle', work: work({ workId: 'work-2', status: 'unknown', freshness: 'unknown', startedAt: null, elapsedMs: null }) }),
  ]));
  assert.equal(parsed.agents[0].work?.status, 'stale');
  assert.deepEqual(parsed.agents[1].work?.progress, { kind: 'indeterminate' });
});

test('dedupe keeps the freshest canonical agent projection', () => {
  const result = reconcileSafeAgents([
    agent({ lastSeen: '2026-07-13T01:00:00.000Z', work: null }),
    agent({ lastSeen: '2026-07-13T01:02:00.000Z', work: work({ workId: 'new-work' }) }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].work?.workId, 'new-work');
});

test('preserves allowlisted parent and child relationships', () => {
  const parsed = parseSafeStatusSnapshot(snapshot([
    agent({ work: work({ workId: 'parent', childCount: 1 }) }),
    agent({ id: 'scout', label: 'Scout', work: work({ workId: 'child', parentWorkId: 'parent', source: 'subagent' }) }),
  ]));
  assert.equal(parsed.agents[0].work?.childCount, 1);
  assert.equal(parsed.agents[1].work?.parentWorkId, 'parent');
});
