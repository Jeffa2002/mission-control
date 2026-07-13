# Correlated Activity Timeline

A standalone, high-fidelity concept for `/activity`. It carries the Adaptive Operations Prism’s quiet material hierarchy into a cross-system operational timeline, with explicit evidence quality and relationship language. It does not modify the live panel or deploy anything.

## Preview

```bash
cd design/concepts/correlated-activity-timeline
python3 -m http.server 18083
```

Open `http://localhost:18083`. Use the state preview controls, select timeline/window rows, and use the inspector’s Evidence, Related and Raw fields tabs.

## Layout and interaction

Desktop holds a 338px evidence inspector alongside a main reading column:

1. Plain-language timeline posture and source coverage.
2. A compact 24-hour event-density ribbon with its exceptional window annotated.
3. Saved-view and multi-dimension filter concepts.
4. Correlation windows before individual events, so operators see context without mistaking proximity for cause.
5. Evidence-ordered timeline and source-coverage inventory.

An event selection updates the inspector without navigation. Inspector tabs distinguish normalised evidence, related entities/window basis and bounded raw fields. Relationship labels are strictly **Confirmed**, **Correlated**, or **Unknown**:

- **Confirmed:** direct source record or explicit linkage key.
- **Correlated:** a deterministic time/entity/window association only.
- **Unknown:** no supporting link or source coverage.

At **1180px**, inspector becomes a two-column context section. At **900px**, dense metadata wraps and coverage becomes two columns. At **620px**, filters scroll horizontally, event rows become mobile cards, and coverage becomes one column. Reduced-motion mode removes all transitions; no signal relies on motion or colour alone.

## Current data mapping

| Timeline region | Current source | Available fields / boundary |
| --- | --- | --- |
| Existing activity events | `GET /api/activity` | `id`, `ts`, `source`, `title`, `detail`, `severity`, `href` |
| Deploy events | `/api/activity` + `GET /api/deploys` | activity deploy event is derived from `id`, app, status, branch, commit/message, start/finish; full feed has `triggeredBy`, `durationS`, `runUrl` |
| Audit/actions | `/api/activity` + `GET /api/actions` | activity currently derives `action`, `detail`, result/error, auth method/actor; source audit records retain `ts`, idempotency key and extension fields |
| Agent events | `/api/activity` + `GET /api/agents/status` | status feed fields including `id`, label, status, busy, `lastSeen`, current task, restarts; current activity output does not canonicalise aliases |
| Health | `GET /api/health` | `overall`, `checks`, `checked_at`; not currently included by `/api/activity` |
| Prometheus alerts | `GET /api/alerts` | alert labels, annotations, state and `activeAt`; not currently included by `/api/activity` |
| Security | `GET /api/security` plus security subroutes | auth, nginx, firewall, Fail2ban, kernel/system and host reporting; not currently normalised into activity events |
| Incidents | current `/incidents` client derivation | incidents are derived from agent/health/alert data in the UI, not served as a dedicated incident event API |
| Estate | `GET /api/estate` | current smoke/repository state and checked time; no time-series event history |

## Capability and gap analysis

`/api/activity` currently merges exactly three source groups: audit log, deploy feed, and raw agent-status records. It sorts records by parsed timestamp and provides count/severity totals. It does not currently supply host, app, agent, type, environment, correlation IDs, source freshness, raw evidence, clusters, dedupe metadata, or errors per source.

**Supported now:** source-level event IDs for current activity, timestamps, source/title/detail/severity, deploy metadata via `/api/deploys`, health/alert/security snapshots via separate routes, and audited runbook intents.

**Future-only:** multi-source one-shot aggregation with per-source freshness/errors, persisted event store, normalized entity IDs, source event IDs, event types, app/host/environment fields, incident/change anchors, explicit relationships, historical estate/health/security series, saved views, cross-source dedupe, and causal analysis.

Known limitations to render explicitly:

