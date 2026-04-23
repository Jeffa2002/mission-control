'use client';

import { useEffect, useState } from 'react';
import { AppShell, Metric, SectionTitle, card, muted } from '../../components/ops-ui';

interface SecurityData {
  ok: boolean;
  checkedAt: string;
  hasThreats: boolean;
  stale?: boolean;
  fail2ban: {
    available: boolean;
    banned: number;
    totalFailed: number;
    bannedIPs: string[];
  };
  nginx: {
    errorCount: number;
    recentErrors: string[];
  };
  auth: {
    failCount: number;
    recent: string[];
  };
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
                value={String(data.auth.failCount)}
                delta={data.auth.failCount > 0 ? `${data.auth.failCount} failed password events` : 'None detected'}
                status={data.auth.failCount > 50 ? 'critical' : data.auth.failCount > 10 ? 'warning' : 'healthy'}
              />
              <Metric
                label="Nginx 4xx/5xx"
                value={String(data.nginx.errorCount)}
                delta={data.nginx.errorCount > 0 ? `${data.nginx.errorCount} error responses` : 'No errors'}
                status={data.nginx.errorCount > 5000 ? 'critical' : data.nginx.errorCount > 1000 ? 'warning' : 'healthy'}
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

            {/* Recent nginx errors */}
            {data.nginx.recentErrors.length > 0 && (
              <div className={card + ' p-5'}>
                <SectionTitle title="Recent Nginx Errors" subtitle="Last 10 4xx/5xx responses on prod" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.nginx.recentErrors.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '6px 10px', borderRadius: 6, fontSize: 11,
                        fontFamily: 'ui-monospace, monospace', color: 'var(--text-3)',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auth failures detail */}
            {data.auth.failCount > 0 && (
              <div className={card + ' p-5'}>
                <SectionTitle title="Auth Failures" subtitle="Failed password attempts on prod" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.auth.recent.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '6px 10px', borderRadius: 6, fontSize: 11,
                        fontFamily: 'ui-monospace, monospace', color: 'var(--sev-warning)',
                        background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {line}
                    </div>
                  ))}
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
