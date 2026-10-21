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
| `apps/web/package.json` | dev dep `vite-plugin-pwa` 1.3.0; dep `workbox-window` |
| `apps/web/vite.config.ts` | `VitePWA({ registerType: 'prompt', injectRegister: false, manifest: {...}, workbox: { globPatterns: [index.html, íconos, 'assets/**/*.{js,css,woff2,svg,png,webp}'], globIgnores: ['**/vendor-geo-*.js'], navigateFallback: 'index.html', navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/health$/, rutas con extensión], runtimeCaching: [runtime-config NetworkFirst 3 s, /assets/ CacheFirst sin vendor-geo, imágenes del mismo origen SWR], cleanupOutdatedCaches, clientsClaim } })`. Sin denylist de slugs (atraparía `/login` y `/app`; los rastreadores no ejecutan SW) |
| `apps/web/src/pwa/registerSw.ts` | NUEVO. `workbox-window` directo (testeable, sin módulo virtual). Lo importa con `import()` el `onMounted` de `AppLayout.vue`, así solo corre en `/app`. Solo en build de producción; con `offlineMode === false` desregistra y borra cachés `workbox-*`/`emaus-*` |
| `apps/web/src/stores/versionStore.ts` | `attachServiceWorker({checkForUpdate, applyUpdate})` y `markServiceWorkerWaiting()`. El poll de `version.json` llama `checkForUpdate` (`wb.update()`); `reloadForUpdate` (async) llama `applyUpdate`, que espera hasta 20 s al worker nuevo, manda `SKIP_WAITING` y recarga en `controlling`; si no hay worker, recarga simple. `UpdateBanner.vue` sin cambios |
| `apps/web/src/config/runtimeConfig.ts` + `apps/web/src/offline/flag.ts` | `offlineMode?: boolean` en el tipo de `EMAUS_RUNTIME_CONFIG`; `isOfflineModeEnabled()` en `offline/flag.ts` (solo un `false` explícito apaga), fuera de `runtimeConfig.ts` porque muchos tests lo mockean con solo `getApiUrl` |
| `nginx.conf` | `location =` para `/sw.js`, `/manifest.webmanifest` (con su `types`) y `/runtime-config.js`, en `no-cache` + cabeceras de seguridad (molde: `location = /version.json`). Guard en `apps/api/src/tests/infrastructure/nginxOfflineShell.simple.test.ts` |
| `apps/web/public/` | `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png` (logo centrado en lienzo blanco) |
| `apps/web/index.html` | `apple-touch-icon` y metas `*-web-app-capable`/título; el `<link rel="manifest">` lo inyecta el plugin en el build |

Verificación: `vite build` produce `dist/sw.js` + `manifest.webmanifest`; e2e chromium
`offline-shell.spec.ts` contra `vite preview` del build: login → worker controla →
`context.setOffline(true)` → `page.reload()` → cascarón visible, con control negativo
(`serviceWorkers: 'block'` → la misma recarga falla).

## Capa 1 — Conectividad, caché de lectura y auth persistida (M2)

| Archivo | Cambio |
|---|---|
| `apps/web/src/offline/storage.ts` | NUEVO. IndexedDB `emaus-offline` v1 sin dependencias: `responses` (clave `${userId}|${ruta}?${params}`, `{data, fetchedAt, retreatId, userId, route}`), `outbox`, `meta` (`authProfile`). `createMemoryStore()` para tests |
| `apps/web/src/offline/connectivity.ts` | NUEVO. Estado reactivo `online`, `lastOnlineAt`, `oldestServedFromCacheAt`, `missedWhileOffline`; `reportSuccess/reportNetworkFailure` desde los interceptores; `onReconnect` para la sincronización (M4); `probe()` a `version.json`; `offline` del navegador confiable, `online` solo dispara el sondeo |
| `apps/web/src/offline/readCache.ts` | NUEVO. Lista blanca de 12 GET (participantes, recepción, tags, retiros, retiro, camas, mesas, mesa, agenda, responsabilidades, Santísimo, equipos de servicio); `stripHealthForCache` sobre todo objeto con forma de persona; `saveResponse` / `answerFromCache` / `OfflineNoDataError` / `purgeResponses` |
| `apps/web/src/offline/flag.ts` | NUEVO (entra con M1). `isOfflineModeEnabled()` leyendo `window.EMAUS_RUNTIME_CONFIG` directo |
| `apps/web/src/offline/authProfile.ts` | NUEVO. Perfil confirmado en `meta`, vigencia 30 días |
| `apps/web/src/services/api.ts` | `timeout: 10_000` solo en peticiones marcadas `config.offline = { kind }` (mutaciones nivel 1) y en GETs cacheables; interceptor de respuesta: GET cacheable OK → `stripHealthForCache(data)` (quita cada clave de `SENSITIVE_HEALTH_FIELDS` de cada participante, en listas y en recepción) → `offlineCache.put`; error de red/timeout en GET cacheable → `offlineCache.get` → resuelve con `{ data, fromCache: true, fetchedAt }` (si no hay, rechaza con `OfflineNoDataError`). La respuesta en línea sigue intacta: el recorte es solo para lo que se guarda |
| `apps/web/src/views/FoodView.vue`, `MedicinesReportView.vue` | Fuera de la lista blanca; sin señal muestran "Necesita conexión" en vez de la lista (mismo molde que D11) |
| `apps/web/src/stores/authStore.ts` | `/auth/status` con timeout de 8 s; OK → guarda el perfil y `setCacheUser`; sin respuesta **o 429** en arranque en frío → hidrata desde el perfil guardado (`authSource='cache'`); 401 → lo borra; `logout` → borra perfil y respuestas (no la cola) |
| `apps/web/src/components/offline/ConnectivityChip.vue` | NUEVO, punto de color (sin lucide: los tests del Sidebar mockean lucide con lista fija), bajo el menú de usuario del `Sidebar.vue`; sin señal, un toque sondea; en M4 abre el panel de pendientes |
| `apps/web/src/components/offline/OfflineBanner.vue` | NUEVO, en `AppLayout.vue`: "datos guardados hace X" (i18n con plurales) y aviso de pantallas sin datos. Reemplaza al `StaleDataBadge` por vista |
| `participantStore` + `FoodView` / `MedicinesReportView` | `fromCache` en el store; las dos vistas de salud muestran `HealthNeedsConnection` (reintenta al volver la señal) en vez de la lista sin salud. Las demás vistas no cambian: reciben los mismos DTOs |

