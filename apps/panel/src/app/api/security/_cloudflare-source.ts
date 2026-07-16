/**
 * Cloudflare edge-security source for the Mission Control /security dashboard.
 *
 * Surfaces the "loud" edge layer (Cloudflare WAF/edge blocks) that the origin
 * collectors (fail2ban, nginx, auth) are blind to. Uses httpRequestsAdaptiveGroups
 * filtered on blocked edge statuses (403/429/503), which only needs Zone
 * Analytics:Read on the CLOUDFLARE_API_TOKEN.
 *
 * A rolling baseline is persisted so the dashboard can flag *deviations*
 * (spikes) rather than raw counts — background scanning noise is normal.
 */

import fs from 'fs/promises';

export type CloudflareOffender = { ip: string; count: number; country?: string };
export type CloudflareZoneStat = { name: string; blocked: number; error?: string };
export type CloudflareData = {
  available: boolean;
  checkedAt: string;
  blocked24h: number;
  windowHours: number;
  baseline?: number | null;
  deviation?: number | null; // ratio vs baseline (1 = normal)
  spike: boolean;
  topOffenders: CloudflareOffender[];
  byZone: CloudflareZoneStat[];
  errors: string[];
  skipped?: boolean;
};

const CF_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const BASELINE_FILE = process.env.CLOUDFLARE_BASELINE_FILE || '/tmp/mc-cloudflare-baseline.json';
const SPIKE_MULTIPLIER = Number(process.env.CLOUDFLARE_SPIKE_MULTIPLIER || '2.5');

function parseZones(): Record<string, string> {
  // CLOUDFLARE_ZONES = "name:zoneid,name:zoneid,..."
  const raw = process.env.CLOUDFLARE_ZONES || '';
  const out: Record<string, string> = {};
  for (const pair of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const idx = pair.lastIndexOf(':');
    if (idx > 0) out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}

async function loadBaseline(): Promise<number | null> {
  try {
    const raw = await fs.readFile(BASELINE_FILE, 'utf8');
    const d = JSON.parse(raw);
    return typeof d.avgBlocked === 'number' ? d.avgBlocked : null;
  } catch {
    return null;
  }
}

async function saveBaseline(latest: number, prev: number | null): Promise<void> {
  // Exponential moving average so the baseline adapts slowly.
  const alpha = 0.2;
  const avg = prev == null ? latest : Math.round(prev * (1 - alpha) + latest * alpha);
  try {
    await fs.writeFile(BASELINE_FILE, JSON.stringify({ avgBlocked: avg, lastSample: latest, updatedAt: new Date().toISOString() }));
  } catch {
    // best-effort
  }
}

async function queryZone(token: string, zoneId: string, since: string, until: string) {
  const query =
    'query{viewer{zones(filter:{zoneTag:"' + zoneId + '"})' +
    '{httpRequestsAdaptiveGroups(limit:25,' +
    'filter:{datetime_geq:"' + since + '",datetime_leq:"' + until + '",edgeResponseStatus_in:[403,429,503]},' +
    'orderBy:[count_DESC]){count dimensions{clientIP clientCountryName}}}}}';
  const res = await fetch(CF_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    // @ts-ignore next fetch supports no-store via cache
    cache: 'no-store',
  });
  const json = await res.json();
  if (json.errors) throw new Error(String(json.errors[0]?.message || 'graphql error').slice(0, 80));
  return json.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
}

export async function readCloudflare(): Promise<CloudflareData> {
  const now = new Date();
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zones = parseZones();
  const base: CloudflareData = {
    available: false,
    checkedAt: now.toISOString(),
    blocked24h: 0,
    windowHours: 23,
    baseline: null,
    deviation: null,
    spike: false,
    topOffenders: [],
    byZone: [],
    errors: [],
  };

  if (!token || Object.keys(zones).length === 0) {
    return { ...base, skipped: true };
  }

  const since = new Date(now.getTime() - 23 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const until = now.toISOString().replace(/\.\d+Z$/, 'Z');

  let total = 0;
  const offenders: Record<string, CloudflareOffender> = {};
  const byZone: CloudflareZoneStat[] = [];
  const errors: string[] = [];

  for (const [name, zoneId] of Object.entries(zones)) {
    try {
      const groups = await queryZone(token, zoneId, since, until);
      let zoneBlocked = 0;
      for (const g of groups) {
        const c = g.count as number;
        zoneBlocked += c;
        total += c;
        const ip = g.dimensions?.clientIP || '?';
        const country = g.dimensions?.clientCountryName;
        if (!offenders[ip]) offenders[ip] = { ip, count: 0, country };
        offenders[ip].count += c;
      }
      byZone.push({ name, blocked: zoneBlocked });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      errors.push(`${name}: ${msg}`);
      byZone.push({ name, blocked: 0, error: msg });
    }
  }

  const baseline = await loadBaseline();
  const deviation = baseline && baseline > 0 ? Number((total / baseline).toFixed(2)) : null;
  const spike = deviation != null && deviation >= SPIKE_MULTIPLIER;
  // update baseline only when the query broadly succeeded (avoid poisoning on errors)
  if (errors.length < Object.keys(zones).length) await saveBaseline(total, baseline);

  const topOffenders = Object.values(offenders).sort((a, b) => b.count - a.count).slice(0, 8);

  return {
    available: errors.length < Object.keys(zones).length,
    checkedAt: now.toISOString(),
    blocked24h: total,
    windowHours: 23,
    baseline,
    deviation,
    spike,
    topOffenders,
    byZone: byZone.sort((a, b) => b.blocked - a.blocked),
    errors,
  };
}
