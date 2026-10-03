# Tasks: Confirmación del pedido de camisetas

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `specs/shirt-order-confirmation/spec.md`
- [x] `specs/shirt-order-confirmation/research.md`
- [x] `specs/shirt-order-confirmation/plan.md`
- [x] `specs/shirt-order-confirmation/tasks.md`
- [x] Worktree `shirt-order-confirmation` desde HEAD local + `pnpm install`

## M1 — API: migración + entidad + reporte + endpoint

- [x] Migración `20260921220000_AddShirtOrderConfirmedAtToRetreatParticipants.ts` (guarda
      `PRAGMA table_info`, `down()` DROP COLUMN)
- [x] `retreatParticipant.entity.ts` — `shirtOrderConfirmedAt` datetime nullable
- [x] `retreatParticipantService.ts` — `RetreatSnapshotFields` += campo
- [x] `shirtReportService.ts` — SELECT/report type += `shirtOrderConfirmedAt`, `cellPhone`,
      `country` (string | null)
- [x] `retreatParticipantController.ts` — `updateShirtOrderConfirmationController`
- [x] `retreatParticipant.routes.ts` — PATCH `shirt-order-confirmation` (patrón bag-made)
- [x] `packages/types/src/index.ts` — schema del reporte += 3 campos; nuevo
      `setShirtOrderConfirmationSchema`; `touch apps/api/src/index.ts`
- [x] Test service: flag null por defecto; tras UPDATE llega como string no-null
- [x] Test authz nuevo: 400 no-boolean, true setea (query directa), false → NULL, 401 sin
      sesión, 403 sin permiso, 403 sin acceso al retiro, par inexistente ok documentado
- [x] Verificar: `pnpm --filter api build`; migración aplicada **por el dato** (copia DB a
      `database.migcheck.sqlite` en el worktree + `PRAGMA table_info` → columna 37; segunda
      corrida "No pending migrations"); jest secuencial (9/9 rutas + 27/27 service verdes)

**Done**: el reporte expone el estado de confirmación y el PATCH lo cambia, con authz.

## M2 — Web: api.ts + Reporte de Camisetas

- [x] `api.ts` — `updateShirtOrderConfirmation`
- [x] `ShirtsReportView.vue` — stat card "Confirmados X/Y" (`PackageCheck`)
- [x] Columna "Confirmado" con badge clicable + botón WhatsApp
      (`buildWhatsAppChatLink`, oculto sin teléfono, `MessageSquare`)
- [x] `toggleConfirmation` optimista + rollback + toast + `savingStates` (patrón attendance)
- [x] Filtro "Solo sin confirmar" (Button, AND con búsqueda)
- [x] Columna ✓ print-only con estado real + colspan 3→4
- [x] `setup.ts` allowlist lucide += `PackageCheck`/`MessageSquare` (si faltan)
- [x] Spec vitest: mocks locales += íconos/fn; fixtures += campos; casos toggle, rollback,
      doble-tap, filtro, wa.me, print; asserts de headers/cuadrito actualizados
- [x] Verificar: `pnpm --filter web test` + `vue-tsc` (build) — spec 29/29 verde y
      `pnpm --filter web build` ✓ (solo warning preexistente de chunks >1000 kB)

**Done**: el reporte es la cuadratura viva de confirmaciones, con WhatsApp a un clic.

## M3 — Docs + verificación end-to-end

- [x] Extender `docs/features/shirts-report.md` (badges, columna, toggle, botón WhatsApp,
      filtro, permiso, endpoint, semántica null/timestamp, impresión)
- [x] Bundle check: `grep __dirname dist/index.js` → 2 ocurrencias **preexistentes** y
      ESM-safe (consts locales en `src/index.ts:209` y `database/base-migration-manager.ts:9`,
      ambas `path.dirname(fileURLToPath(import.meta.url))`); mi cambio no toca paths del
      bundle
- [x] Suites completas api (por partes) + web — api: services 165 suites/3134 tests,
      controllers+routes 44/450, middleware+migrations+security+infra+utils+rbac 45/639 →
      0 fallos; web: 199 archivos/2955 tests verdes (2 skipped)
