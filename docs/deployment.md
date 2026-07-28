# Mission Control Deployment

Mission Control currently runs from `/var/www/mission-control` on `per-web` and the panel container is managed with `docker-compose` from `/var/www/mission-control/apps`.

## Current Manual Path

From the development workspace:

```bash
scripts/deploy-prod.sh
```

The script:

- builds `apps/panel`
- syncs source to `root@100.95.166.47:/var/www/mission-control` over the tailnet
- refuses to deploy if `PROD_HOST` is not a Tailscale `100.64.0.0/10` address or `*.ts.net` MagicDNS name
- rebuilds and restarts the `mission-panel` container
- verifies `/` and `/activity` from inside prod using the runtime auth secret

Runtime telemetry files are deliberately excluded from source sync:

- `agent-status.json`
- `iperf-results.json`
- `network-history.db`
- `security-data.json`
- `runtime/`

## Near-real-time agent telemetry

The source-side OpenClaw plugin subscribes only to the supported sanitized event hook and writes an allowlisted projection. It never persists prompts, messages, reasoning, tool arguments/results, commands, environment, headers, tokens, or logs.

Install on Bazza after reviewing the plugin source:

```bash
openclaw plugins install /root/.openclaw/workspace/mission-control/openclaw-plugin/mission-control-observability
openclaw plugins enable mission-control-observability
openclaw plugins inspect mission-control-observability --runtime --json
openclaw gateway restart
```

Run `scripts/sync-agent-events.sh` as a long-lived Bazza service. It uses the existing pinned SSH trust path, writes remote temporary files, then atomically renames them. Live events sync every two seconds; the existing allowlisted sessions/tasks/cron snapshot reconciles missed terminal and parent/child state every 30 seconds. The original one-minute job remains the independent fallback. Do not expose a public ingest route.

```ini
[Unit]
Description=Mission Control sanitized agent telemetry sync
After=network-online.target openclaw-gateway.service

[Service]
Type=simple
ExecStart=/root/.openclaw/workspace/mission-control/scripts/sync-agent-events.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

The panel reads `runtime/agent-telemetry.json`, serves it only behind the existing Mission Control session cookie, and emits authenticated SSE updates. `/office` falls back to the existing one-minute `agent-status.json` snapshot whenever collector health is stale or unknown.

Token usage is aggregated on Bazza so production reflects the authoritative agent store. Install `ops/systemd/mission-control-token-usage.service`, then restart `mission-control-agent-telemetry.service`; the existing sync loop copies the aggregate-only `runtime/token-usage.json` atomically to production. Raw transcripts never leave Bazza through this path.

## GitHub Actions Path

`.github/workflows/deploy-mission-control.yml` is ready for the intended flow:

1. push a panel/deploy change to `master`, or manually run the `Deploy Mission Control` workflow
2. the repo-scoped self-hosted runner on prod checks out the repo
3. the runner syncs source into `/var/www/mission-control`
4. prod rebuilds the Docker image, which runs the Next.js build
5. prod restarts the panel
6. the workflow verifies the live app

The runner is installed as a systemd service:

```bash
actions.runner.Jeffa2002-mission-control.per-web-mission-control.service
```

The workflow deploys automatically on panel/deploy changes pushed to `master`.

This path does not SSH from GitHub to prod. It runs locally on the prod self-hosted runner, so it has no public deploy hop.

Production's git remote should use SSH:

```bash
git@github.com:Jeffa2002/mission-control.git
```

Do not store GitHub personal access tokens in production git remotes.
