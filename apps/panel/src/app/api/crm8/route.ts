import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';

const CRM8_HEALTH_URL = process.env.CRM8_HEALTH_URL || 'http://100.112.179.70:8080/api/health';
const TIMEOUT_MS = 8_000;

async function fetchHealth() {
  const res = await Promise.race([
    fetch(CRM8_HEALTH_URL, { cache: 'no-store' }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
    ),
  ]);

  if (!res.ok) {
    const isAuthError = res.status === 401 || res.status === 403;
    throw new Error(isAuthError ? `Auth error (${res.status})` : `Health check failed (HTTP ${res.status})`);
  }

  return res.json();
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const checkedAt = new Date().toISOString();

  try {
    const data = await fetchHealth();
    return NextResponse.json({
      ...data,
      reachable: true,
      probe: CRM8_HEALTH_URL.includes('100.112.179.70') ? 'tailnet' : 'public',
      checkedAt,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      service: 'crm8',
      label: 'CRM8',
      error: String(err?.message || err),
      checkedAt,
    });
  }
}
