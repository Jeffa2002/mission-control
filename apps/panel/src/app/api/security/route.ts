/**
 * GET /api/security
 *
 * Builds a live security summary from configured hosts. Falls back to older
 * pre-collected security data only if live collection fails.
 */

import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import fs from 'fs/promises';
import { collectSecurityData } from './_security-collector';
import { readCloudflare } from './_cloudflare-source';

const SECURITY_FILES = [
  process.env.SECURITY_DATA_FILE,
  '/workspace/mission-control/security-data.json',
  '/workspace-data/mission-control/security-data.json',
  '/agent-data/security-data.json',
].filter(Boolean) as string[];

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    const [core, cloudflare] = await Promise.all([
      collectSecurityData(),
      readCloudflare().catch(() => null),
    ]);
    return NextResponse.json({ ...core, cloudflare });
  } catch {
    // fall back to the legacy sync file below
  }

  for (const file of SECURITY_FILES) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw);
      return NextResponse.json({ ...data, source: data.source || 'legacy-security-data-file' });
    } catch {
      // try next
    }
  }

  // File not yet synced or unavailable — return honest empty state.
  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    source: 'empty-fallback',
    hasThreats: false,
    stale: true,
    hosts: [],
    registeredHosts: [],
    fail2ban: { available: false, banned: 0, totalFailed: 0, bannedIPs: [] },
    nginx: { errorCount: 0, errorLogCount: 0, recentErrors: [], recentErrorLogs: [], byHost: [], topSources: [], topPaths: [], topStatuses: [] },
    auth: { failCount: 0, sshAcceptCount: 0, sudoCount: 0, recent: [], recentAccepts: [], recentSudo: [], byHost: [], topUsers: [] },
    firewall: { blockCount: 0, sampleCount: 0, recent: [], byHost: [], topSources: [], topPorts: [] },
    kernel: { issueCount: 0, criticalCount: 0, byHost: [], recent: [] },
    system: { issueCount: 0, criticalCount: 0, byHost: [], recent: [] },
    timeline: { recent: [] },
  });
}
