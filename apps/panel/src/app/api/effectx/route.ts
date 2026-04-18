/**
 * GET /api/effectx
 *
 * Health checks for all Effectx suite apps running on prod (203.57.50.240).
 * Each app is checked via HTTP with a 4s timeout.
 * SSL cert expiry is checked via TLS socket connection.
 */

import { NextResponse } from 'next/server';
import * as tls from 'node:tls';
import { requireSessionAuth } from '../_session-auth';

const TIMEOUT_MS = 4_000;

const APPS = [
  {
    id: 'helix',
    name: 'Helix',
    description: 'ITSM — ticketing, incidents, assets',
    url: 'https://app.helix.effectx.com.au',
    healthPath: '/api/auth/providers',
    color: '#6366F1',
    emoji: '🎫',
  },
  {
    id: 'helix-web',
    name: 'Helix Web',
    description: 'Helix marketing site',
    url: 'https://helix.effectx.com.au',
    healthPath: '/',
    color: '#6366F1',
    emoji: '🌐',
  },
  {
    id: 'venconx',
    name: 'VenconX',
    description: 'Vendor & contractor management',
    url: 'https://venconx.effectx.com.au',
    healthPath: '/api/auth/providers',
    color: '#0EA5E9',
    emoji: '🤝',
  },
  {
    id: 'projectxify',
    name: 'ProjectXify',
    description: 'Project & portfolio management',
    url: 'https://app.projectxify.effectx.com.au',
    healthPath: '/api/auth/providers',
    color: '#7C3AED',
    emoji: '📋',
  },
  {
    id: 'projectxify-web',
    name: 'ProjectXify Web',
    description: 'ProjectXify marketing site',
    url: 'https://projectxify.effectx.com.au',
    healthPath: '/',
    color: '#7C3AED',
    emoji: '🌐',
  },
  {
    id: 'timepulse',
    name: 'TimePulse',
    description: 'WA Gov time management & flexi leave',
    url: 'https://timepulse.effectx.com.au',
    healthPath: '/api/auth/providers',
    color: '#10B981',
    emoji: '⏱️',
  },
  {
    id: 'queuem8',
    name: 'QueueM8',
    description: 'Queue & customer flow management',
    url: 'https://app.queuem8.effectx.com.au',
    healthPath: '/',
    color: '#F59E0B',
    emoji: '🎟️',
  },
  {
    id: 'queuem8-web',
    name: 'QueueM8 Web',
    description: 'QueueM8 marketing site (Cutline)',
    url: 'https://cutline.effectx.com.au',
    healthPath: '/',
    color: '#F59E0B',
    emoji: '🌐',
  },
  {
    id: "crm8",
    name: "CRM8",
    description: "CRM & sales pipeline management",
    url: "https://crm8.effectx.com.au",
    healthPath: "/login",
    color: "#EF4444",
    emoji: "👥",
  },
] as const;

type AppStatus = 'up' | 'degraded' | 'down' | 'unknown';

interface SslInfo {
  valid: boolean;
  expiresAt: string;
  daysRemaining: number;
  issuer?: string;
}

interface AppHealth {
  id: string;
  name: string;
  description: string;
  url: string;
  color: string;
  emoji: string;
  status: AppStatus;
  statusCode?: number;
  latencyMs?: number;
  ssl?: SslInfo;
  error?: string;
  checkedAt: string;
}

async function checkSsl(hostname: string, port = 443): Promise<SslInfo | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5_000);
    try {
      const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false }, () => {
        clearTimeout(timer);
        try {
          const cert = socket.getPeerCertificate();
          socket.destroy();
          if (!cert?.valid_to) return resolve(null);
          const expiresAt = new Date(cert.valid_to).toISOString();
          const daysRemaining = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
          const issuer = cert.issuer?.O ?? undefined;
          resolve({ valid: daysRemaining > 0, expiresAt, daysRemaining, issuer });
        } catch {
          resolve(null);
        }
      });
      socket.on('error', () => { clearTimeout(timer); resolve(null); });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function checkApp(app: typeof APPS[number]): Promise<AppHealth> {
  const checkedAt = new Date().toISOString();
  const start = Date.now();
  const hostname = new URL(app.url).hostname;
  const isHttps = app.url.startsWith('https');

  const [httpResult, ssl] = await Promise.all([
    (async () => {
      try {
        const res = await Promise.race([
          fetch(`${app.url}${app.healthPath}`, {
            cache: 'no-store',
            headers: { 'User-Agent': 'MissionControl/1.0 HealthCheck' },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
          ),
        ]);
        const latencyMs = Date.now() - start;
        // 2xx and 3xx = up, 4xx = degraded, 5xx = down
        const status: AppStatus = res.status < 400 ? 'up' : res.status < 500 ? 'degraded' : 'down';
        return { status, statusCode: res.status, latencyMs, error: undefined as string | undefined };
      } catch (e: any) {
        return { status: 'down' as AppStatus, latencyMs: Date.now() - start, error: String(e?.message || e), statusCode: undefined };
      }
    })(),
    isHttps ? checkSsl(hostname) : Promise.resolve(null),
  ]);

  return {
    ...app,
    status: httpResult.status,
    statusCode: httpResult.statusCode,
    latencyMs: httpResult.latencyMs,
    ssl: ssl ?? undefined,
    error: httpResult.error,
    checkedAt,
  };
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const results = await Promise.all(APPS.map(checkApp));

  const upCount = results.filter((r) => r.status === 'up').length;
  const downCount = results.filter((r) => r.status === 'down').length;
  const overall = downCount === 0 ? 'green' : downCount < results.length / 2 ? 'amber' : 'red';

  return NextResponse.json({
    ok: true,
    overall,
    summary: { total: results.length, up: upCount, down: downCount, degraded: results.filter((r) => r.status === 'degraded').length },
    apps: results,
    checkedAt: new Date().toISOString(),
  });
}
