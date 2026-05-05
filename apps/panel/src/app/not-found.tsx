import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 24,
        textAlign: 'center',
        padding: 24,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#d6f6ff',
        background:
          'radial-gradient(1200px 700px at 20% 10%, rgba(0,255,255,0.08), transparent 60%), radial-gradient(1000px 600px at 80% 30%, rgba(0,140,255,0.07), transparent 55%), linear-gradient(180deg, #040814 0%, #030513 55%, #02030a 100%)',
      }}
    >
      {/* Hexagon logo */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(103,213,255,0.15), rgba(124,140,255,0.12))',
          border: '1px solid rgba(103,213,255,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 30px rgba(103,213,255,0.12)',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 18 18" fill="none">
          <path d="M9 1.5L16 5.5V12.5L9 16.5L2 12.5V5.5L9 1.5Z" stroke="rgba(103,213,255,0.9)" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="9" cy="9" r="2.5" fill="rgba(103,213,255,0.5)" />
        </svg>
      </div>

      <div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: 'rgba(103,213,255,0.25)',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          404
        </div>
        <h1
          style={{
            margin: '12px 0 8px',
            fontSize: 22,
            fontWeight: 700,
            color: '#d6f6ff',
            textShadow: '0 0 20px rgba(103,213,255,0.2)',
          }}
        >
          Page not found
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#9fefff', opacity: 0.65, maxWidth: 360 }}>
          This route doesn't exist in Mission Control. Check the URL or navigate back to the dashboard.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link
          href="/"
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: '1px solid rgba(103,213,255,0.35)',
            background: 'rgba(103,213,255,0.10)',
            color: 'var(--accent, #67d5ff)',
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          → Dashboard
        </Link>
        <Link
          href="/systems"
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            color: '#9fefff',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Systems
        </Link>
        <Link
          href="/teams"
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            color: '#9fefff',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Team
        </Link>
      </div>

      <div style={{ fontSize: 11, color: 'rgba(103,213,255,0.35)', fontFamily: 'ui-monospace, monospace' }}>
        MISSION CONTROL · v2.0
      </div>
    </main>
  );
}
