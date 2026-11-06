# Tasks — Inbox WhatsApp de solo lectura

> SDD tasks — versión 1.0 (2026-11-05). Marcar `[x]` al completar; anotar desviaciones
> reales respecto a plan.md al cerrar cada milestone (regla SDD: la spec se corrige en el
> mismo commit que el código cuando la realidad la contradice).
> `[P]` = paralelizable dentro del milestone.

## M0 — Ops de preparación (manual)

- [x] Build del `wacli` v0.21.0 desde el commit auditado `ed31806e` — **rebuild glibc
      amd64** (la imagen local del MCP es arm64; prod es x86_64). sha256:
      `08353dd0de82e0c896805f5802cda09baeced7cff802cf2c89cbd60c1c7bd909`. El build musl
      original quedó descartado. Verificado con `wacli --version` en contenedor amd64.
- [x] `scp` + `install -m 755` a `/opt/emaus-wa-bridge/wacli` en prod (verificado:
      `wacli --version` corre en el servidor); `/var/lib/emaus-wa-bridge` creado 0700,
      dueño `ubuntu` (autorizado por Leo el 2026-11-05)
- [x] Bloque `WA_BRIDGE_*` en `.env.production` con `WA_BRIDGE_ENABLED=false` y
      `WA_BRIDGE_MAX_SESSIONS=2` (5 vars; backup previo en
      `/var/backups/emaus/env.production.bak.20261105-wa-bridge`; sin pm2 restart —
      nada las lee hasta M6; regla: prod manda)
- [x] Bloque documentado en `apps/api/.env.example`

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

- [x] `wacliClient.ts` (spawn argv-array, timeout, envelope JSON, `WacliError`, sin send)
- [x] `waBridgeSupervisor.ts` (auth→sync, eventos NDJSON, backoff, guard de huérfanos,
      killAll)
- [x] `waBridgeService.ts` (ventana civil en zona del retiro, canLink con motivos, startLink,
      unlink, índice de caminantes recalculado por ciclo)
- [x] `waBridgePoller.ts` (setInterval, `filterWhitelistedChats` función pura, dedupe
      con `orIgnore` + `changes`, emitInboxChanged, tolerancia a lock, audit rate-limited)
- [x] `waBridgeRetentionService.ts` (cron 03:45 + `performRetention()`; corre con bridge
      apagado; huérfanos de retiro borrado se purgan también)
- [x] `index.ts` del directorio: singletons + `startScheduledTasks()` + registro en
      `apps/api/src/index.ts` + `killAll()` en `gracefulShutdown`
- [x] **Verificado contra el binario fijado (glibc amd64, v0.21.0)**: `chats list
      --limit/--query`, `messages list --chat/--after/--limit/--asc/--from-them`,
      `auth status/logout`, `--events` NDJSON en stderr, flags `--max-messages`/
      `--max-db-size`/`--presence-mode quiet`/`--qr-format text`/`--history-days` — todos
      existen. Subcomandos escritores (`send`, `messages delete`, etc.) confirmados como
      presentes en el binario pero nunca invocados desde el código.
- [x] Tests jest:
      - [x] `waBridgeFilter` (grupos/@lid fuera, no-caminante fuera, variantes 52/521 y US,
            fromMe fuera, sufijo-exacto no matchea, multimedia con body null) — 13 casos
      - [x] `waBridgeWindow` (ventana ±7d, gracia post-retiro, purga estrictamente después,
            variantes de JID por país, borde nocturno CDMX vs UTC con fake timers) — 14 casos
      - [x] `waBridgeSupervisor` (parseo de eventos NDJSON con formas alternativas,
            forward-compatible, killOrphans no-op en macOS, stop idempotente) — 4 casos
      - [ ] `waBridgeRetention` (integrado): **pospuesto a M5** — se ejercita con
            `performRetention()` a mano en el QA manual (desviación abajo)

## M3 — Controller, rutas, realtime

- [x] `waBridgeController.ts` + `waBridgeRoutes.ts` + montaje en `routes/index.ts`
      (`/api/wa-bridge`; matriz de plan.md §2; `linkedPhone` solo al dueño o superadmin)
