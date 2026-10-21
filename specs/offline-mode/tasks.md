# Tasks: offline-mode

> SDD tasks — versión 1.0 (2026-10-19). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone. `[P]` = paralelizable con el milestone marcado igual.

## M0 — worktree + specs SDD

- [x] Worktree `.claude/worktrees/offline-mode`, branch `worktree-offline-mode` (base
      `origin/master` `1bf67691`)
- [x] `pnpm install` en el worktree
- [x] `specs/offline-mode/spec.md` (Decisiones de dominio D1-D12 con defaults propuestos)
- [x] `specs/offline-mode/research.md`
- [x] `specs/offline-mode/plan.md`
- [x] `specs/offline-mode/tasks.md`
- [x] **Gate**: Leonardo revisa el spec (en particular D1-D12 y "Fuera de alcance") antes de
      codear M1 — aprobado 2026-10-19 ("si commit"). Respuestas de la revisión:
      1. ¿D2 está completo (cancelar no-show, notas, Santísimo admin)? — **cancelar entra**: se
         espera hasta la noche del viernes y se cancela el sábado en la mañana, en la casa.
         Solo la bandera; la nota del motivo se escribe con señal (es campo de salud).
      2. ¿D9 sin cifrado, o salud fuera de la caché? — **salud fuera** (`SENSITIVE_HEALTH_FIELDS`
         recortados antes de guardar; Alimentación y Medicamentos solo en línea).
      3. ¿M1 por separado? — **sí**: PR y deploy propios, una semana antes del siguiente retiro.
      Además: **la caché dura solo la ventana del retiro y se borra al cerrarla** (D9), no 7 días.
- [x] Commit `docs(specs): SDD spec for offline mode during retreats`

## M1 — Cascarón PWA (service worker + manifest) [P con M2, M3]

- [x] Instalar `vite-plugin-pwa` (dev) — 1.3.0, MIT, peer `vite ^5` (ver desviaciones)
- [x] `vite.config.ts`: `VitePWA` con `registerType: 'prompt'`, `injectRegister: false`,
      `navigateFallbackDenylist` (`/api`, `/health`, rutas con extensión), `globIgnores` de
      `vendor-geo`, `runtimeCaching` (runtime-config NetworkFirst, `/assets/` CacheFirst,
      imágenes SWR), `cleanupOutdatedCaches`, `clientsClaim`
- [x] Manifest: nombre, `start_url: /app`, `display: standalone`, `theme_color #292524`, íconos
      192/512/maskable + `apple-touch-icon` en `public/` desde `logo_oficial.png`; el plugin
      inyecta `<link rel="manifest">`; metas Apple en `index.html`
- [x] `src/pwa/registerSw.ts` (workbox-window directo) + `import()` en `onMounted` de
      `AppLayout.vue`; no registra en rutas públicas ni en dev; con `offlineMode === false`
      desregistra y borra sus cachés
- [x] `versionStore.attachServiceWorker` / `markServiceWorkerWaiting` + `reloadForUpdate`
      async: el poll de `version.json` dispara `wb.update()`; "Actualizar" espera hasta 20 s a
      que el worker nuevo se instale, lo activa y recarga; si no hay worker, recarga simple
- [x] `nginx.conf`: `location =` para `/sw.js`, `/manifest.webmanifest` y `/runtime-config.js`
      con `no-cache` y las cabeceras de seguridad repetidas
- [x] Tests: `versionStore.test.ts` (+6), `registerSw.test.ts` (10), `UpdateBanner.test.ts`
      intacto; guard `nginxOfflineShell.simple.test.ts` (7) en el API; e2e
      `offline-shell.spec.ts` (5, chromium, contra `vite preview`): recarga sin red con
      cascarón, control negativo con SW bloqueado, `/api` nunca desde caché, landing pública
      sin SW, manifest e íconos; `mobile-page-weight.spec.ts` verde (4 + 1 skip preexistente)
- [x] Flujo de actualización verificado con un deploy simulado (bytes nuevos en `sw.js` +
      `version.json` distinto): banner → Actualizar → el worker nuevo toma el control → recarga
      → sin worker en espera y sin banner. Script ad hoc fuera del repo (no es repetible en CI:
      reescribe `dist/`)
