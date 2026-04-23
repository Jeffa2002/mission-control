// @ts-nocheck
import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { requireSessionAuth } from '../../_session-auth';

const PATHS = [
  '/agent-data/agent-status.json',
  '/var/www/mission-control/agent-status.json',
  '/workspace/agent-status.json',
];

interface CacheEntry { ts: number; data: object }
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
      const data = JSON.parse(raw);
      if (data?.agents?.length) {
        cache = { ts: Date.now(), data };
        return NextResponse.json(data);
      }
    } catch { /* try next */ }
  }

  return NextResponse.json({ ok: false, ts: new Date().toISOString(), agents: [] });
}
