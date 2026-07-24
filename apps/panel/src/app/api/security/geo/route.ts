import { isIP } from 'node:net';
import { NextResponse } from 'next/server';
import { requireSessionAuth } from '../../_session-auth';
import { runRemote, safeExec } from '../_security-logs';

type Country = { code: string; name: string; count: number; active?: boolean };

const COUNTRY_NAMES: Record<string, string> = {
  CN: 'China', US: 'United States', RU: 'Russia', BR: 'Brazil', IN: 'India', VN: 'Vietnam',
  HK: 'Hong Kong', DE: 'Germany', FR: 'France', NL: 'Netherlands', GB: 'United Kingdom',
  CA: 'Canada', SG: 'Singapore', AU: 'Australia', JP: 'Japan', KR: 'South Korea',
  TR: 'Turkey', PL: 'Poland', TW: 'Taiwan', SE: 'Sweden', IR: 'Iran', UA: 'Ukraine',
  RO: 'Romania', IT: 'Italy',
};

function parseGeoLookup(output: string): { code: string; name: string } | null {
  const match = output.trim().match(/^GeoIP Country (?:V6 )?Edition:\s*([A-Z]{2}),\s*(.+)$/);
  if (!match || match[1] === '--') return null;
  return { code: match[1], name: match[2].trim() || COUNTRY_NAMES[match[1]] || match[1] };
}

function addCounts(raw: string, ipCounts: Map<string, number>) {
  for (const line of raw.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\S+)$/);
    if (!match || !isIP(match[2])) continue;
    ipCounts.set(match[2], (ipCounts.get(match[2]) ?? 0) + Number.parseInt(match[1], 10));
  }
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    // Extract only the address following "from", then validate it in Node.
    // This accepts both families without mistaking timestamps for IPv6.
    const extract = "sed -nE 's/.* from ([0-9A-Fa-f:.]+)( port [0-9]+)?.*/\\1/p'";
    const remoteScript = [
      'grep -E "Failed password|Invalid user" /var/log/auth.log 2>/dev/null',
      extract,
      'sort | uniq -c | sort -rn | head -30',
    ].join(' | ');

    const ipCounts = new Map<string, number>();
    addCounts(runRemote(remoteScript).trim(), ipCounts);

    const bazzaScript = [
      "grep -E 'Failed password|Invalid user' /host-logs/auth.log 2>/dev/null",
      extract,
      'sort | uniq -c | sort -rn | head -20',
    ].join(' | ');
    addCounts(safeExec(bazzaScript), ipCounts);

    if (ipCounts.size === 0) {
      return NextResponse.json({ countries: [], total: 0, unknownCount: 0, topCountries: [], activeCountries: [] });
    }

    // isIP validation above makes this fixed-character list safe to pass to the shell.
    const ipList = [...ipCounts.keys()].join(' ');
    const geoScript = `for ip in ${ipList}; do case "$ip" in *:*) lookup=geoiplookup6;; *) lookup=geoiplookup;; esac; echo "$ip $($lookup "$ip" 2>/dev/null | head -1)"; done`;
    const geoRaw = runRemote(geoScript).trim();

    const geo = new Map<string, Country>();
    let unknownCount = 0;
    const processed = new Set<string>();
    for (const line of geoRaw.split('\n')) {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      const ip = line.slice(0, spaceIdx);
      const count = ipCounts.get(ip) ?? 0;
      if (!count || processed.has(ip)) continue;
      processed.add(ip);
      const parsed = parseGeoLookup(line.slice(spaceIdx + 1));
      if (!parsed) {
        unknownCount += count;
        continue;
      }
      const current = geo.get(parsed.code) ?? {
        code: parsed.code, name: COUNTRY_NAMES[parsed.code] || parsed.name, count: 0,
      };
      current.count += count;
      geo.set(parsed.code, current);
    }
    for (const [ip, count] of ipCounts) {
      if (!processed.has(ip)) unknownCount += count;
    }

    const countries = [...geo.values()].sort((a, b) => b.count - a.count);
    const locatedTotal = countries.reduce((sum, country) => sum + country.count, 0);
    const activeCountries = countries.slice(0, 8).map((country) => ({ ...country, active: true }));
    return NextResponse.json({
      countries,
      total: locatedTotal + unknownCount,
      unknownCount,
      topCountries: countries.slice(0, 5),
      activeCountries,
    });
  } catch {
    return NextResponse.json({ countries: [], total: 0, unknownCount: 0, topCountries: [], activeCountries: [] });
  }
}
