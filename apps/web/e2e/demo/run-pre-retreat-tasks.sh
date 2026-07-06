#!/usr/bin/env bash
# Graba el video-demo de Tareas Pre-Retiro dejando la DB de dev intacta.
#
# La grabación MUTA la DB (marca una tarea, asigna un responsable). En vez de
# respaldar/restaurar el archivo sqlite por CLI —peligroso con la DB en WAL viva:
# provoca divergencia de inodos y hasta pérdida de datos— reseteamos por el API:
#   1) re-materializamos el retiro de demo (estado limpio y poblado) ANTES,
#   2) grabamos,
#   3) re-materializamos de nuevo DESPUÉS (revierte las mutaciones de la toma).
#
# La re-materialización usa el endpoint real (modo "Reemplazar todo"), que es
# determinista desde retreat.startDate. Solo afecta las tareas del retiro de demo.
#
#   bash apps/web/e2e/demo/run-pre-retreat-tasks.sh
#
# Requiere: dev arriba (web 5173 + API 3084) y apps/web/e2e/demo/.env con la key.
# ⚠️ NUNCA agregues aquí backup/restore por `sqlite3` contra la DB viva.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT/apps/web"

echo "🌱 Estado limpio del retiro de demo (re-materializar)…"
node e2e/demo/reset-tasks.mjs

echo "🎥 Grabando…"
node e2e/demo/record-pre-retreat-tasks.mjs

echo "♻️  Revirtiendo las mutaciones de la toma (re-materializar)…"
node e2e/demo/reset-tasks.mjs

echo "✅ Listo. MP4 en apps/web/e2e/demo/output/tareas-pre-retiro-demo.mp4"