- [x] `vite build` produce `dist/sw.js`, `workbox-*.js` y `manifest.webmanifest`; precache de
      300 entradas, 7,7 MB sin comprimir / 1,9 MB gzip; `vue-tsc` limpio; suite web 226
      archivos / 3373 tests en verde
- [x] Commit `16a880a6` `feat(pwa): offline app shell for retreats with bad signal` (2026-10-20).
      Solo lleva el hunk M1 de `AppLayout.vue`; verificado aislado sobre el árbol exportado
      del índice: `vue-tsc`, build y suite web 226 archivos / 3373 tests
- [ ] **PR y deploy propios** (decisión 2026-10-19): `nginx.conf` de prod con `sw.js`, manifest
      y `runtime-config.js` en `no-cache` antes del push; `curl -I https://emaus.cc/sw.js` →
      `no-cache`; una semana de margen antes del siguiente retiro observando recargas y el
      banner de versión

**Done**: 2026-10-19 (código y verificación); commit 2026-10-20; falta el release.

### Desviaciones 2026-10-19

- **Versión del plugin**: 1.3.0, no la 2.0.0. La 2.0 salió el 2026-10-03 y exige Node 20.19;
  la 1.3 (mayo) tiene la misma API y aguanta el Node 20 del CI.
- **Registro con `workbox-window` directo**, no con `virtual:pwa-register`: el módulo virtual
  no existe en Vitest y no deja inyectar el modo producción; así el registro tiene 10 tests y
  en dev no pide un `sw.js` que no existe. `workbox-window` entra como dependencia.
- **Se registra desde `AppLayout.vue`**, no desde `main.ts`: solo corre dentro de `/app`
  (sesión iniciada), que es exactamente "no registrar en rutas públicas".
- **Sin denylist de slugs**: el regex `/^\/[a-z0-9]+(\/server)?$/` del plan también atrapa
  `/login` y `/app`, que dejarían de abrir sin señal. No hace falta: los rastreadores del
  preview OG nunca ejecutan un service worker. En su lugar se excluyen las rutas con
  extensión (videos, PDFs, `version.json`) además de `/api` y `/health`.
- **Precache de todos los chunks con hash** salvo `vendor-geo`, no solo "entry y comunes":
  cualquier vista del retiro debe abrir sin señal aunque no se haya visitado antes. La
  primera instalación baja 1,9 MB comprimidos; los deploys siguientes, solo lo que cambió.
- **`runtime-config.js` en `no-cache`** y el flag `offlineMode` adelantados de M5 a M1: el
  archivo caía en el regex `immutable` de un año, así que un cambio del interruptor no habría
  llegado a nadie. El flag apaga y desinstala el service worker.
- **El e2e corre contra `vite preview`** del build de producción, no contra el stack de dev:
  el service worker solo existe en el build. Se salta solo con motivo legible si `/sw.js` no
  es un worker.
- **`mobile-page-weight`**: dos tests fallaban en el worktree por falta de claves de Maps y
  reCAPTCHA (sin `apps/web/.env.development`); con el archivo copiado del main pasan. No es
  del código: el worktree nuevo no trae ese `.env`.

## M2 — Conectividad, caché de lectura, auth persistida [P con M1, M3]

- [x] Almacenamiento: `src/offline/storage.ts` (IndexedDB `emaus-offline` con `responses`,
      `outbox`, `meta`; implementación en memoria para tests) — sin dependencias nuevas
- [x] `src/offline/connectivity.ts` (estado reactivo desde el resultado de las requests;
      `offline` del navegador confiable, `online` solo dispara un sondeo a `version.json`)
- [x] `src/offline/readCache.ts`: lista blanca de 12 GETs, clave por usuario + ruta + params
      ordenados, `stripHealthForCache`, `saveResponse` / `answerFromCache` /
      `OfflineNoDataError` / `purgeResponses`
- [x] `services/api.ts`: timeout de 15 s en los GETs cacheables; interceptores que guardan la
      respuesta y, ante falta de señal, responden desde el teléfono marcando `fromCache`
