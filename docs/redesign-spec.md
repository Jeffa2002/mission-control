# Mission Control Redesign Spec

## Purpose
Mission Control is not a generic dashboard. It is a security operations panel for two hosts (`bazza` and `prod`) that answers three questions fast:

1. **What is happening right now?**
2. **Is this normal or hostile?**
3. **What should I do next?**

The current product is operational but visually fragmented: strong data sources, weak hierarchy, too much raw log material, and not enough triage flow. This redesign turns Mission Control into a **high-signal security console** with a consistent shell, stronger risk framing, and drill-down paths that move from summary → evidence → action.

---

## 0. Product principles

- **Security first, not observability-first.** Surface threats, sources, and actionability before raw telemetry.
- **Baseline vs anomaly.** Every chart/card should answer “what changed?” not just “what happened?”.
- **Progressive disclosure.** Summary in cards, detail in drawers, raw logs in a dedicated viewer.
- **Fast triage.** Every alert-like item must support acknowledge / assign / silence / close.
- **Dark, restrained, dense.** High information density without visual clutter.
- **Two-host clarity.** `bazza` and `prod` must always be distinguishable with labels, chips, and colour state.

---

# 1. Design System

## 1.1 Dark theme token set

Use a neutral dark system with a cool-blue bias and sharp severity accents.

### Core colour tokens

| Token | Value | Usage |
|---|---:|---|
| `--bg-0` | `#06080d` | App background |
| `--bg-1` | `#0b1020` | Primary page background |
| `--bg-2` | `#10172a` | Elevated surfaces, panels |
| `--bg-3` | `#151f36` | Hover surfaces, table headers |
| `--surface` | `#111827` | Default cards |
| `--surface-2` | `#172033` | Nested cards, drawers |
| `--border` | `rgba(148,163,184,0.18)` | Default dividers |
| `--border-strong` | `rgba(148,163,184,0.28)` | Focused / active borders |
| `--text-1` | `#f3f7ff` | Primary text |
| `--text-2` | `#c5cedc` | Secondary text |
| `--text-3` | `#8b96aa` | Muted text |
| `--text-inverse` | `#08101f` | Text on bright pills |
| `--accent` | `#67d5ff` | Primary interactive accent |
| `--accent-2` | `#7c8cff` | Secondary accent / links |
| `--focus` | `#8ddcff` | Focus ring |

### Severity palette

Severity must be consistent across badges, left borders, chart lines, and status dots.

| Severity | Token | Value | Meaning |
|---|---|---:|---|
| Neutral | `--sev-neutral` | `#64748b` | Informational / non-urgent |
| Info / Cyan | `--sev-info` | `#22d3ee` | System info, telemetry, hints |
| Warning / Amber | `--sev-warning` | `#f59e0b` | Needs attention soon |
| Critical / Red | `--sev-critical` | `#ef4444` | Immediate triage required |
| Healthy / Green | `--sev-healthy` | `#22c55e` | OK, recovered, secure |

### Host colours

Keep host identity separate from severity.

- `bazza`: cyan-violet family, e.g. `#7c8cff`
- `prod`: warm amber-red family, e.g. `#ff9f43`

Never use host colour as a severity indicator.

### Semantic backgrounds

- Success tint: `rgba(34,197,94,0.12)`
- Warning tint: `rgba(245,158,11,0.12)`
- Critical tint: `rgba(239,68,68,0.12)`
- Info tint: `rgba(34,211,238,0.12)`

Use tints only for chips, callouts, and compact emphasis. Avoid full-card saturated fills.

---

## 1.2 Typography scale

Use a compact, technical scale with tabular numerals everywhere counts matter.

### Font stack

- UI: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
- Data / log text: `JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace`

### Scale

| Style | Size / Line height | Usage |
|---|---|---|
| `display` | 32/38 | Page KPIs, critical totals |
| `h1` | 24/30 | Page title |
| `h2` | 18/24 | Section title |
| `h3` | 16/22 | Card title |
| `body` | 14/20 | Standard content |
| `body-sm` | 13/18 | Supporting copy, table meta |
| `caption` | 12/16 | Timestamps, labels |
| `micro` | 11/14 | Column labels, chips |

### Type rules

- Use `font-variant-numeric: tabular-nums` for counts, timestamps, durations, and ports.
- Section labels should be uppercase, tracked, and small.
- Avoid large blocks of all-caps; use them only for structural labels.

---

## 1.3 Spacing system

