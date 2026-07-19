#!/usr/bin/env bash
# collect-live-throughput.sh — samples live tailscale interface bytes/sec for every
# tailnet node and writes per-node rx/tx bps into network-history.db (live_throughput).
#
# Runs from bazza. Reads /proc/net/dev on each host twice (SAMPLE_GAP apart), computes
# the delta, converts to bytes/sec. Follows the same node list + DB conventions as
# run-iperf.sh. Intended to run frequently (e.g. every 15-30s via a systemd timer or loop).
set -euo pipefail

DB="/root/.openclaw/workspace/mission-control/network-history.db"
IFACE="tailscale0"
SAMPLE_GAP="${SAMPLE_GAP:-2}"           # seconds between the two counter reads
LOCK_FILE="/tmp/mission-control-live.lock"

# node_id -> "user@ip:port:keyname"  (bazza is local; access verified 2026-07-20)
# prod/sec1/backup-melb use prod_deploy_v3; crm8 + shazza use id_ed25519.
declare -A NODES
NODES[prod]="root@100.95.166.47:2222:prod_deploy_v3"
NODES[crm8]="root@100.112.179.70:2222:id_ed25519"
NODES[sec1]="root@100.122.8.93:2222:prod_deploy_v3"
NODES[backup-melb]="root@100.110.100.97:2222:prod_deploy_v3"
NODES[shazza]="jeffa@100.113.217.81:22:id_ed25519"

# awk program to pull rx (col2) + tx (col10) for $IFACE from /proc/net/dev,
# base64-encoded so it survives nested ssh quoting intact.
AWK_PROG="awk -v i=\"${IFACE}:\" '\$1==i{print \$2, \$10}' /proc/net/dev"
AWK_B64=$(printf '%s' "$AWK_PROG" | base64 -w0)

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another live collection is already running" >&2; exit 0; }

# Reads two /proc/net/dev samples for $IFACE on a host and prints "rx_bps tx_bps".
# Arg1: command prefix to execute remotely/locally (a function that runs a snippet).
read_bps() {
  local runner="$1"
  local snippet="awk -v i=\"$IFACE:\" '\$1==i{print \$2, \$10}' /proc/net/dev"
  local s1 s2 rx1 tx1 rx2 tx2
  s1=$($runner "$snippet") || return 1
  sleep "$SAMPLE_GAP"
  s2=$($runner "$snippet") || return 1
  read -r rx1 tx1 <<<"$s1"
  read -r rx2 tx2 <<<"$s2"
  [[ -n "${rx1:-}" && -n "${rx2:-}" ]] || return 1
  # bytes/sec over the gap
  awk -v a="$rx1" -v b="$rx2" -v c="$tx1" -v d="$tx2" -v g="$SAMPLE_GAP" \
    'BEGIN{ r=(b-a)/g; t=(d-c)/g; if(r<0)r=0; if(t<0)t=0; printf "%.0f %.0f", r, t }'
}

run_local()  { bash -c "$1"; }
declare -A RESULTS
# bazza (local)
if out=$(read_bps run_local 2>/dev/null); then RESULTS[bazza]="$IFACE $out"; fi

# remote nodes
for id in "${!NODES[@]}"; do
  spec="${NODES[$id]}"
  keyname="${spec##*:}"; rest="${spec%:*}"; port="${rest##*:}"; hostport="${rest%:*}"
  key="/root/.ssh/${keyname}"
  # Two counter samples in one ssh round-trip; awk decoded from base64 on the far side.
  remote_snip="P=\$(echo $AWK_B64 | base64 -d); a=\$(eval \"\$P\"); sleep $SAMPLE_GAP; b=\$(eval \"\$P\"); echo \"\$a \$b\""
  if raw=$(ssh -i "$key" -p "$port" -o BatchMode=yes -o ConnectTimeout=6 \
           -o StrictHostKeyChecking=no "$hostport" "$remote_snip" 2>/dev/null); then
    read -r rx1 tx1 rx2 tx2 <<<"$raw"
    if [[ -n "${rx1:-}" && -n "${rx2:-}" ]]; then
      bps=$(awk -v a="$rx1" -v b="$rx2" -v c="$tx1" -v d="$tx2" -v g="$SAMPLE_GAP" \
        'BEGIN{ r=(b-a)/g; t=(d-c)/g; if(r<0)r=0; if(t<0)t=0; printf "%.0f %.0f", r, t }')
      RESULTS[$id]="$IFACE $bps"
    fi
  fi
done

# Write to DB
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Build python insert dynamically (pass results via env to avoid quoting hell)
{
  echo "import sqlite3"
  echo "con=sqlite3.connect('$DB', timeout=15)"
  echo "con.execute('PRAGMA journal_mode=WAL')"
  echo "con.execute('PRAGMA busy_timeout=15000')"
  echo "con.execute('PRAGMA synchronous=NORMAL')"
  echo "cur=con.cursor(); n=0"
  for id in "${!RESULTS[@]}"; do
    read -r iface rx tx <<<"${RESULTS[$id]}"
    echo "cur.execute('INSERT INTO live_throughput (ts,node_id,iface,rx_bps,tx_bps) VALUES (?,?,?,?,?)', ('$TS','$id','$iface',$rx,$tx)); n+=1"
  done
  echo "con.commit(); con.close(); print(f'live_throughput: wrote {n} node rows at $TS')"
} | python3
