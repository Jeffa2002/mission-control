#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROD_HOST="${PROD_HOST:-root@100.95.166.47}"
PROD_PORT="${PROD_PORT:-2222}"
PROD_KEY="${PROD_KEY:-/root/.ssh/prod_deploy_v3}"
PROD_DIR="${PROD_DIR:-/var/www/mission-control}"

PROD_HOST_TARGET="${PROD_HOST#*@}"
case "$PROD_HOST_TARGET" in
  100.6[4-9].*|100.[7-9][0-9].*|100.1[0-1][0-9].*|100.12[0-7].*|*.ts.net)
    ;;
  *)
    echo "Refusing deploy to non-tailnet host: $PROD_HOST" >&2
    echo "Set PROD_HOST to the prod Tailscale IP or MagicDNS name." >&2
    exit 1
    ;;
esac

SSH_OPTS=(
  -i "$PROD_KEY"
  -p "$PROD_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=no
)

RSYNC_EXCLUDES=(
  --exclude .git
  --exclude node_modules
  --exclude .next
  --exclude .env
  --exclude '*.env'
  --exclude tsconfig.tsbuildinfo
  --exclude runtime
  --exclude agent-status.json
  --exclude iperf-results.json
  --exclude network-history.db
  --exclude network-history.db-journal
  --exclude security-data.json
)

echo "Building panel locally..."
(cd "$ROOT/apps/panel" && npm run build)

echo "Syncing source to $PROD_HOST:$PROD_DIR..."
rsync -az --delete "${RSYNC_EXCLUDES[@]}" \
  -e "ssh ${SSH_OPTS[*]}" \
  "$ROOT/" "$PROD_HOST:$PROD_DIR/"

echo "Rebuilding production container..."
ssh "${SSH_OPTS[@]}" "$PROD_HOST" \
  "cd '$PROD_DIR/apps' && docker-compose build panel && docker-compose up -d panel"

echo "Verifying production markers..."
ssh "${SSH_OPTS[@]}" "$PROD_HOST" '
  set -euo pipefail
  set -a
  . /etc/infisical/generated/mission-control.runtime.env
  set +a
  html="$(curl -fsS -H "Cookie: mc_auth=$MISSION_COOKIE_SECRET" http://127.0.0.1:3020/)"
  printf "%s" "$html" | grep -q "Unified Activity"
  printf "%s" "$html" | grep -q "Runbook"
  curl -fsS -H "Cookie: mc_auth=$MISSION_COOKIE_SECRET" http://127.0.0.1:3020/activity >/dev/null
  systems_json="$(curl -fsS -H "Cookie: mc_auth=$MISSION_COOKIE_SECRET" http://127.0.0.1:3020/api/systems)"
  SYSTEMS_JSON="$systems_json" node -e '"'"'
    const data = JSON.parse(process.env.SYSTEMS_JSON || "{}");
    const systems = Array.isArray(data.systems) ? data.systems : [];
    const bad = systems.filter((system) => !system.ok);
    if (!systems.length) {
      console.error("No registered systems were returned by /api/systems");
      process.exit(1);
    }
    if (bad.length) {
      console.error("Unhealthy registered systems:");
      for (const system of bad) {
        console.error(`- ${system.id || system.label}: ${system.error || "not ok"}`);
      }
      process.exit(1);
    }
  '"'"'
'

echo "Production deploy verified."
