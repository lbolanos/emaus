#!/usr/bin/env bash
# Graba el video-demo del Minuto a Minuto dejando la DB de dev intacta.
#
# El retiro de demo (Celaya) no tiene agenda propia. Creamos una agenda FRESCA
# (baseDate=hoy → aparece la línea "AHORA" en tiempo real), grabamos, y la BORRAMOS
# al terminar. Todo por el API (materialize + DELETE), nunca por sqlite directo.
#
#   bash apps/web/e2e/demo/run-minuto-a-minuto.sh
#
# Requiere: dev arriba (web 5173 + API 3084) y apps/web/e2e/demo/.env con la key.
# ⚠️ NUNCA agregues aquí backup/restore por `sqlite3` contra la DB viva.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT/apps/web"

echo "🌱 Materializando agenda de demo (baseDate=hoy)…"
MODE=materialize node e2e/demo/mam-fixture.mjs

echo "🎥 Grabando…"
node e2e/demo/record-minuto-a-minuto.mjs

echo "🧹 Borrando la agenda de demo (retiro vuelve a 0 items)…"
MODE=clear node e2e/demo/mam-fixture.mjs

echo "✅ Listo. MP4 en apps/web/e2e/demo/output/minuto-a-minuto-demo.mp4"
