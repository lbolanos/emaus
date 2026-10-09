# Research — bandeja de secuencias: estado actual

> SDD research — versión 1.0 (2026-10-08). Lectura de código sobre master `22e6d7d7`.
> Worktree: `.claude/worktrees/sequences-inbox-filters` (rama `sequences-inbox-filters`).
> **v1.1 (2026-10-08)**: hallazgos de la extensión (Programadas/Problemas + ficha con notas y
> palancas), al final del archivo.

## Mapa de la bandeja (tab "Pendientes")

Todo vive en `apps/web/src/views/MessageSequencesView.vue` (~3060 líneas):

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Cola `queue` | store `messageSequenceStore` (`fetchQueue`) | Array completo client-side; realtime (`sequences:queue-changed`) **refetchea todo** |
| Orden | `queueSort` (~:796) | 6 opciones: scheduled/recent/name/template/sequence/palanquero |
| "Mostrar" | `queueAssignFilter` (~:801) | active/mine/unassigned/paused/all — **sin personas concretas** |
| Búsqueda | `queueSearch` (~:797) | texto sobre nombre/plantilla/destinatario |
| Paginado | `QUEUE_PAGE_SIZE = 10` fijo (~:794), `pagedQueue` slice (~:874) | sin selector |
| Filtro compuesto | `filteredQueue` (~:834) | paused → assign → texto, en ese orden |
| Reset de página | `watch([queueSort, queueSearch, queueAssignFilter])` (~:878) | los filtros nuevos deben entrar al watch |
| Fila | template ~:2109-2192 | nombre→detalle del **mensaje**; take/release, Omitir, WhatsApp (con texto), Ya lo envié |
| Asignado en fila | ~:2151-2152 | `assignedTo === myUserId` → "Míos"; si no → "Asignado" **anónimo** |
| Panel de detalle | ~:2783-2888 | followUp, mensaje, palancas, notas, comunicaciones, doNotContact; footer Omitir + WhatsApp |

`load()` (~:266) ya carga TODO lo que los FRs necesitan: `participantStore.fetchParticipants()`
(ficha completa del retiro), `templateStore.fetchTemplates`, retreatStore (TZ/país).

## El nombre del asignado (gap server)

- `assignedTo` es `users.id` (auth id); el payload de la cola NO trae nombre.
- `listQueued` (`apps/api/src/services/messageSequenceService.ts:1695`) ya enriquece server-side:
  `followUpStatus`, `templateName`, `palancasCoordinator`/`palanqueroName` — cada uno con lookup
  bulk propio (`In([...ids])` + Map). `assignedToName` (`users.displayName`) es el cuarto del mismo
  molde: una query, cero N+1.
- El cliente no tiene store de usuarios; `/retreat-roles/retreat/:id/users` existe pero es más
  permiso y otra llamada para el mismo dato → server-side (decisión D2).
- Asignación: `sequenceStore.assign(id, userId | null)` → endpoint `assign` (transición
  `queued→queued`); "Míos" compara `assignedTo === myUserId`.

## WhatsApp "solo ver historial" (ya existe el helper)

`apps/web/src/utils/phone.ts`:

- `buildWhatsAppChatLink(raw, country)` (~:84) — `api.whatsapp.com/send?phone=…` **sin** `text`:
  abre la conversación y se ve el historial. Resuelve la lada por país (default MX; sin lada, un
  nacional de 10 dígitos abre chat en Brasil — el fix documentado en el propio archivo).
- `buildWhatsAppSendLink` (con texto) es el que usa hoy `openWhatsapp` (~:1378).

El teléfono/país/texto del ítem lo resuelve `buildWhatsappLink(item)` (~:1340): snapshot
(`resolvedContact`/`resolvedContent`) con fallback de recálculo; entiende `recipientTarget`
contactos de emergencia 1/2. Para "ver conversación" solo hacen falta `phone`+`country` de esa
misma resolución → extraer `resolveRecipientContact(item)` compartida por ambos flujos.

**Orden de operaciones**: el envío marca ANTES de abrir (incidente 20 recordatorios, 2026-09-12)
y por eso sufre popup-blocking tras el `await`. El botón de historial NO muta nada (D1) →
`window.open` directo en el gesto de clic, sin await, sin popup problem.

`item.participant.country` llega en runtime: `listQueued` carga `relations: ['participant']`
(entidad completa) — el tipo TS de `api.ts` (~:3967) solo acota lo declarado.

## Ficha del participante (popover existente)

`apps/web/src/components/ParticipantInfoPopover.vue`:

- Props: `participant: Participant` (+ `attendance?` comunidad). Se **enriquece solo**: busca por
  id en `participantStore.participants` y cae al prop si no está — en la bandeja siempre va a
  estar (la vista carga el roster completo).
- Contenido: teléfonos (propios + invitador, solo con dígitos), cama (`retreatBed`), tags,
  nickname, "enviar mensaje" (MessageDialog).
- **El trigger es pill-específico**: `<span @click="onPillClick">` con timer de 200ms
  (distingue simple vs doble clic) que SOLO abre en desktop; el botón ⓘ interno está oculto en
  `md+` (`md:w-0 md:opacity-0 md:pointer-events-none`). En la bandeja NO hay tap-to-assign: se
  necesita un modo trigger-icono siempre visible → prop `variant: 'pill' | 'icon'` con default
  `'pill'` (con `withDefaults`; regla de `.claude/rules/frontend.md` sobre props booleanas — acá
  es enum, no boolean, pero el default explícito aplica igual).
- Usado por `TablesView` / `TableCard` / `ServerDropZone` — no romperlos es CA del M3.

## Paginado

- `pagedQueue` = slice de `filteredQueue`; `queueTotalPages` = ceil. Con "Todos": `queuePageSize
  = 'all'` → slice completo, `queueTotalPages` fuerza 1, el bloque de paginación (`v-if
  queueTotalPages > 1`, ~:2214) se oculta solo.
- Precedente de preferencia persistida: `autoConfirmSend` con `localStorage
  'seq.autoConfirmSend'` (~:768) — mismo patrón para `seq.queuePageSize`.

## Realtime (lo que la cola tiene que aguantar)

- El websocket refetchea `queue` completo; los filtros/orden son `computed` sobre `queue.value` →
  las opciones dinámicas (plantillas presentes, asignados presentes) deben ser `computed` también
  para no quedarse viejas.
- Si el asignado/plantilla seleccionada desaparece de la cola (todo despachado), la lista queda
  vacía y cae al empty state existente (`sequences.queueFilterEmpty`). No se auto-limpia el filtro
  — igual que `queueSearch` hoy.

## Anclas de testing

| Nivel | Archivo | Patrón |
| --- | --- | --- |
| API jest | `apps/api/src/tests/services/messageSequence.test.ts` | helper `seedDue` (~:1239, describe "mejoras de targeting/ownership"): retiro+participante+plantilla+paso; `listQueued` ya se ejercita en varios tests |
| Web vitest | `apps/web/src/views/__tests__/MessageSequencesView.test.ts` (~1100 l) | `mountView(queue)` (~:149) mockea `getSequenceQueue`; ya testa `queueAssignFilter`/`queueSort` |
| E2E | `apps/web/tests/e2e/sequences-inbox.spec.ts` | retiro desechable 2030 vía API, walker importado con email único, `openInbox()` helper (~:233), credenciales locales fallback; corre en chromium + mobile projects |

## Trampas conocidas que aplican (checklist del plan)

1. **i18n en AMBOS locales** (`es.json` + `en.json`): key ausente pinta la key cruda
   (`.claude/rules/frontend.md`).
2. **Mock allowlist de lucide** en `apps/web/src/test/setup.ts`: ícono nuevo sin registrar rompe
   el `mount()` de la vista (memoria `feedback_lucide_mock_allowlist`).
3. **watch de reset de página** (~:878): añadir `queueTemplateFilter`, `queuePageSize` (y el
   select de asignado ya cubierto por `queueAssignFilter`).
4. **Popover dentro de fila**: `ParticipantInfoPopover` cierra el popover antes de abrir dialogs
   (patrón reka fix); en la bandeja no hay DropdownMenuItem involucrado → sin
   `useRekaDialogFix`. Verificar interactividad post-cierre (CA5).
5. **El mock global de `@repo/ui` acepta cualquier prop** — el contrato del popover variant se
   fija con el componente real importado por ruta si hace falta (memoria
   `feedback_repo_ui_mock_hides_component_api`).
6. **`pnpm --filter web build`** al cerrar cada milestone de UI (vue-tsc con sus propias trampas,
   memoria `reference_vue_tsc_two_calls_no_narrowing`).
7. **Una sola corrida de jest a la vez** (SQLITE_MISUSE fantasma).
8. Tras tocar el API: **reiniciarlo** en el dev del worktree (vite-node no hot-reloadea
   servicios) — skill `worktree-testing`.

---

## v1.1 — Programadas/Problemas y ficha con notas/palancas (2026-10-08)

### Las tres pestañas tienen arquitecturas distintas

