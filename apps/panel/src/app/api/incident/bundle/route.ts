import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { requireSessionAuth } from '../../_session-auth';
import { redactIncidentText } from './incident-bundle-model';

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function GET(req: Request) {
  const authErr = requireSessionAuth(req);
  if (authErr) return authErr;

  try {
    const url = new URL(req.url);
    const minutes = Math.min(240, Math.max(5, Number(url.searchParams.get('minutes') || '30')));

    const zip = new JSZip();
    zip.file('README.txt', `Mission Control incident bundle\nGenerated: ${new Date().toISOString()}\nWindow: last ${minutes} minutes\nContents are allowlisted and redacted. Raw configuration, container state, and secrets are intentionally excluded.\n`);

    // Mission Control audit tail
    const audit = await readFile('/workspace/mission-control/runtime/audit.log', 'utf-8').catch(() => '');
    if (audit) {
      const lines = audit.split('\n').filter(Boolean);
      zip.file('mission-control/audit-tail.jsonl', redactIncidentText(lines.slice(-200).join('\n')) + '\n');
    }

    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const filename = safeName(`incident_${new Date().toISOString()}_${minutes}m.zip`);

    return new NextResponse(out.buffer as any, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store, private',
      },
    });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
