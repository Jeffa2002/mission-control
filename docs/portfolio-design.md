# Design Brief — `/portfolio` (Mission Control panel)

Designed by Nova, 2026-08-27. Implementation: PR via Dev; this file is the source of truth for scope.

**Purpose:** one rollup answering "how is each *product* doing?" — live endpoint status, 24h uptime, deploy activity, and risk tier, for all 25 registered products. Honest coverage is a hard rule: no signal → visibly `unknown`/"no live telemetry", never implied green.

**Established patterns to reuse:** header (eyebrow + h1 + one-line copy), posture strip (`/deploys` `.posture`), panel grid + sticky inspector (`/estate`), `data-tone` badge with 6px dot, tokens via `src/lib/status.ts` only, module CSS, body ≥11px, targets ≥40px, muted `var(--text-3)`.

## 1. Page hierarchy

```
[eyebrow: PRODUCT ROLLUP]  Portfolio                [Updated 2m ago] [Refresh]
One line: Live status, 24h uptime, and deploy activity across the product estate.

[Posture strip — 5 tiles, equal width, border-separated like /deploys .posture]
 NOMINAL n        NEEDS ATTENTION n      INCIDENT n        NO TELEMETRY n      MONITORED n/25
 (sev-healthy)    (sev-warning)          (sev-critical)    (neutral, dashed)   (neutral)

[Toolbar — min-height 40px controls]
 Filter segmented: All | Needs attention | Incidents | No telemetry   (aria-pressed)
 Risk select: All risk / critical / high / medium / standard
 Visibility select: All / public / private / local-only
 Sort select (right-aligned): Status (default) | Risk | Uptime 24h | Name | Last deploy

[Product card grid — grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap 12px]
```

**Tile thresholds (documented in copy, not hidden):**
- Nominal/Attention/Incident = tone derivation in §2.
- **No telemetry** = product with zero live signals (no endpoint mapping, no fleet target, no deploys in 30d).
- **Monitored n/25** = products with ≥1 live signal; denominator is the registry count.
- Tile click applies the matching filter (tiles are buttons with `aria-pressed` mirroring the active filter).

**Card content (per product):**
```
[Tone badge: dot + label]  VenConX                    [risk pill: HIGH]
up · 142ms · uptime 99.9% · p95 380ms          ← endpoint+fleet line (mono, ≥11px)
✓ deployed 2h ago · main · Jane Doe            ← last deploy line (status glyph + text)
● signals: endpoint · uptime · deploys         ← coverage markers, 10px neutral
```
- Tone badge = derived product tone (§2). Risk pill is always neutral border, colored text by tier (critical→`--sev-critical` text only when no incident tone is present — avoid two reds fighting; if product tone is incident, risk pill drops to neutral text).
- Deploy status glyph is text-paired (`✓ deployed`, `✗ failed`, `↻ deploying`) — never color-only.
- Missing signal → its line renders as `—` + reason: `no endpoint mapped`, `no probe target`, `no deploys (30d)`.
- Multi-endpoint products (ordantra app+web, projenta app+web, queuem8 app+web): one card per product; endpoint line shows worst endpoint + count if >1 (`2 endpoints · worst: web down`).
- `localAliases` shown in inspector only, not on cards (density).

**Sort default:** tone severity desc → risk tier desc (critical>high>medium>standard) → name asc. "Needs attention first, then what matters, then alphabetical." Uptime sort = asc (worst first), nulls last. Risk sort = tier desc then tone desc.

## 2. Per-product tone derivation

Tones: `nominal | attention | incident | unknown` → rendered via `status.ts` mapping nominal→`--sev-healthy`, attention→`--sev-warning`, incident→`--sev-critical`, unknown→`--sev-neutral`. Compute the worst signal; **pessimism wins disagreements**.

**Signal A — Endpoint (effectx), per mapped endpoint; product takes the worst:**

| Condition | Contribution |
|---|---|
| `status: down` | **incident** |
| `status: degraded` | attention |
| `ssl.valid === false` | **incident** (user-facing breakage; matches Overview queue semantics) |
| `ssl.valid && daysRemaining < 14` | attention |
| `status: up`, TLS ok | nominal |
| `status: unknown` | contributes nothing; recorded as a gap |

**Signal B — Fleet uptime (24h window, per mapped target; worst wins):**

