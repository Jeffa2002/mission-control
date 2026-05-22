import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { requireSessionAuth } from '../_session-auth';
import { readAuditLog } from '../_util';

type ActivitySeverity = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

interface ActivityItem {
  id: string;
  ts: string;
  source: string;
  title: string;
  detail: string;
  severity: ActivitySeverity;
  href?: string;
}

const AGENT_PATHS = [
  '/workspace/mission-control/agent-status.json',
  '/workspace-data/mission-control/agent-status.json',
  '/workspace/agent-status.json',
  '/agent-data/agent-status.json',
  '/var/www/mission-control/agent-status.json',
  '/app/agent-status.json',
];

const DEPLOY_LOG = process.env.DEPLOY_LOG_FILE ?? '/agent-data/deploy-log.json';

async function readJsonFile<T>(paths: string[] | string, fallback: T): Promise<T> {
  const list = Array.isArray(paths) ? paths : [paths];
  for (const filePath of list) {
    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as T;
    } catch {}
  }
  return fallback;
}

function eventSeverity(event: Record<string, unknown>): ActivitySeverity {
  if (event.error || event.result === 'error') return 'critical';
  if (event.result === 'blocked' || event.severity === 'warning') return 'warning';
  if (event.result === 'ok') return 'healthy';
  return 'neutral';
}

function cleanTs(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? raw : new Date().toISOString();
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const limit = Math.min(120, Math.max(1, Number(url.searchParams.get('limit') || '60')));
  const now = new Date().toISOString();

  const [auditItems, deploys, agentData] = await Promise.all([
    readAuditLog(80).catch(() => []),
    readJsonFile<any[]>(DEPLOY_LOG, []),
    readJsonFile<{ agents?: any[] }>(AGENT_PATHS, { agents: [] }),
  ]);

  const items: ActivityItem[] = [];

  for (const event of auditItems) {
    const action = String(event.action ?? event.raw ?? 'audit event');
    items.push({
      id: `audit:${event.ts ?? action}:${items.length}`,
      ts: cleanTs(event.ts),
      source: String(event.auth_method ?? event.actor ?? 'audit'),
      title: action.replaceAll('_', ' '),
      detail: String(event.error ?? event.detail ?? event.result ?? 'No detail'),
      severity: eventSeverity(event),
      href: '/actions',
    });
  }

  for (const deploy of deploys.slice(0, 25)) {
    const status = String(deploy.status ?? 'running');
    items.push({
      id: `deploy:${deploy.id ?? deploy.startedAt}`,
      ts: cleanTs(deploy.finishedAt ?? deploy.startedAt),
      source: 'deploys',
      title: `${deploy.app ?? 'unknown app'} deploy ${status}`,
      detail: `${deploy.branch ?? 'main'} · ${deploy.commitMsg ?? deploy.commit ?? 'no commit detail'}`,
      severity: status === 'failure' ? 'critical' : status === 'running' ? 'warning' : 'healthy',
      href: '/deploys',
    });
  }

  for (const agent of (agentData.agents ?? []).slice(0, 80)) {
    const status = String(agent.status ?? 'unknown');
    const label = String(agent.label ?? agent.id ?? 'agent');
    const restarts = Number(agent.restarts ?? 0);
    const severity: ActivitySeverity = restarts > 5 ? 'critical' : status.toLowerCase() === 'offline' ? 'warning' : status.toLowerCase() === 'working' ? 'healthy' : 'neutral';
    items.push({
      id: `agent:${agent.id ?? label}`,
      ts: cleanTs(agent.lastSeen ?? agent.ts ?? now),
      source: 'agent mesh',
      title: `${label} ${status}`,
      detail: agent.currentTask ? String(agent.currentTask) : `restarts ${Number.isFinite(restarts) ? restarts : 0}`,
      severity,
      href: agent.id ? `/agents/${agent.id}` : '/',
    });
  }

  items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const counts = items.reduce<Record<ActivitySeverity, number>>((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1;
    return acc;
  }, { healthy: 0, warning: 0, critical: 0, info: 0, neutral: 0 });

  return NextResponse.json({
    ok: true,
    ts: now,
    count: Math.min(items.length, limit),
    counts,
    items: items.slice(0, limit),
  });
}