- `/api/activity` may generate a synthetic timestamp for invalid/missing agent times (`cleanTs`), so UI must mark it `timestamp_fallback` instead of treating it as observed event time.
- Security, health, alerts, incidents and estate are separate snapshot APIs; fetch failure must appear as **missing** or **partial**, not no events.
- Agent aliases can become duplicate activity events until the canonical roster utility is shared.
- Deploy feed GitHub/local merging only dedupes exact raw IDs. Different IDs for the same deploy remain ambiguous.
- No source currently gives a causal link from a deploy/action to health, alert, security or agent result.

## Event identity, dedupe, ordering and clustering

### Normalized event contract

Create a server-side timeline read model with: `eventId`, `source`, `sourceEventId`, `eventType`, `ts`, `tsQuality`, `severity`, `entityRefs[]`, `app`, `host`, `agentId`, `environment`, `detail`, `href`, `evidenceRef`, `sourceFreshness`, and `relationship`.

### Deterministic identity and dedupe

1. Prefer `source + sourceEventId` when provider IDs are stable: audit log id/idempotency key, deploy provider ID, alert fingerprint, security event ID, agent session/event ID.
2. If absent, create a versioned deterministic fallback hash from: source, normalized type, canonical entity references, normalized timestamp bucket (one second), and stable normalized detail. Mark `identityQuality=fallback`.
3. Deduplicate only same-source/same-event identity. Cross-source records remain distinct and may be related; never discard a health check because it is near a deploy.
4. Agent records use the shared Office/Teams canonical identity utility before normalisation. Preserve suppressed raw aliases as provenance, not duplicate timeline rows.
5. Keep repeated events when their event IDs or timestamps differ. Collapse only exact duplicates into a count; inspector exposes count and member IDs.

### Ordering

Sort by valid observed `ts DESC`; then source priority (`incident`, `alert`, `security`, `health`, `deploy`, `audit`, `agent`, `estate`); then severity (`critical`, `warning`, `info`, `healthy`, `neutral`); then stable `eventId`. Invalid/fallback timestamps sort after valid observed events in their source/time window and visibly state the fallback.

### Clustering/correlation

- Establish anchors only from an explicit deploy/run ID, incident ID, audit action ID, alert fingerprint, or future change ID.
- A deterministic window can include same-app/entity events in a configurable range (initially deploy start through 15 minutes after finish; alert/security entity window 15 minutes). Label it **Correlated**.
- Mark **Confirmed** only with an explicit source linkage key or incident membership; no time proximity creates confirmation.
- Events without entity/time support stay unclustered/**Unknown**.
- Do not infer causal direction; phrase “observed after release”, not “caused by release”.

## Phased implementation

1. Extend `/api/activity` into a versioned server-side aggregator with source statuses/errors and existing three feeds preserved.
2. Apply shared canonical agent roster utility; normalize deploy/audit IDs and timestamp quality.
3. Add health/Prometheus/security/estate adapters as optional source modules, each with bounded evidence and freshness metadata.
4. Add deterministic clustering/relationship metadata and saved-view/filter query parameters.
5. Persist event/snapshot history for 24-hour density and before/after analysis; only then add release/incident impact views.

## Dev acceptance criteria

- Timeline returns per-source status (`current`, `stale`, `missing`, `error`) and renders partial data without presenting absent sources as quiet.
- Existing audit, deploy and agent activity remain represented once after normalization; invalid timestamps display fallback quality.
- Alias agents produce one canonical timeline representation, with raw aliases retained only in provenance/history.
- Exact duplicate source records collapse with a count; same-time cross-source records remain separate and may be correlated.
- Filters cover time, app, host, agent, source/type and severity when their normalized fields exist; unavailable dimensions are disabled/labeled.
- Saved views are explicit query presets for production changes, security events and failed releases.
- Clusters require a documented anchor/window rule; time adjacency alone always reads Correlated, never Confirmed or causal.
- Inspector shows evidence, related entities, source freshness and deep links; raw view is bounded and redacted.
- Loading, empty, stale, partial-error and missing-source states distinguish “no events” from “no data”.
- Keyboard selection, tab focus, focus return, non-colour severity, reduced-motion, and narrow mobile layouts are tested.
