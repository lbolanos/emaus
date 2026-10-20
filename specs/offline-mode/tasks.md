# Tasks: offline-mode

> SDD tasks — versión 1.0 (2026-10-19). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone. `[P]` = paralelizable con el milestone marcado igual.

## M0 — worktree + specs SDD

- [x] Worktree `.claude/worktrees/offline-mode`, branch `worktree-offline-mode` (base
      `origin/master` `1bf67691`)
- [ ] `pnpm install` en el worktree
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

- [ ] Instalar `vite-plugin-pwa` (dev) — verificar licencia MIT y versión mantenida
- [ ] `vite.config.ts`: `VitePWA` con `registerType: 'prompt'`, `injectRegister: null`,
      `navigateFallbackDenylist` (`/api`, `/health`, slugs), `globIgnores` de chunks pesados,
      `runtimeCaching` CacheFirst para `/assets/*.{js,css}`, `cleanupOutdatedCaches`
- [ ] Manifest: nombre, `start_url: /app`, `display: standalone`, `theme_color #292524`, íconos
      192/512 en `public/` desde `logo_oficial.png`; `index.html` con `<link rel="manifest">` y
      metas Apple
- [ ] `src/pwa/registerSw.ts` + `import()` tras `app.mount` en `main.ts`; no registra en rutas
      públicas ni con `offlineMode === false`
- [ ] `versionStore.setSwUpdate` + `UpdateBanner.vue`: botón Actualizar llama `updateSW(true)`
- [ ] `nginx.conf`: `location = /sw.js` y `location = /manifest.webmanifest` con `no-cache`
      (molde `version.json`)
- [ ] Tests: `versionStore.test.ts` (banner por SW), `UpdateBanner.test.ts`; e2e
      `offline-shell.spec.ts` (chromium): dashboard → `setOffline(true)` → reload → cascarón;
      `/<slug>` público sin SW; `mobile-page-weight.spec.ts` sigue verde
- [ ] `pnpm --filter web build` produce `dist/sw.js` y `manifest.webmanifest`
- [ ] Commit `feat(web): PWA shell with service worker and manifest`
- [ ] **PR y deploy propios** (decisión 2026-10-19): `nginx.conf` de prod con `sw.js` y manifest
      `no-cache` antes del push; `curl -I https://emaus.cc/sw.js` → `no-cache`; una semana de
      margen antes del siguiente retiro observando recargas y el banner de versión

**Done**: —

## M2 — Conectividad, caché de lectura, auth persistida [P con M1, M3]

- [ ] Instalar `idb` (dep) y `fake-indexeddb` (dev); `fake-indexeddb/auto` en `src/test/setup.ts`
- [ ] `src/offline/db.ts` (stores `responses`, `outbox`, `meta`)
- [ ] `src/stores/connectivityStore.ts` (estado desde resultados de requests; eventos solo
      como disparadores)
- [ ] `src/offline/cacheableRoutes.ts` (lista blanca) + test de cobertura contra los fetchers
      de preparación
- [ ] `services/api.ts`: timeout 10 s en GETs cacheables y mutaciones marcadas; interceptor
      put/get de caché; `OfflineNoDataError`; recorte de `SENSITIVE_HEALTH_FIELDS` (import de
      `@repo/types`) en toda respuesta de `/participants` antes de `put`
- [ ] `authStore.ts`: perfil persistido (`meta.authProfile`), hidratación sin señal, borrado
      en 401 y logout (`offlineDb.clearAll()`)
- [ ] `ConnectivityChip.vue` en `Sidebar.vue` (+ íconos al allowlist de lucide en `setup.ts`)
- [ ] `StaleDataBadge.vue` + `fromCache/lastFetchedAt` en `participantStore`, `scheduleStore`,
      `tableMesaStore`, `retreatStore`, `RecepcionView`, `BedAssignmentsView`; sin toast de error
      cuando la respuesta vino de caché; "Sin datos descargados" ante `OfflineNoDataError`
- [ ] Tests: interceptor (put en OK, get en fallo de red, no cachea rutas fuera de la lista,
      clave incluye `userId`, **ninguna clave de `SENSITIVE_HEALTH_FIELDS` llega a IndexedDB**),
      `connectivityStore`, `authStore` (hidrata desde caché, 401 limpia), `ConnectivityChip`,
      `StaleDataBadge`; `FoodView`/`MedicinesReportView` sin señal → "Necesita conexión"