- [x] `authStore.ts`: perfil confirmado guardado en `meta`; sin señal **o con 429** en un
      arranque en frío arranca desde él (`authSource = 'cache'`); 401 y logout lo borran;
      logout borra también las respuestas; `/auth/status` con timeout de 8 s
- [x] `ConnectivityChip.vue` en `Sidebar.vue` (toca para sondear sin señal)
- [x] `OfflineBanner.vue` en `AppLayout.vue`: "datos guardados hace X" y aviso de pantallas
      sin datos; `startConnectivityListeners()` en el `onMounted`
- [x] `participantStore.fromCache`; `FoodView` y `MedicinesReportView` muestran
      `HealthNeedsConnection` (reintenta al volver la señal) en vez de una lista sin salud
- [x] i18n `offline.*` en `es.json` y `en.json`
- [x] Tests: `readCache.test.ts` (33: rutas, clave, recorte de salud a cualquier profundidad,
      guardar/servir, otro usuario, purga), `connectivity.test.ts` (6),
      `authStore.offline.test.ts` (8), `offlineComponents.test.ts` (11); `authStore.test.ts`
      ajustado al timeout de `/auth/status`
- [x] E2E `offline-read-cache.spec.ts` (chromium, `vite preview`, IndexedDB real): abre
      Caminantes, Recepción, Camas y Minuto a minuto con señal → claves guardadas y **ninguna
      persona con campos de salud**; sin señal, pestaña nueva en frío → sin login, chip "Sin
      conexión", misma primera fila de Caminantes, nombres de Recepción y de la agenda desde el
      teléfono, banner con la antigüedad, Alimentación con el aviso de salud
- [x] `pnpm --filter web test` (230 archivos / 3431 tests), `vue-tsc` limpio, eslint limpio,
      `offline-shell.spec.ts` sigue verde
- [x] Commit: va junto con M4 y M5 en `a5ab9ea6` (ver M6)

**Done**: 2026-10-19 (código y verificación); commit 2026-10-20.

### Desviaciones 2026-10-19

- **Sin `idb` ni `fake-indexeddb`**: un envoltorio de IndexedDB de 100 líneas y una
  implementación en memoria para Vitest. IndexedDB real se ejercita en el e2e. Evita
  dependencias y deja el lockfile de M1 separable para su release propio.
- **La conectividad es un módulo reactivo, no un store de Pinia**: la usan los interceptores
  de axios, que corren fuera de cualquier componente. Reusa `isNetworkError` de
  `services/apiError.ts` (sin contar cancelaciones).
- **Un banner para todas las vistas** en vez de un `StaleDataBadge` por vista: cubre cada
  pantalla sin tocar cada store, con la antigüedad del dato guardado más viejo que se mostró.
- **"Sin datos descargados"** sale como el mensaje de error del toast (`OfflineNoDataError`)
  más una línea del banner, no como un estado vacío por vista.
- **El recorte de salud alcanza a cualquier objeto con forma de persona** (`firstName` +
  `lastName`) a cualquier profundidad: camas, mesas y recepción también traen participantes.
  Notas de pagos, de la casa y de la agenda se conservan: no son de salud.
- **Un 429 en arranque en frío también usa el perfil guardado**: el e2e lo destapó (el
  limitador de 300/min mandaba al login con la sesión viva). Es el mismo "estado
  desconocido" que la falta de señal.
- **`isOfflineModeEnabled` vive en `offline/flag.ts`** (entra en M1): varios tests mockean
  `config/runtimeConfig` con solo `getApiUrl` y el interruptor llegaba indefinido.
- **El chip usa un punto de color, no íconos de lucide**: los tests del Sidebar mockean
  lucide con listas fijas.
- **Lista blanca ampliada**: responsabilidades, turnos del Santísimo, equipos de servicio, la
  mesa individual (refresco tras mover) y la lista de retiros (sin retiro: dura hasta el
  logout, no tiene datos personales).

## M3 — Servidor: idempotencia, `occurredAt`, auditoría [P con M1, M2]

- [x] Migración `20261020120000_CreateIdempotencyKeys.ts` (SQL plano, `IF NOT EXISTS`,
      `transaction = false` por el guard de `DROP TABLE` en `down()`); aplicada sola por el
      arranque del API del worktree y verificada por `sqlite_master`
