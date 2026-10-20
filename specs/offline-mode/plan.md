# Plan: modo sin conexión durante el retiro

> SDD plan — versión 1.1 (2026-10-19). Cómo se implementa, por capas. El qué/por qué vive en
> `spec.md`; el estado verificado del código, en `research.md`. Incorpora la revisión del
> 2026-10-19: salud fuera de la caché, caché solo durante la ventana, M1 a prod por separado.

## Alternativas evaluadas

| Opción | Qué es | Por qué no (o sí) |
|---|---|---|
| **A. Servidor local en la casa** (laptop con `pnpm dev` + copia de la DB de prod + hotspot) | Los teléfonos apuntan a la laptop por LAN; al volver, se "sube" la DB | Prod sirve a otras comunidades al mismo tiempo (Veracruz, Celaya, Del Valle): no se puede reemplazar la DB entera, y una sincronización fila a fila de SQLite es un proyecto mayor que la cola. Además hardware que cargar, URL por IP, cookies `secure`/`sameSite` que no viajan en HTTP plano. **Nota útil**: para lectura, hoy ya es posible con `make db-pull` + `pnpm dev` en la laptop del coordinador, sin código. |
| **B. Service worker cacheando `/api/*`** (Cache API, network-first) | Lectura sin señal "gratis" para todas las vistas | Cachea respuestas autenticadas con PII por URL, sin que la app sepa qué es viejo ni pueda parchearlo con la cola; mezcla dos mecanismos de verdad. Se descarta como mecanismo de datos; el SW solo sirve el cascarón (D12). |
| **C. Base local sincronizada** (RxDB / PowerSync / ElectricSQL, CRDT) | Offline-first completo | Exige servidor de sync o Postgres, reescribir stores y entidades; el dominio tiene pocas operaciones en vivo y casi todas son idempotentes. Demasiado para lo que se gana. |
| **D. Solo "más resiliente"** (timeouts + reintentos, sin cola) | Cambio pequeño | No cubre minutos sin señal ni el arranque sin señal; el equipo seguiría volviendo al papel. |
| **E. Cola de escrituras + caché de lectura + cascarón PWA** (elegida) | Outbox con idempotencia servidor, IndexedDB bajo control de la app, SW para el cascarón | 90 % del valor con el 10 % de la complejidad de C; cada pieza es reversible por flag; reutiliza los endpoints y DTOs existentes. |

## Diseño (opción E)

```
┌──────────────── navegador ─────────────────┐      ┌────────── API ──────────┐
│ sw.js (workbox)  → cascarón: index, chunks  │      │ idempotency middleware   │
│                                             │      │   ↓ tabla idempotency_… │
│ connectivityStore ← resultado de requests   │      │ endpoints de siempre     │
│ offlineCache (IndexedDB) ← GETs lista blanca│ HTTP │   + occurredAt opcional  │
│ outbox (IndexedDB) ← mutaciones nivel 1     │ ───▶ │ auditoría + occurredAt   │
│ reducers: outbox ⟶ parches sobre la caché   │      │ WS emits (sin cambio)    │
│ syncService: FIFO, Idempotency-Key, backoff │      └──────────────────────────┘
│ UI: chip de estado · panel pendientes       │
└─────────────────────────────────────────────┘
```

Principios:

1. **Los endpoints no cambian de forma**: la cola reenvía exactamente las mismas llamadas que
   hace la vista en línea. Solo se añaden una cabecera (`Idempotency-Key`) y un campo opcional
   (`occurredAt`) en tres endpoints.
2. **La caché guarda DTOs tal cual, menos salud**: clave = URL completa (con query) + `userId`;
   valor = `response.data` tras recortar `SENSITIVE_HEALTH_FIELDS` (`@repo/types`) en las
   respuestas de `/participants`. Las vistas no saben de IndexedDB; lo sabe el cliente HTTP.
   Alimentación y Medicamentos no están en la lista blanca.
