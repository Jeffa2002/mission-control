'use client';

import { useEffect, useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

type Country = { code: string; name: string; count: number; active?: boolean };

type GeoResponse = {
  countries: Country[];
  total: number;
  topCountries: Country[];
  activeCountries: Country[];
};

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const COLORS = {
  empty: '#1f2937',
  low: '#7c2d12',
  medium: '#dc2626',
  high: '#ef4444',
  veryHigh: '#fbbf24',
  border: 'rgba(255,255,255,0.08)',
};

function flagEmoji(code: string) {
  if (code.length !== 2) return '🏳️';
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function colorForCount(count: number, max: number) {
  if (!count) return COLORS.empty;
  const ratio = count / Math.max(max, 1);
  if (ratio >= 0.75) return COLORS.veryHigh;
  if (ratio >= 0.45) return COLORS.high;
  if (ratio >= 0.2) return COLORS.medium;
  return COLORS.low;
}

export function AttackMap() {
  const [data, setData] = useState<GeoResponse>({ countries: [], total: 0, topCountries: [], activeCountries: [] });
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<Country | null>(null);
  const [world, setWorld] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch('/api/security/geo', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (alive) setData(j);
        }
      } catch {
        // silent
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((j) => { if (alive) setWorld(j); })
      .catch(() => { if (alive) setWorld(null); });
    return () => { alive = false; };
  }, []);

  const max = useMemo(() => Math.max(...data.countries.map((c) => c.count), 0), [data.countries]);

  const countries = useMemo(() => {
    if (!world) return [] as any[];
    const obj = feature(world, world.objects.countries) as any;
    return obj.features ?? [];
  }, [world]);

  const projection = useMemo(() => geoMercator().scale(145).translate([410, 240]), []);
  const path = useMemo(() => geoPath(projection as any), [projection]);

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2, color: '#9fefff', opacity: 0.9, marginBottom: 6 }}>ATTACK INTELLIGENCE</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{data.total.toLocaleString()} attacks</div>
          <div style={{ color: '#9ca3af', fontSize: 12 }}>Country-level source heatmap from recent SSH authentication activity.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 0.8fr)', gap: 16, alignItems: 'stretch' }}>
        <div style={{ position: 'relative', minHeight: 420, borderRadius: 16, border: `1px solid ${COLORS.border}`, background: 'linear-gradient(180deg, rgba(17,24,39,0.95), rgba(3,7,18,0.95))', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top, rgba(239,68,68,0.12), transparent 50%)' }} />
          {hovered && (
            <div style={{ position: 'absolute', zIndex: 2, left: 16, top: 16, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(9, 9, 11, 0.94)', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
              <div style={{ fontWeight: 700 }}>{hovered.name} ({hovered.code})</div>
              <div style={{ color: '#fca5a5', fontSize: 12 }}>{hovered.count.toLocaleString()} attacks</div>
            </div>
          )}
          <svg viewBox="0 0 820 420" style={{ width: '100%', height: '100%', position: 'relative', zIndex: 1 }}>
            {countries.map((geo: any) => {
              const code = geo.properties?.ISO_A2 || geo.properties?.iso_a2 || geo.id;
              const found = data.countries.find((c) => c.code === code);
              const fill = found ? colorForCount(found.count, max) : COLORS.empty;
              const d = path(geo);
              if (!d) return null;
              return (
                <path
                  key={geo.id}
                  d={d}
                  fill={fill}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={0.6}
                  onMouseEnter={() => setHovered(found ?? null)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ transition: 'fill 160ms ease, opacity 160ms ease', cursor: found ? 'pointer' : 'default' }}
                />
              );
            })}

            {data.activeCountries.slice(0, 6).map((c, idx) => {
              const geo = countries.find((g: any) => (g.properties?.ISO_A2 || g.properties?.iso_a2 || g.id) === c.code);
              const centroid = geo ? path.centroid(geo) : null;
              if (!centroid) return null;
              return (
                <g key={c.code} transform={`translate(${centroid[0]},${centroid[1]})`} opacity={0.95}>
                  <circle r={4} fill="#fbbf24">
                    <animate attributeName="r" values="3;8;3" dur="1.8s" repeatCount="indefinite" begin={`${idx * 0.2}s`} />
                    <animate attributeName="opacity" values="1;0.25;1" dur="1.8s" repeatCount="indefinite" begin={`${idx * 0.2}s`} />
                  </circle>
                </g>
              );
            })}
          </svg>
          {loading && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9ca3af', background: 'rgba(3,7,18,0.55)' }}>Loading attack map…</div>}
        </div>

        <aside style={{ borderRadius: 16, border: `1px solid ${COLORS.border}`, background: 'rgba(10,10,10,0.65)', padding: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: 1.5, color: '#9fefff', marginBottom: 12 }}>TOP COUNTRIES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.topCountries.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 13 }}>No geo data available yet.</div>
            ) : data.topCountries.map((c) => {
              const pct = max ? (c.count / max) * 100 : 0;
              return (
                <div key={c.code} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                    <span style={{ color: '#f3f4f6' }}>{flagEmoji(c.code)} {c.name}</span>
                    <span style={{ color: '#fca5a5', fontWeight: 700 }}>{c.count.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #7c2d12, #ef4444, #fbbf24)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