## Capa 2 — Servidor: idempotencia, `occurredAt`, auditoría (M3)

| Archivo | Cambio |
|---|---|
| `apps/api/src/migrations/sqlite/20261020120000_CreateIdempotencyKeys.ts` | NUEVO. `CREATE TABLE IF NOT EXISTS idempotency_keys (key varchar(64) PK, userId, method, path, statusCode integer, responseBody text, createdAt, completedAt)` + índice por `createdAt`. SQL plano, sin imports del workspace; `transaction = false` (el guard lo exige por el `DROP TABLE` del `down()`), `up()` re-ejecutable. No va en `CreateSchema.ts`: la migración crea la tabla también en bases frescas |
| `apps/api/src/entities/idempotencyKey.entity.ts` | NUEVO, registrada en `database/config.ts` y `tests/test-setup.ts` |
| `apps/api/src/middleware/idempotency.ts` | NUEVO. Con `Idempotency-Key` (UUID) y usuario: reserva por INSERT sobre la PK (dos concurrentes no pueden ganar los dos); coincide `userId+method+path` → replay con `Idempotent-Replayed: true` (4xx con su cuerpo, 2xx como `{ idempotentReplay: true }`, 204 vacío); en curso → 409 `IDEMPOTENCY_IN_PROGRESS`; otro dueño/ruta → 422 `IDEMPOTENCY_KEY_REUSED`; clave mal formada → 400. Primera vez: envuelve `res.json` para guardar el resultado **antes** de responder; `finish` cubre `send/end`; un 5xx borra la reserva. Se monta **por ruta**, después del permiso |
| `apps/api/src/services/idempotencyService.ts` | `reserve` / `complete` / `purgeOlderThan(7)`; purga diaria con `node-cron` arrancada en `index.ts` junto a las demás limpiezas |
| `apps/api/src/utils/occurredAt.ts` | NUEVO. `parseOccurredAt` (ISO, no futuro +5 min, ≤ 14 días; si no, `InvalidOccurredAtError` → 400) y `readClientTime` (versión tolerante para la cabecera) |
| `apps/api/src/middleware/requestContext.ts` + `utils/auditContext.ts` | Con clave válida: `idempotencyKey`, `clientTime` (`X-Client-Time`) y `fromOutbox` (`X-Outbox-Sync: 1`) al contexto; `domainAuditService.log` agrega `metadata.occurredAt` y `metadata.syncedFromOutbox` en los dos destinos |
| `apps/api/src/services/participantService.ts` (`setParticipantCheckIn`) | Parámetro opcional `occurredAt?: Date`; `checkedInAt = checkedIn ? (occurredAt ?? new Date()) : null`; el controller lo valida con `parseOccurredAt` |
| `apps/api/src/services/retreatScheduleService.ts` (`startItem`, `completeItem`) | Mismo parámetro opcional → `actualStartTime` / `actualEndTime`; `mapError` del controller responde 400 ante `InvalidOccurredAtError` |
| `packages/types` | Sin cambios: esas tres rutas no tienen schema zod |
| Rutas: `participantRoutes.ts` (`/:id/checkin` y `PUT /:id`), `paymentRoutes.ts` (POST `/`), `retreatParticipant.routes.ts` (bag-made), `retreatScheduleRoutes.ts` (start/complete/shift/days shift), `retreatBedRoutes.ts` (assign), `tableMesaRoutes.ts` (walkers POST/DELETE) | `idempotencyMiddleware` después de auth/CSRF y antes del controller. En `PUT /:id` solo actúa si llega la cabecera (la edición normal de la ficha no la manda) |

