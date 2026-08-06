import test from 'node:test';
import assert from 'node:assert/strict';
import { billingForRange, summarizeAnthropicCostPages, summarizeCostPages } from './billing-model.ts';

test('summarizes actual costs by UTC day and line item', () => {
  const snapshot = summarizeCostPages([{ data: [{ start_time: 1780272000, results: [
    { amount: { value: '1.25', currency: 'usd' }, line_item: 'cached input' },
    { amount: { value: '2.50', currency: 'usd' }, line_item: 'output' },
  ] }] }], '2026-07-29T00:00:00Z');
  assert.equal(snapshot.days[0].actualCost, 3.75);
  assert.deepEqual(snapshot.lineItems.map(item => item.id), ['output', 'cached input']);
});

test('converts Anthropic cent-denominated costs to USD by day and description', () => {
  const snapshot = summarizeAnthropicCostPages([{ data: [{ starting_at: '2026-08-05T00:00:00Z', results: [
    { amount: '123.45', currency: 'USD', description: 'Claude Sonnet Usage - Output Tokens' },
    { amount: '50', currency: 'USD', description: 'Claude Sonnet Usage - Input Tokens' },
  ] }] }], '2026-08-06T00:00:00Z');
  assert.equal(snapshot.provider, 'anthropic');
  assert.equal(snapshot.days[0].actualCost, 1.7345);
  assert.equal(snapshot.lineItems[0].actualCost, 1.2345);
});

test('filters actual costs to the selected range', () => {
  const snapshot = { ok: true, generatedAt: 'x', currency: 'USD', timezone: 'UTC', lineItems: [], days: [
    { id: '2026-07-01', actualCost: 1 }, { id: '2026-07-29', actualCost: 4 },
  ] };
  assert.equal(billingForRange(snapshot, '7d', Date.parse('2026-07-29T12:00:00Z')).actualCost, 4);
});
