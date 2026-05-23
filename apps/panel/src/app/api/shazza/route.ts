/**
 * GET /api/shazza
 *
 * Live health check for Shazza (Intel NUC u9-285H).
 * Fetches from SHAZZA_HEALTH_URL (the health-api.py service on Shazza).
 * Accessible via Tailscale from bazza; prod fetches via relay if needed.
 */
import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import { getSystemDefinition, probeSystemHealth } from '../_system-health';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const checkedAt = new Date().toISOString();
  const system = getSystemDefinition('shazza');
  if (!system) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      host: 'shazza',
      label: 'Shazza (Intel NUC u9-285H)',
      tailscaleIp: '100.113.217.81',
      error: 'Shazza is not registered',
      checkedAt,
    });
  }

  const result = await probeSystemHealth(system);
  if (result.ok) {
    return NextResponse.json({
      ...result.data,
      checkedAt: result.checkedAt,
    });
  }

  return NextResponse.json({
    ok: false,
    reachable: result.reachable,
    host: 'shazza',
    label: 'Shazza (Intel NUC u9-285H)',
    tailscaleIp: system.metadata?.tailscaleIp || '100.113.217.81',
    error: result.error || 'Health check failed',
    probe: result.probe,
    checkedAt: result.checkedAt,
  });
}
