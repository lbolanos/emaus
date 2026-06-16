#!/usr/bin/env bash
# db-pull.sh — Descarga la base de producción de forma CONSISTENTE y VERIFICADA.
#
# Por qué no un scp directo del .sqlite vivo: la DB de producción está en uso
# (modo WAL). Un `scp database.sqlite` copia el archivo a medio escribir y deja
# fuera el `-wal`, produciendo "SQLITE_CORRUPT: database disk image is malformed".
# Solución: generar un snapshot con la API de backup online de SQLite (`.backup`),
# que respeta locks y WAL, y recién entonces copiarlo.
#
# Por qué la verificación de transferencia: `scp` NO verifica checksum, así que un
# glitch de red puede entregar un archivo corrupto sin error (incidente 2026-06-09:
# un snapshot íntegro en el server llegó malformado y SOBRESCRIBIÓ la DB local de
# trabajo porque el script verificaba DESPUÉS de pisar el destino). Por eso ahora:
#   1) snapshot consistente en el server + integridad EN EL SERVER (descarta DB corrupta de prod)
#   2) descarga a un TEMPORAL (nunca sobre la DB local hasta validar)
#   3) compara MD5 server↔local y corre integrity_check; REINTENTA la descarga si falla
#   4) sólo entonces mueve atómicamente el temporal sobre apps/api/database.sqlite
set -euo pipefail

KEY="$HOME/.ssh/lightsail-emaus.pem"
HOST="ubuntu@18.116.102.104"
REMOTE_DB="/var/www/emaus/apps/api/database.sqlite"
REMOTE_SNAP="/tmp/emaus-pull-$$.sqlite"
LOCAL_DB="apps/api/database.sqlite"
LOCAL_TMP="${LOCAL_DB}.pull-$$.tmp"
DOWNLOAD_RETRIES=5

cleanup() {
  ssh -i "$KEY" "$HOST" "rm -f '$REMOTE_SNAP'" 2>/dev/null || true
  # El temporal y los wal/shm que el integrity_check pudo crear sobre él.
  rm -f "$LOCAL_TMP" "${LOCAL_TMP}-wal" "${LOCAL_TMP}-shm" 2>/dev/null || true
}
trap cleanup EXIT

echo "📸 Generando snapshot consistente en producción (con reintentos)…"
# La DB de prod (WAL) tiene locks frecuentes del API en horario de uso.
# `.backup` usa la API de backup online de SQLite (copia consistente aun en uso),
# pero falla con SQLITE_BUSY si no consigue una ventana sin escrituras.
# Reintentamos hasta conseguir una ventana libre. Además verificamos la integridad
# del snapshot EN EL SERVER: si falla, el problema es la DB de prod (no la red) y
# abortamos sin tocar nada local.
REMOTE_MD5=$(ssh -i "$KEY" "$HOST" bash -s "$REMOTE_DB" "$REMOTE_SNAP" <<'REMOTE'
set -euo pipefail
# Snapshot = copia COMPLETA de la DB de prod (hashes bcrypt, PII, sesiones). En un
# host potencialmente multiusuario, crearlo world-readable en /tmp lo expone. umask
# 077 → el .backup nace 600; el log de error usa nombre con $$ (no fijo, no pisable).
umask 077
DB="$1"; SNAP="$2"
ERRLOG="/tmp/emaus-backup-$$.err"
trap 'rm -f "$ERRLOG"' EXIT
for i in $(seq 1 15); do
  rm -f "$SNAP"
  if sqlite3 "$DB" ".backup '$SNAP'" 2>"$ERRLOG"; then
    chmod 600 "$SNAP" 2>/dev/null || true
    echo "   ✓ snapshot creado en el intento $i" >&2
    break
  fi
  echo "   … intento $i: $(cat "$ERRLOG"); reintentando en 2s" >&2
  sleep 2
  if [[ "$i" == 15 ]]; then
    echo "❌ No se pudo obtener un snapshot consistente tras 15 intentos." >&2
    exit 1
  fi
done
snap_check=$(sqlite3 "$SNAP" "PRAGMA integrity_check;" | head -1)
if [[ "$snap_check" != "ok" ]]; then
  echo "❌ El snapshot EN EL SERVER falló integrity_check: $snap_check" >&2
  echo "   → La DB de PRODUCCIÓN podría estar corrupta. Abortando (no se tocó nada local)." >&2
  exit 1
fi
# Última línea de stdout = el MD5 que consume el script local
md5sum "$SNAP" | cut -d' ' -f1
REMOTE
)
echo "   ✓ snapshot íntegro en el server (md5 ${REMOTE_MD5})"

echo "⬇️  Descargando snapshot (con verificación de transferencia)…"
ok=0
for attempt in $(seq 1 "$DOWNLOAD_RETRIES"); do
  rm -f "$LOCAL_TMP"
  if ! scp -i "$KEY" "$HOST:$REMOTE_SNAP" "$LOCAL_TMP"; then
    echo "   … intento $attempt: scp falló; reintentando…"
    sleep 2; continue
  fi
  # md5 (macOS usa `md5 -q`, Linux usa `md5sum`)
  if command -v md5 >/dev/null 2>&1; then
    local_md5=$(md5 -q "$LOCAL_TMP")
  else
    local_md5=$(md5sum "$LOCAL_TMP" | cut -d' ' -f1)
  fi
  if [[ "$local_md5" != "$REMOTE_MD5" ]]; then
    echo "   … intento $attempt: MD5 no coincide (transferencia corrupta: $local_md5 ≠ $REMOTE_MD5); reintentando…"
    sleep 2; continue
  fi
  local_check=$(sqlite3 "$LOCAL_TMP" "PRAGMA integrity_check;" | head -1)
  if [[ "$local_check" != "ok" ]]; then
    echo "   … intento $attempt: integrity_check local falló ($local_check); reintentando…"
    sleep 2; continue
  fi
  ok=1
  echo "   ✓ descarga verificada en el intento $attempt (MD5 + integridad ok)"
  break
done

if [[ "$ok" != 1 ]]; then
  echo "❌ No se pudo descargar una copia íntegra tras $DOWNLOAD_RETRIES intentos."
  echo "   Tu DB local NO fue modificada (apps/api/database.sqlite intacta)."
  exit 1
fi

# Reemplazo atómico: sólo aquí tocamos la DB local. El snapshot `.backup` ya es
# una DB completa y consistente; descartamos los wal/shm efímeros que el
# integrity_check creó sobre el temporal (no contienen cambios) y los huérfanos
# de la DB local previa, para que sólo quede el archivo principal.
rm -f "${LOCAL_TMP}-wal" "${LOCAL_TMP}-shm"
rm -f "${LOCAL_DB}-wal" "${LOCAL_DB}-shm"
mv -f "$LOCAL_TMP" "$LOCAL_DB"

echo "✅ Database copied from production (snapshot consistente, MD5 e integridad verificados)"
