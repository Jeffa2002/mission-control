# Release Impact Console

A standalone high-fidelity concept for `/deploys`. It preserves the Adaptive Operations Prism language from the Operational Brief and Security Threat Surface concepts while making release progress, evidence quality and operator decisions the visual hierarchy. It does not change the live deploy page or production behavior.

## Preview

```bash
cd design/concepts/release-impact-console
python3 -m http.server 18082
```

Open `http://localhost:18082`. Select **Nominal**, **Attention**, or **Incident** to inspect posture variants. Choose a release row or the conveyor action to update the inspector; use its Summary, Checks and Raw fields tabs.

## Layout

Desktop reserves a 338px contextual inspector and presents:

1. a plain-language release posture, freshness and feed quality;
2. a compact `build → deploy → verify → observe` conveyor for the selected release;
3. ranked release queue and impact verdict side-by-side;
4. explicit environment lanes, distinguishing recorded production information from unknown staging/rollback states;
5. an evidence timeline whose release association is labelled as confirmed, observed by time, inferred, or unknown.

At **1180px**, the inspector becomes a two-column context section. At **900px**, release and impact panels stack; environment lanes stack. At **620px**, summary metrics, pipeline stages, release cards and inspector become compact single-column/mobile-card forms. `prefers-reduced-motion` disables transitions; no operating state depends on animation.

## Tokens and accessibility

The concept reuses the quiet dark material hierarchy: `--bg #101414`, `--surface #171c1c`, `--line #2c3635`, `--text #eef2ed`, `--muted #a4ada9`, healthy `--green #6bd3a3`, attention `--amber #f3ba61`, critical `--red #f17872`, and information `--blue #8eb9ec`.

- Release rows and stages are keyboard-selectable with Enter/Space.
- The inspector uses labelled tab controls and live-updates content.
- Status combines named labels, queue position, wording, icon/boundary treatment and colour.
- Raw fields are bounded, illustrative metadata only—no logs, credentials, tokens or private URLs are rendered.
- Production mobile implementation should make the inspector a labelled dialog/drawer with focus trapping, a functional close control, and focus return to its invoking row.

## Exact current-data mapping

| Concept region | Current source | Real fields / honest state |
| --- | --- | --- |
| Release queue, commit, actor, times, duration, run URL | `GET /api/deploys`; `apps/panel/src/app/api/_deploys.ts` | `id`, `app`, `repo`, `commit`, `commitMsg`, `branch`, `status`, `triggeredBy`, `startedAt`, `finishedAt`, `durationS`, `runUrl` |
| Feed quality | `/api/deploys` | `ok`, `source` (`github-actions` or `deploy-log`), `count`, `warning`; fallback is partial data, never “live” |
| Current stage | derived | `running` means GitHub run is not completed. The feed does **not** record build/deploy/verify sub-stages; the conveyor is an implementation read model, with unsupported stage facts labelled unknown. |
| Current health evidence | `GET /api/health` | `overall`, `checks`, `checked_at`; currently app/panic-latch are meaningful, while Prometheus/Grafana/heartbeat may be `unknown`/`unchecked`. |
| Estate / smoke support | `GET /api/estate` | current repo latest workflow and smoke result where configured. It is current-state evidence, not a historic before/after snapshot. |
| Related activity | `GET /api/activity` | deploy records are emitted with a deploy timestamp; audit and agent entries can be shown as time-adjacent, not causal. |
| Safe actions/audit | `POST /api/runbook-actions`, `GET /api/runbooks`, `GET /api/audit` | current actions are **intent_only** and audited; no rollback execution or approval workflow exists. |

## Capability and gap analysis

**Supported now:** deploy outcome (`success`/`failure`/`running`), commit metadata, actor, start/finish/duration, run URL, GitHub-vs-local source quality, point-in-time health checks, estate smoke where configured, and time-adjacent activity/audit evidence.

**Not supported today:** environment/promotion field, per-stage execution events, approval metadata, deployment target/revision, explicit supersession link, release-scoped logs/checks, pre-release snapshots, time-series latency/error/availability comparisons, causal correlation, rollback target/plan/execution, or approval-gated rollback.

Data quality risks:

- GitHub and local entries merge only when raw `id` matches. A local ID that differs from GitHub’s workflow-run ID can produce duplicate representations (`_deploys.ts:102`).
- The merged feed preserves source order rather than sorting by `startedAt`; local fallback can therefore be non-chronological.
- `failure` currently conflates cancelled, skipped, timed out and true failures (`mapRunStatus` maps every non-success completed run to failure).
- `running` is a workflow status, not a verified release stage.
- `runUrl` is optional and feed freshness has no explicit response timestamp beyond each run’s timestamps.

## Implementation phases

1. **Read model and parity:** centralise normalization, validate dates, sort descending by `startedAt`, dedupe by a stable provider key where available, preserve source provenance, and distinguish `cancelled`/`skipped`/`timed_out`/`failure` if the API provides it.
2. **Console shell:** build accessible conveyor, queue, selected inspector, source/fallback banners and mobile behavior using the current deploy feed plus `/api/health`, `/api/estate`, `/api/activity`.
3. **Correlation model:** store a release observation window and snapshots/check IDs at start/finish; label values observed/inferred/unknown rather than causal.
4. **Telemetry:** add bounded release-scoped availability, latency and error-rate aggregates with baseline/time-window metadata.
5. **Controlled actions:** introduce a signed, approval-gated rollback plan/preview/execution interface. Until then, render rollback as explicitly unsupported and route only to intent-only audited runbooks.

## Dev acceptance criteria

- Queue exposes source quality and renders valid deploy records in deterministic `startedAt DESC` order.
- A display row has a stable provider/deploy identity; duplicate raw sources are collapsed only when the provider key matches. Ambiguous records remain separate and are labelled for review.
- Running, verified, failed, cancelled/superseded (once supported), unknown and stale/partial feed states have text labels and do not rely on colour.
- The selected release shows only fields actually available; missing environment, approval, stage or telemetry values read `Unknown`/`Not captured`, not inferred values.
- Current health/activity events are labelled time-adjacent or observed after release unless explicit correlation metadata exists.
- Before/after comparison stays unavailable until snapshots exist; the interface never claims causal impact from temporal order alone.
- Fallback, empty, loading, partial error and stale collector states remain actionable and distinguishable.
- Rollback cannot execute from this console until a supported backend exists; preview states the missing capability and audit/runbook actions use the existing intent-only route.
- Keyboard selection, tab focus, close/focus-return behavior, reduced motion and narrow viewport variants are covered by tests.
