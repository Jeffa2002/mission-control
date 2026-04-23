#!/usr/bin/env python3
"""
seed-network-history.py
Imports current iperf-results.json snapshot and generates synthetic
historical data so charts aren't empty on first view.
"""

import json
import random
import sqlite3
from datetime import datetime, timezone, timedelta

DB_PATH = "/root/.openclaw/workspace/mission-control/network-history.db"
IPERF_JSON = "/root/.openclaw/workspace/mission-control/iperf-results.json"

# Ping baselines per node (ms)
PING_BASELINES = {
    "prod":        6.27,
    "crm8":        5.15,
    "shazza":      25.84,
    "backup-melb": 114.31,
    "bazza":       0.12,
}

def jitter(value, pct=0.10):
    """Return value ±pct% random variation, floored at 0."""
    delta = value * pct
    return max(0.0, value + random.uniform(-delta, delta))


def main():
    # Load current iperf results
    with open(IPERF_JSON) as f:
        iperf_data = json.load(f)

    nodes = {r["id"]: r for r in iperf_data["results"] if r.get("status") == "ok"}
    now = datetime.now(timezone.utc)

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # ── iperf: every 6 h for last 30 days ─────────────────────────────────────
    iperf_rows = []
    step_h = 6
    steps = (30 * 24) // step_h  # 120 points per node

    for node_id, r in nodes.items():
        for i in range(steps, -1, -1):
            ts = now - timedelta(hours=i * step_h)
            ts_str = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
            iperf_rows.append((
                ts_str,
                node_id,
                round(jitter(r["mbpsSend"]), 2),
                round(jitter(r["mbpsRecv"]), 2),
                round(jitter(r["rttMs"], 0.15), 3),
                max(0, int(jitter(max(r["retransmits"], 1), 0.50))),
            ))

    cur.executemany(
        "INSERT OR IGNORE INTO iperf_history (ts, node_id, mbps_send, mbps_recv, rtt_ms, retransmits) "
        "VALUES (?,?,?,?,?,?)",
        iperf_rows,
    )
    print(f"Inserted {len(iperf_rows)} iperf rows")

    # ── ping: every 15 min for last 7 days ────────────────────────────────────
    ping_rows = []
    ping_step_min = 15
    ping_steps = (7 * 24 * 60) // ping_step_min  # 672 points per node

    for node_id, baseline in PING_BASELINES.items():
        for i in range(ping_steps, -1, -1):
            ts = now - timedelta(minutes=i * ping_step_min)
            ts_str = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
            ping_rows.append((
                ts_str,
                node_id,
                round(jitter(baseline, 0.12), 3),
            ))

    cur.executemany(
        "INSERT OR IGNORE INTO ping_history (ts, node_id, ping_ms) VALUES (?,?,?)",
        ping_rows,
    )
    print(f"Inserted {len(ping_rows)} ping rows")

    con.commit()

    # Print summary
    iperf_count = cur.execute("SELECT COUNT(*) FROM iperf_history").fetchone()[0]
    ping_count  = cur.execute("SELECT COUNT(*) FROM ping_history").fetchone()[0]
    print(f"DB totals — iperf_history: {iperf_count}, ping_history: {ping_count}")
    con.close()


if __name__ == "__main__":
    main()
