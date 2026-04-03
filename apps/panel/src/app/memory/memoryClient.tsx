'use client';

import { useEffect, useMemo, useState } from 'react';
import { Nav } from '../nav';

type DocMeta = {
  id: string;
  title: string;
  kind: 'MEMORY' | 'DAILY';
  updatedAt: string;
};

type Hit = DocMeta & { snippet: string };

type Doc = DocMeta & { content: string };

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Perth' });
  } catch {
    return iso;
  }
}

export default function MemoryClient() {
  const [q, setQ] = useState('');
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [active, setActive] = useState<Doc | null>(null);
  const [err, setErr] = useState<string>('');

  async function loadList() {
    setErr('');
    const res = await fetch('/api/memory', { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.error || 'Failed');
    setDocs(j.docs || []);
  }

  async function loadDoc(id: string) {
    setErr('');
    const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.error || 'Failed');
    setActive(j.doc);
  }

  useEffect(() => {
    loadList().catch((e) => setErr(String(e?.message || e)));
  }, []);

  // Search with debounce
  useEffect(() => {
    const t = setTimeout(async () => {
      const query = q.trim();
      if (!query) {
        setHits(null);
        return;
      }
      try {
        setErr('');
        const res = await fetch(`/api/memory?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j.error || 'Failed');
        setHits(j.hits || []);
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useMemo(() => {
    if (hits) return hits.map((h) => ({ ...h, title: `${h.title}` }));
    return docs;
  }, [docs, hits]);

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
      <div style={{ letterSpacing: 3, fontSize: 12, color: '#7ce8ff', opacity: 0.9 }}>MISSION CONTROL</div>
      <h1 style={{ margin: '6px 0 0', fontSize: 28, textShadow: '0 0 18px rgba(0,220,255,0.25)' }}>
        Memory
      </h1>
      <Nav />
      <p style={{ marginTop: 14, color: '#9fefff', maxWidth: 980, lineHeight: 1.6 }}>
        Browse and search Bazza&rsquo;s long-term memory and daily logs. Click a document to view it.
      </p>

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search memories…"
          style={{
            flex: 1,
            minWidth: 260,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(124,232,255,0.18)',
            background: 'rgba(0,0,0,0.25)',
            color: '#d6f6ff',
            outline: 'none',
            fontWeight: 700,
          }}
        />
        <button
          onClick={() => {
            setQ('');
            setHits(null);
          }}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(124,232,255,0.18)',
            background: 'rgba(0,0,0,0.18)',
            color: '#9fefff',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>

      {err ? (
        <div style={{ marginTop: 12, color: '#ff8fb1', fontWeight: 800 }}>{err}</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14, marginTop: 14 }}>
        <div
          style={{
            border: '1px solid rgba(124,232,255,0.16)',
            borderRadius: 16,
            background: 'rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 12, borderBottom: '1px solid rgba(124,232,255,0.12)', color: '#9fefff', fontWeight: 900 }}>
            Documents ({list.length})
          </div>
          <div style={{ maxHeight: '65vh', overflow: 'auto' }}>
            {list.map((d) => (
              <button
                key={d.id}
                onClick={() => loadDoc(d.id).catch((e) => setErr(String(e?.message || e)))}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 12,
                  border: 'none',
                  borderTop: '1px solid rgba(124,232,255,0.10)',
                  background: active?.id === d.id ? 'rgba(0,200,255,0.12)' : 'transparent',
                  color: '#d6f6ff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>{d.title}</div>
                  <span style={{ fontSize: 12, color: '#9fefff', opacity: 0.8 }}>{d.kind}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#9fefff', opacity: 0.8 }}>
                  Updated {fmt(d.updatedAt)}
                </div>
                {'snippet' in d ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#9fefff', opacity: 0.9, lineHeight: 1.5 }}>
                    {(d as any).snippet}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            border: '1px solid rgba(124,232,255,0.16)',
            borderRadius: 16,
            background: 'rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 12, borderBottom: '1px solid rgba(124,232,255,0.12)', color: '#9fefff', fontWeight: 900 }}>
            {active ? active.title : 'Select a document'}
          </div>
          <div style={{ padding: 14, maxHeight: '65vh', overflow: 'auto' }}>
            {active ? (
              <article
                style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.65,
                  color: '#d6f6ff',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: 13,
                }}
              >
                {active.content}
              </article>
            ) : (
              <div style={{ color: '#9fefff', opacity: 0.9, lineHeight: 1.6 }}>
                Tip: search for things like <code style={{ color: '#d6f6ff' }}>AssetX</code>, <code style={{ color: '#d6f6ff' }}>Stripe</code>, <code style={{ color: '#d6f6ff' }}>demo@</code>, or a date.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
