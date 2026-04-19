'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; external?: boolean; group?: 'monitoring' | 'ops' };

const tabs: Tab[] = [
  { href: '/', label: 'Overview', group: 'monitoring' },
  { href: '/apps', label: '🚀 Apps', group: 'ops' },
  { href: '/office', label: '🏢 Office', group: 'ops' },
  { href: '/teams', label: '🧑‍🤝‍🧑 Teams', group: 'ops' },
  { href: '/memory', label: '🧠 Memory', group: 'ops' },
  { href: '/network', label: '🌐 Network', group: 'monitoring' },
  { href: '/systems', label: '🖥️ Systems', group: 'monitoring' },
  { href: '/incidents', label: '🚨 Incidents', group: 'monitoring' },
  { href: '/security', label: '🔒 Security', group: 'monitoring' },
  { href: '/actions', label: '📋 Audit Log', group: 'ops' },
  { href: 'https://bazza.taile9fed9.ts.net:18789/', label: '🦞 OpenClaw', external: true },
];

export function Nav() {
  const path = usePathname();
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
      {tabs.map((t, index) => {
        const active = !t.external && (path === t.href || (t.href !== '/' && path.startsWith(`${t.href}/`)));
        const isSeparator = index > 0 && tabs[index - 1]?.group !== t.group && !t.external && !tabs[index - 1]?.external;
        const style = {
          textDecoration: 'none',
          padding: '8px 12px',
          borderRadius: 999,
          border: '1px solid rgba(124,232,255,0.22)',
          background: active ? 'rgba(0,200,255,0.18)' : 'rgba(0,0,0,0.18)',
          color: active ? '#ffffff' : '#9fefff',
          fontWeight: 800,
          letterSpacing: 0.5,
          fontSize: 12,
          boxShadow: active ? 'inset 0 0 0 1px rgba(124,232,255,0.2)' : 'none',
          borderLeft: active ? '3px solid #7ce8ff' : '1px solid rgba(124,232,255,0.22)',
          paddingLeft: active ? 10 : 12,
        } as const;

        const node = t.external ? (
          <a key={t.href} href={t.href} target="_blank" rel="noreferrer" style={style}>
            {t.label}
          </a>
        ) : (
          <Link key={t.href} href={t.href} style={style}>
            {t.label}
          </Link>
        );

        return (
          <>
            {isSeparator ? <span key={`${t.href}-sep`} style={{ width: 1, height: 24, background: 'rgba(124,232,255,0.18)', margin: '0 2px' }} /> : null}
            {node}
          </>
        );
      })}
    </div>
  );
}
