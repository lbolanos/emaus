# Plan técnico — Inbox WhatsApp de solo lectura

> Implementa `spec.md` (D1-D12, FR1-FR11). Rutas absolutas relativas a la raíz del repo.
> Identificadores de código en inglés; texto de UI en español.

## 1. Migración (un archivo)

`apps/api/src/migrations/sqlite/20261107130000_CreateWhatsappBridge.ts` — plantilla simple
idempotente del skill `sqlite-migrations` (solo agrega tablas + seeds de permisos: sin
recreate-table, sin DROP de padres). SQL plano; **sin imports de `@repo/types`**. Con
`transaction = false as const` por consistencia con las migraciones de permisos hermanas
(el runner propio lo respeta desde 2026-09-08).

### Tablas

**`whatsapp_bridge_link`** — un vínculo por staff y retiro:

- `id varchar(36) PK` (uuid) · `retreatId varchar(36) NOT NULL` FK→`retreat(id)` CASCADE ·
  `userId varchar(36) NOT NULL` FK→`users(id)` CASCADE (dueño) ·
  `status varchar(20) NOT NULL DEFAULT 'pending'` CHECK IN (`pending|qr|connected|error|
  logged_out|expired`) · `linkedJid varchar(64) NULL` · `linkedPhone varchar(20) NULL`
  (nacional, solo display, **nunca sale del API hacia terceros**) ·
  `storePath varchar(255) NOT NULL` · `lastError text NULL` · `connectedAt datetime NULL` ·
  `lastSyncAt datetime NULL` · `createdAt/updatedAt datetime`.
- Índices: `UNIQUE(userId, retreatId)`, `INDEX(retreatId, status)`, `INDEX(status)`.

**`whatsapp_inbox_message`** — solo mensajes que pasaron la whitelist:

- `id varchar(36) PK` · `linkId varchar(36) NOT NULL` FK→link CASCADE ·
  `retreatId varchar(36) NOT NULL` (desnormalizado, **sin FK física**, indexado) ·
  `chatJid varchar(64) NOT NULL` · `chatPhone varchar(20) NOT NULL` (nacional) ·
  `waMessageId varchar(128) NOT NULL` · `timestamp datetime NOT NULL` (UTC; el cliente
  renderiza en zona del retiro) · `fromMe boolean NOT NULL DEFAULT 0` (solo se insertan 0) ·
  `body text NULL` (texto/caption; multimedia nunca se descarga) · `createdAt datetime`.
- Índices: `UNIQUE(linkId, waMessageId)` (dedupe), `INDEX(retreatId, chatJid, timestamp DESC)`
  (hilo), `INDEX(retreatId, timestamp)` (bandeja).

**`whatsapp_inbox_read_state`** — no-leídos por usuario:

- `id varchar(36) PK` · `userId varchar(36) NOT NULL` FK→users CASCADE · `retreatId` ·
  `chatJid` · `lastSeenMessageTimestamp datetime NOT NULL` · `updatedAt datetime`.
- `UNIQUE(userId, retreatId, chatJid)`.

### Seeds de permisos (idempotentes)

- `('whatsappInbox','read')` y `('whatsappInbox','manage')` → roles `superadmin`, `admin`,
  `logistics`, `communications`. `regular_server`/`treasurer` sin nada.
- Patrón: `ensurePermission` → `getRoleId` → `grantPermission` de la migración de permiso de
  participante ya existente en `apps/api/src/migrations/sqlite/`.
- `down()`: borrar `role_permissions` de ambos permisos, los permisos, y las 3 tablas (hijos
  primero). Sin PRAGMA dance (no hay padres tocados).

### Entidades TypeORM (registrarlas a mano en `apps/api/src/database/config.ts`)

`apps/api/src/entities/whatsappBridgeLink.entity.ts`,
`whatsappInboxMessage.entity.ts`, `whatsappInboxReadState.entity.ts`.

### packages/types + web catálogo

- `packages/types/src/permissions.ts`: `whatsappInbox: ['read','manage']`.
- `apps/web/src/utils/permissions.ts`: **la misma adición en su copia**.
- `packages/types/src/audit.ts`: recurso `'whatsapp_bridge_link'`; acciones
  `WA_BRIDGE_LINK_START/LINKED/UNLINKED/PURGED/SYNC_ERROR/WINDOW_DENIED`.
- DTOs compartidos opcionales: `packages/types/src/waBridge.ts` (status union, `WaLinkDto`,
  `WaConversationDto`, `WaInboxMessageDto`) exportado desde el index del paquete.

## 2. API — `apps/api/src/services/waBridge/`

### `wacliClient.ts` — ejecutor del binario

- Spawn **argv-array** (estilo `execFile`; jamás `shell: true`), cwd y env sanitizados
  (`PATH`, `HOME`, topes de sync).