Use an 8px base grid.

| Token | Value |
|---|---:|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |

### Layout rhythm

- Card padding: `16px` minimum, `20px` for top-level summary cards.
- Section gaps: `24px`.
- Page vertical rhythm: `32px` between major blocks.
- Dense tables: `10–12px` row padding.
- Drawer content: `20px` padding with `16px` block separation.

---

## 1.4 Radius, borders, shadows

- Radius small: `10px`
- Radius medium: `14px`
- Radius large: `18px`
- Pills / badges: fully rounded
- Avoid oversized rounded corners on major surfaces.

Shadows should be subtle and mainly used for floating elements:

- Default elevated shadow: `0 12px 30px rgba(0,0,0,0.28)`
- Drawer shadow: `-16px 0 40px rgba(0,0,0,0.35)`
- Hover shadow: minimal, mostly border brightening

---

## 1.5 Component inventory

### Cards

Standard card pattern:
- border: 1px solid `--border`
- background: `--surface`
- header with title + action slot
- body can contain compact metrics, charts, lists, or logs

Variants:
- **Summary card**: top-level KPI + delta
- **Threat card**: severity-led, includes action affordance
- **Evidence card**: tables, logs, timelines
- **Health card**: system state and anomalies

### Badges

Use badges for state only, not decoration.

- Host badge: `bazza`, `prod`
- Severity badge: info / warning / critical / healthy
- Status badge: `open`, `ack`, `silenced`, `closed`
- Source badge: `nginx`, `ssh`, `kernel`, `audit`, `agent`

### Pills

Compact chips for filters and facets:
- Time range
- Environment
- Protocol
- Top source IP
- Status filters

### Tables

Tables should be:
- sticky header
- compact row height
- sortable where meaningful
- row hover state with detail affordance
- row actions hidden until hover/focus

### Drawers

Use drawers for drill-down, not modals, when the user is inspecting evidence.

Drawer content types:
- IP drill-down
- Alert detail and triage
- Agent activity
- Event history

### Modals

Use modals only for destructive or confirm-heavy actions:
- close incident
- silence with duration
- confirm assignment
- export log slice

### Charts

Keep charts simple:
- sparklines
- bar history by time bucket
- heat strip
- anomaly markers

Avoid decorative chart chrome.

---

# 2. Shell & Navigation redesign

## 2.1 Navigation model

This product should use a **left sidebar** rather than a top navigation.

### Why sidebar wins

- The app has six core pages plus drill-down contexts.
- Users need persistent orientation between Overview, Threats, Systems, Incidents, Agents, and Audit.
- A sidebar better supports grouping and alert badges.
- Top nav would waste horizontal space on a dense operations dashboard.

### Recommended shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Header: health strip | alert count | last refresh | env | refresh/search/etc. │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ Sidebar       │ Main content area                                             │
│               │                                                              │
│ Overview      │                                                              │
│ Threats       │                                                              │
│ Incidents     │                                                              │
│ Systems       │                                                              │
│ Agents        │                                                              │
│ Audit         │                                                              │
│               │                                                              │
│ Environment   │                                                              │
│ Filters       │                                                              │
│ Saved views   │                                                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

### Sidebar sections

#### Section 1: Monitor
- Overview
- Threats
- Incidents
- Systems
- Agents

#### Section 2: Evidence
- Audit Log
- Log Viewer
- Runbooks / Response notes

#### Section 3: Context
- Environment switcher (`bazza` / `prod`)
- Time range filter
- Saved views

Add alert badges to pages where the data is hot:
- Threats: red count
- Incidents: open count
- Systems: anomaly count
- Agents: active count

---

## 2.2 Fixed header

The header is always visible and should contain only high-value operational information.

### Required elements

- **Health strip**: a thin horizontal bar summarizing host state and current severity distribution
- **Alert count**: current open / active alert count
- **Last refresh**: relative time (`20s ago`)
- **Environment label**: `bazza` or `prod`
- **Refresh action**: manual reload
- **Search action**: jump to IP, user, path, or agent

### Header layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [health strip██████░░]  12 open alerts  •  refreshed 18s ago  •  prod       │
│                                                      [Search] [Refresh]      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Health strip behaviour

The strip is a compact composite visualization:
- green = healthy / recovered
- amber = warning / elevated
- red = critical / active threat
- grey = unknown / stale

It should reflect the current page’s scope, but default to overall environment health.

---

## 2.3 Shell layout recommendations

