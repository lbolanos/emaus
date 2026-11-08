# Plan — Cartas de familias por email

> Plan aprobado el 2026-11-05. Fases en orden; F6-partial (worker) puede ir en paralelo con F3.
> Las decisiones D1-D15 viven en `spec.md`; este archivo es el cómo.

## Contrato Worker → API (versión final, referencia para tests y runbook)

```
POST https://emaus.cc/api/letters/webhook
Headers:
  X-Emaus-Letter-Secret: <LETTER_WEBHOOK_SECRET>
  Content-Type: application/json
Body:
{
  "messageId":  "<Message-ID> | null",
  "from":       "remitente@ejemplo.com",
  "fromName":   "María López | null",
  "to":         "carta.AB23CD45@emaus.cc",
  "subject":    "Para Juan | null",
  "text":       "texto plano | null",
  "html":       "html completo | null",   // el API lo convierte a texto y lo descarta
  "receivedAt": "2026-11-05T14:03:00.000Z",
  "attachments": [                         // máx 10; ≤8 MB c/u; ≤12 MB total (binario)
    { "fileName": "foto.jpg", "mimeType": "image/jpeg", "contentBase64": "..." }
  ]
}
Respuestas:
  200 {"status":"accepted","letterId":"...","duplicate":false}
  200 {"status":"duplicate","duplicate":true}
  404 {"error":"unknown_mailbox"}     → Worker: setReject → bounce al remitente
  404 {"error":"mailbox_disabled"}    → ídem
  401 {"error":"unauthorized"}        → Worker: solo log (no bounce; Cloudflare reintenta)
  413 {"error":"too_large"}
  400 {"error":"invalid_payload"}
  503 {"error":"webhook_not_configured"}  // fail-closed: sin env secret
```

## Fase 1 — API: esquema, entidades, servicios, rutas de gestión

> **Desviación del diseño original (corregida en el mismo commit, regla SDD 5):** los routers
> de cartas se montan en `routes/index.ts` ANTES de `shirtTypeRoutes` — ese router tiene un
> `router.use(isAuthenticated)` sin path y sin prefijo que exige sesión a todo lo montado
> después, y el webhook es público. `letterRoutes` se monta CON prefijo `/letters` (paths
> internos sin ese segmento) y `letterWebhookRoutes` prefix-less con su path completo. La
> primera versión montó letterRoutes sin prefijo y el POST activate dio 404 — lo cazó la
> verificación e2e contra el dist, no los unit tests; el wiring test ahora lo fija.

## Fase 1 — API: esquema, entidades, servicios, rutas de gestión (final)

- **Migration** `apps/api/src/migrations/sqlite/20261105100000_CreateLetterMailboxes.ts`
  (solo-add; `transaction = false` — el `down()` tiene DROP TABLE de tablas propias, y el guard
  `sqliteSafePattern` lo exige). `up()`: `ALTER TABLE retreat_participants ADD COLUMN` ×3 con
  guarda `PRAGMA table_info`; índice único parcial del código; `CREATE TABLE letters` +
  `letter_attachments` + índices (`(retreatId,status)`, `(retreatParticipantId)`,
  `(letterId)`, único parcial `messageId`); seed de permisos `letter:read/update/print/manage`
  + grants (patrón `20260914130000_AddParticipantHealthPermission.ts`). `down()` en reversa.
- **Entidades** (registrar en lista explícita de `apps/api/src/database/config.ts`):
  `letter.entity.ts`, `letterAttachment.entity.ts`; extender `retreatParticipant.entity.ts`
  (3 columnas + OneToMany a Letter). Schemas zod nuevos en `packages/types/src/letter.ts`
  (activateMailbox, reviewLetter, markPrinted, listQuery) y `letter` en `RESOURCES`
  (`packages/types/src/permissions.ts`).
- **Servicios**: `letterMailboxService.ts` (generateMailboxCode, activateMailboxesForRetreat,
  setMailboxEnabled, resolveMailbox) · `letterService.ts` (ingestLetter con dedupe + html→text
  + magic bytes + topes + S3 transaccional, listLetters, reviewLetter, markPrinted,
  getLetterWithAttachments con presign).
