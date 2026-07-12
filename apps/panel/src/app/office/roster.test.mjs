import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActiveRoster } from './roster.ts';

const now = Date.parse('2026-07-13T08:00:00.000Z');
const snapshot = '2026-07-13T07:59:30.000Z';
const agent = (id, overrides = {}) => ({ id, label: id, emoji: '•', busy: false, status: 'Idle', lastSeen: '2026-07-13T07:55:00.000Z', currentTask: null, sessionId: null, ...overrides });

test('canonical aliases deduplicate while archie-pro stays separate', () => {
  const result = buildActiveRoster([
    agent('archie', { lastSeen: '2026-07-13T07:54:00.000Z' }),
    agent('main', { label: 'Archie current', lastSeen: '2026-07-13T07:59:00.000Z' }),
    agent('designer'), agent('nova', { lastSeen: '2026-07-13T07:56:00.000Z' }),
    agent('research'), agent('scout', { lastSeen: '2026-07-13T07:56:00.000Z' }),
    agent('sec'), agent('secspy', { lastSeen: '2026-07-13T07:56:00.000Z' }),
    agent('archie-pro'), agent('custom'),
  ], snapshot, now);
  assert.deepEqual(result.agents.map((item) => item.canonicalId).sort(), ['archie', 'archie-pro', 'custom', 'nova', 'scout', 'secspy']);
  const archie = result.agents.find((item) => item.canonicalId === 'archie');
  assert.equal(archie?.sourceId, 'main');
  assert.deepEqual(archie?.suppressedSourceIds, ['archie']);
});

test('equal timestamps use status, busy, session, then lexical raw id tie-breaks', () => {
  const timestamp = '2026-07-13T07:59:00.000Z';
  const statusWinner = buildActiveRoster([agent('designer', { status: 'Idle', lastSeen: timestamp }), agent('nova', { status: 'Working', lastSeen: timestamp })], snapshot, now);
  assert.equal(statusWinner.agents[0].sourceId, 'nova');
  const busyWinner = buildActiveRoster([agent('designer', { status: 'Working', lastSeen: timestamp }), agent('nova', { status: 'Working', lastSeen: timestamp, busy: true })], snapshot, now);
  assert.equal(busyWinner.agents[0].sourceId, 'nova');
  const sessionWinner = buildActiveRoster([agent('designer', { status: 'Working', lastSeen: timestamp }), agent('nova', { status: 'Working', lastSeen: timestamp, sessionId: 'session' })], snapshot, now);
  assert.equal(sessionWinner.agents[0].sourceId, 'nova');
  const lexicalWinner = buildActiveRoster([agent('nova', { status: 'Working', lastSeen: timestamp }), agent('designer', { status: 'Working', lastSeen: timestamp })], snapshot, now);
  assert.equal(lexicalWinner.agents[0].sourceId, 'designer');
});

test('active thresholds downgrade aged working and exclude stale or offline entries', () => {
  const result = buildActiveRoster([
    agent('dev', { status: 'Working', lastSeen: '2026-07-13T07:58:01.000Z' }),
    agent('writer', { status: 'Working', lastSeen: '2026-07-13T07:57:59.000Z' }),
    agent('qa', { status: 'Idle', lastSeen: '2026-07-13T07:40:00.000Z' }),
    agent('travel', { status: 'Idle', lastSeen: '2026-07-13T07:39:59.000Z' }),
    agent('offline', { status: 'Offline', lastSeen: '2026-07-13T07:59:59.000Z' }),
  ], snapshot, now);
  assert.deepEqual(result.agents.map(({ canonicalId, status }) => [canonicalId, status]), [['dev', 'Working'], ['writer', 'Idle'], ['qa', 'Idle']]);
});

test('stale snapshots suppress the default roster', () => {
  const result = buildActiveRoster([agent('dev', { status: 'Working', lastSeen: '2026-07-13T07:59:00.000Z' })], '2026-07-13T07:57:59.000Z', now);
  assert.equal(result.health.state, 'stale');
  assert.equal(result.agents.length, 0);
});

test('future timestamps over five minutes are excluded and surfaced as clock skew', () => {
  const result = buildActiveRoster([
    agent('future', { status: 'Working', lastSeen: '2026-07-13T08:05:01.000Z' }),
    agent('valid', { status: 'Working', lastSeen: '2026-07-13T07:59:00.000Z' }),
    agent('designer', { status: 'Working', lastSeen: '2026-07-13T08:06:00.000Z' }),
    agent('nova', { status: 'Idle', lastSeen: '2026-07-13T07:58:00.000Z' }),
  ], snapshot, now);
  assert.equal(result.health.state, 'clock-skew');
  assert.deepEqual(result.health.futureLastSeenIds, ['designer', 'future']);
  assert.deepEqual(result.agents.map((item) => item.canonicalId), ['valid', 'nova']);
  assert.equal(result.agents.find((item) => item.canonicalId === 'nova')?.sourceId, 'nova');
});

test('ordering is working, newest, busy, task, then canonical id', () => {
  const result = buildActiveRoster([
    agent('idle', { status: 'Idle', lastSeen: '2026-07-13T07:59:50.000Z' }),
    agent('newer', { status: 'Working', lastSeen: '2026-07-13T07:59:30.000Z' }),
    agent('busy', { status: 'Working', lastSeen: '2026-07-13T07:59:00.000Z', busy: true }),
    agent('task', { status: 'Working', lastSeen: '2026-07-13T07:59:00.000Z', currentTask: 'work' }),
    agent('alpha', { status: 'Working', lastSeen: '2026-07-13T07:59:00.000Z' }),
    agent('zulu', { status: 'Working', lastSeen: '2026-07-13T07:59:00.000Z' }),
  ], snapshot, now);
  assert.deepEqual(result.agents.map((item) => item.canonicalId), ['newer', 'busy', 'task', 'alpha', 'zulu', 'idle']);
});
