import { requireSessionAuth } from '../../_session-auth';
import { loadUsage, serializeUsageSse } from '../usage-model';
export const dynamic = 'force-dynamic'; export const runtime = 'nodejs';
export async function GET(req: Request) {
  const authErr = requireSessionAuth(req); if (authErr) return authErr;
  const value = new URL(req.url).searchParams.get('range');
  const range = value === '1h' || value === '7d' || value === '90d' || value === 'all' ? value : '30d';
  const encoder = new TextEncoder(); let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => controller.enqueue(encoder.encode(serializeUsageSse(await loadUsage(range))));
      await send(); timer = setInterval(() => void send().catch(() => {}), 15_000);
      req.signal.addEventListener('abort', () => { if (timer) clearInterval(timer); try { controller.close(); } catch {} }, { once: true });
    }, cancel() { if (timer) clearInterval(timer); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
