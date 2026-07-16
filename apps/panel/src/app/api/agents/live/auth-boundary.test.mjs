import assert from 'node:assert/strict';
import test from 'node:test';
import { isSessionAuthorized, issueSessionToken, verifySessionToken } from '../../_session-auth-core.ts';

test('live telemetry auth rejects missing and invalid session cookies', () => {
  const now = Date.UTC(2026, 6, 16);
  const token = issueSessionToken('jeff', 'expected-secret', 'nonce-1', now);
  assert.equal(token.includes('expected-secret'), false);
  assert.equal(isSessionAuthorized(new Request('http://local/api/agents/live'), 'expected-secret'), false);
  assert.equal(isSessionAuthorized(new Request('http://local/api/agents/live', { headers: { cookie: 'mc_auth=wrong' } }), 'expected-secret'), false);
  assert.equal(Boolean(verifySessionToken(token, 'expected-secret', now)), true);
  assert.equal(Boolean(verifySessionToken(token, 'wrong-secret', now)), false);
});

test('sessions are distinct and expire after eight hours', () => {
  const now = Date.UTC(2026, 6, 16);
  const first = issueSessionToken('jeff', 'secret', 'nonce-1', now);
  const second = issueSessionToken('jeff', 'secret', 'nonce-2', now);
  assert.notEqual(first, second);
  assert.equal(Boolean(verifySessionToken(first, 'secret', now + 8 * 60 * 60 * 1000)), false);
});
