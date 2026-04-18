/**
 * GET /api/shazza
 *
 * Live health check for Shazza (Intel NUC u9-285H).
 * Fetches from SHAZZA_HEALTH_URL (the health-api.py service on Shazza).
 * Accessible via Tailscale from bazza; prod fetches via relay if needed.
 */
import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';

const SHAZZA_HEALTH_URL = process.env.SHAZZA_HEALTH_URL || 'https://shazza.taile9fed9.ts.net/health';
const TIMEOUT_MS = 8_000;

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const checkedAt = new Date().toISOString();

  try {
    const res = await Promise.race([
      fetch(SHAZZA_HEALTH_URL, { cache: 'no-store' }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
      ),
    ]);

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        reachable: false,
        host: 'shazza',
        label: 'Shazza (Intel NUC u9-285H)',
        tailscaleIp: '100.113.217.81',
        error: `Health endpoint returned ${res.status}`,
        checkedAt,
      });
    }

    const data = await res.json();
    // Pass through the health data with our standard envelope
    return NextResponse.json({
      ...data,
      checkedAt,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      host: 'shazza',
      label: 'Shazza (Intel NUC u9-285H)',
      tailscaleIp: '100.113.217.81',
      error: String(err?.message || err),
      checkedAt,
    });
  }
}
