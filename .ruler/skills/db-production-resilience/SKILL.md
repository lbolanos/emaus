---
name: db-production-resilience
description: MUST be used al operar la base SQLite de producción o el pipeline de deploy/migraciones — descargar la DB de prod (make db-pull), backups, recuperar una DB corrupta, diagnosticar/liberar un lock colgado, el watchdog de auto-recuperación, por qué una migración puede quedar "pending" en prod aunque el deploy salga verde, y por qué un deploy falla en el healthcheck cuando el API crashea al arrancar (prod caída) + su recuperación rápida. Triggers — "make db-pull", "db:pull", "database is locked", "SQLITE_CORRUPT", "disk image is malformed", "backup de prod", "restaurar backup", "No pending migrations en prod", "Unknown file extension .ts", "la migración no corrió en prod", "el deploy no aplicó la migración", "lock colgado", "WAL", "busy_timeout", "watchdog", "transacción colgada", "falló el CI/CD", "falló el deploy", "deploy failure", "Deploy to Lightsail", "healthcheck falla", "prod caída", "API crash-loop", "__dirname is not defined", "ES module scope", "ReferenceError al arrancar".
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

### ⚠️ Después del db-pull, tu dev apunta a datos reales

`db-pull` **sobrescribe** `apps/api/database.sqlite`. A partir de ahí, `pnpm dev` no levanta un
entorno de pruebas: levanta producción en tu máquina, con los correos de la gente dentro. Y el
API arranca `messageSequenceService.startScheduledTasks()` **sin guarda de entorno**
(`src/index.ts`), un cron `0 * * * *` que hace `enrollAll()` + `processDue()`. Si tu `.env` local
tiene SMTP —lo tiene—, al dar la hora en punto salen correos de verdad a participantes de verdad.
Es la misma familia del incidente de los 164 correos retroactivos.

Antes de levantar el dev o correr e2e sobre una copia recién bajada:

```bash
cp apps/api/database.sqlite apps/api/database.e2e.sqlite   # el .gitignore ya cubre database.*.sqlite
DB_DATABASE=database.e2e.sqlite SMTP_HOST= SMTP_USER= SMTP_PASS= pnpm --filter api dev
```

La base aparte evita ensuciar la copia; el SMTP vacío es el que de verdad protege: `emailService`
comprueba `isSmtpConfigured()` (`SMTP_HOST && SMTP_USER && SMTP_PASS`) y lanza antes de enviar.
No hay credenciales de WhatsApp en el `.env` local, así que el correo es el único canal saliente.
Al terminar, borrá la copia y sus `-wal`/`-shm`.

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

**`db-pull` borra lo que sólo existe en dev, y no deja de dónde restaurarlo.** El script respalda
del lado del *servidor* (el snapshot de prod), pero su último paso es `mv -f "$LOCAL_TMP"
"$LOCAL_DB"` **sin copiar antes la base local**. Todo lo que exista únicamente en dev —un retiro
de planificación, una casa de prueba, participantes importados para ensayar— desaparece sin aviso
y sin `.bak`.

Duele especialmente en **árbol compartido**: `make db-pull` se siente como una operación local e
inocua, pero le borra el espacio de trabajo a cualquier otra sesión que esté usando esa base. Ver
skill `arbol-compartido`.

- Antes de correrlo, preguntá si alguien está usando la base de dev, o copiala:
  `cp apps/api/database.sqlite apps/api/database.pre-pull.sqlite`.
- Y si vas a construir algo en dev que costaría rehacer, **hacelo por script**. Es la diferencia
  entre perder una corrida y perder un día: en el incidente del 2026-09-03 se llevó un retiro
  completo con casa, 160 camas y 139 participantes, y reconstruirlo costó una ejecución porque
  todo estaba en scripts y el Excel de origen vivía fuera del repo.

## 2. Driver síncrono + WAL + timeouts (ya en prod)

`apps/api/src/database/config.ts` (rama sqlite) usa **`type: 'better-sqlite3'`** con
`enableWAL: true`, `maxQueryExecutionTime: 5000` y el `busy_timeout` por PRAGMA vía
`prepareDatabase` (este driver **no** acepta `busyTimeout`/`busyErrorRetry`, que eran del
asincrónico). WAL hace que lectores/backups **no se bloqueen** por un escritor.

**Por qué el driver síncrono (2026-08-25).** Con el asincrónico, TypeORM hablaba con SQLite
sobre una sola conexión y cada sentencia cedía el event loop: entre dos sentencias de una
transacción se colaba otra petición con su propio `BEGIN`. Errores característicos:

- `SQLITE_ERROR: cannot start a transaction within a transaction`
- `SQLITE_ERROR: cannot commit - no transaction is active`
- `TransactionNotStartedError: Transaction is not started yet…`

