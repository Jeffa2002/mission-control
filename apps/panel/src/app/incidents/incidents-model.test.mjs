import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIncidents, incidentChanges } from './incidents-model.ts';

test('derives only actionable health and agent signals', () => {
  const incidents = buildIncidents([{ id: 'dev', label: 'Dev', status: 'Offline', restarts: 1 }, { id: 'nova', status: 'Idle', restarts: 7 }], { ok: false, overall: 'amber', checked_at: '2026-07-13T01:00:00Z', checks: { database: { status: 'ok' }, panic_latch: { status: 'degraded', detail: 'set' } } }, []);
  assert.deepEqual(incidents.map((incident) => incident.id), ['agent-restarts-nova', 'health-panic_latch', 'agent-offline-dev']);
  assert.equal(incidents[1].owner, 'SecSpy');
});
test('preserves alert severity and firing semantics', () => {
  const [incident] = buildIncidents([], null, [{ labels: { alertname: 'DiskFull', severity: 'critical' }, state: 'firing' }]);
  assert.equal(incident.severity, 'critical');
  assert.equal(incident.state, 'open');
});
test('reports opened changed and cleared observations', () => {
  const base = { id: 'one', title: 'One', source: 'test', severity: 'warning', state: 'open', owner: 'Ops', updatedAt: null, detail: 'a', evidence: [], nextAction: 'look' };
  const changes = incidentChanges([base, { ...base, id: 'gone' }], [{ ...base, detail: 'b' }, { ...base, id: 'new' }]);
  assert.deepEqual(changes.opened.map((item) => item.id), ['new']);
  assert.deepEqual(changes.changed.map((item) => item.id), ['one']);
  assert.deepEqual(changes.cleared.map((item) => item.id), ['gone']);
});
