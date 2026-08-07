import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell, SectionTitle } from '../../../components/ops-ui';
import { findProject } from '../../../lib/project-registry.mjs';
import { freshness, loadReviewStore } from '../project-reviews-model';
import styles from '../project-reviews.module.css';

export const dynamic = 'force-dynamic';
function label(value: string) { return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }

export default async function ProjectReviewDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = findProject(projectId);
  if (!project) notFound();
  const reviews = loadReviewStore().reviews.filter((review) => review.projectId === project.id).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
  const review = reviews[0] ?? null;
  const allFindings = reviews.flatMap((item) => item.findings.map((finding) => ({ ...finding, reviewer: item.reviewer, reviewStatus: item.status })));
  const allCoverage = [...new Set(reviews.flatMap((item) => item.coverage))];
  return <AppShell><main className={styles.page}>
    <Link href="/project-reviews" className={styles.back}>← All project reviews</Link>
    <SectionTitle title={project.name} subtitle={project.repo ?? 'Local-only repository'} />
    {!review ? <section className={styles.empty}>
      <span data-tone="unreviewed">Not reviewed</span><h2>This project needs its first review</h2>
      <p>No findings are shown because absence of review evidence is not evidence of code quality. Review the default branch at a recorded commit, then add a schema-versioned artifact.</p>
      <dl><div><dt>Suggested next action</dt><dd>Run correctness, security, dependency, test, deployment, and maintainability passes.</dd></div><div><dt>Priority profile</dt><dd>{label(project.risk)} risk</dd></div><div><dt>Default branch</dt><dd>{project.defaultBranch}</dd></div></dl>
    </section> : <>
      <section className={styles.reviewHero}>
        <div><span>Latest review</span><strong>{label(review.status)}</strong><small>{new Date(review.reviewedAt).toLocaleString()} · {review.reviewer}</small></div>
        <div><span>Reviewed ref</span><strong><code>{review.commitSha ?? 'Not commit-bound'}</code></strong><small>{review.branch}</small></div>
        <div><span>Freshness</span><strong>{label(freshness(review))}</strong><small>Age is timestamp-based; compare SHA before fixing</small></div>
        <div><span>Open findings</span><strong>{allFindings.filter((finding) => finding.status === 'open').length}</strong><small>{reviews.length} review record{reviews.length === 1 ? '' : 's'} · {allCoverage.length} categories</small></div>
      </section>
      <section className={styles.summary}><span>Latest review summary</span><p>{review.summary}</p><div>{allCoverage.map((category) => <i key={category}>{label(category)}</i>)}</div></section>
      <section className={styles.findings} aria-labelledby="findings-heading">
        <div className={styles.heading}><div><span>Evidence-backed results</span><h2 id="findings-heading">Findings</h2></div><p>Effort is shown only where assessed.</p></div>
        {allFindings.map((finding) => <article key={`${finding.reviewer}-${finding.id}`}>
          <header><div><i data-tone={finding.severity}>{label(finding.severity)}</i><i>{label(finding.confidence)}</i><i>{label(finding.category)}</i><i>{finding.reviewer} · {label(finding.reviewStatus)}</i></div><span>{finding.effort ? `${label(finding.effort)} effort` : 'Effort not estimated'}</span></header>
          <h3>{finding.title}</h3><p>{finding.description}</p>
          <div className={styles.evidence}><span>Evidence</span>{finding.evidence.map((item) => <code key={item}>{item}</code>)}</div>
          <div className={styles.action}><span>Recommended next action</span><p>{finding.recommendation}</p></div>
        </article>)}
      </section>
    </>}
  </main></AppShell>;
}
