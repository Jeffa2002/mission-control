import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateOverview } from './overview-model.ts';

const ok = (value) => ({ status: 'fulfilled', value });
const bad = (message) => ({ status: 'rejected', reason: new Error(message) });

test('extracts array sources from their envelopes', () => {
  const { data, failures } = aggregateOverview([
    ['agents', ok({ agents: [{ id: 'main' }] })],
    ['apps', ok({ apps: [{ id: 'venconx' }] })],
    ['deploys', ok({ deploys: [{ id: 'd1' }] })],
    ['activity', ok({ items: [{ id: 'a1' }] })],
    ['alerts', ok({ data: { alerts: [{ state: 'firing' }] } })],
  ]);
  assert.deepEqual(data.agents, [{ id: 'main' }]);
  assert.deepEqual(data.apps, [{ id: 'venconx' }]);
  assert.deepEqual(data.deploys, [{ id: 'd1' }]);
  assert.deepEqual(data.activity, [{ id: 'a1' }]);
  assert.deepEqual(data.alerts, [{ state: 'firing' }]);
  assert.deepEqual(failures, []);
});

test('passes object sources through untouched', () => {
  const health = { ok: true, overall: 'green' };
  const network = { nodes: [] };
  const { data } = aggregateOverview([
    ['health', ok(health)],
    ['network', ok(network)],
  ]);
  assert.equal(data.health, health);
  assert.equal(data.network, network);
});

test('missing envelopes degrade to empty arrays, not throws', () => {
  const { data } = aggregateOverview([
    ['agents', ok({})],
    ['alerts', ok({ status: 'unavailable' })],
  ]);
  assert.deepEqual(data.agents, []);
  assert.deepEqual(data.alerts, []);
});

test('rejected sources become null values plus named failures', () => {
  const { data, failures } = aggregateOverview([
    ['health', ok({ ok: true })],
    ['bazza', bad('/api/bazza returned 502')],
    ['shazza', { status: 'rejected', reason: 'boom' }],
  ]);
  assert.ok(data.health);
  assert.equal(data.bazza, null);
  assert.equal(data.shazza, null);
  assert.deepEqual(failures, ['bazza: /api/bazza returned 502', 'shazza: request failed']);
});
