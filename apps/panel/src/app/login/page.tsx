'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [user, setUser] = useState('jeffa');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user, password }),
    });

    if (!res.ok) {
      setError('Incorrect username or password.');
      return;
    }

    window.location.href = '/';
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#d6f6ff',
        background:
          'radial-gradient(1200px 700px at 20% 10%, rgba(0,255,255,0.14), transparent 60%), radial-gradient(1000px 600px at 80% 30%, rgba(0,140,255,0.12), transparent 55%), radial-gradient(900px 600px at 50% 80%, rgba(140,0,255,0.10), transparent 60%), linear-gradient(180deg, #040814 0%, #030513 55%, #02030a 100%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          borderRadius: 16,
          border: '1px solid rgba(124,232,255,0.18)',
          background: 'rgba(4,8,20,0.70)',
          boxShadow: '0 0 60px rgba(0,160,255,0.12)',
          padding: '32px 28px',
        }}
      >
        <div style={{ letterSpacing: 3, fontSize: 11, color: '#7ce8ff', opacity: 0.9, marginBottom: 8 }}>
          MISSION CONTROL
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, textShadow: '0 0 18px rgba(0,220,255,0.25)' }}>
          Sign in
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#9fefff', opacity: 0.75 }}>
          Private panel. Credentials required.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#9fefff', opacity: 0.9 }}>
            Username
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(124,232,255,0.22)',
                background: 'rgba(0,0,0,0.35)',
                color: '#d6f6ff',
                fontSize: 14,
                outline: 'none',
              }}
              autoComplete="username"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#9fefff', opacity: 0.9 }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(124,232,255,0.22)',
                background: 'rgba(0,0,0,0.35)',
                color: '#d6f6ff',
                fontSize: 14,
                outline: 'none',
              }}
              autoComplete="current-password"
            />
          </label>

          <button
            type="submit"
            style={{
              marginTop: 4,
              padding: '11px 14px',
              borderRadius: 10,
              border: '1px solid rgba(0,200,255,0.35)',
              background: 'rgba(0,160,220,0.18)',
              color: '#d6f6ff',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            Sign in
          </button>

          {error ? (
            <div
              style={{
                marginTop: 2,
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,80,120,0.35)',
                background: 'rgba(255,40,90,0.08)',
                color: '#ff7aa8',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}
