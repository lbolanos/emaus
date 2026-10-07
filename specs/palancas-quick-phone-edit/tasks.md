# Tasks: palancas-quick-phone-edit

Convención: al cerrar cada milestone se marcan los items y se añade una línea `**Done**:`
con fecha. Toda desviación del plan va en una sección `### Desviaciones <fecha>` al pie del
milestone correspondiente.

## M0 — worktree + specs SDD

- [x] Branch `palancas-quick-phone-edit` + worktree `.claude/worktrees/palancas-quick-phone-edit`
- [x] `pnpm install` + copia de `apps/api/.env` + `pnpm --filter @repo/ui build`
- [x] `spec.md` (problema, decisiones fechadas, R1-R8, CA1-CA12, fuera de alcance)
- [x] `research.md` (anclas del código pre-M1)
- [x] `plan.md` (M0-M4 con verificación)
- [x] `tasks.md`
- [x] Commit `docs(specs): ... (M0)`

**Done**: 2026-10-07.

## M1 — backend `PATCH /participants/:id/phones`

- [ ] `updateParticipantPhonesSchema` en `packages/types/src/index.ts`
- [ ] Ruta PATCH con `participant:update` + `requireRetreatAccess` en `participantRoutes.ts`
- [ ] `updateParticipantPhones` controller (validación por país, semántica de vacío, 404/400/403)
- [ ] `updateParticipantPhones` service (canonización `toNationalPhone`, audit allowlist 3 campos)
- [ ] Suite Jest: happy, `+52`/`044` canonizan, inválido 400 por campo, `''` EC1 400 / EC2 null,
      403 permiso, 403 retreat ajeno, audit row
- [ ] `pnpm --filter api exec tsc --noEmit` limpio
- [ ] Commit `feat(api): ... (M1)`

## M2 — editor + tabla

- [ ] `updateParticipantPhones` en `apps/web/src/services/api.ts`
- [ ] Action `updateParticipantPhones` en `participantStore.ts` (optimista + rollback + valores
      canónicos)
- [ ] `ParticipantQuickPhoneEditor.vue` (popover manual, 3 campos, validación país, payload
      cambios-only, gate permiso, `saved`/`close`)
- [ ] Prop `inlinePhoneEdit` (withDefaults false) + celda cellPhone con ✏ en `ParticipantList.vue`
- [ ] `PalancasView.vue`: columna `cellPhone` + `:inline-phone-edit="true"`
- [ ] `pnpm --filter web exec vue-tsc --noEmit` limpio
- [ ] Commit `feat(web): ... (M2)`

## M3 — diálogo + i18n + tests

- [ ] ✏ en header palancas de `EditParticipantForm.vue` + `participant-patched`
- [ ] Claves i18n es+en completas (labels, botones, errores, toasts)
- [ ] Vitest editor: permiso, validación bloquea, payload cambios-only, rollback
- [ ] Vitest wiring ParticipantList: default sin ✏ en vistas que no piden la prop
- [ ] Commit `feat(web): ... (M3)`

## M4 — verificación + docs

- [ ] tsc + vue-tsc + jest + vitest + `pnpm build` api/web
- [ ] Correr `dist/index.js` del API (o grep `__dirname`)
- [ ] Navegador: CA7-CA12 en worktree (puertos según ocupación; confirmar que sirve este worktree)
- [ ] `docs/features/palancas-quick-phone-edit.md` (con limitación de snapshots)
- [ ] Reconcile del spec a modo retroactivo
- [ ] Commit `docs(features): ... (M4)`

## Cierre

- [ ] Merge a `master` (tras visto bueno de Leonardo)
- [ ] Demo al equipo si aplica
