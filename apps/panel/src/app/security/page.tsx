'use client';

import { useEffect, useState } from 'react';
import { AppShell, Metric, SectionTitle, card, muted } from '../../components/ops-ui';

interface SecurityData {
  ok: boolean;
  checkedAt: string;
  hasThreats: boolean;
  fail2ban: {
    available: boolean;
    banned: number;
    totalFailed: number;
    bannedIPs: string[];
  };
  nginx: {
    prodErrors: number;
    bazzaErrors: number;
    totalErrors: number;
  };
  authFailures: {
    prod: number;
    bazza: number;
    total: number;
  };
  recentBans: Array<{ ts: string; ip: string; jail: string }>;
}

function ThreatLevel({ hasThreats, data }: { hasThreats: boolean; data: SecurityData }) {
  if (!hasThreats) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px', gap: 12, textAlign: 'center',
      }}>
        <div style={{ fontSize: 40 }}>🛡️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sev-healthy)' }}>No active threats detected</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 400 }}>
          fail2ban has no active bans, auth failures are within normal range, and nginx error rates look clean.
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
          Checked at {new Date(data.checkedAt).toLocaleTimeString()}
        </div>
      </div>
    );
  }
  return null;
}

export default function SecurityPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch('/api/security', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <AppShell>
      <div className="space-y-8">
        <SectionTitle title="Uptime & Security" subtitle="Real data from prod and bazza — no fake alerts" />

        {loading && (
          <div className={card + ' p-8 text-center text-slate-400 text-sm'}>
            Loading security data from prod…
          </div>
        )}

        {error && (
          <div className={card + ' p-6'}>
            <div style={{ color: 'var(--sev-warning)', fontWeight: 600, marginBottom: 6 }}>⚠ Could not load security data</div>
            <div className={muted}>{error}</div>
          </div>
        )}

        {data && (
          <>
            {/* Metric row */}
            <section className="grid gap-4 md:grid-cols-4">
              <Metric
                label="Fail2ban bans"
                value={data.fail2ban.available ? String(data.fail2ban.banned) : 'N/A'}
                delta={data.fail2ban.available ? `${data.fail2ban.totalFailed} total failures` : 'fail2ban not available'}
                status={data.fail2ban.banned > 0 ? 'warning' : 'healthy'}
              />
              <Metric
                label="Auth failures"
                value={String(data.authFailures.total)}
                delta={`prod: ${data.authFailures.prod} · bazza: ${data.authFailures.bazza}`}
                status={data.authFailures.total > 50 ? 'critical' : data.authFailures.total > 10 ? 'warning' : 'healthy'}
              />
              <Metric
                label="Nginx 4xx/5xx"
                value={String(data.nginx.totalErrors)}
                delta={`prod: ${data.nginx.prodErrors} · bazza: ${data.nginx.bazzaErrors}`}
                status={data.nginx.totalErrors > 200 ? 'critical' : data.nginx.totalErrors > 50 ? 'warning' : 'healthy'}
              />
              <Metric
                label="Threat level"
                value={data.hasThreats ? 'Elevated' : 'Clear'}
                delta={data.hasThreats ? 'Action may be needed' : 'All metrics normal'}
                status={data.hasThreats ? 'warning' : 'healthy'}
              />
            </section>

            {/* No threats empty state */}
            {!data.hasThreats && (
              <div className={card + ' p-5'}>
                <ThreatLevel hasThreats={false} data={data} />
              </div>
            )}

            {/* Fail2ban detail */}
            {data.fail2ban.available && (
              <div className={card + ' p-5'}>
                <SectionTitle title="Fail2ban — SSH Jail" subtitle="Active bans on prod" />
                {data.fail2ban.banned === 0 ? (
                  <div className={'text-sm ' + muted}>No IPs currently banned</div>
                ) : (
                  <div>
                    <div className={'mb-3 text-sm ' + muted}>
                      {data.fail2ban.banned} IP{data.fail2ban.banned !== 1 ? 's' : ''} currently banned · {data.fail2ban.totalFailed} total failures
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {data.fail2ban.bannedIPs.map((ip) => (
                        <span
                          key={ip}
                          style={{
                            padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                            color: 'var(--sev-critical)', fontFamily: 'ui-monospace, monospace',
                          }}
                        >
                          {ip}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recent bans timeline */}
            {data.recentBans.length > 0 && (
              <div className={card + ' p-5'}>
                <SectionTitle title="Recent Ban Events" subtitle="From /var/log/fail2ban.log on prod" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recentBans.map((ban, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sev-critical)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 140, fontFamily: 'ui-monospace, monospace' }}>{ban.ts}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sev-critical)', fontFamily: 'ui-monospace, monospace' }}>{ban.ip}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>banned in [{ban.jail}]</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auth failures detail */}
            {data.authFailures.total > 0 && (
              <div className={card + ' p-5'}>
                <SectionTitle title="Auth Failures" subtitle="Failed password attempts (last 100 on prod)" />
                <div className="grid gap-4 md:grid-cols-2">
                  <div style={{
                    padding: '16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>prod</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: data.authFailures.prod > 20 ? 'var(--sev-critical)' : 'var(--text-1)' }}>
                      {data.authFailures.prod}
                    </div>
                    <div className={'mt-1 text-xs ' + muted}>Failed password events</div>
                  </div>
                  <div style={{
                    padding: '16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>bazza</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: data.authFailures.bazza > 20 ? 'var(--sev-critical)' : 'var(--text-1)' }}>
                      {data.authFailures.bazza}
                    </div>
                    <div className={'mt-1 text-xs ' + muted}>Failed password events</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
              Last checked: {new Date(data.checkedAt).toLocaleTimeString()} · refreshes every 60s
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
