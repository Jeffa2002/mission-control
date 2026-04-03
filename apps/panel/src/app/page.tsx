'use client';

import { useEffect, useState } from 'react';
import { HealthStrip, OpsStrip, RecentActions } from './components';
import { Nav } from './nav';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/overview', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // HealthStrip / OpsStrip manage their own polling
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 24,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#d6f6ff',
        background:
          'radial-gradient(1200px 700px at 20% 10%, rgba(0,255,255,0.14), transparent 60%), radial-gradient(1000px 600px at 80% 30%, rgba(0,140,255,0.12), transparent 55%), radial-gradient(900px 600px at 50% 80%, rgba(140,0,255,0.10), transparent 60%), linear-gradient(180deg, #040814 0%, #030513 55%, #02030a 100%)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <div style={{ letterSpacing: 3, fontSize: 12, color: '#7ce8ff', opacity: 0.9 }}>MISSION CONTROL</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 34, textShadow: '0 0 18px rgba(0,220,255,0.25)' }}>Bazza Ops Console</h1>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#9fefff', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={async () => {
                try {
                  const [overview, health, actions] = await Promise.all([
                    fetch('/api/overview', { cache: 'no-store' }).then((r) => r.json()),
                    fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()),
                    fetch('/api/actions?limit=80', { cache: 'no-store' }).then((r) => r.json()),
                  ]);
                  const payload = {
                    captured_at: new Date().toISOString(),
                    overview,
                    health,
                    actions,
                  };
                  const text = JSON.stringify(payload, null, 2);
                  await navigator.clipboard.writeText(text);
                  alert('Diagnostics copied to clipboard. Paste into chat/support ticket.');
                } catch (e: any) {
                  alert(`Failed to copy diagnostics: ${String(e?.message || e)}`);
                }
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid rgba(124,232,255,0.35)',
                background: 'rgba(0,120,160,0.12)',
                color: '#d6f6ff',
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Copies /api/overview + /api/health + last 80 audit actions as JSON"
            >
              📋 Copy diagnostics
            </button>
            <div>{loading ? 'refreshing…' : 'live'}</div>
          </div>
        </div>
      </div>

      <Nav />

      {/* ── Stack health strip (green/amber/red) ─────────────────── */}
      <HealthStrip />

      <OpsStrip />

      {err ? (
        <div style={{ marginTop: 18, padding: 14, border: '1px solid rgba(255,80,120,0.35)', background: 'rgba(255,40,90,0.08)' }}>
          <strong style={{ color: '#ff7aa8' }}>Error</strong>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{err}</div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 18 }}>
        <Card title="SYSTEM LINKS" accent="#7ce8ff">
          <LinkRow label="Grafana" href="https://bazza.taile9fed9.ts.net:3000/" />
          <LinkRow label="Prometheus" href="https://bazza.taile9fed9.ts.net:9090/" />
          <LinkRow label="cAdvisor" href="https://bazza.taile9fed9.ts.net:8080/" />
          <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
            Panel images below use the server-side proxy (<code>/api/grafana-panel</code>).
            Token is injected server-side; the browser never sees it.
            Requires <code>GRAFANA_SA_TOKEN</code> (Viewer SA) in <code>.env</code>.
            If token is absent, iframes fall back to direct embed.
          </div>
        </Card>

        <GrafanaEmbedCard
          title="EMBED: HOST METRICS"
          accent="#66a6ff"
          iframeSrc="https://bazza.taile9fed9.ts.net:3000/d/nodeexp?orgId=1&from=now-6h&to=now&kiosk=tv"
          proxyUid="nodeexp"
          proxyPanelId={2}
        />

        <GrafanaEmbedCard
          title="EMBED: DOCKER METRICS"
          accent="#33ffcc"
          iframeSrc="https://bazza.taile9fed9.ts.net:3000/d/dockmon?orgId=1&from=now-6h&to=now&kiosk=tv"
          proxyUid="dockmon"
          proxyPanelId={2}
        />
      </div>

      <ActionBar onRefresh={refresh} />

      <RecentActions />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GrafanaEmbedCard — shows proxied panel image if token available, else iframe
