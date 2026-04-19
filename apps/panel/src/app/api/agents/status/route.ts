// @ts-nocheck
/**
 * /api/agents/status
 * Reads from /workspace/agent-status.json — written every minute by
 * push-agent-status.sh running on bazza (the OpenClaw host).
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { requireSessionAuth } from '../_session-auth';

const STATUS_FILE = '/workspace/mission-control/agent-status.json';
const FALLBACK_FILE = '/agent-status.json'; // root of workspace mount

interface AgentStatus {
  id: string;
  name: string;
  label: string;
  emoji: string;
  role: string;
  model: string;
  busy: boolean;
  status: 'Working' | 'Idle' | 'Offline';
  lastSeen: string | null;
  currentTask: string | null;
  sessionId: string | null;
}

interface CacheEntry {
  ts: number;
  data: { ok: boolean; ts: string; agents: AgentStatus[] };
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5_000;

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  // Try a few possible paths for the status file
  const PATHS = [
    '/var/www/mission-control/agent-status.json',
    '/workspace/agent-status.json',
    '/agent-status.json',
  ];

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

  // Nothing found
  return NextResponse.json({ ok: false, ts: new Date().toISOString(), agents: [] });
}
