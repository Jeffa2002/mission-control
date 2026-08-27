import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deployTone,
  derivePortfolioTone,
  endpointTone,
  summarizePortfolio,
  uptimeTargetTone,
} from './portfolio-model.ts';

const NOW = Date.parse('2026-08-27T04:00:00.000Z');

/* ─── Signal A — endpoint ─────────────────────────────────────────── */

test('endpoint down is incident', () => {
  const result = endpointTone({ appId: 'venconx', status: 'down' });
  assert.equal(result.tone, 'incident');
  assert.deepEqual(result.reasons, ['Endpoint venconx is down']);
});

test('endpoint degraded is attention', () => {
  const result = endpointTone({ appId: 'crm8', status: 'degraded' });
  assert.equal(result.tone, 'attention');
});

test('endpoint up with healthy TLS is nominal', () => {
  const result = endpointTone({
    appId: 'venconx',
    status: 'up',
    ssl: { valid: true, daysRemaining: 211 },
  });
  assert.equal(result.tone, 'nominal');
  assert.deepEqual(result.reasons, []);
});

test('invalid TLS is incident even when status is up', () => {
  const result = endpointTone({
    appId: 'venconx',
    status: 'up',
    ssl: { valid: false, daysRemaining: -2 },
  });
  assert.equal(result.tone, 'incident');
  assert.match(result.reasons[0], /TLS certificate invalid/);
});

test('TLS expiring within 14 days is attention', () => {
  const result = endpointTone({
    appId: 'venconx',
    status: 'up',
    ssl: { valid: true, daysRemaining: 9 },
  });
  assert.equal(result.tone, 'attention');
  assert.match(result.reasons[0], /TLS expires in 9d/);
});

test('endpoint status unknown contributes nothing (gap)', () => {
  const result = endpointTone({
    appId: 'venconx',
    status: 'unknown',
    ssl: { valid: true, daysRemaining: 90 },
  });
  assert.equal(result.tone, null);
  assert.deepEqual(result.reasons, []);
});

/* ─── Signal B — fleet uptime ─────────────────────────────────────── */

test('three consecutive failures is incident regardless of 24h average', () => {
  const result = uptimeTargetTone({
    target: 'venconx',
    consecutive_failures: 3,
    uptime_24h: 99.9,
    probes_24h: 288,
  });
  assert.equal(result.tone, 'incident');
  assert.match(result.reasons[0], /3 consecutive probes/);
});

test('uptime below 95% is incident', () => {
  const result = uptimeTargetTone({
    target: 'venconx',
    consecutive_failures: 0,
    uptime_24h: 93.2,
    probes_24h: 288,
  });
  assert.equal(result.tone, 'incident');
  assert.match(result.reasons[0], /93\.2%/);
});

test('uptime between 95% and 99.5% is attention', () => {
  const result = uptimeTargetTone({
    target: 'venconx',
    consecutive_failures: 0,
    uptime_24h: 98.1,
    probes_24h: 288,
  });
  assert.equal(result.tone, 'attention');
});

test('p95 above 2000ms is attention when uptime is healthy', () => {
  const result = uptimeTargetTone({
    target: 'venconx',
    consecutive_failures: 0,
    uptime_24h: 100,
    p95_24h: 2400,
    probes_24h: 288,
  });
  assert.equal(result.tone, 'attention');
  assert.match(result.reasons[0], /p95 latency 2400ms/);
});

test('healthy uptime with sane p95 is nominal', () => {
  const result = uptimeTargetTone({
    target: 'venconx',
    consecutive_failures: 0,
    uptime_24h: 99.9,
    p95_24h: 380,
    probes_24h: 288,
  });
  assert.equal(result.tone, 'nominal');
  assert.deepEqual(result.reasons, []);
});

test('null uptime or zero probes is a gap, not nominal', () => {
  assert.equal(uptimeTargetTone({ target: 't', uptime_24h: null, probes_24h: 0 }).tone, null);
  assert.equal(uptimeTargetTone({ target: 't', uptime_24h: 100, probes_24h: 0 }).tone, null);
});

/* ─── Signal C — last deploy ──────────────────────────────────────── */

test('failed latest deploy is attention with relative reason', () => {
  const result = deployTone(
    { status: 'failure', startedAt: '2026-08-27T01:00:00.000Z' },
    NOW,
  );
  assert.equal(result.tone, 'attention');
  assert.deepEqual(result.reasons, ['Latest deploy failed 3h ago']);
});

test('running and successful deploys contribute no tone but remain signals', () => {
  assert.equal(deployTone({ status: 'running' }).tone, 'nominal');
  assert.equal(deployTone({ status: 'success' }).tone, 'nominal');
});

test('no deploy in window is a gap', () => {
  assert.equal(deployTone(null).tone, null);
  assert.equal(deployTone(undefined).tone, null);
});

