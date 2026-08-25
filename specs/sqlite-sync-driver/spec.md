# Spec: driver SQLite síncrono (better-sqlite3)

> Metodología SDD. Artefactos: [spec.md](spec.md) (qué y por qué) →
> [research.md](research.md) (estado actual) → [plan.md](plan.md) (cómo) →
> [tasks.md](tasks.md) (desglose ejecutable).
> Estado: **especificada** (2026-08-25, `feature/sqlite-sync-driver`).

## Problema

TypeORM habla con SQLite sobre **una sola conexión** usando el driver asíncrono `sqlite3`.
Cada sentencia cede el control al event loop, así que entre dos sentencias de una transacción
puede colarse otra petición HTTP y abrir su propio `BEGIN` sobre la misma conexión. Las dos
transacciones se pisan y SQLite responde con uno de estos dos errores:

- `SQLITE_ERROR: cannot start a transaction within a transaction`
- `TransactionNotStartedError: Transaction is not started yet, start transaction before
  committing or rolling it back.`

**El daño no es el error, es que se traga datos en silencio.** En el import de participantes
cada fila se procesa dentro de un `try`, así que la fila que pierde la carrera se cuenta como
`skipped` y el endpoint responde **200**. El usuario ve "34 importados" y nada le dice que un
caminante quedó fuera.

### Incidente que lo destapó (2026-08-24, retiro de Celaya)

Al importar 35 caminantes desde un Excel, el import falló primero por un bug distinto
(`tableId` escrito contra `Participant`; corregido en `40e33bb`). Con ese bug ya arreglado, el
segundo intento en producción murió con `cannot start a transaction within a transaction`, y la
transacción de asignación de camas y mesas hizo rollback: el retiro quedó con los 35 caminantes
cargados pero sin cama ni mesa.

### Reproducción medida

Import de 35 filas contra un retiro con mesas, mientras 25 escrituras concurrentes golpean el
API:

| driver | rondas | resultado |
| --- | --- | --- |
| `sqlite` (actual) | 3 | **3 con pérdida** — 1, 2 y 1 filas perdidas |
| `better-sqlite3` | 5 | **5 limpias** — 35/35, cero saltados |

## Por qué el driver síncrono lo resuelve

Con `better-sqlite3` cada sentencia se ejecuta y retorna en el acto. Los `await` intermedios de
TypeORM resuelven sobre promesas ya cumplidas, que son **microtasks**: Node las drena enteras
antes de atender el siguiente evento de I/O. La ventana en la que otra petición podía colarse
entre dos sentencias de la misma transacción deja de existir.

La garantía se apoya en que dentro de una transacción **no haya awaits que no sean del driver**
(una llamada de red, un `fs` asíncrono, un `setTimeout`). Ver riesgo R3 en [plan.md](plan.md).

## Alcance

**Dentro**: el driver de la rama SQLite de `getDatabaseConfig`, su equivalencia de opciones, la
externalización del módulo nativo en el bundle, y alinear la configuración de los tests para que
ejerciten el mismo driver que producción.

**Fuera**: la rama PostgreSQL (no se usa), reescribir transacciones existentes, y el fallo de
memoria de la suite completa de Jest (preexistente, problema aparte).

## Requisitos funcionales

- **FR-1** — La rama SQLite usa el driver síncrono `better-sqlite3`.
- **FR-2** — Se conservan las protecciones vigentes contra bloqueos: WAL activo y un
  `busy_timeout` de 5 s, aunque el driver nuevo no acepte las mismas claves de configuración.
- **FR-3** — Un import concurrente con otras escrituras no pierde filas: `skippedCount` es 0.
- **FR-4** — El bundle de producción no empaqueta el módulo nativo; lo resuelve en runtime.
- **FR-5** — El pipeline de migraciones sigue funcionando (`migration:show` y `migration:run`).
- **FR-6** — Los tests corren contra el mismo driver que producción.
- **FR-7** — Ningún cambio de comportamiento observable en la API: mismas respuestas, mismos
  tipos en los campos que hoy devuelve.

## Requisitos no funcionales

- **NFR-1 — Rendimiento**: no debe degradarse. Medición previa al cambio (import de 35 filas
  ~130 ms, listar participantes ~7,3 ms) como línea base.
- **NFR-2 — Arranque en producción**: el API debe arrancar. El módulo nativo tiene que cargar
  desde `apps/api`, que es el directorio de trabajo del API en el servidor.
- **NFR-3 — Reversible**: volver al driver anterior debe ser un cambio de configuración, sin
  tocar datos ni esquema.

## Criterios de aceptación

1. El test e2e `participant-csv-import.spec.ts` pasa con el `fixme` retirado del caso de
   concurrencia — es la prueba de que el problema quedó resuelto.
2. `pnpm --filter api build` pasa y `dist/index.js` no contiene el binario nativo.
3. `migration:show` reporta 0 pendientes contra una copia de la base de producción.
4. El API arranca con el bundle de producción y responde en `/api/health`.
5. Las mediciones de NFR-1 no empeoran.

## Fuera de contrato

Este cambio **no** convierte el sistema en concurrente. SQLite sigue teniendo un único escritor
y el proceso sigue siendo de un solo hilo; lo que se elimina es el entrelazado de transacciones
dentro del proceso. Una escritura externa (el watchdog, un `.backup`) sigue pudiendo devolver
`SQLITE_BUSY`, y para eso está el `busy_timeout` de FR-2.
