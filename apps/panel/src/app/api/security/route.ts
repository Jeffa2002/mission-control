/**
 * GET /api/security
 *
 * Reads pre-collected security data from /agent-data/security-data.json
 * (collected by bazza's sync-agent-data.sh every 15s via SSH to prod).
 * Falls back to empty/honest state if file not found.
 */

import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import fs from 'fs/promises';

const SECURITY_FILES = [
  process.env.SECURITY_DATA_FILE,
  '/workspace/mission-control/security-data.json',
  '/workspace-data/mission-control/security-data.json',
  '/agent-data/security-data.json',
].filter(Boolean) as string[];

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  for (const file of SECURITY_FILES) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw);
      return NextResponse.json(data);
    } catch {
      // try next
    }
  }

  // File not yet synced or unavailable — return honest empty state.
  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    hasThreats: false,
    stale: true,
    fail2ban: { available: false, banned: 0, totalFailed: 0, bannedIPs: [] },
    nginx: { errorCount: 0, recentErrors: [] },
    auth: { failCount: 0, recent: [] },
  });
}
