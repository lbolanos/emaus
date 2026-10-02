# Bandeja WhatsApp: orden por palanquero y etiqueta en la fila (2026-10)

> Feature entregada en el branch `queue-sort-palanquero` (commit `4205b8be` + tests/docs).
> El coordinador trabaja la bandeja mensaje por mensaje; para recorrerla **por palanquero**
> —cada palanquero cubre a sus caminantes— la bandeja se ordena por el palanquero asignado
> al caminante y cada fila muestra quién es ("Palanquero 1 (Ana Rodríguez)").

## De dónde sale el dato

- La asignación caminante→palanquero vive en **`retreat_participants.palancasCoordinator`**
  (per-retiro), y guarda el **nombre** de la responsabilidad (`'Palanquero 1'`…
  `'Palanquero 3'`), **no un id**. La columna homónima en `participants` es legacy — no se usa.
- El titular de cada responsabilidad se resuelve por **name-match** contra las
  `Responsability` del retiro (`findPalanqueroAssignments`, en
  `apps/api/src/services/responsabilityService.ts`), el mismo criterio que
  `/responsibilities/palanquero-options`.
- La asignación se captura desde la **ficha del participante** (campo "Coordinador de
  Palancas"); persiste por `PUT /participants/:id` con `contextRetreatId`.

## Diseño

**Enriquecimiento server-side** en `listQueued` (`apps/api/src/services/messageSequenceService.ts`),
mismo patrón que `followUpStatus`/`templateName`: dos queries batch (sin N+1) que arman
`coordinatorByParticipant` (desde `retreat_participants`) y `holderByName` (responsabilidades
del retiro con titular). Cada ítem de la cola gana:

- `palancasCoordinator`: nombre de la responsabilidad asignada, `null` si sin asignar
  (el `''` legacy se normaliza a `null`).
- `palanqueroName`: nombre del titular, `null` si la responsabilidad no tiene titular.

**Sort client-side** en `sortedQueue` (`apps/web/src/views/MessageSequencesView.vue`): rama
`'palanquero'` con `localeCompare(…, 'es')` sobre el nombre de la responsabilidad.
Los ítems **sin palanquero (servidores, caminantes sin asignar) van SIEMPRE al final**,
independientemente de su fecha; el desempate dentro de cada grupo es por hora de envío.
El agrupamiento le gana a la cronología a propósito: es un orden de trabajo, no una agenda.

**UI**:

- Etiqueta violeta en el subtítulo de la fila: "Palanquero 1 (Ana Rodríguez)"; sin titular
  pinta "Palanquero 2" a secas (nunca paréntesis vacíos); sin asignación no pinta nada.
- Opción "Palanquero" en **ambos** combobox de orden: el del header desktop y el del menú
  "⋯" móvil (`MessageSequencesView.vue`, selects con `v-model="queueSort"`).
- i18n: `sequences.sort.palanquero` en `es.json` y `en.json` (el término no se traduce).

## Casos borde cubiertos por tests

- Asignación con titular → etiqueta completa con nombre.
- Asignación sin titular → sólo el nombre de la responsabilidad, `palanqueroName: null`.
- `palancasCoordinator: ''` (legacy) → `null` en ambos campos.
- Servidor o caminante sin asignar → ambos `null`, fila sin etiqueta, orden al final.
- Titular registrado con un solo nombre (`lastName` null) → `palanqueroName` con trim
  ("Sol", sin espacio colgante).

## Verificación

- API: `apps/api/src/tests/services/messageSequence.test.ts`, describe
  `queue: palanquero enrichment`.
- Web: `apps/web/src/views/__tests__/MessageSequencesView.test.ts`, describe
  `bandeja por palanquero` (etiqueta, orden con fechas adversas, opción en ambos selects).
- Por dato contra el stack vivo del worktree (API 3002): cola enriquecida con
  `palancasCoordinator`/`palanqueroName` correctos por participante.
- Visual (desktop y drawer móvil): etiqueta sólo en filas asignadas; el ítem sin asignar con
  la fecha MÁS temprana queda último — el agrupamiento vence a la cronología.

## Fuera de alcance

- El detalle del participante ya expone `palancas.coordinator` (`getQueueItemDetail`).
- Tab Problemas (`issuesSort`): no ordena por palanquero.
- Columna legacy `participant.palancasCoordinator`: no se toca.
- `queueSort` no se persiste en localStorage (comportamiento previo, sin cambio).
