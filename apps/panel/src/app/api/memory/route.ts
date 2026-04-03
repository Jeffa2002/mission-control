import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireSessionAuth } from '../_session-auth';

const ROOT = '/workspace-data';

type Doc = {
  id: string;
  title: string;
  filePath: string;
  kind: 'MEMORY' | 'DAILY';
  updatedAt: string;
  content: string;
};

function scoreMatch(content: string, q: string) {
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;
  // return a small snippet around the match
  const start = Math.max(0, idx - 120);
  const end = Math.min(content.length, idx + q.length + 200);
  const snippet = content.slice(start, end);
  return { idx, snippet };
}

async function readIfExists(p: string) {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const docId = (url.searchParams.get('id') || '').trim();

  const memoryMdPath = path.join(ROOT, 'MEMORY.md');
  const dailyDir = path.join(ROOT, 'memory');

  // Single doc fetch
  if (docId) {
    const safe = docId.replace(/[^a-zA-Z0-9._-]/g, '');
    const resolved = safe === 'MEMORY.md'
      ? memoryMdPath
      : path.join(dailyDir, safe);

    const content = await readIfExists(resolved);
    if (content == null) return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

    const st = await fs.stat(resolved);
    const kind: Doc['kind'] = safe === 'MEMORY.md' ? 'MEMORY' : 'DAILY';

    return NextResponse.json({
      ok: true,
      doc: {
        id: safe,
        title: safe === 'MEMORY.md' ? 'MEMORY.md (long-term)' : safe,
        filePath: resolved,
        kind,
        updatedAt: st.mtime.toISOString(),
        content,
      } satisfies Doc,
    });
  }

  // List docs
  const docs: Omit<Doc, 'content'>[] = [];

  const mem = await readIfExists(memoryMdPath);
  if (mem != null) {
    const st = await fs.stat(memoryMdPath);
    docs.push({
      id: 'MEMORY.md',
      title: 'MEMORY.md (long-term)',
      filePath: memoryMdPath,
      kind: 'MEMORY',
      updatedAt: st.mtime.toISOString(),
    });
  }

  let dailyFiles: string[] = [];
  try {
    dailyFiles = await fs.readdir(dailyDir);
  } catch {
    dailyFiles = [];
  }

  for (const f of dailyFiles) {
    if (!f.endsWith('.md')) continue;
    const fp = path.join(dailyDir, f);
    try {
      const st = await fs.stat(fp);
      docs.push({
        id: f,
        title: f,
        filePath: fp,
        kind: 'DAILY',
        updatedAt: st.mtime.toISOString(),
      });
    } catch {
      // ignore
    }
  }

  // Sort newest first (daily files naturally sort by date, but mtime is fine)
  docs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  // Search
  if (q) {
    const hits: any[] = [];
    for (const d of docs) {
      const content = await readIfExists(d.filePath);
      if (!content) continue;
      const m = scoreMatch(content, q);
      if (!m) continue;
      hits.push({
        ...d,
        matchIndex: m.idx,
        snippet: m.snippet,
      });
    }
    hits.sort((a, b) => a.matchIndex - b.matchIndex);
    return NextResponse.json({ ok: true, query: q, hits });
  }

  return NextResponse.json({ ok: true, docs });
}
