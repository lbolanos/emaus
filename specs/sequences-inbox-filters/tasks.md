# Tasks — bandeja: filtros, historial y ficha

> SDD tasks — versión 1.0 (2026-10-08), cerrada. **v1.1 (2026-10-08)**: M5-M8 abajo. Marcar `[x]`
> al completar; anotar desviaciones reales respecto al plan al cerrar cada milestone.

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
  - v1.0 quedó lista para merge pero el usuario extendió el alcance ANTES de mergear (2026-10-08):
    el merge final se hace con v1.0+v1.1 juntos, misma rama.

## v1.1

## M5 — Ficha unificada: notas, palancas, seguimiento, enviados, saldo ✅

- [x] `useParticipantInsights` (composable): fetch-on-open de
      `getParticipantTimeline(retreatId, participantId)`, cache por participante, loading/error
      sin romper la ficha estática
- [x] Popover: sección Palancas (`enriched.palancas*`: solicitada/recibidas/cantidad/notas/
      coordinador) — sin fetch (store)
- [x] Popover: seguimiento (badge etapa), saldo (`paymentRemaining` mismo cálculo que
      MessageDialog), últimas notas (~3, autor+fecha) y últimos enviados (~3, plantilla+fecha)
      del timeline
- [x] Panel de detalle: hilo de notas (autor+fecha) del mismo timeline junto al campo legacy;
      palancas completas (hoy faltan cantidad y coordinador)
- [x] i18n es+en de las keys nuevas; íconos nuevos al mock allowlist de lucide
- [x] Tests vitest: popover muestra notas/palancas tras el fetch (flushPromises), fallback
      estático si el timeline falla; panel de detalle con hilo
- [x] `pnpm --filter web build`

> Desviaciones M5: ninguna funcional. Dos notas de implementación: (1) el cache del composable
> vive a nivel módulo (compartida popover↔panel de la misma vista, D10); (2) bug cazado por los
> tests — los refs del composable deben exponerse al template vía destructuring top-level
> (`insights.loading` en template es la Ref siempre-truthy, no el booleano).

## M6 — Programadas: filtros server-side, page size y acciones de fila ✅

- [x] API `listScheduled`: `assignedTo`/`assignedToName` (lookup bulk molde M1) + proyección
      `participant` (id, nombre, teléfonos, país — del join existente) en el DTO
- [x] API `listScheduled`: filtros `templateId`/`templateType` (clave compuesta tipo D3) y
      `assignedTo` (userId | `unassigned`) en el QB
- [x] Web: selects Plantilla / Asignado / Por página (5/10/50/100/Todos→200) en toolbar y
      menú móvil + chips de filtros activos + reset de página
- [x] Web: botón "ver conversación" (D1: sin mutación; `resolveRecipientContact` sobre la
      proyección nueva) + popover ficha por fila
- [x] Tests: jest (`listScheduled` filtros + nombres), vitest (selects, chips, conversación)
- [x] `pnpm --filter api test …` + `pnpm --filter web build`; reiniciar API del worktree
      (2026-10-08: jest 93/93, vitest 55/55, build verde)

> Desviaciones M6: (1) sin menú móvil — Programadas nunca tuvo el menú ⋯ de la bandeja; sus
> controles viven en el toolbar `flex-wrap` que ya es responsive, y ahí quedaron los 3 selects.
> **Adenda 2026-10-09**: la desviación (1) se revirtió por pedido del usuario («en programadas
> colocar las acciones dentro de botón tres puntos así como en bandeja»): Programadas ahora
> calca el molde bandeja — buscador + botón ⋯ móvil (panel con los 5 selects, backdrop que
> cierra) y toolbar desktop `hidden sm:flex`. De paso se scopeó el helper e2e `queueControls`
> a `#seq-panel-pending` (con 3 botones "Más acciones" en el DOM v-show, el locator global
> habría dado strict mode violation). Verificado: vitest 60/60, build verde, e2e 8/8 chromium.
> De paso, a11y en los tres menús ⋯: `aria-expanded` + cierre con Escape en el wrapper del
> botón (cubre también el foco dentro de los selects); Programadas usa label propio
> `sequences.filtersAction` («Filtros») porque abre filtros, no acciones. El test estructural
> re-encuentra el botón tras cada re-render: abrir el menú reemplaza el nodo y el wrapper
> previo queda stale (mismo molde que el test «Ver pasos» del archivo).
> (2) Las opciones de Plantilla/Asignado salen de las filas traídas SIN conteo (server-side,
> el conteo de la página actual sería parcial y engañoso) y la opción activa se auto-mantiene
> si el filtrado la vació, para que el select no "salte" solo. (3) Cero keys i18n nuevas:
> todo se reutilizó de la bandeja M2/M3.