- [x] `entities/idempotencyKey.entity.ts` registrada en `database/config.ts` y `test-setup.ts`
- [x] `middleware/idempotency.ts` (reserva por INSERT sobre la PK, replay con
      `Idempotent-Replayed`, 409 `IDEMPOTENCY_IN_PROGRESS`, 422 `IDEMPOTENCY_KEY_REUSED`, 400
      clave mal formada, 5xx libera la clave, resultado guardado antes de responder)
- [x] `services/idempotencyService.ts` + purga diaria a 7 días (`node-cron`, arrancada en
      `index.ts` como las demás limpiezas)
- [x] `requestContext.ts` / `auditContext.ts` / `domainAuditService`: con clave,
      `metadata.occurredAt` desde `X-Client-Time`; `metadata.syncedFromOutbox` solo con
      `X-Outbox-Sync: 1`
- [x] `setParticipantCheckIn(…, occurredAt?)`, `startItem/completeItem(id, occurredAt?)`;
      validación con `utils/occurredAt.ts` (ISO, no futuro +5 min, ≤ 14 días → 400)
- [x] Middleware montado en las 11 rutas de D2, después del permiso y antes del controller
- [x] Test de `updateParticipant` con body explícito `{isCancelled: true, contextRetreatId}`:
      cancela, libera cama y mesa del retiro y no toca el resto de la ficha
- [x] Tests Jest nuevos: `idempotency.integration.test.ts` (12, cuenta ejecuciones del
      handler), `occurredAt.simple.test.ts` (10), `idempotencyRoutes.simple.test.ts` (18,
      guard estático de las 11 rutas), `offlineSync.integration.test.ts` (8)
- [x] Prueba en vivo contra el API del worktree: `POST /payments` dos veces con la misma clave →
      201 y 201 `Idempotent-Replayed: true`, **un solo pago**; auditoría con `occurredAt`; el
      pago de prueba se borró por el API
- [x] `pnpm --filter api test` en 2 shards: 317 suites / 4781 tests en verde;
      `pnpm --filter api build` verde; las 2 apariciones de `__dirname` en `dist/index.js` son
      la constante local preexistente de `index.ts`; `tsc` sigue con los mismos 146 errores
      preexistentes, ninguno en líneas tocadas; eslint limpio
- [x] Commit `00ab2e3d` `feat(api): idempotent resends and device time for offline writes`
      (2026-10-20). gitleaks marcó como `generic-api-key` los UUID de prueba en constantes
      `KEY`; se renombraron a `REQUEST_ID` en vez de ampliar la allowlist

**Done**: 2026-10-19 (código y verificación); commit 2026-10-20.

### Desviaciones 2026-10-19

- **Sin cambios en `packages/types`**: el check-in y start/complete no tienen schema zod; el
  `occurredAt` se valida en los controllers con `utils/occurredAt.ts`, que es el mismo para
  los tres.
- **Solo se guarda el cuerpo de los 4xx** (máx. 2 KB, el mensaje que el teléfono muestra
  como conflicto). Un 2xx se repite como `{ idempotentReplay: true }`: `PUT /participants/:id`
  devuelve la ficha entera y guardarla duplicaría datos personales 7 días. La cola no
  necesita el cuerpo: tras sincronizar refresca los datos.
- **Estado "en curso"** (`statusCode` 0) con 409 `IDEMPOTENCY_IN_PROGRESS`, que el cliente
  trata como transitorio. El resultado se guarda antes de que salga la respuesta, así un
  reenvío inmediato ya lo encuentra.
- **`syncedFromOutbox` con cabecera propia** (`X-Outbox-Sync: 1`): el cliente manda la clave
  también en el primer intento con señal, así que la clave sola no prueba que venga de la
  cola.
- **La migración no va en `CreateSchema.ts`**: es una tabla nueva y la migración la crea
  también en una base fresca; la base de test la saca de la entidad.
- **El singleton `retreatScheduleService` captura su repositorio al importarse**, antes de
  que el setup de test cambie la base: el test usa `new RetreatScheduleService()`. Los tests
  previos de la agenda no tocaban la base por eso.
