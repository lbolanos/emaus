# Research — Cartas de familias por email

> Verificado en código el 2026-11-05 (worktree `letters-email`, base `master` @ 30164f9a).
> Cada ancla: archivo + símbolo. Repo público: sin PII ni credenciales.

## 1. Email — lo que existe y lo que no

- **Envío saliente**: `apps/api/src/services/emailService.ts` (clase `EmailService`, nodemailer
  sobre SMTP de SES, `email-smtp.us-east-1.amazonaws.com:465`). Segundo mailer propio en
  `userManagementMailer.ts`. Variables: `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` + candado dev
  `realEmailsBlockedInDev()`.
- **Recepción (inbound): NO EXISTE NADA.** Sin `mailparser`/`simpleParser`, sin endpoints de
  webhook (la palabra no aparece en routes/controllers/index.ts), sin IMAP. Cualquier inbound se
  construye de cero.
- **Dependencias de email en `apps/api/package.json`**: solo `nodemailer ^6.9.7`. Sin SDK SES,
  sin colas. El cron es `node-cron`.

## 2. Endpoints públicos y su patrón

- Patrón por router: rutas públicas primero, luego `router.use(isAuthenticated)`
  (ejemplo completo: `apps/api/src/routes/santisimoRoutes.ts` §40-64).
- Excepciones CSRF: lista pasada a `applyCsrfProtectionExcept` en `apps/api/src/routes/index.ts`
  (patrones glob tipo `/santisimo/public`).
- Rate limiters en `apps/api/src/middleware/rateLimiting.ts` (16 exportados; patrón `skip` en dev
  con `SKIP_RATE_LIMIT=true`; keyGenerator por IP o por userId).
- reCAPTCHA v3 disponible (`recaptchaService`) — no lo necesitamos: el remitente es un MTA.

## 3. Identificación pseudo-secreta de participantes

- Dos patrones coexistentes: token opaco aleatorio en DB (`Participant.dataDeleteToken`,
  `CommunityMeeting.albumToken`: `crypto.randomBytes().toString('hex')`) y token cifrado
  stateless AES-256-GCM (`apps/api/src/utils/santisimoInviteToken.ts`, clave derivada de
  `INVITE_TOKEN_SECRET`).
- `Participant` NO tiene `publicCode`. El grano (retiro, participante) vive en
  `retreat_participants` (`retreatParticipant.entity.ts`): `type` ('walker'|'server'|'waiting'|
  'partial_server'), `tableId`, `idOnRetreat`, `isCancelled`, `familyFriendColor`.
- Soft-delete real: `Participant.dataDeletedAt` (no hay status 'deleted').

## 4. Storage S3 y adjuntos

- `apps/api/src/services/s3Service.ts` singleton: `PRIVATE_PREFIXES` (línea 26) =
  `['retreat-memories/', 'community-meetings/', 'community-members/']`; `presignPrivateUrl()`
  (línea 454) firma al leer solo bajo prefijos privados y es no-op en modo base64.
  `getSignedReadUrl(key)` TTL 3600 s con caché de 500.
- Prefijos también viven en `apps/api/src/config/env.ts` (`S3_*_PREFIX`, línea 19-22) y se
  exponen en `config.aws.s3Prefixes` (línea 77).
- **Subidas: base64 dataUrl en JSON** (no multipart; sin multer). Ejemplos:
  `flyerAssetController.ts` (storeFlyerAsset), `responsabilityAttachmentController.ts`.
- **Body JSON global: 5 MB** (`apps/api/src/index.ts:136`, `express.json({ limit: '5mb' })`).
- Bucket policy Deny de prefijos privados gestionada a mano en AWS (no está en `infra/*.tf`;
  verificado: cero referencias a `retreat-memories` en terraform). El IAM del rol cubre
  `bucket/*` — prefijo nuevo no exige cambio IAM (corrección sobre la hipótesis inicial).
- Lectura en el web: el API presigna al armar DTO; el web solo `<img :src>` — no hay helper de
  presign en `apps/web`.

## 5. Impresión