// ─────────────────────────────────────────────────────────────────────────────

function GrafanaEmbedCard({
  title,
  accent,
  iframeSrc,
  proxyUid,
  proxyPanelId,
}: {
  title: string;
  accent: string;
  iframeSrc: string;
  proxyUid: string;
  proxyPanelId: number;
}) {
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const proxySrc = `/api/grafana-panel?uid=${encodeURIComponent(proxyUid)}&panelId=${proxyPanelId}&from=now-6h&to=now&w=1200&h=500`;

  function retry() {
    setFailed(false);
    setRetryKey(k => k + 1);
  }

  // The color for the placeholder card
  const cardBackground = 'linear-gradient(180deg, rgba(0, 255, 255, 0.14), transparent 60%)';
  const cardBorder = '1px solid rgba(0, 255, 255, 0.5)';
  const cyanAccent = '#00ffff';

  return (
    <Card title={title} accent={accent} wide>
      {!failed ? (
        <div style={{ position: 'relative' }}>
          <img
            key={retryKey}
            src={proxySrc}
            alt={title}
            onError={() => setFailed(true)}
            style={{
              width: '100%',
              borderRadius: 12,
              border: '1px solid rgba(124,232,255,0.12)',
              background: 'rgba(0,0,0,0.25)',
              display: 'block',
              minHeight: 200,
            }}
          />
          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6, textAlign: 'right' }}>
            proxied via /api/grafana-panel · token server-side only
          </div>
        </div>
      ) : (
        <div
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            border: cardBorder,
            background: cardBackground,
            height: 200,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
            color: cyanAccent,
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          <div>Open Grafana directly to view metrics</div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            <a
              href="https://bazza.taile9fed9.ts.net:3000/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 14px',
                background: cyanAccent,
                borderRadius: 12,
                color: '#0a0a0a',
                fontWeight: '600',
                textDecoration: 'none',
                userSelect: 'none',
              }}
            >
              Open Grafana
            </a>
            <button
              onClick={retry}
              style={{
                padding: '8px 14px',
                background: 'rgba(0,255,255,0.3)',
                borderRadius: 12,
                color: cyanAccent,
                fontWeight: '600',
                border: '1px solid rgba(0,255,255,0.5)',
                userSelect: 'none',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Card, LinkRow
// ─────────────────────────────────────────────────────────────────────────────

function Card({ title, children, accent, wide }: { title: string; children: any; accent: string; wide?: boolean }) {
  return (
    <section
      style={{
        gridColumn: wide ? '1 / -1' : undefined,
        borderRadius: 16,
        border: '1px solid rgba(124,232,255,0.16)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
        boxShadow: `0 0 0 1px rgba(0,0,0,0.3), 0 0 40px rgba(0, 160, 255, 0.10)`,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#9fefff', opacity: 0.9 }}>{title}</div>
        <div style={{ width: 10, height: 10, borderRadius: 99, background: accent, boxShadow: `0 0 18px ${accent}` }} />
      </div>
      {children}
    </section>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
      <div style={{ opacity: 0.75 }}>{label}</div>
      <a href={href} target="_blank" rel="noreferrer" style={{ color: '#7ce8ff', textDecoration: 'none' }}>
        open ↗
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionBar — Refresh + Logout only
// ─────────────────────────────────────────────────────────────────────────────

function ActionBar({ onRefresh }: { onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <button
        onClick={onRefresh}
        disabled={busy}
        style={{
          padding: '10px 12px',
          borderRadius: 12,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
          border: '1px solid rgba(124,232,255,0.35)',
          background: 'rgba(0,120,160,0.15)',
          color: '#d6f6ff',
        }}
      >
        Refresh
      </button>

      <form action="/api/logout" method="post">
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(255,90,140,0.35)',
            background: 'rgba(255,60,110,0.08)',
            color: '#ffd0df',
            cursor: 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          Logout
        </button>
      </form>
    </div>
  );
}
