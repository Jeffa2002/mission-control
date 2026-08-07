'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ProjectReviewSummary, Severity } from './project-reviews-model';
import styles from './project-reviews.module.css';

function label(value: string) { return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }
function age(iso?: string) {
  if (!iso) return 'Not reviewed';
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  return days === 0 ? 'Reviewed today' : `Reviewed ${days}d ago`;
}
function tone(summary: ProjectReviewSummary) { return summary.worstSeverity ?? (summary.review ? 'clear' : 'unreviewed'); }
function nextAction(summary: ProjectReviewSummary) {
  const finding = summary.review?.findings.find((item) => item.status === 'open');
  return finding?.recommendation ?? `Run the first full code-quality and bug review for ${summary.project.name}.`;
}

export function ProjectReviewsClient({ summaries, queue }: { summaries: ProjectReviewSummary[]; queue: ProjectReviewSummary[] }) {
  const [query, setQuery] = useState('');
  const [coverage, setCoverage] = useState<'all' | 'reviewed' | 'unreviewed'>('all');
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const filtered = useMemo(() => summaries.filter((summary) => {
    if (query && !`${summary.project.name} ${summary.project.repo ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (coverage === 'reviewed' && !summary.review) return false;
    if (coverage === 'unreviewed' && summary.review) return false;
    return severity === 'all' || summary.worstSeverity === severity;
  }), [coverage, query, severity, summaries]);
  const findings = summaries.reduce((total, summary) => total + summary.openFindings, 0);

  return <>
    <section className={styles.metrics} aria-label="Review coverage summary">
      <article><span>Portfolio</span><strong>{summaries.length}</strong><small>24 GitHub · 1 local-only</small></article>
      <article><span>Reviewed</span><strong>{summaries.filter((item) => item.review).length}</strong><small>{summaries.filter((item) => !item.review).length} awaiting review</small></article>
      <article><span>Open findings</span><strong>{findings}</strong><small>Only confirmed review records</small></article>
      <article><span>Coverage</span><strong>{Math.round(summaries.filter((item) => item.review).length / summaries.length * 100)}%</strong><small>Project-by-project completion</small></article>
    </section>

    <section className={styles.queue} aria-labelledby="next-heading">
      <div className={styles.heading}><div><span>Decision queue</span><h2 id="next-heading">What should we do next?</h2></div><p>Unreviewed sensitive projects first, then the most severe confirmed fixes.</p></div>
      <div className={styles.queueGrid}>{queue.map((summary, index) => <Link href={`/project-reviews/${summary.project.id}`} className={styles.queueItem} key={summary.project.id}>
        <b>{index + 1}</b><div><span>{summary.review ? 'Fix next' : 'Review next'}</span><strong>{summary.project.name}</strong><p>{nextAction(summary)}</p></div><i data-tone={tone(summary)}>{summary.review ? label(summary.worstSeverity ?? 'clear') : `${label(summary.project.risk)} risk`}</i>
      </Link>)}</div>
    </section>

    <section className={styles.portfolio} aria-labelledby="portfolio-heading">
      <div className={styles.heading}><div><span>All projects</span><h2 id="portfolio-heading">Review status</h2></div><p>Filters change only this project list.</p></div>
      <div className={styles.filters}>
        <label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Project or repository" /></label>
        <label><span>Coverage</span><select value={coverage} onChange={(event) => setCoverage(event.target.value as typeof coverage)}><option value="all">All</option><option value="reviewed">Reviewed</option><option value="unreviewed">Unreviewed</option></select></label>
        <label><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="all">All</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select></label>
        <output>{filtered.length} projects</output>
      </div>
      <div className={styles.projectList}>{filtered.map((summary) => <Link href={`/project-reviews/${summary.project.id}`} className={styles.projectRow} key={summary.project.id}>
        <div className={styles.projectName}><span>{summary.project.language}</span><strong>{summary.project.name}</strong><small>{summary.project.repo ?? 'Local-only repository'}</small></div>
        <div><span>Review status</span><strong>{summary.review ? label(summary.review.status) : 'Not reviewed'}</strong><small>{age(summary.review?.reviewedAt)}</small></div>
        <div><span>Coverage</span><strong>{summary.review ? `${summary.review.coverage.length} categories` : 'No coverage'}</strong><small>{summary.review?.coverage.map(label).join(', ') || 'Full review required'}</small></div>
        <div><span>Findings</span><strong>{summary.openFindings} open</strong><small>{summary.worstSeverity ? `${label(summary.worstSeverity)} highest` : 'No confirmed findings'}</small></div>
        <i data-tone={tone(summary)}>{label(summary.freshness)}</i>
      </Link>)}</div>
    </section>
  </>;
}