- Desktop: **sidebar + fixed header + scrollable main content**
- Tablet: sidebar collapses to icon rail
- Mobile: top nav drawer with sticky environment switcher and alert count

### Main content width

- Default content max width: `1600px`
- Dense pages (Audit, Systems, Threats): allow full width
- Overview: centered with max width but still wide enough for multi-column cards

---

# 3. Page-by-page redesign specs

## 3.1 Overview

### Purpose
A first glance for “what matters now”. This is the landing page.

### Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Hero KPIs                                                                  │
│ [Open alerts] [Blocked attacks] [Top IP] [Agents live] [Systems anomalous] │
├───────────────────────────────┬────────────────────────────────────────────┤
│ Threat summary                │ Health summary                             │
│ - critical alerts             │ - bazza / prod status                      │
│ - top source IPs              │ - anomalies by subsystem                   │
│ - recent suspicious paths     │ - baseline vs anomaly                      │
├───────────────────────────────┼────────────────────────────────────────────┤
│ Attack timeline               │ Latest incidents                           │
│ [bars + markers]              │ [triage cards]                             │
├───────────────────────────────┴────────────────────────────────────────────┤
│ Recent raw signal / latest log lines                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

### Components

- KPI strip with 4–5 summary tiles
- Threat summary card
- Health summary card
- Attack timeline
- Latest incidents list
- Recent signal feed

### Data hierarchy

1. Open criticals / alerts
2. Current attack volume
3. Top noisy IPs
4. Host health / anomaly state
5. Recent raw evidence

### Interactions

- Clicking KPI opens filtered page view.
- Clicking IP opens IP drawer with event history.
- Clicking alert summary opens triage drawer.
- Timeline hover shows bucket details.
- “View all” routes to Threats or Incidents depending on context.

### Empty state

If telemetry is sparse:
- show “No active security events in the selected window”
- keep environment and time range visible
- suggest widening time window

---

## 3.2 Security / Threats

### Purpose
The main investigative surface for suspicious activity.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Threat overview KPIs                                                        │
├───────────────────────────────┬──────────────────────────────────────────────┤
│ Threat timeline               │ Alert triage queue                           │
│ [events over time]            │ [ack / assign / silence / close cards]       │
├───────────────────────────────┴──────────────────────────────────────────────┤
│ Top sources table | Top paths table | Geo heat / source map                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Evidence stream / suspicious requests                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Components

- Threat timeline component
- Alert triage cards
- Top IPs table
- Top paths table
- Geo heat map / source visualization
- Suspicious request feed

### Data shown

Pull from:
- `security/alerts`
- `security/nginx-logs`
- `security/ssh-attacks`
- `security/geo`
- `security/firewall`

### Interaction model

- Triage card actions:
  - **Acknowledge**: marks seen, keeps open
  - **Assign**: sends to person/team or “on-call” bucket
  - **Silence**: quiets repetitive source for a duration
  - **Close**: resolves after review
- Clicking a source IP opens drill-down drawer.
- Clicking a timeline event opens the originating log slice.
- Filters: host, severity, source type, status, time window.

### Empty state

- If no alerts: show a neutral status panel with “No active threats in the current window.”
- If only low severity events: show muted green/amber framing, no red accent.

---

## 3.3 Systems

### Purpose
Show whether the hosts themselves are healthy, overloaded, compromised, or drifting from baseline.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Systems KPI strip                                                           │
├───────────────────────────────┬──────────────────────────────────────────────┤
│ System health cards           │ Baseline vs anomaly panel                   │
│ bazza / prod / services       │ CPU, memory, disk, load, auth spikes         │
├───────────────────────────────┴──────────────────────────────────────────────┤
│ Systems table with health, last check, anomaly flags, notes                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Components

- System health card
- Baseline vs anomaly indicator
- Systems table
- Compact health trend sparklines

### Data shown

- environment / host
- status (`healthy`, `degraded`, `stale`, `critical`)
- last check-in
- observed anomalies
- comparison to baseline
- optional note / owner / runbook link

### Interaction model

- Clicking a system card opens a drawer with health history.
- Baseline vs anomaly indicator should explain *why* the value is suspicious.
- Filters by host, subsystem, anomaly type.

### Empty state

- “No systems data yet” with explicit “check agent connectivity” hint.
- If stale, emphasize staleness instead of empty success.

---

## 3.4 Incidents

