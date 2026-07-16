#!/usr/bin/env bash
# init-network-db.sh — create SQLite network history DB on bazza
set -euo pipefail

DB="/root/.openclaw/workspace/mission-control/network-history.db"

python3 - "$DB" <<'PYEOF'
import sqlite3, sys

db_path = sys.argv[1]
con = sqlite3.connect(db_path)
cur = con.cursor()

cur.executescript("""
CREATE TABLE IF NOT EXISTS iperf_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  node_id     TEXT NOT NULL,
  mbps_send   REAL,
  mbps_recv   REAL,
  rtt_ms      REAL,
  retransmits INTEGER
);
CREATE INDEX IF NOT EXISTS idx_iperf_ts   ON iperf_history(ts);
CREATE INDEX IF NOT EXISTS idx_iperf_node ON iperf_history(node_id, ts);

CREATE TABLE IF NOT EXISTS ping_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL,
  node_id  TEXT NOT NULL,
  ping_ms  REAL
);
CREATE INDEX IF NOT EXISTS idx_ping_ts   ON ping_history(ts);
CREATE INDEX IF NOT EXISTS idx_ping_node ON ping_history(node_id, ts);

DELETE FROM iperf_history
WHERE id NOT IN (SELECT MIN(id) FROM iperf_history GROUP BY ts, node_id);
DELETE FROM ping_history
WHERE id NOT IN (SELECT MIN(id) FROM ping_history GROUP BY ts, node_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_iperf_ts_node ON iperf_history(ts, node_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ping_ts_node ON ping_history(ts, node_id);
""")

con.commit()
con.close()
print(f"DB initialised: {db_path}")
PYEOF
