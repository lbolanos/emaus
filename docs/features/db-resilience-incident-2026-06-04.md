# Incidente de base de datos + Roadmap de resiliencia (2026-06-04)

## Resumen

Durante la temporada de retiros, una **transacción que nunca hizo commit** dejó la base SQLite de
producción con un lock sostenido por horas. Síntomas y consecuencias:

- `make db-pull` (scp directo del `.sqlite` en vivo) trajo una copia **corrupta**
  (`SQLITE_CORRUPT: database disk image is malformed`) → no se podía hacer login local.
- Los **backups automáticos del cron fallaron en silencio** (generaron archivos `.sqlite` de 0 bytes)
  desde que se colgó el lock. Último backup bueno: 2026-06-04 03:00 UTC.
- Se **perdió el trabajo de asignación de mesas** que un coordinador hizo durante la tarde: vivía en
  una transacción no confirmada (en la memoria del proceso del API), se veía en pantalla pero **nunca
  se persistió**. Al reiniciar el API para liberar el lock, el rollback lo descartó.

## Causa raíz

1. **db-pull con `scp` directo**: copiar un SQLite en uso captura páginas a medio escribir y deja
   fuera el journal → imagen inconsistente. **Arreglado** con `scripts/db-pull.sh` (usa `.backup` +
   reintentos + `integrity_check`).
2. **Transacción colgada** (la grave): una `AppDataSource.transaction()` abrió una transacción de
   escritura y el COMMIT nunca llegó (event loop atascado bajo presión de memoria, o un `await`
   interno colgado). Con driver `type: 'sqlite'` (sqlite3 **async**) **sin `busy_timeout`, sin WAL,
   sin `maxQueryExecutionTime`**, el lock quedó tomado indefinidamente.
3. **El frontend mostraba "guardado" sin confirmación real del servidor** → el coordinador creyó que
   las mesas se habían guardado.

## Lo ya aplicado (2026-06-04)

- ✅ `scripts/db-pull.sh`: snapshot consistente con `.backup` + reintentos + verificación de integridad.
- ✅ `apps/api/src/database/config.ts` (rama sqlite): `enableWAL: true`, `busyTimeout: 5000`,
  `busyErrorRetry: 3000`, `maxQueryExecutionTime: 5000`. **Verificado en local** (journal_mode=wal,
  lectura concurrente sin bloqueo, `.backup` captura el WAL). **Pendiente deployar a prod.**
- ✅ Recuperación de la DB local corrupta con `sqlite3 .recover`.
- ✅ Backups manuales del incidente (03:00 UTC + fresco post-reinicio) guardados.

> **Regla operativa nueva con WAL**: nunca copiar la base con `cp`/`scp` directo (perdería el `-wal`).
> Para respaldos manuales usar siempre `sqlite3 db ".backup destino"`.

## Roadmap de protección (capas, de menor a mayor esfuerzo)

### 🟢 Capa 0 — WAL + busy_timeout *(hecho, falta deploy a prod)*
Resuelve el bloqueo lector/escritor (backups, db:pull). No elimina la transacción colgada.

### 🟢 Capa 1 — Driver `better-sqlite3` *(bajo esfuerzo, recomendado)*
Driver **síncrono** → elimina la clase de bug de hoy (una transacción no puede quedar abierta
esperando el event loop). Ya instalado (`better-sqlite3 ^12.6.2`). Cambio: `type: 'sqlite'` →
`'better-sqlite3'` y `busyTimeout`→`timeout` en `config.ts`. Mismo `.sqlite`, mismas 86 migraciones.
Cuidado: una query muy pesada bloquea el event loop (aceptable con tráfico bajo).

### 🟡 Capa 2 — Blindaje de transacciones + guardado confirmado en el front *(alto impacto)*
- Backend: auditar las 13 `AppDataSource.transaction()` para que sean **cortas** — nunca envolver
  llamadas a LLM/email/red dentro. Candidatos: `aiChatService`, `participantService`,
  `communityService`, `retreatScheduleService`, `invitationService`, `retreatBedController`.
- **Frontend (prioridad)**: la UI no debe mostrar "guardado" hasta recibir el 200 del servidor.
  Esto es lo que habría evitado la pérdida de las mesas.

### 🟡 Capa 3 — Resiliencia operativa
- Healthcheck con write de prueba → auto-restart vía PM2 si detecta lock.
- Backups por hora (ahora que con WAL no fallan) en vez de diarios.
- Alerta si el `-wal`/journal crece de más.

### 🔴 Capa 4 — Migrar a PostgreSQL *(solución definitiva, alto esfuerzo)*
MVCC (escrituras concurrentes reales, sin "database is locked") + salvavidas que harían el bug
**estructuralmente imposible**: `idle_in_transaction_session_timeout`, `statement_timeout`,
`transaction_timeout` (PG 17+) matan transacciones colgadas automáticamente.
Esfuerzo real en este proyecto (semanas + testing):

| A tocar | Cantidad |
|---|---|
| Migraciones sqlite→pg a regenerar | 86 (0 postgres existen hoy) |
| Migraciones con `PRAGMA` (no portan) | 21 |
| Raw queries `.query()` a revisar | 48 |
| Archivos con `datetime()`/`strftime()` SQLite | 9 |
| Columnas `boolean` (0/1 → true/false, revisar comparaciones) | 41 en ~26 archivos |

Ya hay `pg` instalado y rama `postgres` en `config.ts`, pero es andamiaje vacío. Señal de las fuentes:
*"si ves 'database is locked' más de una vez por semana, migra"*.

### ⚪ MySQL/MariaDB — descartado
Mismos beneficios que Postgres pero sin nada de soporte en el proyecto. Postgres es la elección obvia.

## Referencias
- [Gotchas with SQLite in Production](https://blog.pecar.me/sqlite-prod/)
- [SQLite for Production — daily.dev](https://daily.dev/blog/sqlite-production-guide-when-how-to-use-beyond-prototyping/)
- [idle_in_transaction_session_timeout — CYBERTEC](https://www.cybertec-postgresql.com/en/idle_in_transaction_session_timeout-terminating-idle-transactions-in-postgresql/)
- [better-sqlite3 — npm](https://www.npmjs.com/package/better-sqlite3)
- [How to migrate from SQLite to PostgreSQL — Render](https://render.com/articles/how-to-migrate-from-sqlite-to-postgresql)
