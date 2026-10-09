# Research — bandeja de secuencias: estado actual

> SDD research — versión 1.0 (2026-10-08). Lectura de código sobre master `22e6d7d7`.
> Worktree: `.claude/worktrees/sequences-inbox-filters` (rama `sequences-inbox-filters`).

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