- `packages/utils/src/printableDocument.ts`: `PRINT_STYLESHEET` (A4, paleta), `escapeHtmlText`
  (línea 254), `buildPrintableHtml(data, options)` (línea 282) — **`data.bodyHtml` acepta HTML
  directo** (línea 227, interpolado en 347), con `baseHref`, `autoPrint` (el script espera
  imágenes antes de `window.print()`), `omitRunningHead`, `relaxedLeading`.
- Composable: `apps/web/src/composables/usePrintableDocument.ts` — `printMarkdownDocument`
  abre ventana y escribe el HTML. Ruta jsPDF (browser) para PDFs con marcadores:
  `apps/web/src/utils/markdownToPdf.ts`. No hay puppeteer en el API (se eliminó: 345 MB en
  Lightsail).
- Roster con selección por lotes: `apps/web/src/components/ParticipantList.vue`.

## 6. WhatsApp / difusión

- `apps/web/src/utils/phone.ts`: `buildWhatsAppSendLink(phone, message, country)`,
  `buildWhatsAppChatLink`, `toE164Phone` (lada por país, default MX), `sanitizePhoneForWhatsapp`.
- UX de referencia: `apps/web/src/components/WhatsAppSendQueue.vue` (clipboard + `window.open`,
  1 clic = 1 envío).
- Motor de variables global (`replaceAllVariables` en `packages/utils`) NO se toca en v1:
  el texto de difusión vive en la vista nueva.

## 7. Autorización y permisos

- `requirePermission(permission)` (`authorization.ts:586`), `requireRetreatAccess(retreatIdParam,
  source)` (línea 653, lee `params` o `body`), `ensureRetreatAccess` para chequeos dentro de
  controllers. Precedente de permiso específico por recurso: `participant:identity:update`.
- Catálogo: `packages/types/src/permissions.ts` — `RESOURCES` es mapa tipado cerrado (línea 4,
  13 recursos); `Permission = ResourcePermission<Resource>`. Hay recursos sembrados en DB que no
  están en el mapa (`santisimo:read` en `santisimoRoutes.ts:68`), pero registrar en `RESOURCES`
  evita el fallo de build conocido (memoria: catálogo cerrado).
- Roles reales (migraciones): `superadmin`, `admin`, `communications`, `logistics`,
  `region_admin`, `regular_server`, `treasurer`.
- **Patrón de seed de permisos**: migration `20260914130000_AddParticipantHealthPermission.ts`
  — `INSERT OR IGNORE` en `permissions` + grants explícitos por rol en `role_permissions` +
  `down()` que borra al revés. `superadmin` NO hereda permisos nuevos automáticamente.
- Sidebar: `apps/web/src/components/layout/Sidebar.vue` — union `PermissionType` (línea 557) y
  entrada de `palancas` (línea 1037) como ejemplo de ítem logístico de retiro.

## 8. Palancas (colisión conceptual)

`PalancasView.vue` es control logístico de cartas físicas pedidas/recibidas
(`palancasReceivedCount` en `retreat_participants`). NO guarda contenido. Este feature es nuevo
de cero y debe no tocarse: naming separado (`letter` vs `palancas`).

## 9. Infra Cloudflare

- `infra/cloudflare.tf` ya gestiona un Worker (`cloudflare_workers_script.failover` desde
  `infra/workers/failover.js`) + routes + bot management + ruleset de rate limit para auth.
- La zona `emaus.cc` está en Cloudflare con DNS en modo DNS-only desde 2026-09-14 (decisión
  fija; no reactivar proxy). Email Routing es independiente del proxy naranja: crea MX/SPF
  propios y funciona igual.

## 10. Testing

- Backend Jest con SQLite in-memory; `MockEmailService` en `apps/api/src/tests/test-utils/`.
- La DB de test sincroniza desde entities SIN índices: los índices de migrations hay que
  instalarlos en el `beforeAll` corriendo la migration (skill sqlite-migrations).
- `clearTestData()` no limpia `participants` (lista en singular) — limpiar a mano lo que cubra
  un índice único.
- Web Vitest con `happy-dom` + mocks globales (`apps/web/src/test/setup.ts`): mock de `@repo/ui`
  acepta cualquier prop; mock de lucide es allowlist (ícono nuevo → hay que agregarlo).
- Guard de contenido público: `apps/web/src/locales/__tests__/landingPublicContent.test.ts`.
- Una sola corrida de Jest a la vez (SQLite compartida).
