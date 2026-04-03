'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; external?: boolean };

const tabs: Tab[] = [
  { href: '/', label: 'Overview' },
  { href: '/apps', label: '🚀 Apps' },
  { href: '/office', label: '🏢 Office' },
  { href: '/teams', label: '🧑‍🤝‍🧑 Teams' },
  { href: '/memory', label: '🧠 Memory' },
  { href: '/systems', label: '🖥️ Systems' },
  { href: '/incidents', label: '🚨 Incidents' },
  { href: '/security', label: '🔒 Security' },
  { href: '/actions', label: '📋 Audit Log' },
  { href: 'https://bazza.taile9fed9.ts.net:18789/', label: '🦞 OpenClaw', external: true },
];

export function Nav() {
  const path = usePathname();
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
      {tabs.map((t) => {
        const active = !t.external && path === t.href;
        const style = {
          textDecoration: 'none',
          padding: '8px 12px',
          borderRadius: 999,
          border: '1px solid rgba(124,232,255,0.22)',
          background: active ? 'rgba(0,200,255,0.16)' : 'rgba(0,0,0,0.18)',
          color: active ? '#d6f6ff' : '#9fefff',
          fontWeight: 800,
          letterSpacing: 0.5,
          fontSize: 12,
        } as const;

        if (t.external) {
          return (
            <a key={t.href} href={t.href} target="_blank" rel="noreferrer" style={style}>
              {t.label}
            </a>
          );
        }

        return (
          <Link key={t.href} href={t.href} style={style}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