- **Corrección de research**: asignar una cama ocupada por otro **no la sobrescribe**, responde
  409 (`Bed is already assigned to another participant`). Camas y mesas responden 4xx en
  todas sus validaciones de negocio, que es lo que la cola necesita para marcar conflictos.

## M4 — Cola de escrituras, reductores y sincronización (depende de M2 y M3)

- [x] `src/offline/outboxKinds.ts`: las 11 escrituras (cómo se reconocen, ids, retiro,
      `occurredAt` en el body, rutas que cambian, reductor y etiqueta); el reductor de
      `participant.setCancelled` espeja la cascada del servidor sobre recepción, camas y mesas
- [x] `api.ts`: `setParticipantCancelled(participantId, retreatId, isCancelled)` con body explícito
- [x] `src/offline/outbox.ts`: estado reactivo, persistencia en IndexedDB, `enqueue` (retiro y
      etiqueta leídos de lo guardado, respuesta sintética por tipo), superposición de pendientes
      sobre cada GET, `commitToSavedAnswers`, conflicto / reintentar / descartar
- [x] Interceptores en `api.ts` (en lugar de `offlineMutation`): toda escritura encolable lleva
      `Idempotency-Key` y `X-Client-Time`; sin señal se encola con un adapter propio y responde
      202 `queued`; con señal mala, a los 10 s sin respuesta se encola con **la misma** clave
- [x] `src/offline/syncService.ts`: FIFO de a una con `X-Outbox-Sync: 1`, sin señal / 409 en
      curso / 5xx → se detiene y reintenta, 5 × 5xx → conflicto, 401 → `needsLogin`, otro 4xx →
      conflicto y sigue; disparadores: reconexión, pestaña visible, cada 30 s y "Enviar ahora"
- [x] `PendingSyncPanel.vue` (pendientes y conflictos con el mensaje del servidor, reintentar,
      descartar con confirmación, enviar ahora, borrar datos guardados), abierto desde el chip;
      el chip cuenta pendientes y rechazados
- [x] "No llegó" por fila en Faltan de `RecepcionView` (confirmación, gate `participant:update`)
- [x] Cerrar sesión con cambios sin enviar pide confirmación; la cola se queda en el teléfono
- [x] Camas: auto-asignar, exportar y vaciar deshabilitados sin señal ("Necesita conexión");
      `apiErrorMessage` da un mensaje en español para cualquier otra acción sin señal
- [x] `utils/csrf.ts`: timeout de 8 s al pedir el token y sin token para lo que se encola
- [x] i18n `offline.*` y `reception.cancelNoShow*` en `es.json` y `en.json`
- [x] Tests: `outboxKinds.test.ts` (35: reconocimiento, cada reductor, no muta), `outbox.test.ts`
      (11), `syncService.test.ts` (8), `PendingSyncPanel.test.ts` (6), chip con conteos,
      `RecepcionView.cancelNoShow.test.ts` (3)
- [x] E2E `offline-outbox.spec.ts` (chromium, `vite preview`, API real del worktree, solo con
      `E2E_OFFLINE_WRITES=1`): sin señal cobrar, llegar y cancelar → sobrevive a recargar → al
      volver la señal se vacía sola → en el servidor un solo pago, B cancelado y `checkedInAt`
      igual a la hora del botón; respuesta perdida a los 10 s → reenvío con la misma clave y
      `Idempotent-Replayed: true`; rechazo del servidor → conflicto con su mensaje → descartar.
      Deja la base como la encontró salvo la cama y la mesa liberadas por la cancelación
- [x] `pnpm --filter web test` (235 archivos / 3495 tests), `vue-tsc`, eslint; los e2e de M1 y
      M2 siguen verdes
- [x] Commit: va junto con M2 y M5 en `a5ab9ea6` (ver M6)

**Done**: 2026-10-19 (código y verificación); commit 2026-10-20.

### Desviaciones 2026-10-19

- **La cola vive en el cliente HTTP**, no en un `offlineMutation` que llamen las vistas: un
  interceptor reconoce las 11 escrituras y un adapter propio las encola. Ninguna vista ni store
  cambió para encolar (`BedAssignmentsView` llama a `api.put` directo y funciona igual).
