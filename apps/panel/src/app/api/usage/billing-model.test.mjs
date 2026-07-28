import test from 'node:test';
import assert from 'node:assert/strict';
import { billingForRange, summarizeCostPages } from './billing-model.ts';

test('summarizes actual costs by UTC day and line item', () => {
  const snapshot = summarizeCostPages([{ data: [{ start_time: 1780272000, results: [
    { amount: { value: '1.25', currency: 'usd' }, line_item: 'cached input' },
    { amount: { value: '2.50', currency: 'usd' }, line_item: 'output' },
  ] }] }], '2026-07-29T00:00:00Z');
  assert.equal(snapshot.days[0].actualCost, 3.75);
  assert.deepEqual(snapshot.lineItems.map(item => item.id), ['output', 'cached input']);
});

test('filters actual costs to the selected range', () => {
  const snapshot = { ok: true, generatedAt: 'x', currency: 'USD', timezone: 'UTC', lineItems: [], days: [
    { id: '2026-07-01', actualCost: 1 }, { id: '2026-07-29', actualCost: 4 },
  ] };
  assert.equal(billingForRange(snapshot, '7d', Date.parse('2026-07-29T12:00:00Z')).actualCost, 4);
});