### Purpose
Turn multiple related signals into incident workflows.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Incident KPIs: open | acknowledged | silenced | closed                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Incident queue                                                              │
│ [card] [card] [card]                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Incident detail / evidence / timeline                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Components

- Incident cards
- Incident detail drawer
- Evidence timeline
- Related alerts list
- Action buttons: ack / assign / silence / close

### Data shown

Each incident should summarize:
- title
- severity
- host(s)
- earliest seen
- latest seen
- source IP(s)
- affected paths / users
- current status

### Interaction model

- Incident card click opens detail drawer.
- Triage action buttons stay visible on the card header.
- Related alert grouping should be obvious and not hidden in long text.

### Empty state

- “No active incidents” with a prompt to review threats or raw logs.

---

## 3.5 Agents

### Purpose
Monitor the automation and assistant layer itself.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Agent summary KPIs                                                           │
├───────────────────────────────┬──────────────────────────────────────────────┤
│ Agent list                     │ Selected agent activity drawer/stream       │
│ [status cards]                 │                                              │
├───────────────────────────────┴──────────────────────────────────────────────┤
│ Activity timeline + tool call/result details                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Components

- Agent status cards
- Agent activity drawer (existing pattern, redesigned)
- Activity timeline
- Tool call/result visualization

### Data shown

For each agent:
- label
- status
- last seen
- current task
- last action
- activity stream

### Interaction model

- Selecting an agent opens the activity drawer.
- Drawer should auto-follow live updates, but allow pause.
- Tool calls and results should be visually distinct and collapse long payloads.

### Empty state

- “No agent activity yet” with live indicator placeholder.

---

## 3.6 Audit Log

### Purpose
A forensic, filterable record of security-relevant events.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Audit filters: host | event type | user | IP | status | search               │
├──────────────────────────────────────────────────────────────────────────────┤
│ Log viewer                                                                  │
│ timestamp | host | source | actor | action | outcome | details              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Raw event drawer / inline expansion                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Components

- Searchable log viewer
- Filter chips and query bar
- Detail drawer for selected row
- Expandable raw payload

### Data shown

- timestamp
- host
- source type
- user / actor
- event type
- outcome
- IP / path / command
- normalized details

### Interaction model

- Search by IP, username, path, command substring.
- Filters should combine cleanly.
- Clicking a row opens the raw event drawer.
- Support copy-to-clipboard for IP / command / line.

### Empty state

- “No matching events” with reset filters action.

---

# 4. New components to build

## 4.1 Alert triage card

A compact but action-heavy card for active alerts.

### Required anatomy

- severity badge
- short title
- host badge
- first seen / last seen
- source IP / user / path summary
- evidence count
- actions row

### Actions

- **Acknowledge**: keep open, mark reviewed
- **Assign**: select owner/team
- **Silence**: choose duration and reason
- **Close**: resolve and archive

### Behaviour

- Primary action should be contextual:
  - critical alert → Acknowledge first
  - recurring alert → Silence first
  - resolved alert → Close
- Show a small history of status transitions
- Card border should reflect severity, not the entire fill

---

## 4.2 Threat timeline component

A horizontal time-based component with severity markers and density bars.

### Features

- bucketed counts by time range
- markers for critical spikes
- hover tooltip with event breakdown
- host segregation (`bazza` vs `prod`)
- click through to evidence slice

### Style

- thin bars, not chunky charts
- emphasize spikes and change
- keep labels minimal

---

## 4.3 Drill-down drawer (IP → event history)

When a source IP is clicked anywhere, open a drawer that answers:
- who is this?
- where did it appear?
- what did it touch?
- how often did it recur?

### Sections

1. Summary
2. Event history
3. Related hosts
4. Related users / paths
5. Raw evidence

### Actions

- copy IP
- filter current page by IP
- silence IP
- mark as known / benign

---

## 4.4 Log viewer with search/filter

A real forensic viewer, not a long list of text.

### Must have

- search input
- host filter
- source filter
- severity filter
- time range
- row expansion
- copy line / copy field

### Rows

Each row should render:
- timestamp
- source type
- main entity (IP/user/path)
- outcome severity
- compact evidence snippet

Avoid showing full raw logs by default.

---

## 4.5 System health card

Not a raw `ps` dump.

### Show

- host name
- health state
- last check age
- CPU / mem / disk / load summaries
- anomaly flags
- trend delta vs baseline

### Avoid

- process lists
- unstructured command output
- meaningless numeric noise without threshold context

