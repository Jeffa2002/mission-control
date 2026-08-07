import { AppShell, SectionTitle } from '../../components/ops-ui';
import { loadReviewStore, priorityQueue, summarizeProjects } from './project-reviews-model';
import { ProjectReviewsClient } from './project-reviews-client';
import styles from './project-reviews.module.css';

export const dynamic = 'force-dynamic';

export default function ProjectReviewsPage() {
  const summaries = summarizeProjects(loadReviewStore());
  const queue = priorityQueue(summaries);
  return <AppShell><main className={styles.page}>
    <SectionTitle title="Project Reviews" subtitle="Portfolio-wide code review coverage, confirmed findings, and a prioritized next-work queue" />
    <ProjectReviewsClient summaries={summaries} queue={queue.slice(0, 8)} />
  </main></AppShell>;
}
