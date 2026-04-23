'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, createContext, useContext, useCallback } from 'react';

// ─── Utility ─────────────────────────────────────────────────────────────────

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

// ─── Design tokens (Tailwind classes using CSS vars) ─────────────────────────

export const card = 'rounded-[14px] border border-white/10 bg-[var(--surface)] shadow-[0_12px_30px_rgba(0,0,0,0.28)]';
export const card2 = 'rounded-[14px] border border-white/10 bg-[var(--surface-2)]';
export const pill = 'inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200';
export const muted = 'text-[13px] text-slate-400';

export function hostPill(host: 'bazza' | 'prod') {
  return host === 'bazza'
    ? 'text-[var(--host-bazza)] border-[var(--host-bazza)]/30 bg-[var(--host-bazza)]/10'
    : 'text-[var(--host-prod)] border-[var(--host-prod)]/30 bg-[var(--host-prod)]/10';
}

export function sevPill(sev: string) {
  const map: Record<string, string> = {
    healthy: 'text-[var(--sev-healthy)] border-[var(--sev-healthy)]/30 bg-[var(--sev-healthy)]/10',
    warning: 'text-[var(--sev-warning)] border-[var(--sev-warning)]/30 bg-[var(--sev-warning)]/10',
    critical: 'text-[var(--sev-critical)] border-[var(--sev-critical)]/30 bg-[var(--sev-critical)]/10',
    info: 'text-[var(--sev-info)] border-[var(--sev-info)]/30 bg-[var(--sev-info)]/10',
    neutral: 'text-slate-300 border-white/10 bg-white/5',
  };
  return cn(pill, map[sev] ?? map.neutral);
}

// ─── Routes (single source of truth) ─────────────────────────────────────────

export type RouteGroup = 'MONITOR' | 'OPS';

export interface Route {
  href: string;
  label: string;
  icon: string;
  group: RouteGroup;
  external?: boolean;
}

export const ROUTES: Route[] = [
  // MONITOR group
  { href: '/', label: 'Overview', icon: 'overview', group: 'MONITOR' },
  { href: '/security', label: 'Security', icon: 'security', group: 'MONITOR' },
  { href: '/incidents', label: 'Incidents', icon: 'incidents', group: 'MONITOR' },
  { href: '/systems', label: 'Systems', icon: 'systems', group: 'MONITOR' },
  { href: '/network', label: 'Network', icon: 'network', group: 'MONITOR' },
  // OPS group
  { href: '/apps', label: 'Agents', icon: 'agents', group: 'OPS' },
  { href: '/teams', label: 'Teams', icon: 'teams', group: 'OPS' },
  { href: '/office', label: 'Office', icon: 'office', group: 'OPS' },
  { href: '/memory', label: 'Memory', icon: 'memory', group: 'OPS' },
  { href: '/actions', label: 'Audit Log', icon: 'audit', group: 'OPS' },
  { href: '/deploys', label: 'Deploys', icon: 'agents', group: 'OPS' },
];

