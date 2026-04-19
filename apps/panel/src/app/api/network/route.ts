// @ts-nocheck
/**
 * /api/network/route.ts
 * Pings all Tailscale nodes from prod, returns topology + latency data.
 * Results cached 10s to avoid hammering on every render.
 */
import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { requireSessionAuth } from '../_session-auth';

const NODES = [
  { id: 'bazza',       label: 'Bazza',       emoji: '💻', ip: '100.125.171.52', location: 'Perth',     role: 'OpenClaw Host' },
  { id: 'prod',        label: 'Prod',         emoji: '🚀', ip: '100.95.166.47',  location: 'Sydney',    role: 'App Server' },
  { id: 'crm8',        label: 'CRM8',         emoji: '🏢', ip: '100.112.179.70', location: 'Melbourne', role: 'CRM Server' },
  { id: 'shazza',      label: 'Shazza',       emoji: '🖥️', ip: '100.113.217.81', location: 'Perth',     role: 'AI / GPU' },
  { id: 'backup-melb', label: 'Backup Melb',  emoji: '💾', ip: '100.110.100.97', location: 'Melbourne', role: 'Backup' },
];

// Known logical connections (direction = data flow)
const LINK_DEFS = [
  { from: 'bazza',       to: 'prod',        label: 'agent-status push',  direction: 'bazza→prod'  },
  { from: 'backup-melb', to: 'prod',        label: 'prod DB backup',     direction: 'melb←prod'   },
  { from: 'backup-melb', to: 'crm8',        label: 'crm8 DB backup',     direction: 'melb←crm8'  },
  { from: 'backup-melb', to: 'bazza',       label: 'bazza workspace bkp',direction: 'melb←bazza' },
  { from: 'bazza',       to: 'shazza',      label: 'llama inference',    direction: 'bazza→shazza'},
  { from: 'prod',        to: 'crm8',        label: 'tailnet peering',    direction: 'peer'        },
];

interface NodeResult {
  id: string; label: string; emoji: string; ip: string;
  location: string; role: string;
  latencyMs: number | null; status: 'online' | 'degraded' | 'offline';
  history: number[];
}

interface LinkResult {
  from: string; to: string; label: string; direction: string;
  latencyMs: number | null; active: boolean; packetLoss: number;
}

interface Cache { ts: number; data: { nodes: NodeResult[]; links: LinkResult[]; measuredAt: string } }
let cache: Cache | null = null;
const CACHE_TTL = 10_000;

function ping(ip: string): number | null {
  try {
    const out = execSync(`ping -c 3 -W 1 -q ${ip} 2>/dev/null`, { timeout: 5000 }).toString();
    // "rtt min/avg/max/mdev = 1.234/2.345/3.456/0.123 ms"
    const m = out.match(/= [\d.]+\/([\d.]+)\//);
    if (m) return parseFloat(m[1]);
    return null;
  } catch { return null; }
}

// In-memory latency history per node (last 20 pings)
const history: Record<string, number[]> = {};

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  // Ping all nodes in parallel
  const pings = await Promise.all(
    NODES.map(async node => {
      const ms = await new Promise<number | null>(resolve => {
        try { resolve(ping(node.ip)); } catch { resolve(null); }
      });
      return { id: node.id, ms };
    })
  );

  const pingMap: Record<string, number | null> = {};
  for (const p of pings) {
    pingMap[p.id] = p.ms;
    if (p.ms !== null) {
      if (!history[p.id]) history[p.id] = [];
      history[p.id].push(p.ms);
      if (history[p.id].length > 20) history[p.id].shift();
    }
  }

  const nodes: NodeResult[] = NODES.map(n => {
    const ms = pingMap[n.id];
    const status = ms === null ? 'offline' : ms > 150 ? 'degraded' : 'online';
    return { ...n, latencyMs: ms, status, history: [...(history[n.id] || [])] };
  });

  const links: LinkResult[] = LINK_DEFS.map(l => {
    const fromMs = pingMap[l.from];
    const toMs = pingMap[l.to];
    const avg = fromMs !== null && toMs !== null ? Math.round((fromMs + toMs) / 2) : null;
    const active = fromMs !== null && toMs !== null;
    return { ...l, latencyMs: avg, active, packetLoss: active ? 0 : 100 };
  });

  const data = { nodes, links, measuredAt: new Date().toISOString() };
  cache = { ts: Date.now(), data };
  return NextResponse.json(data);
}
