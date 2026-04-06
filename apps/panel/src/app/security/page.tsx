'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '../../components/PageShell';
import { AttackMap } from '../../components/AttackMap';

// ─── Types ────────────────────────────────────────────────────────────────────

type E8Status = 'compliant' | 'partial' | 'at-risk' | 'manual';

interface E8Strategy {
  id: string;
  name: string;
  description: string;
  status: E8Status;
  detail: string;
}

type NistScore = 0 | 1 | 2 | 3 | 4 | 5;
interface NistFunction {
  id: string;
  name: string;
  description: string;
  score: NistScore;
  detail: string;
}

interface SshEntry { ts: string; ip: string; user: string }
interface Bucket { label: string; count: number }
interface SshData {
  total: number;
  recent: SshEntry[];
  topIPs: { ip: string; count: number }[];
  buckets: Bucket[];
}

interface NginxEntry { ts: string; ip: string; method: string; path: string; status: number; bytes: number }
interface NginxData {
  recent: NginxEntry[];
  errorCount: number;
  topPaths: { path: string; count: number }[];
  topIPs: { ip: string; count: number }[];
}

interface FirewallEntry { ts: string; src: string; dst: string; dpt: string; proto: string }
interface FirewallData {
  recent: FirewallEntry[];
  blockCount: number;
  topSources: { ip: string; count: number }[];
}

interface AuthEntry { ts: string; type: string; user: string; detail: string }
interface AuthData {
  recent: AuthEntry[];
  sudoCount: number;
  failCount: number;
  sshAcceptCount: number;
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(s: E8Status): string {
  switch (s) {
    case 'compliant': return '#00ff88';
    case 'partial':   return '#ffcc00';
    case 'at-risk':   return '#ff4466';
    case 'manual':    return '#888888';
  }
}

function statusLabel(s: E8Status): string {
  switch (s) {
    case 'compliant': return 'Compliant';
    case 'partial':   return 'Partially Implemented';
    case 'at-risk':   return 'At Risk';
    case 'manual':    return 'Needs Review';
  }
}

function nistColor(score: NistScore): string {
  if (score >= 4) return '#00ff88';
  if (score >= 3) return '#66ddff';
  if (score >= 2) return '#ffcc00';
  if (score >= 1) return '#ff8844';
  return '#ff4466';
}

function statusCodeColor(code: number): string {
  if (code < 300) return '#00ff88';
  if (code < 400) return '#ffcc00';
  if (code < 500) return '#ff8844';
  return '#ff4466';
}

// ─── SVG Sparkline ────────────────────────────────────────────────────────────

function Sparkline({ buckets }: { buckets: Bucket[] }) {
  if (!buckets.length) return <svg width={300} height={50} />;

  const W = 300;
  const H = 50;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const pts = buckets.map((b, i) => {
    const x = (i / (buckets.length - 1)) * W;
    const y = H - (b.count / max) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00c8ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00c8ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polygon
        points={[
          `0,${H}`,
          ...pts,
          `${W},${H}`,
        ].join(' ')}
        fill="url(#spark-fill)"
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="#00c8ff"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(124,232,255,0.16)',
  background: 'rgba(0,0,0,0.22)',
};

const sectionHeader: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 2,
  color: '#9fefff',
  opacity: 0.9,
  marginBottom: 10,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
};

const tdStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid rgba(124,232,255,0.07)',
  fontFamily: 'monospace',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 180,
};

const thStyle: React.CSSProperties = {
  ...tdStyle,
  color: '#9fefff',
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: 1,
  borderBottom: '1px solid rgba(124,232,255,0.2)',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function E8Card({ s }: { s: E8Strategy }) {
  const col = statusColor(s.status);
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{s.name}</div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1,
            color: col,
            border: `1px solid ${col}44`,
            background: `${col}1a`,
            borderRadius: 999,
            padding: '2px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel(s.status)}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#9fefff', opacity: 0.7 }}>{s.description}</div>
      {s.detail && <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>{s.detail}</div>}
    </div>
  );
}

