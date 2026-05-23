# Mission Control Backlog

Last updated: 2026-05-23.

This is the working backlog after the `/systems` health registry and `/deploys` GitHub Actions feed fixes. Priorities are ordered by risk and operational value.

## P0 - Security And Correctness

1. `[published]` Add explicit auth guards to sensitive API routes.
   - Why: `/api/*` is excluded by middleware, so API routes must guard themselves. `panic-reset` can clear safety state, and `grafana-panel` can proxy internal Grafana panels with a service token.
   - Do: call `requireSessionAuth(req)` in `GET`/`POST` handlers for `panic-reset` and `grafana-panel`; add a small guard-coverage check for sensitive routes.
   - Files: `apps/panel/src/app/api/panic-reset/route.ts`, `apps/panel/src/app/api/grafana-panel/route.ts`, `apps/panel/src/middleware.ts`.

2. `[published]` Harden `/api/network/history` query handling.
   - Why: `node`, `range`, and `metric` are cast but not validated, then SQL is interpolated into a shell `sqlite3` command.
   - Do: whitelist node IDs, ranges, and metrics; return `400` for invalid params; avoid shell SQL interpolation or tightly escape all values.
   - Files: `apps/panel/src/app/api/network/history/route.ts`.

3. `[published]` Lock down deploy-log writes.
   - Why: `POST /api/deploys` only checks `x-deploy-secret` when `DEPLOY_WEBHOOK_SECRET` exists. If the env var is missing, the fallback writer is open to anyone who can reach the route.
   - Do: fail closed when the secret is unset in production; validate status/body shape; audit writes.
   - Files: `apps/panel/src/app/api/deploys/route.ts`.

4. `[published]` Make `/security` use live host security telemetry.
   - Why: `/api/security` depended on stale `security-data.json`, so auth failures and firewall activity could disappear even while the per-signal routes had newer host access.
   - Do: collect prod auth/firewall/fail2ban/nginx signals live from mounted host logs, expose reporting coverage by server, and show registered hosts that still need a security channel.
   - Files: `apps/docker-compose.yml`, `apps/panel/src/app/api/security/route.ts`, `apps/panel/src/app/api/security/_security-collector.ts`, `apps/panel/src/app/security/page.tsx`.

## P1 - Product Value

5. `[todo]` Make incident controls real and persistent.
   - Why: Incidents have Ack/Assign/Close buttons, but they are inert and incident state is rebuilt from live signals every refresh.
   - Do: add `/api/incidents` with persisted state for ack, owner, close, silence-until, and notes; merge persisted state into the incident builder; audit each action.
   - Files: `apps/panel/src/app/incidents/page.tsx`, new `apps/panel/src/app/api/incidents/route.ts`.

6. `[todo]` Replace placeholder overview/status contracts.
   - Why: `/api/overview` only says the endpoint exists, and `/api/status` returns null Prometheus fields. These should be trustworthy aggregate APIs.
   - Do: build overview/status from health, systems, alerts, agents, deploys, security, and activity; include stale/error metadata per source.
   - Files: `apps/panel/src/app/api/overview/route.ts`, `apps/panel/src/app/api/status/route.ts`.

7. `[published]` Update Activity to use the GitHub deploy feed.
   - Why: `/api/activity` still reads `DEPLOY_LOG_FILE`, so deploy activity can remain empty even though `/api/deploys` now correctly reads GitHub Actions.
   - Do: share deploy-fetching logic or call an internal helper from both routes; show failed/running/success deploys in the unified activity stream.
   - Files: `apps/panel/src/app/api/activity/route.ts`, `apps/panel/src/app/api/deploys/route.ts`.

8. `[published]` Improve `/deploys` operator usefulness.
   - Why: The feed now loads, but the UI does not expose run URLs, failure detail, or workflow filters.
   - Do: include run URL in the API contract; make rows link to GitHub run details; add status/workflow filters and a compact failure badge.
   - Files: `apps/panel/src/app/deploys/page.tsx`, `apps/panel/src/app/api/deploys/route.ts`.

## P1 - Reliability And Ops

9. `[todo]` Reduce panel container blast radius.
   - Why: The panel publishes `3020` on `0.0.0.0` and mounts Docker socket, workspace, SSH keys, and agent data into one web process.
   - Do: bind panel to localhost if nginx is the public entrypoint; split privileged host probes into a narrow sidecar/API; remove Docker socket and SSH mounts from the main panel where possible.
   - Files: `apps/docker-compose.yml`, host probe API routes.

10. `[todo]` Stop disabling SSH host verification.
   - Why: Deploy and remote log paths use `StrictHostKeyChecking=no`, which weakens prod access.
   - Do: use the existing SSH config/known-host aliases; fail closed with `BatchMode=yes` and explicit known-host handling.
   - Files: `scripts/deploy-prod.sh`, `apps/panel/src/app/api/security/_security-logs.ts`.

11. `[todo]` Add a working verification gate before deploy.
    - Why: `next lint` is obsolete here and there are no route contract/security checks.
    - Do: add route smoke tests for auth coverage and API shape; run build plus smoke tests in GitHub Actions before restarting prod.
    - Files: `apps/panel/package.json`, `.github/workflows/deploy-mission-control.yml`, new test scripts.

## P2 - Repo Hygiene

12. `[todo]` Clean generated/runtime artifacts out of Git.
    - Why: `agent-status.json`, `iperf-results.json`, `network-history.db`, and `tsconfig.tsbuildinfo` cause noisy diffs and risk accidental runtime-data commits.
    - Do: update `.gitignore`; intentionally untrack generated files after confirming prod/deploy expectations; document runtime source-of-truth paths.
    - Files: `.gitignore`, `agent-status.json`, `iperf-results.json`, `network-history.db`, `apps/panel/tsconfig.tsbuildinfo`.

13. `[todo]` Split shared data helpers for deploys, agents, systems, and activity.
    - Why: API routes duplicate file paths and parsing logic, which is how `/deploys` and `/activity` diverged.
    - Do: create small server-only helper modules for deploy events, agent status, system health, and activity aggregation; keep route files thin.
    - Files: `apps/panel/src/app/api/_*.ts`, `apps/panel/src/app/api/activity/route.ts`.

## Suggested Execution Order

1. P0 API guards and deploy write lock.
2. P0 network history validation.
3. Activity deploy feed follow-up.
4. Real incident state/actions.
5. Overview/status aggregate contracts.
6. Container and SSH hardening.
7. Verification gate and repo hygiene.

## Notes

- Keep the product dense and operational. Avoid adding new dashboards until current pages answer their core questions reliably.
- Prefer shared server helpers over route-by-route ad hoc logic.
- Mark items `[doing]`, `[done]`, or `[published]` only after build and prod verification.
