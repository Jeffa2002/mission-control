'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge, card, card2, muted } from '../../components/ops-ui';

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

  const dailyCount = docs.filter((d) => d.kind === 'DAILY').length;
  const memoryCount = docs.filter((d) => d.kind === 'MEMORY').length;
  const latestDoc = docs[0];
  const activeLines = active?.content.split('\n').filter(Boolean).length ?? 0;

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle
            title="Memory"
            subtitle="Long-term context and daily logs, surfaced as a reviewable operational archive."
          />
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={`${memoryCount} curated`} status="info" />
            <StatusBadge label={`${dailyCount} daily logs`} status="neutral" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className={card2 + ' p-4'}>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Archive</div>
            <div className="mt-2 text-2xl font-bold text-slate-100">{docs.length}</div>
            <div className={muted}>Indexed documents available</div>
          </div>
          <div className={card2 + ' p-4'}>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Latest Write</div>
            <div className="mt-2 truncate text-[15px] font-semibold text-slate-100">{latestDoc?.title ?? 'No memory files'}</div>
            <div className={muted}>{latestDoc ? fmt(latestDoc.updatedAt) : 'Waiting for data'}</div>
          </div>
          <div className={card2 + ' p-4'}>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Selection</div>
            <div className="mt-2 truncate text-[15px] font-semibold text-slate-100">{active?.title ?? 'No document selected'}</div>
            <div className={muted}>{active ? `${activeLines} populated lines` : 'Choose from the archive stream'}</div>
          </div>
        </div>

        <div className={card + ' p-3'}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search memory, decisions, projects, dates"
              className="min-h-[38px] min-w-[240px] flex-1 rounded-[10px] border border-white/10 bg-black/20 px-3 text-sm font-semibold text-slate-100 outline-none transition focus:border-[rgba(103,213,255,0.42)]"
            />
            <button
              onClick={() => {
                setQ('');
                setHits(null);
              }}
              className="min-h-[38px] rounded-[10px] border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-200 transition hover:border-[rgba(103,213,255,0.35)] hover:bg-[rgba(103,213,255,0.08)]"
              type="button"
            >
              Clear
            </button>
          </div>
          {hits ? (
            <div className="mt-2 text-xs text-slate-400">{hits.length} search result{hits.length === 1 ? '' : 's'} for &ldquo;{q.trim()}&rdquo;</div>
          ) : null}
        </div>

        {err ? (
          <div className="rounded-[12px] border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-3 text-sm font-semibold text-[var(--sev-critical)]">{err}</div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <div className={card + ' overflow-hidden'}>
            <div className="border-b border-white/10 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Document Stream</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">{list.length} visible</div>
            </div>
            <div className="max-h-[66vh] overflow-auto">
              {list.map((d) => (
                <button
                  key={d.id}
                  onClick={() => loadDoc(d.id).catch((e) => setErr(String(e?.message || e)))}
                  className="block w-full border-t border-white/10 px-4 py-3 text-left transition hover:bg-white/[0.035]"
                  style={{ background: active?.id === d.id ? 'rgba(103,213,255,0.10)' : undefined }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-100">{d.title}</div>
                      <div className="mt-1 text-xs text-slate-400">Updated {fmt(d.updatedAt)}</div>
                    </div>
                    <StatusBadge label={d.kind} status={d.kind === 'MEMORY' ? 'info' : 'neutral'} />
                  </div>
                  {'snippet' in d ? (
                    <div className="mt-2 line-clamp-3 text-xs leading-5 text-slate-300">
                      {(d as any).snippet}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className={card + ' overflow-hidden'}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Memory Pane</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{active ? active.title : 'Select a document'}</div>
              </div>
              {active ? <StatusBadge label={active.kind} status={active.kind === 'MEMORY' ? 'info' : 'neutral'} /> : null}
            </div>
            <div className="max-h-[66vh] overflow-auto p-4">
              {active ? (
                <article className="whitespace-pre-wrap font-mono text-[13px] leading-7 text-slate-200">
                  {active.content}
                </article>
              ) : (
                <div className="rounded-[12px] border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm leading-6 text-slate-400">
                  Select a memory file to inspect its raw context. Search narrows the archive without changing the underlying files.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
