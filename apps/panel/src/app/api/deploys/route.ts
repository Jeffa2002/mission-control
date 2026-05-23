/**
 * GET  /api/deploys        — list recent deploys
 * POST /api/deploys        — record a new deploy (called from GitHub Actions webhook or deploy script)
 */

import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import {
  cleanDeployString,
  Deploy,
  isDeployStatus,
  readDeployFeed,
  readDeployLog,
  writeDeployLog,
} from '../_deploys';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  return NextResponse.json(await readDeployFeed());
}

export async function POST(req: Request) {
  // Webhook secret check
  const secret = req.headers.get('x-deploy-secret');
  const expected = process.env.DEPLOY_WEBHOOK_SECRET;
  if (!expected) {
    return new NextResponse('DEPLOY_WEBHOOK_SECRET is not configured', { status: 503 });
  }
  if (secret !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let body: Partial<Deploy>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse('Bad JSON', { status: 400 });
  }

  if (body.status !== undefined && !isDeployStatus(body.status)) {
    return new NextResponse('Invalid deploy status', { status: 400 });
  }

  const deploy: Deploy = {
    id: cleanDeployString(body.id, `${Date.now()}`),
    app: cleanDeployString(body.app, 'unknown'),
    repo: cleanDeployString(body.repo, ''),
    commit: cleanDeployString(body.commit, ''),
    commitMsg: cleanDeployString(body.commitMsg, ''),
    branch: cleanDeployString(body.branch, 'main'),
    status: body.status ?? 'running',
    triggeredBy: cleanDeployString(body.triggeredBy, 'github-actions'),
    startedAt: cleanDeployString(body.startedAt, new Date().toISOString()),
    finishedAt: typeof body.finishedAt === 'string' ? body.finishedAt : undefined,
    durationS: typeof body.durationS === 'number' && Number.isFinite(body.durationS) ? Math.max(0, Math.round(body.durationS)) : undefined,
    runUrl: typeof body.runUrl === 'string' ? body.runUrl : undefined,
  };

  const deploys = await readDeployLog();
  // Update existing if same id, else prepend
  const idx = deploys.findIndex(d => d.id === deploy.id);
  if (idx >= 0) {
    deploys[idx] = deploy;
  } else {
    deploys.unshift(deploy);
  }
  await writeDeployLog(deploys);

  return NextResponse.json({ ok: true, deploy });
}