Tests (Jest): `idempotency.integration.test.ts` (cuenta ejecuciones del handler: replay, 4xx
final, 5xx libera, 204, clave ajena/otra ruta → 422, mal formada → 400, concurrencia → una sola
ejecución, purga); `idempotencyRoutes.simple.test.ts` (guard estático: las 11 rutas montan el
middleware después del permiso); `occurredAt.simple.test.ts`; `offlineSync.integration.test.ts`
(check-in y start/complete con `occurredAt`, metadata de auditoría, cancelación con body
explícito). Contrato para el cliente (M4): 409 `IDEMPOTENCY_IN_PROGRESS` y 5xx son transitorios;
otros 4xx son conflicto.

## Capa 3 — Cola, reductores y sincronización (M4)

| Archivo | Cambio |
|---|---|
| `apps/web/src/offline/outboxKinds.ts` | NUEVO. Catálogo cerrado (11): `reception.checkin`, `reception.payment`, `participant.setCancelled` (body explícito `{isCancelled, contextRetreatId}` a `PUT /participants/:id`; el reductor marca `isCancelled`, quita al participante de `pendingList`/`arrivedList` y baja `total`/`pending`, libera su cama en `beds` y lo saca de `walkers` en `tables`, espejo de la cascada del servidor), `bags.bagMade`, `schedule.start`, `schedule.complete`, `schedule.shift`, `schedule.shiftDay`, `beds.assign` (incluye desasignar con `participantId:null`), `tables.assignWalker`, `tables.unassignWalker`. Por kind: `request(payload) → AxiosRequestConfig`, `reduce(cache, payload)`, `label(payload, t)` |
| `apps/web/src/offline/outbox.ts` | NUEVO. Estado reactivo + IndexedDB; `enqueue` (clave del intento, `occurredAt`, retiro y etiqueta leídos de lo guardado, respuesta sintética); superposición de pendientes registrada en `readCache`; `commitToSavedAnswers`, `markConflict`, `retryOp`, `discardOp` |
| `apps/web/src/services/api.ts` (interceptores de escritura) | En vez de `offlineMutation`: el interceptor de petición reconoce las 11 escrituras (`matchQueueable`), agrega `Idempotency-Key`, `X-Client-Time`, `occurredAt` donde aplica y timeout de 10 s; sin señal pone un adapter que encola y responde 202. El de error encola con **la misma clave** ante falta de respuesta. Toast "Guardado en el teléfono" cada 10 s como mucho |
| `apps/web/src/offline/syncService.ts` | NUEVO. `flushOutbox()`: FIFO de a una, `X-Outbox-Sync: 1`; 2xx → escribe el cambio en lo guardado y borra · otro 4xx → conflicto con el mensaje y sigue · sin señal / 409 en curso / 5xx → para y reintenta (5 × 5xx → conflicto) · 401 → para + `needsLogin`. Disparadores: reconexión (`onReconnect`), pestaña visible, cada 30 s con cola (sondea si está sin señal) y "Enviar ahora". Sin refetch final: lo guardado ya tiene el cambio |
| `apps/web/src/offline/outboxKinds.ts` (`applyOps`) | Los reductores se aplican sobre la copia del DTO al leer (guardado o fresco) mientras haya pendientes; nunca mutan lo guardado. Sin store de Pinia aparte: el estado reactivo vive en `outbox.ts` |
| `apps/web/src/components/offline/PendingSyncPanel.vue` | NUEVO. Lista de pendientes y conflictos (`label`, quién, `occurredAt`, error), reintentar/descartar, "Sincronizar ahora", "Borrar datos sin conexión" |
| Vistas y stores | Sin cambios para encolar: reciben la respuesta sintética y, cuando vuelven a pedir la lista, la superposición. `BedAssignmentsView` deshabilita sin señal auto-asignar, exportar y vaciar |
| `RecepcionView.vue` (lista de Faltan) | Acción "No llegó" por fila con confirmación y gate `participant:update`; llama `setParticipantCancelled(participantId, retreatId, true)` (body explícito). Reactivar sigue siendo la edición completa, solo con señal |
| `Sidebar.vue` | Confirmación al cerrar sesión con cambios sin enviar |
| `utils/csrf.ts` | Timeout de 8 s al pedir el token; sin token para una escritura que se encola |
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
