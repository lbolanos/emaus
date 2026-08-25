# Tasks: driver SQLite síncrono

> Desglose ejecutable del [plan.md](plan.md). Convención: `[P]` = paralelizable con las tareas
> de su mismo bloque; sin marca = depende de la anterior.
> Entorno de pruebas: worktree `feature/sqlite-sync-driver`, API en `:3002`, web en `:5174`,
> base propia `apps/api/database.worktree.sqlite` (copia de la del main).

## M0 — Especificación

**Criterio de cierre**: los cuatro artefactos SDD commiteados antes de tocar código.

- [x] **T0. Specs** — `spec.md`, `research.md`, `plan.md`, `tasks.md` en
  `specs/sqlite-sync-driver/`.
- [x] **T0b. Worktree y puertos** — worktree creado, dependencias instaladas, base aislada y
  entorno de desarrollo levantado en puertos paralelos.

## M1 — Empaquetado

**Criterio de cierre**: el build pasa y el módulo nativo queda fuera del bundle. Sin cambio de
comportamiento (el driver todavía no se usa).

- [ ] **T1. Externalizar `better-sqlite3`** — agregarlo a `rollupOptions.external` en
  `apps/api/vite.config.ts`, junto a `sqlite3`.
- [ ] **T2. Verificar el bundle** — `pnpm --filter api build` y confirmar que `dist/index.js`
  referencia el módulo en vez de empaquetarlo.

## M2 — Driver

**Criterio de cierre**: el import bajo concurrencia deja de perder filas y el resto de la API se
comporta igual.

- [ ] **T3. Cambiar la configuración** — en `apps/api/src/database/config.ts`:
  `type: 'better-sqlite3'`, sacar `busyTimeout`/`busyErrorRetry`, agregar `prepareDatabase` con
  `busy_timeout = 5000`. Conservar `enableWAL` y `maxQueryExecutionTime`, y **conservar los
  comentarios** que documentan el incidente de 2026-06-04.
- [ ] **T4. Auditar transacciones (R3)** [P con T5] — revisar los 14 bloques `transaction()`
  buscando `await` que no sea del driver (red, `fs`, timers). Anotar hallazgos en este archivo;
  si aparece alguno, la garantía del spec no lo cubre y hay que decidir qué hacer con él.
- [ ] **T5. Migraciones** [P con T4] — `migration:show` contra la base del worktree: 0
  pendientes. Y un `migration:run` real sobre una copia desechable.
- [ ] **T6. Humo por HTTP** — contra el API del worktree: login, listar participantes, crear un
  retiro, importar el CSV y borrarlo.
- [ ] **T7. E2E de import** — `participant-csv-import.spec.ts` en verde contra el worktree.
- [ ] **T8. Quitar el `fixme` de concurrencia** — es el criterio de aceptación 1 del spec:
  el caso que hoy documenta el bug debe pasar. Correrlo varias veces, no una.
- [ ] **T9. Medir** — repetir import de 35 filas y listado de participantes; comparar con la
  línea base de research (~130 ms y ~7,3 ms). Anotar los números aquí.

## M3 — Tests alineados

**Criterio de cierre**: los tests ejercitan el mismo driver que producción y las suites del
pre-push siguen verdes.

- [ ] **T10. `test-setup.ts` al driver nuevo** — cambiar `type` a `better-sqlite3` manteniendo
  `:memory:`.
- [ ] **T11. Correr las suites del pre-push** — las relacionadas con lo tocado. La suite
  completa **no** es criterio: no termina por un fallo de memoria preexistente.
- [ ] **T12. Documentar diferencias** — si algún test falla por una diferencia legítima de
  driver (tipos de retorno, booleanos, fechas), anotarla aquí antes de tocar nada.

## M4 — Salida a producción

**Criterio de cierre**: producción corriendo con el driver nuevo, verificado.

- [ ] **T13. Ejecutar el bundle real** — arrancar `dist/index.js` una vez en local. El modo de
  fallo de este cambio es **al cargar** el módulo, y eso no lo detectan ni los tests ni `tsc`.
- [ ] **T14. Documentar** — actualizar el skill `db-production-resilience`: el roadmap deja de
  ser pendiente y pasa a ser la configuración vigente, con el incidente que lo motivó.
- [ ] **T15. Desplegar y vigilar** — tras el deploy, revisar el log del API buscando
  `SQLITE_BUSY` y consultas por encima de 5 s.

## Bitácora de desviaciones

> Qué se hizo distinto de lo planeado y por qué. Se llena al cerrar cada milestone.

- (pendiente)