// ─── Nav icons (inline SVG, no imports) ──────────────────────────────────────

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const col = active ? 'var(--accent)' : 'currentColor';
  const size = 15;
  const props = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', style: { flexShrink: 0 } as React.CSSProperties };

  switch (name) {
    case 'overview':
      return (
        <svg {...props}>
          <rect x="1" y="1" width="6" height="6" rx="1.5" stroke={col} strokeWidth="1.4" />
          <rect x="9" y="1" width="6" height="6" rx="1.5" stroke={col} strokeWidth="1.4" />
          <rect x="1" y="9" width="6" height="6" rx="1.5" stroke={col} strokeWidth="1.4" />
          <rect x="9" y="9" width="6" height="6" rx="1.5" stroke={col} strokeWidth="1.4" />
        </svg>
      );
    case 'security':
      return (
        <svg {...props}>
          <path d="M8 1.5L2 4v3.5c0 3 2.5 5.5 6 6.5 3.5-1 6-3.5 6-6.5V4L8 1.5z" stroke={col} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'incidents':
      return (
        <svg {...props}>
          <path d="M8 2L1.5 13.5h13L8 2z" stroke={col} strokeWidth="1.4" strokeLinejoin="round" />
          <line x1="8" y1="6.5" x2="8" y2="9.5" stroke={col} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="11.5" r="0.7" fill={col} />
        </svg>
      );
    case 'systems':
      return (
        <svg {...props}>
          <rect x="1" y="2" width="14" height="10" rx="1.5" stroke={col} strokeWidth="1.4" />
          <line x1="5.5" y1="14" x2="10.5" y2="14" stroke={col} strokeWidth="1.4" strokeLinecap="round" />
          <line x1="8" y1="12" x2="8" y2="14" stroke={col} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'agents':
      return (
        <svg {...props}>
          <circle cx="8" cy="5.5" r="3" stroke={col} strokeWidth="1.4" />
          <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke={col} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'teams':
      return (
        <svg {...props}>
          <circle cx="5.5" cy="5" r="2.5" stroke={col} strokeWidth="1.4" />
          <circle cx="10.5" cy="5" r="2.5" stroke={col} strokeWidth="1.4" />
          <path d="M1 14c0-2.8 2-4.5 4.5-4.5S10 11.2 10 14" stroke={col} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M10 14c0-2.8 2-4.5 4.5-4.5" stroke={col} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'office':
      return (
        <svg {...props}>
          <rect x="2" y="4" width="12" height="10" rx="1.5" stroke={col} strokeWidth="1.4" />
          <path d="M5 4V2.5a1 1 0 011-1h4a1 1 0 011 1V4" stroke={col} strokeWidth="1.4" />
          <line x1="2" y1="8" x2="14" y2="8" stroke={col} strokeWidth="1.2" />
          <rect x="6" y="9.5" width="4" height="4.5" rx="0.8" stroke={col} strokeWidth="1.1" />
        </svg>
      );
    case 'memory':
      return (
        <svg {...props}>
          <ellipse cx="8" cy="8" rx="6" ry="4.5" stroke={col} strokeWidth="1.4" />
          <line x1="2" y1="8" x2="14" y2="8" stroke={col} strokeWidth="1.2" />
          <path d="M4.5 5.2c.9-1.1 2.1-1.7 3.5-1.7s2.6.6 3.5 1.7" stroke={col} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'network':
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="2.2" stroke={col} strokeWidth="1.4" />
          <circle cx="2.5" cy="4" r="1.5" stroke={col} strokeWidth="1.2" />
          <circle cx="13.5" cy="4" r="1.5" stroke={col} strokeWidth="1.2" />
          <circle cx="2.5" cy="12" r="1.5" stroke={col} strokeWidth="1.2" />
          <circle cx="13.5" cy="12" r="1.5" stroke={col} strokeWidth="1.2" />
          <line x1="5.8" y1="6.5" x2="4" y2="5.2" stroke={col} strokeWidth="1.1" strokeLinecap="round" />
          <line x1="10.2" y1="6.5" x2="12" y2="5.2" stroke={col} strokeWidth="1.1" strokeLinecap="round" />
          <line x1="5.8" y1="9.5" x2="4" y2="10.8" stroke={col} strokeWidth="1.1" strokeLinecap="round" />
          <line x1="10.2" y1="9.5" x2="12" y2="10.8" stroke={col} strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...props}>
          <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke={col} strokeWidth="1.4" />
          <line x1="5" y1="5" x2="11" y2="5" stroke={col} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="5" y1="8" x2="11" y2="8" stroke={col} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="5" y1="11" x2="8.5" y2="11" stroke={col} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    default:
      return <span style={{ width: size, height: size, display: 'inline-block' }} />;
  }
}

// ─── Health types ─────────────────────────────────────────────────────────────

type HealthColor = 'green' | 'amber' | 'red';
type CheckStatus = 'ok' | 'degraded' | 'error' | 'unknown';

interface HealthCheck {
  status: CheckStatus;
  detail?: string;
}

interface HealthData {
  ok: boolean;
  overall: HealthColor;
  checks: Record<string, HealthCheck>;
  checked_at: string;
}

const HEALTH_CSS: Record<HealthColor, { dot: string; bar: string; text: string }> = {
  green: { dot: 'var(--sev-healthy)', bar: 'linear-gradient(90deg, var(--sev-healthy), #16a34a)', text: 'var(--sev-healthy)' },
  amber: { dot: 'var(--sev-warning)', bar: 'linear-gradient(90deg, var(--sev-warning), #d97706)', text: 'var(--sev-warning)' },
  red:   { dot: 'var(--sev-critical)', bar: 'linear-gradient(90deg, var(--sev-critical), #dc2626)', text: 'var(--sev-critical)' },
};

// ─── AppShell Context ─────────────────────────────────────────────────────────

interface AppShellContextValue {
  health: HealthData | null;
  refresh: () => void;
  lastUpdated: string;
}

const AppShellContext = createContext<AppShellContextValue>({
  health: null,
  refresh: () => {},
  lastUpdated: '',
});

export function useAppShell() {
  return useContext(AppShellContext);
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ path, health }: { path: string; health: HealthData | null }) {
  const monitorRoutes = ROUTES.filter((r) => r.group === 'MONITOR');
  const opsRoutes = ROUTES.filter((r) => r.group === 'OPS');

  const overall = health?.overall ?? 'amber';
  const bazzaCheck = health?.checks?.['app'];
  const bazzaOk = bazzaCheck?.status === 'ok';
  const panicCheck = health?.checks?.['panic_latch'];
  const prodOk = panicCheck?.status === 'ok';

  return (
    <aside
      style={{
        width: 260,
        minHeight: '100vh',
        background: 'var(--bg-1)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* Logo area */}
      <div
        style={{
          padding: '22px 18px 18px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Icon + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Hexagon logo mark */}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(103,213,255,0.25), rgba(124,140,255,0.20))',
              border: '1px solid rgba(103,213,255,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(103,213,255,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1.5L16 5.5V12.5L9 16.5L2 12.5V5.5L9 1.5Z" stroke="var(--accent)" strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx="9" cy="9" r="2.5" fill="var(--accent)" fillOpacity="0.6" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.22em',
                color: 'var(--accent)',
                opacity: 0.75,
                lineHeight: 1.2,
              }}
            >
              MISSION
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.12em',
                color: 'var(--text-1)',
                lineHeight: 1.2,
                textShadow: '0 0 20px rgba(103,213,255,0.30)',
              }}
            >
              CONTROL
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          padding: '14px 12px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* MONITOR group */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.22em',
              color: 'var(--text-3)',
              paddingLeft: 8,
              marginBottom: 4,
            }}
          >
            MONITOR
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {monitorRoutes.map((route) => (
              <NavItem key={route.href} route={route} path={path} />
            ))}
          </div>
        </div>

        {/* OPS group */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.22em',
              color: 'var(--text-3)',
              paddingLeft: 8,
              marginBottom: 4,
            }}
          >
            OPS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {opsRoutes.map((route) => (
              <NavItem key={route.href} route={route} path={path} />
            ))}
          </div>
        </div>
      </nav>

      {/* Footer: server status + version */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Server status row */}
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: 'var(--text-3)',
              marginBottom: 8,
            }}
          >
            SERVERS
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ServerDot label="bazza" ok={bazzaOk} />
            <ServerDot label="prod" ok={prodOk} />
          </div>
        </div>

        {/* Version info */}
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-3)',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            marginBottom: 12,
          }}
        >
          Mission Control · v2.0
        </div>

        {/* OpenClaw external link */}
        <a
          href="https://bazza.taile9fed9.ts.net:18789/"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid rgba(103,213,255,0.20)',
            background: 'rgba(103,213,255,0.05)',
            textDecoration: 'none',
            color: 'var(--accent)',
            fontSize: 12,
            fontWeight: 600,
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(103,213,255,0.10)';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(103,213,255,0.35)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(103,213,255,0.05)';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(103,213,255,0.20)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2.5C5 2.5 2.5 5 2.5 8s2.5 5.5 5.5 5.5 5.5-2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M11 1l4 4-4 4M15 5H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          OpenClaw
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 'auto', opacity: 0.5 }}>
            <path d="M2 10L10 2M10 2H5M10 2v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </aside>
  );
}

