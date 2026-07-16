# Estate Dependency Topology + Blast Radius

Standalone product/UX concept for the future `/estate` dependency-topology surface. It is a review artifact only: it does **not** change `apps/panel/src/app/estate`, add a live endpoint, execute a probe, or calculate production impact.

## Preview

```bash
cd /root/.openclaw/workspace/mission-control/design/concepts/estate-dependency-topology
python3 -m http.server 18084
```

Open `http://localhost:18084`.

- Select nodes, change inspector tabs, toggle **Topology / Blast radius**, saved views and preview states.
- Keyboard: `Tab` reaches all controls and nodes; `Enter`/`Space` activates native buttons. Focus indicators are visible. Reduced motion disables topology transitions.
- Mobile: the evidence inspector moves below the topology; source gaps remain visible rather than being removed.

## Product hierarchy

1. **Evidence posture** — coverage, confirmed relationship count, unknown-coverage count and current watch signals. A percentage is only a visible coverage summary, not a reliability or availability score.
2. **Topology canvas** — repository records, their configured smoke endpoints, and deliberately explicit fog for missing runtime/package/provider coverage.
3. **Contextual inspector** — proof first, then bounded blast-radius semantics, then source coverage. Deep links are affordances, not implemented navigation in this concept.
4. **Coverage and semantics** — persistent rules preventing visual proximity from being interpreted as a dependency, runtime graph, or causal impact conclusion.

## Current-data mapping

| Concept entity / field | Current source | Exact field(s) | What it supports |
| --- | --- | --- | --- |
| Repository node | `GET /api/estate` | `repos[].name`, `fullName`, `owner`, `productionBranch`, `status` | A current registered repository record, status presentation and owner/branch facts. |
| Configured endpoint node | `GET /api/estate` | `repos[].smokes[].name`, `url`, `status`, `httpStatus`, `latencyMs`, `warning` | A point-in-time configured smoke endpoint and its result. |
| Confirmed repository-to-endpoint edge | `GET /api/estate` | A repository object containing `smokes[]`; endpoint record is grouped by `fullName` server-side | **Confirmed configuration/monitoring association only.** It does not prove runtime routing, deploy target or causal impact. |
| Workflow signal | `GET /api/estate` | `repos[].github.latestRun.{name,branch,status,conclusion,startedAt,title,url}` | Current latest selected GitHub workflow metadata, with source freshness at the estate response level. |
| Dependency-risk signal | `GET /api/estate` | `repos[].github.dependabot.{status,open,counts,worstSeverity}` | Repository-level Dependabot aggregate; no package-version or consumer graph. |
| Runner posture | `GET /api/estate` | `runners.{status,note,controls}` | A global operational-control record, not app-to-runner ownership. |
| Residual / limitation | `GET /api/estate` | `residuals[]` | Human-readable issue context only; never turn prose into dependency edges. |
| Related evidence and freshness conventions | `GET /api/activity` | `events[].entityRefs`, `sourceFreshness`, `relationship`, `relationshipBasis`, `explicitLinkKey`, `dedupeCount`, `memberEventIds` | Reusable evidence vocabulary and cross-surface links. Estate snapshot events are current state, not topology history. |

### Known gaps — mandatory display treatment

- **Runtime service and host graph:** no service inventory, trace spans, host/container binding or request path. Render `Not captured`; do not render an edge or an unaffected conclusion.
- **Package graph:** Dependabot counters are insufficient. Require versioned SBOM/lockfile/manifests before rendering an inferred or confirmed package edge.
- **External-provider graph:** residual text and a smoke URL do not identify provider consumption. Require a provider inventory and explicit consumer relationship.
- **Blast radius:** the current endpoint cannot establish affected services, users, data stores, deployment targets or root cause. The UI must call this a bounded **association reach**, then show `Unknown coverage` where traversal lacks evidence.
- **Freshness:** `/api/estate` currently supplies `summary.checkedAt`, but individual GitHub and smoke sub-source freshness/error records are incomplete. Preserve existing `github.warning` and smoke `warning`; do not show green/zero for a failed or missing sub-source.

## Relationship and blast-radius rules

### Edge classes

| Label | Render rule | Permitted wording | Prohibited wording |
| --- | --- | --- | --- |
| `Confirmed` | Stable endpoint/repository record, or a future explicit source relationship key, supports the edge. | “Configured association”, “explicitly linked record”. | “Caused”, “depends on at runtime”, “affected”. |
| `Inferred` | **Future only.** A versioned, deterministic collector rule joins evidence and exposes the rule/version/evidence IDs. | “Inferred by [rule]”, “requires verification”. | “Confirmed dependency”, “blast radius”. |
| `Unknown coverage` | Relationship source absent, stale, erroring, or insufficient. | “Not captured”, “not computable”, “unknown”. | “No dependency”, “unaffected”, zero impact. |