3. **La cola es la verdad local hasta que el servidor conteste**: los reductores aplican la cola
   sobre la caché en memoria al leer, no mutan la caché persistida (se recomputa al sincronizar).
4. **Todo es apagable** por `EMAUS_RUNTIME_CONFIG.offlineMode === false`.

## Capa 0 — Cascarón PWA (M1)

| Archivo | Cambio |
|---|---|
| `apps/web/package.json` | dev dep `vite-plugin-pwa`; dep `idb`; dev dep `fake-indexeddb` |
| `apps/web/vite.config.ts` | `VitePWA({ registerType: 'prompt', injectRegister: null, manifest: {...}, workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//, /^\/health$/, /^\/[a-z0-9]+(\/server)?$/], globPatterns: ['**/*.{js,css,html,ico,svg,webp,png,woff2}'], globIgnores: [chunks de registro/mapas/geo], runtimeCaching: [{ urlPattern: /\/assets\/.*\.(js|css)$/, handler: 'CacheFirst' }], cleanupOutdatedCaches: true } })`. El denylist de slugs evita que el SW capture `/<slug>` (preview OG por nginx) |
| `apps/web/src/pwa/registerSw.ts` | NUEVO. Importado con `import()` tras `app.mount` en `main.ts`; usa `virtual:pwa-register` con `onNeedRefresh` → `versionStore.setSwUpdate(updateSW)`; no registra si `offlineMode === false` o si la ruta es pública |
| `apps/web/src/stores/versionStore.ts` + `components/UpdateBanner.vue` | El banner también se muestra cuando el SW tiene versión nueva; "Actualizar" llama `updateSW(true)` (skipWaiting + reload). El poll de `version.json` sigue como está |
| `nginx.conf` | `location = /sw.js` y `location = /manifest.webmanifest` con `Cache-Control: no-cache` + headers de seguridad (molde: `location = /version.json`) |
| `apps/web/public/` | íconos 192/512 del manifest (desde `logo_oficial.png`) |
| `apps/web/index.html` | `<link rel="manifest">`, `apple-touch-icon`, `apple-mobile-web-app-capable` |

Verificación: `pnpm --filter web build` produce `dist/sw.js` + `manifest.webmanifest`; e2e
chromium: cargar dashboard → `context.setOffline(true)` → `page.reload()` → cascarón visible.

## Capa 1 — Conectividad, caché de lectura y auth persistida (M2)