| Condition | Contribution |
|---|---|
| `consecutive_failures >= 3` | **incident** (fresh failure outranks the 24h average) |
| `uptime_24h < 95` | **incident** |
| `uptime_24h >= 95 && < 99.5` | attention |
| `uptime_24h >= 99.5 && p95_24h > 2000` | attention (latency degradation) |
| `uptime_24h >= 99.5 && p95 <= 2000` | nominal |
| `uptime_24h === null` / `probes_24h === 0` | no signal (gap, not nominal) |

**Signal C — Last deploy (latest per app):**

| Condition | Contribution |
|---|---|
| latest `status: failure` | attention (a failed deploy is a risk condition, not an outage by itself) |
| latest `status: running` | none — informational `deploying` badge only |
| latest `status: success` | none |
| no deploys in 30d | gap, not a tone |

**Combination rules:**
1. `tone = max severity(A, B, C)` with incident > attention > nominal.
2. **Disagreement policy:** never average, never trust the better source. Endpoint `up` + fleet `uptime_24h < 95` → incident; endpoint `down` + fleet 100% → incident (fleet is a trailing window, endpoint is now). When sources disagree by ≥2 severity steps, set `signalsDisagree: true` and surface "signals disagree" in card coverage line and inspector (§3).
3. **Missing policy:** absent signals are skipped, not treated as nominal. If a product has ≥1 signal and all present signals are nominal → `nominal`, with coverage markers showing what's *not* watched. If **zero** signals exist → `unknown` + label "No live telemetry".
4. `unknown` status from effectx counts as *no endpoint signal* (it is not evidence of health).

## 3. Inspector (product selected)

Desktop: sticky right rail, `top: 78px` (estate pattern), workspace grid `minmax(0,1fr) 360px`. Mobile: bottom sheet (§5). Content, top to bottom:

1. **Identity block:** name (17px semibold), aliases line (`also: helix`), pills: visibility, language, risk tier; repo (mono, linked), default branch.
2. **Verdict:** product tone badge + `toneReasons[]` rendered as a short list ("Endpoint venconx-web is down", "24h uptime 93.2%"). If `signalsDisagree`: a neutral-bordered note: "Signals disagree — pessimistic reading shown."
3. **Signal breakdown — one row group per source, each showing raw values + its own tone + as-of timestamp:**
   - *Endpoint:* per endpoint: name, status badge, latencyMs, TLS (valid / days remaining), checkedAt.
   - *Uptime:* target, uptime_24h (1dp), p95_24h, probes ok/total, latest http_code, consecutive_failures.
   - *Deploys:* last 5: status glyph, branch, short commit, triggeredBy, relative time, durationS; link "All deploys →" → `/deploys`.
   - Any missing source renders its group as a dashed-border block: "No probe target registered" + why (visibility local-only / no endpoint mapped).
4. **Coverage summary:** explicit checklist — endpoint ✓/✗, probe ✓/✗, deploys ✓/✗. This is the honesty contract made visible.
5. **Actions:** Open app (external, only if endpoint exists), App Health →, Fleet Health →, Deploys →. All ≥40px.

Selection state: card gets `data-selected` inset-left accent (incidents pattern); close button (40×40) returns to unselected state. Unselected inspector shows the standard placeholder ("Select a product…").

## 4. Empty / degraded / error states

- **Initial loading:** skeleton cards matching card geometry (badge pill, 3 lines), posture strip shows `—`. No layout jump.
- **API total failure (`/api/portfolio` 5xx/network):** full-width error panel: title "Portfolio unavailable", one-line reason, Retry button (≥40px), and if a previous payload exists: "Retained last good data from HH:MM" + render it dimmed (overview `errorBanner` pattern).
- **Partial upstream failure** (e.g. fleet-health source died inside the aggregator): page renders; amber banner `role="status"`: "Partial data — fleet uptime unavailable; tones may understate issues." Affected signal shows `—` + `source unavailable`, and affected products get a `partial` coverage flag shown in their coverage line.
- **Filter empty:** dashed panel: "No products match" + the active filter summary + "Clear filters" button.
- **Registry-only products (Hearth et al.):** not an error — they render as `unknown` cards with "No live telemetry · local-only" copy. Grouped last in default sort.

## 5. Mobile behavior

