import fs from 'fs/promises';
import path from 'path';

export const DEPLOY_LOG = process.env.DEPLOY_LOG_FILE ?? '/agent-data/deploy-log.json';
export const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? 'Jeffa2002/mission-control';
const GITHUB_RUNS_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs?per_page=50`;
export const MAX_DEPLOY_ENTRIES = 50;

export interface Deploy {
  id: string;
  app: string;
  repo: string;
  commit: string;
  commitMsg: string;
  branch: string;
  status: 'success' | 'failure' | 'running';
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  durationS?: number;
  runUrl?: string;
}

export type DeployFeed = {
  ok: boolean;
  source: 'github-actions' | 'deploy-log';
  count: number;
  deploys: Deploy[];
  warning?: string;
};

export async function readDeployLog(): Promise<Deploy[]> {
  try {
    const raw = await fs.readFile(DEPLOY_LOG, 'utf8');
    const deploys = JSON.parse(raw);
    return Array.isArray(deploys) ? deploys : [];
  } catch {
    return [];
  }
}

function mapRunStatus(status: string, conclusion: string | null): Deploy['status'] {
  if (status !== 'completed') return 'running';
  if (conclusion === 'success') return 'success';
  return 'failure';
}

function durationSeconds(startedAt?: string, updatedAt?: string) {
  if (!startedAt || !updatedAt) return undefined;
  const started = new Date(startedAt).getTime();
  const finished = new Date(updatedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return undefined;
  return Math.round((finished - started) / 1000);
}

function mapWorkflowRun(run: any): Deploy {
  return {
    id: String(run.id),
    app: run.name || run.workflow_name || 'GitHub Actions',
    repo: run.repository?.full_name || GITHUB_REPOSITORY,
    commit: run.head_sha || '',
    commitMsg: run.display_title || run.head_commit?.message || '',
    branch: run.head_branch || '',
    status: mapRunStatus(run.status, run.conclusion),
    triggeredBy: run.actor?.login || run.triggering_actor?.login || 'github-actions',
    startedAt: run.run_started_at || run.created_at || new Date().toISOString(),
    finishedAt: run.status === 'completed' ? run.updated_at : undefined,
    durationS: durationSeconds(run.run_started_at || run.created_at, run.updated_at),
    runUrl: run.html_url || undefined,
  };
}

export async function readGithubDeployRuns(): Promise<Deploy[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'mission-control',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(GITHUB_RUNS_URL, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`GitHub Actions API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  return runs.map(mapWorkflowRun).slice(0, MAX_DEPLOY_ENTRIES);
}

export async function readDeployFeed(): Promise<DeployFeed> {
  const localDeploys = await readDeployLog();
  try {
    const githubDeploys = await readGithubDeployRuns();
    const seen = new Set(githubDeploys.map((deploy) => deploy.id));
    const deploys = [
      ...githubDeploys,
      ...localDeploys.filter((deploy) => !seen.has(deploy.id)),
    ]
      .sort((left, right) => {
        const leftTime = new Date(left.startedAt).getTime();
        const rightTime = new Date(right.startedAt).getTime();
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      })
      .slice(0, MAX_DEPLOY_ENTRIES);
    return { ok: true, source: 'github-actions', count: deploys.length, deploys };
  } catch (err: any) {
    return {
      ok: localDeploys.length > 0,
      source: 'deploy-log',
      count: localDeploys.length,
      deploys: [...localDeploys]
        .sort((left, right) => {
          const leftTime = new Date(left.startedAt).getTime();
          const rightTime = new Date(right.startedAt).getTime();
          return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
        })
        .slice(0, MAX_DEPLOY_ENTRIES),
      warning: String(err?.message || err),
    };
  }
}

export async function writeDeployLog(deploys: Deploy[]) {
  await fs.mkdir(path.dirname(DEPLOY_LOG), { recursive: true });
  await fs.writeFile(DEPLOY_LOG, JSON.stringify(deploys.slice(0, MAX_DEPLOY_ENTRIES), null, 2));
}

export function isDeployStatus(value: unknown): value is Deploy['status'] {
  return value === 'success' || value === 'failure' || value === 'running';
}

export function cleanDeployString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.slice(0, 500) : fallback;
}