| Archivo | Cambio |
|---|---|
| `apps/web/src/offline/db.ts` | NUEVO. `idb` con stores: `responses` (key `${userId}|${url}`, `{data, fetchedAt, retreatId}`), `outbox` (key `id`, índice `retreatId,status`), `meta` (`authProfile`, `preparedAt:<retreatId>`). Versión 1 |
| `apps/web/src/stores/connectivityStore.ts` | NUEVO. `state: 'online' | 'offline'`, `lastOnlineAt`, `pendingCount`, `conflictCount`, `syncing`. `reportNetworkFailure()` / `reportSuccess()` llamados desde los interceptores; listeners `online`/`offline`/`visibilitychange` solo como **disparadores de reintento**, nunca como verdad |
| `apps/web/src/offline/cacheableRoutes.ts` | NUEVO. Lista blanca de GET (regex sobre `config.url`): `/participants?`, `/participants/reception/`, `/tags?`, `/retreats`, `/retreats/:id`, `/retreats/:id/beds`, `/tables/retreat/`, `/schedule/retreats/:id/items`, responsabilidades, Santísimo `listSlots`, `/auth/status`. Un solo lugar; test que la lista cubre los fetchers de la preparación |
| `apps/web/src/services/api.ts` | `timeout: 10_000` solo en peticiones marcadas `config.offline = { kind }` (mutaciones nivel 1) y en GETs cacheables; interceptor de respuesta: GET cacheable OK → `stripHealthForCache(data)` (quita cada clave de `SENSITIVE_HEALTH_FIELDS` de cada participante, en listas y en recepción) → `offlineCache.put`; error de red/timeout en GET cacheable → `offlineCache.get` → resuelve con `{ data, fromCache: true, fetchedAt }` (si no hay, rechaza con `OfflineNoDataError`). La respuesta en línea sigue intacta: el recorte es solo para lo que se guarda |
| `apps/web/src/views/FoodView.vue`, `MedicinesReportView.vue` | Fuera de la lista blanca; sin señal muestran "Necesita conexión" en vez de la lista (mismo molde que D11) |
| `apps/web/src/stores/authStore.ts` | `checkAuthStatus` OK → `meta.authProfile = {user, userProfile, savedAt}`; error de red + perfil guardado → hidrata `user/userProfile/isAuthenticated=true` y marca `authSource='cache'`; 401 → borra el perfil. `logout` → `offlineDb.clearAll()` |
| `apps/web/src/components/layout/ConnectivityChip.vue` | NUEVO (ícono `WifiOff`/`Cloud`/`CloudUpload`, allowlist en `setup.ts`), montado en `Sidebar.vue` bajo el selector de retiro; click → panel de pendientes (capa 3) |
| `apps/web/src/components/StaleDataBadge.vue` | NUEVO. "datos de hace X min" a partir de `fetchedAt`; lo usan las vistas de nivel 2 cuando el store expone `fromCache` |
| Stores de lectura (`participantStore`, `scheduleStore`, `tableMesaStore`, `retreatStore`) + vistas `RecepcionView`, `BedAssignmentsView` | Exponer `lastFetchedAt`/`fromCache` del resultado y no mostrar toast de error cuando la respuesta vino de caché; mostrar "Sin datos descargados" ante `OfflineNoDataError` |

## Capa 2 — Servidor: idempotencia, `occurredAt`, auditoría (M3)

| Archivo | Cambio |
|---|---|
| `apps/api/src/migrations/sqlite/20261020120000_CreateIdempotencyKeys.ts` | NUEVO. `CREATE TABLE idempotency_keys (key TEXT PRIMARY KEY, userId TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, statusCode INTEGER NOT NULL, responseBody TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)` + índice por `createdAt`. SQL plano, sin imports del workspace; `down` = `DROP TABLE`. También en `CreateSchema.ts` para DBs frescas |
| `apps/api/src/entities/idempotencyKey.entity.ts` | NUEVO + registro en `entities/index.ts` |
| `apps/api/src/middleware/idempotency.ts` | NUEVO. Si hay `Idempotency-Key` (UUID v4, ≤ 64 chars) y usuario autenticado: busca `(key)`; si existe y coincide `userId+method+path` → responde el `statusCode/body` guardado con header `Idempotent-Replayed: true`; si existe con otro `userId/method/path` → 422; si no existe → envuelve `res.json` para guardar la primera respuesta 2xx/4xx (los 5xx no se guardan: el cliente debe reintentar). Se monta **por ruta** en los endpoints de D2, no global |
| `apps/api/src/services/idempotencyService.ts` | `purgeOlderThan(7d)` llamado desde el cron existente de limpieza (o `setInterval` al boot, como el watchdog) |
| `apps/api/src/middleware/requestContext.ts` + `utils/auditContext.ts` | Leen `X-Client-Time` (ISO) y `Idempotency-Key` al contexto; `domainAuditService.log` los copia a `metadata.occurredAt` / `metadata.syncedFromOutbox` cuando existen |
| `apps/api/src/services/participantService.ts` (`setParticipantCheckIn`) | Parámetro opcional `occurredAt?: Date`; `checkedInAt = checkedIn ? (occurredAt ?? new Date()) : null`. Controller valida ISO, no futuro (+5 min de tolerancia), no más de 14 días atrás |
| `apps/api/src/services/retreatScheduleService.ts` (`startItem`, `completeItem`) | Mismo parámetro opcional → `actualStartTime` / `actualEndTime` |
| `packages/types/src/index.ts` (schemas de check-in y schedule start/complete) | `occurredAt: z.string().datetime().optional()` (opcional, nunca requerido) |
| Rutas: `participantRoutes.ts` (`/:id/checkin` y `PUT /:id`), `paymentRoutes.ts` (POST `/`), `retreatParticipant.routes.ts` (bag-made), `retreatScheduleRoutes.ts` (start/complete/shift/days shift), `retreatBedRoutes.ts` (assign), `tableMesaRoutes.ts` (walkers POST/DELETE) | `idempotencyMiddleware` después de auth/CSRF y antes del controller. En `PUT /:id` solo actúa si llega la cabecera (la edición normal de la ficha no la manda) |

