#!/usr/bin/env bash
set -euo pipefail

repo_dir="${MISSION_CONTROL_REPO:-/root/.openclaw/workspace/mission-control}"
vault_dir="${OBSIDIAN_VAULT:-/root/.openclaw/obsidian/vault}"
runtime_dir="$repo_dir/runtime"
projection="$runtime_dir/knowledge-index.json"
remote_tmp="/var/www/mission-control/runtime/knowledge-index.json.new"
remote_final="/var/www/mission-control/runtime/knowledge-index.json"
prod_target="${MISSION_CONTROL_PROD_TARGET:-root@100.95.166.47}"
prod_port="${MISSION_CONTROL_PROD_PORT:-2222}"
prod_key="${MISSION_CONTROL_PROD_KEY:-/root/.ssh/prod_deploy_v3}"
prod_host_alias="${MISSION_CONTROL_PROD_HOST_ALIAS:-[203.57.50.240]:2222}"
ssh_options=(-o BatchMode=yes -o "HostKeyAlias=$prod_host_alias" -p "$prod_port" -i "$prod_key")

install -d -m 0700 "$runtime_dir"
node "$repo_dir/scripts/export-knowledge.mjs" "$vault_dir" "$projection"
scp -q -o BatchMode=yes -o "HostKeyAlias=$prod_host_alias" -P "$prod_port" -i "$prod_key" "$projection" "$prod_target:$remote_tmp"
ssh "${ssh_options[@]}" "$prod_target" "install -o 100 -g 101 -m 0640 '$remote_tmp' '$remote_final' && rm -f '$remote_tmp'"