- [x] Flujo manual en dev del worktree: chulo da 1/11 con flip optimista → recarga persiste
      → se quita (0/11); wa.me con lada 52 MX (`525560705267` y variantes); filtro deja 10/11
      con chip contador y card contando sobre el total; búsqueda "11" con filtro activo →
      "Sin resultados" (AND); print: columna Confirmado `display:none` (badge+link), columna
      ✓ visible con estado real; 403 cubierto por el spec de rutas (ver desviaciones)
- [x] Cerrar este archivo: checkboxes + desviaciones

**Done**: documentada y verificada de punta a punta en el dev del worktree.

## Desviaciones respecto al plan

- **M1 — test authz**: en vez de moldear `participantShirtOrder.authz.integration.test.ts`
  (controller directo), el test nuevo es `tests/routes/shirtOrderConfirmation.routes.simple.test.ts`
  con supertest contra el router real y middlewares stubbeados (molde
  `flyerRoutes.simple.test.ts`). Motivo: el 403 de `requirePermission`/`requireRetreatAccess`
  vive en el middleware, invisible al llamar el controller directo; el patrón supertest ya
  existía en el repo y cubre wiring + semántica del controller + estado de la DB en un solo
  archivo. "Admin ajeno 403" queda cubierto por `requireRetreatAccess` denegado (es el gate
  que un admin de otro retiro no pasa).
- **M1 — tsc**: `tsc --noEmit` del api tiene ~8 errores preexistentes en el base (ni uno en
  los archivos tocados); el gate real del repo (`pnpm --filter api build` + jest) pasa verde.
  No se "arreglaron" los preexistentes (fuera de alcance).
- **M2 — href del botón WhatsApp**: el plan decía `:href="buildWhatsAppChatLink(...)` directo;
  vue-tsc (TS2322) no estrecha `string | null` entre la llamada del `v-if` y la del `:href`
  (son dos invocaciones). Fix: `:href="whatsappLink(participant) ?? undefined"`. El `v-if`
  sigue garantizando que el link nunca se renderiza con href null.
- **M2 — ícono MessageSquare**: ya estaba en la allowlist de `setup.ts` (línea 488); solo hizo
  falta añadir `PackageCheck`.
- **M3 — bundle check**: el plan esperaba `grep __dirname dist/index.js` vacío; el resultado
  real son 2 ocurrencias preexistentes (consts `__dirname` locales que envuelven
  `fileURLToPath(import.meta.url)` — ESM-safe) en líneas que mi diff no toca. Verificado en M1
  con `grep -c __dirname dist/index.js` = 2.
- **M3 — 403 del flujo manual**: no se probó con un usuario real sin `participant:update` en
  el navegador (no hay uno a mano en la DB de dev); el caso queda cubierto por el spec de
  rutas `shirtOrderConfirmation.routes.simple.test.ts` (supertest contra el router real con
  `requirePermission`/`requireRetreatAccess` stubbeados por `jest.requireActual` spread).
- **M3 — flujo manual, detalle del entorno**: al login aparecieron 2 console errors del
  dashboard (preexistentes, no de esta feature; la vista del reporte y su recarga no
  registraron errores). El screenshot inicial de Playwright cayó en la raíz del worktree en
  vez de `/tmp/chrome` (convención); movido al limpiar.

## Desviaciones del cierre (code-review post-M3)

El `/cierre` (2026-09-21) pasó code-review sobre el diff real de la rama
(`a16e4536..HEAD`); 7 hallazgos se arreglaron, 8 se descartaron con motivo:

- **Authz GET shirt-report**: el reporte ahora también pasa
  `requireRetreatAccess('retreatId')` — lista `cellPhone`/`country` de todos los
  servidores del retiro y `participant:read` es un permiso global (sembrado al rol
  `regular`); sin el gate, PII enumerable por retreatId. Spec nuevo
  `shirtReport.routes.simple.test.ts` (wiring + 401/403).
