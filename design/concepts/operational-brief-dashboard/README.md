# Operational Brief Dashboard

A standalone, high-fidelity redesign concept for the Mission Control overview. It is deliberately isolated from `apps/panel`: no application code, routes, or production styles are changed.

## Preview

Open `index.html` directly in a browser, or serve this folder from the repository root:

```bash
cd design/concepts/operational-brief-dashboard
python3 -m http.server 8080
```

Then visit `http://localhost:8080`. The **Nominal**, **Attention**, and **Incident** preview controls change the operational posture without animation. Click a queue row or constellation node to update the side inspector.

## Intent

The concept is an *operational brief*, not a telemetry wall:

- Lead with a plain-language posture and a small number of decision-worthy signals.
- Give changes and action items distinct places; avoid making every event feel urgent.
- Show the estate as a compact, inspectable constellation that groups applications, hosts, and the agent mesh.
- Use muted surfaces, restrained status colour, stable alignment and short labels. No scanlines, glow effects, or decorative HUD treatment.

## Desktop layout

At desktop widths, the composition uses a persistent 338px contextual inspector at the right:

1. Utility navigation and current-telemetry state.
2. Brief headline, posture score, and compact service/agent/incident/deploy facts.
3. A 24-hour availability ribbon that carries one annotated exception, not a dense graph.
4. A ranked priority queue beside a change log.
5. An estate constellation that makes the operational scope explicit.

The main reading area uses a `max-width` of 1440px, 32px outer gutters, 16px panel gaps, 14px radii and a 68px application bar. The page is designed around readable operational density rather than dashboard maximalism.

## Responsive rules

- **1180px and below:** the inspector becomes a full-width contextual section after the constellation; core content keeps two columns where possible.
- **900px and below:** posture facts become a 2×2 grid; action queue and changes stack; the constellation removes connecting lines and retains labelled groups.
- **620px and below:** navigation reduces to identity and account actions; all content becomes one column; action timestamps move beneath their task; groups become vertically scroll-free lists.
- The mockup honours `prefers-reduced-motion`; it does not require motion to communicate health or priority.

## Tokens

The concept starts from the panel’s existing dark operation palette but intentionally lowers visual noise:

| Token | Concept value | Role |
| --- | --- | --- |
| `--bg` | `#101414` | Deep, neutral operating canvas |
| `--surface` | `#171c1c` | Primary panel surface |
| `--line` | `#2c3635` | Quiet separation and grouping |
| `--text` | `#eef2ed` | Primary readable text |
| `--muted` | `#a4ada9` | Supporting information |
| `--green` | `#6bd3a3` | Healthy / available state |
| `--amber` | `#f3ba61` | Watch / planned attention |
| `--red` | `#f17872` | Confirmed incident / action now |
| `--blue` | `#8eb9ec` | Informational observation |

State always has text, label and placement in addition to colour. Status chips remain readable at small sizes, focus states are visible, buttons meet practical touch target sizing, and the chart has an accessible label.

## Component inventory

- `OperationalPosture`: title, score, plain-language summary, freshness and one direct review link.
- `MetricFact`: stable count with a short qualifying detail; never a decorative KPI.
- `SignalRibbon`: 24-hour aggregate availability with an annotated exception.
- `PriorityQueueItem`: ranked, severity-labelled task with time and an inspection affordance.
- `ChangeItem`: bounded operational change record, drawn from deploy, agent, health and security activity.
- `ServiceConstellation`: grouped app/host/agent nodes with simple relationships and inspect-on-select behaviour.
- `ContextInspector`: selection-specific evidence, threshold, available action and one suggested next step.

## Current-panel data mapping

The vocabulary and sample data map to current `apps/panel` endpoints and models, so this can be implemented without inventing a parallel monitoring taxonomy:

| Concept area | Existing source | Fields / derivation |
| --- | --- | --- |
| Operational posture | `/api/health`, `/api/alerts`, `/api/panic-reset` | `overall`, `checks`, alert count, panic latch; calculate one state and short explanation |
| Services and app nodes | current home-page EffectX app fetch / health | app `name`, `status`, `latencyMs`, `ssl`, `kind` |
| Host nodes and inspector | `/api/bazza`, `/api/shazza`, `/api/systems` | memory, disk, uptime, reachability; apply explicit watch/page thresholds |
| Agents | `/api/agents/status` | `id`, `label`, `emoji`, `status`, `busy`, `uptime`, `restarts`, current task |
| Recent changes | `/api/activity`, `/api/deploys` | activity `source`, `title`, `detail`, `severity`, `ts`; deploy app, commit, branch, status, duration |
| Priority queue | derived from health checks, alerts, running/recent deploys, agent states | rank by confirmed impact, threshold proximity, freshness and operator actionability |
| 24-hour ribbon | existing Prometheus/Grafana path, future lightweight aggregation endpoint | availability check series plus annotated threshold or deploy events |

The implementation should retain the current `healthy`, `warning`, `critical`, `info` and `neutral` semantics from `apps/panel/src/components/ops-ui.tsx`, while presenting them with the calmer hierarchy above.

## Interaction model

- Selecting a priority queue row or constellation node updates the inspector; it does not navigate away from the brief.
- The inspector presents evidence before escalation actions, keeping sensitive operational actions deliberate.
- “Review signals” and full-detail actions map to existing panel routes such as `/activity`, `/apps`, `/estate`, `/agents/[id]`, `/deploys`, and `/incidents`.
- The state controls are review-only mockup affordances. In production, state is derived from health and incident data; it must not be manually set.
- Poll fresh telemetry conservatively and show its age. Avoid perpetual animation; use no flashing for routine changes.

## Recommended implementation sequence

1. Extract a read model that combines existing health, deploy, activity, agent and host data into the six concept regions.
2. Build the semantic layout and responsive behaviour first, using the current `AppShell`, `StatusBadge`, `Metric`, `SectionTitle`, `InspectorPanel`, and route conventions.
3. Add selection state for the inspector and deep-link each selected entity to its existing detailed route.
4. Add a small aggregated availability endpoint for the ribbon after the layout is validated.
5. Validate keyboard selection, focus order, screen-reader labels, small viewport layout and reduced-motion behaviour with live data.

This is the visual base for the later Security Threat Surface and Release Impact Console: both should reuse the token set, status language, panel rhythm, priority ranking, inspector behaviour and mobile collapse rules rather than introducing separate visual systems.
