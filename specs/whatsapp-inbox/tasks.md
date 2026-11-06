# Tasks — Inbox WhatsApp de solo lectura

> SDD tasks — versión 1.0 (2026-11-05). Marcar `[x]` al completar; anotar desviaciones
> reales respecto a plan.md al cerrar cada milestone (regla SDD: la spec se corrige en el
> mismo commit que el código cuando la realidad la contradice).
> `[P]` = paralelizable dentro del milestone.

## M0 — Ops de preparación (manual)

- [ ] Build del `wacli` desde el tag fijado al commit auditado (con el parche de hash del
      Dockerfile del MCP local); anotar `sha256sum`
- [ ] `scp` + `install -m 755` a `/opt/emaus-wa-bridge/wacli` en prod; crear
      `/var/lib/emaus-wa-bridge` (0700)
- [ ] Bloque `WA_BRIDGE_*` en `.env.production` con `WA_BRIDGE_ENABLED=false` y
      `WA_BRIDGE_MAX_SESSIONS=2` (sed puntual + pm2 restart; regla: prod manda)
- [ ] Bloque documentado en `apps/api/.env.example`

## M1 — Types + migración + entidades

- [x] `packages/types/src/permissions.ts`: recurso `whatsappInbox: ['read','manage']`
- [x] [P] `apps/web/src/utils/permissions.ts`: misma adición (copia del catálogo)
- [x] [P] `packages/types/src/audit.ts`: recurso `whatsapp_bridge_link` + acciones
      `WA_BRIDGE_*`
- [x] [P] `packages/types/src/waBridge.ts` (DTOs) + export en el index del paquete
- [x] [P] 3 entidades TypeORM + registro en `apps/api/src/database/config.ts`
- [x] Migración `20261107120000_CreateWhatsappBridge.ts` (3 tablas + índices + seeds de
      permisos a superadmin/admin/logistics/communications; `down()` reversible)
- [x] Test de migración: `up()` en DB `:memory:` → tablas, 2 permisos, 4 grants por permiso;
      `down()` limpia todo; re-`up()` idempotente — 8/8 verde (2026-11-05), más CHECK de
      status y FKs enforceadas con tablas padre stub (TypeORM prende foreign_keys=ON).
      Smoke del schema completo con `addCouplesRetreatSupport.test.ts` verde.

## M2 — Núcleo del puente (API)

- [ ] `wacliClient.ts` (spawn argv-array, timeout, envelope JSON, `WacliError`, sin send)
- [ ] `waBridgeSupervisor.ts` (auth→sync, eventos NDJSON, backoff, guard de huérfanos,
      killAll)
- [ ] `waBridgeService.ts` (ventana civil en zona del retiro, canLink con motivos, startLink,
      unlink, índice de caminantes recalculado por ciclo)
- [ ] `waBridgePoller.ts` (setInterval desfasado, `filterChats` función pura, dedupe,
      emitInboxChanged, tolerancia a lock, audit rate-limited)
- [ ] `waBridgeRetentionService.ts` (cron 03:45 + `performRetention()`; corre con bridge
      apagado)
- [ ] `index.ts` del directorio: singletons + `startScheduledTasks()` + registro en
      `apps/api/src/index.ts` + `killAll()` en `gracefulShutdown`
- [ ] **Verificar contra el binario fijado**: subcomandos `chats`/`messages` (flags
      `--chat/--after/--limit`), nombres de eventos NDJSON; corregir spec si difieren (regla 5)
- [ ] Tests jest (mock de `child_process` + repos; fixtures de teléfonos anonimizadas):
      - [ ] `waBridgeFilter` (grupo fuera, no-caminante fuera, lada/044 matchea, `@lid` fuera,
            fromMe fuera)
      - [ ] `waBridgeWindow` (antes de ventana, dentro, tras endDate, elegible de purga, borde
            nocturno CDMX vs UTC)
      - [ ] `waBridgeSupervisor` (parseo de QR, transición a connected, backoff, cap)
      - [ ] `waBridgeRetention` (tmpdir como store, rm + audit + conteos)

## M3 — Controller, rutas, realtime

- [ ] `waBridgeController.ts` + `waBridgeRoutes.ts` + montaje en `routes/index.ts`
      (matriz de rutas de plan.md §2; `linkedPhone` solo al dueño)
- [ ] `realtime.ts`: room `retreat:<id>:inbox` + `inbox:subscribe/unsubscribe` (permiso +
      retiro) + `emitInboxChanged`
- [ ] `apps/api/src/config.ts`: bloque `waBridge`
- [ ] Test de acceso: 401/403 sin permiso o sin acceso al retiro, 400 sin consentimiento,
      409 tope/ya-vinculado, 422 fuera de ventana, 503 kill switch, QR owner-only, subscribe
      de socket rechazado sin permiso

## M4 — Web

- [ ] Funciones de `services/api.ts` (7 endpoints)
- [ ] [P] `stores/waInboxStore.ts` (realtime port + refetch)
- [ ] [P] `components/wa/WaLinkModal.vue` (consentimiento → QR → conectado; polling 3 s)
- [ ] [P] `components/wa/WaLinkPanel.vue`, `WaConversationList.vue`, `WaChatThread.vue`
      (solo `{{ }}`, deep link respuesta)
- [ ] `views/WaInboxView.vue` (dos paneles / apilado móvil)
- [ ] Router (`wa-inbox` con `requiresPermission`) + Sidebar (sección communications, ícono
      en allowlist del mock)
- [ ] `locales/es.json` + `en.json` (ambos) + íconos nuevos en `test/setup.ts` si los hay
- [ ] Tests vitest: store realtime (molde messageSequenceStore), hilo con payloads
      maliciosos inertes (`<script>`/`<img onerror>` como texto), gate de consentimiento del
      modal

## M5 — E2E + QA manual

- [ ] E2E dry-run (`apps/web/tests/e2e/`, reglas de `.claude/rules/e2e-tests.md`): con
      `WA_BRIDGE_ENABLED=false`, entrada del sidebar ausente para `regular_server` y API 503;
      sin WhatsApp real ni vínculo real
- [ ] QA manual con cuenta staff real (checklist CA1-CA8 de spec.md, incl. reconexión tras
      `pm2 restart`, filter en vivo con grupo y no-caminante, presence quiet, purga con
      `performRetention()` a mano)
- [ ] Ajustar `--history-days` según el resultado del emparejamiento real (decisión abierta
      de spec.md)

## M6 — Rollout prod

- [ ] Deploy con `WA_BRIDGE_ENABLED=false` → migración dark + feature inerte verificada
- [ ] Encender: `WA_BRIDGE_ENABLED=true` (o unset) con `MAX_SESSIONS=2` → primer vínculo en
      un retiro en ventana
- [ ] Monitoreo 48 h: `free -m` en picos, tabla de auditoría, `~/.pm2/logs/emaus-api-*.log`
- [ ] Si el margen de RAM lo permite, subir `MAX_SESSIONS` a 3

## Desviaciones registradas

- **M1**: la migración usa `transaction = false as const` (plan.md decía que la plantilla
  simple no lo necesitaba): las migraciones de permisos hermanas lo fijan "por consistencia"
  y el runner propio lo respeta desde 2026-09-08 — plan.md corregido en el mismo commit
  (regla SDD 5).
- **M1**: el test de migración descubre que TypeORM activa `PRAGMA foreign_keys=ON` en su
  DataSource de sqlite; el test usa tablas padre stub (`retreat`, `users`) y convierte el
  insert válido en prueba conductual de FK.
