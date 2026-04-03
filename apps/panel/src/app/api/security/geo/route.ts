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
    // Single SSH call: extract top IPs + resolve geo in one shot on prod
    const { execSync } = await import('child_process');
    const remoteScript = [
      'grep -E "Failed password|Invalid user" /var/log/auth.log 2>/dev/null',
      'grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}"',
      'sort | uniq -c | sort -rn | head -30',
    ].join(' | ');
    const ipRaw = execSync(
      `ssh -i /root/.ssh/prod_deploy_v3 -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=8 root@203.57.50.240 '${remoteScript}'`,
      { timeout: 15000, encoding: 'utf8' }
    ).trim();

    const ipCounts = new Map<string, number>();
    for (const line of ipRaw.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\S+)$/);
      if (m) ipCounts.set(m[2], parseInt(m[1], 10));
    }

    if (ipCounts.size === 0) {
      return NextResponse.json({ countries: [], total: 0, topCountries: [], activeCountries: [] });
    }

    // Also grab bazza local auth log
    const bazzaRaw = safeExec('grep -E "Failed password|Invalid user" /host-logs/auth.log 2>/dev/null | grep -oE "([0-9]{1,3}\.){3}[0-9]{1,3}" | sort | uniq -c | sort -rn | head -20');
    for (const line of bazzaRaw.split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\S+)$/);
      if (m) ipCounts.set(m[2], (ipCounts.get(m[2]) ?? 0) + parseInt(m[1], 10));
    }

    // Resolve all IPs geo in one SSH call
    const ipList = [...ipCounts.keys()].join(' ');
    const geoScript = `for ip in ${ipList}; do echo "$ip $(geoiplookup $ip 2>/dev/null | head -1)"; done`;
    const geoRaw = execSync(
      `ssh -i /root/.ssh/prod_deploy_v3 -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@203.57.50.240 '${geoScript}'`,
      { timeout: 20000, encoding: 'utf8' }
    ).trim();

    const geo = new Map<string, Country>();
    for (const line of geoRaw.split('\n')) {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      const ip = line.slice(0, spaceIdx);
      const rest = line.slice(spaceIdx + 1);
      const count = ipCounts.get(ip) ?? 0;
      const parsed = parseGeoLookup(rest);
      if (!parsed) continue;
      const current = geo.get(parsed.code) ?? { code: parsed.code, name: COUNTRY_NAMES[parsed.code] || parsed.name, count: 0 };
      current.count += count;
      geo.set(parsed.code, current);
    }

    const countries = [...geo.values()].sort((a, b) => b.count - a.count);
    const total = countries.reduce((sum, c) => sum + c.count, 0);
    const activeCountries = countries.slice(0, 8).map((c) => ({ ...c, active: true }));

    return NextResponse.json({ countries, total, topCountries: countries.slice(0, 5), activeCountries });
  } catch {
    return NextResponse.json({ countries: [], total: 0, topCountries: [], activeCountries: [] });
  }
}