Lo grave era el modo de fallo: en el import de participantes cada fila va en su `try`, así que
la que perdía la carrera se contaba como `skipped` y el endpoint respondía **200** — pérdida
**silenciosa** de caminantes (incidente Celaya 2026-08-24). Con el driver síncrono las
sentencias resuelven en el acto y los `await` intermedios son microtasks, que Node drena antes
de atender otra petición: la ventana desaparece. Medido: 3 de 3 rondas perdían filas antes,
5 de 5 limpias después, y además más rápido (import 130→93 ms).

**La garantía tiene una condición**: ninguna transacción debe contener un `await` ajeno a la
base (red, `fs`, timers). Auditado al migrar; si alguien mete uno, la ventana se reabre.
Guard: el test de concurrencia en `apps/web/tests/e2e/participant-csv-import.spec.ts`.

**Dos trampas al tocar esto**:

- `better-sqlite3` es un **módulo nativo** y tiene que estar en `rollupOptions.external`
  (`apps/api/vite.config.ts`). Si Rollup lo empaqueta, el API no arranca y el deploy muere en
  el healthcheck **con el `dist` viejo ya sobrescrito** → prod caída (ver §5b).
- Este driver **no** tolera el SQL con comillas dobles alrededor de un literal. `datetime("now")`
  funcionaba por una permisividad histórica de SQLite; aquí falla con `no such column: "now"`.
  Si aparece ese error, es SQL mal escrito en el código, no un problema del driver. Va con
  comillas simples: `datetime('now')`.
- `apps/api/src/tests/test-setup.ts` arma su **propia** configuración: si diverge del driver de
  producción, los tests ejercitan uno que ya nadie usa. Mantenerlos en sincronía — esa
  divergencia es la que dejó pasar la carrera de transacciones.

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

## 5b. ⚠️ Deploy falla en el healthcheck = el API crashea al arrancar (prod CAÍDA)

El deploy tiene dos jobs: **Build Application** (en el runner) y **Deploy to Lightsail** (scp del
`dist` + `rsync src/` + `migration:run` + `pm2 startOrReload` + healthcheck a `localhost:3001`).
Que el build pase **no garantiza** que el API arranque: si el bundle revienta al cargar, PM2 entra
en **crash-loop**, el healthcheck responde `000` y el step falla con `exit 1` — **y prod queda caída**
(el `dist` viejo ya fue sobrescrito). El build es verde y el deploy rojo.

**Causa recurrente #1 — `__dirname`/`require`/`import.meta` en el bundle ESM.** El bundle de prod
es ESM; `__dirname` no existe → `ReferenceError: __dirname is not defined in ES module scope` al
cargar el módulo. Pasa dev/tests/`tsc` (vite-node/jest lo shimean), solo revienta el bundle real
(incidente 2026-07-09, `preparationDocSeeder`). Resolvé paths contra `process.cwd()` (`apps/api`
en prod y dev). Regla preventiva: tras tocar el API, `grep -n "__dirname" apps/api/dist/index.js`
tras `pnpm --filter api build`. Ver la sección "Dependencias nuevas en apps/api" de `AGENTS.md`.

**Diagnóstico (el log del run no baja hasta que termina — ve al server):**
```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
  'pm2 status | grep emaus-api; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/health; \
   pm2 logs emaus-api --lines 30 --nostream --err'
```
Un `restart count` alto + health `000` + un stack trace repetido en el `-error.log` = crash-loop;
la última excepción del log es la causa raíz.

**Recuperación rápida (minimiza downtime, ~1 min vs ~7 del CI):** arreglá el código → `pnpm --filter
api build` local → `scp dist/index.js` al server → `pm2 restart emaus-api --update-env` → confirmá
health 200. Luego commit + push para que el repo/CI queden consistentes (el CI resube el mismo dist).
El backend build SÍ se puede en Lightsail, pero es más rápido y seguro buildear local y solo subir
`dist/index.js`. (Frontend NUNCA se buildea en Lightsail — OOM; ver memoria.)

**Ojo con el orden migración↔arranque:** `migration:run` corre **antes** del `pm2 restart`, así que
una migración puede quedar **aplicada** aunque el API luego no arranque (fue el caso: las tablas se
crearon y el crash fue por `__dirname`, no por la migración). Verificá ambas cosas por separado:
`sqlite3 database.sqlite "SELECT name FROM migrations WHERE …"` y el health del API.

## 6. Backups

- Cron diario **3:00 AM** server (`/var/www/emaus/backup-db.sh`, usa `.backup` → S3, retención 90d).
- El CI/CD hace un `.backup` pre-migración en cada deploy (`/var/backups/emaus/emaus_<ts>.sqlite.gz`).
- Backups locales del incidente archivados fuera del repo en `~/emaus-db-backups/`.
- Un backup de **0 bytes** en `/var/backups/emaus/` es la firma de un `.backup` que falló por lock.

## Roadmap pendiente (ver TODO.md sección 🗄️)
~~better-sqlite3 (driver síncrono)~~ **hecho 2026-08-25, ver §2**; guardado confirmado en el frontend
(la UI mostró "guardado" sin confirmar → causó la pérdida), arreglo de fondo de `@repo/types`,
y mejora del deploy (subir `assets/` antes que `index.html` para evitar el 404 transitorio).
