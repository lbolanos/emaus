#!/usr/bin/env bash
# Stop all running SSH tunnel processes for emaus
set -euo pipefail

HOST="3.138.49.105"
KILLED=0

# Kill autossh processes
while IFS= read -r pid; do
  kill "$pid" 2>/dev/null && ((KILLED++)) || true
done < <(pgrep -f "autossh.*${HOST}" 2>/dev/null || true)

# Kill plain SSH tunnel processes
while IFS= read -r pid; do
  kill "$pid" 2>/dev/null && ((KILLED++)) || true
done < <(pgrep -f "ssh.*-R.*${HOST}" 2>/dev/null || true)

# Clean up autossh pidfile
rm -f /tmp/emaus-tunnel.pid

if [ "$KILLED" -gt 0 ]; then
  echo "Stopped $KILLED tunnel process(es)."
else
  echo "No active tunnels found."
fi
