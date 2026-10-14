# Tasks: santisimo-guardia-links

Convención: al cerrar cada milestone se marcan los items y se añade una línea `**Done**:`
con fecha. Toda desviación del plan va en una sección `### Desviaciones <fecha>` al pie del
milestone correspondiente.

## M0 — worktree + specs SDD

- [x] Branch `santisimo-guardia-links` + worktree `.claude/worktrees/santisimo-guardia-links`
- [x] `pnpm install` + copia de `apps/api/.env` + `pnpm --filter @repo/ui build` +
      limpieza de `apps/web/node_modules/.vite`
- [x] `spec.md` (problema, decisiones fechadas, R1-R8, CA1-CA11, fuera de alcance)
- [x] `research.md` (anclas del código pre-M1, verificadas contra `c8363d08`)
- [x] `plan.md` (M0-M5 con verificación)
- [x] `tasks.md`
- [x] Commit `docs(specs): ... (M0)` — `9af9882d`

## M1 — backend: token util + endpoints públicos del invite

- [x] `apps/api/src/utils/santisimoInviteToken.ts` (R1) + test unitario puro
- [x] `PublicSantisimoInviteSignupSchema` + tipos en `packages/types/src/santisimo.ts`
- [x] Acciones `santisimo_signup.invite_signup` / `.invite_cancel` en `packages/types/src/audit.ts`
- [x] `santisimoService.getInviteData` / `inviteSignup` / `inviteCancel` (transacción, audit)
- [x] Handlers `publicGetInvite` / `publicInviteSignup` / `publicInviteCancel` en el controller
- [x] Rutas públicas en `santisimoRoutes.ts` antes de `router.use(isAuthenticated)`
      (+ rate limit `publicParticipantLimiter` en POST/DELETE)
- [x] Tests Jest: token roundtrip/tamper/clave; CA2-CA6; wiring (sin auth, CSRF-exentas)
- [x] `pnpm --filter api exec tsc --noEmit` sin errores nuevos vs baseline master
- [ ] Commit `feat(api): ... (M1)`

**Done**: 2026-10-14 — 39 tests nuevos (11 token + 13 integración service + 11 controller + 4
wiring source-level), tsc sin errores en archivos tocados (los 146 del baseline viven en
tableMesaService/participantService/etc.), `pnpm --filter api build` verde (los 2 matches de
`__dirname` en dist/index.js son el shim ESM preexistente de `src/index.ts`, no código nuevo).

## M2 — variable `participant.santisimoGuardiaLink` en los 3 caminos

- [ ] `ParticipantData.santisimoGuardiaLink` + builder + mock en `packages/utils`
- [ ] `GET /santisimo/retreats/:retreatId/guardia-links` (R5)
- [ ] Inyección en `MessageDialog.vue` (fetch del mapa al abrir + `updateMessagePreview`)
- [ ] Inyección en `WhatsAppSendQueue.vue` (fetch al abrir + `resolvedMessageFor`)
- [ ] Inyección en `BaseMessageTemplateModal.vue` (preview con participante real) + picker
- [ ] Inyección lazy en `messageSequenceService.resolveContent`
- [ ] Tests: utils, wiring endpoint, `resolveContent` (CA7-CA8)
- [ ] Commit `feat(templates): ... (M2)`

## M3 — vista pública `/santisimo/servidor/:token`

- [ ] Ruta `public-santisimo-server` con `requiresAuth:false`
- [ ] `PublicSantisimoServerView.vue` (radios, badge de comida, guardar/cambiar/quitar, errores)
- [ ] `api.ts`: 4 métodos + tipos en el grupo `santisimoApi`
- [ ] i18n es+en (`santisimo.serverInvite.*`); allowlist lucide si hay ícono nuevo
- [ ] Test Vitest de la vista (CA9 parcial)
- [ ] `pnpm --filter web exec vue-tsc --noEmit` sin errores nuevos
- [ ] Commit `feat(web): ... (M3)`

## M4 — entrada admin + plantilla sembrada + docs

- [ ] Ítem "Enviar enlaces de guardia por WhatsApp" en `SantisimoAdminView` (⋮ Más acciones,
      `useRekaDialogFix`/`deferOpen` si aplica, WhatsAppSendQueue montado)
- [ ] Migración semilla de plantilla WhatsApp (skill `sqlite-migrations`; SQL plano, sin
      `@repo/types`, insert-if-absent)
- [ ] Docs usuario es/en + sección nueva en `.claude/skills/santisimo/SKILL.md`
- [ ] Verificar CA10-CA11
- [ ] Commit `feat(web+api): ... (M4)`

## M5 — verificación end-to-end + reconcile

- [ ] Dev del worktree arriba (puertos libres verificados) + flujo CA2-CA10 manual
- [ ] `pnpm --filter api build` + `pnpm --filter web build`
- [ ] `tasks.md` cerrado + **Reconcile** en `spec.md`
- [ ] URL del dev entregada al usuario
- [ ] Commit `docs(specs): reconcile (M5)` — push/PR solo con visto bueno