- [ ] `pnpm --filter web test` + `vue-tsc` en verde
- [ ] Commit `feat(web): connectivity state, read cache and persisted auth profile`

**Done**: —

## M3 — Servidor: idempotencia, `occurredAt`, auditoría [P con M1, M2]

- [ ] Migración `20261020120000_CreateIdempotencyKeys.ts` (SQL plano, up/down, guard por
      `sqlite_master`) + tabla en `CreateSchema.ts` para DBs frescas
- [ ] `entities/idempotencyKey.entity.ts` + `entities/index.ts`
- [ ] `middleware/idempotency.ts` (replay, 422 por clave ajena, no guarda 5xx, header
      `Idempotent-Replayed`)
- [ ] `services/idempotencyService.ts` + purga a 7 días desde el cron/boot existente
- [ ] `requestContext.ts` / `auditContext.ts` / `domainAuditService`: `X-Client-Time` →
      `metadata.occurredAt`; `Idempotency-Key` → `metadata.syncedFromOutbox`
- [ ] `setParticipantCheckIn(occurredAt?)`, `startItem/completeItem(occurredAt?)`; validación en
      controllers (ISO, no futuro +5 min, ≤ 14 días); schemas en `packages/types` con el campo
      **opcional**
- [ ] Montar el middleware en las 11 rutas de D2 (check-in, `PUT /participants/:id`, payments
      POST, bag-made, schedule start/complete/shift, days shift, beds assign, tables walkers
      POST/DELETE)
- [ ] Test de `updateParticipant` con body explícito `{isCancelled: true, contextRetreatId}`:
      cancela, libera cama y mesa del retiro de contexto, no toca el resto de la ficha; repetido
      con la misma `Idempotency-Key` → replay sin segundo evento de auditoría
- [ ] Tests Jest: middleware (3), migración (up/down), check-in con `occurredAt`, schedule
      start/complete con `occurredAt`, `POST /payments` ×2 misma clave → 1 fila, auditoría con
      `occurredAt`; migración corre en la DB del worktree (`migration:run`)
- [ ] `pnpm --filter api test` (2 shards) + `pnpm --filter api build` + `grep __dirname
      dist/index.js`
- [ ] Commit `feat(api): idempotency keys and client occurredAt for retreat live actions`

**Done**: —

## M4 — Cola de escrituras, reductores y sincronización (depende de M2 y M3)

- [ ] `src/offline/outboxKinds.ts` (11 kinds: request + reduce + label; el reductor de
      `participant.setCancelled` espeja la cascada del servidor sobre recepción, camas y mesas)
- [ ] `api.ts`: `setParticipantCancelled(participantId, retreatId, isCancelled)` con body
      explícito; `reactivateParticipant` de `ParticipantList.vue` pasa a usarla
- [ ] `src/offline/outbox.ts` (enqueue con `idempotencyKey` + `occurredAt`, list, markConflict,
      discard, retry)
- [ ] `src/offline/offlineMutation.ts` (offline → enqueue; online → intento con clave + timeout;
      red/timeout → enqueue con la **misma** clave; 4xx → rechazo normal)
- [ ] `src/offline/syncService.ts` (CSRF fresco, FIFO, backoff, 401 → `needsLogin`, 4xx →
      conflict y sigue, refetch final con cola vacía; disparadores online/visibility/30 s/manual)
- [ ] `src/stores/outboxStore.ts` (array reactivo, `pendingCount`, `conflicts`)
- [ ] `src/offline/applyOutbox.ts` (reductores sobre DTOs en memoria, también sobre respuestas
      frescas mientras haya pendientes — R12)
- [ ] `PendingSyncPanel.vue` (pendientes, conflictos, reintentar/descartar, sincronizar ahora,
      borrar datos sin conexión) abierto desde el chip
- [ ] Acción "No llegó → cancelar" por fila en Faltan (`RecepcionView`) y en Caminantes
      (`ParticipantList`), con confirm i18n y gate `participant:update`; i18n es/en
