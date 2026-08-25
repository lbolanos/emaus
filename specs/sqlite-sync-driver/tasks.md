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

- [x] **T1. Externalizar `better-sqlite3`** — agregarlo a `rollupOptions.external` en
  `apps/api/vite.config.ts`, junto a `sqlite3`.
- [x] **T2. Verificar el bundle** — `pnpm --filter api build` y confirmar que `dist/index.js`
  referencia el módulo en vez de empaquetarlo.

## M2 — Driver

**Criterio de cierre**: el import bajo concurrencia deja de perder filas y el resto de la API se
comporta igual.

- [x] **T3. Cambiar la configuración** — en `apps/api/src/database/config.ts`:
  `type: 'better-sqlite3'`, sacar `busyTimeout`/`busyErrorRetry`, agregar `prepareDatabase` con
  `busy_timeout = 5000`. Conservar `enableWAL` y `maxQueryExecutionTime`, y **conservar los
  comentarios** que documentan el incidente de 2026-06-04.
- [x] **T4. Auditar transacciones (R3)** [P con T5] — revisar los 14 bloques `transaction()`
  buscando `await` que no sea del driver (red, `fs`, timers). Anotar hallazgos en este archivo;
  si aparece alguno, la garantía del spec no lo cubre y hay que decidir qué hacer con él.
- [x] **T5. Migraciones** [P con T4] — `migration:show` contra la base del worktree: 0
  pendientes. Y un `migration:run` real sobre una copia desechable.
- [x] **T6. Humo por HTTP** — contra el API del worktree: login, listar participantes, crear un
  retiro, importar el CSV y borrarlo.
- [x] **T7. E2E de import** — `participant-csv-import.spec.ts` en verde contra el worktree.
- [x] **T8. Quitar el `fixme` de concurrencia** — es el criterio de aceptación 1 del spec:
  el caso que hoy documenta el bug debe pasar. Correrlo varias veces, no una.
- [x] **T9. Medir** — repetir import de 35 filas y listado de participantes; comparar con la
  línea base de research (~130 ms y ~7,3 ms). Anotar los números aquí.

## M3 — Tests alineados

**Criterio de cierre**: los tests ejercitan el mismo driver que producción y las suites del
pre-push siguen verdes.

- [x] **T10. `test-setup.ts` al driver nuevo** — cambiar `type` a `better-sqlite3` manteniendo
  `:memory:`.
- [x] **T11. Correr las suites del pre-push** — las relacionadas con lo tocado. La suite
  completa **no** es criterio: no termina por un fallo de memoria preexistente.
- [x] **T12. Documentar diferencias** — si algún test falla por una diferencia legítima de
  driver (tipos de retorno, booleanos, fechas), anotarla aquí antes de tocar nada.

## M4 — Salida a producción

**Criterio de cierre**: producción corriendo con el driver nuevo, verificado.

- [x] **T13. Ejecutar el bundle real** — arrancar `dist/index.js` una vez en local. El modo de
  fallo de este cambio es **al cargar** el módulo, y eso no lo detectan ni los tests ni `tsc`.
- [ ] **T14. Documentar** — actualizar el skill `db-production-resilience`: el roadmap deja de
  ser pendiente y pasa a ser la configuración vigente, con el incidente que lo motivó.
- [ ] **T15. Desplegar y vigilar** — tras el deploy, revisar el log del API buscando
  `SQLITE_BUSY` y consultas por encima de 5 s.

## Bitácora de desviaciones

> Qué se hizo distinto de lo planeado y por qué.

### M2

- **R3 quedó despejado.** Ninguno de los 14 bloques `transaction()` hace I/O ajeno a la base,
  ni directo ni a través de los helpers que llaman (`assertRetreatAcceptsRegistrations`,
  `assertNotDoubleRegisteredInRetreat`, `getNextIdOnRetreat`, `autoSetPrimaryRetreat`,
  `assertMealCountWithinRetreatMeals`: todos solo base de datos). La garantía del spec se
  sostiene. Si alguna transacción incorpora un `await` de red, `fs` o timer, se reabre.

- **El test de concurrencia hacía una sola ronda y daba falso verde.** Contra el driver viejo
  lo detectaba solo ~2 de cada 3 corridas, porque perder la carrera es probabilístico y la
  fixture tiene 12 filas. Se pasó a 3 rondas por corrida.

- **Un `test.skip` tapaba un 429.** `/auth/login` permite 10 intentos cada 15 minutos y correr
  la suite varias veces seguidas agota la ventana; el spec lo trataba como "no hay
  credenciales" y saltaba los dos tests en silencio, reportando verde una corrida que nunca
  ejecutó nada. Ahora un 429 lanza con mensaje explícito y solo se salta si de verdad no hay
  credenciales.

- **Se perdió el cambio de `config.ts` a mitad de camino** por un `git checkout --` sobre un
  archivo modificado sin commitear. Se rehízo. Lección: commitear antes de experimentar con el
  árbol, y restaurar desde una copia, nunca desde git, cuando el cambio no está commiteado.

- **Un tercer mensaje de error del mismo bug**, no previsto en el spec:
  `SQLITE_ERROR: cannot commit - no transaction is active`. Documentado en el comentario de
  `config.ts` junto a los otros dos.

### M3 — el milestone que justificó su lugar en el plan

- **Hallazgo: SQL inválido en producción que hoy funciona por accidente.** Siete consultas
  usaban `datetime("now")` — comillas **dobles** alrededor de un literal. SQLite las acepta por
  una permisividad histórica (interpreta la cadena entrecomillada como literal si no existe una
  columna con ese nombre); `better-sqlite3` la desactiva por defecto y falla con
  `no such column: "now"`.

  Archivos: `userService.ts` (×3), `communityService.ts` (×2), `participantService.ts`,
  `aiChatService.ts`. Corregido a comillas simples.

  **Sin esto, el cambio de driver habría roto en runtime** los retiros por usuario, la próxima
  reunión del participante y una consulta del chat con IA — y ningún test lo habría visto,
  porque los tests corrían con el driver permisivo. Es exactamente el agujero que M3 existía
  para cerrar, y la razón de que vaya después de M2 y no antes.

- Los 18 tests que fallaron al cambiar el driver eran todos este mismo problema. Tras la
  corrección: 133 suites de services y 48 del resto en verde (~2.900 tests).
