# Security review del push CRM — hallazgos y fixes (2026-06-16)

**Alcance revisado:** el push pendiente del feature *CRM de mensajería* (motor de
secuencias, pagos/deudas/paz-y-salvo, galería de recuerdos + S3, sesión de 30
días, IA chat, migraciones y UI Vue) — 213 archivos, ~23.6k líneas.

Revisión por dominios (control de acceso, motor de envío, pagos/S3, auth/infra,
migraciones/XSS). Veredicto: **0 críticos, 5 HIGH, 6 MEDIUM, varios LOW**. Este
documento registra los **HIGH cerrados** y los pendientes.

## HIGH cerrados

### 1–2. IDOR cross-retiro en lectura de pagos y deudas

`payment:read`/`payment:list` son permisos **globales**; los roles que los tienen
(`treasurer`, `admin`, `logistics`, `communications`) están scopeados a sus
retiros, pero el permiso se evaluaba agregado. Las **mutaciones** ya usaban
`ensureRetreatAccess`; las **lecturas** quedaron sin scope → un usuario de un
retiro podía leer pagos/deudas de otros.

**Fix:**
- `middleware/authorization.ts`: nuevo helper `filterByRetreatAccess(userId, rows)`
  — filtra registros a los retiros accesibles (superadmin recibe todo).
- `paymentController.ts`:
  - `getAllPayments`: no-superadmin exige `retreatId` válido (`ensureRetreatAccess`);
    sin él → **400** (antes volcaba todo el sistema). Superadmin sin filtro → 200.
  - `getPaymentById`: corta con `ensureRetreatAccess(payment.retreatId)`.
  - `getPaymentsByParticipant`: `filterByRetreatAccess`.
- `participantDebtController.ts` → `getDebtsByParticipant`: `filterByRetreatAccess`.
- UI: `PaymentManagement.vue` ya no pide pagos sin retiro seleccionado.

**Tests:** `payment.read.authz.integration.test.ts`,
`participantDebt.read.authz.integration.test.ts`.

### 3. IDOR en CRM: mutar participantes de otro retiro

Las rutas CRM validan acceso al `:retreatId` del path, pero `participantId` llega
aparte y no se verificaba el vínculo. `do-not-contact` (flag global del
participante), `createTask` y `upsertFollowUp` aceptaban `participantId` ajeno.

**Fix:** `crmService.participantBelongsToRetreat(participantId, retreatId)` (vía
`RetreatParticipant`); `crmController` responde **404** si el participante no
pertenece al retiro, en `setDoNotContact`, `createTask` y `upsertFollowUp`.

**Tests:** `crmParticipantScope.integration.test.ts`.

### 4. Race de doble envío en el motor de secuencias

`processDue` seleccionaba filas `pending` y hacía múltiples `await` antes de
marcar `sent`, sin claim atómico. Alcanzable concurrentemente desde 3 orígenes
(cron horario, `POST .../run`, fire-and-forget del alta) → correo duplicado.
Además `runNow` llamaba `processDue()` **sin** `retreatId`, procesando todos los
retiros aunque la ruta validara solo el propio.

**Fix:** `messageSequenceService.ts`:
- Claim atómico por fila: `UPDATE ... SET status='processing' WHERE id=? AND
  status=<leído>`; si `affected=0`, otra corrida ya la tomó → se salta. Estado
  `processing` añadido al union (sin migración: la columna es `varchar`).
- `processDue(now, limit, retreatId?)` filtra por retiro; `runNow` y
  `runForRetreat` pasan su `retreatId`. El cron sigue global.

**Tests:** `messageSequenceProcessScope.test.ts` (scope + no-reproceso).

### 5. Sesión rolling de 30 días sin techo absoluto ni revocación

Ver documento dedicado: [`session-duration-config.md`](./session-duration-config.md).
Resumen: techo absoluto (90 días, configurable), revocación de sesiones al
cambiar/resetear contraseña, y clamp de los ENV de días.

**Tests:** `security/sessionExpiry.test.ts`,
`services/revokeUserSessions.integration.test.ts`.

## Verificación

- **Tests automatizados:** las suites listadas arriba (todas verdes), además de
  las preexistentes de authz de pagos/deudas y del motor de secuencias.