Breakpoints match the app: 1040px, 760px, 520px.
- **≤1040px:** workspace collapses to single column; inspector becomes a fixed sheet — `position: fixed; inset: 0 0 0 auto; width: min(430px, 100vw)`, slide-in, close button + backdrop-tap dismiss, Escape closes, focus trapped then restored (copy the estate/activity drawer pattern — `role="dialog"`, `aria-modal`, focus management).
- **≤760px:** posture strip → 2-col grid (No telemetry + Monitored wrap to row 2); toolbar wraps, selects full-width; card grid 1-col; deploy line truncates with ellipsis before latency line does.
- **≤520px:** posture strip stays 2-col, padding 14px; coverage markers line drops (info remains in inspector).
- All tap targets ≥40px; `padding-bottom: env(safe-area-inset-bottom)` when sheet open.
- No sticky inspector on mobile; no hover-only affordances anywhere.

## 6. `/api/portfolio` contract

`GET /api/portfolio` → `200 application/json`, session-auth like sibling routes. Aggregates registry + effectx + deploys + fleet-health server-side; derives tone server-side so mobile and future Telegram surfaces share one truth.

```jsonc
{
  "generatedAt": "2026-07-13T04:12:00Z",
  "sources": {                       // upstream health of the aggregation itself
    "effectx":   { "ok": true },
    "fleet":     { "ok": false, "error": "probe log unreadable" },
    "deploys":   { "ok": true }
  },
  "summary": {
    "total": 25, "nominal": 12, "attention": 3, "incident": 1,
    "unknown": 9, "monitored": 16,
    "deploys24h": 7, "deploysFailed24h": 1, "tlsExpiring14d": 2
  },
  "products": [ /* one per registry entry, always all 25 */ {
    "id": "ordantra",
    "name": "Ordantra",
    "aliases": ["helix"],
    "repo": "Jeffa2002/ordantra",          // null for local-only
    "visibility": "private",                // public | private | local-only
    "language": "TypeScript",
    "defaultBranch": "main",
    "risk": "medium",                       // critical | high | medium | standard
    "tone": "attention",                    // nominal | attention | incident | unknown
    "toneReasons": ["Latest deploy failed 3h ago"],
    "signalsDisagree": false,
    "coverage": {
      "endpoint": true, "uptime": true, "deploys": true,
      "missing": [],                        // e.g. ["uptime"], humanised by UI
      "partial": []                         // sources present but failing, e.g. ["uptime"]
    },
    "endpoints": [                          // [] if none mapped
      { "appId": "ordantra-app", "name": "Ordantra API", "url": "https://…",
        "status": "up",                     // up | degraded | down | unknown
        "latencyMs": 142,                   // null if unknown
        "tls": { "valid": true, "daysRemaining": 211 },   // null if not reported
        "checkedAt": "2026-07-13T04:11:40Z" }
    ],
    "uptime": {                             // null if no probe target
      "target": "ordantra",
      "uptime24h": 99.9,                    // null if probes_24h === 0
      "p95Ms": 380,                         // null if no latency samples
      "probesOk": 286, "probesTotal": 287,
      "latestHttpCode": "200",
      "consecutiveFailures": 0,
      "asOf": "2026-07-13T04:10:00Z"
    },
    "deploy": {                             // null if none in 30d
      "status": "success",                  // success | failure | running
      "app": "ordantra", "branch": "main",
      "commit": "a1b2c3d", "commitMsg": "Fix queue retry",
      "triggeredBy": "Jeffa2002", "startedAt": "2026-07-12T14:02:00Z",
      "durationS": 96,
      "count24h": 2, "failed24h": 0
    }
  }]
}
```

**Implementation notes:**
- **Product↔signal mapping:** effectx app ids and fleet targets don't always equal registry ids. Create `src/lib/portfolio-map.mjs`: explicit `{ productId → { endpointAppIds: string[], fleetTargets: string[], deployApps: string[] } }`, seeded via `canonicalProjectId()` (handles `helix`→ordantra, `property-hub`→yielddock) with manual overrides for multi-endpoint products. Unmapped endpoints/targets should surface in `sources.warnings[]` so coverage gaps are auditable, not silent.
- Derivation in §2 lives in one pure function `derivePortfolioTone(product)` — unit-testable, and the UI must never re-derive.
- Server-side timeouts: each upstream fetch ≤4s; a failed source degrades to `sources[x].ok=false` + `coverage.partial`, never a 500, unless all three fail.
- Client: poll at 30s, paused on hidden tab; Refresh button + "Updated Xm ago" per overview convention; `aria-live="polite"` on the posture strip only (not per-card).
