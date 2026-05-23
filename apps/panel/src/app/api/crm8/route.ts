import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import { getSystemDefinition, probeSystemHealth } from '../_system-health';

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const checkedAt = new Date().toISOString();
  const system = getSystemDefinition('crm8');
  if (!system) {
    return NextResponse.json({ ok: false, reachable: false, service: 'crm8', label: 'CRM8', error: 'CRM8 is not registered', checkedAt });
  }

  const result = await probeSystemHealth(system);
  if (result.ok) {
    return NextResponse.json({
      ...result.data,
      reachable: true,
      probe: result.probe,
      checkedAt: result.checkedAt,
    });
  }

  return NextResponse.json({
    ok: false,
    reachable: result.reachable,
    service: 'crm8',
    label: 'CRM8',
    error: result.error || 'Health check failed',
    probe: result.probe,
    checkedAt: result.checkedAt,
  });
}