- One-shot: `[bin, '--store', dir, '--read-only', '--json', ...args]` con timeout
  (`WA_BRIDGE_COMMAND_TIMEOUT_SECONDS`, default 30) + SIGKILL; parseo del envelope JSON
  (`data` del stdout; error como envelope en stderr → `WacliError`).
- Comandos: `chats list …`, `messages list …`, `auth status` (todos one-shot read-only);
  `auth logout` solo con el supervisor detenido (lock del store).
- **No existe ningún método de envío** en este módulo.

### `waBridgeSupervisor.ts` — un hijo persistente por link

- No emparejado: spawn `auth --qr-format text --history-days <N>` con `--events`: parsea el
  QR de los eventos NDJSON (rota ~20 s), lo cachea en memoria, status `'qr'`; al terminar el
  bootstrap (exit 0) consulta `auth status` y pasa a modo sync.
- Emparejado: spawn `sync --follow --presence-mode quiet --max-messages <N> --max-db-size
  <N>MB --max-reconnect 0` con `--events`; evento de conexión → status `'connected'` +
  persistir `linkedJid/linkedPhone`; `session_logged_out` → `'logged_out'`; errores →
  `lastError` + audit rate-limited.
- Restart con backoff exponencial (5 s → tope 60 s, reset al conectar).
- `stop()` SIGTERM→SIGKILL(5 s); `killAll()` estático para shutdown del API.
- **Guard de huérfanos** (solo Linux): antes de spawnear, barrer `/proc/*/cmdline` buscando
  procesos cuyo argv contenga este `storePath` y hacerles SIGKILL — un SIGKILL del API deja
  hijos wacli vivos que sostienen el lock del store.

### `waBridgeService.ts` — orquestación

- `getLinkWindow(retreat)`: fecha civil en zona del retiro (helpers de
  `apps/api/src/utils/date.transformer.ts`; `startDate/endDate` como strings `YYYY-MM-DD`).
  Vincular si `hoy(en zona del retiro) ∈ [startDate − linkWindowDays, endDate]`.
- `canLink(retreatId, userId)`: kill switch → ventana → tope de sesiones
  (`activeConnectedCount() < WA_BRIDGE_MAX_SESSIONS`) → ya vinculado. Devuelve motivo
  tipado para la UI (`disabled | outside_window | cap_reached | already_linked`).
- `startLink(user, retreat)`: crea row (storePath = `dataDir/<linkId>`, `mkdir` 0700) +
  supervisor + audit `LINK_START`.
- `unlink(user, link)`: `stop()` → `auth logout` → `rm -rf storePath` → status
  `'logged_out'` → audit `UNLINKED`.
- `getWalkerPhoneIndex(retreatId)`: SELECT participants del retiro con `type='walker'`, no
  cancelados ni soft-deleted → `Set<string>` de `toNationalPhone(cellPhone, país)`. Se
  recalcula en cada ciclo de polling (barato: cientos de filas) para captar inscripciones
  tardías.

### `waBridgePoller.ts` — ingesta por polling

- `setInterval` cada `WA_BRIDGE_POLL_SECONDS` (default 45), desfasado por link:
  1. Para cada link `'connected'`: one-shot `chats list`.
  2. **Filtro whitelist (función pura exportada para tests)**: solo JIDs
     `^\d+@s\.whatsapp\.net$`; `@g.us`/`@lid` fuera; `toNationalPhone(dígitos del JID, país)`
     ∈ índice de caminantes. Nada que no pase se consulta ni persiste.
  3. Por chat sobreviviente: `messages list --after=<lastSyncAt − 5 min de lookback>`;
     inserta solo `fromMe=0` con guard `UNIQUE(linkId, waMessageId)` (OR IGNORE).
  4. Si hubo inserts: `emitInboxChanged({retreatId, newCount})` + `lastSyncAt`.
  5. Errores de lock del store: tolerar y reintentar el próximo ciclo (jamás crashear);
     audit `SYNC_ERROR` rate-limited (máx 1 por link cada 10 min).

### `waBridgeRetentionService.ts` — ciclo de vida

- node-cron diario 03:45 UTC + `performRetention()` testeable (molde
  `auditRetentionService`). Para cada link con `hoy(en zona del retiro) > endDate +
  WA_BRIDGE_RETENTION_DAYS`: stop → logout best-effort → `rm -rf` store → DELETE row
  (CASCADE limpia mensajes y read-state) → audit `PURGED` con conteos.
- **Corre aunque `WA_BRIDGE_ENABLED=false`** (la purga es la dirección privacy-safe).

### Wiring y ciclo de vida del proceso

- `apps/api/src/services/waBridge/index.ts` exporta singletons + `startScheduledTasks()`: al
  boot, si enabled y `fs.existsSync(config.waBridge.wacliBin)` (si no: warn único y no-op),
  respawnea supervisores de links `'connected'` cuyo retiro sigue en ventana (la sesión
  sobrevive `pm2 restart`; WhatsApp reconecta el linked device).
