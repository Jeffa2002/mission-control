/**
 * GET /api/effectx
 *
 * Health checks for EffectX-facing sites and apps running behind prod nginx.
 * Each app is checked via HTTP with a short dashboard timeout.
 * SSL cert expiry is checked via TLS socket connection.
 */

import { NextResponse } from 'next/server';
import * as tls from 'node:tls';
import { requireSessionAuth } from '../_session-auth';

const HTTP_TIMEOUT_MS = 1_500;
const TLS_TIMEOUT_MS = 1_500;

const APPS = [
  {
    id: 'venconx',
    name: 'VenConX',
    description: 'Vendor & contractor management',
    url: 'https://venconx.effectx.com.au',
    healthPath: '/api/auth/providers',
    kind: 'app',
    upstream: '127.0.0.1:3010',
    source: '/var/www/venconx/venconx',
    color: '#0EA5E9',
  },
  {
    id: 'queuem8-app',
    name: 'QueueM8 App',
    description: 'Queue and customer flow management',
    url: 'https://app.queuem8.effectx.com.au',
    healthPath: '/',
    kind: 'app',
    upstream: '127.0.0.1:3005',
    source: '/var/www/queuem8/cutline',
    color: '#F59E0B',
  },
  {
    id: 'queuem8-web',
    name: 'QueueM8 Web',
    description: 'QueueM8 marketing site',
    url: 'https://queuem8.effectx.com.au',
    healthPath: '/',
    kind: 'site',
    upstream: '127.0.0.1:3032',
    source: '/var/www/queuem8/cutline-web',
    color: '#F59E0B',
  },
  {
    id: 'projenta-app',
    name: 'Projenta App',
    description: 'Project and portfolio management',
    url: 'https://app.projenta.io',
    healthPath: '/api/auth/providers',
    kind: 'app',
    upstream: '127.0.0.1:3022',
    source: '/var/www/projectxify/projectxify',
    color: '#7C3AED',
  },
  {
    id: 'projenta-web',
    name: 'Projenta Web',
    description: 'Projenta marketing site',
    url: 'https://projenta.io',
    healthPath: '/',
    kind: 'site',
    upstream: '127.0.0.1:3024',
    source: '/var/www/projectxify/projenta-web',
    color: '#7C3AED',
  },
  {
    id: 'ordantra-app',
    name: 'Ordantra App',
    description: 'ITSM ticketing, incidents, and assets',
    url: 'https://app-ordantra.effectx.com.au',
    healthPath: '/api/auth/providers',
    kind: 'app',
    upstream: '127.0.0.1:3030',
    source: '/var/www/ordantra-current/ordantra',
    color: '#6366F1',
  },
  {
    id: 'ordantra-web',
    name: 'Ordantra Web',
    description: 'Ordantra marketing site',
    url: 'https://ordantra.effectx.com.au',
    healthPath: '/',
    kind: 'site',
    upstream: '127.0.0.1:3004',
    source: '/var/www/ordantra-current/ordantra-web',
    color: '#6366F1',
  },
  {
    id: 'timepulse',
    name: 'TimePulse',
    description: 'WA Gov time management and flexi leave',
    url: 'https://timepulse.effectx.com.au',
    healthPath: '/api/auth/providers',
    kind: 'app',
    upstream: '127.0.0.1:3027',
    source: '/root/.openclaw/workspace/timepulse',
    color: '#10B981',
  },
  {
    id: 'crossbench',
    name: 'Crossbench',
    description: 'Crossbench public site and app surface',
    url: 'https://crossbench.io',
    healthPath: '/',
    kind: 'app',
    upstream: '127.0.0.1:3006',
    source: '/var/www/crossbench',
    color: '#22D3EE',
  },
  {
    id: 'abea-ndh',
    name: 'ABEA NDH',
    description: 'ABEA NDH public application',
    url: 'https://abea-ndh.effectx.com.au',
    healthPath: '/',
    kind: 'app',
    upstream: '127.0.0.1:3055',
    source: 'pm2:pm2-abea',
    color: '#EF4444',
  },
  {
    id: 'crm8',
    name: 'CRM8',
    description: 'CRM and sales pipeline management',
    url: 'https://crm8.effectx.com.au',
    healthPath: '/login',
    kind: 'app',
    upstream: '100.112.179.70:443',
    source: 'crm8 tailnet host',
    color: '#F43F5E',
    healthyStatusCodes: [403],
  },
  {
    id: 'effectx-site',
    name: 'EffectX Site',
    description: 'EffectX public website',
    url: 'https://effectx.com.au',
    healthPath: '/',
    kind: 'site',
    upstream: 'static export',
    source: '/var/www/effectx-site/out',
    color: '#14B8A6',
  },
  {
    id: 'equim8-site',
    name: 'Equim8 Site',
    description: 'Equim8 public website',
    url: 'https://equim8.com.au',
    healthPath: '/',
    kind: 'site',
    upstream: 'static export',
    source: '/var/www/equim8-site/out',
    color: '#84CC16',
  },
  {
    id: 'fuel',
    name: 'Fuel',
    description: 'Fuel tool surface',
    url: 'https://fuel.effectx.com.au',
    healthPath: '/',
    kind: 'tool',
    upstream: '127.0.0.1:3041',
    source: 'nginx upstream',
    color: '#F97316',
  },
  {
    id: 'nurturerecord',
    name: 'NurtureRecord',
    description: 'NurtureRecord application',
    url: 'https://nurturerecord.effectx.com.au',
    healthPath: '/',
    kind: 'app',
    upstream: '127.0.0.1:3033',
    source: 'nginx upstream',
    color: '#EC4899',
  },
  {
    id: 'orgcharts',
    name: 'OrgCharts',
    description: 'Organisation chart tool',
    url: 'https://orgcharts.effectx.com.au',
    healthPath: '/',
    kind: 'tool',
    upstream: '127.0.0.1:3035',
    source: '/var/www/orgcharts',
    color: '#38BDF8',
  },
  {
    id: 'yielddock',
    name: 'YieldDock',
    description: 'YieldDock application',
    url: 'https://yielddock.effectx.com.au',
    healthPath: '/',
    kind: 'app',
    upstream: '127.0.0.1:3034',
    source: '/var/www/yielddock/app',
    color: '#A3E635',
  },
  {
    id: 'mission-control',
    name: 'Mission Control',
    description: 'Operations panel',
    url: 'https://mission.effectx.com.au',
    probeUrl: 'http://127.0.0.1:3020',
    healthPath: '/',
    kind: 'internal',
    upstream: '127.0.0.1:3020',
    source: '/var/www/mission-control',
    color: '#22C55E',
  },
] as const;

