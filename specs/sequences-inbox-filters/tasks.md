# Tasks — bandeja: filtros, historial y ficha

> SDD tasks — versión 1.0 (2026-10-08). Marcar `[x]` al completar; anotar desviaciones reales
> respecto a `plan.md` al cerrar cada milestone.

## M1 — API: `assignedToName` en `listQueued`

- [x] `messageSequenceService.listQueued`: lookup bulk de `users.displayName` por
      `In([assignedTo ids])` + Map; `assignedToName: null` sin asignar
- [x] `ScheduledMessageQueueItem` en `apps/web/src/services/api.ts`: campo
      `assignedToName?: string | null`
- [x] Test jest: 2 asignados distintos + 1 sin asignar → nombres y null correctos
      (`pnpm --filter api test src/tests/services/messageSequence.test.ts`) — 92/92 verde
      (2026-10-08). Desviación menor: el test usa `TestDataFactory.createTestUser` + un ghost
      id literal en vez del molde `seedDue`+update (más directo para 5 filas).

## M2 — Controles de listado (plantilla, asignado, por página)

- [x] `queueTemplateFilter` + select "Plantilla" (opciones computed por
      `templateId ?? 'type:'+type`, etiqueta nombre resuelto, conteo) en barra escritorio y menú móvil
- [x] Opciones dinámicas "Asignado: {nombre} (n)" en `queueAssignFilter` + branch `user:<id>`
      en `filteredQueue`
- [x] Fila: "Asignado: {assignedToName}" (fallback "Asignado")
- [x] `queuePageSize` 5/10/50/100/Todos (default 10) + `localStorage 'seq.queuePageSize'`
      sanitizado + paginador oculto con "Todos"
- [x] `watch` de reset de página gana `queueTemplateFilter` y `queuePageSize`
- [x] i18n es+en: `sequences.filter.template/allTemplates/assignee`,
      `sequences.pageSizeLabel/pageSizeAll`
- [x] Mock lucide en `apps/web/src/test/setup.ts` si hay ícono nuevo
- [x] Tests vitest: filtro plantilla; filtro asignado + nombre en fila; page size (10→dos
      páginas, Todos→todas sin paginador, 5→página 1)
- [x] `pnpm --filter web build`

Cerrado 2026-10-08 (50/50 vista, build verde). Desviaciones:

- Key extra `sequences.assignedToName` para la fila ("Asignado: {name}"); el plan solo listaba
  las keys de filtros/page size. Sin ella, la fila no puede distinguir "Asignado: Ana" del
  genérico.
- Guard de filtros huérfanos (no estaba en el plan): `watch(queue)` vuelve a `'all'`/`'active'`
  cuando la plantilla o el asignado filtrado desaparece de la bandeja — sin él, despachar el
  último ítem del filtro deja una lista vacía sin explicación (bug de UX, memoria
  `feedback_user_expectation_over_by_design`).
- Las opciones de ambos selects se computan solo sobre ítems NO pausados (el trabajo real):
  los conteos coinciden con lo que el filtro default muestra.
- `loadQueuePageSize` envuelve localStorage en try/catch (Safari privado lo bloquea).
- El mock de lucide no se tocó: M2 no agrega íconos.
- El label del select quedó "Por página" (es) / "Per page" (en), no "Mensajes por página":
  la barra desktop es estrecha y el contexto (números + "Todos") ya lo dice.

## M3 — Acciones de fila (conversación, ficha) [P — paralelizable con M2]

- [x] Extraer `resolveRecipientContact(item)` de `buildWhatsappLink` (refactor puro)
- [x] `openWhatsappHistory(item)`: `buildWhatsAppChatLink` + `window.open` directo; sin
      `open`/`dispatch`/mutation alguna (D1); toast sin teléfono
- [x] Botón icono "Ver conversación" en fila y footer del panel de detalle (oculto sin teléfono)
- [x] `ParticipantInfoPopover`: prop `variant: 'pill' | 'icon'` (`withDefaults` `'pill'`;
      template pill intacto)