- Registrar en `apps/api/src/index.ts` junto a los demás `startScheduledTasks()`;
  `supervisor.killAll()` + paro del poller dentro de `gracefulShutdown`.

### Controller + rutas

`apps/api/src/controllers/waBridgeController.ts` + `apps/api/src/routes/waBridgeRoutes.ts`,
montadas en `apps/api/src/routes/index.ts` como `router.use('/wa-bridge', …)`:

| Ruta | Middleware | Notas |
| --- | --- | --- |
| `POST /retreat/:retreatId/link` | `isAuthenticated` + `whatsappInbox:manage` + `requireRetreatAccess` | `body.consentAccepted === true` o 400; motivos de rechazo 409/422/503 según `canLink` |
| `GET /retreat/:retreatId/links` | `…:read` + `requireRetreatAccess` | tablero; **sin `linkedPhone` ajeno** |
| `GET /link/:linkId/status` | `…:manage` + owner-or-superadmin | QR y teléfono solo al dueño |
| `DELETE /link/:linkId` | `…:manage` + owner-or-superadmin | desvinculación (FR6) |
| `GET /retreat/:retreatId/conversations` | `…:read` + `requireRetreatAccess` | incluye `{participantId, firstName, lastName, chatPhone, country}` por chat (para el deep link del FR8) |
| `GET /retreat/:retreatId/messages?chatJid&before&limit` | idem | paginado del hilo |
| `POST /retreat/:retreatId/seen` | `…:read` + `requireRetreatAccess` | body `{chatJid}`; upsert de read-state |

### Realtime (`apps/api/src/realtime.ts`)

- `inboxRoom(retreatId)` = `retreat:<id>:inbox`; `inbox:subscribe/unsubscribe` con ack —
  molde `sequences:subscribe`, exigiendo `hasRetreatAccess` **y**
  `hasPermission('whatsappInbox:read')`.
- `emitInboxChanged(payload)` — molde `emitSequenceQueueChanged`.

### Config (`apps/api/src/config.ts`, con los parse helpers existentes)

`WA_BRIDGE_ENABLED` (default true en dev; kill switch) · `WA_BRIDGE_WACLI_BIN`
(`/opt/emaus-wa-bridge/wacli`) · `WA_BRIDGE_DATA_DIR` (`/var/lib/emaus-wa-bridge`) ·
`WA_BRIDGE_MAX_SESSIONS` (3) · `WA_BRIDGE_POLL_SECONDS` (45) · `WA_BRIDGE_RETENTION_DAYS`
(15) · `WA_BRIDGE_LINK_WINDOW_DAYS` (7) · `WA_BRIDGE_COMMAND_TIMEOUT_SECONDS` (30) ·
`WA_BRIDGE_RESTART_BACKOFF_SECONDS` (5) · `WA_BRIDGE_SYNC_MAX_MESSAGES` (20000) ·
`WA_BRIDGE_SYNC_MAX_DB_SIZE_MB` (50).

## 3. Web

| Archivo | Contenido |
| --- | --- |
| `apps/web/src/services/api.ts` | `startWaLink`, `getWaLinks`, `getWaLinkStatus`, `unlinkWaLink`, `getWaConversations`, `getWaMessages`, `markWaChatSeen` (instancia axios central; sin fetch directo) |
| `apps/web/src/stores/waInboxStore.ts` | estado de conversaciones/hilo/links + `subscribeRealtime(retreatId)` — port del patrón de `messageSequenceStore.subscribeRealtime` (join con ack, re-join al reconectar, listener `inbox:changed`) |
| `apps/web/src/views/WaInboxView.vue` | dos paneles (lista + hilo; apilados en móvil), header con tablero de links y botón "Vincular mi WhatsApp"; texto de UI en español vía i18n |
| `apps/web/src/components/wa/WaLinkPanel.vue` | tablero: dueño, estado, última sync; sin teléfonos de otros staff |
| `apps/web/src/components/wa/WaLinkModal.vue` | 3 etapas: consentimiento (checkbox + aviso) → QR (`qrcode.vue`, polling de status cada 3 s) → conectado + "Desvincular". Montado sin `v-if`; apertura por botón directo (no DropdownMenuItem → sin `useRekaDialogFix`) |
| `apps/web/src/components/wa/WaConversationList.vue` | filas de chat con badge no leído (diff vs read-state), hora en zona del retiro |
| `apps/web/src/components/wa/WaChatThread.vue` | mensajes **solo con `{{ }}`** (jamás `v-html`); multimedia → "📎 Multimedia"; footer "Responder desde mi WhatsApp" → `buildWhatsAppChatLink(chatPhone, country)` + `window.open` |
| `apps/web/src/router/index.ts` | hijo del layout de retiro: `{ path: 'wa-inbox', meta: { requiresRetreat, requiresPermission: 'whatsappInbox:read' } }` |
| `apps/web/src/components/layout/Sidebar.vue` | ítem en la sección communications con gate `whatsappInbox:read`; ícono `MessageCircle` (ya está en la allowlist del mock de tests) |
| `apps/web/src/locales/es.json` + `en.json` | `sidebar.waInbox` + bloque `waInbox.*` (consentimiento, estados, errores de tope/ventana/disabled) — **ambos** archivos |
| `apps/web/src/test/setup.ts` | agregar al mock de lucide cualquier ícono nuevo que se use |