- **Write-protect del history CRUD**: `CreateHistoryData`/`UpdateHistoryData` ahora
  extienden `Omit<RetreatSnapshotFields, 'shirtOrderConfirmedAt'>` y
  `stripWriteProtectedFields` lo quita en runtime al entrar a
  `createHistoryEntry`/`updateHistoryEntry` — un `PUT /history` con el campo en el
  body bypaseaba el gate de retiro del PATCH dedicado.
- **Watcher del retiro**: `ShirtsReportView` recarga el reporte al cambiar
  `selectedRetreatId` (patrón `AngelitosView`); sin él, el toggle escribía contra el
  retiro del montaje.
- **Empty state del filtro**: la tabla vacía por "Solo sin confirmar" + todo
  confirmado ahora ofrece "Mostrar todos" (antes mentía con "Sin resultados para tu
  búsqueda" y link a limpiar la búsqueda).
- **Validación del PATCH**: `validateRequest(setShirtOrderConfirmationSchema)` en la
  ruta — sin JSON body el endpoint daba 500 (destructuring sobre `undefined`); ahora
  400. El check manual del controller se retiró (redundante).
- **Spec endurecidos**: caso 400-sin-body + prueba de 0-filas en el par inexistente
  (un WHERE sin `participantId` estamparía al retiro entero); flushPromises antes del
  assert de no-refetch; 2 casos web nuevos (watcher, empty state del filtro).
- **Test HTTP del write-protect no viable**: PUT/POST `/history` hidratan entities por
  el grafo del router y bajo jest lanzan el error preexistente "Class constructor
  RetreatParticipant cannot be invoked without 'new'" (documentado en
  `palancasCountWritePath.test.ts`). Se testea `stripWriteProtectedFields` unitariamente.
- **Descartados**: error→empty state y fallback MX de país (preexistentes, fuera de
  alcance); vanish del filtro al confirmar (diseño deliberado de cola de pendientes);
  3 copias del shape y extracción de composable (refactor cosmético); whatsappLink 2×/render
  (perf no medida, N chico); comentarios/it() en español en el spec web (consistencia con
  los vecinos del mismo archivo); echo de `error.message` en el 500 (copia bag-made, solo
  alcanzable con permisos).

## Evolución post-merge (2026-09-22): universo del reporte = todo el equipo servidor

Petición de Leonardo tras usar la feature: la confirmación no es "confirmaron su pedido" sino
"confirmaron" — parte del equipo responde **"no necesito camisetas"** y también recibe chulo.
El INNER JOIN a `participant_shirt_size` excluía a esa gente del reporte, así que la cuenta
"Confirmados X/Y" nunca cerraba contra los mensajes que la secuencia envía (enrola a TODOS
los `server`/`partial_server` no cancelados; verificado en `messageSequenceService` —
`audience = 'server'` no mira tallas).

Cambios (directo sobre master):

- **API** `shirtReportService.ts`: el lado de prendas pasó de INNER JOIN encadenado a **LEFT
  JOIN contra una subquery derivada** (scope por retiro y placeholders de talla filtrados
  adentro). El INNER plano dejaba pasar filas cross-retreat con columnas `rst` NULL (lo cazó
  el caso "does not include shirts from a different retreat" con prendas fantasma). Quien no
  pidió queda `shirts: []`, `shirtCharge: 0`, confirmable.
- **Web** `ShirtsReportView.vue`: chip **"Requieren camiseta"** (badge con conteo, AND con
  búsqueda y "Solo sin confirmar"); "Confirmados X/Y" sobre el equipo completo; subtítulo y
  empty states actualizados; nuevo estado "Nadie coincide con los filtros activos" →
  "Quitar filtros". La leyenda del badge (Confirmado/Sin confirmar) pasó a un
  `span hidden sm:inline` — en celular queda solo el glifo (petición de Leonardo).
- **Specs**: service 27 casos (invertida la exclusión de sin-prendas, extendido cross-retreat,
  caso de mezcla); vitest 31 → 38 (bloque del universo + badge responsive).
- Sin migración, sin endpoint nuevo, sin cambio en `@repo/types` (`shirts` ya era array
  sin mínimo).

## Evolución post-merge (2026-09-28): botón de envío desde el reporte

