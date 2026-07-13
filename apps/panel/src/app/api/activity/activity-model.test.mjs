import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundedText,
  correlateActivityEvents,
  dedupeActivityEvents,
  normalizeTimestamp,
} from './activity-model.ts';

const event = (eventId, overrides = {}) => ({
  eventId,
  id: eventId,
  source: 'audit',
  sourceEventId: eventId,
  eventType: 'test.event',
  ts: '2026-07-13T00:00:00.000Z',
  tsQuality: 'observed',
  severity: 'healthy',
  title: eventId,
  detail: 'test',
  entityRefs: ['app:mission-control'],
  evidence: {},
  sourceFreshness: 'current',
  relationship: 'unknown',
  relationshipBasis: 'not evaluated',
  dedupeCount: 1,
  memberEventIds: [eventId],
  ...overrides,
});

test('invalid timestamps use an explicitly labelled fallback', () => {
  assert.deepEqual(normalizeTimestamp('not-a-date', '2026-07-13T01:00:00.000Z'), {
    ts: '2026-07-13T01:00:00.000Z',
    tsQuality: 'fallback',
  });
});

test('dedupe collapses only exact same-source identities', () => {
  const result = dedupeActivityEvents([
    event('audit:a', { sourceEventId: 'shared' }),
    event('audit:b', { sourceEventId: 'shared', severity: 'critical' }),
    event('deploy:a', { source: 'deploys', sourceEventId: 'shared' }),
  ]);
  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.source === 'audit')?.dedupeCount, 2);
  assert.equal(result.find((item) => item.source === 'audit')?.severity, 'critical');
});

test('explicit linkage confirms association without asserting causation', () => {
  const result = correlateActivityEvents([
    event('audit:a', { explicitLinkKey: 'change-1' }),
    event('audit:b', { explicitLinkKey: 'change-1', ts: '2026-07-13T00:01:00.000Z' }),
  ]);
  assert.equal(result.windows[0].relationship, 'confirmed');
  assert.match(result.windows[0].detail, /not causation/i);
});

test('same-entity proximity correlates cross-source records only', () => {
  const result = correlateActivityEvents([
    event('deploy:a', { source: 'deploys' }),
    event('estate:a', { source: 'estate', ts: '2026-07-13T00:10:00.000Z' }),
    event('audit:a', { entityRefs: ['agent:archie'], ts: '2026-07-13T00:11:00.000Z' }),
  ]);
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].relationship, 'correlated');
  assert.deepEqual(result.windows[0].eventIds, ['deploy:a', 'estate:a']);
  assert.equal(result.events.find((item) => item.eventId === 'audit:a')?.relationship, 'unknown');
});

test('bounded evidence redacts credentials and sensitive paths', () => {
  const result = boundedText('token=abc Bearer xyz /root/private/file');
  assert.equal(result.includes('abc'), false);
  assert.equal(result.includes('xyz'), false);
  assert.equal(result.includes('/root/private/file'), false);
});