- [ ] Vistas: `RecepcionView` (llegó/deshacer/cobrar/cancelar), `BagsReportView`, `MinuteByMinuteView`
      + `scheduleStore` (iniciar/completar/±5/mover día), `BedAssignmentsView` (asignar/mover/
      desasignar), `TablesView` + `tableMesaStore` (asignar/quitar caminante): `{queued:true}` =
      éxito con toast; sin refetch tras encolar; acciones no encolables deshabilitadas con tooltip
- [ ] i18n `offline.*` en `es.json` y `en.json`
- [ ] Tests: cada reductor (11), `outbox` (clave estable entre intento y cola), `offlineMutation`
      (3 ramas), `syncService` (FIFO, conflict sigue, 5xx para, 401 para y conserva, refetch solo
      con cola vacía), `outboxStore`, `PendingSyncPanel`, vistas (queued → toast + estado local)
- [ ] `pnpm --filter web test` + `vue-tsc` en verde
- [ ] Commit `feat(web): offline outbox with local reducers and background sync`

**Done**: —

## M5 — Preparación, antigüedad, purga, ayuda (depende de M2) [P con M4]

- [ ] `src/offline/prepareRetreat.ts` (fetchers ordenados + `import()` de vistas de D3;
      progreso; nunca Alimentación ni Medicamentos; `meta.preparedAt`)
- [ ] `RetreatDashboardView.vue`: card "Trabajar sin conexión" (estado, Preparar visible desde
      7 días antes de `startDate`, auto cuando `isRetreatLive`, máx. 1 cada 15 min)
- [ ] `src/offline/purge.ts`: al arrancar y al terminar cada sincronización borra las
      respuestas cacheadas de todo retiro cuya ventana cerró (`endDate` < hoy en su TZ, reusar
      `retreatLiveStatus.ts`); la cola con pendientes se conserva y el panel avisa
- [ ] Flag `EMAUS_RUNTIME_CONFIG.offlineMode` en `runtimeConfig.ts` + `public/runtime-config.js`
      (default `true`)
- [ ] Ayuda in-app `src/docs/es/offline.md` + `en` y entrada en `config/helpIndex.ts`;
      `docs/features/offline-mode.md`
- [ ] Tests: `prepareRetreat` (orden, nunca llama food/medicines, progreso), `purge` (borra al
      cerrar la ventana en la TZ del retiro; conserva la cola con pendientes; no toca retiros en
      vivo), dashboard card
- [ ] Commit `feat(web): prepare retreat for offline use, staleness and purge`

**Done**: —

## M6 — Verificación end-to-end + cierre

- [ ] Levantar el stack del worktree (`start-worktree-dev.sh`); mover las fechas de un retiro de
      la DB desechable a "en vivo" (documentar el SQL en esta sección)
- [ ] E2E Playwright chromium `offline-mode.spec.ts`: CA 1-9, 12-14 y 16 con `setOffline` y
      `page.route` con delay; CA 10 con dos contextos; CA 11 destruyendo la sesión en la DB
      desechable
- [ ] Guion manual de los 16 CA de `spec.md` sobre el stack del worktree (persistencia real) y
      restauración del estado al final
- [ ] Prueba en iPhone real: "Agregar a pantalla de inicio", modo avión, recargar, check-in
      encolado, volver señal → sincroniza (anotar versión de iOS)
- [ ] `pnpm --filter web test`, `pnpm --filter api test` (2 shards), `vue-tsc`, `pnpm --filter
      api build` + `grep __dirname`, `mobile-page-weight.spec.ts`
- [ ] Security review del diff (`/security-review`): PII en IndexedDB, replay de idempotencia
      entre usuarios (422), validación de `occurredAt`, CSRF en la sincronización
- [ ] `## Reconcile` en `spec.md` (cada CA contra lo implementado; lo descartado y por qué)
- [ ] Skill nuevo o sección en `troubleshooting` para los síntomas nuevos ("dice sin conexión con
      wifi", "no sincroniza", "pendientes que no bajan") y enlace desde esta spec
- [ ] `nginx.conf` de prod actualizado **antes** del push (`sw.js` y manifest `no-cache`)
- [ ] PR a master; esperar `gh pr checks` en verde antes de merge
- [ ] Commit final `docs(specs): offline-mode reconcile`

**Done**: —

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
