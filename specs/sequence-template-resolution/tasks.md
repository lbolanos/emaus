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

- [ ] Migration `20261001120000_FixBuenDespachoShirtConfirmationSequence.ts` (4 pasos
      idempotentes: pausar → purgar 28 queued → borrar plantilla vieja → offsetDays 20→5)
- [ ] Test `fixBuenDespachoShirtConfirmationSequence.simple.test.ts` (up ×2 idempotente,
      invariantes)
- [ ] Prueba en dev (auto-run al guardar) + verificación por dato
- [ ] Commit + push + deploy (con OK explícito de Leonardo)
- [ ] Verificación por dato en prod (readonly vía SSH)

**Done**: —

## M2 — guard anti-retroactivo

- [ ] `isRetroactiveAtEnroll` en `messageSequenceService.ts` (semántica por trigger)
- [ ] Supresión en el loop de `enrollSequence` (sin filas skipped) + contador
- [ ] `past: boolean[]` en `schedule-preview` (`SequenceSchedulePreview` en packages/types)
- [ ] Editor: ámbar junto a `fmtStepDate` + key `sequences.stepDatePast` es+en
- [ ] Tests: `messageSequenceRetroactiveEnrollGuard.test.ts`,
      `messageSequenceSchedulePreviewPast.test.ts`
- [ ] Build api+web, commit

**Done**: —

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