- [x] `realtime.ts`: room `retreat:<id>:inbox` + `inbox:subscribe/unsubscribe` (permiso +
      retiro) + `emitInboxChanged` — hecho en M2 porque el poller lo importa
- [x] `apps/api/src/config.ts`: bloque `waBridge` (hecho en M2 junto al núcleo)
- [x] Test del controller (14 casos): 400 sin consentimiento, 503 kill switch, 409 tope,
      422 ventana, 201 dueño-con-teléfono, strip de teléfonos ajenos, superadmin ve todo,
      404/403 owner-only en status y unlink, validaciones de chatJid/before sin tocar DB
- [ ] Suscripción de socket rechazada sin permiso: verificación en QA M5 (handler replica
      el molde `sequences:subscribe` + `hasPermission`)

## M4 — Web

- [x] Funciones de `services/api.ts` (7 endpoints)
- [x] [P] `stores/waInboxStore.ts` (realtime port + refetch; `openChat` marca seen en
      servidor y limpia el badge local)
- [x] [P] `components/wa/WaLinkModal.vue` (consentimiento → QR → conectado; polling 3 s;
      montado siempre sin v-if)
- [x] [P] `components/wa/WaLinkPanel.vue`, `WaConversationList.vue`, `WaChatThread.vue`
      (solo `{{ }}`, deep link respuesta con `toNationalPhone` + `buildWhatsAppChatLink`)
- [x] `views/WaInboxView.vue` (dos paneles / apilado móvil; realtime dot)
- [x] Router (`wa-inbox` con `requiresPermission: 'whatsappInbox:read'`) + Sidebar (tras
      palancas; `MessageCircle` ya estaba en la allowlist del mock) + `PermissionType`
      del sidebar ampliado
- [x] `locales/es.json` + `en.json` (ambos: `sidebar.waInbox` + bloque `waInbox.*`)
- [x] Tests vitest (13): store realtime (join/ack/re-join/otro-retiro/unsubscribe),
      `openChat` (orden cronológico + seen + badge), hilo con payloads maliciosos inertes,
      multimedia placeholder, gate de consentimiento del modal
- [x] `pnpm --filter web build` verde (vue-tsc + vite)

## M7 — Activación por retiro + terminar servidores (v1.1)

- [x] Migración `20261108120000_AddRetreatWhatsappInboxEnabled`: ADD COLUMN guardado
      (plantilla simple) + down con DROP COLUMN nativo; entidad `Retreat.whatsappInboxEnabled`
- [x] Service: `canLink` rechaza `not_enabled`; respawn y poller saltan retiros apagados;
      teardown extraído (`teardownLink`) y reutilizado; `setEnabled` (apagar = terminar todo)
      y `terminateAll` con audit + emitInboxChanged
- [x] Endpoints `PATCH /retreat/:id/enabled` y `POST /retreat/:id/terminate-all` — superadmin
      via `hasRole` (403 al resto); tablero devuelve `enabled`
- [x] UI: switch + "Terminar servidores" (confirmación en dos pasos) solo para superadmin;
      Desvincular ajeno para superadmin en el tablero; locales es+en
- [x] Tests: migración 3, controller +5 (403/400/OK) — 61 verdes; build web verde;
      verificado en vivo: switch → PATCH → activado, tablero con 2 vínculos

## M8 — Comprobantes de pago desde WhatsApp (v1.1, implementado tras el merge de master)

- [x] **Dependencia resuelta**: `payment-receipt-photo` mergeada a master — traída a esta
      rama por merge (2026-11-06, sin conflictos; 71 tests de ambas features en verde)
- [x] `wacliClient.mediaDownload` (one-shot, sin --read-only; el servicio detiene al
      supervisor por el lock del store y re-arranca el sync al terminar)
- [x] `waBridgeService.downloadReceiptDataUrl`: tope 10 MB, `imageService.processPhoto`
      (WebP 1600px), tmp en receipts-tmp/ (0700) borrado siempre; `getWalkerDigitsMap`
      compartido con la bandeja
- [x] Endpoint `POST /wa-bridge/messages/:messageId/receipt` — doble permiso
      (`whatsappInbox:read` + `payment:create`) + `ensureRetreatAccess`; devuelve
      data-URL + participante matcheado
