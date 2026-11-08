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

## M9 — UX móvil (v1.1, feedback de Leo: «ver más grande» + pruebas en celular)

- [x] Prueba en viewport 390x844 con Playwright MCP — hallazgos con datos: el hilo
      quedaba en top=877px (viewport 844) tras tocar un chat, sin señal visible;
      tablero + controles superadmin empujaban las conversaciones al fondo
- [x] Móvil: lista y hilo EXCLUYENTES (chat activo ⇒ solo hilo, con botón Volver;
      sin chat ⇒ solo lista); escritorio conserva dos paneles
- [x] Móvil: conversaciones PRIMERO (order flex); tablero/superadmin al final
- [x] "Ver más grande": tap en la burbuja → Dialog con texto grande, fecha completa
      y acceso a registrar comprobante; burbujas como botones accesibles
- [x] Verificado en 390x844 (navegación, ampliada, volver) y 1280x800 (regresión
      de dos paneles + ampliada); vitest 13 y build web en verde

## M10 — UX ronda 2 (v1.1, elegido por Leo: 1+2+3+5/6)

- [x] **Badge en sidebar**: `GET /retreat/:id/unread` (liviano) + `waInboxStore.totalUnread`
      + entrada en `ITEM_BADGE` del Sidebar; refresco al cambiar retiro, cada 60 s, por
      socket dentro de la vista y al marcar leído. Verificado en vivo: badge "5"
- [x] **Toast en vivo**: `inbox:changed` lleva senderName + preview; el store muestra
      toast (patrón authStore)
- [x] **Búsqueda**: `GET /retreat/:id/search?q=` (LIKE con ESCAPE, límite 30) + input
      con debounce 300 ms en la bandeja; el resultado abre el chat
- [x] **Separadores Hoy/Ayer/fecha + horas en zona del retiro** (hilo y lista;
      regla 5 de timezone-handling). Verificado en vivo: separador "Hoy", hora
      08:05 CDMX para un UTC 14:05
- [x] Refactor: poller usa `getWalkerDigitsMap` (una sola fuente del whitelist) y el
      socket lleva remitente/vista previa; 50 tests API + 13 vitest + build verde

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
      (subida a YouTube SOLO con OK de Leo — regla de siempre) — **v1.3 grabado
      (2:08, 16 beats) y SUBIDO unlisted 2026-11-06: https://youtu.be/_SLDmmOjTPo**
      (playlist "Emaús Retiros — Tutoriales" pos. 31; ayuda in-app enlazada;
      incluye búsqueda sin acentos, vista ampliada y comprobante → pago)
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

## QA v1.2 (feedback de Leo, 2026-11-07)

- [x] **D16/FR15 Thumbnails**: imágenes del hilo visibles siempre (lote
  `POST /wa-bridge/retreat/:id/media`, máx 30 ids; server cachea thumb 320 +
  large 1600 por 30 min, máx 12). Fix de raíz del «se demora mucho»: el
  stop/restart del sync era POR imagen; ahora UNO por lote por link.
- [x] **Fix colateral**: `imageService.processPhoto` rechazaba fotos > 2 MB
  (tope de assets subidos) — nueva `processWaReceiptVariants` con tope propio
  de 10 MB; era la causa de «No se pudo descargar la imagen» en fotos grandes.
- [x] **D17/FR16 Historial del caminante**: entrantes de WhatsApp mezclados en
  `GET /participant-communications/participant/:id` (`direction:'inbound'`,
  id `wa-inbox:…`) solo con `whatsappInbox:read`; badge «Recibido», sin click
  al dialog de enviados. Espacio fuera de alcance: el historial de comunidad.
- [x] Limpieza de la chaos de QA: múltiples instancias del API del worktree
  vivas a la vez + 1 contenedor wacli huérfano — kill por cmdline + arranque
  limpio con `/tmp/emaus-wa-video/start-qa-api.sh` (una sola sesión, link
  connected, lastSyncAt avanzando).

## QA v1.2 ronda 2 (feedback de Leo, 2026-11-07 tarde)

- [x] **Thumbnails visibles** (verificado en navegador: 4 thumbs renderizados,
  visor grande instantáneo desde caché). Tres causas raíz del «no se ve»:
  1. `threadMedia` no seleccionaba `retreatId` → el filtro descartaba TODO
     (respondía `media:{}` con 200).
  2. `wacli media download` tomaba el lock → «store is locked». wacli mismo
     documenta el fix en su error: `--read-only --output` no toma lock →
     **la descarga corre junto al sync vivo**, se eliminó el stop/restart
     completo del lote (menos churn, menos huérfanos, también para prod).
  3. El lote moría entero por UNA imagen (403 del CDN de WhatsApp / link
     purgado) — ahora se salta por imagen con log `[waBridge][media]` y
     queda como placeholder; el store web marca `mediaUnavailable` para no
     re-pedirlas.
- [x] **Click en mensaje del historial muestra el detalle** (también
  entrantes): badge «Recibido», «Recibido:»/«Remitente:» en vez de
  «Enviado:»/«Destinatario:». El click sin reacción en entrantes era la
  simplificación de la ronda 1 — Leo esperaba «ver más grande».
