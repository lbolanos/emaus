#!/usr/bin/env bash
# db-pull.sh — Descarga la base de producción de forma CONSISTENTE.
#
# Por qué no un scp directo: la DB de producción está en uso (modo WAL).
# Un `scp database.sqlite` copia el archivo a medio escribir y deja fuera el
# `-wal`, produciendo "SQLITE_CORRUPT: database disk image is malformed".
# Solución: generar un snapshot con la API de backup online de SQLite
# (`.backup`), que respeta locks y WAL, y recién entonces copiarlo.
set -euo pipefail

KEY="$HOME/.ssh/lightsail-emaus.pem"
HOST="ubuntu@18.116.102.104"
REMOTE_DB="/var/www/emaus/apps/api/database.sqlite"
REMOTE_SNAP="/tmp/emaus-pull-$$.sqlite"
LOCAL_DB="apps/api/database.sqlite"

cleanup() { ssh -i "$KEY" "$HOST" "rm -f '$REMOTE_SNAP'" 2>/dev/null || true; }
trap cleanup EXIT

echo "📸 Generando snapshot consistente en producción (con reintentos)…"
# La DB de prod (journal=delete) tiene locks frecuentes del API en horario de uso.
# `.backup` usa la API de backup online de SQLite (copia consistente aun en uso),
# pero falla con SQLITE_BUSY si no consigue una ventana sin escrituras.
# Reintentamos hasta conseguir una ventana libre (en tráfico bajo basta con pocos
# intentos). Esto es lo mismo que hace el cron de backup, que corre a las 3AM.
ssh -i "$KEY" "$HOST" bash -s "$REMOTE_DB" "$REMOTE_SNAP" <<'REMOTE'
set -euo pipefail
DB="$1"; SNAP="$2"
for i in $(seq 1 15); do
  rm -f "$SNAP"
  if sqlite3 "$DB" ".backup '$SNAP'" 2>/tmp/backup.err; then
    echo "   ✓ snapshot creado en el intento $i"
    exit 0
  fi
  echo "   … intento $i: $(cat /tmp/backup.err); reintentando en 2s"
  sleep 2
done
echo "❌ No se pudo obtener un snapshot consistente tras 15 intentos." >&2
exit 1
REMOTE

echo "⬇️  Descargando snapshot…"
scp -i "$KEY" "$HOST:$REMOTE_SNAP" "$LOCAL_DB"

echo "🔎 Verificando integridad local…"
result=$(sqlite3 "$LOCAL_DB" "PRAGMA integrity_check;" | head -1)
if [[ "$result" != "ok" ]]; then
  echo "❌ La copia descargada falló integrity_check: $result"
  exit 1
fi

echo "✅ Database copied from production (snapshot consistente, integridad ok)"
