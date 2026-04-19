// @ts-nocheck
import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { readFile } from 'node:fs/promises';
import { requireSessionAuth } from '../_session-auth';

const NODES = [
  { id: 'bazza',        label: 'Bazza',       emoji: '💻', ip: '100.125.171.52', location: 'Perth',     role: 'OpenClaw Host' },
  { id: 'prod',         label: 'Prod',         emoji: '🚀', ip: '100.95.166.47',  location: 'Sydney',    role: 'App Server' },
  { id: 'crm8',         label: 'CRM8',         emoji: '🏢', ip: '100.112.179.70', location: 'Melbourne', role: 'CRM Server' },
  { id: 'shazza',       label: 'Shazza',       emoji: '🖥️', ip: '100.113.217.81', location: 'Perth',     role: 'AI / GPU' },
  { id: 'backup-melb',  label: 'Backup Melb',  emoji: '💾', ip: '100.110.100.97', location: 'Melbourne', role: 'Backup' },
];

const LINK_DEFS = [
  { from: 'bazza',       to: 'prod',         label: 'agent-status push',   direction: 'bazza→prod'  },
  { from: 'backup-melb', to: 'prod',         label: 'prod DB backup',      direction: 'melb←prod'   },
  { from: 'backup-melb', to: 'crm8',         label: 'crm8 DB backup',      direction: 'melb←crm8'  },
  { from: 'backup-melb', to: 'bazza',        label: 'bazza workspace bkp', direction: 'melb←bazza' },
  { from: 'bazza',       to: 'shazza',       label: 'llama inference',     direction: 'bazza→shazza'},
  { from: 'prod',        to: 'crm8',         label: 'tailnet peering',     direction: 'peer'        },
];

const history: Record<string, number[]> = {};
interface Cache { ts: number; data: object }
let cache: Cache | null = null;

function ping(ip: string): number | null {
  try {
    const out = execSync(`ping -c 3 -W 1 -q ${ip} 2>/dev/null`, { timeout: 5000 }).toString();
    const m = out.match(/= [\d.]+\/([\d.]+)\//);
    return m ? parseFloat(m[1]) : null;
  } catch { return null; }
}

async function loadIperf(): Promise<Record<string, { mbpsSend: number; mbpsRecv: number; rttMs: number; retransmits: number; measuredAt: string } | null>> {
  const out: Record<string, any> = {};
  try {
    const raw = await readFile('/var/www/mission-control/iperf-results.json', 'utf-8');
    const data = JSON.parse(raw);
    for (const r of data.results || []) {
      if (r.status === 'ok') {
        out[r.id] = { mbpsSend: r.mbpsSend, mbpsRecv: r.mbpsRecv, rttMs: r.rttMs, retransmits: r.retransmits, measuredAt: data.measuredAt };
      }
    }
  } catch {}
  return out;
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  if (cache && Date.now() - (cache as any).ts < 10_000) {
    return NextResponse.json((cache as any).data);
  }

  const [pings, iperf] = await Promise.all([
    Promise.all(NODES.map(async n => ({ id: n.id, ms: ping(n.ip) }))),
    loadIperf(),
  ]);

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
    const status = ms === null ? 'offline' : ms > 150 ? 'degraded' : 'online';
    const ip = iperf[n.id];
    return { ...n, latencyMs: ms, status, history: [...(history[n.id] || [])],
      iperf: ip ? { mbpsSend: ip.mbpsSend, mbpsRecv: ip.mbpsRecv, rttMs: ip.rttMs, retransmits: ip.retransmits, measuredAt: ip.measuredAt } : null };
  });

  const links = LINK_DEFS.map(l => {
    const fromMs = pingMap[l.from];
    const toMs = pingMap[l.to];
    const avg = fromMs !== null && toMs !== null ? Math.round((fromMs + toMs) / 2) : null;
    const iperfData = iperf[l.to] || iperf[l.from] || null;
    return { ...l, latencyMs: avg, active: fromMs !== null && toMs !== null, packetLoss: (fromMs !== null && toMs !== null) ? 0 : 100,
      iperf: iperfData ? { mbpsSend: iperfData.mbpsSend, mbpsRecv: iperfData.mbpsRecv, rttMs: iperfData.rttMs, retransmits: iperfData.retransmits } : null };
  });

  // Load iperf history
  let iperfHistory: any[] = [];
  try {
    const files = execSync('ls -t /var/log/iperf-history/iperf-*.json 2>/dev/null | head -8').toString().trim().split('\n').filter(Boolean);
    for (const f of files) {
      try {
        const d = JSON.parse(await readFile(f, 'utf-8') as string);
        iperfHistory.push({ ts: d.measuredAt, summary: d.summary, results: d.results });
      } catch {}
    }
  } catch {}

  const data = { nodes, links, measuredAt: new Date().toISOString(), iperfHistory };
  cache = { ts: Date.now(), data };
  return NextResponse.json(data);
}
