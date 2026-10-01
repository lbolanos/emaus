# Tasks: sequence-template-resolution

Convención: al cerrar cada milestone se marcan los items y se añade una línea `**Done**:` con
fecha. Toda desviación del plan va en una sección `### Desviaciones <fecha>` al pie del
milestone correspondiente.

## M0 — specs SDD + worktree

- [x] Worktree `.claude/worktrees/sequence-template-resolution/` desde HEAD local `3faf76c2`
- [x] `pnpm install` + copia de `apps/api/.env` (los 4 archivos M del main quedan fuera)
- [x] `specs/sequence-template-resolution/`: spec.md, research.md, plan.md, tasks.md
- [x] Commit M0

**Done**: 2026-10-01

## M1 — cirugía de datos en prod

- [x] Migration `20261001120000_FixBuenDespachoShirtConfirmationSequence.ts` (4 pasos
      idempotentes: pausar → purgar 28 queued → borrar plantilla vieja → offsetDays 20→5)
- [x] Test `fixBuenDespachoShirtConfirmationSequence.simple.test.ts` (up ×2 idempotente,
      invariantes) — 5/5 verde
- [x] Prueba en dev (auto-run al arrancar el API sobre copia aislada) + verificación por dato:
      pre 28 queued + 1 sent → post 0 queued + 1 sent; única plantilla del tipo = `62fec9ab`;
      `isActive=0`; `offsetDays=5`; fila en `migrations`
- [ ] Commit + push + deploy (con OK explícito de Leonardo)
- [ ] Verificación por dato en prod (readonly vía SSH)

**Done**: —

## M2 — guard anti-retroactivo

- [x] `isRetroactiveAtEnroll` en `messageSequenceService.ts` (semántica por trigger)
- [x] Supresión en el loop de `enrollSequence` (sin filas skipped) + contador
- [x] `past: boolean[]` en `schedule-preview` (`SequenceSchedulePreview` en packages/types)
- [x] Editor: ámbar junto a `fmtStepDate` + key `sequences.stepDatePast` es+en
- [x] Tests: `messageSequenceRetroactiveEnrollGuard.test.ts` (12/12),
      `messageSequenceSchedulePreviewPast.test.ts` (3/3)
- [x] Build api+web, commit

**Done**: 2026-10-01

### Desviaciones 2026-10-01

- **6 tests existentes de `messageSequence.test.ts` re-fechados, no re-escritos**: con el guard
  M2, los tests de audiencia que usaban el startDate default del factory ("hoy") con offset
  positivo (`table_leaders`, 4 de `community_roster`, R2 de robustez) dejaron de enrolar. El
  intento de esos tests es la audiencia, no la retroactividad, así que se fecharon sus retiros al
  futuro (helper `futureStart`, mediodía UTC). El test "WhatsApp encola" de `community_roster`
  dependía del mensaje ya-vencido al materializar: ahora el retiro es futuro y la fila se vence
  a mano (`scheduledFor` − 1 h) tras el enrol, que ejercita el mismo camino (fecha llegada)
  sin depender del borde exacto de hoy.
- **El test "catch-up legítimo" (línea ~176) se reescribió a la expectativa opuesta** ("retiro
  futuro con paso vencido NO enrola"): documenta el cambio deliberado de semántica de R2 — para
  triggers anclados al retiro no existe catch-up legítimo porque la fecha es idéntica para toda
  la audiencia (incidentes palancas 2026-09-13 y prendas 2026-10-01). Verifica además que tras
  corregir el offset el re-enrol materializa (la UQ quedó limpia).
- Suite verificada en conjunto: las 6 suites del motor juntas dan 125/125
  (`messageSequence`, `RetroactiveEnrollGuard`, `SchedulePreviewPast`,
  `shirtConfirmationSequence`, `messageSequenceProcessScope`, `sequenceRecipientsAndSeed`).

## M3 — templateId estructural

- [ ] Migration `20261002120000_SequenceStepTemplateId.ts` (ADD COLUMN + backfill
      determinista + guard PRAGMA)
- [ ] Entities: `SequenceStep.templateId`, `MessageTemplate.type` tipado (sin `as any`)
- [ ] Helper `resolveTemplateForStep` aplicado en los 5 sitios del motor
- [ ] `copyToRetreat` resuelve `templateId` local
- [ ] `packages/types/src/sequence.ts`: templateId en schemas + `syncSteps`/`stepPayloadChanged`
- [ ] Editor: select por id, `StepDraft.templateId`, warning duplicado (`duplicateTemplateType`
      es+en)
- [ ] `BaseMessageTemplateModal`: aviso informativo de type duplicado (sin 409)
- [ ] `templateName` server-side en bandeja/detalle (getQueue/getScheduled/getQueueItemDetail)
- [ ] Tests: `messageSequenceTemplateResolution.test.ts`,
      `sequenceStepTemplateIdBackfill.simple.test.ts`, web modal + editor shared
- [ ] `pnpm --filter api build`, build web, commit

**Done**: —

## M4 — `{custom_message}` accionable

- [ ] Migration `20261003120000_CleanCustomMessagePlaceholder.ts` (frase neutral a fijar)
- [ ] Guard en `processDue` (skipped accionable) + `regenerateQueuedForRetreat` (skipped++) +
      warning en `previewStep`
- [ ] Tests: `messageSequenceCustomMessageGuard.test.ts`,
      `cleanCustomMessagePlaceholder.simple.test.ts`
- [ ] Build api+web, commit

**Done**: —

## Cierre

- [ ] Demo manual en dev (re-enrol "Ultimo Prendas", bandeja, preview)
- [ ] Deploy M2-M4 + verificación en prod
- [ ] Merge a master

**Done**: —
