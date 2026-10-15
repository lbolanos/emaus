# Tasks: pays-at-house

> SDD tasks — versión 1.0 (2026-10-15). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone.

## M0 — worktree + specs SDD

- [x] Worktree `.claude/worktrees/pays-at-house`, branch `worktree-pays-at-house`
- [x] `pnpm install`
- [x] `specs/pays-at-house/spec.md` (Decisiones de dominio D1-D8 con defaults propuestos)
- [x] `specs/pays-at-house/research.md`
- [x] `specs/pays-at-house/plan.md`
- [x] `specs/pays-at-house/tasks.md`
- [ ] **Gate**: Leonardo revisa el spec (en particular D1-D8) antes de codear M1

## M1 — Backend: modelo + migración + exposición

- [ ] Migration `20261015120000_AddPaysAtHouseToRetreatParticipants.ts` (up/down, SQL plano)
- [ ] `CreateSchema.ts`: columna en el CREATE TABLE de `retreat_participants`
- [ ] `retreatParticipant.entity.ts`: `@Column paysAtHouse`
- [ ] `participant.entity.ts`: virtual + getter `paymentStatus` + `toJSON`
- [ ] Hidratación: `participantRetreatHydration.ts`, `findAllParticipants` (select + overlay),
      `evaluateFilters`, `getReceptionStats`
- [ ] `updateParticipant`: destructure + `rpUpdates` + higiene D4 + `oldAuditSnapshot`
- [ ] Tipos: `participantSchema`, `segment.ts`, `savedSegment.entity.ts`
- [ ] `aiChatService.getParticipantDetails` expone el bool
- [ ] Migración corre en el dev del worktree; `PRAGMA table_info(retreat_participants)` ok
- [ ] Commit `feat(api): pays-at-house payment status flag`

**Done**:

## M2 — Backend: tests

- [ ] `paymentStatus.test.ts`: marca+unpaid, marca+partial (D1), marca+paid, marca+overpaid,
      precedencia beca (D4), expected 0, sin marca = regresión exacta
- [ ] `crossRetreatPayments.test.ts`: overlay per-retiro sin mezclar
- [ ] Nuevo segment test: `pays_at_house` matchea / `owing` incluye / `unpaid` excluye (D2);
      pagó todo deja de matchear
- [ ] Update test: escribe fila del retiro de contexto; beca limpia marca; false persiste
- [ ] `receptionTotalPaid.integration.test.ts`: expone bool; pago completo → paid
- [ ] Suite api en verde (una sola corrida de jest)
- [ ] Commit `test(api): pays-at-house coverage`

**Done**:

## M3 — Frontend

- [ ] `ParticipantBalances.vue`: helper, `statusLabel`, badge sky, toggle `HousePlus`,
      ocultar en becados, `canWhatsapp` (D5), filtro `house`, orden
- [ ] `PaymentManagement.vue`: botón del modal junto a "Marcar como Becado"
- [ ] Palancas: acción rápida inline por fila (gate `participant:update`) + indicador
- [ ] `EditParticipantForm.vue`: grupo Financiero + layout palancas
- [ ] `ParticipantList.vue`: statusMap + color/emoji
- [ ] `FilterDialog.vue` + `sequenceEditorShared.ts` (CONDITION_PAYMENTS)
- [ ] `participantFieldControls.ts`: entrada boolean exacta
- [ ] `RecepcionView.vue`: badge (D7)
- [ ] i18n es + en (todas las keys de plan.md)
- [ ] `setup.ts`: `HousePlus` en el allowlist de lucide
- [ ] `pnpm --filter web test` en verde + typecheck
- [ ] Commit `feat(web): pays-at-house status across surfaces`

**Done**:

## M4 — Verificación end-to-end + cierre

- [ ] Extender tests frontend (Balances, List, Recepción, toggle Palancas)
- [ ] Levantar dev del worktree (`start-worktree-dev.sh`) y correr el guion:
  1. Migración aplicada (PRAGMA)
  2. Saldos: toggle → badge sky, montos y summary intactos (D6)
  3. Palancas con perfil comunicaciones: marcar desde la fila → Saldos lo refleja
  4. Beca: acción oculta; beca limpia marca (D4); recordatorio WhatsApp oculto (D5)
  5. Recepción: badge + Cobrar; pagar → badge fuera, paid; borrar pago → vuelve (D3)
  6. Filtro `pays_at_house` en Saldos y FilterDialog; segmento y condición de secuencia con
     paridad backend-lista (D2); `owing` incluye
  7. Dos retiros: marca per-retiro
- [ ] `pnpm --filter api test` + `pnpm --filter web test` + typechecks
- [ ] `pnpm --filter api build` (gate bundle ESM)
- [ ] `## Reconcile` en spec.md (cada CA contra lo implementado)
- [ ] PR a master; esperar `gh pr checks` en verde antes de merge
- [ ] Commit final `docs(specs): pays-at-house reconcile`

**Done**:
