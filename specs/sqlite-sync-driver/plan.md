# Plan: migración al driver síncrono

> Cómo se implementa lo de [spec.md](spec.md), con el estado de [research.md](research.md).
> Desglose ejecutable en [tasks.md](tasks.md).

## Estrategia

Tres milestones, cada uno mergeable por separado y reversible con un cambio de configuración.
El orden importa: **M1 deja el bundle listo antes de tocar el driver**, porque olvidar la
externalización del módulo nativo tumba producción en el healthcheck del deploy.

## M1 — Preparar el empaquetado

Añadir `better-sqlite3` a `rollupOptions.external` en `apps/api/vite.config.ts`.

Es inocuo por sí solo (el módulo todavía no se usa) y es la pieza que, si falta, produce el peor
fallo posible: Rollup intenta empaquetar un `.node` binario, el bundle revienta al cargar, PM2
entra en crash-loop y el deploy muere en el healthcheck **con el `dist` viejo ya sobrescrito**
— o sea, producción caída. Es exactamente la regla dura de `apps/api/CLAUDE.md`.

Verificación: `pnpm --filter api build` y comprobar que el binario no quedó dentro de
`dist/index.js`.

## M2 — Cambiar el driver

En `apps/api/src/database/config.ts`, rama SQLite:

```ts
type: 'better-sqlite3' as const,
enableWAL: true,
prepareDatabase: (db) => { db.pragma('busy_timeout = 5000'); },
maxQueryExecutionTime: 5000,
```

Sale `busyTimeout` (no existe en este driver) y sale `busyErrorRetry` (ver R2). Los comentarios
que documentan el porqué de cada defensa se conservan y se actualizan: explican el incidente del
2026-06-04 y no deben perderse en el cambio.

Verificación por capas, de barata a cara:

1. `migration:show` → 0 pendientes.
2. Levantar el API del worktree y probar login, import y lectura por HTTP.
3. El e2e de import (`participant-csv-import.spec.ts`) en verde.
4. **Quitar el `fixme` al caso de concurrencia** y verlo pasar: es el criterio de aceptación 1.
5. Repetir las mediciones de NFR-1 y compararlas con la línea base de research.

## M3 — Alinear los tests con producción

`apps/api/src/tests/test-setup.ts` arma su propia configuración con el driver viejo. Cambiarla a
`better-sqlite3` para que los tests ejerciten lo que corre en producción.

Este milestone es el que puede sacar regresiones a la luz, y por eso va **al final**: si algo se
rompe aquí, se sabe que es diferencia de driver y no del cambio de M2. Correr las suites que el
hook de pre-push ejecuta (las relacionadas con lo tocado); la suite completa no termina por un
fallo de memoria preexistente y no es criterio de nada.

Si aparecen fallos que son diferencias legítimas del driver (tipos de retorno, booleanos,
fechas), se documentan aquí antes de tocarlos.

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| **R1** | El módulo nativo no carga en producción → API en crash-loop y prod caída | Ya verificado: carga y ejecuta SQL desde `apps/api` en el servidor. M1 cubre el empaquetado. Recuperación rápida: revertir la configuración y `scp` del `dist` anterior |
| **R2** | Se pierde `busyErrorRetry` (reintento de TypeORM ante `SQLITE_BUSY`) | El `busy_timeout` hace que SQLite **espere** hasta 5 s en vez de fallar, que cubre el mismo caso antes de que el reintento sea necesario. Vigilar el log por `SQLITE_BUSY` tras el despliegue |
| **R3** | Una transacción con un `await` ajeno al driver (red, fs, timer) reabre la ventana de carrera | Auditar los 14 bloques `transaction()` buscando awaits que no sean de base de datos. Es una revisión acotada y es la que sostiene la garantía del spec |
| **R4** | Bloqueo del event loop: cada sentencia detiene el proceso entero | Con las consultas actuales (~4 ms) es despreciable, y medido resultó más rápido. El riesgo real es una consulta pesada futura; `maxQueryExecutionTime: 5000` la delata en el log |
| **R5** | Diferencias sutiles de TypeORM entre drivers en tipos de retorno | M3 es justamente la red para esto. Además el e2e cubre el camino crítico extremo a extremo |
| **R6** | El código muerto de Drizzle abre una segunda conexión si alguien lo activa | Fuera de alcance, pero anotado en research. Candidato a borrarse en otra tarea |

## Despliegue

Un solo deploy con los tres milestones, o M1 por separado si se quiere adelantar la parte
inocua. Antes de hacer push a `master`, ejecutar el bundle real una vez —no basta con que el
build pase— porque el modo de fallo de este cambio es al **cargar** el módulo, y ni los tests ni
`tsc` lo detectan.

Tras el despliegue, mirar el log del API en busca de `SQLITE_BUSY` y de consultas por encima de
los 5 s.

## Reversión

Volver `type` a `'sqlite'` y restaurar `busyTimeout`/`busyErrorRetry`. No hay cambio de esquema
ni de datos: nada que migrar de vuelta. La entrada en `rollupOptions.external` puede quedarse,
es inofensiva.