### Traversal / radius algorithm

1. Anchor selection begins with exactly one canonical entity ID, never display-name matching.
2. Include direct confirmed edges when source identity and immutable evidence ID are present.
3. Traverse inferred edges only when the operator explicitly enables `Include inferred`; show each rule/version and exclude them from the confirmed count.
4. Stop at the first missing, stale, errored or unsupported relationship source. Return a visible unknown-coverage boundary, never a negative assertion.
5. Report three separate values: `confirmed associations`, `inferred relationships`, and `unknown coverage boundaries`. Do not combine them into “affected services”.
6. A health, security, deploy or activity signal may be displayed alongside an entity only through explicit entity IDs. Timestamp proximity remains a correlated timeline relationship and does not create a topology edge.

## Engineer-ready implementation brief

### Phase 1 — truthful estate topology (current data)

- Add a read-model layer; do not derive graph links in JSX. Canonical IDs: `repo:<fullName>` and `endpoint:<sha256(normalizedUrl)>`.
- Convert every `repos[].smokes[]` association into a `confirmed` edge with `kind: 'configured_smoke'`, `evidenceRefs`, `observedAt: summary.checkedAt`, `source: 'estate'`, `sourceStatus` and `relationshipBasis`.
- Surface compact nodes only after records are loaded; a collapsed group must remain `membership`, with no aggregate radius verdict.
- Carry source/field freshness and errors into each node/edge. `unknown`, `partial`, `missing`, `error`, `stale` and `unsupported` must be visually/textually distinct from healthy.
- Keep the live Estate Cockpit table as an alternate list view and preserve links to existing `/estate`, `/deploys`, `/activity`, `/security` and `/incidents` surfaces.

### Phase 2 — collector contracts (future only)

- Runtime collector contract: versioned `service`, `host/container`, `environment`, `relationshipType`, `fromId`, `toId`, immutable `evidenceId`, `observedAt`, `freshness`, `collectorVersion` and `basis`.
- Package collector contract: SBOM/lockfile identity, package name/version/ecosystem, repository revision, `evidenceId`, generated timestamp and parser version. A Dependabot aggregate cannot substitute for this.
- Provider collector contract: provider canonical ID, consumer entity ID, config evidence ID (redacted), environment, observed timestamp and ownership status.
- Treat API values as bounded/redacted evidence. Never send or render raw environment variables, URLs containing credentials, headers, tokens, source code, filesystem paths or command output.

### Phase 3 — controlled traversal and investigation

- Implement filterable graph/list modes, keyboard node traversal, selection persistence and focus return from inspector/dialog.
- Add blast-radius traversal with exact edge-class controls and an explicit coverage-boundary result.
- Reuse `/api/activity` identity conventions: stable IDs, source provenance, `sourceFreshness`, relationship labels and evidence deep links. Do **not** upgrade activity correlation into dependency confirmation.
- Record snapshot time, collector version and graph revision in URL/query state so an investigation is reproducible.

## Acceptance criteria

- [ ] Every edge visibly declares `Confirmed`, `Inferred`, or `Unknown coverage`, with a text equivalent in list/inspector/mobile views.
- [ ] The current-data implementation only creates repo → configured-smoke edges; it does not show runtime, package, provider, deployment or customer-impact edges without a collector contract.
- [ ] Node and edge inspectors expose source, canonical IDs, evidence IDs/basis, observed time, freshness and a safe deep link where available.
- [ ] A source error, stale response, empty fallback or missing field produces a coverage state; it never becomes `healthy`, `0 dependencies`, or `unaffected`.
- [ ] Blast-radius output reports separate confirmed, inferred and unknown-boundary counts; the word “impact” is not used as a conclusion without a separate verified impact source.
- [ ] Existing API warnings (`github.warning`, smoke `warning`) are preserved and accessible, including in condensed/mobile lists.
- [ ] Layout works at 1440px, 1024px, 768px and 375px: topology remains usable, inspector flows after content on small screens, no information is hover-only.
- [ ] Full keyboard operation works for toolbar, nodes, tabs, dialogs and clear-selection action; visible focus, semantic buttons/tabs/dialog and reduced-motion support are present.
- [ ] Graph API tests cover ID canonicalisation, endpoint URL normalization, no-name-match joins, edge-class rendering, source state propagation and traversal stopping at unknown coverage.

## Validation performed

- `node --check design/concepts/estate-dependency-topology/script.js`
- Static preview HTTP check using `python3 -m http.server 18084`
- `git diff --check`
- Responsive/accessibility source checks for semantic controls, focus styling and reduced-motion rule.
