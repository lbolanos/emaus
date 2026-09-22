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
