import { NextResponse } from 'next/server';
import { sh } from '../_util';
import { requireSessionAuth } from '../_session-auth';
import { probeAllSystems } from '../_system-health';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;
  const systems = await probeAllSystems();
  const ok = systems.every((system) => system.ok);

  try {
    const ps = await sh('docker', ['ps', '--format', 'table {{.Names}}\t{{.Status}}\t{{.Image}}']);
    return NextResponse.json({ ok, systems, ps, checkedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({
      ok,
      systems,
      ps: null,
      dockerError: String(e?.message || e),
      checkedAt: new Date().toISOString(),
    });
  }
}
