# Research: modo sin conexión durante el retiro

> SDD research — versión 1.0 (2026-10-19). Estado actual del código relevante, verificado el
> 2026-10-19 sobre `origin/master` (`1bf67691`; el master local `69951528` solo suma el merge de
> `participant-email-change`, que no toca nada de lo citado). Las anclas son `archivo` +
> nombre de función; no se citan líneas.

## Resumen

No existe ninguna pieza de soporte sin conexión: ni service worker, ni manifest, ni IndexedDB,
ni cola de escrituras, ni detección de conectividad (`grep -rniE "serviceworker|workbox|
vite-plugin-pwa|indexeddb|dexie|localforage|navigator\.onLine|offline"` sobre `apps/web/src`
solo encuentra la key i18n `"offline": "Desconectado"` y la mención del zip de guiones). Lo que
sí existe y condiciona el diseño está abajo.

## Frontend: arranque, auth y router

- `apps/web/src/main.ts` — `boot()` con imports dinámicos (regla Safari iOS), espera
  `router.isReady()`, monta, y lanza `authStore.checkAuthStatus()` en segundo plano.
- `apps/web/src/stores/authStore.ts` — `checkAuthStatus`: GET `/auth/status`; **ante 429 o
  error sin `response` conserva el estado actual** (comentario: evita el loop al login). En
  arranque frío ese estado es `isAuthenticated=false`, así que **sin señal el guard manda al
  login**. `user`/`userProfile` viven solo en memoria (nada en storage). `logout` resetea
  `inventoryStore` y `participantStore`.
- `apps/web/src/router/index.ts` — `beforeEach`: sincroniza `retreatStore.selectRetreat` desde
  la URL; `checkAuthStatus` como máximo cada 5 min (`AUTH_RECHECK_INTERVAL`); gates
  `requiresAuth`, `requiresSuperadmin`, `requiresAdmin`, `requiresPermission` (hoy solo
  `participant:health` en `food` y `medicines-report`). Maneja `vite:preloadError` y
  `router.onError` con `chunkErrorRecovery` (máx. 3 recargas, 30 s entre ellas).
- `apps/web/src/composables/useAuthPermissions.ts` — permisos derivados de
  `authStore.userProfile` (`permissions` + `roles[].globalPermissions` + rol del retiro). Es lo
  que habría que persistir para el arranque sin señal (D8).
- `apps/web/src/config/runtimeConfig.ts` — `window.EMAUS_RUNTIME_CONFIG` inyectado por
  `public/runtime-config.js`; es el sitio natural para el flag `offlineMode` (NFR-5).

## Frontend: cliente HTTP y CSRF

- `apps/web/src/services/api.ts` (4612 líneas) — instancia `api` de axios con `withCredentials`,
  **sin `timeout`** (una petición colgada por señal mala espera hasta el `proxy_read_timeout`
  de 60 s de nginx). Interceptor de respuesta: 401 → toast "Sesión expirada" (no desloguea).
  Todas las funciones de dominio viven aquí (`checkInParticipant`, `createPayment`,
  `updateBagMade`, `retreatScheduleApi.*`, `santisimoApi.*`, `getReceptionStats`…).
- `apps/web/src/utils/csrf.ts` — token cacheado 10 min; el interceptor de request lo pide
  antes de cada POST/PUT/PATCH/DELETE y **si falla sigue sin token** (warn); el de respuesta
  reintenta una vez ante `CSRF_TOKEN_INVALID/REQUIRED`. `initializeCsrfProtection` reintenta con
  backoff (2-16 s, 5 intentos) si `/auth/status` o `/csrf-token` fallan.
- `apps/web/src/services/apiError.ts` — `apiErrorMessage(err)` convierte errores axios/Zod a
  texto legible; es lo que las vistas muestran en toasts.

## Frontend: tiempo real