- **Los reductores se aplican al leer** (sobre la respuesta guardada y sobre la fresca mientras
  haya pendientes) y **se escriben en lo guardado** cuando el servidor acepta. Un conflicto deja
  de pintarse: la pantalla vuelve a la verdad del servidor.
- **Respuesta sintética por tipo** (202, `queued: true`), armada con lo guardado: la agenda
  recibe el ítem actualizado, las mesas la mesa, las camas la cama; recepción y bolsas lo que
  ya esperaban.
- **La reconexión es casi inmediata**: la siguiente petición que sale bien marca la conexión y
  dispara el envío; con buena señal un pendiente dura milisegundos. El e2e afirma el reenvío
  con la misma clave y la repetición del servidor, no el contador del chip.
- **Reactivar sigue siendo la edición completa** (solo con señal). Solo "No llegó" usa el body
  explícito; `ParticipantList` no cambió.
- **CA 13 parcial**: se deshabilitan sin señal las tres acciones de Camas que solo hace el
  servidor; las demás acciones no encolables fallan con un mensaje claro en español en vez de
  deshabilitarse una por una. WhatsApp no se bloquea: `wa.me` funciona sin señal.
- **5 errores 5xx seguidos** de una misma escritura la pasan a conflicto, para que no frene la
  cola indefinidamente.
- **El conflicto del e2e es simulado** (404 por ruta): el rechazo real de camas ocupadas (409)
  está cubierto en el API; provocarlo en el e2e exigía arrastrar en la vista de camas.

## M5 — Preparación, antigüedad, purga, ayuda (depende de M2) [P con M4]

- [x] `src/offline/prepareRetreat.ts`: 12 GETs con las URLs y params exactos de las vistas
      (se guardan solos por el interceptor de M2), progreso, resumen en `meta`
      (`prepared:<retreatId>`); ningún endpoint de salud
- [x] `OfflinePrepareCard.vue` en `RetreatDashboardView.vue` bajo el encabezado: estado,
      "Preparar para trabajar sin conexión" desde 7 días antes del inicio hasta el fin,
      deshabilitado sin señal
- [x] Auto-preparación en `AppLayout.vue` mientras el retiro está en vivo: al abrir el retiro y
      al volver la señal, máximo una vez cada 15 min
- [x] `purgeClosedRetreats` (en `prepareRetreat.ts`): al arrancar y tras cada sincronización
      borra lo guardado de los retiros cuya ventana cerró (día siguiente a `endDate` en su TZ,
      fechas tomadas de lo guardado); la cola nunca se toca
- [x] El interruptor `offlineMode` ya estaba (M1, `offline/flag.ts`); documentado cómo usarlo
- [x] Ayuda in-app `docs/es/offline.md` y `docs/en/offline.md` + sección `offline` en
      `config/helpIndex.ts`; sección "Cancelar a quien no llegó" en la ayuda de Recepción;
      `docs/features/offline-mode.md` (operación: interruptor, nginx, pruebas, síntomas)
- [x] Tests: `prepareRetreat.test.ts` (17: pasos cacheables con la misma clave que las vistas,
      progreso, fallas, ventana de 7 días, auto cada 15 min, purga al cerrar la ventana sin
      tocar la cola), `OfflinePrepareCard.test.ts` (4)
- [x] Orden estable en la cola para escrituras del mismo milisegundo (contador en el id); test
- [x] Los e2e fijan el reloj del navegador dentro del retiro (`context.clock.setFixedTime`): el
      de la cola afirma que `checkedInAt` en el servidor es **exactamente** la hora del
      dispositivo
- [x] Commit: va junto con M2 y M4 en `a5ab9ea6` (ver M6)

**Done**: 2026-10-19 (código y verificación); commit 2026-10-20.

### Desviaciones 2026-10-19

- **Sin calentar chunks de vistas**: el service worker de M1 ya precachea todos.
- **La purga vive en `prepareRetreat.ts`** y no en un `purge.ts` aparte: comparte la lectura de
  fechas de retiros guardados.
- **Las fechas de los retiros salen de lo guardado** (`/retreats` y `/retreats/:id`), porque la
  purga puede correr sin señal. Un retiro que el teléfono no conoce no se purga.
