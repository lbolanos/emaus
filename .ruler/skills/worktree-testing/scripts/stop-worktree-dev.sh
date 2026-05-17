#!/usr/bin/env bash
# Detiene el dev paralelo del worktree (API:3002 + web:5174).
# Uso (desde cualquier directorio):
#   bash .ruler/skills/worktree-testing/scripts/stop-worktree-dev.sh

set -euo pipefail

API_PORT=3002
WEB_PORT=5174

KILLED=0

for PORT in $API_PORT $WEB_PORT; do
  PIDS=$(lsof -ti ":$PORT" 2>/dev/null || true)
  if [[ -n "$PIDS" ]]; then
    echo "→ Matando procesos en :$PORT (PIDs: $PIDS)"
    echo "$PIDS" | xargs kill -KILL 2>/dev/null || true
    KILLED=$((KILLED + 1))
  fi
done

if (( KILLED == 0 )); then
  echo "Nada corriendo en :$API_PORT ni :$WEB_PORT."
else
  echo "✓ Detenido."
fi
