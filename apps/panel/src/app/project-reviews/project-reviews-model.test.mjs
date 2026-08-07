import assert from 'node:assert/strict';
import test from 'node:test';
import { freshness, loadReviewStore, parseReviewStore, priorityQueue, summarizeProjects } from './project-reviews-model.ts';
import { canonicalProjectId, PROJECTS } from '../../lib/project-registry.mjs';

test('registry contains 24 GitHub repositories and one local-only project', () => {
  assert.equal(PROJECTS.filter((project) => project.repo).length, 24);
  assert.equal(PROJECTS.filter((project) => !project.repo).length, 1);
  assert.equal(canonicalProjectId('property-hub'), 'yielddock');
  assert.equal(canonicalProjectId('helix'), 'ordantra');
});

test('seed data validates security and partial operational reviews', () => {
  const store = loadReviewStore();
  assert.equal(store.reviews.filter((review) => review.reviewer === 'SecSpy').length, 3);
  assert.equal(store.reviews.filter((review) => review.reviewer === 'Rook').length, 20);
  assert.equal(store.reviews.filter((review) => review.reviewer === 'Rook').every((review) => review.status === 'partial' && review.commitSha === null), true);
  assert.equal(new Set(store.reviews.map((review) => review.projectId)).size, 20);
  assert.equal(store.reviews.reduce((total, review) => total + review.findings.length, 0), 28);
});

test('parser rejects unknown versions, projects and oversized evidence sets', () => {
  assert.throws(() => parseReviewStore({ schemaVersion: 2, reviews: [] }), /Unsupported/);
  const base = structuredClone(loadReviewStore());
  base.reviews[0].projectId = 'unknown';
  assert.throws(() => parseReviewStore(base), /Unknown project/);
  const evidence = structuredClone(loadReviewStore());
  evidence.reviews[0].findings[0].evidence = Array(9).fill('bounded');
  assert.throws(() => parseReviewStore(evidence), /evidence/);
});

test('freshness is explicit and queue prioritizes unreviewed high-risk work', () => {
  const reviewedAt = '2026-08-07T00:00:00.000Z';
  const review = { ...loadReviewStore().reviews[0], reviewedAt };
  assert.equal(freshness(review, Date.parse('2026-08-08T00:00:00.000Z')), 'fresh');
  assert.equal(freshness(review, Date.parse('2026-10-01T00:00:00.000Z')), 'aging');
  const queue = priorityQueue(summarizeProjects(loadReviewStore(), Date.parse('2026-08-08T00:00:00.000Z')));
  assert.equal(queue[0].project.id, 'abea-ndh');
});
