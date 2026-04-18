// @ts-nocheck
import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { requireSessionAuth } from '../../_session-auth';

type Country = { code: string; name: string; count: number; active?: boolean };

const COUNTRY_NAMES: Record<string, string> = {
  CN: 'China', US: 'United States', RU: 'Russia', BR: 'Brazil', IN: 'India',
  VN: 'Vietnam', HK: 'Hong Kong', DE: 'Germany', FR: 'France', NL: 'Netherlands',
  GB: 'United Kingdom', CA: 'Canada', SG: 'Singapore', AU: 'Australia', JP: 'Japan',
  KR: 'South Korea', TR: 'Turkey', PL: 'Poland', TW: 'Taiwan', SE: 'Sweden',
  IR: 'Iran', UA: 'Ukraine', RO: 'Romania', IT: 'Italy', TH: 'Thailand',
  ID: 'Indonesia', MX: 'Mexico', AR: 'Argentina', NG: 'Nigeria', PK: 'Pakistan',
  BD: 'Bangladesh', PH: 'Philippines', EG: 'Egypt', ZA: 'South Africa',
};

const AUTH_LOG_PATHS = [
  '/host-logs/auth.log',
  '/host-logs/auth.log.1',
  '/var/log/auth.log',
];

interface CacheEntry { ts: number; data: object }
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
    // Read auth logs from bind-mounted /host-logs
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

    // Resolve top 40 IPs with fast-geoip (pure JS, no binary needed)
    const geoip = await import('fast-geoip');
    const topIPs = [...ipCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([ip]) => ip);

    const geo = new Map<string, Country>();
    await Promise.all(topIPs.map(async (ip) => {
      try {
        const result = await geoip.lookup(ip);
        if (!result?.country) return;
        const code = result.country;
        const name = COUNTRY_NAMES[code] || code;
        const count = ipCounts.get(ip) ?? 0;
        const current = geo.get(code) ?? { code, name, count: 0 };
        current.count += count;
        geo.set(code, current);
      } catch { /* skip */ }
    }));

    const countries = [...geo.values()].sort((a, b) => b.count - a.count);
    const result = buildResponse(countries);
    cache = { ts: Date.now(), data: result };
    return NextResponse.json(result);
  } catch (e) {
    console.error('geo route error:', e);
    return NextResponse.json(buildResponse([]));
  }
}
