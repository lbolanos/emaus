# Incidente de base de datos + Roadmap de resiliencia (2026-06-04)

## Resumen ejecutivo

Una transacción TypeORM que **nunca hizo `COMMIT`** dejó la base SQLite de producción con un
**lock de escritura durante ~23 horas** (4-jun 00:14 → 23:12 UTC). El API seguía respondiendo
(servía lecturas desde caché), así que los backups parecían sanos y nadie lo notó. Consecuencias:

- `make db-pull` (que hacía `scp` del `.sqlite` vivo) trajo una copia **corrupta**
  (`SQLITE_CORRUPT: database disk image is malformed`) → no se podía hacer login local.
- Los **backups del cron fallaron en silencio** (archivos `.sqlite` de **0 bytes**).
- Los **deploys fallaron** (el `.backup` pre-deploy chocaba con el lock).
- Se **perdieron ~23 h de capturas** (mesas, responsabilidades) que se veían "guardadas" en
  pantalla pero nunca se persistieron, y se descartaron al reiniciar (rollback).

## Datación del lock (forense)

Las tres tablas de telemetría coinciden: el último write fue **2026-06-04 00:14:29 UTC**, y nada
más hasta el reinicio (23:12). Coincide con el `Birth` del `database.sqlite-journal` (`00:14:29.452`)
y con un log de prod: *"🧹 Performing cache cleanup due to high memory usage"*.

```
03-jun 22:00 UTC → 1126 métricas (normal)
04-jun 00:14:29  → ÚLTIMO write; la transacción se cuelga bajo presión de memoria
                   [ ~23 h sin guardar NADA — el backup de las 03:00 aún pudo LEER ]
04-jun 23:12     → pm2 restart → rollback → escrituras reanudadas
```

En hora de México (UTC-6): **lock 3-jun 6:14 PM → liberado 4-jun 5:12 PM**. Todo cambio capturado
en esa ventana se perdió (caso confirmado: *Música San Agustín → debía ser Oscar Martínez De Leon,
quedó Roberto Aguirre*).

## Causa raíz

1. **`db-pull` con `scp` del archivo vivo** → copia inconsistente. **Arreglado**: `scripts/db-pull.sh`
   usa `sqlite3 ".backup"` + reintentos + `integrity_check`.
2. **Transacción colgada** (lo grave): una `AppDataSource.transaction()` abrió escritura y el COMMIT
   nunca llegó (event loop atascado bajo presión de memoria; driver `type: 'sqlite'` = `sqlite3`
   **async** **sin** `busy_timeout`/WAL/`maxQueryExecutionTime`) → lock indefinido.
3. **El frontend mostró "guardado" sin confirmación del servidor** → el coordinador creyó que se había
   guardado.

## Lo aplicado el 2026-06-04/05 (todo en prod)

- ✅ **WAL + timeouts** en `config.ts` (`enableWAL`, `busyTimeout: 5000`, `busyErrorRetry: 3000`,
  `maxQueryExecutionTime: 5000`). Lectores/backups ya no se bloquean por un escritor.
- ✅ **`scripts/db-pull.sh`**: snapshot `.backup` consistente + reintentos + verificación.
- ✅ **Recuperación** de la DB corrupta con `sqlite3 .recover`.
- ✅ **CI/CD: el deploy sincroniza `apps/api/src/`** (rsync) antes del `migration:run`. Antes solo
  subía `dist/`, dejando `src/` congelado → las migraciones nuevas eran invisibles para
  `vite-node src/cli/migration-cli.ts` ("No pending migrations" pese a deploys verdes).
- ✅ **Migraciones aplicadas** que estaban atascadas: `AssignSanAgustinTables` (mesas),
  `AddComprasSacerdotesTeams`, y `AddMissingServiceTeams` (reescrita sin `@repo/types`).
- ✅ **Watchdog de auto-recuperación** (`scripts/db-watchdog.sh`, cron cada minuto): prueba escritura
  real al `.sqlite` (no al API) y reinicia el API si el lock persiste 3 min. Pruebas 6/6, doc en
  `db-watchdog.md`. Convierte "23 h inadvertido" en "~3-4 min y auto-recuperación".

### Trampa adicional: migraciones que importan `@repo/types`

`AddMissingServiceTeams` importaba `defaultServiceTeams` → `@repo/types` (enum `ServiceTeamType`).
En prod el loader hace `await import(migración.ts)` y `@repo/types` declara `"main": "./src/index.ts"`;
ese import transitivo cae en Node nativo → `Unknown file extension ".ts" for packages/types/src/index.ts`
→ la migración **queda pending para siempre** (en local sí corre, vite-node resuelve el workspace).
**Regla**: las migraciones de datos que corren en prod usan **solo `typeorm` + `uuid`** y valores
literales / SQL plano. Detalle operativo en el skill `db-production-resilience`.

## Roadmap de protección (capas)

- 🟢 **Capa 0 — WAL + busy_timeout** — *hecho, en prod.*
- 🟢 **Capa 3 (parcial) — watchdog + auto-restart** — *hecho, en prod.*
- 🟡 **Capa 1 — driver `better-sqlite3`** (síncrono): elimina la clase de bug de la txn que cuelga el
  event loop. Ya instalado; cambiar `type` y `busyTimeout`→`timeout`. Bajo esfuerzo, cambia driver.
- 🟡 **Capa 2a — guardado confirmado en el frontend** 🔑: la UI no debe mostrar "guardado" hasta el
  200 del server. Es lo que habría evitado la pérdida.
- 🟡 **Capa 2b — auditar las 13 `AppDataSource.transaction()`** para que sean cortas (sin LLM/email/red).
- 🟡 **Resto de Capa 3**: backups por hora (no diarios) + alerta si `-wal`/journal crece de más.
- 🔴 **Solución de fondo `@repo/types`**: que el loader resuelva el workspace en prod (build+sync de
  `packages/types` a `dist/`) → futuras migraciones con enums funcionarían sin reescribirlas.
- 🔴 **Capa 4 — PostgreSQL** (mediano plazo): `idle_in_transaction_session_timeout` /
  `statement_timeout` / `transaction_timeout` harían el bug **estructuralmente imposible**. Esfuerzo
  alto (86 migraciones, 48 raw queries, 41 booleanos). Disparador: si "database is locked" se repite
  >1×/semana.
- **Deploy**: subir `assets/` **antes** que `index.html` (evita el 404 transitorio del 2026-06-05).

Estado vivo de estos ítems: `TODO.md` sección 🗄️. Operación del día a día: skill `db-production-resilience`.

## Referencias
- [Gotchas with SQLite in Production](https://blog.pecar.me/sqlite-prod/)
- [idle_in_transaction_session_timeout — CYBERTEC](https://www.cybertec-postgresql.com/en/idle_in_transaction_session_timeout-terminating-idle-transactions-in-postgresql/)
- [better-sqlite3 — npm](https://www.npmjs.com/package/better-sqlite3)
- [How to migrate from SQLite to PostgreSQL — Render](https://render.com/articles/how-to-migrate-from-sqlite-to-postgresql)