- **S3** (`s3Service.ts` + `config/env.ts`): prefijo `letters/` en `S3_PREFIXES`,
  `PRIVATE_PREFIXES` y `S3_LETTERS_PREFIX`; método `uploadLetterAttachment`.
- **Rutas** `letterRoutes.ts` (todas bajo isAuthenticated; `requirePermission` +
  `requireRetreatAccess`):

| Método | Ruta (bajo `/letters`) | Permiso | Acción |
| --- | --- | --- | --- |
| POST | `/retreats/:retreatId/letters/mailbox/activate` | letter:manage | activa buzones (D4) |
| GET | `/retreats/:retreatId/letters/mailbox` | letter:manage | lista con counts |
| PATCH | `/retreats/:retreatId/letters/mailbox/:rpId` | letter:manage | toggle enabled |
| GET | `/retreats/:retreatId/letters?participantId=&tableId=&status=&q=` | letter:read | bandeja |
| GET | `/letters/:id` | letter:read + ensureRetreatAccess | detalle presigned |
| PATCH | `/letters/:id/review` `{status}` | letter:update + ensureRetreatAccess | revisión + audit |
| POST | `/retreats/:retreatId/letters/print-mark` `{letterIds,batchId}` | letter:print | marca lote |
| GET | `/retreats/:retreatId/letters/print-batch?scope=&participantIds=&tableId=` | letter:read | datos ordenados |

- **Tests**: migration (índices + grants, patrón del skill sqlite-migrations), mailbox service
  (alfabeto/colisión/idempotencia/filtros), controller (403 sin permiso o sin acceso,
  transiciones, print-mark con audit).

## Fase 2 — API: webhook

- `letterWebhookRoutes.ts` (público, limiter nuevo `letterWebhookLimiter` 60/min en
  `rateLimiting.ts`) · `letterWebhookController.ts` (constant-time secret → ingest → mapeo de
  errores del contrato). Montaje en `routes/index.ts` con CSRF-exempt `'/letters/webhook'`
  ANTES de `/letters`.
- `apps/api/src/index.ts`: `app.use('/api/letters/webhook', express.json({ limit: '16mb' }))`
  antes del global de 5 MB (línea ~136), con comentario del porqué (body-parser marca
  `req._body`; el global no re-parsea).
