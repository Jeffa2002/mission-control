import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyIncidentAction,
  emptyControls,
  isIncidentAction,
  isResolved,
  isSilenced,
  MAX_NOTES,
  MAX_SILENCE_MINUTES,
} from './incidents-state.ts';

const AT = '2026-08-27T00:00:00.000Z';

test('ack records acknowledgement and history', () => {
  const result = applyIncidentAction(null, { action: 'ack' }, AT);
  assert.ok(!('error' in result));
  assert.equal(result.acknowledgedAt, AT);
  assert.deepEqual(result.history, [{ at: AT, action: 'ack' }]);
});

test('unack clears acknowledgement but keeps history', () => {
  const acked = applyIncidentAction(null, { action: 'ack' }, AT);
  assert.ok(!('error' in acked));
  const unacked = applyIncidentAction(acked, { action: 'unack' }, AT);
  assert.ok(!('error' in unacked));
  assert.equal(unacked.acknowledgedAt, null);
  assert.equal(unacked.history.length, 2);
});

test('close with note stores close note and appends to notes', () => {
  const result = applyIncidentAction(null, { action: 'close', note: '  resolved by   restart ' }, AT);
  assert.ok(!('error' in result));
  assert.equal(result.closedAt, AT);
  assert.equal(result.closeNote, 'resolved by restart');
  assert.deepEqual(result.notes, [{ at: AT, text: 'resolved by restart' }]);
});

test('close without note is allowed', () => {
  const result = applyIncidentAction(null, { action: 'close' }, AT);
  assert.ok(!('error' in result));
  assert.equal(result.closedAt, AT);
  assert.equal(result.closeNote, null);
  assert.equal(result.notes.length, 0);
});

test('reopen clears closure state', () => {
  const closed = applyIncidentAction(null, { action: 'close', note: 'done' }, AT);
  assert.ok(!('error' in closed));
  const reopened = applyIncidentAction(closed, { action: 'reopen' }, AT);
  assert.ok(!('error' in reopened));
  assert.equal(reopened.closedAt, null);
  assert.equal(reopened.closeNote, null);
});

test('silence sets silenceUntil from the action timestamp', () => {
  const result = applyIncidentAction(null, { action: 'silence', silenceMinutes: 60 }, AT);
  assert.ok(!('error' in result));
  assert.equal(result.silenceUntil, '2026-08-27T01:00:00.000Z');
});

test('silence rejects out-of-range minutes', () => {
  for (const minutes of [0, -5, 0.5, MAX_SILENCE_MINUTES + 1, Number.NaN]) {
    const result = applyIncidentAction(null, { action: 'silence', silenceMinutes: minutes }, AT);
    assert.ok('error' in result, `expected error for ${minutes}`);
  }
});

test('unsilence clears silence', () => {
  const silenced = applyIncidentAction(null, { action: 'silence', silenceMinutes: 60 }, AT);
  assert.ok(!('error' in silenced));
  const cleared = applyIncidentAction(silenced, { action: 'unsilence' }, AT);
  assert.ok(!('error' in cleared));
  assert.equal(cleared.silenceUntil, null);
});

test('assign validates owner', () => {
  const ok = applyIncidentAction(null, { action: 'assign', owner: 'Dev' }, AT);
  assert.ok(!('error' in ok));
  assert.equal(ok.owner, 'Dev');
  const bad = applyIncidentAction(null, { action: 'assign', owner: '   ' }, AT);
  assert.ok('error' in bad);
});

test('note requires text and trims whitespace', () => {
  const bad = applyIncidentAction(null, { action: 'note', note: '' }, AT);
  assert.ok('error' in bad);
  const ok = applyIncidentAction(null, { action: 'note', note: '\n checked\nlogs \n' }, AT);
  assert.ok(!('error' in ok));
  assert.deepEqual(ok.notes, [{ at: AT, text: 'checked logs' }]);
});

test('isSilenced honours the provided clock', () => {
  const silenced = applyIncidentAction(null, { action: 'silence', silenceMinutes: 60 }, AT);
  assert.ok(!('error' in silenced));
  const t = new Date(AT).getTime();
  assert.equal(isSilenced(silenced, t + 59 * 60_000), true);
  assert.equal(isSilenced(silenced, t + 61 * 60_000), false);
  assert.equal(isSilenced(undefined, t), false);
});

test('isResolved covers closed and silenced states', () => {
  const t = new Date(AT).getTime();
  const closed = applyIncidentAction(null, { action: 'close' }, AT);
  const silenced = applyIncidentAction(null, { action: 'silence', silenceMinutes: 30 }, AT);
  assert.ok(!('error' in closed) && !('error' in silenced));
  assert.equal(isResolved(closed, t), true);
  assert.equal(isResolved(silenced, t + 10 * 60_000), true);
  assert.equal(isResolved(silenced, t + 40 * 60_000), false);
  assert.equal(isResolved(emptyControls(), t), false);
});

test('existing controls are not mutated in place', () => {
  const base = applyIncidentAction(null, { action: 'ack' }, AT);
  assert.ok(!('error' in base));
  const before = JSON.stringify(base);
  const next = applyIncidentAction(base, { action: 'note', note: 'later' }, AT);
  assert.ok(!('error' in next));
  assert.equal(JSON.stringify(base), before);
});

test('notes and history are bounded', () => {
  let controls = null;
  for (let index = 0; index < MAX_NOTES + 10; index += 1) {
    const result = applyIncidentAction(controls, { action: 'note', note: `note ${index}` }, AT);
    assert.ok(!('error' in result));
    controls = result;
  }
  assert.ok(controls);
  assert.equal(controls.notes.length, MAX_NOTES);
  assert.equal(controls.notes.at(-1)?.text, `note ${MAX_NOTES + 9}`);
});

test('unknown action is rejected by the guard', () => {
  assert.equal(isIncidentAction('ack'), true);
  assert.equal(isIncidentAction('explode'), false);
  assert.equal(isIncidentAction(null), false);
});
