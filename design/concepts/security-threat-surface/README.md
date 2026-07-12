# Security Threat Surface

A standalone, implementation-ready security concept for Mission Control. It extends the calm material hierarchy, status semantics, inspector pattern and responsive rules established in `design/concepts/operational-brief-dashboard/`. It does not modify the live panel.

## Preview

Open `index.html` directly, or use a local static server:

```bash
cd design/concepts/security-threat-surface
python3 -m http.server 18080
```

Visit `http://localhost:18080`. Use the **Nominal**, **Attention**, and **Incident** controls to examine posture variants. Select any threat, path stage or estate node to update the evidence inspector. The inspector’s Parsed, Raw sample and Host context tabs demonstrate compact forensic inspection without leaving the operating view.

## Design intent

This is a posture-and-decision interface, not a hacker-themed telemetry wall:

- Posture, freshness, triage and containment appear before raw evidence.
- Threat rows expose their priority basis in language: severity, potential impact, confidence, freshness and evidence quality.
- An attack path only shows relationships supported by the existing collectors. Solid stages are observed; dashed links are inference; missing coverage is called **unobserved**, never “safe”.
- The estate view uses the existing Cloudflare/nginx boundary, Bazza, Shazza, auth/SSH, firewall/Fail2ban, system and kernel terminology. It is an evidence topology—not a fabricated geographic attack map.
- Raw values are bounded and sanitised examples. The UI deliberately never displays passwords, tokens, certificates, session material, or full unbounded logs.

## Layout and responsive behavior

Desktop uses the same 338px persistent inspector and 32px main gutters as the Operational Brief concept:

1. Security posture, freshness and containment are immediately visible.
2. A ranked triage queue sits beside containment status and the next approved action.
3. The attack progression follows, with evidence state and uncertainty made explicit.
4. The estate topology provides host and collector context without pretending it is a network diagram.

Responsive rules:

- **1180px and below:** the inspector becomes a two-column context section after the estate.
- **900px and below:** triage and containment stack; the kill chain becomes a readable vertical progression; estate relationships become labelled groups with no misleading connection lines.
- **620px and below:** navigation reduces; posture facts become a compact two-column grid; threat metadata moves below the item; inspector content becomes single-column.
- `prefers-reduced-motion` removes transitions. Status is communicated through label, copy, ordering, boundaries and icons—not colour or animation.

## Visual tokens

The concept continues the existing dashboard’s quiet operational palette:

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#101414` | neutral application canvas |
| `--surface` | `#171c1c` | grouped operational material |
| `--line` | `#2c3635` | calm structural separation |
| `--text` | `#eef2ed` | primary readable information |
| `--muted` | `#a4ada9` | supporting evidence and context |
| `--green` | `#6bd3a3` | active control / healthy collection |
| `--amber` | `#f3ba61` | watch, uncertainty and planned review |
| `--red` | `#f17872` | confirmed incident / containment required |
| `--blue` | `#8eb9ec` | informational observation |

## Accessibility and interaction

- The page has a skip link, semantic headings, visible keyboard focus, labelled tab controls and live-updating inspector content.
- Threat rows, path stages and estate nodes are keyboard selectable with Enter or Space.
- Severity chips are augmented by action words (`Watch`, `Observe`, `Verify`) and queue rank; the attack path labels observed, inferred and unobserved states in text.
- Raw evidence uses a small monospace sample only after intentful selection. The future implementation should offer copy/export only through auditable, access-controlled actions.
- “Close inspector” is visual in the concept; implementation should make it functional on narrow devices and return focus to the initiating control.

## Existing data mapping

| Concept region | Current Mission Control source | Concrete fields / honest behavior |
| --- | --- | --- |
| Posture and freshness | `GET /api/security` | `checkedAt`, `stale`, `hasThreats`, `hosts`, `registeredHosts`, collector source; show stale/empty fallback clearly rather than displaying healthy zeroes |
| Triage queue | `/api/security` plus `GET /api/security/alerts` | auth failure count, Fail2ban count, nginx errors, firewall blocks, kernel/system issues, parsed alert items; rank by verified impact, correlation confidence, recency and operator actionability |
| Host coverage | `/api/security` | host `reporting`, `checkedAt`, `sources`, `error`, `securityChannel`; missing channel is coverage risk, not an attack |
| Edge and web evidence | `/api/security`, `GET /api/security/nginx-logs` | `nginx.recentErrors`, `recentErrorLogs`, `byHost`, `topSources`, `topPaths`, `topStatuses`; preserve sampled/aggregate distinction |
| SSH and privilege | `/api/security`, `GET /api/security/auth-log`, `GET /api/security/ssh-attacks` | auth failures, accepts, sudo, top users, parsed auth events, recent source aggregation; never show secrets or full credential material |
| Firewall and containment | `/api/security`, `GET /api/security/firewall` | firewall `blockCount`, `sampleCount`, `sampleLimitPerHost`, rollups and recent evidence; Fail2ban availability, banned count and ban list must be treated as controls, not attribution |
| Geo | `GET /api/security/geo` | an optional evidence facet only; do not make a decorative map the primary view, and mark any source-location result as enrichment rather than definitive identity |
| Attack progression | derived from the sources above | only draw direct stages for evidence with a collector; label relational joins as inferred; show exfiltration as unobserved because the current collector has no dedicated egress/exfiltration feed |
| Evidence bundle | `GET /api/incident/bundle` and security evidence routes | implement the concept’s capture/full-evidence actions as explicit, audited actions with authorisation and data-minimisation controls |

## Implementation notes

1. Build a small security read model from the existing aggregate endpoint plus targeted evidence routes; do not make the browser join unbounded raw logs.
2. Keep the existing `healthy`, `warning`, `critical`, `info` and `neutral` semantics from `apps/panel/src/components/ops-ui.tsx`, but add named confidence, impact and data-quality labels to every triage item.
3. Add explicit collector metadata (`fresh`, `stale`, `sampled`, `unavailable`, `empty fallback`) to the read model. A successful zero from `empty-fallback` must not produce a nominal posture.
4. Use the panel’s existing `/security`, `/estate`, `/systems`, `/incidents` and per-host details as deep links. Keep containment actions gated behind existing runbook/audit patterns.
5. Make inspection selection state URL-addressable where possible; on mobile, implement the inspector as a labelled dialog/drawer with focus trapping and an explicit close action.
6. Validate all raw rendering against a redaction policy and bounded record count. The sample in this mockup is illustrative, uses documentation-reserved IP ranges, and is not live evidence.

This concept is the security counterpart to the Operational Brief Dashboard. Future release and security views should reuse these tokens, priority vocabulary, confidence language, inspector behavior, evidence-quality labels and mobile rules.
