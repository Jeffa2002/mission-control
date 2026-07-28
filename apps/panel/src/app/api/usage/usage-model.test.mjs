import assert from 'node:assert/strict'; import test from 'node:test';
import { estimateOpenAiCost, parseCodexRollout, parseUsageTranscript, serializeUsageSse } from './usage-model.ts';
test('prices fresh, cached, write and output tokens', () => assert.equal(estimateOpenAiCost('gpt-5.6-sol', { input: 50_000, output: 50_000, cacheRead: 50_000, cacheWrite: 50_000 }), 2.0875));
test('uses long-context pricing over 272K request context', () => assert.equal(estimateOpenAiCost('gpt-5.5', { input: 273_000, output: 0, cacheRead: 0, cacheWrite: 0 }), 2.73));
test('leaves unknown models unpriced', () => assert.equal(estimateOpenAiCost('not-listed', { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }), null));
test('parses valid usage and tolerates incomplete lines', () => { const rows = parseUsageTranscript('{"type":"message","timestamp":"2026-07-28T00:00:00Z","message":{"role":"assistant","provider":"openai","model":"gpt-5.6-terra","usage":{"input":10,"output":2,"cacheRead":20,"cacheWrite":0,"totalTokens":32}}}\n{"partial":', 'dev'); assert.equal(rows.length, 1); assert.equal(rows[0].agent, 'dev'); assert.ok(rows[0].estimatedCost > 0); });
test('serializes named usage events', () => assert.match(serializeUsageSse({ ok: true }), /^event: usage\ndata:/));
test('parses Codex rollout token counts as fresh and cached input', () => {
  const rows = parseCodexRollout('{"type":"turn_context","timestamp":"2026-07-28T00:00:00Z","payload":{"model":"gpt-5.6-sol"}}\n{"type":"event_msg","timestamp":"2026-07-28T00:00:01Z","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":12000,"cached_input_tokens":10000,"output_tokens":500,"total_tokens":12500}}}}', 'main');
  assert.equal(rows.length, 1); assert.equal(rows[0].input, 2000); assert.equal(rows[0].cacheRead, 10000); assert.equal(rows[0].model, 'gpt-5.6-sol');
});