## M7 — Problemas: filtros, page size y acciones de fila (client-side, molde bandeja) ✅

- [x] Verificar/enriquecer `assignedToName` en el camino de `/stats` (issues) si falta
- [x] Filtros Plantilla / Asignado + page size (5/10/50/100/Todos) sobre `filteredIssues`;
      extraer a composable los computeds compartidos con la bandeja si sale natural
- [x] Botón "ver conversación" + popover ficha por fila
- [x] Tests vitest de filtros/page size/acciones
- [x] `pnpm --filter web build`

> Desviaciones M7: (1) el camino de issues no sólo carecía de `assignedToName` — devolvía
> entities CRUDAS con el participante COMPLETO (notas, correos: PII que la lista no usa). Se
> mapeó a DTO plano (molde listScheduled): proyección participant + templateName resuelto
> server-side + templateId del paso + assignedTo/assignedToName (bulk molde M1). Test jest
> nuevo afirma la proyección y que las notas NO viajan. (2) Sin composable compartido: la
> clave de plantilla de issues lee `templateId` plano del DTO (la bandeja lee `step.templateId`),
> duplicar 4 líneas fue más simple que parametrizar; el resto replica el molde. (3) Guard de
> filtros huérfanos añadido (watch(issues), molde M2) — retry/discard del último ítem del
> filtro ya no deja lista vacía sin explicación. (4) Page size default 10 (paridad con la
> bandeja), no 50 como Programadas: Problemas es client-side y antes mostraba todo lo cargado.
> (5) El "Cargar más" (server) convive con el paginador local; cero keys i18n nuevas.
> Verificación 2026-10-08: jest 94/94, vitest 59/59, build verde, API del worktree reiniciada.

## M8 — E2E + cierre v1.1

- [x] Extender e2e: filtros de Programadas (server-side, fixture pending con scheduledFor futuro),
      filtro plantilla de Problemas (fixture failed/skipped), ficha popover con nota CRM (crear
      nota por API en el escenario)
- [x] Screenshot de ficha popover con notas+palancas para el usuario
- [x] Marcar tasks, anotar desviaciones por milestone, proponer commits (por milestone)
- [x] Verificación final: jest + vitest + build + e2e
      (2026-10-08: jest 94/94, vitest 59/59, build verde, e2e 8/8 chromium con el test
      definitivo — screenshot incluido y verde en 1.2s)

Cerrado 2026-10-08 (8/8 chromium; screenshot verificado por DOM + OCR). Desviaciones:

- `assign` sólo acepta filas queued (by design), y el fixture pending-futuro de Programadas nunca
  pasa por queued: el filtro de asignado de Programadas se ejercita con status "En cola" sobre un
  escenario due con el walker 1 asignado — el test de Programadas quedó en DOS fases/dos retiros,
  cambiando de retiro con un `addInitScript` adicional (los filtros del componente NO se resetean
  al cambiar de retiro: fase 2 resetea plantilla/page size a mano antes de tocar el estado).
- El paginador de Programadas muestra el total FILTRADO: con plantilla activa (6 items) afirma
  "Página 1 de 1", no el total del retiro. Se resetea el select a 'all' antes de afirmar page size.
- Problemas queda `test.skip` en móvil: su toolbar es `hidden sm:flex` y el menú ⋯ móvil ya lo
  cubre vitest (paridad con la bandeja M2/M3, que sí corre en móvil porque SU menú ⋯ es el mismo
  helper `queueControls`).
- El screenshot de la ficha es captura de ELEMENTO del popover (`div.max-h-[70vh]`) tras
  `setViewportSize(1280×960)`: el popover es un portal fixed anclado bajo su fila y a 720px de
  viewport su borde inferior rebasa la ventana — dos capturas de viewport salieron cortadas (scroll
  interno + portal fuera de cuadro; `toBeVisible` ≠ in-viewport). Verificado por el dato, no por
  iteración: `page.evaluate` midió la nota DENTRO de la caja (`scrollHeight 503 ≈ clientHeight
  502`, sin recorte interno) y el PNG final mide 288×505 = caja completa; el OCR de su banda
  inferior transcribe la nota, el autor y la fecha. (`toBeVisible` de Playwright no garantiza
  in-viewport; las URLs del CDN de analyze_image caducan — usar siempre la del último Read.)

## v1.2

## M9 — Más órdenes y filtros en Programadas/Bandeja/Problemas (pedido 2026-10-09)

- [x] Programadas: órdenes +Nombre (`participant.lastName, firstName`) y +Secuencia
      (`seq.name, scheduledFor` desempata) server-side — el orden debe existir antes del OFFSET
