import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../_session-auth';
import { sh } from '../_util';

const CRM8_HEALTH_URL = process.env.CRM8_HEALTH_URL || 'https://crm8.effectx.com.au/api/health';
const CRM8_TAILNET_HOST = process.env.CRM8_TAILNET_HOST || '100.112.179.70';
const CRM8_SSH_USER = process.env.CRM8_SSH_USER || 'root';
const CRM8_SSH_PORT = process.env.CRM8_SSH_PORT || '2222';
const CRM8_SSH_KEY = process.env.CRM8_SSH_KEY || '/root/.ssh/id_ed25519';
const TIMEOUT_MS = 8_000;

async function fetchPublicHealth() {
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

async function fetchTailnetHealth() {
  const raw = await sh('ssh', [
    '-i', CRM8_SSH_KEY,
    '-p', CRM8_SSH_PORT,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-o', `ConnectTimeout=${Math.ceil(TIMEOUT_MS / 1000)}`,
    `${CRM8_SSH_USER}@${CRM8_TAILNET_HOST}`,
    'curl -fsS --max-time 8 http://127.0.0.1:3044/api/health',
  ], { timeoutMs: TIMEOUT_MS + 2_000 });

  return JSON.parse(raw);
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const checkedAt = new Date().toISOString();
  let publicError: string | null = null;

  try {
    const data = await fetchPublicHealth();
    return NextResponse.json({
      ...data,
      reachable: true,
      probe: 'public',
      checkedAt,
    });
  } catch (err: any) {
    publicError = String(err?.message || err);
  }

  try {
    const data = await fetchTailnetHealth();
    return NextResponse.json({
      ...data,
      reachable: true,
      probe: 'tailnet-ssh',
      publicError,
      checkedAt,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      service: 'crm8',
      label: 'CRM8',
      error: String(err?.message || err),
      publicError,
      checkedAt,
    });
  }
}