- **La purga hizo que los e2e necesitaran un retiro en vivo**: el retiro de prueba terminó el
  2026-10-18 y la app borra sus datos al arrancar. Se fija el reloj del navegador en vez de
  cambiar fechas en la base (cambiar fechas dispara la cascada sobre la agenda).
- **Se destapó un orden aleatorio** en la cola para escrituras del mismo milisegundo (el reloj
  fijo lo hizo visible): corregido con un contador en el id.

## M6 — Verificación end-to-end + cierre

- [x] Stack del worktree en 3009/5179 + `vite preview` del build en 4179. En vez de mover
      fechas en la base, los e2e fijan el reloj del navegador dentro del retiro
      (`context.clock.setFixedTime`): mover fechas dispara la cascada sobre la agenda
- [x] E2E chromium en tres specs (`offline-shell`, `offline-read-cache`, `offline-outbox`), 7
      tests en verde juntos; el de la cola solo con `E2E_OFFLINE_WRITES=1` (escribe en la base)
- [x] Persistencia real comprobada en el API del worktree: un solo pago, cancelación, hora del
      dispositivo, replay de idempotencia; la base quedó como estaba salvo cama y mesa liberadas
- [ ] Prueba en iPhone real: "Agregar a pantalla de inicio", modo avión, recargar, check-in
      encolado, volver señal → sincroniza (anotar versión de iOS) — **requiere el teléfono**
- [x] Web 237 archivos / 3517 tests, `vue-tsc`, eslint; API 2 shards: 317 suites / 4783 tests
      (0 fallos); builds de web y API; `mobile-page-weight.spec.ts` verde
- [x] Revisión de seguridad y robustez del diff (a mano, sobre los puntos de esta lista):
      replay solo para el mismo usuario+método+ruta (422 si no), cuerpos 2xx no guardados,
      `occurredAt` acotado a 14 días, CSRF en el reenvío por el cliente de siempre, el worker
      nunca toca `/api`, salud nunca guardada, almacenamiento offline nunca creado en páginas
      públicas. Encontró y corrigió: reservas "en curso" huérfanas tras un reinicio del API
- [x] `## Reconcile` en `spec.md`
- [x] Síntomas nuevos documentados en `docs/features/offline-mode.md` (tabla síntoma → causa →
      qué hacer); la spec la enlaza. Sin skill nuevo: no hay todavía un patrón de trabajo que
      repetir, solo operación
- [x] Integrar master (2026-10-20, `fe7eedba`): 5 conflictos (ficha, test de la lista,
      locales, gafetes), todos de "los dos lados"; casos especiales sin señal dicen que
      necesitan conexión (ver `## Reconcile`). Web 252 archivos / 3696 tests, `vue-tsc`, eslint;
      API 2 shards 326 suites / 4873 tests (0 fallos); build del API y de la web (316 entradas
      en el precache, 8,8 MB); 9 e2e sin señal juntos
- [ ] `nginx.conf` de prod actualizado **antes** del push (`sw.js`, manifest y
      `runtime-config.js` en `no-cache`) — **requiere autorización**. Prod ya sirve
      `runtime-config.js` con `no-cache, no-store` y el repo no lo haría: el archivo del
      servidor no es copia del repo, leerlo antes de editarlo
- [ ] PR(s) a master; esperar `gh pr checks` en verde antes de merge — **requiere autorización**
- [x] Commits (OK 2026-10-20), cuatro en vez de uno por milestone: `16a880a6` M1, `00ab2e3d`
      M3, `a5ab9ea6` M2+M4+M5 y el de spec y documentación. **Desviación**: M2, M4 y M5 van
      juntos porque comparten `AppLayout.vue`, `api.ts` y los locales hunk a hunk, y ninguno
      se publica sin los otros; M1 sí va solo porque sale en su propio release
