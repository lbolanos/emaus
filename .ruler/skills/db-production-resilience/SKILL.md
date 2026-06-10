---
name: db-production-resilience
description: MUST be used al operar la base SQLite de producción o el pipeline de deploy/migraciones — descargar la DB de prod (make db-pull), backups, recuperar una DB corrupta, diagnosticar/liberar un lock colgado, el watchdog de auto-recuperación, y por qué una migración puede quedar "pending" en prod aunque el deploy salga verde. Triggers — "make db-pull", "db:pull", "database is locked", "SQLITE_CORRUPT", "disk image is malformed", "backup de prod", "restaurar backup", "No pending migrations en prod", "Unknown file extension .ts", "la migración no corrió en prod", "el deploy no aplicó la migración", "lock colgado", "WAL", "busy_timeout", "watchdog", "transacción colgada".
---

# Resiliencia de la base de datos en producción

Incidente fundacional: **2026-06-04**. Una `AppDataSource.transaction()` que nunca hizo
`COMMIT` (event loop atascado bajo presión de memoria, driver `sqlite3` async sin timeouts)
dejó la DB de prod con un **lock de escritura ~23 h**. El API seguía respondiendo desde caché,
así que nadie lo notó; se perdieron ~23 h de capturas (mesas, responsabilidades) que parecían
guardarse pero **nunca se persistieron**. Doc completo: `docs/features/db-resilience-incident-2026-06-04.md`.

---

## 1. Descargar la DB de prod — `make db-pull`

**NUNCA** hagas `scp database.sqlite` directo del archivo vivo: copia páginas a medio escribir
y deja fuera el `-wal`/`-journal` → `SQLITE_CORRUPT: database disk image is malformed`.

Usa **`make db-pull`** (→ `scripts/db-pull.sh`): hace `sqlite3 ".backup"` en el server (API de
backup online, consistente con WAL), reintenta si hay contención, baja el snapshot y verifica
`PRAGMA integrity_check` antes de aceptarlo.

**Segundo modo de corrupción — la transferencia, no el snapshot (incidente 2026-06-09).**
`scp` **no verifica checksum**, así que un glitch de red puede entregar un archivo malformado
sin error aunque el snapshot del server esté íntegro. Señales de que el problema es la red (no
prod): `integrity_check` en el server da `ok` pero la copia local da `malformed`, y el header es
válido (`SQLite format 3`). Diagnóstico de 30s para aislar dónde está la corrupción:
```bash
# 1) ¿Prod sana? (readonly directo, no modifica nada)
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
  "sqlite3 -readonly 'file:/var/www/emaus/apps/api/database.sqlite?mode=ro' 'PRAGMA integrity_check;'"
# 2) ¿El snapshot .backup del server es bueno? compara su md5 contra la copia local.
#    md5 igual + integrity ok en server → la corrupción fue el scp → re-descargá.
```
El script **endurecido** (post-incidente) ya cierra este hueco: baja a un **temporal**, compara
**MD5 server↔local** + `integrity_check`, **reintenta la descarga** (5x) si difieren, y sólo
entonces hace `mv` atómico sobre `apps/api/database.sqlite`. La versión vieja escribía `scp`
directo sobre la DB local y verificaba **después**, así que una transferencia corrupta
**sobrescribía la DB de trabajo** antes de detectar el fallo. Si tocas el script, mantené el orden:
*temporal → verificar (md5 + integridad) → mv*. Nunca escribas el `scp` directo sobre `LOCAL_DB`.

**Recuperar una copia corrupta** que ya bajaste:
```bash
sqlite3 corrupta.sqlite ".recover" | sqlite3 nueva.sqlite
sqlite3 nueva.sqlite "PRAGMA integrity_check;"   # debe decir 'ok'
```

## 2. WAL + timeouts (ya en prod)

`apps/api/src/database/config.ts` (rama sqlite) tiene `enableWAL: true`, `busyTimeout: 5000`,
`busyErrorRetry: 3000`, `maxQueryExecutionTime: 5000`. WAL hace que lectores/backups **no se
bloqueen** por un escritor.

**Regla operativa con WAL**: respaldos manuales SIEMPRE con `sqlite3 db ".backup destino"`,
**nunca** `cp`/`scp` directo (perderían lo que está en `-wal`). `.backup` sí incluye el WAL.
Los `database.sqlite-wal`/`-shm` están en `.gitignore`.

## 3. Lock de escritura colgado — diagnóstico y liberación

