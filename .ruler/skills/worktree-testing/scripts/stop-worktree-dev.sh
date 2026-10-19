#!/usr/bin/env bash
# Detiene el dev paralelo del worktree (API:3002 + web:5174 por default).
# Si lo levantaste con overrides de puerto, pásalos también acá:
#   API_PORT=3003 WEB_PORT=5175 bash .ruler/skills/worktree-testing/scripts/stop-worktree-dev.sh
# Uso (desde cualquier directorio):
#   bash .ruler/skills/worktree-testing/scripts/stop-worktree-dev.sh

set -euo pipefail

API_PORT="${API_PORT:-3002}"
WEB_PORT="${WEB_PORT:-5174}"

# Raíz del worktree (este script vive en <raíz>/.ruler/skills/worktree-testing/scripts)
WT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

KILLED=0

for PORT in $API_PORT $WEB_PORT; do
  PIDS=$(lsof -ti ":$PORT" 2>/dev/null || true)
  if [[ -n "$PIDS" ]]; then
    echo "→ Matando procesos en :$PORT (PIDs: $PIDS)"
    echo "$PIDS" | xargs kill -KILL 2>/dev/null || true
    KILLED=$((KILLED + 1))
  fi
done

# El nodemon padre no escucha el puerto: sobrevive al kill de arriba y relanza
# el API a los segundos (pasó el 2026-10-19 en worktree-mam-canciones). Barrer
# por línea de comando cualquier proceso de dev cuya ruta apunte a ESTE
# worktree — solo herramientas de dev, nunca cualquier proceso con la ruta.
# Solo cuando este script vive dentro de un worktree: corrido desde el
# checkout principal, el barrido se omite o mataría el dev del propio main.
sweep_dev_pids() {
  # Excluir el propio script ($$) y quien lo invocó ($PPID): un wrapper
  # `bash -c "... stop-worktree-dev.sh ... nodemon"` matchea el patrón por su
  # propio texto y se mataría a sí mismo.
  ps -Ao pid=,args= | awk -v root="$WT_ROOT" -v me="$$" -v parent="$PPID" \
    'index($0, root) > 0 && /nodemon|vite|esbuild|tsx/ && $1 != me && $1 != parent {print $1}'
}

if [[ "$WT_ROOT" == */.claude/worktrees/* ]]; then
  SWEEP_PIDS=$(sweep_dev_pids)
  if [[ -n "$SWEEP_PIDS" ]]; then
    echo "→ Matando procesos de dev del worktree (PIDs: $(echo $SWEEP_PIDS | tr '\n' ' '))"
    echo "$SWEEP_PIDS" | xargs kill -KILL 2>/dev/null || true
    KILLED=$((KILLED + 1))
  fi
fi

if (( KILLED == 0 )); then
  echo "Nada corriendo en :$API_PORT ni :$WEB_PORT."
else
  echo "✓ Detenido."
fi

# Verificación (el nodemon relanza a los segundos): re-chequear puertos y ruta.
# OJO: lsof con coma (`-i :3002,:5174`) falla en macOS con "unknown service"
# y devuelve vacío — un solo lsof por puerto, siempre.
sleep 1
LEFTOVER="$(lsof -ti ":$API_PORT" 2>/dev/null || true)"
LEFTOVER="${LEFTOVER}$(lsof -ti ":$WEB_PORT" 2>/dev/null || true)"
if [[ "$WT_ROOT" == */.claude/worktrees/* ]]; then
  LEFTOVER="${LEFTOVER}$(sweep_dev_pids)"
fi
if [[ -n "$(printf '%s' "$LEFTOVER" | tr -d '[:space:]')" ]]; then
  echo "⚠️  Quedaron procesos vivos (revisar a mano): $(printf '%s' "$LEFTOVER" | tr '\n' ' ')"
  exit 1
fi
