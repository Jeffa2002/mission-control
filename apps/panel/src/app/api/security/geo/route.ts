import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { requireSessionAuth } from '../../_session-auth';

type Country = { code: string; name: string; count: number; active?: boolean };

const COUNTRY_NAMES: Record<string, string> = {
  CN: 'China', US: 'United States', RU: 'Russia', BR: 'Brazil', IN: 'India',
  VN: 'Vietnam', HK: 'Hong Kong', DE: 'Germany', FR: 'France', NL: 'Netherlands',
  GB: 'United Kingdom', CA: 'Canada', SG: 'Singapore', AU: 'Australia', JP: 'Japan',
  KR: 'South Korea', TR: 'Turkey', PL: 'Poland', TW: 'Taiwan', SE: 'Sweden',
  IR: 'Iran', UA: 'Ukraine', RO: 'Romania', IT: 'Italy', TH: 'Thailand',
  ID: 'Indonesia', MX: 'Mexico', AR: 'Argentina', NG: 'Nigeria', PK: 'Pakistan',
};

const AUTH_LOG_PATHS = [
  '/host-logs/auth.log',
  '/host-logs/auth.log.1',
  '/var/log/auth.log',
];

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 10000, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function parseGeoLookup(output: string): { code: string; name: string } | null {
  // "GeoIP Country Edition: CN, China"
  const m = output.match(/GeoIP[^:]*:\s*([A-Z]{2}),\s*(.+)/);
  if (!m) return null;
  const code = m[1];
  const name = COUNTRY_NAMES[code] || m[2].trim();
  return { code, name };
}

interface CacheEntry { ts: number; data: ReturnType<typeof buildResponse> }
let cache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60_000;

function buildResponse(countries: Country[]) {
  const total = countries.reduce((s, c) => s + c.count, 0);
  return {
    countries,
    total,
    topCountries: countries.slice(0, 8),
    activeCountries: countries.slice(0, 6).map(c => ({ ...c, active: true })),
  };
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    // Read auth logs directly from bind-mounted /host-logs
    let raw = '';
    for (const p of AUTH_LOG_PATHS) {
      try {
        raw = await readFile(p, 'utf-8');
        if (raw) break;
      } catch { /* try next */ }
    }

    if (!raw) {
      return NextResponse.json(buildResponse([]));
    }

    // Extract IPs from failed auth lines
    const ipCounts = new Map<string, number>();
    for (const line of raw.split('\n')) {
      if (!line.includes('Failed password') && !line.includes('Invalid user')) continue;
      const ip = line.match(/(\d{1,3}(?:\.\d{1,3}){3})/)?.[1];
      if (ip) ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
    }

    if (ipCounts.size === 0) {
      return NextResponse.json(buildResponse([]));
    }

    // Resolve top 30 IPs with geoiplookup (available on prod host via bind mount exec)
    const topIPs = [...ipCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([ip]) => ip);

    const geo = new Map<string, Country>();
    for (const ip of topIPs) {
      const out = safeExec(`geoiplookup ${ip} 2>/dev/null`);
      const parsed = parseGeoLookup(out);
      if (!parsed) continue;
      const count = ipCounts.get(ip) ?? 0;
      const current = geo.get(parsed.code) ?? { code: parsed.code, name: parsed.name, count: 0 };
      current.count += count;
      geo.set(parsed.code, current);
    }

    const countries = [...geo.values()].sort((a, b) => b.count - a.count);
    const result = buildResponse(countries);
    cache = { ts: Date.now(), data: result };
    return NextResponse.json(result);
  } catch (e) {
    console.error('geo route error:', e);
    return NextResponse.json(buildResponse([]));
  }
}