## 4. Deploy / runtime (Lightsail, sin Docker)

1. Binario: build local del `wacli` desde el tag fijado al commit auditado (mismo parche de
   verificación de hash del Dockerfile del MCP local), `sha256sum` anotado en notas de ops,
   `scp` + `install -m 755 /opt/emaus-wa-bridge/wacli`. Jamás auto-update.
2. Stores: `/var/lib/emaus-wa-bridge/<linkId>/`, `mkdir` 0700 por el API, mismo usuario que
   el API. El `rm -rf` de unlink/retención borra llaves de sesión e historial.
3. `.env.production` (regla: prod manda; sed puntual + pm2 restart):
   `WA_BRIDGE_ENABLED=false` inicialmente, `WA_BRIDGE_MAX_SESSIONS=2`, `WA_BRIDGE_WACLI_BIN`,
   `WA_BRIDGE_DATA_DIR`, `WA_BRIDGE_RETENTION_DAYS=15`. Bloque documentado en
   `.env.example`.
4. Los hijos wacli son hijos del proceso pm2 `emaus-api` (`max_memory_restart` aplica solo
   al API). Deploys → reconexión de sesiones (no re-pair). SIGKILL → huérfanos → guard
   `/proc`.
5. Tope alcanzado: `409 {reason:'cap_reached'}` con mensaje claro ("Ya hay el máximo de
   sesiones vinculadas…").

## 5. Seguridad — checklist mapeada

| # | Control | Dónde |
| --- | --- | --- |
| S1 | Kill switch | `config.waBridge.enabled`; `canLink` 503; boot sin respawn; poller idle |
| S2 | Ventana temporal en zona del retiro; intentos auditados | `waBridgeService.getLinkWindow` + audit `WINDOW_DENIED` |
| S3 | Whitelist JID server-side en la ingesta (función pura; grupos y no-caminantes fuera; normalización de ambos lados; índice recalculado por ciclo) | `waBridgePoller.filterChats` + `getWalkerPhoneIndex` |
| S4 | Read-only estructural (sin `send` en el código; `--read-only` en lecturas; `--presence-mode quiet`) | `wacliClient` + spawns del supervisor |
| S5 | RBAC doble (catálogos types+web; rutas permiso+retiro; sala socket con permiso; QR/phone solo al dueño) | rutas §2 + realtime §2 + migration seeds |
| S6 | Consentimiento exigido server-side | `POST /link` |
| S7 | Auditoría de transiciones (link_start/linked/unlinked/purged/sync_error rate-limited/window_denied) | `domainAuditService` |
| S8 | XSS: solo `{{ }}`; sin IA | `WaChatThread.vue` |
| S9 | Higiene de procesos: argv-array, sin shell, env sanitizado, 0700, timeout+SIGKILL, guard de huérfanos, backoff con tope | `wacliClient` + `waBridgeSupervisor` |
| S10 | Retención con logout + `rm -rf` + cascade; corre con bridge apagado | `waBridgeRetentionService` |
| S11 | Topes de store e historial (`--max-messages`, `--max-db-size`, `--history-days`) | spawns del supervisor |
| S12 | `linkedPhone` nunca sale hacia terceros | controller (GET links/status) |

## 6. Upgrade futuro (documentado, no implementado)

Ingesta en vivo por webhook de wacli: `sync --webhook http://127.0.0.1:<puerto>/…/
--webhook-secret <hmac> --webhook-events message --webhook-allow-private` + endpoint local
del API que valida el HMAC. Elimina la latencia del polling. Requiere endpoint nuevo (no
expuesto por nginx) y reconciliación de respaldo para eventos perdidos durante reinicios del
API.

## 7. Presupuesto de RAM (medición 2026-11-05)

2 sesiones × ~40 MB (hijos sync) + picos transitorios de one-shots (~30 MB) ≈ 80-170 MB,
contra ~323 MB libres hoy → margen ≥150 MB. Arrancar con `WA_BRIDGE_MAX_SESSIONS=2` en prod;
subir a 3 solo tras 48 h de medición. Swap 2 GB como colchón.