| Tab | Fuente | Filtros hoy | Paginación |
| --- | --- | --- | --- |
| Pendientes (bandeja) | `fetchQueue` → `queue` (client-side) | texto, orden, asignación (v1.0: + plantilla, asignado concreto, page size) | client-side, page size v1.0 |
| Programadas | `fetchScheduledMessages` → **server-side** (`listScheduled`, `messageSequenceService.ts:1772`) | texto (LIKE nombre), estado, orden, secuencia, participante, pausadas | **server-side** `page`/`limit` (cap 200, default 50) |
| Problemas | `fetchIssues` → `issues` (client-side, payload = `ScheduledMessageQueueItem`, mismo que bandeja) | texto, orden (client-side) | "cargar más" con cap (`issuesTotal`) |

### Gaps del DTO de Programadas (`ScheduledMessageListItem`, `api.ts:4041`)

- **No trae `assignedTo`/`assignedToName`** — la asignación SÍ existe sobre filas pending
  (`assignScheduledMessage`, service `:2340`) pero no viaja en el listado.
- **No trae proyección del participante** (solo `participantId`/`participantName`): ni teléfonos
  (para el link de conversación) ni objeto para el popover. `listScheduled` YA hace
  `leftJoinAndSelect('sm.participant', 'participant')` → la proyección sale gratis del join.
- **No filtra** por plantilla ni por asignado. Filtro plantilla server-side: `sm.step.templateId`
  (con fallback `sm.templateType` para legacy — misma semántica de la D3 de v1.0; `step` ya está
  joined). Filtro asignado: `sm.assignedTo = :userId | IS NULL`.
- `limit` ya viaja del cliente → el selector de página es sólo UI (5/10/50/100/200; "Todos" = 200
  del cap server).

### Problemas: todo client-side como la bandeja

`issues` son `ScheduledMessageQueueItem` con `participant` (proyección) y `templateId`. OJO: no
salen de `listQueued` — vienen del endpoint `/stats` (`getSequenceStats`, `api.ts:3995`; el
método de la cola filtra `status: 'queued'`). **Pendiente M7**: verificar si ese camino también
enriquece `assignedToName` (el tipo lo declara, pero el enriquecimiento M1 se hizo en
`listQueued`); si no, enriquecer `/stats` igual que M1. Los computeds de filtros de la bandeja se
replican (o extraen a composable). El nombre de fila ya abre el panel de detalle (`openDetail`).

### Ficha: notas y palancas (elección del usuario 2026-10-08)

- **Palancas completas** (solicitada/recibidas/cantidad/notas/coordinador): vienen en el
  `Participant` del store (`packages/types/src/index.ts:535-554`, `palancasRequested`,
  `palancasReceived`, `palancasReceivedCount`, `palancasNotes`, `palancasCoordinator`) — la vista
  carga el roster completo (`MessageSequencesView.vue:282`). **Sin fetch nuevo.**
- **Hilo de notas CRM + últimos mensajes enviados + hitos de palancas**: una sola llamada —
  `GET /crm/retreat/:retreatId/participants/:participantId/timeline`
  (`crmService.getParticipantTimeline`, `crmService.ts:354`): notas (con autor y fecha),
  comunicaciones (con templateName), scheduled, tareas, pagos — `TimelineEvent[]` unificado y
  ordenado. Wrapper ya existe: `getParticipantTimeline` (`api.ts:4416`). Fetch **al abrir** el
  popover (no en mount: la fila no debe pagar por un popover que no se abre).
- **Seguimiento**: `followUpStatus` ya viaja en los ítems de bandeja/problemas (server-side);
  para el popover se toma del timeline (evento de etapa) o del store — se decide en M5.
- **Saldo**: el store trae payments (`fetchParticipants` con `includePayments`); mismo cálculo
  que usa MessageDialog (`paymentRemaining`).
- **Panel de detalle** (unificación elegida): hoy muestra el campo legacy `participant.notes`
  (uno solo, sobrescrito) — se le añade el hilo del mismo timeline (autor+fecha), mismo origen
  que el popover. El endpoint `getScheduledMessageDetail` ya trae `communications`, pero el hilo
  de notas NO está en ese payload → el panel también fetchea el timeline (o se extiende ese
  endpoint; se decide en M5 por costo).
- Fuera de alcance (decisión del usuario): bandera "No contactar" en el popover (no viaja en el
  schema del listado; quedó descartada de v1.1).

### e2e

- `sequences-inbox.spec.ts` ya monta escenario con ≥12 queued y asignación por API. Para
  Programadas hace falta materializar `pending` con `scheduledFor` futuro (o `reschedule` API) y
  para Problemas filas `failed/skipped` (retry de un paso sin teléfono, o update directo por
  API). Se evalúa en M8 el costo de cada fixture.
