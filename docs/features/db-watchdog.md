# DB Watchdog — auto-recuperación de locks de escritura colgados

## Por qué existe

El **2026-06-04** una transacción TypeORM que nunca hizo `COMMIT` dejó la base SQLite de
producción con un **lock de escritura durante ~23 horas**. El API seguía respondiendo (servía
lecturas desde caché), así que un healthcheck genérico daba `200` y **nadie se dio cuenta**.
Resultado: ~23 h de capturas (mesas, responsabilidades…) que parecían guardarse pero **nunca se
persistieron**, y se perdieron al reiniciar.

El watchdog convierte ese escenario de *"23 h de pérdida silenciosa"* en *"~3 minutos y auto-recuperación"*.

## Qué hace

`scripts/db-watchdog.sh` prueba **escritura real** contra el archivo `.sqlite`
(`BEGIN IMMEDIATE; ROLLBACK;`) — **no** contra el API. Por eso detecta el lock aunque el API
parezca sano (que fue exactamente el punto ciego del incidente).

- Si la DB es escribible → no hace nada (resetea el contador).
- Si NO es escribible (lock) → incrementa un contador de fallos consecutivos.
- Si el lock persiste `FAIL_THRESHOLD` chequeos seguidos → `pm2 restart emaus-api`, lo que hace
  **rollback de la transacción colgada** y libera la DB. Luego resetea el contador.

El umbral de fallos consecutivos evita falsos positivos: una escritura legítima dura milisegundos,
nunca varios minutos seguidos.

## Configuración (variables de entorno)

| Variable | Default | Descripción |
|---|---|---|
| `DB_PATH` | `/var/www/emaus/apps/api/database.sqlite` | Ruta del `.sqlite` |
| `PM2_APP` | `emaus-api` | Proceso PM2 a reiniciar |
| `TIMEOUT_MS` | `5000` | `busy_timeout` de la prueba (ms) |
| `FAIL_THRESHOLD` | `3` | Fallos consecutivos antes de reiniciar (~3 min con cron de 1 min) |
| `STATE_FILE` | `/tmp/emaus-db-watchdog.state` | Contador de fallos consecutivos |
| `LOG_FILE` | `/var/log/emaus-db-watchdog.log` | Log de eventos |
| `ALERT_CMD` | (vacío) | Comando opcional de alerta; recibe el mensaje como `$1` |
| `DRY_RUN` | `false` | `true` → no reinicia, sólo registra (lo usan las pruebas) |

## Instalación en producción

```bash
# 1. Copiar el script al servidor (lo hace el deploy vía rsync de src/scripts; o manual):
scp -i ~/.ssh/lightsail-emaus.pem scripts/db-watchdog.sh \
    ubuntu@18.116.102.104:/var/www/emaus/scripts/db-watchdog.sh

# 2. Permisos + log
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
  "chmod +x /var/www/emaus/scripts/db-watchdog.sh && sudo touch /var/log/emaus-db-watchdog.log && sudo chown ubuntu /var/log/emaus-db-watchdog.log"

# 3. Cron cada minuto (idempotente: no duplica la línea)
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
  "( crontab -l 2>/dev/null | grep -v db-watchdog.sh; echo '* * * * * /var/www/emaus/scripts/db-watchdog.sh >/dev/null 2>&1' ) | crontab -"
```

## Operación

```bash
# Ver el log del watchdog
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 "tail -20 /var/log/emaus-db-watchdog.log"

# Probar a mano (modo dry-run, no reinicia)
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 "DRY_RUN=true /var/www/emaus/scripts/db-watchdog.sh"
```

En operación normal el log queda en silencio. Sólo escribe cuando detecta un lock o reinicia.

## Pruebas

```bash
bash scripts/tests/db-watchdog.test.sh
```

La prueba crea una DB temporal en WAL, abre una transacción `BEGIN IMMEDIATE` colgada para simular
el lock, y verifica: detección, conteo de fallos consecutivos, disparo del restart al umbral
(en `DRY_RUN`), y reseteo al liberarse el lock. No toca producción ni PM2.

## Relación con el resto de la mitigación

El watchdog es la **red de seguridad** (detección + auto-recuperación). No elimina la causa raíz;
para eso ver el roadmap en
[`db-resilience-incident-2026-06-04.md`](db-resilience-incident-2026-06-04.md):
WAL (ya en prod), `better-sqlite3`, transacciones cortas y guardado confirmado en el frontend.