type AppStatus = 'up' | 'degraded' | 'down' | 'unknown';
type AppKind = 'app' | 'site' | 'tool' | 'alias' | 'internal';

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
  iconUrl: string;
  kind: AppKind;
  healthPath: string;
  upstream: string;
  source: string;
  color: string;
  status: AppStatus;
  statusCode?: number;
  latencyMs?: number;
  ssl?: SslInfo;
  error?: string;
  checkedAt: string;
}

async function checkSsl(hostname: string, port = 443): Promise<SslInfo | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), TLS_TIMEOUT_MS);
    try {
      const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false }, () => {
        clearTimeout(timer);
        try {
          const cert = socket.getPeerCertificate();
          socket.destroy();
          if (!cert?.valid_to) return resolve(null);
          const expiresAt = new Date(cert.valid_to).toISOString();
          const daysRemaining = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
          const issuerValue = cert.issuer?.O;
          const issuer = Array.isArray(issuerValue) ? issuerValue.join(', ') : issuerValue ?? undefined;
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
        const res = await fetch(`${'probeUrl' in app ? app.probeUrl : app.url}${app.healthPath}`, {
          cache: 'no-store',
          headers: { 'User-Agent': 'MissionControl/1.0 HealthCheck' },
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
        const latencyMs = Date.now() - start;
        const expectedStatus = 'healthyStatusCodes' in app && (app.healthyStatusCodes as readonly number[]).includes(res.status);
        // 2xx/3xx and explicitly configured access-control responses are healthy.
        const status: AppStatus = res.status < 400 || expectedStatus ? 'up' : res.status < 500 ? 'degraded' : 'down';
        return { status, statusCode: res.status, latencyMs, error: undefined as string | undefined };
      } catch (e: any) {
        return { status: 'down' as AppStatus, latencyMs: Date.now() - start, error: String(e?.message || e), statusCode: undefined };
      }
    })(),
    isHttps ? checkSsl(hostname) : Promise.resolve(null),
  ]);

  return {
    ...app,
    iconUrl: new URL('/favicon.ico', app.url).toString(),
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
  const degradedCount = results.filter((r) => r.status === 'degraded').length;
  const overall = downCount === 0 && degradedCount === 0 ? 'green' : downCount < results.length / 2 ? 'amber' : 'red';

  return NextResponse.json({
    ok: true,
    overall,
    summary: { total: results.length, up: upCount, down: downCount, degraded: degradedCount },
    apps: results,
    checkedAt: new Date().toISOString(),
  });
}
