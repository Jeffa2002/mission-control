#!/usr/bin/env bash
set -euo pipefail

SOURCE=${AGENT_TELEMETRY_FILE:-/root/.openclaw/workspace/mission-control/runtime/agent-telemetry.json}
USAGE_SOURCE=${TOKEN_USAGE_TELEMETRY_FILE:-/root/.openclaw/workspace/mission-control/runtime/token-usage.json}
PROD_HOST=${PROD_HOST:-root@100.95.166.47}
PROD_PORT=${PROD_PORT:-2222}
PROD_KEY=${PROD_KEY:-/root/.ssh/prod_deploy_v3}
REMOTE_DIR=${PROD_AGENT_DATA:-/var/www/mission-control/runtime}
REMOTE_SNAPSHOT_DIR=${PROD_SNAPSHOT_DIR:-/root/.openclaw/agents}
INTERVAL=${AGENT_TELEMETRY_SYNC_INTERVAL:-2}
RECONCILE_INTERVAL=${AGENT_TELEMETRY_RECONCILE_INTERVAL:-30}
CONTROL_PATH=${AGENT_TELEMETRY_SSH_CONTROL_PATH:-/tmp/mission-control-telemetry-%C}

SSH_OPTIONS=(
  -i "$PROD_KEY"
  -p "$PROD_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o ControlMaster=auto
  -o ControlPersist=120
  -o "ControlPath=$CONTROL_PATH"
)
RSYNC_SSH="ssh -i $PROD_KEY -p $PROD_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes -o ControlMaster=auto -o ControlPersist=120 -o ControlPath=$CONTROL_PATH"

host=${PROD_HOST#*@}
if [[ ! "$host" =~ ^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}$ && ! "$host" =~ \.ts\.net$ ]]; then
  echo "Refusing non-tailnet destination: $PROD_HOST" >&2
  exit 2
fi
reconcile_snapshot() {
  local temporary
  temporary=$(mktemp /tmp/mission-agent-status.XXXXXX.json)
  trap 'rm -f "$temporary"' RETURN
  python3 "$(dirname "$0")/collect-agent-observability.py" --output "$temporary" \
    && rsync -az --chown=100:101 --chmod=F640 -e "$RSYNC_SSH" "$temporary" "$PROD_HOST:$REMOTE_SNAPSHOT_DIR/agent-status.json.tmp" \
    && ssh "${SSH_OPTIONS[@]}" "$PROD_HOST" "chown 100:101 '$REMOTE_SNAPSHOT_DIR/agent-status.json.tmp'; chmod 640 '$REMOTE_SNAPSHOT_DIR/agent-status.json.tmp'; mv '$REMOTE_SNAPSHOT_DIR/agent-status.json.tmp' '$REMOTE_SNAPSHOT_DIR/agent-status.json'"
}
next_reconcile=0
last_source_hash=
last_usage_hash=
while true; do
  if [[ -s "$SOURCE" ]]; then
    source_hash=$(sha256sum "$SOURCE" | awk '{print $1}')
    if [[ "$source_hash" != "$last_source_hash" ]]; then
      ssh "${SSH_OPTIONS[@]}" "$PROD_HOST" "install -d -m 750 -o 100 -g 101 '$REMOTE_DIR'" \
        && rsync -az --chown=100:101 --chmod=F640 -e "$RSYNC_SSH" "$SOURCE" "$PROD_HOST:$REMOTE_DIR/agent-telemetry.json.tmp" \
        && ssh "${SSH_OPTIONS[@]}" "$PROD_HOST" "chown 100:101 '$REMOTE_DIR/agent-telemetry.json.tmp'; chmod 640 '$REMOTE_DIR/agent-telemetry.json.tmp'; mv '$REMOTE_DIR/agent-telemetry.json.tmp' '$REMOTE_DIR/agent-telemetry.json'" \
        && last_source_hash=$source_hash
    fi
  fi
  if [[ -s "$USAGE_SOURCE" ]]; then
    usage_hash=$(sha256sum "$USAGE_SOURCE" | awk '{print $1}')
    if [[ "$usage_hash" != "$last_usage_hash" ]]; then
      ssh "${SSH_OPTIONS[@]}" "$PROD_HOST" "install -d -m 750 -o 100 -g 101 '$REMOTE_DIR'" \
        && rsync -az --chown=100:101 --chmod=F640 -e "$RSYNC_SSH" "$USAGE_SOURCE" "$PROD_HOST:$REMOTE_DIR/token-usage.json.tmp" \
        && ssh "${SSH_OPTIONS[@]}" "$PROD_HOST" "chown 100:101 '$REMOTE_DIR/token-usage.json.tmp'; chmod 640 '$REMOTE_DIR/token-usage.json.tmp'; mv '$REMOTE_DIR/token-usage.json.tmp' '$REMOTE_DIR/token-usage.json'" \
        && last_usage_hash=$usage_hash
    fi
  fi
  now=$(date +%s)
  if (( now >= next_reconcile )); then
    (flock -n 9 || exit 0; reconcile_snapshot) 9>/tmp/mission-agent-status.lock &
    next_reconcile=$((now + RECONCILE_INTERVAL))
  fi
  sleep "$INTERVAL"
done
