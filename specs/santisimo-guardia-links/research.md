# Research: santisimo-guardia-links

Anclas verificadas contra `c8363d08` (master al abrir el worktree). Las líneas son andamio de
verificación; el identificador estable es el símbolo.

## Backend — dominio santisimo

- `apps/api/src/entities/santisimoSignup.entity.ts` — `participantId` columna plana nullable
  (sin `@ManyToOne`), además de `isAngelito`, `autoAssigned`, `cancelToken` unique, `ipAddress`.
  **La FK lógica ya existe: cero migración de schema para el signup.**
- `apps/api/src/entities/santisimoSlot.entity.ts` — `mealWindow`, `capacity`, `isDisabled`,
  índice único `(retreatId, startTime)`.
- `apps/api/src/entities/retreatParticipant.entity.ts` — tabla `retreat_participants`: fuente
  de membresía participante↔retiro para el GET del invite.
- `apps/api/src/routes/santisimoRoutes.ts` — sección pública en las primeras líneas
  (`/public/:slug`, `/public/:slug/signups`, `/public/signups/:token`) y
  `router.use(isAuthenticated)` como corte. Los endpoints nuevos van arriba de ese corte.
- `apps/api/src/controllers/santisimoController.ts` — `mapError` mapea `Santisimo*Error` a
  404/409; `publicCreateSignup` es el patrón de handler público (rate limit en la ruta,
  reCAPTCHA en el controller — el invite lo omite por decisión 6 de la spec).
- `apps/api/src/services/santisimoService.ts` — `publicSignup` (valida disabled/past/capacity
  y audita en `finally`), `cancelByToken`, `getPublicSchedule` (guard `isPublic &&
  santisimoEnabled`; el invite solo exige `santisimoEnabled` — decisión 5), repos en
  constructor.
- `apps/api/src/routes/index.ts` — montaje `/santisimo` y `applyCsrfProtectionExcept` con
  `'/santisimo/public'`: match por `startsWith` (`apps/api/src/middleware/routeCsrf.ts`), de
  modo que `/santisimo/public/invite/...` queda exento sin tocar la lista.
- `apps/api/src/middleware/rateLimiting.ts` — `publicParticipantLimiter` (10/h/IP).
- `apps/api/src/config.ts` — `session.secret` = `process.env.SESSION_SECRET` con random fallback
  solo en dev; prod hace fail-fast sin ella. `SESSION_SECRET` existe en el `.env` de dev.
- `packages/types/src/audit.ts` — `DomainAuditAction` (bloque `santisimo_signup.*` ~L143).
- `packages/types/src/santisimo.ts` — schemas Zod públicos/admin del santísimo.
- Membresía tipo servidor: `type='server'` en `retreat_participants` (mismo criterio que usa
  el picker de elegibles de `participantAvailabilityController`).

## Plantillas y WhatsApp — los 3 caminos

- `packages/utils/src/index.ts` — `ParticipantData`, `buildParticipantReplacements`
  (`dataDeleteUrl` es el precedente de URL-capability por participante), `getMockParticipant`,
  `getPublicWebUrl()` (lee `PUBLIC_WEB_URL`/`FRONTEND_URL`), `findEmptyVariables`.
- `apps/api/src/services/messageSequenceService.ts` — `resolveContent`:
  `retreatWithLinks` con `buildServerRegistrationLink(process.env.FRONTEND_URL || …)` es el
  patrón de inyección server-side; `hydrateParticipantForTemplateVariables` recarga datos por
  destinatario.
- `apps/web/src/components/MessageDialog.vue` — `updateMessagePreview` (resuelve con
  `replaceAllVariables`; pre-resuelve `nextMeetingDate` con fetch — patrón a imitar con el
  mapa `guardia-links`).
- `apps/web/src/components/WhatsAppSendQueue.vue` — `resolvedMessageFor` re-resuelve por
  destinatario; reset en el watcher de `open`; `Record` plano para el mapa (no `Map` en ref).
- `apps/web/src/components/BaseMessageTemplateModal.vue` — preview con
  `replaceAllVariables`; `participantVariables` (~L722-758) es el picker.
- Semilla WhatsApp texto plano: `apps/api/src/migrations/sqlite/20260914120000_FormatWhatsappMessageTemplates.ts`
  (patrón para la migración de M4).

## Frontend — vistas públicas

- `apps/web/src/router/index.ts` — `/santisimo/:slug` con `meta.requiresAuth:false`; el guard
  es opt-out (`requiresAuth !== false` exige auth). Vue Router 4 rankea segmento estático
  (`servidor`) sobre el param (`:slug`).
- `apps/web/src/views/PublicSantisimoView.vue` — plantilla visual (header oscuro, columnas por
  día, inputs nativos, estados loading/error/éxito) y consumición de query params en
  `onMounted`.
- `apps/web/src/services/api.ts` — grupo `santisimoApi` al final; regla del repo: nunca
  `fetch` directo.
- `apps/web/src/test/setup.ts` — allowlist del mock de lucide: todo ícono nuevo usado por la
  vista debe añadirse o el `mount()` de vitest rompe.

## Seguridad (verificado)

- CORS estricto bloquea Origins no allowlistados en prod (`apps/api/src/index.ts`): cubre la
  escritura cross-site contra el POST público sin CSRF.
- Auditoría pública existente: `SANTISIMO_SIGNUP_PUBLIC_SIGNUP` registra IP sin userId — el
  invite replica el patrón y **nunca** persiste el token ni la URL.
- El repo es público: ningún secreto versionado; la clave del token se deriva de env.
