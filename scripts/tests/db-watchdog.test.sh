#!/usr/bin/env bash
# Prueba de scripts/db-watchdog.sh — simula un lock de escritura colgado y verifica
# que el watchdog lo detecta, cuenta fallos consecutivos, dispara el restart al
# alcanzar el umbral (en DRY_RUN), y se resetea cuando la DB vuelve a ser escribible.
#
# No toca producción ni PM2: usa una DB temporal y DRY_RUN=true.
# Uso: bash scripts/tests/db-watchdog.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCHDOG="$SCRIPT_DIR/db-watchdog.sh"
TMP="$(mktemp -d)"
DB="$TMP/test.sqlite"
STATE="$TMP/state"
LOG="$TMP/log"
LOCK_PID=""
PASS=0
FAIL=0

cleanup() {
	[ -n "$LOCK_PID" ] && kill "$LOCK_PID" 2>/dev/null
	rm -rf "$TMP"
}
trap cleanup EXIT

assert() { # $1 desc, $2 condición (eval)
	if eval "$2"; then
		echo "  ✅ $1"
		PASS=$((PASS + 1))
	else
		echo "  ❌ $1   (cond: $2 | state=$(cat "$STATE" 2>/dev/null))"
		FAIL=$((FAIL + 1))
	fi
}

run_watchdog() {
	DB_PATH="$DB" STATE_FILE="$STATE" LOG_FILE="$LOG" \
		TIMEOUT_MS=1000 FAIL_THRESHOLD=3 DRY_RUN=true PM2_APP=fake-app \
		bash "$WATCHDOG"
}

open_hung_lock() { # mantiene una transacción de escritura abierta ~20s
	(
		printf 'BEGIN IMMEDIATE;\nSELECT 1;\n'
		sleep 20
	) | sqlite3 "$DB" >/dev/null 2>&1 &
	LOCK_PID=$!
	sleep 1 # dar tiempo a tomar el lock de escritor
}

# --- Setup: DB en WAL con una tabla ---
sqlite3 "$DB" "PRAGMA journal_mode=WAL; CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1);" >/dev/null

echo "Test 1 — DB escribible: contador en 0"
run_watchdog >/dev/null
assert "estado = 0 cuando la DB está libre" '[ "$(cat "$STATE")" = "0" ]'

echo "Test 2 — lock colgado: cuenta fallos y dispara restart al umbral"
open_hung_lock
run_watchdog >/dev/null
assert "fallo 1/3 contado" '[ "$(cat "$STATE")" = "1" ]'
run_watchdog >/dev/null
assert "fallo 2/3 contado" '[ "$(cat "$STATE")" = "2" ]'
OUT3="$(run_watchdog)"
assert "al 3/3 dispara el restart (dry-run)" 'echo "$OUT3" | grep -q "se reiniciar"'
assert "contador reseteado tras el restart" '[ "$(cat "$STATE")" = "0" ]'

echo "Test 3 — lock liberado: vuelve a escribible"
kill "$LOCK_PID" 2>/dev/null
LOCK_PID=""
sleep 1
OUT="$(run_watchdog)"
assert "vuelve a escribible (estado 0)" '[ "$(cat "$STATE")" = "0" ]'

echo ""
echo "──────────────────────────────"
echo "Resultado: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