- **E2E en runtime (2026-06-16):** verificado contra la app corriendo —
  revocación de sesión al cambiar contraseña (la otra sesión queda
  `authenticated:false`, la actual se conserva), lecturas de pagos no rotas, y
  carga correcta de `PaymentManagement.vue` (pestañas Saldos/Pagos). El IDOR de
  lectura no es reproducible e2e con un usuario superadmin (bypass) → cubierto por
  los tests de integración con `hasRetreatAccess` mockeado por retiro.

## MEDIUM cerrados (2026-06-16)

### M1. HTML injection en emails salientes vía campos del participante

Los valores de las variables (`{participant.firstName}`, notas — auto-reportados)
se interpolaban sin escape y el resultado iba como `html` del correo a terceros
(invitador/líder) → phishing/inyección de enlaces.

**Fix:** `@repo/utils` — helper `escapeHtmlValue` + flag `escapeHtmlValues` en
`replaceAllVariables`/`replace*Variables` (se escapan los **valores**, no el
template, que es markup de confianza). `messageSequenceService` resuelve el HTML
del email con escape; WhatsApp (texto plano) y el preview de UI (DOMPurify) no lo
activan. **Tests:** `messageSequenceEmailEscaping.test.ts`.

### M2. Stored XSS `javascript:` en URL de canción

`z.string().url()` aceptaba `javascript:`/`data:`, luego renderizado en `:href`.

**Fix:** `packages/types` — `httpUrlSchema` (refine `^https?://`) aplicado a
`createRetreatMemorySongSchema.url`. **Tests:** `retreatMemorySchemas.test.ts`.

### M3. Upload de foto base64 sin validación (modo default)

La ruta `POST /:id/memory-photos` no aplicaba `validateRequest` y `photoData` se
guardaba sin acotar tipo/tamaño (DoS de almacenamiento / contenido no-imagen).

**Fix:** `createRetreatMemoryPhotoSchema` exige data-URI de imagen y cota de
tamaño (~4MB), y la ruta lo valida con `validateRequest` (control de frontera; es
el único caller de `addPhoto`). **Tests:** `retreatMemorySchemas.test.ts`.

## LOW cerrados (2026-06-16) + ajuste de payload

### Ajuste — body grande devuelve 413 (antes 500)

`express.json` rechazaba bodies grandes con un error que el `errorHandler` mapeaba
a 500 genérico. Ahora: `errorHandler` mapea `entity.too.large`/status 413 a **413**
con mensaje claro, y el límite de `express.json` subió a **5mb** (las fotos de
recuerdos viajan como data-URI base64; el tamaño real de imagen se acota aguas
abajo). **Tests:** `middleware/errorHandler.test.ts`. **E2e:** body de 6MB → 413.

### L1. `assign` acepta `userId` sin validar pertenencia al retiro

`messageSequenceController.assign` mutaba antes de autorizar y aceptaba cualquier
`userId`. **Fix:** carga el mensaje (`getScheduledById`) → valida acceso del
llamante → valida que el `userId` asignado tenga acceso al retiro (400 si no) →
recién entonces asigna. **Tests:** `messageSequenceAssign.integration.test.ts`.

### L2. Sin rate-limit dedicado en `/api/ai-chat/stream`

**Fix:** `aiChatLimiter` (20 req/min por **usuario**) en `rateLimiting.ts`,
aplicado a `POST /ai-chat/stream`. Acota el costo de tokens del proveedor.

### L3. `db-pull.sh`: snapshot de prod world-readable en `/tmp`

**Fix:** `umask 077` + `chmod 600` del snapshot en el heredoc remoto (la copia
completa de la DB ya no nace legible por otros usuarios del host), y el log de
error usa nombre con `$$` (no fijo) con `trap` de limpieza.

### L4. `window.open(_blank)` sin `noopener,noreferrer`

**Fix:** tercer argumento `'noopener,noreferrer'` en `MessageSequencesView.vue`
(deep-link WhatsApp) y `MinuteByMinuteView.vue` (fallback de copia de enlace).

## Pendiente

| Sev | Hallazgo | Ubicación | Nota |
|-----|----------|-----------|------|
| MEDIUM | PII sensible enviada al LLM externo | `aiChatService.ts` | **Decisión de cumplimiento**, no código: confirmar DPA/zero-retention con el proveedor y minimizar la PII enviada por las tools. |
