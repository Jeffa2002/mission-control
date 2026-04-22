import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { sh } from '../../_util';
import { requireSessionAuth } from '../../_session-auth';

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
    zip.file('README.txt', `CUTLINE/Mission Control incident bundle\nGenerated: ${new Date().toISOString()}\nWindow: last ${minutes} minutes\n`);

    // Bot logs
    const botLogs = await sh('docker', ['logs', '--since', `${minutes}m`, 'crypto-bot'], { timeoutMs: 60_000 });
    zip.file('crypto-bot/logs.txt', botLogs);

    // Bot state + config
    const state = await sh('docker', ['exec', 'crypto-bot', 'cat', '/data/state.json'], { timeoutMs: 10_000 }).catch(() => '');
    if (state) zip.file('crypto-bot/state.json', state);

    const botCfg = await readFile('/workspace/crypto-bot/config/bot-config.json', 'utf-8').catch(() => '');
    if (botCfg) zip.file('crypto-bot/bot-config.json', botCfg);

    const compose = await readFile('/workspace/crypto-bot/docker-compose.yml', 'utf-8').catch(() => '');
    if (compose) zip.file('crypto-bot/docker-compose.yml', compose);

    // Mission Control audit tail
    const audit = await readFile('/workspace/mission-control/runtime/audit.log', 'utf-8').catch(() => '');
    if (audit) {
      const lines = audit.split('\n').filter(Boolean);
      zip.file('mission-control/audit-tail.jsonl', lines.slice(-200).join('\n') + '\n');
    }

    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const filename = safeName(`incident_${new Date().toISOString()}_${minutes}m.zip`);

    return new NextResponse(out.buffer as any, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 500 });
  }
}