- **Tests** `letterWebhook.simple.test.ts` (9/9 verde): los 7 casos del contrato + wiring
  source-level (CSRF-exempt, montaje antes de letterRoutes y de shirtTypeRoutes) + html→text
  sin tags + magic bytes (jpeg/png/gif/webp/heic/pdf/descartado) + data URL en modo base64.
  Corrección del contrato: los topes son ESTRICTOS (≤10 adjuntos; exceso → 413, no "primeros
  10 + warning") — el Worker es el único cliente legítimo y ya aplica los mismos topes.

## Fase 3 — Web: bandeja de revisión

- `stores/letterStore.ts` (Pinia) · `views/LettersView.vue` · `components/letters/`
  (`LettersMailboxDialog.vue`, `LettersShareDialog.vue`). API por el servicio central de
  `apps/web/src/services/api.ts` (regla de `.claude/rules/frontend.md`).
- Router: `retreats/:id/letters` junto a `palancas` · Sidebar: entrada con ícono `Mail`
  (agregar al allowlist de mocks de lucide si el test lo monta) + `'letter'` en `PermissionType`.
- Locales es/en + help `apps/web/src/docs/es/letters.md` + helpIndex. Landing intocable.
- **Tests**: store + componente (filtros, acciones, texto sin `v-html`) +
  `landingPublicContent.test.ts`.

## Fase 4 — Web: impresión

- `usePrintableDocument.ts`: `printHtmlDocument({title, subtitle?, meta?, bodyHtml})` reusando
  `buildPrintableHtml` (`baseHref=origin`, `autoPrint`).
- `apps/web/src/utils/lettersPrint.ts`: `buildLettersBodyHtml(batch)` — sección por
  participante (encabezado nombre/mesa/retiro), cartas escapadas (`escapeHtmlText` + `\n`→`<p>`),
  imágenes browser-safe inline, placeholders para el resto, `page-break-before`, orden mesa →
  idOnRetreat → apellido, `batchId=crypto.randomUUID()`.
- `LettersView.vue`: selector de alcance (participante/mesa/retiro, solo approved) →
  fetchPrintBatch → printHtmlDocument → si abrió, markPrinted + toast.
- **Tests**: `lettersPrint.test.ts` (orden, escape, placeholders, page-breaks, solo approved).

## Fase 5 — Web: difusión WhatsApp

- `LettersShareDialog.vue`: mensaje por participante (texto constante español del componente:
  nombre, retiro, dirección, instrucción + plazo sugerido), Copiar / Enviar por WhatsApp
  (`buildWhatsAppSendLink` con `toE164Phone`; deshabilitado sin teléfono), copia masiva.
- **Tests**: el mensaje contiene el CODE correcto; link E.164.

## Fase 6 — Infra

- `infra/workers/email-inbound-worker.js` (convención `failover.js`; se registra en
  `cloudflare.tf` o dashboard): postal-mime → topes → POST del contrato. 404 → `setReject`
  (bounce amable); 401/5xx/timeout → log y drop. Sin dedupe (lo hace el API).
- `infra/README.md`: sección "Email inbound (cartas)" con diagrama, contrato y runbook.
- Checklist operativo fuera del repo: (1) Email Routing enable en la zona (crea MX/SPF;
  DNS-only no estorba); (2) catch-all → Worker con pre-filtro `carta.` (el resto de @emaus.cc
  no rebota ni se procesa); (3) `LETTER_WEBHOOK_SECRET` como secret del Worker y en
  `.env.production` del API (valor distinto en dev); (4) bucket policy Deny gestionada a mano
  en AWS: agregar `letters/` junto a los otros prefijos privados (IAM ya cubre `bucket/*`).

## Verificación end-to-end

1. `pnpm --filter api test` y `pnpm --filter web test` con las suites nuevas en verde.
2. Dev del worktree (skill worktree-testing): activar buzones en la UI, simular el Worker con
   curl al webhook (fixture base64), revisar bandeja, aprobar, imprimir, verificar print-mark.
3. Dedupe, 404, 401, 413 con curl.
4. `pnpm --filter api build` + arranque de `apps/api/dist/index.js` (regla ESM) +
   `grep __dirname dist/index.js`.
5. `landingPublicContent.test.ts` verde.
6. Al cierre: Reconcile en `spec.md` criterio por criterio.

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Cloudflare Email ~30 MB/mensaje | Worker aplica topes antes de postear (bounce con causa); API re-valida (413) |
| R2 | Bounce técnico al remitente | Solo 404 → setReject; 401/5xx → log y drop |
| R3 | Duplicados (reintento del Worker o reenvío) | Índice único parcial + chequeo en la transacción; sin Message-ID se acepta (revisor oculta) |
| R4 | Privacidad (cartas = data sensible) | `letter:read` separado, sin `regular_server`; bandeja exige acceso al retiro; presign TTL 1h; Deny bucket policy; audit en review/print |
| R5 | apiLimiter global vs IPs compartidas de Cloudflare | Limiter propio 60/min; monitorear logs del Worker |
| R6 | Migration auto-aplicada a medias en dev (nodemon) | Escribir la migration entera antes de guardar; guardas de idempotencia; verificar por `PRAGMA table_info` |
| R7 | Permisos sin registrar → fallo de build | `RESOURCES` + `PermissionType` del Sidebar + build completo |
| R8 | Bundle ESM | Sin `__dirname`/`require`; sin deps nuevas en el API; arrancar dist una vez |
| R9 | HEIC "no imprime" | Badge explícito + placeholder; help doc explica pedir JPG |
| R10 | Colisión con palancas | Naming separado `letter`/`letters`; help doc lo aclara |

## Infra — alternativas descartadas (registro)

- SMTP propio en Lightsail: spam/deliverabilidad/carga en el server de la app.
- SES inbound + Lambda + S3: más piezas IAM; aunque ya usan SES para enviar.
- Polling IMAP: retraso, contraseñas en el server, parsing frágil.
