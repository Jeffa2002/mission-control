#!/usr/bin/env bash
# telemetry-freshness-check.sh — dead-man's switch for Mission Control telemetry.
#
# Checks the mtime of every telemetry file the panel depends on (bazza sources
# and prod targets). Exits non-zero with STALE lines when any source stops
# updating, so the cron failureAlert reaches Jeff. Created 2026-08-27 after the
# bazza->prod sync died silently for 17 days (2026-08-10..27) with no alert.
#
# Thresholds are generous: sync runs every minute, network-history snapshot
# every 10 minutes, iperf source hourly.

set -u

REPO="/root/.openclaw/workspace/mission-control"
SSH_OPTS=(-i /root/.ssh/prod_deploy_v3 -p 2222 -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10)
PROD_HOST="root@100.95.166.47"
NOW=$(date +%s)
STALE=()

check_local() {
  local file="$1" max_age_min="$2" label="$3"
  if [ ! -f "$file" ]; then
    STALE+=("$label: missing ($file)")
    return
  fi
  local age=$(( (NOW - $(stat -c %Y "$file")) / 60 ))
  if [ "$age" -gt "$max_age_min" ]; then
    STALE+=("$label: ${age}m old (limit ${max_age_min}m)")
  fi
}

check_prod() {
  local file="$1" max_age_min="$2" label="$3"
  local mtime
  mtime=$(ssh "${SSH_OPTS[@]}" "$PROD_HOST" "stat -c %Y '$file' 2>/dev/null" 2>/dev/null)
  if [ -z "$mtime" ]; then
    STALE+=("$label: unreachable or missing ($file)")
    return
  fi
  local age=$(( (NOW - mtime) / 60 ))
  if [ "$age" -gt "$max_age_min" ]; then
    STALE+=("$label: ${age}m old (limit ${max_age_min}m)")
  fi
}

# bazza collector sources
check_local "$REPO/runtime/agent-telemetry.json" 15 "bazza agent telemetry"
check_local "$REPO/runtime/token-usage.json" 15 "bazza token usage"
check_local "$REPO/network-history.db" 15 "bazza network history"
check_local "$REPO/agent-status.json" 15 "bazza agent snapshot"

# prod telemetry targets
check_prod "/root/.openclaw/agents/agent-status.json" 15 "prod agent status"
check_prod "/root/.openclaw/agents/security-data.json" 15 "prod security data"
check_prod "/root/.openclaw/agents/network-history.db" 25 "prod network history"
check_prod "/root/.openclaw/agents/iperf-results.json" 150 "prod iperf results"

if [ ${#STALE[@]} -gt 0 ]; then
  printf 'STALE %s\n' "${STALE[@]}"
  exit 1
fi
echo '{"healthy":true,"failures":[]}'
