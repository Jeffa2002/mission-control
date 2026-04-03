'use client';

import { Nav } from '../app/nav';

interface PageShellProps {
  children: React.ReactNode;
  title?: string;
}

const BG_GRADIENT =
  'radial-gradient(1200px 700px at 20% 10%, rgba(0,255,255,0.14), transparent 60%), radial-gradient(1000px 600px at 80% 30%, rgba(0,140,255,0.12), transparent 55%), radial-gradient(900px 600px at 50% 80%, rgba(140,0,255,0.10), transparent 60%), linear-gradient(180deg, #040814 0%, #030513 55%, #02030a 100%)';

export function PageShell({ children, title }: PageShellProps) {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#d6f6ff',
        background: BG_GRADIENT,
      }}
    >
      <div>
        <div
          style={{ letterSpacing: 3, fontSize: 12, color: '#7ce8ff', opacity: 0.9 }}
        >
          MISSION CONTROL
        </div>
        {title && (
          <h1
            style={{
              margin: '6px 0 0',
              fontSize: 28,
              textShadow: '0 0 18px rgba(0,220,255,0.25)',
            }}
          >
            {title}
          </h1>
        )}
      </div>

      <Nav />

      {children}
    </main>
  );
}
