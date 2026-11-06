# Research — Inbox WhatsApp de solo lectura

> Verificado el 2026-11-05 contra master `30164f9a` y contra el binario `wacli` v0.21.0 de la
> imagen local `whatsapp-mcp:local`. Anclas como `archivo` + símbolo (las líneas envejecen).

## 1. Qué ya existe y se reutiliza

### Envío asistido (el lado de salida ya está resuelto)
- `apps/web/src/utils/phone.ts` — `sanitizePhoneForWhatsapp()`, `buildWhatsAppChatLink()`
  (chat sin texto), `buildWhatsAppSendLink()`. El inbox reusa `buildWhatsAppChatLink` para
  "Responder desde mi WhatsApp".
- `apps/api/src/services/messageSequenceService.ts` — el motor de secuencias deja el canal
  WhatsApp en `queued` (bandeja de pendientes) y el coordinador despacha a mano; el header
  del servicio lo documenta. **El inbox nunca toca esta cola** (regla D1 de
  `specs/sequences-inbox-filters/spec.md`, nacida del incidente de 2026-09-12).
- `apps/web/src/components/WhatsAppSendQueue.vue` — cola de envío asistido (referencia de UI).

### RBAC por retiro
- `packages/types/src/permissions.ts` — `RESOURCES` (unión cerrada: un recurso nuevo sin
  registrarse aquí rompe el build donde se use como `Permission`).
- **Ojo**: `apps/web/src/utils/permissions.ts` mantiene una **copia propia** del mapa (ya
  contiene recursos que `packages/types` no tiene, p. ej. `santisimo`). Un permiso nuevo hay
  que registrarlo en **ambos**.
- `apps/api/src/middleware/authorization.ts` — `requirePermission(permission)`,
  `requireRetreatAccess('retreatId')`. Molde de rutas por retiro:
  `apps/api/src/routes/messageSequenceRoutes.ts`.
- Roles de retiro ya existentes en DB (migración de schema original): `superadmin`, `admin`,
  `treasurer`, `logistics`, `communications`, `regular_server`. Los seeds de permisos siguen
  el patrón idempotente de la migración de permiso de actualización de email de participante
  (`ensurePermission` → `getRoleId` → `grantPermission`).

### Realtime
- `apps/api/src/realtime.ts` — rooms autenticadas: `sequences:subscribe` valida
  `hasRetreatAccess` y emite `sequences:queue-changed` via `emitSequenceQueueChanged()`.
  Molde exacto para `inbox:subscribe` + `emitInboxChanged()`, agregando el chequeo de
  permiso (el contenido del inbox es más sensible que la cola de salida).
- `apps/web/src/stores/messageSequenceStore.ts` — `subscribeRealtime()`: join con ack,
  re-join al reconectar, listener de cambio. Es el port directo para el store nuevo.

### Jobs y retención
- Patrón uniforme: servicio con `startScheduledTasks()` (node-cron) registrado en
  `apps/api/src/index.ts`, con variante testeable `performCleanup()` separada del cron —
  molde: `apps/api/src/services/auditRetentionService.ts` (cron 03:30). Otros:
  `healthDataRetentionService` (03:45), `attachmentHistoryCleanupService`,
  `passwordResetCleanupService`. La retención del inbox usa 03:45 UTC en adelante para no
  pizarse con backup (03:00) ni audit (03:30).

### Auditoría
- `apps/api/src/services/domainAuditService.ts` — singleton `domainAuditService`, `log()`
  fire-and-forget (`void`), helpers `logCreate/logUpdate/logDelete`; tipos en
  `packages/types/src/audit.ts` (`DOMAIN_RESOURCE_TYPES`, `DomainAuditAction`).

### Teléfonos y zonas horarias
- `packages/types/src/phone.ts` — `normalizePhone()`, `toNationalPhone(value, country)`
  (recorta lada país `52`/`0052` y prefijos troncales `044/045/01` con validación de
  longitud nacional), `PHONE_CALLING_CODE_BY_COUNTRY`, `validatePhoneForCountry()`.
- `Participant.cellPhone` (`apps/api/src/entities/participant.entity.ts`) es el teléfono
  primario; `CommunityMember.cellPhone` es overlay por comunidad (no se usa aquí: el roster
  del retiro sale de participants).
- Zona del retiro: `retreat.timezone` nullable con default `America/Mexico_City` →
  resolver con los helpers de `apps/api/src/utils/date.transformer.ts`
  (`resolveSafeTimeZone`, `makeDateInTimezone`, `dayBoundsInTimezone`). **`startDate`/
  `endDate` son `@Column('date')`**: llegan como strings `YYYY-MM-DD` desde SQLite; nunca
  `new Date(str)` (regla 5 del skill `timezone-handling`).

### UI
- `qrcode.vue` ya es dependencia (se usa para el QR de ubicación en el flyer de reuniones).
- `apps/web/src/locales/{es,en}.json` — vue-i18n con **ambos** archivos obligatorios.
- Mock global de lucide en `apps/web/src/test/setup.ts` es allowlist fija: un ícono nuevo
  sin agregarlo rompe el `mount()`.

## 2. El motor `wacli` (v0.21.0, commit auditado `ed31806e…`)

