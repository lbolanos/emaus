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

- [x] `updateParticipantPhonesSchema` en `packages/types/src/index.ts`
- [x] Ruta PATCH con `participant:update` + `requireRetreatAccess` en `participantRoutes.ts`
- [x] `updateParticipantPhones` controller (validación por país, semántica de vacío, 404/400/403)
- [x] `updateParticipantPhones` service (canonización `toNationalPhone`, audit allowlist 3 campos)
- [x] Suite Jest: happy, `+52`/`044` canonizan, inválido 400 por campo, `''` EC1 400 / EC2 null,
      403 permiso, 403 retreat ajeno, audit row — 27 tests en 3 archivos: controller (9, unitario
      con mocks), service (6, unitario con mocks) y route wiring con supertest + DB de test (12:
      401/403/403, strip de campos extra por `assignParsedBody`, canonización verificada en DB,
      `''` EC2 → NULL, 404 cross-retreat)
- [x] `pnpm --filter api exec tsc --noEmit` — 143 errores, todos preexistentes de master
      (baseline verificado al cerrar M1); ninguno en líneas nuevas
- [x] Commit `feat(api): ... (M1)` — d61d76dc

**Done**: 2026-10-07.

### Desviaciones 2026-10-07 (M1)

1. **tsc con 143 errores preexistentes**: el plan pedía "tsc limpio"; master ya falla tsc con
   esos 143 errores (baseline). Criterio aplicado: no sumar errores nuevos (verificado por
   conteo y por archivo).
2. **Import de `retreatService.findById` estático, no dinámico**: el controller resuelve el país
   con import estático (como `shirtReportService`), no con `await import` (patrón de
   `createParticipant`). Motivo: `jest.config.json` tiene `resetModules: true`; el import
   dinámico dentro del handler re-carga `retreatService` después del reset y devuelve un
   `AppDataSource` fresco que los tests de integración nunca swapearon a la DB de test →
   `EntityMetadataNotFoundError`. Con import estático el binding pertenece al registry #1 que
   `setupTestDatabase` sí swapea.
3. **Service resuelve sus repos perezosamente** (`AppDataSource.getRepository(...)` dentro de la
   función, no el `participantRepository` module-level): el repo module-level se crea antes del
   swap de los tests de integración e hidrata con clases de otro registry ("Class constructor
   Participant cannot be invoked without 'new'", misma limitación documentada en
   `shirtOrderConfirmation.routes.simple.test.ts`). En prod no cambia nada (mismo
   `AppDataSource`); el patrón ya existía en `syncRetreatFields`.
4. **Test de wiring extra** (`participantPhones.routes.simple.test.ts`): el plan pedía solo la
   suite del endpoint; se partió en 3 (controller/service/route) siguiendo la convención del
   repo, y el route test validó de paso el strip de campos por `assignParsedBody` (CA del M2
   adelantado a nivel backend).

## M2 — editor + tabla

- [x] `updateParticipantPhones` en `apps/web/src/services/api.ts`
- [x] Action `updateParticipantPhones` en `participantStore.ts` (optimista + rollback + valores
      canónicos)
- [x] `ParticipantQuickPhoneEditor.vue` (popover manual, 3 campos, validación país, payload
      cambios-only, gate permiso, `saved`/`close`)
- [x] Prop `inlinePhoneEdit` (withDefaults false) + celda cellPhone con ✏ en `ParticipantList.vue`
- [x] `PalancasView.vue`: columna `cellPhone` + `inline-phone-edit`
- [x] `pnpm --filter web exec vue-tsc --noEmit` limpio
- [x] Vitest de regresión: ParticipantList (65) + paridad campo/control + EditParticipantForm +
      cobertura de locales — 85/85
- [ ] Commit `feat(web): ... (M2)`

**Done**: 2026-10-07 (commit pendiente).

### Desviaciones 2026-10-07 (M2)

1. **Claves i18n del editor adelantadas a M2** (el plan las tenía en M3): el componente las
   necesita para renderizar; se agregaron `participants.quickPhones.*` en es.json Y en.json.
2. **Mensajes de formato inválido en español directo** vía `phoneValidationMessage`
   (`@repo/types`), no claves i18n por mensaje: es el mismo contrato que usa el wizard público
   (ParticipantRegistrationView), que ya muestra esos mensajes en español. La única clave
   propia nueva para errores es `requiredEmpty`.
3. **`cellPhone` también en `nonEditableColumns` de PalancasView**: la columna entra a la
   tabla con ✏, pero NO como campo editable del form del diálogo (evita que el PUT genérico
   sin validación de teléfono la toque por esa vía; el diálogo la corrige el mini-editor de M3).
4. **Tests de Vitest del editor/wiring corren en M3** como estaba planeado; en M2 se corrió la
   suite de regresión existente (85/85) para confirmar que la prop y la columna no rompen
   ParticipantList ni la paridad campo/control.

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
