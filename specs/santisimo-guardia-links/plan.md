# Plan: santisimo-guardia-links

Derivado de `spec.md` (R1-R8). Milestones cortos, cada uno con commit y verificación propia.
Concurrencia de jest: **una corrida a la vez**.

## M0 — worktree + specs SDD

- Branch `santisimo-guardia-links` + worktree `.claude/worktrees/santisimo-guardia-links`.
- `pnpm install` + copia de `apps/api/.env` (del main) + `pnpm --filter @repo/ui build` +
  `rm -rf apps/web/node_modules/.vite`.
- `spec.md`, `research.md`, `plan.md`, `tasks.md`.
- Commit `docs(specs): santisimo guardia links spec (M0)`.

**Verificación**: `git status` limpio tras el commit; `pnpm --filter @repo/ui build` verde.

## M1 — backend: token util + endpoints públicos del invite

- `apps/api/src/utils/santisimoInviteToken.ts` (R1) + test unitario puro.
- `packages/types/src/santisimo.ts`: `PublicSantisimoInviteSignupSchema` + tipos de respuesta.
- `packages/types/src/audit.ts`: acciones `santisimo_signup.invite_signup` / `.invite_cancel`.
- `santisimoService`: `getInviteData`, `inviteSignup`, `inviteCancel` (transacción, reemplazo
  único, errores `Santisimo*Error` existentes, audit).
- `santisimoController`: `publicGetInvite`, `publicInviteSignup`, `publicInviteCancel`.
- `santisimoRoutes`: sección pública, antes de `router.use(isAuthenticated)` (el prefijo
  `/santisimo/public` ya está exento de CSRF).
- Tests Jest: token (roundtrip/tamper/clave), controller+service (CA2-CA6), wiring de rutas
  (públicas sin auth, rate limit presente, CSRF-exentas vía `applyCsrfProtectionExcept`).

**Verificación**: suites nuevas en verde; `pnpm --filter api exec tsc --noEmit` sin errores
nuejos vs baseline de master.

## M2 — variable de plantilla en los 3 caminos + guardia-links

- `packages/utils/src/index.ts`: `ParticipantData.santisimoGuardiaLink`,
  `buildParticipantReplacements`, mock, `findEmptyVariables` automático.
- Endpoint `guardia-links` (R5) en service/controller/routes.
- `MessageDialog.vue` + `WhatsAppSendQueue.vue` + `BaseMessageTemplateModal.vue`: fetch del
  mapa al abrir + inyección por destinatario (Record plano, no Map en ref).
- `messageSequenceService.resolveContent`: inyección lazy (patrón `retreatWithLinks` /
  `buildServerRegistrationLink`, base `FRONTEND_URL`).
- Picker: entrada en `participantVariables`.
- Tests: utils (reemplazo/mock/empty), wiring del endpoint, `resolveContent` (CA7-CA8).

**Verificación**: suites en verde; preview del editor muestra la URL mock.

## M3 — vista pública

- Router: `/santisimo/servidor/:token` (`requiresAuth:false`).
- `PublicSantisimoServerView.vue` (R7) espejando `PublicSantisimoView.vue`: radios nativos,
  badge de comida, guardar/cambiar/quitar, estados de error.
- `api.ts`: `getPublicInvite` / `inviteSignup` / `inviteCancel` / `getGuardiaLinks` + tipos.
- i18n es+en (`santisimo.serverInvite.*`); ícono nuevo → allowlist del mock lucide en
  `apps/web/src/test/setup.ts`.
- Test Vitest de la vista (mount + `flushPromises`, CA9 parcial).

**Verificación**: vitest de la vista en verde; `pnpm --filter web exec vue-tsc --noEmit` sin
errores nuevos.

## M4 — entrada admin + plantilla sembrada + docs

- `SantisimoAdminView.vue`: ítem "Enviar enlaces de guardia por WhatsApp" en ⠀⋮ Más acciones;
  `WhatsAppSendQueue` montado con servidores (`fetchParticipants` + reset de `filters`) y
  plantillas audiencia server; `useRekaDialogFix` + `deferOpen` si cuelga de DropdownMenuItem.
- Migración `20261014…SeedSantisimoGuardiaTemplate` (cargar skill `sqlite-migrations`):
  SQL plano, sin `@repo/types`, insert-if-absent; texto plano WhatsApp (patrón de
  `20260914120000_FormatWhatsappMessageTemplates.ts`).
- Docs usuario (`apps/web/src/docs/es/santisimo.md` y su equivalente en) + sección nueva en
  `.claude/skills/santisimo/SKILL.md`.

**Verificación**: `pnpm --filter api migration:run` siembra la plantilla (CA11); dev del
worktree: cola de WhatsApp con enlaces por servidor (CA10).

## M5 — verificación end-to-end + reconcile

- Dev del worktree con `start-worktree-dev.sh` (verificar puertos libres antes: 3002/5174 o
  overrides). Flujo completo CA2-CA10 con el retiro de prueba y login local.
- `tasks.md` con Done/Desviaciones por milestone; **Reconcile** en `spec.md` (reescritura
  retroactiva: lo descartado y por qué).
- Builds: `pnpm --filter api build` (bundle ESM, sin `__dirname`/`require`) y
  `pnpm --filter web build`.
- Dejar al usuario la URL del dev del worktree para abrir la feature.
- Push/PR/merge a master: solo con visto bueno explícito.