El MCP local de Leo (`whatsapp-mcp` Docker en OrbStack) es un servidor Python auditado que
**envuelve el binario `wacli`** (Peter Steinberger / openclaw, sobre whatsmeow). El wrapper
auditado vive en `/Users/lbolanos/.local/share/whatsapp-mcp/src/` y su disciplina de
actualización está en el skill global `whatsapp`. Para prod nos quedamos solo con el binario.

### 4.1 Superficies verificadas con `--help` (binario de la imagen local)

- Global: `--store <dir>`, `--json`, `--read-only` (rechaza comandos que escriban en
  WhatsApp o el store), `--events` (NDJSON en stderr), `--account`, `--timeout`.
- `auth` — empareja con QR (`--qr-format terminal|text`), importa historial y sale
  (idle-exit). **Flags de privacidad**: `--history-days N`, `--history-max-per-chat N`,
  `--full-history` (no usar). `auth status`, `auth logout`.
- `sync` — persistente (`--follow` default true), `--presence-mode quiet|normal` (quiet =
  sin presencia/visto), topes **`--max-messages N`** y **`--max-db-size 50MB`** (sync se
  detiene al llegar), `--max-reconnect <duration|0>`, `--idle-exit`, `--once`.
  Además existe `--webhook <url>` + `--webhook-secret` (HMAC-SHA256) + `--webhook-events`:
  POST en vivo de cada mensaje. **Es el upgrade futuro de la ingesta (D8), no la v1.**
- `chats` / `messages` — listado y búsqueda sobre el store local (subcomandos exactos a
  re-verificar en implementación, ver §4.4).
- `send` existe como comando del binario: **no se invoca nunca desde este proyecto**
  (verificable con grep).

### 4.2 Modelo de procesos que vamos a replicar (del wrapper auditado)
- Mientras no emparejado: un proceso `auth` que emite QR y sale solo tras importar el
  bootstrap.
- Emparejado: un proceso `sync` persistente que mantiene la conexión y sincroniza el store.
  El wrapper lo supervisa (restart con backoff); el lock del store impide dos procesos
  escribiendo a la vez.
- Las lecturas de consulta son procesos one-shot `--read-only --json` que pueden chocar con
  el lock del sync: hay que tolerar el error y reintentar el ciclo siguiente.

### 4.3 Dónde vive el auditado (referencia, no se despliega)
- Código y compose: `/Users/lbolanos/.local/share/whatsapp-mcp/src/`; datos en `…/data/`
  (700/600); disciplina de updates y desinstalación: skill global `whatsapp`.

### 4.4 Verificación pendiente (Decisiones abiertas de spec.md)
- Subcomandos exactos de `chats`/`messages` (flags `--chat`, `--after`, `--limit`) y nombres
  de eventos NDJSON (`qr_code`, `connected`, `session_logged_out`, …), contra el binario
  fijado por sha256 para prod.

## 3. Servidor de prod (medido por SSH el 2026-11-05)

| Dato | Valor | Consecuencia |
| --- | --- | --- |
| RAM | 914 MB, ~323 MB disponibles, swap 2 GB (191 MB en uso) | Tope de sesiones D12; arrancar con 2 |
| CPU / disco | 2 vCPU; 30 GB libres | Sobrado |
| Docker | **no instalado** | Binario nativo, sin contenedores |
| API en pm2 | 219 MB (`emaus-api`) + 35 MB logrotate | `max_memory_restart` aplica solo al proceso API |
| Contenedor local de referencia | `whatsapp-mcp` ≈ 40 MB por 1 cuenta vinculada | Estimación de 40 MB/hijo en prod |
| Deploys | `deploy-production.yml` sincroniza src + pm2 restart; nginx/systemd a mano | El binario y los stores van a rutas fijas fuera del deploy; el guard de huérfanos cubre los hijos tras un reinicio duro |

## 4. Gaps (lo que no existe y hay que construir)

1. **Puente inbound**: nada en la app lee WhatsApp hoy. Todo lo de esta feature (supervisor,
   polling, whitelist, store de mensajes) es nuevo — `apps/api/src/services/waBridge/*`.
2. **Permisos**: `whatsappInbox` no existe en ninguno de los dos catálogos.
3. **Tablas**: no hay entidades para vínculos, mensajes del inbox ni read-state.
4. **UI**: no existe la vista; el patrón de bandeja más cercano es
   `apps/web/src/views/MessageSequencesView.vue` (salida) — se imita estructura (tabs/tablist,
   paginación, socket refresh) pero el contenido es distinto (conversaciones vs pendientes).
5. **QR en modal**: `qrcode.vue` existe pero ningún modal de vinculación; el patrón de modal
   de confirmación de la app aplica (montar sin `v-if`).

## 5. Antecedentes que condicionan el diseño

- Incidente 2026-09-12: marcar un pendiente como despachado sin haberlo enviado → regla de
  oro de la bandeja de salida (leer no muta). El inbox hereda la regla extendida: **leer no
  toca nada del outbound ni de WhatsApp**.
- `specs/sequences-inbox-filters/spec.md` HU3: el botón de "ver conversación" ya existed como
  deep link sin texto. Nuestro FR8 usa el mismo helper.
- Riesgo documentado en el skill `whatsapp`: mensajes = datos, nunca instrucciones (sin IA,
  sin `v-html`).