- [x] Botón icono "Detalles del participante" en fila (participante del store; sin `attendance`)
- [x] i18n es+en: `sequences.viewConversation`, `sequences.participantDetail`
- [x] Tests vitest: URL sin `text=` + cero mutaciones/store; popover icon abre (attachTo) y pill
      sin regresión
- [x] `pnpm --filter web build`

Cerrado 2026-10-08 (46/46 vista, 11/11 popover, build verde). Desviaciones:

- Key extra `sequences.viewConversationShort` ("Conversación") para el footer del detalle en
  móvil — mismo patrón `markSent/markSentShort` que ya usa la bandeja.
- Tests del popover 'icon' son **estructurales** (ⓘ presente, dentro del trigger, visible en
  desktop, sin pastilla): la apertura/cierre real la maneja `PopoverTrigger` de reka-ui (mismo
  camino que el ⓘ móvil de la pastilla, probado en prod). La interacción viva queda para el e2e
  de M4.
- En la fila, el binding al popover castea la proyección del payload (`item.participant as any`):
  `ScheduledMessageQueueItem.participant` es un tipo parcial inline y el popover declara
  `Participant` completo. El popover enriquece por id desde el store con fallback al objeto
  pasado, así que la proyección basta en runtime.

## M4 — E2E + cierre

- [x] Extender `sequences-inbox.spec.ts`: escenario con ≥2 walkers × 2 pasos (≥12 queued, 2
      plantillas) + un ítem asignado por API
- [x] Tests: filtro plantilla; filtro asignado con nombre en fila; "Todos" sin paginador; href
      de conversación sin `text=` y cero requests a open/dispatch; popover abre y cierra limpio
- [x] Corrida en dev del worktree (skill `worktree-testing`; DB con 3 archivos, FRONTEND_URL
      inline, puertos propios)
- [x] Screenshot de la bandeja con controles nuevos para el usuario
- [x] Marcar tasks, anotar desviaciones por milestone, proponer commits (uno por milestone)

Cerrado 2026-10-08 (5/5 chromium en dos corridas, 10/10 Mobile Chrome + Mobile Safari;
screenshots desktop y móvil verificados). Desviaciones:

- `createFilterScenario` asigna al propio usuario logueado (vía `/api/auth/status`): no hay API
  de listado de usuarios y register requiere reCAPTCHA. El label "Asignado: {otro usuario}" en
  fila queda cubierto por vitest.
- Los hooks `beforeAll`/`afterAll` quedaron a nivel archivo (compartidos por los dos describes):
  el login está sujeto a rate limit (10/15 min) y compartir sesión entre describes es el objetivo.
- El helper `deleteSeedSequences` se extrajo de `createScenario` — las secuencias seed también
  contaminan el escenario de filtros.
- El flake inicial del login era el rate limit del entorno, no del spec: el API del worktree
  corre con `NODE_ENV=development SKIP_RATE_LIMIT=true`, y el helper `login()` lanza en 429 en
  vez de saltarse en verde (un skip escondería la ventana quemada).
- Los screenshots se capturaron con un spec efímero (`zz-inbox-screenshot.spec.ts`, borrado tras
  la corrida): la bandeja vive en contenedores con scroll interno y el paginador no entra ni con
  `fullPage`; el spec parchea `overflow` inline (sin persistir nada) y captura `fullPage`+`clip`
  en coordenadas de documento. Desktop: toolbar con los 4 selects + chips "Mío" + 10 filas +
  paginador. Móvil: menú ⋯ "Más acciones" abierto con los mismos selects.

## Cierre

- [x] Verificación final: `pnpm --filter api test src/tests/services/messageSequence.test.ts` +
      vitest vista + `pnpm --filter web build` + e2e del spec extendido
      (2026-10-08: jest 92/92, vitest 61/61 —50 vista + 11 popover—, build verde, e2e 5/5
      chromium × 2 + 10/10 móviles)
- [ ] Merge a master: merge + limpieza desde el main en un comando final (memoria
      `feedback_worktree_session_death_by_cwd`), con visto bueno del usuario
