# Mission Control Deployment

Mission Control currently runs from `/var/www/mission-control` on `per-web` and the panel container is managed with `docker-compose` from `/var/www/mission-control/apps`.

## Current Manual Path

From the development workspace:

```bash
scripts/deploy-prod.sh
```

The script:

- builds `apps/panel`
- syncs source to `root@100.95.166.47:/var/www/mission-control`
- rebuilds and restarts the `mission-panel` container
- verifies `/` and `/activity` from inside prod using the runtime auth secret

Runtime telemetry files are deliberately excluded from source sync:

- `agent-status.json`
- `iperf-results.json`
- `network-history.db`
- `security-data.json`
- `runtime/`

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

Production's git remote should use SSH:

```bash
git@github.com:Jeffa2002/mission-control.git
```

Do not store GitHub personal access tokens in production git remotes.
