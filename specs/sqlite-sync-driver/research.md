# Research: estado actual de la capa SQLite

> Insumo del [spec.md](spec.md). Todo lo de abajo está verificado sobre el código y sobre
> producción el 2026-08-24/25, no inferido.

## Configuración vigente

`apps/api/src/database/config.ts` — rama SQLite de `getDatabaseConfig()`:

```ts
type: 'sqlite' as const,          // driver asíncrono (paquete `sqlite3`)
database: process.env.DB_DATABASE || 'database.sqlite',
enableWAL: true,
busyTimeout: 5000,                 // solo existe en SqliteConnectionOptions
busyErrorRetry: 3000,              // idem
maxQueryExecutionTime: 5000,
```

Los comentarios del archivo documentan que WAL, `busyTimeout` y `busyErrorRetry` se agregaron
tras el incidente del 2026-06-04 (transacción colgada, ~23 h de lock). Esas defensas atacan la
contención **entre procesos**; el problema de este spec es el entrelazado **dentro** del
proceso, que ninguna de ellas cubre.

## El paquete ya está, y ya funciona en producción

- `apps/api/package.json` declara **`better-sqlite3: ^12.6.2`** y `@types/better-sqlite3`.
  Ya es dependencia; no hay que instalar nada nuevo.
- En el servidor: `node_modules/.pnpm/better-sqlite3@12.6.2` con el binario nativo
  `build/Release/better_sqlite3.node` compilado (enero 2026).
- Verificado cargándolo desde `apps/api` (el directorio de trabajo del API en producción):
  abre una base en memoria, crea una tabla e inserta. **Funciona.**
- Ojo: **no** hay symlink en el `node_modules` de la raíz, solo en `apps/api/node_modules`.
  Como el API corre con cwd `apps/api`, resuelve bien; un script que se ejecute desde la raíz
  del repo, no.

Por qué estaba instalado sin usarse: `apps/api/src/drizzle/db.ts` lo importa para Drizzle. Ese
archivo es **código muerto** — nadie lo importa. Si alguien lo conectara, abriría una **segunda
conexión** a la misma base y volvería a introducir contención entre conexiones.

## Equivalencia de opciones entre drivers

`BetterSqlite3ConnectionOptions` (TypeORM 0.3.27) acepta: `database`, `driver`, `key`,
`statementCacheSize`, `prepareDatabase`, `readonly`, `fileMustExist`, `timeout`, `verbose`,
**`enableWAL`**. Comprobado en los tipos del paquete.

| opción actual | en better-sqlite3 | equivalencia |
| --- | --- | --- |
| `enableWAL: true` | ✅ soportada | se mantiene igual (el driver ejecuta `PRAGMA journal_mode = WAL`) |
| `busyTimeout: 5000` | ❌ no existe | `prepareDatabase: db => db.pragma('busy_timeout = 5000')` |
| `busyErrorRetry: 3000` | ❌ no existe | sin equivalente; era el reintento de TypeORM ante `SQLITE_BUSY`. El `busy_timeout` cubre el caso (espera en vez de fallar). Ver riesgo R2 en [plan.md](plan.md) |
| `maxQueryExecutionTime` | ✅ común a todos | se mantiene |

## Superficie expuesta a la carrera

- **14 bloques `transaction()`** explícitos, repartidos en 7 archivos:
  `participantService`, `retreatService`, `retreatScheduleService`, `communityService`,
  `aiChatService`, `invitationService`, `retreatBedController`.
- **265 llamadas a `.save()`**: cada persistencia abre su propia transacción implícita, así que
  el conjunto de escrituras que pueden chocar es mucho mayor que los 14 bloques.
- **13 usos de `createQueryRunner`**, casi todos en la infraestructura de migraciones.

### Ventana de mayor riesgo

Cuatro tareas programadas disparan **en el minuto 0 de cada hora** (`0 * * * *`):
`messageSequenceService`, `santisimoReminderService`, `passwordResetCleanupService` y
`roleCleanupService`. Un import que caiga en ese minuto compite con las cuatro.

## Los tests no cubren el driver de producción

`apps/api/src/tests/test-setup.ts` arma su propia configuración —
`type: 'sqlite'`, `database: ':memory:'`— sin pasar por `getDatabaseConfig()`. Consecuencias:

1. Cambiar el driver de producción **no afecta a los tests**: riesgo de regresión bajo, pero
2. los tests seguirían ejercitando un driver distinto al real, que es justo el agujero por el
   que se coló este bug.

Además, el grueso de los tests de integración del import está en un `describe.skip` por una
limitación de TypeORM con el caché de metadatos, así que la cobertura real del import vive en
el e2e (`apps/web/tests/e2e/participant-csv-import.spec.ts`).

## Mediciones previas al cambio

Local, base copia de producción, import de 35 filas contra un retiro con mesas:

| operación | `sqlite` (async) | `better-sqlite3` |
| --- | --- | --- |
| import de 35 filas | 130 / 124 / 135 ms → **~130 ms** | 104 / 86 / 90 ms → **~93 ms** |
| listar participantes (52) | 8,5 / 6,4 / 7,1 ms → **~7,3 ms** | 6,6 / 3,9 / 3,9 ms → **~4,8 ms** |

El driver síncrono resultó **más rápido** en ambos casos, no más lento. Se ahorra el ida y
vuelta por el event loop de cada sentencia.

> Advertencia sobre estas cifras: son de una máquina de desarrollo con el resto del stack
> corriendo, y de una sola sesión. Sirven como línea base para detectar una degradación
> gruesa, no como benchmark riguroso.

## Comprobaciones ya hechas con el cambio puesto (local, sin commitear)

- `migration:show` → 104 ejecutadas, **0 pendientes**.
- `pnpm --filter api build` → pasa, con `better-sqlite3` agregado a `rollupOptions.external`.
- Login, import y lectura de participantes por HTTP → correctos.
- Cinco rondas de import bajo concurrencia → 35/35 en todas.

## Lo que falta verificar

- Arranque del **bundle de producción** (no solo `vite-node` en desarrollo).
- `migration:run` real, no solo `show`.
- Comportamiento con la base en WAL bajo el watchdog y un `.backup` simultáneo.
- Si alguna transacción contiene un `await` ajeno al driver (riesgo R3 del plan).
