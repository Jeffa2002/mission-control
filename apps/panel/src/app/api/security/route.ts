/**
 * GET /api/security
 *
 * Collects real security data from prod via SSH:
 * - fail2ban stats for sshd
 * - nginx 4xx/5xx error counts
 * - auth failure counts from auth.log
 */

import { NextResponse } from 'next/server';
import { runRemote, safeExec, readFirstExisting } from './_security-logs';
import { requireSessionAuth } from '../_session-auth';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const checkedAt = new Date().toISOString();

  // --- fail2ban on prod ---
  const fail2banRaw = runRemote('fail2ban-client status sshd 2>/dev/null || echo "UNAVAILABLE"');
  let fail2ban: { available: boolean; banned: number; totalFailed: number; bannedIPs: string[] } = {
    available: false,
    banned: 0,
    totalFailed: 0,
    bannedIPs: [],
  };

  if (fail2banRaw && !fail2banRaw.includes('UNAVAILABLE') && fail2banRaw.trim().length > 0) {
    fail2ban.available = true;
    const bannedMatch = fail2banRaw.match(/Currently banned:\s+(\d+)/);
    const failedMatch = fail2banRaw.match(/Total failed:\s+(\d+)/);
    const ipsMatch = fail2banRaw.match(/Banned IP list:\s+(.+)/);
    if (bannedMatch) fail2ban.banned = parseInt(bannedMatch[1], 10);
    if (failedMatch) fail2ban.totalFailed = parseInt(failedMatch[1], 10);
    if (ipsMatch) {
      fail2ban.bannedIPs = ipsMatch[1].trim().split(/\s+/).filter(Boolean);
    }
  }

  // --- nginx 4xx/5xx on prod ---
  const nginxErrorCountRaw = runRemote(
    'grep -E " [45][0-9]{2} " /var/log/nginx/access.log 2>/dev/null | wc -l'
  );
  const nginxErrorCount = parseInt((nginxErrorCountRaw || '0').trim(), 10) || 0;

  // nginx errors on bazza
  let bazzaNginxErrors = 0;
  try {
    const bazzaRaw = await readFirstExisting(['/host-logs/nginx/access.log', '/var/log/nginx/access.log']);
    if (bazzaRaw) {
      bazzaNginxErrors = bazzaRaw.split('\n').filter((l) => / [45][0-9]{2} /.test(l)).length;
    }
  } catch {}

  // --- auth failures ---
  const prodAuthFailRaw = runRemote(
    'grep "Failed password" /var/log/auth.log 2>/dev/null | tail -100 | wc -l'
  );
  const prodAuthFails = parseInt((prodAuthFailRaw || '0').trim(), 10) || 0;

  // bazza auth failures
  let bazzaAuthFails = 0;
  try {
    const bazzaAuthRaw = await readFirstExisting(['/host-logs/auth.log', '/var/log/auth.log']);
    if (bazzaAuthRaw) {
      bazzaAuthFails = bazzaAuthRaw.split('\n').filter((l) => l.includes('Failed password')).length;
    }
  } catch {}

  // --- recent fail2ban bans on prod ---
  const recentBansRaw = runRemote(
    'grep -i "ban" /var/log/fail2ban.log 2>/dev/null | tail -20 || echo ""'
  );
  const recentBans: Array<{ ts: string; ip: string; jail: string }> = [];
  if (recentBansRaw) {
    for (const line of recentBansRaw.split('\n').filter(Boolean)) {
      const m = line.match(/^(\S+\s+\S+)\s+fail2ban\.actions\s+.*\[(\w+)\].*Ban\s+(\S+)/);
      if (m) {
        recentBans.push({ ts: m[1], jail: m[2], ip: m[3] });
      }
    }
  }

  const hasThreats = fail2ban.banned > 0 || fail2ban.totalFailed > 20 || prodAuthFails > 10 || nginxErrorCount > 50;

  return NextResponse.json({
    ok: true,
    checkedAt,
    hasThreats,
    fail2ban,
    nginx: {
      prodErrors: nginxErrorCount,
      bazzaErrors: bazzaNginxErrors,
      totalErrors: nginxErrorCount + bazzaNginxErrors,
    },
    authFailures: {
      prod: prodAuthFails,
      bazza: bazzaAuthFails,
      total: prodAuthFails + bazzaAuthFails,
    },
    recentBans,
  });
}