Tests (Jest): middleware (replay devuelve el mismo body y no ejecuta el handler; clave ajena →
422; 5xx no se guarda); migración (up/down, PK); `setParticipantCheckIn` con `occurredAt`;
`startItem/completeItem` con `occurredAt`; `POST /payments` dos veces con la misma clave → una
fila; auditoría con `metadata.occurredAt`.

## Capa 3 — Cola, reductores y sincronización (M4)

| Archivo | Cambio |
|---|---|
| `apps/web/src/offline/outboxKinds.ts` | NUEVO. Catálogo cerrado (11): `reception.checkin`, `reception.payment`, `participant.setCancelled` (body explícito `{isCancelled, contextRetreatId}` a `PUT /participants/:id`; el reductor marca `isCancelled`, quita al participante de `pendingList`/`arrivedList` y baja `total`/`pending`, libera su cama en `beds` y lo saca de `walkers` en `tables`, espejo de la cascada del servidor), `bags.bagMade`, `schedule.start`, `schedule.complete`, `schedule.shift`, `schedule.shiftDay`, `beds.assign` (incluye desasignar con `participantId:null`), `tables.assignWalker`, `tables.unassignWalker`. Por kind: `request(payload) → AxiosRequestConfig`, `reduce(cache, payload)`, `label(payload, t)` |
| `apps/web/src/offline/outbox.ts` | NUEVO. `enqueue(kind, payload, {retreatId})` genera `id`, `idempotencyKey` (`crypto.randomUUID()`, fallback como en `telemetryService.generateSessionId`), `occurredAt`; `list(retreatId)`, `markConflict`, `discard`, `retry` |
| `apps/web/src/offline/offlineMutation.ts` | NUEVO. `offlineMutation(kind, payload)`: si `connectivity.state==='offline'` → enqueue y devuelve `{queued:true}`; si no, intenta la request con `Idempotency-Key` + `X-Client-Time` + timeout 10 s; error de red/timeout → enqueue con **la misma clave** (así el reenvío no duplica si el original sí llegó); 4xx → rechaza como hoy (no se encola: el servidor contestó). Las funciones de `api.ts` de los 11 kinds pasan a delegar aquí |
| `apps/web/src/offline/syncService.ts` | NUEVO. `flush()`: token CSRF fresco → FIFO por `occurredAt`; por op: `status='syncing'` → request → `done` (y borra) · 4xx → `conflict` con `lastError` y sigue · red/timeout/5xx → backoff (2, 4, 8, 16, 30 s máx.) y para · 401 → para + `needsLogin=true`. Dispara en `online`, `visibilitychange`, cada 30 s con cola, y manual. Al terminar sin pendientes → `refetchRetreat()` (los fetchers de la preparación) |
| `apps/web/src/stores/outboxStore.ts` | NUEVO. Cola reactiva (array, no `Map`), `pendingCount`, `conflicts`, acciones; es la fuente del chip y del panel |
| `apps/web/src/offline/applyOutbox.ts` | NUEVO. Al leer desde caché (`fromCache`) o al hidratar un store, aplica `reduce` de las ops `pending|syncing` del retiro sobre el DTO en memoria. Reductores pequeños y puros, testeados uno por uno |
| `apps/web/src/components/offline/PendingSyncPanel.vue` | NUEVO. Lista de pendientes y conflictos (`label`, quién, `occurredAt`, error), reintentar/descartar, "Sincronizar ahora", "Borrar datos sin conexión" |
| Vistas: `RecepcionView.vue`, `BagsReportView.vue`, `MinuteByMinuteView.vue` (+ `scheduleStore`), `BedAssignmentsView.vue`, `TablesView.vue` (+ `tableMesaStore`) | Usan `offlineMutation` vía las funciones de `api.ts`; tratan `{queued:true}` como éxito con toast "Guardado sin conexión; se enviará al volver la señal"; tras una op encolada **no** refetchean (aplican el reductor); deshabilitan las acciones no encolables con tooltip cuando `offline` (D11) |
| `RecepcionView.vue` (lista de Faltan) + `ParticipantList.vue` (Caminantes) | Acción nueva por fila "No llegó → cancelar" con confirm (`window.confirm` con i18n, molde del toggle de beca) y gate `useAuthPermissions().hasPermission('participant:update')`; llama `setParticipantCancelled(participantId, retreatId, true)` nueva en `api.ts` (body explícito, nunca spread de la ficha) → `offlineMutation('participant.setCancelled')`. En línea se comporta como la edición de hoy (misma cascada). `reactivateParticipant` existente pasa a usar el mismo body explícito con `false` |
| `apps/web/src/locales/es.json` + `en.json` | Keys `offline.*` (chip, panel, toasts, tooltips, preparación) |

