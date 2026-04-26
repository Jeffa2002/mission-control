// @ts-nocheck
import { NextResponse } from 'next/server';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};
import { execSync } from 'child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { requireSessionAuth } from '../_session-auth';

const CACHE_FILE = process.env.NETWORK_CACHE_FILE ?? '/tmp/mission-network-cache.json';
const IPERF_FILES = [
  process.env.IPERF_RESULTS_FILE,
  '/workspace/mission-control/iperf-results.json',
  '/workspace-data/mission-control/iperf-results.json',
  '/agent-data/iperf-results.json',
].filter(Boolean) as string[];

const NODES = [
  { id: 'bazza',       label: 'Bazza',      emoji: '💻', ip: '100.125.171.52', location: 'Perth',     role: 'OpenClaw Host' },
  { id: 'sec1',        label: 'Sec1',       emoji: '🛡️', ip: '100.122.8.93',   location: 'Perth',     role: 'Security Host' },
  { id: 'prod',        label: 'Prod',        emoji: '🚀', ip: '100.95.166.47',  location: 'Perth',     role: 'App Server' },
  { id: 'crm8',        label: 'CRM8',        emoji: '🏢', ip: '100.112.179.70', location: 'Perth',     role: 'CRM Server' },
  { id: 'shazza',      label: 'Shazza',      emoji: '🖥️', ip: '100.113.217.81', location: 'Perth',     role: 'AI / GPU' },
  { id: 'backup-melb', label: 'Backup Melb', emoji: '💾', ip: '100.110.100.97', location: 'Melbourne', role: 'Backup' },
];

const LINK_DEFS = [
  { from: 'bazza',       to: 'prod',        label: 'agent-status push',   direction: 'bazza→prod'   },
  { from: 'bazza',       to: 'sec1',        label: 'security host',       direction: 'bazza→sec1'   },
  { from: 'backup-melb', to: 'prod',        label: 'prod DB backup',      direction: 'melb←prod'    },
  { from: 'backup-melb', to: 'crm8',        label: 'crm8 DB backup',      direction: 'melb←crm8'   },
  { from: 'backup-melb', to: 'bazza',       label: 'bazza workspace bkp', direction: 'melb←bazza'  },
  { from: 'bazza',       to: 'shazza',      label: 'llama inference',     direction: 'bazza→shazza' },
  { from: 'prod',        to: 'crm8',        label: 'tailnet peering',     direction: 'peer'         },
];

const history: Record<string, number[]> = {};
let inFlight = false;
let lastRefresh = 0;
const REFRESH_INTERVAL_MS = 60_000; // only ping once per minute

function ping(ip: string): number | null {
  try {
    const out = execSync(`ping -c 3 -W 1 -q ${ip} 2>/dev/null`, { timeout: 5000 }).toString();
    const m = out.match(/= [\d.]+\/([\d.]+)\//);
    return m ? parseFloat(m[1]) : null;
  } catch { return null; }
}

async function loadIperf() {
  const out: Record<string, any> = {};
  for (const file of IPERF_FILES) {
    try {
      const raw = await readFile(file, 'utf-8');
      const data = JSON.parse(raw);
      for (const r of data.results || []) {
        if (r.status === 'ok') out[r.id] = { ...r, measuredAt: data.measuredAt };
      }
      return out;
    } catch {}
  }
  return out;
}

function cacheMatchesNodes(cached: any) {
  const cachedIds = new Set(Array.isArray(cached?.nodes) ? cached.nodes.map((n: any) => n?.id).filter(Boolean) : []);
  return NODES.every(n => cachedIds.has(n.id)) && cachedIds.size === NODES.length;
}

async function buildData(iperf: Record<string, any>) {
  const pings = await Promise.all(NODES.map(async n => ({ id: n.id, ms: ping(n.ip) })));
  const pingMap: Record<string, number | null> = {};
  for (const p of pings) {
    pingMap[p.id] = p.ms;
    if (p.ms !== null) {
      if (!history[p.id]) history[p.id] = [];
      history[p.id].push(p.ms);
      if (history[p.id].length > 20) history[p.id].shift();
    }
  }

  const nodes = NODES.map(n => {
    const ms = pingMap[n.id];
    return {
      ...n,
      latencyMs: ms,
      status: ms === null ? 'offline' : ms > 150 ? 'degraded' : 'online',
      history: [...(history[n.id] || [])],
      iperf: iperf[n.id] ? {
        mbpsSend: iperf[n.id].mbpsSend, mbpsRecv: iperf[n.id].mbpsRecv,
        rttMs: iperf[n.id].rttMs, retransmits: iperf[n.id].retransmits,
        measuredAt: iperf[n.id].measuredAt,
      } : null,
    };
  });

  const links = LINK_DEFS.map(l => {
    const fromMs = pingMap[l.from];
    const toMs = pingMap[l.to];
    const iperfData = iperf[l.to] || iperf[l.from] || null;
    return {
      ...l,
      latencyMs: fromMs !== null && toMs !== null ? Math.round((fromMs + toMs) / 2) : null,
      active: fromMs !== null && toMs !== null,
      packetLoss: (fromMs !== null && toMs !== null) ? 0 : 100,
      iperf: iperfData ? {
        mbpsSend: iperfData.mbpsSend, mbpsRecv: iperfData.mbpsRecv,
        rttMs: iperfData.rttMs, retransmits: iperfData.retransmits,
      } : null,
    };
  });

  return { nodes, links, measuredAt: new Date().toISOString(), stale: false };
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  // Try to serve cached data immediately
  let cached: any = null;
  try {
    const raw = await readFile(CACHE_FILE, 'utf-8');
    cached = JSON.parse(raw);
    if (!cacheMatchesNodes(cached)) cached = null;
  } catch {}

  // Kick off background refresh at most once per minute
  const now = Date.now();
  if (!inFlight && (now - lastRefresh) > REFRESH_INTERVAL_MS) {
    inFlight = true;
    lastRefresh = now;
    loadIperf().then(iperf => buildData(iperf)).then(async data => {
      try { await writeFile(CACHE_FILE, JSON.stringify(data)); } catch {}
      inFlight = false;
    }).catch(() => { inFlight = false; });
  }

  // If we have cached data, return it immediately (marked stale if >30s old)
  if (cached) {
    const ageMs = Date.now() - new Date(cached.measuredAt).getTime();
    cached.stale = ageMs > 30_000;
    return NextResponse.json(cached, { headers: NO_STORE_HEADERS });
  }

  // First ever load — wait for fresh data
  const iperf = await loadIperf();
  const data = await buildData(iperf);
  try { await writeFile(CACHE_FILE, JSON.stringify(data)); } catch {}
  return NextResponse.json(data, { headers: NO_STORE_HEADERS });
}
