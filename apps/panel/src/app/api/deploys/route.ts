/**
 * GET  /api/deploys        — list recent deploys
 * POST /api/deploys        — record a new deploy (called from GitHub Actions webhook or deploy script)
 */

import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import fs from 'fs/promises';
import path from 'path';

const DEPLOY_LOG = process.env.DEPLOY_LOG_FILE ?? '/agent-data/deploy-log.json';
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

async function writeLog(deploys: Deploy[]) {
  await fs.mkdir(path.dirname(DEPLOY_LOG), { recursive: true });
  await fs.writeFile(DEPLOY_LOG, JSON.stringify(deploys.slice(0, MAX_ENTRIES), null, 2));
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const deploys = await readLog();
  return NextResponse.json({ ok: true, count: deploys.length, deploys });
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