Petición de Leonardo: un botón por fila para **enviar** el mensaje de confirmación, sin salir
del reporte (antes había que ir a ParticipantList, buscar al servidor y usar su botón de
mensaje).

Cambios (directo sobre master), solo web:

- **Web** `ShirtsReportView.vue`: botón `Send` por fila que abre el dialog central
  `MessageDialog.vue` con `forceTemplateType="SERVER_SHIRT_CONFIRMATION"` — cero cambios de
  API. El dialog va **montado desde el arranque** (sin `v-if`): el watcher que preselecciona
  la plantilla solo dispara si ya está montado cuando se abre (patrón
  `CommunityDashboardView`). La plantilla no está en `MANUAL_HIDDEN_TEMPLATE_TYPES`, así que
  el coordinador puede cambiarla (p. ej. al `_REMINDER`) antes de enviar.
- **Hidratación de la ficha**: `participantStore.fetchParticipants()` (listado del retiro con
  `includePayments`), NO `GET /participants/:id` — la plantilla usa
  `{participant.paymentRemaining}` y ese getter solo es correcto con payments/debts/
  shirtSizes cargados (`findParticipantById` no carga `shirtSizes` → saldo sin cargo de
  prendas). Misma razón que `hydrateParticipantForTemplateVariables` en el motor de
  secuencias. Guard anti doble-tap por `sendingStates`; participante no encontrado (403
  silencioso del store o baja) → toast destructive y el dialog no abre.
- **Specs**: vitest 38 → 42 (botón por fila incluso sin teléfono, click → `api.get
  '/participants'` con `includePayments` + dialog con plantilla/retiro/participante
  correctos, no encontrado → toast, disabled durante la carga). MessageDialog mockeado entero
  (patrón `FollowUpView.test`); el toggle de confirmación pasó a seleccionarse por `title`
  (helper `toggleButtons`) porque la celda ahora tiene dos `<button>`.
- Declarado fuera: envío masivo a "todos los sin confirmar" (patrón `WhatsAppSendQueue`) —
  follow-up natural si se pide.

**Code-review del cierre (misma fecha)** — 3 hallazgos arreglados sobre `openMessageDialog`,
premisas verificadas contra el código antes de tocar:

- **Filtros heredados (M2)**: `participantStore.filters` es estado compartido entre vistas y
  `AssignLeaderModal` (línea 80) deja `type='server'` sin limpiar al cerrar; la hidratación
  viajaba con esa clave y excluía al participante (angelitos al 100%). Ahora se resetean las
  claves antes del fetch — el mismo reset que hace `ParticipantList` (línea 252).
- **Carrera con el cambio de retiro (M1)**: abrir el dialog tras un cambio de retiro en el
  sidebar mezclaba la ficha del retiro viejo con el `retreatId` nuevo (el binding era
  `currentRetreatId` vivo) → la comunicación se registraba bajo el retiro equivocado. Ahora
  el retreatId se captura al click (`messageRetreatId` alimenta el dialog) y hay guard
  post-await que aborta la apertura.
- **Catch ausente (m1)**: la rejection del fetch (el store rethrowea los non-403 tras su
  propio toast) escapaba al errorHandler global; ahora queda en `console.error` local.

Specs 42 → 45 (request sin claves heredadas + dialog abre para el angelito, retiro cambiado
durante la carga → dialog no abre ni toast, fetch rechazado → guard liberado). Descartado con
motivo: cambiar de retiro con el dialog ya abierto — inalcanzable, el modal bloquea el sidebar.

## Evolución post-merge (2026-10-02): resumen de pedido con caminantes y estimado