---

## 4.6 Baseline vs anomaly indicator

A reusable micro-component.

### States

- normal: within expected band
- watch: outside baseline but not severe
- alert: meaningful deviation
- stale: no recent measurement

### UI

- small pill + mini delta arrow + plain-language reason
- example: `+38% auth failures vs baseline`
- example: `Disk IO 2.1× baseline`

This component should be used in Systems, Overview, and Threat context cards.

---

# 5. Implementation notes for Dev

## 5.1 Tailwind v4 class suggestions

Use these as a starting point; keep them consistent across the app.

### App shell

```tsx
<div className="min-h-screen bg-[#06080d] text-slate-100">
  <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)]">
```

Sidebar:

```tsx
<aside className="border-r border-white/10 bg-[#0b1020]">
```

Header:

```tsx
<header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1020]/90 backdrop-blur-xl">
```

Main section:

```tsx
<main className="px-6 py-6 xl:px-8">
```

### Card

```tsx
<div className="rounded-[14px] border border-white/10 bg-[#111827] shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
```

### Section title

```tsx
<h2 className="text-[18px] font-semibold tracking-tight text-slate-100">
```

### Muted text

```tsx
<p className="text-[13px] text-slate-400">
```

### Badge

```tsx
<span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-200">
```

### Critical state

```tsx
<div className="border-l-2 border-l-[#ef4444] bg-[rgba(239,68,68,0.08)]">
```

### Healthy state

```tsx
<div className="border-l-2 border-l-[#22c55e] bg-[rgba(34,197,94,0.08)]">
```

### Drawer

```tsx
<aside className="fixed right-0 top-0 h-full w-[min(560px,100vw)] border-l border-white/10 bg-[#0a0f1a] shadow-[-16px_0_40px_rgba(0,0,0,0.35)]">
```

### Table row

```tsx
<tr className="border-b border-white/5 hover:bg-white/[0.03]">
```

---

## 5.2 Dark colour values to use

If using CSS variables or `@theme`, define these directly:

```css
:root {
  --color-bg: #06080d;
  --color-bg-elevated: #0b1020;
  --color-surface: #111827;
  --color-surface-2: #172033;
  --color-border: rgba(148, 163, 184, 0.18);
  --color-text: #f3f7ff;
  --color-text-muted: #8b96aa;
  --color-accent: #67d5ff;
  --color-accent-2: #7c8cff;
  --color-critical: #ef4444;
  --color-warning: #f59e0b;
  --color-healthy: #22c55e;
}
```

Recommended surface gradients:

```css
background: linear-gradient(180deg, rgba(17,24,39,0.96), rgba(11,16,32,0.96));
```

Use gradients sparingly, mostly for hero cards and maps.

---

## 5.3 Existing components: keep / modify / replace

### Keep

#### `AttackMap`
- Keep the concept and the world-map visual.
- It is useful for threat geography.
- But it should be visually rebuilt inside the new card system and integrated into Threats or Overview.

#### `AgentActivityDrawer`
- Keep the drawer pattern.
- It already solves live streaming activity.
- Replace inline styles with the shared shell tokens and card system.

### Modify

#### Geo / SSH / firewall summaries
- Convert into reusable evidence cards and tables.
- Add actions and filters.
- Normalize their styling into shared components.

#### Alert list rendering
- Replace simple list output with triage cards.
- Add state transitions and clearer severity treatment.

#### Log formatting
- Convert raw line dumps into structured rows with field-level emphasis.

### Replace

#### Any raw ps-style or command-output panels
- Replace with system health summaries and anomaly indicators.
- Raw command output should live only in expandable evidence drawers.

#### Any page that is currently just a sparse list of data
- Replace with a structured page shell, sections, and action hierarchy.

---

## 5.4 Data handling recommendations

- Normalize each API response into a common UI model:
  - `severity`
  - `host`
  - `source`
  - `entity`
  - `firstSeen`
  - `lastSeen`
  - `count`
  - `status`
  - `evidence[]`
- Keep the first screen answerable in under 10 seconds.
- Prefer grouped summaries over undifferentiated event streams.
- Ensure empty results still render the frame, filters, and host context.

---

## 6. Final direction

This redesign should feel like a **security operations console**, not an analytics demo. The UI should be calm, dense, and decisive. It should make noisy logs legible, surface actionable threats quickly, and let the user move from summary to evidence without losing context.

If a control does not help the user decide, investigate, or act, remove it.