- `apps/web/src/services/realtime.ts` — socket.io singleton, `path: /api/socket.io`, reconecta
  solo con backoff (doc `docs/features/websockets-realtime.md`, "no implementar reconexión
  manual"). Auth por cookie; es **solo push servidor→cliente**.
- Stores con `subscribeRealtime`: `receptionStore.ts` (`reception:checkin`, `reception:bag-made`),
  `messageSequenceStore.ts`; `scheduleStore.ts` recibe `schedule:*`. Reacción: refetch.
- Al volver la señal, socket.io reconecta y las vistas refetchean: esto ya cubre "ver lo de los
  demás" sin trabajo nuevo; lo nuevo es que el refetch no pise los parches locales pendientes
  (FR-13).

## Frontend: vistas en vivo y sus endpoints (lista blanca candidata)

| Vista (ruta) | GET que consume | Escrituras durante el retiro | Semántica server |
|---|---|---|---|
| Recepción `retreats/:id/reception` (`RecepcionView.vue`) | `GET /participants/reception/:retreatId` (`getReceptionStats`) | `PUT /participants/:id/checkin` `{retreatId, checkedIn}`; `POST /payments` `{retreatId, participantId, amount, paymentDate, paymentMethod}` | check-in: `setParticipantCheckIn` en `participantService.ts` hace **set** (idempotente) y pone `checkedInAt = new Date()` del servidor; emite WS y auditoría `participant.checkin`. Pago: `PaymentController.createPayment` crea siempre una fila nueva (**sin deduplicación**), `recordedBy` de la sesión, auditoría `payment.create`. |
| Bolsas `bags-report` (`BagsReportView.vue`) | `GET /participants?retreatId&includePayments=true` (vía `participantStore`) | `PATCH /history/retreat/:retreatId/participant/:participantId/bag-made` `{bagMade}` (`updateBagMade`) | `updateBagMadeController` → `syncRetreatFields` (set idempotente) + WS. La vista ya es **optimista con rollback**. |
| Minuto a minuto `retreats/:id/minuto-a-minuto` (`MinuteByMinuteView.vue`, `scheduleStore.ts`) | `GET /schedule/retreats/:id/items` (`retreatScheduleApi.list`, trae `attachments[]` con markdown inline o `storageUrl`); `GET /participants?retreatId` (nombres de responsables) | `POST /schedule/items/:id/start`, `…/complete`, `…/shift {minutesDelta, propagate}`, `POST /schedule/retreats/:id/days/:day/shift`, `PATCH /schedule/items/:id`, `…/reorder`, `POST …/bell` | `startItem/completeItem` en `retreatScheduleService.ts`: `update` incondicional con `now` del servidor (idempotentes salvo la hora), WS + auditoría. `shift` recalcula `endTime` y `resolveSantisimoConflicts` (**no idempotente**: dos envíos = ±10). Bell: solo WS, sin persistencia. |
| Camas `retreats/:id/bed-assignments` (`BedAssignmentsView.vue`) | `GET /retreats/:id/beds` | `PUT /retreat-beds/:bedId/assign {participantId|null}`; `PUT …/toggle-active`; `POST /retreats/:id/auto-assign-beds`; `DELETE …/bed-assignments` | `assignParticipantToBed` en `retreatBedController.ts`: transacción; valida cama activa, participante no cancelado, género en retiros de parejas; **desasigna la cama anterior del participante** (mover = 1 llamada); asignar sobre una cama ocupada por otro **responde 409** (corregido en M3: la v1.0 de este research decía que la sobrescribía); el `catch` del controller mapea a 403/404/409/422 y por defecto 400. Auditoría `bed.assign/unassign`. |
| Mesas `tables` (`TablesView.vue`, `tableMesaStore.ts`) | `GET /tables/retreat/:retreatId` | `POST /tables/:tableId/walkers {participantId}`; `DELETE /tables/:tableId/walkers/:walkerId`; `POST/DELETE …/leader/:role`; el store hace `GET /tables/:sourceId` tras mover para refrescar la mesa origen | Servicio en `tableMesaService.ts`; 409 por nombre duplicado en rename; auditoría `table.assign_walker/unassign_walker`. |
| Cancelar no-show (`CancellationAndNotesView.vue` → `ParticipantList.vue` → formulario de edición) | (la lista de participantes) | `PUT /participants/:id` con **la ficha completa** por spread (`{...participant, isCancelled, contextRetreatId}`, `handleUpdateParticipant` / `reactivateParticipant`) | `updateParticipant` en `participantService.ts`: `updateParticipantSchema` es `.partial()`, así que un body `{isCancelled, contextRetreatId}` solo basta; `rpUpdates.isCancelled` solo si viene definido; **al pasar a cancelado limpia `tableId` y libera la cama del retiro** (`RetreatBed.participantId = null`); `notes` va a `rpUpdates.notes` y está gateada por `participant:health` en escritura (403 si no hay permiso). Guards: `validateRequest(updateParticipantSchema)` + `participant:update`. No existe endpoint dedicado de cancelación. |
| Caminantes/Servidores/Angelitos/Cancelados/Palancas/Gafetes/Playeras/Alimentación/Medicamentos | `GET /participants?retreatId&includePayments=true` (+ `GET /tags?retreatId`) | (lectura en v1) | Un solo payload para ~10 vistas: 70 columnas de `participants` + 39 de `retreat_participants` + pagos. |
| Responsabilidades, Mi agenda, Santísimo admin, Dashboard | `GET /retreats`, `GET /retreats/:id`, responsabilidades y Santísimo (`santisimoApi.listSlots`), `getReceptionStats` | (lectura en v1) | — |

El `Sidebar.vue` (watch de `selectedRetreatId`) dispara `participantStore.fetchParticipants()` y
`getReceptionStats` en cada cambio de retiro: son los dos fetchers que ya "calientan" sin querer
y deben ser los primeros de la lista de preparación.

## Backend: sesión, CSRF, rate limit, auditoría

- Sesión: `express-session` + `TypeormStore`, cookie `emaus.sid` `httpOnly`, `sameSite: strict`,
  **30 días rolling** y **techo absoluto 90 días** (`docs/features/session-duration-config.md`,
  `middleware/sessionExpiry.ts`). Un fin de semana sin señal no la vence; un 401 solo ocurre si
  el login fue hace > 90 días o alguien cambió la contraseña (revoca sesiones).
- CSRF: `middleware/csrfAlternative.ts` + `routeCsrf.ts`; el cliente manda `X-CSRF-Token` en
  mutaciones. En la sincronización hay que pedir token fresco antes de la primera operación.
- Rate limit: `apiLimiter` **300 req/min por IP** (`middleware/rateLimiting.ts`). Una cola de
  un fin de semana (decenas de operaciones) reenviada en secuencia queda muy por debajo; nada de
  ráfagas paralelas.
- Auditoría de dominio (`docs/features/domain-audit.md`): actor desde `AsyncLocalStorage`
  (`middleware/requestContext.ts`, `utils/auditContext.ts`); `createdAt` es la hora del servidor.
  No hay campo para "cuándo ocurrió"; `metadata` libre permite añadir `occurredAt`.
- Idempotencia: **no existe** (`grep -rni idempot apps/api/src` vacío). Ninguna tabla con esa
  función; `payments` no tiene unique que frene duplicados.
- Columnas `updatedAt`: existen en `participant`, `payment`, `retreat_schedule_item`; **no** en
  `retreat_bed`, `tables`, `retreat_participants`. No sirven como ETag uniforme (motivo para no
  diseñar control de versiones por registro en v1).
- Bundle ESM de prod (`apps/api/CLAUDE.md`): nada de `__dirname`/`require`; el middleware nuevo
  no toca rutas de archivos.

## Infra: nginx, CSP, headers

- `nginx.conf`: `location /` sirve `index.html` con `no-cache, no-store`; **todo `*.js|css|png…`
  con `expires 1y` + `immutable`** → un `sw.js` ahí se congelaría; hace falta `location = /sw.js`
  y `location = /manifest.webmanifest` con `no-cache` (como ya se hizo con `version.json`).
  `/api` con `proxy_read_timeout 60s`. Gzip incluye `application/manifest+json`.
- CSP (nginx y helmet en `apps/api/src/index.ts`): `default-src 'self' https:` — un worker del
  mismo origen pasa (`worker-src` hereda de `child-src` → `default-src`). `connect-src` del API
  lista localhost en dev.
- `docs/features/websockets-realtime.md` confirma `/api/socket.io` tras el mismo `location /api`.

## Safari iOS y móvil (lo que ya costó)

- `.ruler/skills/safari-ios-compatibility/SKILL.md`: pila corta; nada de imports estáticos
  nuevos en `main.ts`/router; chunks pesados (`country-state-city`) solo bajo demanda. El registro
  del service worker debe ir como `import()` dinámico tras `app.mount`.
- `apps/web/tests/e2e/mobile-page-weight.spec.ts`: guard de que el registro público no descarga
  Google Maps ni fuentes antes de tocar el formulario; un service worker que precachee "todo"
  rompería el espíritu del guard en las rutas públicas (NFR-2).
- Safari borra el almacenamiento script-writable tras **7 días sin interacción** salvo apps
  añadidas a la pantalla de inicio (ITP); un retiro dura 3 días con uso diario, así que el riesgo
  real es el jueves-de-la-semana-siguiente, no el fin de semana (D9 purga a los 7 días igual).

## Tamaño de los datos (DB de dev, copia inmutable, 2026-10-19)

| Dato | Máximo por retiro | Nota |
|---|---|---|
| Inscritos (`retreat_participants`) | 181 (93 caminantes + 57 servidores activos) | retiro `293a9f80…` |
| Ítems de agenda (`retreat_schedule_item`) | 149 | con `attachments[]` inline |
| Camas (`retreat_bed`) | 188 | |
| Mesas (`tables`) | 17 | |
| Pagos (`payments`) | 66 | viajan dentro de `/participants?includePayments` |
| Turnos de Santísimo (`santisimo_slot`) | 45 | |
| Responsabilidades (`retreat_responsibilities`) | 49 | |
| Columnas | `participants` 70, `retreat_participants` 39 | |

Estimación: `/participants` del retiro grande ≈ 181 × ~4 KB ≈ 0,7 MB sin comprimir (gzip
~150 KB); el total de la lista blanca < 2 MB sin comprimir. Cabe de sobra en IndexedDB (NFR-1).
La DB de dev tiene 8 retiros y 579 participantes; no hay retiro "en vivo" hoy (el último terminó
el 2026-10-18).

## Tests: infraestructura disponible

- Web: Vitest + `happy-dom`; `apps/web/src/test/setup.ts` mockea `@repo/ui`, `lucide-vue-next`
  (allowlist: ícono nuevo → `mount()` rompe), `vue-router`, `vue-i18n`, `axios`. **No hay
  IndexedDB en happy-dom**: hace falta `fake-indexeddb` (dev dep) para testear caché y cola.
- Patrón de store con socket mockeado: `apps/web/src/stores/__tests__/receptionStore.test.ts`.
- E2E: Playwright en `apps/web/tests/e2e/`, reglas en `.claude/rules/e2e-tests.md` (locale
  `es-MX`, no escribir en la base, `count()` no espera). `BrowserContext.setOffline(true)` corta
  también los fetch del service worker en chromium; `page.route` con `delay` simula señal mala.
  El stack del worktree se levanta con `.ruler/skills/worktree-testing/scripts/start-worktree-dev.sh`
  (DB desechable, puertos propios).
- API: Jest, `apps/api/src/tests/`; suite completa en 2 shards secuenciales con
  `--max-old-space-size` (memoria `reference_api_full_jest_suite_sigabrt`); una sola corrida a
  la vez. Tests de migraciones existentes como molde:
  `apps/api/src/tests/migrations/addAttendanceConfirmation.test.ts`.

## Dependencias nuevas (ninguna instalada hoy)

`pnpm-lock.yaml` no contiene `vite-plugin-pwa`, `workbox`, `idb` ni `fake-indexeddb`. Candidatas:
`vite-plugin-pwa` (workbox, generación de `sw.js` y manifest), `idb` (~1 KB, promesas sobre
IndexedDB), `fake-indexeddb` (dev). Verificar licencias MIT y mantenimiento al instalar.

## Gaps (lo que falta para el spec)

| # | Gap | Dónde |
|---|---|---|
| G1 | No hay cascarón sin señal: `index.html` `no-store`, sin service worker | `nginx.conf`, `apps/web/vite.config.ts`, `index.html` |
| G2 | Arranque sin señal → login (estado auth solo en memoria) | `authStore.ts`, `router/index.ts` |
| G3 | Sin timeout en axios: la UI se cuelga hasta 60 s con señal mala | `services/api.ts` |
| G4 | Sin caché de lectura: cada vista pide al servidor o muestra error/vacío | todas las vistas de la tabla |
| G5 | Sin cola de escrituras ni reductores locales | — |
| G6 | Sin idempotencia en el servidor: un reenvío de `POST /payments` duplica | `paymentController.ts`, middleware nuevo |
| G7 | `checkedInAt`, `actualStartTime/EndTime` con hora del servidor | `participantService.setParticipantCheckIn`, `retreatScheduleService.startItem/completeItem` |
| G8 | Sin UI de estado de conexión / pendientes / conflictos | `Sidebar.vue`, `AppLayout.vue` (molde: `UpdateBanner.vue`) |
| G9 | `sw.js` quedaría `immutable` un año | `nginx.conf` |
| G10 | Auditoría sin "cuándo ocurrió" | `domainAuditService` metadata |
| G11 | Cancelar hoy es "editar la ficha completa": no hay acción ni body explícito de cancelación, y la lista de Faltan de Recepción no la ofrece | `ParticipantList.vue`, `RecepcionView.vue` |

## Trampas catalogadas que aplican

- Bundle ESM del API (`__dirname`) — el middleware nuevo no toca paths, pero el gate `build +
  grep` sigue siendo obligatorio.
- Allowlist de lucide en `setup.ts` para los íconos del chip (`WifiOff`, `CloudUpload`…).
- `Set`/`Map` en `ref` no son reactivos (troubleshooting §5): la cola en el store va como array.
- `flushPromises` (no `nextTick`) en tests de vistas con `onMounted` async.
- Una sola corrida de Jest a la vez.
- `clearAllMocks()` no restaura spies; `vi.hoisted` para mock fns referenciadas en `vi.mock`.
- Schemas de escritura no deben exigir campos read-only: `occurredAt` entra como opcional en
  schemas nuevos/extendidos, nunca requerido.
