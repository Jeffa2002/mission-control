import { requireSessionAuth } from '../_session-auth';
import { loadUsage } from './usage-model';
export const dynamic = 'force-dynamic'; export const runtime = 'nodejs';
export async function GET(req: Request) {
  const authErr = requireSessionAuth(req); if (authErr) return authErr;
  const value = new URL(req.url).searchParams.get('range');
  const range = value === '1h' || value === '24h' || value === '7d' || value === '90d' || value === 'all' ? value : '30d';
  try { return Response.json(await loadUsage(range), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
