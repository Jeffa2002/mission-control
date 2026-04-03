import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = '/workspace/mission-control/runbooks';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get('name');

    if (name) {
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, '');
      const p = path.join(DIR, safe);
      const content = await readFile(p, 'utf-8');
      return NextResponse.json({ ok: true, name: safe, content });
    }

    const files = (await readdir(DIR).catch(() => []))
      .filter((f) => f.endsWith('.md'))
      .sort();

    return NextResponse.json({ ok: true, files });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
