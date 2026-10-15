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
- [x] **Gate**: Leonardo revisa el spec (en particular D1-D8) antes de codear M1 — aprobado
      2026-10-15 ("listo realiza todo con e2e tests al final"); se agrega e2e Playwright a M4

## M1 — Backend: modelo + migración + exposición

- [x] Migration `20261015120000_AddPaysAtHouseToRetreatParticipants.ts` (up/down, SQL plano,
      guarda idempotencia por PRAGMA table_info)
- [x] `CreateSchema.ts`: columna en el CREATE TABLE de `retreat_participants`
- [x] `retreatParticipant.entity.ts`: `@Column paysAtHouse`
- [x] `participant.entity.ts`: virtual + getter `paymentStatus` + `toJSON`
- [x] Hidratación: `participantRetreatHydration.ts`, `findAllParticipants` (select + overlay),
      `evaluateFilters`, `getReceptionStats`
- [x] `updateParticipant`: destructure + `rpUpdates` + higiene D4 + `oldAuditSnapshot` +
      virtuales del retorno
- [x] Tipos: `participantSchema`, `segment.ts`, `savedSegment.entity.ts`
- [x] `aiChatService.getParticipantDetails` expone el bool
- [x] Migración corre en el worktree (CLI); `PRAGMA table_info` muestra `paysAtHouse`, 606 filas
- [x] Commit `feat(api): pays-at-house payment status flag`

**Done**: 2026-10-15. tsc --noEmit tiene 146 errores preexistentes en master (tableMesaService
etc., ninguno en archivos tocados — verificado por grep); el gate de tipos recae en build+jest.

## M2 — Backend: tests

- [x] `paymentStatus.test.ts`: marca+unpaid, marca+partial (D1), marca+paid, marca+overpaid,
      precedencia beca (D4), expected 0, sin marca = regresión exacta (+ toJSON, overlay
      per-retiro, metadata: no es columna de `participants`)
- [x] `crossRetreatPayments.test.ts`: overlay per-retiro sin mezclar (marcado en A, normal en B)
- [x] Segment tests (`savedSegment.test.ts`): `pays_at_house` matchea / `owing` incluye /
      `unpaid` y `partial` excluyen (D2); pagó todo deja de matchear y la marca persiste (D3)
- [x] Update tests (`paysAtHouseWritePath.test.ts` nuevo): fila del retiro de contexto; beca
      limpia marca; false persiste; payload legacy sin el campo no borra; contextRetreatId de
      otro retiro no toca la fila primaria
- [x] `receptionTotalPaid.integration.test.ts`: expone bool en pendingList y arrivedList (D7)
- [x] Suite api en verde — 2 shards secuenciales con `--max-old-space-size=8192` (299 suites,
      4605 tests passed, 0 failed)
- [x] Commit `test(api): pays-at-house coverage`

**Done**: 2026-10-15. El test D4 cazó un bug real en la higiene de M1: el payload de la UI
reenvía la ficha hidratada (con `paysAtHouse: true`), así que el guard `paysAtHouse ===
undefined` nunca disparaba al marcar la beca. La higiene ahora es incondicional cuando
`isScholarship === true` (participanService.ts:3156).

### Desviaciones 2026-10-15

- El test de segmentos vive en `savedSegment.test.ts` (donde ya estaba el setup de
  `evaluateFilters`) y no en un archivo nuevo, como decía el plan.
- "Pago completo → paid" de recepción quedó cubierto por los casos del getter (el payload de
  recepción no expone `paymentStatus`; la vista computa el badge con el costo del retiro).

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