## Capa 4 — Preparación, antigüedad y purga (M5)

| Archivo | Cambio |
|---|---|
| `apps/web/src/offline/prepareRetreat.ts` | NUEVO. Lista ordenada de fetchers (los de `cacheableRoutes` para el retiro) + `import()` de las vistas de D3 para calentar sus chunks; progreso `{step, total, bytes}`; guarda `meta.preparedAt:<retreatId>`; nunca llama ni calienta Alimentación/Medicamentos |
| `apps/web/src/views/RetreatDashboardView.vue` | Card "Trabajar sin conexión": estado (preparado hace X, tamaño), botón Preparar visible desde 7 días antes de `startDate`, auto-preparación cuando `isRetreatLive` (máx. 1 cada 15 min, `meta`) |
| `apps/web/src/offline/purge.ts` | Al arrancar y al terminar cada sincronización: borra `responses` y `meta.preparedAt` de todo retiro cuya ventana cerró (`endDate` < hoy en la TZ del retiro, con `todayYmdInTz`/`toYmd` de `retreatLiveStatus.ts`). La `outbox` con `pending|conflict` **nunca se borra sola**: queda visible en el panel con el aviso "el retiro terminó; sincroniza o descarta". Un retiro en vivo no se toca |
| `apps/web/src/docs/es/offline.md` (+ en) | Ayuda in-app: qué funciona sin señal, qué no, dónde ver pendientes, riesgo de PII en el dispositivo (D9) |
| `docs/features/offline-mode.md` | Documentación de la feature; enlaza a esta spec |

## Contratos nuevos (resumen)

| Contrato | Detalle |
|---|---|
| Header `Idempotency-Key` | UUID v4; opcional; solo en los 11 endpoints de D2; respuesta repetida lleva `Idempotent-Replayed: true` |
| Header `X-Client-Time` | ISO 8601 de la hora del dispositivo al **ocurrir** la acción; va a `metadata.occurredAt` de auditoría |
| Body `occurredAt` | Opcional en check-in, schedule start y complete; valida no futuro (+5 min), ≤ 14 días atrás |
| Runtime flag | `window.EMAUS_RUNTIME_CONFIG.offlineMode` (default `true` en prod y dev; `false` apaga SW, caché y cola) |