- [x] Web: `PaymentManagement.openPaymentForWithReceipt` (defineExpose nuevo); botón
      "Registrar como pago" en el hilo para `messageType='image'` solo con
      `payment:create`; modal montado oculto en la bandeja
- [x] Verificado en vivo: click → descarga → modal "Agregar Pago" con participante
      prellenado y comprobante WebP adjunto
- [x] Fix de producción cazado aquí: `supervisor.stop()` esperaba `close`, pero el
      nieto `sleep` del wrapper shell hereda los pipes y `close` no dispara → el
      endpoint se colgaba. Ahora: spawn `detached` + señal al grupo de procesos
      (`kill(-pid)`) + resolución por `exit` con destrucción de streams
- [x] Fix de PII del demo: `maskNode` canónico ahora cubre `participantFirstName`/
      `participantLastName` (con test — 20/20) — los nombres reales de caminantes
      fugaban en las tomas anteriores

## M5bis — Video-demo (`record-wa-inbox.mjs`)

- [x] Escenario: San Agustín con fechas movidas (ventana abierta), 7 mensajes de
      caminantes sembrados (3 walkers reales de la dev DB, cuerpos ficticios), vínculo
      demo a nombre de otro usuario, y **fake-wacli** local (QR falso + envelopes
      vacíos) para el flujo de vinculación sin WhatsApp real
- [x] Grabación narrada (Deepgram Aura-2, 13 beats, 1:28) con masking canónico
      (`maskRoute` sobre `**/api/**`): nombres → "Beatriz Prieto", teléfonos → bloque
      5500. Verificada por frames (intro/sidebar/tablero/lista/hilo/responder/
      consentimiento/QR/conectado/ciclo/outro) y volumen (-18.3 dB)
- [x] mp4 en `~/Desktop/WhatsApp-del-Retiro-demo.mp4` + `.meta.json` con capítulos
      (subida a YouTube SOLO con OK de Leo — regla de siempre) — **v1.2 regrabado
      (1:48, 15 beats)**: scroll del sidebar (feedback de Leo), switch de activación
      por retiro, y beat nuevo de comprobante → pago con la foto adjunta
- Trampas nuevas anotadas: el `--max-messages` del supervisor matchea el case
  `*"messages"*` de un fake-shell (ordenar los cases con anclas de palabra); el
  testid de `DialogContent` de reka-ui no se props-forward (anclar en un hijo);
  huérfanos del fake pelean el lock del store en macOS (el guard /proc es
  Linux-only) → `pkill fake-wacli` antes de cada arranque del API en demo

## M5 — E2E + QA manual

- [x] E2E dry-run (`apps/web/tests/e2e/wa-inbox.spec.ts`, 3 tests): superadmin ve la
      entrada en «Comunicaciones» y la vista carga; URL directa OK; sin permiso (simulado
      vía `page.route` sobre el perfil auth) la entrada no aparece y el guard redirige.
      Sin WhatsApp real ni escrituras en la base.
- [ ] QA manual con cuenta staff real (checklist CA1-CA8 de spec.md, incl. reconexión tras
      `pm2 restart`, filter en vivo con grupo y no-caminante, presence quiet, purga con
      `performRetention()` a mano) — **pendiente de Leo** (requiere dos teléfonos)
- [ ] Ajustar `--history-days` según el resultado del emparejamiento real (decisión abierta
      de spec.md)

## M6 — Rollout prod

- [ ] Deploy con `WA_BRIDGE_ENABLED=false` → migración dark + feature inerte verificada
- [ ] Encender: `WA_BRIDGE_ENABLED=true` (o unset) con `MAX_SESSIONS=2` → primer vínculo en
      un retiro en ventana
- [ ] Monitoreo 48 h: `free -m` en picos, tabla de auditoría, `~/.pm2/logs/emaus-api-*.log`
- [ ] Si el margen de RAM lo permite, subir `MAX_SESSIONS` a 3

## Desviaciones registradas

