/**
 * GET  /api/deploys        — list recent deploys
 * POST /api/deploys        — record a new deploy (called from GitHub Actions webhook or deploy script)
 */

import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import fs from 'fs/promises';
import path from 'path';

const DEPLOY_LOG = process.env.DEPLOY_LOG_FILE ?? '/agent-data/deploy-log.json';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? 'Jeffa2002/mission-control';
const GITHUB_RUNS_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs?per_page=50`;
const MAX_ENTRIES = 50;

interface Deploy {
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
}

async function readLog(): Promise<Deploy[]> {
  try {
    const raw = await fs.readFile(DEPLOY_LOG, 'utf8');
    return JSON.parse(raw);
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
  };
}

async function readGithubRuns(): Promise<Deploy[]> {
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
  return runs.map(mapWorkflowRun).slice(0, MAX_ENTRIES);
}

async function writeLog(deploys: Deploy[]) {
  await fs.mkdir(path.dirname(DEPLOY_LOG), { recursive: true });
  await fs.writeFile(DEPLOY_LOG, JSON.stringify(deploys.slice(0, MAX_ENTRIES), null, 2));
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const localDeploys = await readLog();
  try {
    const githubDeploys = await readGithubRuns();
    const seen = new Set(githubDeploys.map((deploy) => deploy.id));
    const deploys = [
      ...githubDeploys,
      ...localDeploys.filter((deploy) => !seen.has(deploy.id)),
    ].slice(0, MAX_ENTRIES);
    return NextResponse.json({ ok: true, source: 'github-actions', count: deploys.length, deploys });
  } catch (err: any) {
    return NextResponse.json({
      ok: localDeploys.length > 0,
      source: 'deploy-log',
      count: localDeploys.length,
      deploys: localDeploys,
      warning: String(err?.message || err),
    });
  }
}

export async function POST(req: Request) {
  // Webhook secret check
  const secret = req.headers.get('x-deploy-secret');
  const expected = process.env.DEPLOY_WEBHOOK_SECRET;
  if (expected && secret !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let body: Partial<Deploy>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse('Bad JSON', { status: 400 });
  }

  const deploy: Deploy = {
    id: body.id ?? `${Date.now()}`,
    app: body.app ?? 'unknown',
    repo: body.repo ?? '',
    commit: body.commit ?? '',
    commitMsg: body.commitMsg ?? '',
    branch: body.branch ?? 'main',
    status: body.status ?? 'running',
    triggeredBy: body.triggeredBy ?? 'github-actions',
    startedAt: body.startedAt ?? new Date().toISOString(),
    finishedAt: body.finishedAt,
    durationS: body.durationS,
  };

  const deploys = await readLog();
  // Update existing if same id, else prepend
  const idx = deploys.findIndex(d => d.id === deploy.id);
  if (idx >= 0) {
    deploys[idx] = deploy;
  } else {
    deploys.unshift(deploy);
  }
  await writeLog(deploys);

  return NextResponse.json({ ok: true, deploy });
}