Petición de Leonardo: el conteo por prenda × talla que se armó a mano sobre el reporte impreso
para mandarle el pedido al proveedor, **dentro del reporte**; que incluya las camisetas de los
**caminantes** y un **estimado** de los que faltan por inscribirse ("hay 10 caminantes pero se
esperan 40").

Decisiones (aprobadas): universo = equipo completo (ignora búsqueda/chips, como el header);
tarjeta al final, imprimible; botón "Copiar resumen" para WhatsApp **sin precios**; estimado
persistido por retiro.

Cambios (directo sobre master):

- **API**: `shirtReportService` devuelve `walkerCount`, `walkerShirts` (conteo por talla, sin
  PII), `estimate` y, por tipo, `availableSizes` + `requiredForWalkers`. Endpoints
  `PUT`/`DELETE /retreats/:retreatId/shirt-order-estimate` (`retreat:update` +
  `requireRetreatAccess`, `validateRequest(..., { assignParsedBody: true })`, 404 sin retiro).
  Columna `retreat.shirtOrderEstimate` (simple-json) por la migración
  `20261005120000_AddShirtOrderEstimateToRetreat` (ADD COLUMN idempotente).
- **Web**: tarjeta "Resumen de pedido" (secciones equipo / caminantes / estimado / total a
  pedir), dialog "Estimar caminantes" con "Repartir los faltantes como los inscritos" (mayor
  residuo) y "Copiar resumen".
- **Specs**: service 27 → 35, rutas del estimado 17 nuevos, vista 45 → 62.

Desviaciones respecto al plan:

- **Talla del caminante con respaldo legacy**: el plan contaba solo `participant_shirt_size`.
  En el smoke con Buen Despacho los 11 caminantes salieron con 0 piezas: llegaron por import de
  Excel y solo traen `participants.tshirtSize` (la columna que lee el Reporte de Bolsas). La
  talla es ahora `COALESCE(fila de participant_shirt_size de un tipo de este retiro,
  tshirtSize legacy)`, una por caminante.
- **Prenda del caminante**: el plan la mapeaba al tipo `requiredForWalkers` o al primero (la
  regla del registro). En Buen Despacho ningún tipo está marcado, y "el primero" es "Blanca con
  rosa", una prenda del equipo: el pedido habría sumado 11 caminantes a ella sin que nadie lo
  notara. Sin tipo marcado, el caminante va en una fila propia "Camiseta de caminante" y la
  tarjeta lo avisa; marcar el tipo la funde.
- **Forma del estimado**: el plan lo anidaba por tipo (`{ tipo: { talla: piezas } }`); como el
  caminante lleva una sola prenda, quedó plano (`{ talla: piezas }`), acotado a 30 tallas.
  `walkerShirts` también quedó sin `shirtTypeId`.
- **Rutas en `shirtTypeRoutes.ts`**, no en `retreatRoutes.ts`: viven junto al GET del reporte
  (`/retreats/:retreatId/...`).
- **Sin refetch tras guardar el estimado**: el estado local se actualiza con el payload (el
  servidor guarda exactamente eso), sin el skeleton de la tabla.
- **Write-protect agregado**: `retreatService.update` descarta `shirtOrderEstimate` — `PUT
  /retreats/:id` hace `Object.assign` con el body crudo y el formulario del retiro reenvía el
  DTO completo; una copia vieja revertía el estimado. No estaba en el plan.
- **"Repartir los faltantes"** no estaba en el plan: es el atajo directo del ejemplo de
  Leonardo (40 esperados − 11 inscritos = 29 en la proporción de los inscritos).
- **Total a pedir**: además del total de piezas, un bloque con las fuentes sumadas por prenda ×
  talla (lo que de verdad se compra), solo cuando hay más de una fuente.
- **Migración aplicada por el dev ya levantado**: al empezar el smoke había un `pnpm dev`
  corriendo que no levanté yo; nodemon recargó con el código nuevo y aplicó la migración antes
  del respaldo. Es un `ADD COLUMN` sin pérdida posible, y existía un backup de un minuto antes
  (`database.sqlite.backup-pre-import-guard-20261002`). Verificado por el dato (copia read-only:
  columna presente y migración registrada).
- **Fallo intermitente no reproducido**: una corrida en paralelo de los specs de rutas dio
  403/404 en casos ajenos (había otro jest vivo de otra sesión). La causa NO es una SQLite
  compartida — la DB de test es `:memory:` por worker —; en el cierre, tres corridas en
  paralelo y una en serie salieron verdes. Causa no aislada.