- [x] Video instructivo (2026-10-20): `apps/web/e2e/demo/record-offline-mode.mjs`, narrado,
      con la historia miércoles → viernes en la puerta → sábado → vuelve la señal; la sync
      escribe de verdad en la base desechable y el script la deja como estaba. Puerta de PII
      integrada (nombres, correos y teléfonos reales del retiro contra el texto de cada beat;
      antes prueba que detecta). Encontró dos defectos de la funcionalidad, corregidos (ver
      Reconcile): "Preparar" no guardaba la lista de Caminantes/Servidores, y ruido de avisos en
      cada arranque sin señal. Regrabado el mismo día (4:05) con corrección de ficha, gafetes,
      hoja de mesas y minuto a minuto impresos, y el aviso "Guardado en el teléfono" de cada
      pantalla; 35/35 clips anclados, sin voces encimadas
- [x] Imprimir sin señal gafetes, mesas y minuto a minuto (pedido 2026-10-20): comparado cada
      opción con señal contra sin señal tras solo "Preparar" (texto impreso e imágenes); queda
      como e2e `apps/web/tests/e2e/offline-print.spec.ts` (sin escrituras, reloj con
      `setSystemTime`: congelado, reka dispara un clic sintético de más). Corregidos: hoja "Imprimir Mesas" con salud vacía
      ("Solo con conexión" + aviso), logos de gafetes al precache, opción Word renombrada y
      desactivada sin señal, cancelados de Mesas en "Preparar". Ver Reconcile
- [x] El toast propio de cada vista dice que el cambio quedó en el teléfono (decidido
      2026-10-20): `src/offline/queuedToast.ts` completa el primer toast de éxito tras una
      escritura encolada; si no hay, sale el de la cola. Tests (6) y e2e de la cola. La limpieza
      de `offline-outbox.spec.ts` ahora borra por lo que tiene el servidor: un paso fallido dejó
      un cobro de prueba que se envió al volver la señal (borrado)

**Done**: 2026-10-19 salvo lo marcado como pendiente de teléfono o de autorización.

## M7 — Corregir la ficha sin señal (D13, pedido 2026-10-20)

- [x] Spec: D13, FR-15c, FR-16b, CA 17 y "Fuera de alcance" ajustado, antes del código
- [x] `OFFLINE_EDITABLE_PARTICIPANT_FIELDS` + `normalizeOfflineEditValue` en
      `packages/types/src/offlineEdit.ts` (una sola lista para web y API)
- [x] API: `checkExpectedValues` (`services/offlineEditService.ts`) y `PUT /participants/:id`
      con `expectedValues` → 409 `PARTICIPANT_CHANGED_MEANWHILE` / 400 fuera de la lista;
      `expectedValues` nunca llega al servicio. Tests: integración (6) y ruta (4)
- [x] Web: `planOfflineEdit` (`src/offline/participantEdit.ts`), tipo `participant.edit` en la
      cola con reductor sobre lista, Recepción, Camas y Mesas; el formulario emite qué cambió,
      avisa sin señal y no sincroniza etiquetas sin señal; `ParticipantList` arma el envío o
      bloquea nombrando los campos; el store no pide la ficha al servidor si quedó en la cola
- [x] Ayuda (es/en) y e2e `offline-edit.spec.ts` (con `E2E_OFFLINE_WRITES=1`)
- [x] Web 238 archivos / 3546 tests, `vue-tsc`, eslint; API 2 shards 319 suites / 4793 tests
      (0 fallos); build del API; 9 e2e sin señal juntos

**Desviaciones**: el editor rápido de teléfonos de la lista (`PATCH …/phones`) sigue necesitando
señal; sin señal el celular se corrige desde la ficha. La lista de pendientes dice "Corrección en
la ficha de {nombre}" sin nombrar los campos (el renglón no tiene i18n por campo); el motivo de un
rechazo sí los nombra.

**Done**: 2026-10-20.

## Orden y paralelismo sugerido

```
M0 (gate) → M1 ──┐
           M2 ──┼→ M4 → M6
           M3 ──┘   ↑
           M5 ──────┘   (M5 solo depende de M2)
```

Tres tandas tras el gate: **(1)** M1 + M2 + M3 en paralelo (tres worktrees o tres sesiones;
M1 no comparte archivos con M2/M3 salvo `main.ts` y `setup.ts`); **(2)** M4 + M5 en paralelo
(comparten `Sidebar.vue`/`RetreatDashboardView.vue` solo en puntos distintos); **(3)** M6 en
una sola sesión con el stack levantado.