- **M0 (parcial)**: la imagen local del MCP es **arm64** y prod es **x86_64** → el binario
  no se puede copiar tal cual. Se reconstruyó `wacli` para linux/amd64 **glibc** replicando
  la receta del Dockerfile auditado (mismo repo, tag v0.21.0, check de commit `ed31806e`,
  mismos flags) en un builder `golang:1.27.2` debian. sha256 del binario glibc:
  `08353dd0de82e0c896805f5802cda09baeced7cff802cf2c89cbd60c1c7bd909`. El binario musl
  original queda descartado (dinámico contra `/lib/ld-musl-x86_64.so.1`, no corre en Ubuntu).
- **M0 (resuelto)**: la instalación en prod fue DENEGADA por el clasificador de permisos en
  la primera pasada y **ejecutada tras autorización explícita de Leo** (2026-11-05,
  AskUserQuestion). Todo inerte hasta M6 (sin pm2 restart).
- **M1**: la migración usa `transaction = false as const` (plan.md decía que la plantilla
  simple no lo necesitaba): las migraciones de permisos hermanas lo fijan "por consistencia"
  y el runner propio lo respeta desde 2026-09-08 — plan.md corregido en el mismo commit
  (regla SDD 5).
- **M1**: el test de migración descubre que TypeORM activa `PRAGMA foreign_keys=ON` en su
  DataSource de sqlite; el test usa tablas padre stub (`retreat`, `users`) y convierte el
  insert válido en prueba conductual de FK.
- **M2**: el match del filtro no compara "nacional vs nacional con lada MX fija": el índice
  aceptado se construye con **variantes de dígitos JID por país** (`52…`/`521…` para MX, otra
  lada para el resto) — los caminantes internacionales ya matchean. Spec D4 sin cambio
  (misma whitelist, mejor cálculo). Además `messages list --from-them` filtra fromMe **en
  origen** (wacli), y el insert conserva el doble chequeo.
- **M2**: test de retención integrado pospuesto a M5 (QA manual con `performRetention()`);
  la lógica de vencimiento (`isLinkPurgeDue`) sí está testeada como función pura.
- **M2**: `@Index` de entidades y `CREATE INDEX` de la migración conviven (sync en test,
  migración en prod); los nombres de índice coinciden en ambos lados para no diverger.
- **M3**: handlers como **arrows de clase** (`getQueue = async (req,res) => …`), estilo de
  la casa que evita `unbound-method` en el lint de rutas — el plan no lo especificaba.
- **M3**: `req.user` se tipa con helper local `currentUser(req)` (patrón `(req.user as any)`
  de los controllers legacy, con cast explícito a la entidad User).
- **M3**: `markSeen` computa el timestamp de "leído hasta aquí" en el **servidor** (el
  cliente solo manda chatJid) — más estricto que lo escrito en plan.md §2.
- **M3**: ramas de controller que tocan DB (conversations/messages/seen) sin test
  integrado: se ejercitan en QA M5. El DTO `WaInboxMessageDto` perdió `senderJid`
  (la entidad nunca lo tuvo).
- **M4**: el build (vue-tsc) cazó 3 errores que ni vitest ni eslint vieron (import de
  `WaLinkDto` desde el lugar equivocado, `getWaLinkStatus` sin importar, `PermissionType`
  del sidebar sin el recurso nuevo) — una vez más, el build es el chequeo definitivo.
  Además el controller dejó de descartar `ownerName` (el servicio lo calculaba y el DTO
  lo perdía) — bug cazado al escribir el tablero de la UI.
- **M4**: los tests de texto visible montan un `useI18n` local con las cadenas reales de
  es.json (el mock global devuelve la key cruda y las assertions de texto fallarían).
- **M5 (bug cazado por la verificación visual, no por ningún test)**: `type`/`isCancelled`
  del caminante viven en **`retreat_participants`** (RetreatParticipant), no en `Participant`
  — las queries del índice de caminantes y del match de la bandeja consultaban a la entidad
  equivocada (400 "Property type was not found"). Ni los 66 tests ni el build lo vieron (los
  mocks no cargan metadata); lo cazó abrir la vista con datos reales. Fix en service y
  controller: registrar en RetreatParticipant + fetch de participants por ids.
- **M5**: la simulación de "sin permiso" en E2E necesita quitar TAMBIÉN `user:delete`:
  el sidebar concede todos los menús a `isSuperadmin` (= tener `user:delete` en el perfil
  combinado). Y las rutas de interceptación van ANTES del login (el store persistido no
  re-evalúa con reload).
