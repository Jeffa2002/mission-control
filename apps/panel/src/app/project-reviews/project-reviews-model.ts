import { readFileSync } from 'node:fs';
import { PROJECTS } from '../../lib/project-registry.mjs';

export type Project = import('../../lib/project-registry.mjs').Project;

export const REVIEW_CATEGORIES = [
  'correctness', 'error-handling', 'authentication', 'authorization', 'data-integrity',
  'security', 'concurrency', 'api-contracts', 'database', 'performance', 'dependencies',
  'testing', 'type-safety', 'maintainability', 'accessibility', 'operations', 'backups', 'observability', 'deployment', 'documentation',
] as const;

export type ReviewCategory = typeof REVIEW_CATEGORIES[number];
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ReviewFinding = {
  id: string;
  category: ReviewCategory;
  severity: Severity;
  confidence: 'confirmed' | 'likely' | 'possible';
  title: string;
  description: string;
  evidence: string[];
  recommendation: string;
  status: 'open' | 'accepted' | 'fixed' | 'dismissed';
  effort: 'small' | 'medium' | 'large' | null;
};
export type ProjectReview = {
  id: string;
  projectId: string;
  reviewedAt: string;
  commitSha: string | null;
  branch: string;
  reviewer: string;
  status: 'queued' | 'running' | 'complete' | 'partial' | 'failed';
  coverage: ReviewCategory[];
  summary: string;
  findings: ReviewFinding[];
};
export type ReviewStore = { schemaVersion: 1; reviews: ProjectReview[] };
export type ProjectReviewSummary = {
  project: Project;
  review: ProjectReview | null;
  openFindings: number;
  worstSeverity: Severity | null;
  freshness: 'fresh' | 'aging' | 'stale' | 'unreviewed';
};

const MAX_STORE_BYTES = 512 * 1024;
const MAX_REVIEWS = 100;
const MAX_FINDINGS = 200;
const MAX_EVIDENCE_PER_FINDING = 8;
const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const statuses = ['queued', 'running', 'complete', 'partial', 'failed'];
const findingStatuses = ['open', 'accepted', 'fixed', 'dismissed'];
const confidences = ['confirmed', 'likely', 'possible'];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max = 2_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${field}`);
  return value;
}
function member<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`Invalid ${field}`);
  return value as T;
}

export function parseReviewStore(input: unknown): ReviewStore {
  const encoded = JSON.stringify(input);
  if (encoded.length > MAX_STORE_BYTES) throw new Error('Review store exceeds size limit');
  const root = object(input);
  if (root.schemaVersion !== 1) throw new Error('Unsupported review schema version');
  if (!Array.isArray(root.reviews) || root.reviews.length > MAX_REVIEWS) throw new Error('Invalid reviews collection');
  const seenReviews = new Set<string>();
  const reviews = root.reviews.map((entry) => {
    const review = object(entry);
    const id = text(review.id, 'review id', 120);
    if (seenReviews.has(id)) throw new Error(`Duplicate review id: ${id}`);
    seenReviews.add(id);
    const projectId = text(review.projectId, 'project id', 80);
    if (!PROJECTS.some((project) => project.id === projectId)) throw new Error(`Unknown project: ${projectId}`);
    if (!Array.isArray(review.coverage)) throw new Error('Invalid coverage');
    const coverage = review.coverage.map((value) => member(value, REVIEW_CATEGORIES, 'coverage category'));
    if (!Array.isArray(review.findings) || review.findings.length > MAX_FINDINGS) throw new Error('Invalid findings collection');
    const seenFindings = new Set<string>();
    const findings = review.findings.map((entryValue) => {
      const finding = object(entryValue);
      const findingId = text(finding.id, 'finding id', 120);
      if (seenFindings.has(findingId)) throw new Error(`Duplicate finding id: ${findingId}`);
      seenFindings.add(findingId);
      if (!Array.isArray(finding.evidence) || finding.evidence.length > MAX_EVIDENCE_PER_FINDING) throw new Error('Invalid finding evidence');
      return {
        id: findingId,
        category: member(finding.category, REVIEW_CATEGORIES, 'finding category'),
        severity: member(finding.severity, severities, 'finding severity'),
        confidence: member(finding.confidence, confidences, 'finding confidence'),
        title: text(finding.title, 'finding title', 240),
        description: text(finding.description, 'finding description'),
        evidence: finding.evidence.map((value) => text(value, 'evidence', 500)),
        recommendation: text(finding.recommendation, 'recommendation'),
        status: member(finding.status, findingStatuses, 'finding status'),
        effort: finding.effort === null ? null : member(finding.effort, ['small', 'medium', 'large'], 'finding effort'),
      } as ReviewFinding;
    });
    const reviewedAt = text(review.reviewedAt, 'reviewed at', 40);
    if (!Number.isFinite(Date.parse(reviewedAt))) throw new Error('Invalid review timestamp');
    return {
      id, projectId, reviewedAt,
      commitSha: review.commitSha === null ? null : text(review.commitSha, 'commit sha', 64),
      branch: text(review.branch, 'branch', 120),
      reviewer: text(review.reviewer, 'reviewer', 120),
      status: member(review.status, statuses, 'review status'),
      coverage, findings,
      summary: text(review.summary, 'review summary'),
    } as ProjectReview;
  });
  return { schemaVersion: 1, reviews };
}

export function loadReviewStore() {
  const source = readFileSync(new URL('./reviews.v1.json', import.meta.url));
  if (source.byteLength > MAX_STORE_BYTES) throw new Error('Review store exceeds size limit');
  return parseReviewStore(JSON.parse(source.toString('utf8')));
}

export function freshness(review: ProjectReview | null, now = Date.now()): ProjectReviewSummary['freshness'] {
  if (!review) return 'unreviewed';
  const days = (now - Date.parse(review.reviewedAt)) / 86_400_000;
  if (days > 90) return 'stale';
  if (days > 30) return 'aging';
  return 'fresh';
}

export function summarizeProjects(store = loadReviewStore(), now = Date.now()): ProjectReviewSummary[] {
  return PROJECTS.map((project) => {
    const review = store.reviews.filter((item) => item.projectId === project.id).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0] ?? null;
    const open = store.reviews.filter((item) => item.projectId === project.id).flatMap((item) => item.findings).filter((finding) => finding.status === 'open');
    return { project, review, openFindings: open.length, worstSeverity: severities.find((severity) => open.some((finding) => finding.severity === severity)) ?? null, freshness: freshness(review, now) };
  });
}

export function priorityQueue(summaries: ProjectReviewSummary[]) {
  const severityRank = (value: Severity | null) => value ? severities.length - severities.indexOf(value) : 0;
  const riskRank = { critical: 4, high: 3, medium: 2, standard: 1 };
  const nextReviewBatch = ['abea-ndh', 'yielddock', 'orgcharts', 'hearth', 'transparent-cause-draw', 'counseldesk', 'crm8', 'mission-control', 'jeffa-net', 'spacecadet-cloud', 'crossbench', 'effectx-site', 'shazza-bot'];
  const batchRank = (id: string) => {
    const index = nextReviewBatch.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...summaries].sort((a, b) => {
    if (batchRank(a.project.id) !== batchRank(b.project.id)) return batchRank(a.project.id) - batchRank(b.project.id);
    const reviewedDelta = Number(Boolean(a.review)) - Number(Boolean(b.review));
    if (reviewedDelta) return reviewedDelta;
    return severityRank(b.worstSeverity) - severityRank(a.worstSeverity) || riskRank[b.project.risk] - riskRank[a.project.risk] || a.project.name.localeCompare(b.project.name);
  });
}