Síntomas: un *readonly open* y `.backup` fallan con `database is locked` **sostenido** (no
esporádico); el `-journal` persiste y **crece**; los backups del cron generan archivos de
**0 bytes**; el API responde (caché) pero nada se guarda.

```bash
# ¿La DB acepta escritura? (no modifica nada)
sqlite3 -cmd ".timeout 4000" database.sqlite "BEGIN IMMEDIATE; ROLLBACK; SELECT 'ok';"
# Datar el inicio del lock: último write guardado = donde se cuelga
sqlite3 -readonly "file:database.sqlite?mode=ro" "SELECT max(createdAt) FROM telemetry_metrics;"
```
**Liberar**: `pm2 stop emaus-api` → la conexión cierra y SQLite hace **rollback** de la txn
colgada (cero pérdida de datos *commiteados*) → `pm2 start emaus-api`. Saca un `.backup` con la
DB libre antes de arrancar si quieres el snapshot más fresco.

## 4. Watchdog de auto-recuperación (instalado en prod)

`scripts/db-watchdog.sh` (cron cada minuto) prueba escritura real (`BEGIN IMMEDIATE`) **directo
al `.sqlite`, no al API** (el API engaña con caché). Si la DB queda locked `FAIL_THRESHOLD=3`
chequeos seguidos → `pm2 restart emaus-api`. Log: `/var/log/emaus-db-watchdog.log`.
Pruebas: `bash scripts/tests/db-watchdog.test.sh` (6/6). Doc: `docs/features/db-watchdog.md`.

## 5. ⚠️ Migraciones que NO corren en prod (deploy verde, "No pending migrations")

Dos trampas independientes del pipeline de migraciones:

**(a) El deploy debe sincronizar `src/`.** `migration:run` corre `vite-node src/cli/migration-cli.ts`
y busca los `.ts` en `src/migrations/sqlite/`. El deploy históricamente solo subía `dist/`, así que
`src/` quedaba congelado y las migraciones nuevas eran **invisibles** ("No pending migrations" pese
a deploys verdes). `deploy-production.yml` ahora hace `rsync apps/api/src/` antes del `migration:run`
— **no lo quites**.

**(b) Una migración de prod NO debe importar `@repo/types`** (ni nada que encadene a un paquete del
workspace cuyo `main` sea un `.ts`). El loader hace `await import(migración.ts)` y `@repo/types`
declara `"main": "./src/index.ts"`; en prod ese import transitivo cae en Node nativo →
`Unknown file extension ".ts" for packages/types/src/index.ts` → la migración **queda pending
para siempre** (en local sí corre, porque vite-node resuelve el workspace). `ServiceTeamType` es un
**enum** (valor runtime), no se puede `import type`.

**Patrón correcto para migraciones de datos** (las que sí corren en prod): importar **solo `typeorm`
+ `uuid`/`bcrypt`** y embeber los valores como literales / SQL plano. Ejemplos que corrieron limpio:
`AssignSanAgustinTables`, `AddComprasSacerdotesTeams`, `AddMissingServiceTeams` (reescrita con los
3 equipos inline en vez de `defaultServiceTeams`). Para extraer valores del template sin transcribir:
```bash
# vite-node evalúa el .ts y dumpea JSON exacto
npx vite-node script_que_importa_y_console.log_JSON.ts
```
Verificar en prod que una migración corrió: `pnpm migration:show` (Executed / **Pending: 0**) y/o
contar el efecto de datos.

> Cualquier cambio de **schema** sigue el patrón de `sqlite-migrations` (recreate-table, `transaction = false`).
> Este skill cubre la capa de **operación/pipeline en producción**.

## 6. Backups

- Cron diario **3:00 AM** server (`/var/www/emaus/backup-db.sh`, usa `.backup` → S3, retención 90d).
- El CI/CD hace un `.backup` pre-migración en cada deploy (`/var/backups/emaus/emaus_<ts>.sqlite.gz`).
- Backups locales del incidente archivados fuera del repo en `~/emaus-db-backups/`.
- Un backup de **0 bytes** en `/var/backups/emaus/` es la firma de un `.backup` que falló por lock.

## Roadmap pendiente (ver TODO.md sección 🗄️)
better-sqlite3 (driver síncrono, elimina la txn colgada), guardado confirmado en el frontend
(la UI mostró "guardado" sin confirmar → causó la pérdida), arreglo de fondo de `@repo/types`,
y mejora del deploy (subir `assets/` antes que `index.html` para evitar el 404 transitorio).