- [x] **«Cargar más» ya no vacía la lista**: paginación acumulativa
  (offset siempre 0, limit crece; el API corta la página sobre el merge
  cronológico, con inbound take = limit+offset). Antes: skip por fuente
  descartaba filas y al 2.º click la lista quedaba vacía. Verificado:
  41 entradas estables y el botón desaparece al completar.

## QA v1.2 ronda 3 (feedback de Leo, 2026-11-07 noche)

- [x] **«request failed» al guardar pago**: NO era el comprobante — era el id
  del caminante de QA (`qa-walker-0001`, seed con id legible, no UUID): el
  schema de pagos valida uuid y respondía 400. Con un caminante de UUID real
  el guardado con comprobante adjunto responde 201 (verificado en navegador).
  El validador queda estricto (580/580 participantes reales tienen UUID).
  Pendiente para QA limpio: recrear el caminante de prueba con UUID.
- [x] **Imagen visible en el historial**: las entradas entrantes con imagen
  traen thumbnail (lote `/media` con ids `wa-inbox:`; fallos quedan como
  placeholder). Verificado: 4 thumbs renderizados.
- [x] **Preview de comprobante en el modal**: aspecto original
  (`h-20 object-contain`, max 160px) en vez de cuadrado 56px recortado;
  click para ampliar también en el recién adjuntado.
- [x] **Deuda técnica (pre-M4)**: mocks locales de lucide en
  Sidebar.test/SidebarFocusState.test sin `MessageCircle` (regresión del
  ítem wa-inbox añadido en M4) + aserción de orden adyacente rotas —
  868/868 en components tests.

## QA v1.2 ronda 4 (2026-11-07 noche, feedback Leo: «formulario roto» + «sigue fallando 400»)

- [x] **Formulario de pago desbordado**: el footer (4 botones en fila) tenía
  min-content ~634px > panel `max-w-md` (448) — como item del grid del diálogo
  agrandaba la COLUMNA y todo el form se salía. Fix: `min-w-0` en el form +
  `flex-wrap` en el footer. Verificado en viewport 700px: todo dentro.
- [x] **Recreado QA Caminante con UUID real** (`e6924084…`, vía
  `/participants/new` + `confirm-registration`): el guardado de pago con
  comprobante responde 201 de punta a punta (verificado). El seed viejo
  (`qa-walker-0001`) queda cancelado/fuera del mapa.
- [x] **Mapa de dígitos determinista**: `getWalkerDigitsMap` ordena
  inscripciones por createdAt DESC (ante teléfono duplicado gana la más
  reciente) y `conversations` REUSA el mapa en vez de su bloque inline
  (dos resoluciones distintas podían apuntar a participantes distintos).
  Bug de producto: participante sin `retreatId` borrado no cancelaba su
  fila de retiro (syncRetreatFields se salta) — solo afecta seeds huérfanos;
  documentado, no se cambia el flujo de delete en esta versión.
- Corrección (revisión 2026-11-08): el «body undefined» en PUT/PATCH de
  participantRoutes NO era un bug del body. El id `qa-walker-0001` no es UUID
  y falla `params.id`; como ese error no es «deep body», `validateRequest`
  devuelve los errores del fallback (`body`/`params` «Required»), que
  esconden la causa real. Es deuda preexistente de `validateRequest`,
  fuera del alcance de esta feature.

## v1.3 — revisión + pedido de Leo (2026-11-08)

Antes del merge (hallazgos de la revisión):
- [x] Borrado único y explícito (`teardownLink`): mensajes por linkId, read-state
  del retiro sin vínculos, caché de media y store en disco. La retención no
  borraba el store y ahora barre mensajes huérfanos. Motivo: el runtime no
  garantiza `PRAGMA foreign_keys` (27 huérfanos en la DB de dev).
- [x] Watchdog: `respawnFromDb` incluye vínculos en `error` y corre en cada poll;
  la reconexión ya no se audita como vínculo nuevo; bandera de apagado.
- [x] Historial oculto sin descargas; `PaymentManagement` embebido y diferido.
- [x] Tests de integración del puente (entidades registradas en la DB de test).
- [x] Menores: paginación del historial con offset, 30 miniaturas MÁS recientes,
  sin `detail` de wacli al cliente, etiquetas por tipo, toast en vez de alert,
  etiquetas de auditoría `wa_bridge.*` (test de cobertura que trajo master).
- [x] Ingesta: paginación asc real, `MediaCaption` (pie de foto), mime/nombre de
  documento, log de chats `@lid` descartados.
- [x] Escala: conversaciones y no leídos agregados en SQL; búsqueda sin tope 500.

Producto (D18–D21):
- [x] Respuestas del equipo y «Sin responder / Respondió X».
- [x] Documentos y notas de voz; PDF → imagen con pdf.js (`?worker`: chunk .js,
  no depende del MIME de .mjs en nginx).
- [x] Agregar como carta (texto de impresión) reutilizando `Letter`.
- [x] Anti-duplicados de pago (`payment-saved` → enlace al mensaje).
- [x] Responder con plantilla (MessageDialog) y parejas que comparten teléfono.

Coordinación: la sesión letters-email reutiliza `openPaymentForWithReceipt(…,
prefill)` + `embedded` + `payment-saved` para comprobantes de cartas; espera que
esto llegue a master. Pendiente de QA en vivo: Playwright MCP desconectado en
esta sesión — probar a mano nota de voz en iPhone y PDF real.
