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

const SECURITY_FILE = process.env.SECURITY_DATA_FILE ?? '/agent-data/security-data.json';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    const raw = await fs.readFile(SECURITY_FILE, 'utf8');
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    // File not yet synced or unavailable — return honest empty state
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
}