/* ─── Combination rules ───────────────────────────────────────────── */

test('pessimism wins: endpoint up + uptime below 95% is incident', () => {
  const result = derivePortfolioTone(
    {
      endpoints: [{ appId: 'venconx', status: 'up' }],
      uptimeTargets: [{ target: 'venconx', uptime_24h: 93.2, probes_24h: 288 }],
    },
    NOW,
  );
  assert.equal(result.tone, 'incident');
});

test('endpoint down + fleet 100% is still incident (fleet lags)', () => {
  const result = derivePortfolioTone(
    {
      endpoints: [{ appId: 'venconx', status: 'down' }],
      uptimeTargets: [{ target: 'venconx', uptime_24h: 100, probes_24h: 288 }],
    },
    NOW,
  );
  assert.equal(result.tone, 'incident');
});

test('sources two steps apart set signalsDisagree', () => {
  const result = derivePortfolioTone(
    {
      endpoints: [{ appId: 'venconx', status: 'up' }],
      uptimeTargets: [{ target: 'venconx', uptime_24h: 90, probes_24h: 288 }],
    },
    NOW,
  );
  assert.equal(result.signalsDisagree, true);
});

test('sources one step apart do not set signalsDisagree', () => {
  const result = derivePortfolioTone(
    {
      endpoints: [{ appId: 'venconx', status: 'degraded' }],
      uptimeTargets: [{ target: 'venconx', uptime_24h: 90, probes_24h: 288 }],
    },
    NOW,
  );
  assert.equal(result.tone, 'incident');
  assert.equal(result.signalsDisagree, false);
});

test('multi-endpoint products take the worst endpoint', () => {
  const result = derivePortfolioTone(
    {
      endpoints: [
        { appId: 'ordantra-app', status: 'up' },
        { appId: 'ordantra-web', status: 'down' },
      ],
    },
    NOW,
  );
  assert.equal(result.tone, 'incident');
  assert.match(result.toneReasons[0], /ordantra-web/);
});

test('multi-target uptime takes the worst target', () => {
  const result = derivePortfolioTone(
    {
      uptimeTargets: [
        { target: 'ordantra', uptime_24h: 100, probes_24h: 288 },
        { target: 'ordantra-support', uptime_24h: 94, probes_24h: 288 },
      ],
    },
    NOW,
  );
  assert.equal(result.tone, 'incident');
  assert.match(result.toneReasons[0], /ordantra-support/);
});

test('unknown endpoints are skipped, not counted as nominal evidence', () => {
  const result = derivePortfolioTone(
    {
      endpoints: [{ appId: 'venconx', status: 'unknown' }],
      uptimeTargets: [{ target: 'venconx', uptime_24h: 100, probes_24h: 288 }],
    },
    NOW,
  );
  assert.equal(result.tone, 'nominal');
  assert.equal(result.signals.endpoint, null);
  assert.equal(result.signals.uptime, 'nominal');
});

test('failed deploy with healthy signals stays attention, not incident', () => {
  const result = derivePortfolioTone(
    {
      endpoints: [{ appId: 'venconx', status: 'up' }],
      latestDeploy: { status: 'failure', startedAt: '2026-08-27T01:00:00.000Z' },
    },
    NOW,
  );
  assert.equal(result.tone, 'attention');
  assert.deepEqual(result.toneReasons, ['Latest deploy failed 3h ago']);
});

test('zero signals is unknown with explicit label', () => {
  const result = derivePortfolioTone({}, NOW);
  assert.equal(result.tone, 'unknown');
  assert.deepEqual(result.toneReasons, ['No live telemetry']);
  assert.equal(result.signalsDisagree, false);
});

test('only a successful deploy is a live signal and reads nominal', () => {
  const result = derivePortfolioTone(
    { latestDeploy: { status: 'success', startedAt: '2026-08-26T12:00:00.000Z' } },
    NOW,
  );
  assert.equal(result.tone, 'nominal');
  assert.equal(result.signals.deploy, 'nominal');
});

/* ─── Summary aggregation ─────────────────────────────────────────── */

test('summary counts tones, monitored, deploys and expiring TLS', () => {
  const summary = summarizePortfolio([
    {
      tone: 'nominal',
      endpoints: [{ tls: { valid: true, daysRemaining: 200 } }],
      deploy: { count24h: 2, failed24h: 0 },
    },
    {
      tone: 'incident',
      endpoints: [{ tls: { valid: true, daysRemaining: 9 } }, { tls: null }],
      deploy: { count24h: 1, failed24h: 1 },
    },
    { tone: 'unknown', endpoints: [], deploy: null },
  ]);
  assert.deepEqual(summary, {
    total: 3,
    nominal: 1,
    attention: 0,
    incident: 1,
    unknown: 1,
    monitored: 2,
    deploys24h: 3,
    deploysFailed24h: 1,
    tlsExpiring14d: 1,
  });
});