function NistCard({ f }: { f: NistFunction }) {
  const col = nistColor(f.score);
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{f.name}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: col }}>{f.score}/5</div>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(124,232,255,0.1)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(f.score / 5) * 100}%`, background: col, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
      <div style={{ fontSize: 11, color: '#9fefff', opacity: 0.7 }}>{f.description}</div>
      {f.detail && <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>{f.detail}</div>}
    </div>
  );
}

// ─── NIST heuristics (derived from E8 + a few environment assumptions) ───────

function deriveNist(e8: E8Strategy[]): NistFunction[] {
  const get = (id: string) => e8.find((s) => s.id === id);
  const isGood = (id: string) => {
    const s = get(id)?.status;
    return s === 'compliant';
  };
  const isPartial = (id: string) => get(id)?.status === 'partial';

  // Govern: rough proxy from admin restriction signal.
  const governScore = isGood('restrict-admin') ? 3 : isPartial('restrict-admin') ? 2 : 2;

  // Identify: patch visibility is a weak proxy for inventory/vuln awareness.
  const identifyScore = isGood('patch-os') ? 3 : isPartial('patch-os') ? 2 : 1;

  // Protect: patch + admin hardening signals baseline hardening.
  let protectScore = 2;
  if (isGood('patch-os')) protectScore++;
  if (isGood('restrict-admin')) protectScore++;

  // Detect: live feeds are active — SSH, UFW, nginx, auth.log = score 3
  const detectScore: NistScore = 3;
  const respondScore: NistScore = 2;
  const recoverScore: NistScore = 2;

  return [
    {
      id: 'govern',
      name: 'Govern',
      description: 'Policy, roles, oversight, and risk management.',
      score: Math.min(5, governScore) as NistScore,
      detail: 'Heuristic: informed by how tightly admin privileges are controlled (named admin accounts, minimal sudo, documented access paths).',
    },
    {
      id: 'identify',
      name: 'Identify',
      description: 'Inventory assets, understand exposure, and track vulnerabilities.',
      score: Math.min(5, identifyScore) as NistScore,
      detail: 'Heuristic: informed by OS patch posture. Next step: maintain an inventory of hosts/services/ports (including Tailscale nodes) and review it regularly.',
    },
    {
      id: 'protect',
      name: 'Protect',
      description: 'Hardening, identity/access control, and secure configuration.',
      score: Math.min(5, protectScore) as NistScore,
      detail: 'Heuristic: based on patching + SSH hardening. Next step: ensure admin endpoints are only reachable via Tailscale/VPN and review nginx TLS + headers.',
    },
    {
      id: 'detect',
      name: 'Detect',
      description: 'Log collection, monitoring, and alerting to spot suspicious activity.',
      score: detectScore,
      detail: 'Manual/heuristic: confirm nginx/sshd/UFW logs are being retained, reviewed, and alerting is configured for spikes, new countries, and repeated failures.',
    },
    {
      id: 'respond',
      name: 'Respond',
      description: 'Triage, contain, eradicate, and communicate during incidents.',
      score: respondScore,
      detail: 'Manual: create a short runbook (SSH brute-force, web probing, credential leak). Include who to contact, how to isolate via UFW/Tailscale, and what logs to collect.',
    },
    {
      id: 'recover',
      name: 'Recover',
      description: 'Backups, restore testing, and recovery planning.',
      score: recoverScore,
      detail: 'Manual: verify backups cover app data + config, are stored off-host/off-site, and that a restore test has been completed recently (not just scheduled).',
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [e8, setE8] = useState<E8Strategy[]>([]);
  const [ssh, setSsh] = useState<SshData>({ total: 0, recent: [], topIPs: [], buckets: [] });
  const [nginx, setNginx] = useState<NginxData>({ recent: [], errorCount: 0, topPaths: [], topIPs: [] });
  const [firewall, setFirewall] = useState<FirewallData>({ recent: [], blockCount: 0, topSources: [] });
  const [authLog, setAuthLog] = useState<AuthData>({ recent: [], sudoCount: 0, failCount: 0, sshAcceptCount: 0, total: 0 });
  const [e8Loading, setE8Loading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function fetchE8() {
    try {
      const r = await fetch('/api/security/e8', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setE8(j.strategies ?? []);
        setLastUpdated(new Date());
      }
    } catch { /* silent */ }
    setE8Loading(false);
  }

  async function fetchSsh() {
    try {
      const r = await fetch('/api/security/ssh-attacks', { cache: 'no-store' });
      if (r.ok) { setSsh(await r.json()); setLastUpdated(new Date()); }
    } catch { /* silent */ }
  }

  async function fetchNginx() {
    try {
      const r = await fetch('/api/security/nginx-logs', { cache: 'no-store' });
      if (r.ok) { setNginx(await r.json()); setLastUpdated(new Date()); }
    } catch { /* silent */ }
  }

  async function fetchFirewall() {
    try {
      const r = await fetch('/api/security/firewall', { cache: 'no-store' });
      if (r.ok) { setFirewall(await r.json()); setLastUpdated(new Date()); }
    } catch { /* silent */ }
  }

  async function fetchAuthLog() {
    try {
      const r = await fetch('/api/security/auth-log', { cache: 'no-store' });
      if (r.ok) { setAuthLog(await r.json()); setLastUpdated(new Date()); }
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchE8();
    fetchSsh();
    fetchNginx();
    fetchFirewall();
    fetchAuthLog();

    const t1 = setInterval(fetchSsh, 10_000);
    const t2 = setInterval(fetchNginx, 15_000);
    const t3 = setInterval(fetchFirewall, 15_000);
    const t4 = setInterval(fetchAuthLog, 15_000);
    const t5 = setInterval(() => setNow(Date.now()), 1_000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(t4); clearInterval(t5); };
  }, []);

  const nist = deriveNist(e8);
  const lastUpdatedText = lastUpdated ? `Last updated: ${Math.max(0, Math.floor((now - lastUpdated.getTime()) / 1000))} seconds ago` : 'Last updated: —';

  return (
    <PageShell title="Cyber Security">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8, color: '#9fefff', opacity: 0.6, fontSize: 12 }}>
        {lastUpdatedText}
      </div>

      <AttackMap />

      {/* ── E8 + NIST ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>

        {/* E8 */}
        <section>
          <div style={sectionHeader}>ESSENTIAL EIGHT (ASD/ACSC) — MATURITY SNAPSHOT</div>
          {e8Loading ? (
            <div style={{ color: '#9fefff', opacity: 0.5, fontSize: 13 }}>Loading Essential Eight checks…</div>
          ) : e8.length === 0 ? (
            <div style={{ color: '#9fefff', opacity: 0.55, fontSize: 12 }}>
              No Essential Eight data available yet. If this is unexpected, check the server-side API route and permissions.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {e8.map((s) => <E8Card key={s.id} s={s} />)}
            </div>
          )}
        </section>

        {/* NIST CSF */}
        <section>
          <div style={sectionHeader}>NIST CSF v2.0 — EXECUTIVE VIEW (HEURISTIC)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nist.map((f) => <NistCard key={f.id} f={f} />)}
          </div>
        </section>

      </div>

      {/* ── SSH Brute Force ── */}
      <section style={{ marginTop: 28 }}>
        <div style={sectionHeader}>SSH AUTH ATTEMPTS (LIVE)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Left: stats + sparkline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={card}>
              <div style={{ fontSize: 32, fontWeight: 800, color: ssh.total > 50 ? '#ff4466' : ssh.total > 10 ? '#ffcc00' : '#00ff88' }}>
                {ssh.total}
              </div>
              <div style={{ fontSize: 12, color: '#9fefff', opacity: 0.7 }}>attempt(s) in the last hour</div>
              <div style={{ marginTop: 14 }}>
                <Sparkline buckets={ssh.buckets} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#666', marginTop: 2 }}>
                  {ssh.buckets.length > 0 && (
                    <>
                      <span>{ssh.buckets[0]?.label}</span>
                      <span>{ssh.buckets[ssh.buckets.length - 1]?.label}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={{ ...sectionHeader, marginBottom: 8 }}>TOP SOURCE IPs</div>
              {ssh.topIPs.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>No data yet.</div>
              ) : (
                ssh.topIPs.map((t) => (
                  <div key={t.ip} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid rgba(124,232,255,0.06)' }}>
                    <span style={{ fontFamily: 'monospace', color: '#ff8844' }}>{t.ip}</span>
                    <span style={{ color: '#ffcc00', fontWeight: 700 }}>{t.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: recent table */}
          <div style={card}>
            <div style={{ ...sectionHeader, marginBottom: 8 }}>RECENT ATTEMPTS</div>
            <div style={{ overflowY: 'auto', maxHeight: 340 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>IP</th>
                    <th style={thStyle}>User</th>
                  </tr>
                </thead>
                <tbody>
                  {ssh.recent.length === 0 ? (
                    <tr><td colSpan={3} style={{ ...tdStyle, color: '#666', textAlign: 'center' }}>No SSH login attempts detected in the last hour.</td></tr>
                  ) : (
                    ssh.recent.map((e, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{e.ts.replace('T', ' ').slice(0, 19)}</td>
                        <td style={{ ...tdStyle, color: '#ff8844' }}>{e.ip}</td>
                        <td style={{ ...tdStyle, color: '#9fefff' }}>{e.user}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </section>

      {/* ── Nginx Access Logs ── */}
      <section style={{ marginTop: 28 }}>
        <div style={sectionHeader}>NGINX ACCESS LOG (LIVE)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Left: error count + top paths/IPs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={card}>
              <div style={{ fontSize: 28, fontWeight: 800, color: nginx.errorCount > 20 ? '#ff4466' : nginx.errorCount > 5 ? '#ffcc00' : '#00ff88' }}>
                {nginx.errorCount}
              </div>
              <div style={{ fontSize: 12, color: '#9fefff', opacity: 0.7 }}>4xx/5xx responses (sample window)</div>
            </div>

            <div style={card}>
              <div style={{ ...sectionHeader, marginBottom: 8 }}>TOP PATHS</div>
              {nginx.topPaths.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>No standout paths in the sampled log window.</div>
              ) : (
                nginx.topPaths.map((p) => (
                  <div key={p.path} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(124,232,255,0.06)' }}>
                    <span style={{ fontFamily: 'monospace', color: '#66ddff', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{p.path}</span>
                    <span style={{ color: '#aaa', fontWeight: 700, marginLeft: 8 }}>{p.count}</span>
                  </div>
                ))
              )}
            </div>

            <div style={card}>
              <div style={{ ...sectionHeader, marginBottom: 8 }}>TOP SOURCE IPs</div>
              {nginx.topIPs.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>No repeated sources in the sampled log window.</div>
              ) : (
                nginx.topIPs.map((t) => (
                  <div key={t.ip} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid rgba(124,232,255,0.06)' }}>
                    <span style={{ fontFamily: 'monospace', color: '#ff8844' }}>{t.ip}</span>
                    <span style={{ color: '#ffcc00', fontWeight: 700 }}>{t.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: access log table */}
          <div style={card}>
            <div style={{ ...sectionHeader, marginBottom: 8 }}>RECENT REQUESTS</div>
            <div style={{ overflowY: 'auto', maxHeight: 400 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>IP</th>
                    <th style={thStyle}>Method</th>
                    <th style={thStyle}>Path</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nginx.recent.length === 0 ? (
                    <tr><td colSpan={4} style={{ ...tdStyle, color: '#666', textAlign: 'center' }}>No nginx requests found in the sampled log window.</td></tr>
                  ) : (
                    nginx.recent.map((e, i) => (
                      <tr key={i}>
                        <td style={{ ...tdStyle, color: '#ff8844' }}>{e.ip}</td>
                        <td style={{ ...tdStyle, color: '#9fefff' }}>{e.method}</td>
                        <td style={{ ...tdStyle, color: '#66ddff', maxWidth: 140 }}>{e.path}</td>
                        <td style={{ ...tdStyle, color: statusCodeColor(e.status), fontWeight: 700 }}>{e.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </section>

      {/* ── Firewall ── */}
      <section style={{ marginTop: 28, marginBottom: 40 }}>
        <div style={sectionHeader}>UFW FIREWALL EVENTS (LIVE)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Left: block count + top sources */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={card}>
              <div style={{ fontSize: 28, fontWeight: 800, color: firewall.blockCount > 100 ? '#ff4466' : firewall.blockCount > 20 ? '#ffcc00' : '#00ff88' }}>
                {firewall.blockCount}
              </div>
              <div style={{ fontSize: 12, color: '#9fefff', opacity: 0.7 }}>block event(s) in the last hour</div>
            </div>

            <div style={card}>
              <div style={{ ...sectionHeader, marginBottom: 8 }}>TOP BLOCKED SOURCES</div>
              {firewall.topSources.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>No blocked sources in the last hour.</div>
              ) : (
                firewall.topSources.map((s) => (
                  <div key={s.ip} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px solid rgba(124,232,255,0.06)' }}>
                    <span style={{ fontFamily: 'monospace', color: '#ff8844' }}>{s.ip}</span>
                    <span style={{ color: '#ffcc00', fontWeight: 700 }}>{s.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: events table */}
          <div style={card}>
            <div style={{ ...sectionHeader, marginBottom: 8 }}>RECENT BLOCKS</div>
            <div style={{ overflowY: 'auto', maxHeight: 340 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Src IP</th>
                    <th style={thStyle}>Dst IP</th>
                    <th style={thStyle}>Port</th>
                    <th style={thStyle}>Proto</th>
                  </tr>
                </thead>
                <tbody>
                  {firewall.recent.length === 0 ? (
                    <tr><td colSpan={5} style={{ ...tdStyle, color: '#666', textAlign: 'center' }}>No firewall blocks recorded in the last hour.</td></tr>
                  ) : (
                    firewall.recent.map((e, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{e.ts}</td>
                        <td style={{ ...tdStyle, color: '#ff8844' }}>{e.src}</td>
                        <td style={{ ...tdStyle, color: '#9fefff' }}>{e.dst}</td>
                        <td style={{ ...tdStyle, color: '#66ddff' }}>{e.dpt}</td>
                        <td style={{ ...tdStyle, color: '#aaa' }}>{e.proto}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </section>

      {/* ── Auth Log ── */}
      <section style={{ marginTop: 28, marginBottom: 40 }}>
        <div style={sectionHeader}>AUTH LOG — SUDO & LOGIN ACTIVITY (LIVE)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Left: summary stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Sudo cmds', value: authLog.sudoCount, color: authLog.sudoCount > 10 ? '#ffcc00' : '#00ff88' },
                { label: 'SSH logins', value: authLog.sshAcceptCount, color: '#66ddff' },
                { label: 'Auth fails', value: authLog.failCount, color: authLog.failCount > 0 ? '#ff4466' : '#00ff88' },
              ].map((s) => (
                <div key={s.label} style={{ ...card, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: '#9fefff', opacity: 0.7, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={{ fontSize: 11, color: '#9fefff', opacity: 0.6 }}>
                Parsed from <code style={{ color: '#66ddff' }}>/var/log/auth.log</code> — last hour. Captures sudo commands, su attempts, PAM failures, and successful SSH logins.
              </div>
            </div>
          </div>

          {/* Right: recent entries */}
          <div style={card}>
            <div style={{ ...sectionHeader, marginBottom: 8 }}>RECENT ACTIVITY</div>
            <div style={{ overflowY: 'auto', maxHeight: 280 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>User</th>
                    <th style={thStyle}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {authLog.recent.length === 0 ? (
                    <tr><td colSpan={4} style={{ ...tdStyle, color: '#666', textAlign: 'center' }}>No auth activity recorded in the last hour.</td></tr>
                  ) : (
                    authLog.recent.map((e, i) => {
                      const typeColor = e.type === 'sudo' ? '#ffcc00' : e.type === 'ssh-accept' ? '#00ff88' : e.type === 'auth-fail' ? '#ff4466' : '#9fefff';
                      return (
                        <tr key={i}>
                          <td style={tdStyle}>{e.ts}</td>
                          <td style={{ ...tdStyle, color: typeColor, fontWeight: 700 }}>{e.type}</td>
                          <td style={{ ...tdStyle, color: '#9fefff' }}>{e.user}</td>
                          <td style={{ ...tdStyle, color: '#aaa', maxWidth: 200 }}>{e.detail}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </section>

    </PageShell>
  );
}
