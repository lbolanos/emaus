#!/usr/bin/env bash
# Levanta el dev de Emaús en un worktree usando puertos paralelos al main:
#   - API:  :3002 (DB aislada en apps/api/database.worktree.sqlite)
#   - Web:  :5174
# Ambos overrides por env (para correr varios worktrees a la vez):
#   API_PORT=3003 WEB_PORT=5175 bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh
# Logs en /tmp/emaus-worktree-{api,web}.log
#
# Uso (desde la raíz del worktree):
#   bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh
#
# Para detener (con los mismos overrides de puerto si los usaste):
#   bash .ruler/skills/worktree-testing/scripts/stop-worktree-dev.sh

set -euo pipefail

API_PORT="${API_PORT:-3002}"
WEB_PORT="${WEB_PORT:-5174}"
MAIN_REPO="${EMAUS_MAIN_REPO:-$HOME/Developer/personal/emaus}"
DB_NAME="database.worktree.sqlite"

# Sanity: estamos en un worktree
if [[ ! -f pnpm-workspace.yaml ]]; then
  echo "❌ Corré este script desde la raíz del worktree (donde está pnpm-workspace.yaml)" >&2
  exit 1
fi
if [[ "$PWD" == "$MAIN_REPO" ]]; then
  echo "❌ Estás en el repo principal, no en un worktree. Aborto." >&2
  exit 1
fi

# Liberar puertos por si hay procesos colgados de un run previo
echo "→ Liberando puertos $API_PORT y $WEB_PORT si están en uso..."
lsof -ti ":$API_PORT","$WEB_PORT" 2>/dev/null | xargs -r kill -KILL 2>/dev/null || true
sleep 1

# @repo/ui se sirve desde packages/ui/dist, y `pnpm install` NO construye los paquetes del
# workspace. En un worktree recién creado ese dist no existe y el web arranca roto con
# "Failed to resolve entry for package @repo/ui" — con el agravante de que un e2e que sólo
# pegue a la API no lo nota. Se construye si falta (idempotente: no rehace si ya está).
if [[ ! -f packages/ui/dist/index.es.js ]]; then
  echo "→ Construyendo @repo/ui (no existe packages/ui/dist)"
  pnpm --filter @repo/ui build
  # Vite cachea las deps optimizadas; tras generar el dist hay que invalidarla o el web
  # sigue resolviendo contra referencias muertas.
  rm -rf apps/web/node_modules/.vite
fi

# Copiar DB del main (snapshot al momento del start)
if [[ ! -f "$MAIN_REPO/apps/api/database.sqlite" ]]; then
  echo "❌ No encuentro la DB del main en $MAIN_REPO/apps/api/database.sqlite" >&2
  echo "   Ajustá EMAUS_MAIN_REPO si tu main vive en otro path." >&2
  exit 1
fi
echo "→ Copiando DB del main → apps/api/$DB_NAME"
# Los 3 archivos: sin el -wal/-shm la copia queda atrasada (o corrupta) si el
# dev del main tiene contenido aún no checkpointeado.
for EXT in "" "-wal" "-shm"; do
  SRC="$MAIN_REPO/apps/api/database.sqlite$EXT"
  [[ -f "$SRC" ]] && cp "$SRC" "apps/api/$DB_NAME$EXT"
done

# .env del API: sin MIGRATIONS_AUTO_RUN=true (y compañía) el API arranca y se
# apaga solo con "Migration verification failed" en el primer boot del worktree.
if [[ -f "$MAIN_REPO/apps/api/.env" && ! -f apps/api/.env ]]; then
  echo "→ Copiando apps/api/.env del main"
  cp "$MAIN_REPO/apps/api/.env" apps/api/.env
fi

# .env.local del web
echo "→ Escribiendo apps/web/.env.local"
cat > apps/web/.env.local <<EOF
VITE_API_URL=http://localhost:$API_PORT/api
VITE_API_PROXY_TARGET=http://localhost:$API_PORT
EOF

# runtime-config.js — workaround del bug en runtimeConfig.ts (import_meta vs import.meta)
echo "→ Escribiendo apps/web/public/runtime-config.js"
cat > apps/web/public/runtime-config.js <<EOF
window.EMAUS_RUNTIME_CONFIG = {
  apiUrl: 'http://localhost:$API_PORT/api',
  environment: 'development',
  isDevelopment: true,
  isProduction: false,
  isStaging: false,
};
EOF

# Arrancar API en background
echo "→ Arrancando API en :$API_PORT"
PORT=$API_PORT \
DB_DATABASE=$DB_NAME \
FRONTEND_URL="http://localhost:$WEB_PORT" \
  pnpm --filter api dev > /tmp/emaus-worktree-api.log 2>&1 &
API_PID=$!
echo "  PID=$API_PID, log=/tmp/emaus-worktree-api.log"

# Esperar a que API responda con CORS correcto
echo "→ Esperando API..."
TIMEOUT=60
ELAPSED=0
until curl -sf "http://localhost:$API_PORT/api/csrf-token" \
        -H "Origin: http://localhost:$WEB_PORT" -o /dev/null 2>/dev/null; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if (( ELAPSED >= TIMEOUT )); then
    echo "❌ Timeout esperando API. Revisá /tmp/emaus-worktree-api.log" >&2
    exit 1
  fi
done
echo "  ✓ API arriba"

# Arrancar web en background. OJO: sin `--` entre `dev` y los flags — pnpm
# pasa ese `--` literal a Vite y Vite lo lee como fin de opciones, con lo que
# ignoraba --port/--strictPort y arrancaba en el 5173 (chocando con el main).
echo "→ Arrancando web en :$WEB_PORT"
pnpm --filter web dev --port "$WEB_PORT" --strictPort \
  > /tmp/emaus-worktree-web.log 2>&1 &
WEB_PID=$!
echo "  PID=$WEB_PID, log=/tmp/emaus-worktree-web.log"

# Esperar al web
echo "→ Esperando web..."
ELAPSED=0
until curl -sf "http://localhost:$WEB_PORT" -o /dev/null 2>/dev/null; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if (( ELAPSED >= TIMEOUT )); then
    echo "❌ Timeout esperando web. Revisá /tmp/emaus-worktree-web.log" >&2
    exit 1
  fi
done
echo "  ✓ Web arriba"

cat <<EOF

────────────────────────────────────────────────────
✅ Dev paralelo listo
   Web:    http://localhost:$WEB_PORT
   API:    http://localhost:$API_PORT/api
   DB:     apps/api/$DB_NAME (copia aislada del main)
   Login:  leonardo.bolanos@gmail.com / 123456

   Logs:
     tail -f /tmp/emaus-worktree-api.log
     tail -f /tmp/emaus-worktree-web.log

   Para detener:
     bash .ruler/skills/worktree-testing/scripts/stop-worktree-dev.sh
────────────────────────────────────────────────────
EOF
