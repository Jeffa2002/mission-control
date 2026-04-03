/**
 * GET /api/grafana-panel?uid=<dash_uid>&panelId=<n>&from=now-6h&to=now&w=1200&h=400
 *
 * Server-side proxy for Grafana panel PNG renders.
 * Injects a read-only Service Account Bearer token so the browser never
 * needs its own Grafana session.
 *
 * Env:
 *   GRAFANA_SA_TOKEN  — Grafana Service Account token (Viewer role).
 *   GRAFANA_BASE_URL  — Grafana origin, e.g. https://bazza.taile9fed9.ts.net:3000
 *                       Falls back to the compile-time default in embeds.ts.
 *
 * This endpoint is protected by the session middleware (mc_auth cookie).
 *
 * Usage in components:
 *   <img src="/api/grafana-panel?uid=nodeexp&panelId=2&from=now-6h&to=now" />
 */

import { NextResponse } from 'next/server';
import { GRAFANA_BASE } from '../../embeds';

const DEFAULT_W = 1200;
const DEFAULT_H = 400;

export async function GET(req: Request) {
  const token    = process.env.GRAFANA_SA_TOKEN;
  const baseUrl  = process.env.GRAFANA_BASE_URL ?? GRAFANA_BASE;

  if (!token) {
    return new NextResponse(
      'GRAFANA_SA_TOKEN not configured. Set it to a Grafana Viewer Service Account token.',
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const uid     = searchParams.get('uid')     ?? '';
  const panelId = searchParams.get('panelId') ?? '';
  const from    = searchParams.get('from')    ?? 'now-6h';
  const to      = searchParams.get('to')      ?? 'now';
  const w       = Math.min(2400, Math.max(200, Number(searchParams.get('w') || DEFAULT_W)));
  const h       = Math.min(1600, Math.max(100, Number(searchParams.get('h') || DEFAULT_H)));
  const orgId   = searchParams.get('orgId')   ?? '1';

  if (!uid) {
    return new NextResponse('uid is required', { status: 400 });
  }

  // Grafana render API: /render/d-solo/<uid>/<slug>?panelId=<n>&...
  // The slug is unused by Grafana (it's cosmetic), but panelId is required.
  const renderParams = new URLSearchParams({
    orgId,
    panelId,
    from,
    to,
    width:  String(w),
    height: String(h),
    tz:     'Australia/Perth',
  });

  const renderUrl = `${baseUrl}/render/d-solo/${uid}/_?${renderParams}`;

  try {
    const upstream = await fetch(renderUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:        'image/png',
      },
      // Next.js: don't cache — panel data changes continuously.
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      return new NextResponse(
        `Grafana render error ${upstream.status}: ${body}`,
        { status: upstream.status },
      );
    }

    const imageBuffer = await upstream.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type':  'image/png',
        'Cache-Control': 'no-store',
        // Safety: no credentials leak in this response
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    return new NextResponse(String(e?.message || e), { status: 502 });
  }
}