function NavItem({ route, path }: { route: Route; path: string }) {
  const active = path === route.href || (route.href !== '/' && path.startsWith(route.href));

  return (
    <Link
      href={route.href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 10px',
        borderRadius: 9,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        textDecoration: 'none',
        background: active ? 'rgba(103,213,255,0.08)' : 'transparent',
        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        paddingLeft: active ? 8 : 10,
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
        boxShadow: active ? 'inset 0 0 20px rgba(103,213,255,0.04)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          const el = e.currentTarget as HTMLElement;
          el.style.background = 'rgba(255,255,255,0.04)';
          el.style.color = 'var(--text-1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          const el = e.currentTarget as HTMLElement;
          el.style.background = 'transparent';
          el.style.color = 'var(--text-2)';
        }
      }}
    >
      <NavIcon name={route.icon} active={active} />
      {route.label}
    </Link>
  );
}

function ServerDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 8px',
        borderRadius: 7,
        border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
        background: ok ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
        fontSize: 11,
        fontWeight: 600,
        color: ok ? 'var(--sev-healthy)' : 'var(--sev-warning)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: ok ? 'var(--sev-healthy)' : 'var(--sev-warning)',
          boxShadow: ok ? '0 0 6px var(--sev-healthy)' : '0 0 6px var(--sev-warning)',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({
  path,
  health,
  lastUpdated,
  onRefresh,
}: {
  path: string;
  health: HealthData | null;
  lastUpdated: string;
  onRefresh: () => void;
}) {
  const overall = health?.overall ?? 'green';
  const css = HEALTH_CSS[overall];
  const alertCount = health?.checks
    ? Object.values(health.checks).filter((c) => c.status === 'error' || c.status === 'degraded').length
    : 0;

  // Build breadcrumb
  const route = ROUTES.find((r) => r.href === path || (r.href !== '/' && path.startsWith(r.href)));
  const rawName = path.replace('/', '').replace(/\b\w/g, (l) => l.toUpperCase());
  const pageName = route?.label ?? (rawName || 'Overview');

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(11,16,32,0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {/* Dynamic status bar */}
      <div
        style={{
          height: 2,
          background: css.bar,
          opacity: 0.7,
          transition: 'background 0.8s ease',
        }}
      />

      {/* Header content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '10px 20px',
        }}
      >
        {/* Left: breadcrumb */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text-2)',
          }}
        >
          <span style={{ opacity: 0.5 }}>Mission Control</span>
          <span style={{ opacity: 0.35 }}>/</span>
          <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{pageName}</span>
        </div>

        {/* Centre: health indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Alert count badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              border: alertCount > 0
                ? '1px solid rgba(239,68,68,0.35)'
                : '1px solid rgba(34,197,94,0.25)',
              background: alertCount > 0
                ? 'rgba(239,68,68,0.08)'
                : 'rgba(34,197,94,0.06)',
              fontSize: 12,
              fontWeight: 600,
              color: alertCount > 0 ? 'var(--sev-critical)' : 'var(--sev-healthy)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: alertCount > 0 ? 'var(--sev-critical)' : 'var(--sev-healthy)',
                boxShadow: alertCount > 0 ? '0 0 6px var(--sev-critical)' : 'none',
                display: 'inline-block',
              }}
            />
            {alertCount > 0 ? `${alertCount} alert${alertCount !== 1 ? 's' : ''}` : 'All clear'}
          </div>

          {/* Health dot */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.03)',
              fontSize: 12,
              fontWeight: 600,
              color: css.text,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: css.dot,
                boxShadow: `0 0 6px ${css.dot}`,
                display: 'inline-block',
              }}
            />
            {overall === 'green' ? 'Healthy' : overall === 'amber' ? 'Degraded' : 'Critical'}
          </div>
        </div>

        {/* Right: refresh + last updated */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {lastUpdated}
            </span>
          )}
          <button
            onClick={onRefresh}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-2)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M10.5 2A5.5 5.5 0 1111.5 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M10.5 2L10.5 5L7.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');

  const loadHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (r.ok) {
        setHealth(await r.json());
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadHealth();
    const t = setInterval(loadHealth, 30_000);
    return () => clearInterval(t);
  }, [loadHealth]);

  const contextValue: AppShellContextValue = {
    health,
    refresh: loadHealth,
    lastUpdated,
  };

  return (
    <AppShellContext.Provider value={contextValue}>
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-0)',
          color: 'var(--text-1)',
          display: 'flex',
        }}
      >
        <Sidebar path={path} health={health} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Header
            path={path}
            health={health}
            lastUpdated={lastUpdated}
            onRefresh={loadHealth}
          />
          <main style={{ flex: 1, padding: '24px 28px' }}>
            {children}
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-100">{title}</h2>
        {subtitle ? <p className="text-[13px] text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Metric({
  label,
  value,
  delta,
  status,
}: {
  label: string;
  value: string;
  delta?: string;
  status?: 'healthy' | 'warning' | 'critical' | 'neutral';
}) {
  const statusColors: Record<string, string> = {
    healthy: 'var(--sev-healthy)',
    warning: 'var(--sev-warning)',
    critical: 'var(--sev-critical)',
    neutral: 'var(--text-3)',
  };
  const dotColor = status ? statusColors[status] : undefined;

  return (
    <div className={cn(card, 'p-5')}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
        {dotColor && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              boxShadow: `0 0 6px ${dotColor}`,
              display: 'inline-block',
            }}
          />
        )}
      </div>
      <div className="mt-3 text-[30px] leading-[36px] font-semibold">{value}</div>
      {delta ? <div className="mt-2 text-[13px] text-slate-400">{delta}</div> : null}
    </div>
  );
}
