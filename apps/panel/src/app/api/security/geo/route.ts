import { NextResponse } from 'next/server';
import { readFirstExisting, runRemote, safeExec } from '../_security-logs';

type Country = { code: string; name: string; count: number; active?: boolean };

const COUNTRY_NAMES: Record<string, string> = {
  CN: 'China',
  US: 'United States',
  RU: 'Russia',
  BR: 'Brazil',
  IN: 'India',
  VN: 'Vietnam',
  HK: 'Hong Kong',
  DE: 'Germany',
  FR: 'France',
  NL: 'Netherlands',
  GB: 'United Kingdom',
  CA: 'Canada',
  SG: 'Singapore',
  AU: 'Australia',
  JP: 'Japan',
  KR: 'South Korea',
  TR: 'Turkey',
  PL: 'Poland',
  TW: 'Taiwan',
  SE: 'Sweden',
  IR: 'Iran',
  UA: 'Ukraine',
  RO: 'Romania',
  IT: 'Italy',
};

function parseLine(line: string): string | null {
  if (!line.includes('Failed password') && !line.includes('Invalid user')) return null;
  return line.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? null;
}

function parseGeoLookup(output: string): { code: string; name: string } | null {
  const text = output.trim();
  if (!text) return null;
  const afterColon = text.split(':').slice(1).join(':').trim();
  const code = afterColon.match(/^([A-Z]{2})\b/)?.[1] ?? afterColon.match(/\b([A-Z]{2})\b/)?.[1];
  if (!code) return null;
  const name = afterColon.split(',').slice(1).join(',').trim() || COUNTRY_NAMES[code] || code;
  return { code, name };
}

export async function GET() {
  try {
    const fetchRaw = async (host: 'bazza' | 'prod') => {
      if (host === 'bazza') {
        let raw = await readFirstExisting(['/host-logs/auth.log', '/var/log/auth.log']);
        if (!raw) raw = safeExec('journalctl -u ssh -u sshd --no-pager -n 3000 2>/dev/null');
        return raw;
      }
      return runRemote('grep "Failed password\|Invalid user" /var/log/auth.log 2>/dev/null | tail -n 4000');
    };

    const [bazzaRaw, prodRaw] = await Promise.all([fetchRaw('bazza'), fetchRaw('prod')]);
    const raw = `${bazzaRaw}\n${prodRaw}`;
    const ipCounts = new Map<string, number>();
    const ipsFound = raw.split('\n').map(parseLine).filter((x): x is string => Boolean(x));
    for (const ip of ipsFound) ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);

    const topIPs = [...ipCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    const geo = new Map<string, Country>();

    for (const [ip, count] of topIPs) {
      const lookup = runRemote(`geoiplookup ${ip} 2>/dev/null | head -1`);
      const parsed = parseGeoLookup(lookup);
      if (!parsed) continue;
      const current = geo.get(parsed.code) ?? { code: parsed.code, name: parsed.name, count: 0 };
      current.count += count;
      geo.set(parsed.code, current);
    }

    const countries = [...geo.values()].sort((a, b) => b.count - a.count);
    const total = countries.reduce((sum, c) => sum + c.count, 0);
    const activeCountries = countries.filter((c) => c.count > 0).slice(0, 8).map((c) => ({ ...c, active: true }));

    return NextResponse.json({ countries, total, topCountries: countries.slice(0, 5), activeCountries });
  } catch {
    return NextResponse.json({ countries: [], total: 0, topCountries: [], activeCountries: [] });
  }
}