## Riesgos y mitigación

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | SW sirve chunks viejos tras un deploy → errores de módulo | `registerType: 'prompt'` + `cleanupOutdatedCaches`; el banner existente pide recargar; `chunkErrorRecovery` sigue como red (max 3) |
| R2 | SW intercepta rutas públicas o `/api` | `navigateFallbackDenylist` + test e2e: `/<slug>` sin SW registrado y `/api/*` nunca `from ServiceWorker` |
| R3 | Pago duplicado por reenvío | Misma `Idempotency-Key` en el intento original y en la cola; middleware replay; CA 6 y 12 |
| R4 | Horas falsas al sincronizar | `occurredAt` (D7); test de `checkedInAt` igual al enviado |
| R5 | Conflicto entre dispositivos (misma cama) | Orden de llegada + validación servidor + lista de conflictos (D5, CA 10) |
| R6 | Sesión caducada a mitad de cola | 401 detiene y conserva; login manual; CA 11 |
| R7 | PII en el dispositivo | Salud nunca se guarda (recorte de `SENSITIVE_HEALTH_FIELDS` + Alimentación/Medicamentos fuera); purga al cerrar la ventana, al logout y manual; ayuda in-app; sin cifrado (D9, documentado) |
| R7b | El recorte de salud diverge de la lista del API | Se importa la misma constante de `@repo/types` que usa `stripSensitiveHealthFields`; test que falla si una clave de la lista llega a IndexedDB |
| R8 | Safari iOS: pila corta, evicción de storage | `import()` del registro tras mount; manifest + "Agregar a inicio"; prueba de campo en iPhone |
| R9 | La preparación gasta datos móviles | Solo dentro de la ventana D1 o manual; máx. 1 cada 15 min; muestra tamaño |
| R10 | Rate limit 300/min al sincronizar | FIFO secuencial, sin paralelismo; una cola realista son decenas de ops |
| R11 | `shift ±5` no es idempotente | Es justamente lo que la clave de idempotencia protege; sin clave no se reenvía |
| R12 | Refetch tras sync pisa parches locales de ops aún pendientes | `applyOutbox` se aplica también sobre respuestas frescas mientras haya `pending`; el refetch final solo corre con cola vacía |
| R13 | Bundle ESM del API | Gate `pnpm --filter api build` + `grep __dirname dist/index.js` en M3 y M6 |
| R14 | Tests web sin IndexedDB | `fake-indexeddb/auto` en `setup.ts` |

## Verificación end-to-end (M6)

Stack del worktree (`start-worktree-dev.sh`, puertos propios, DB desechable), login
`leonardo.bolanos@gmail.com` / `123456`; un retiro de la DB con fechas movidas a "en vivo".
Guion en `tasks.md` M6 (los 16 CA de `spec.md`), e2e Playwright chromium con
`context.setOffline` y `page.route` con delay para señal mala; dos contextos para el conflicto.
Prueba de campo en un iPhone y un Android en modo avión contra el deploy de prod detrás del
flag, en la semana previa al siguiente retiro.

## Despliegue

Decidido el 2026-10-19: **dos releases**. Primero M1 (PWA) solo, con una semana de margen antes
del siguiente retiro para ver en prod que recargar, actualizar y el banner de versión siguen
bien. Después M2-M5 en un segundo release detrás de `offlineMode` (default `true`). Pasos de
deploy fuera de lo automático para M1: `nginx.conf` nuevo en el servidor (`location = /sw.js` y
manifest) **antes** del push, o el SW queda `immutable` (G9). Tras el deploy: comprobar
`curl -I https://emaus.cc/sw.js` → `no-cache`; `version.json` sigue respondiendo; abrir prod en
un iPhone y "Agregar a pantalla de inicio".