- [x] Programadas: filtro Canal server-side (`sm.channel`, whitelisted en el controller)
- [x] Programadas: filtro Secuencia como select (opciones del store de secuencias del retiro)
- [x] Problemas: filtros Estado (fallidos/omitidos) y Canal (client-side sobre lo cargado)
- [x] Problemas: filtro Secuencia con conteo (opciones desde los issues cargados)
- [x] Bandeja: filtro Secuencia con conteo (opciones sobre ítems no pausados, molde M2)
- [x] Tests: jest (canal + los dos órdenes nuevos), vitest (los tres tabs), e2e extendido

> Desviaciones M9: (1) Orden por plantilla descartado en Programadas y anunciado al proponerlo:
> `templateName` se resuelve post-query y la paginación server-side necesita el ORDER BY antes
> del OFFSET. (2) El select de Secuencia de Programadas sale del store (todas las del retiro)
> SIN conteo — server-side, el conteo de la página actual sería parcial y engañoso (molde M6);
> además bindea al MISMO ref del chip del badge, y filtro activo ⇒ `paused:'include'` (modo del
> chip) para poder filtrar por una secuencia pausada. (3) Sin chips nuevos para canal/estado: el
> select muestra el valor; los chips existentes (secuencia/plantilla/asignado) se reutilizan.
> (4) Guards de filtros huérfanos para secuencia en `watch(issues)` y `watch(queue)` (molde M2).
> (5) El menú ⋯ de Programadas pasa de 5 a 7 selects (Canal, Secuencia); su test vitest actualizado.
> (6) e2e: los selects de Problemas se anclan en su opción "Todos los …" porque `hasText
> 'Estado'/'Secuencia'` también matchea el label "Ordenar por" (que CONTIENE esas options).
> Verificación 2026-10-09: jest 95/95, vitest 63/63, build verde, e2e 8/8 chromium (con la
> cobertura v1.2: canal+orden-secuencia en Programadas vía secuencia email extra; estado/canal/
> secuencia en Problemas), API del worktree reiniciada (vite-node no recarga services).

## M10 — Toolbars de escritorio: popover «Filtros» + chips (pedido 2026-10-09)

Pedido: «mejoremos ux ui para desktop porque se ven mucho» (captura: 7 selects con etiqueta
partidos en dos líneas + acciones masivas sueltas). Molde: Shopify Polaris IndexFilters (buscador,
orden y botón de filtros con popover; filtros aplicados como chips bajo el buscador).

- [x] Los tres tabs: buscador + «Ordenar por» inline (escritorio) + botón «Filtros» con badge →
      popover en 2 columnas (escritorio) / 1 columna (móvil), `role="group"` con nombre accesible
- [x] Chips para TODO filtro aplicado (incl. estado y canal, que en v1.2 no tenían) + «Limpiar
      filtros» con 2+; el badge es su cantidad. Estado de Programadas ≠ «Pendiente» cuenta
- [x] «Por página» al pie, junto al paginador (todas las anchuras)
- [x] Acciones de escritorio en la barra: Bandeja «Marcar enviado al abrir» + «Abrir siguiente»;
      Problemas «Reenviar/Descartar todos». «Renovar con plantilla actual» pasa al popover
- [x] Tests: vitest (popover abre los filtros; chips/badge/limpiar en Programadas y Problemas),
      e2e (helpers `openFilters`/`closeFilters`; page size leído del pie)

> Desviaciones M10: (1) Un solo panel para móvil y escritorio: desaparece el toolbar duplicado
> `hidden sm:flex`; en móvil el panel suma el orden y las acciones (`sm:hidden`). (2) El fondo
> de la página es gris: el chip neutro (estado/canal) en `bg-gray-100` era invisible — se vio en
> la captura, no en tests; pasa a blanco con borde. (3) A 1024/800 px el buscador quedaba en
> 69/18 px (medido con `boundingBox`): la barra ahora envuelve (`flex-wrap`, buscador
> `min-w-[12rem] sm:min-w-[16rem]`) y los controles bajan a la derecha (`ml-auto` en el orden y
> en el grupo de acciones; en una línea no tiene efecto). (4) e2e: mientras el popover está
> abierto su backdrop tapa la página, así que `closeFilters` (Escape sobre el botón) va antes
> de tocar el pie, el orden o los chips. (5) Sin componente compartido para el shell del popover
> (follow-up #3 sigue abierto): las tres copias quedaron con las mismas clases.
> Verificación 2026-10-09: vitest 65/65, `web build` (vue-tsc) verde, e2e 8/8 chromium, capturas
> a 1280/1024/800/390 px revisadas (Buen Despacho y San Judas Tadeo en la base del worktree).
