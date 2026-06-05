#!/usr/bin/env bash
# db-watchdog.sh — Detecta un lock de ESCRITURA colgado en la DB SQLite y reinicia el API.
#
# Contexto (incidente 2026-06-04): una transacción TypeORM que nunca hizo COMMIT dejó
# la DB con un lock de escritura ~23 h. El API seguía respondiendo (desde caché), así que
# un healthcheck genérico daba 200 y nadie se enteró. Se perdieron ~23 h de capturas.
#
# Este watchdog prueba ESCRITURA real (`BEGIN IMMEDIATE; ROLLBACK`) directamente contra el
# archivo .sqlite — NO contra el API — así detecta el lock aunque el API parezca sano.
# Si el lock persiste FAIL_THRESHOLD chequeos seguidos, reinicia el API (PM2), lo que hace
# rollback de la transacción colgada y libera la DB. Pensado para correr por cron cada minuto.
#
# Config por variables de entorno (con defaults de producción):
#   DB_PATH         ruta del .sqlite                     (default /var/www/emaus/apps/api/database.sqlite)
#   PM2_APP         nombre del proceso PM2 a reiniciar   (default emaus-api)
#   TIMEOUT_MS      busy_timeout de la prueba (ms)       (default 5000)
#   FAIL_THRESHOLD  fallos consecutivos antes de reiniciar (default 3 → ~3 min con cron de 1 min)
#   STATE_FILE      archivo del contador de fallos       (default /tmp/emaus-db-watchdog.state)
#   LOG_FILE        archivo de log                       (default /var/log/emaus-db-watchdog.log)
#   ALERT_CMD       comando opcional de alerta; recibe el mensaje como $1 (default vacío)
#   DRY_RUN         "true" → no reinicia, sólo registra  (default false; lo usan las pruebas)
set -uo pipefail

DB_PATH="${DB_PATH:-/var/www/emaus/apps/api/database.sqlite}"
PM2_APP="${PM2_APP:-emaus-api}"
TIMEOUT_MS="${TIMEOUT_MS:-5000}"
FAIL_THRESHOLD="${FAIL_THRESHOLD:-3}"
STATE_FILE="${STATE_FILE:-/tmp/emaus-db-watchdog.state}"
LOG_FILE="${LOG_FILE:-/var/log/emaus-db-watchdog.log}"
ALERT_CMD="${ALERT_CMD:-}"
DRY_RUN="${DRY_RUN:-false}"

log() {
	local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
	echo "$msg"
	echo "$msg" >>"$LOG_FILE" 2>/dev/null || true
}

alert() {
	[ -n "$ALERT_CMD" ] && "$ALERT_CMD" "$1" >/dev/null 2>&1 || true
}

read_fails() { cat "$STATE_FILE" 2>/dev/null || echo 0; }
write_fails() { echo "${1:-0}" >"$STATE_FILE" 2>/dev/null || true; }

# Prueba de escritura: BEGIN IMMEDIATE toma el lock de escritor. Si hay un lock colgado,
# falla con "database is locked" tras esperar TIMEOUT_MS. ROLLBACK no modifica datos.
check_writable() {
	sqlite3 -cmd ".timeout $TIMEOUT_MS" "$DB_PATH" "BEGIN IMMEDIATE; ROLLBACK;" >/dev/null 2>&1
}

restart_api() {
	if [ "$DRY_RUN" = "true" ]; then
		log "DRY_RUN: se reiniciaría '$PM2_APP' (lock sostenido tras $FAIL_THRESHOLD chequeos)"
		return 0
	fi
	log "🔴 Lock de escritura sostenido tras $FAIL_THRESHOLD chequeos → reiniciando '$PM2_APP'"
	alert "emaus DB lock detectado: reiniciando $PM2_APP"
	if pm2 restart "$PM2_APP" >/dev/null 2>&1; then
		log "✅ '$PM2_APP' reiniciado (rollback de la transacción colgada)"
	else
		log "❌ Falló 'pm2 restart $PM2_APP' — intervención manual requerida"
		alert "emaus DB watchdog: pm2 restart FALLÓ, intervención manual"
	fi
}

main() {
	if [ ! -f "$DB_PATH" ]; then
		log "⚠️ DB no encontrada: $DB_PATH"
		exit 0
	fi

	if check_writable; then
		local prev
		prev=$(read_fails)
		[ "${prev:-0}" -gt 0 ] 2>/dev/null && log "✅ DB escribible de nuevo (reset tras $prev fallo(s))"
		write_fails 0
		exit 0
	fi

	# No escribible → incrementar contador de fallos consecutivos.
	local fails
	fails=$(( $(read_fails) + 1 ))
	write_fails "$fails"
	log "⚠️ DB NO escribible (database is locked) — fallo $fails/$FAIL_THRESHOLD"

	if [ "$fails" -ge "$FAIL_THRESHOLD" ]; then
		restart_api
		write_fails 0
	fi
}

main "$@"
