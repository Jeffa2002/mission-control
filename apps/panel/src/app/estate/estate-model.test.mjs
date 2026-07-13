import assert from 'node:assert/strict';
import test from 'node:test';
import { associationReach, buildEstateTopology, canonicalRepoId, canonicalSmokeId, normalizeEvidenceUrl } from './estate-model.ts';

const smoke = (name, url, overrides = {}) => ({ name, url, status: 'healthy', httpStatus: 200, latencyMs: 20, ...overrides });
const repo = (fullName, name, smokes = [], overrides = {}) => ({ name, fullName, owner: 'Ops', productionBranch: 'main', status: 'healthy', github: { dependabot: { status: 'healthy', open: 0, counts: {} } }, smokes, ...overrides });
const payload = (repos) => ({ ok: true, summary: { status: 'healthy', repos: repos.length, critical: 0, warning: 0, dependabotOpen: 0, smokeCritical: 0, checkedAt: '2026-07-13T00:00:00.000Z' }, repos, runners: { status: 'warning', note: '', controls: [] }, residuals: [] });

test('canonical IDs are deterministic and repo IDs use fullName', () => {
  assert.equal(canonicalRepoId('Jeffa2002/Mission-Control'), canonicalRepoId(' jeffa2002/mission-control '));
  assert.equal(canonicalSmokeId('HTTPS://EXAMPLE.COM:443/health#now'), canonicalSmokeId('https://example.com/health'));
});

test('URL normalization removes fragments/default ports but preserves path and query', () => {
  assert.equal(normalizeEvidenceUrl('HTTPS://Example.COM:443/api/health?full=1#fragment'), 'https://example.com/api/health?full=1');
  assert.equal(normalizeEvidenceUrl('http://Example.com:80/'), 'http://example.com/');
});

test('repo records are not joined by display name', () => {
  const model = buildEstateTopology(payload([
    repo('org/one', 'Shared', [smoke('Shared', 'https://one.example/health')]),
    repo('org/two', 'Shared', [smoke('Shared', 'https://two.example/health')]),
  ]));
  assert.equal(model.repos.length, 2);
  assert.equal(model.edges.length, 2);
  assert.notEqual(model.edges[0].sourceId, model.edges[1].sourceId);
});

test('duplicate fullName records merge and preserve multiple configured smokes', () => {
  const model = buildEstateTopology(payload([
    repo('org/app', 'App', [smoke('Web', 'https://app.example/')]),
    repo('org/app', 'App alt', [smoke('API', 'https://app.example/api/health')]),
  ]));
  assert.equal(model.repos.length, 1);
  assert.equal(model.repos[0].sourceRecords, 2);
  assert.equal(model.repos[0].smokeIds.length, 2);
  assert.equal(model.edges.length, 2);
});

test('shared endpoint facts stay aligned with the worst observation', () => {
  const model = buildEstateTopology(payload([
    repo('org/one', 'One', [smoke('Primary', 'https://shared.example/health', { latencyMs: 20 })]),
    repo('org/two', 'Two', [smoke('Degraded', 'https://shared.example/health', { status: 'critical', httpStatus: 503, latencyMs: 900 })]),
  ]));
  assert.equal(model.smokes.length, 1);
  assert.equal(model.smokes[0].status, 'critical');
  assert.equal(model.smokes[0].name, 'Degraded');
  assert.equal(model.smokes[0].httpStatus, 503);
  assert.equal(model.smokes[0].latencyMs, 900);
  assert.deepEqual(model.smokes[0].repoIds, [canonicalRepoId('org/one'), canonicalRepoId('org/two')]);
});

test('GitHub and smoke warnings propagate as partial coverage', () => {
  const model = buildEstateTopology(payload([repo('org/app', 'App', [smoke('App', 'https://app.example/', { warning: 'timeout' })], { github: { dependabot: { status: 'healthy', open: 0, counts: {} }, warning: 'rate limited' } })]));
  assert.equal(model.coverage.find((item) => item.id === 'configured-smokes')?.status, 'partial');
  assert.equal(model.coverage.find((item) => item.id === 'github-signals')?.status, 'partial');
  assert.equal(model.warnings.length, 2);
});

test('association traversal stops after confirmed one-hop reach at unsupported coverage', () => {
  const model = buildEstateTopology(payload([repo('org/app', 'App', [smoke('App', 'https://app.example/')])]));
  const reach = associationReach(model, canonicalRepoId('org/app'));
  assert.equal(reach.confirmedIds.length, 1);
  assert.deepEqual(reach.inferredIds, []);
  assert.deepEqual(reach.stoppedAt, ['runtime-routing', 'package-graph', 'provider-graph']);
});
