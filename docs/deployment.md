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

1. manually run the `Deploy Mission Control` workflow
2. GitHub Actions builds the panel
3. the runner joins the Tailnet
4. the runner syncs source to prod
5. prod rebuilds and restarts the panel
6. the workflow verifies the live app

The workflow needs these GitHub secrets before it can run:

- `PROD_SSH_KEY`: private deploy key that can SSH to `root@100.95.166.47:2222`
- `TS_OAUTH_CLIENT_ID`: Tailscale OAuth client ID
- `TS_OAUTH_SECRET`: Tailscale OAuth secret

After those secrets are configured and the first manual deploy is proven, the workflow can be changed to deploy automatically on pushes to `master`.

Production's git remote should use SSH:

```bash
git@github.com:Jeffa2002/mission-control.git
```

Do not store GitHub personal access tokens in production git remotes.
