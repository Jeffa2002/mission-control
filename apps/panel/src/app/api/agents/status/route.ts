import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { requireSessionAuth } from '../../_session-auth';
import { parseSafeStatusSnapshot, reconcileSafeAgents, type SafeStatusSnapshot } from './safe-work-model';

const PATHS = [
  '/workspace/mission-control/agent-status.json',
  '/workspace-data/mission-control/agent-status.json',
  '/workspace/agent-status.json',
  '/agent-data/agent-status.json',
  '/var/www/mission-control/agent-status.json',
  '/app/agent-status.json',
];

interface CacheEntry { ts: number; data: SafeStatusSnapshot }
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5_000;

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  for (const p of PATHS) {
    try {
      const raw = await readFile(p, 'utf-8');
      const parsed = parseSafeStatusSnapshot(JSON.parse(raw));
      const data = { ...parsed, agents: reconcileSafeAgents(parsed.agents) };
      cache = { ts: Date.now(), data };
      return NextResponse.json(data);
    } catch { /* try next */ }
  }

  return NextResponse.json({ schemaVersion: 1, ok: false, ts: new Date().toISOString(), agents: [] });
}
