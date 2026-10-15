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

- [x] `ParticipantBalances.vue`: helper, `statusLabel`, badge sky, toggle `HousePlus`,
      ocultar en becados, `canWhatsapp` (D5), filtro `house`, orden
- [x] `PaymentManagement.vue`: botón del modal junto a "Marcar como Becado"
- [x] Palancas: acción rápida inline por fila (gate `participant:update`) + indicador
- [x] `EditParticipantForm.vue`: grupo Financiero + layout palancas
- [x] `ParticipantList.vue`: statusMap + color/emoji
- [x] `FilterDialog.vue` + `sequenceEditorShared.ts` (CONDITION_PAYMENTS)
- [x] `participantFieldControls.ts`: entrada boolean exacta
- [x] `RecepcionView.vue`: badge (D7)
- [x] i18n es + en (todas las keys de plan.md)
- [x] `setup.ts`: `HousePlus` en el allowlist de lucide
- [x] `pnpm --filter web test` en verde + typecheck
- [x] Commit `feat(web): pays-at-house status across surfaces`

**Done**: 2026-10-15. Suite web 215 archivos / 3253 tests en verde; `vue-tsc --noEmit` limpio.
El botón de Cobrar de Recepción quedó con `v-if="!p.isScholarship && !p.totalPaid"` explícito
(mismo comportamiento que el `v-else-if` original: se desacopló de la cadena del badge Beca para
que badge y Cobrar convivan en un marcado).

### Desviaciones

- **Icono**: `lucide-vue-next` 0.363.0 (la versión pinneada) no exporta `HousePlus` — se usó
  `Home`, que ya estaba en el allowlist de `setup.ts` (la entrada nueva de `HousePlus` se agregó
  y se retiró). El botón del modal de pago usa el emoji 🏠 en el label, sin ícono.
- **Badge de Recepción (CA 7)**: el payload de recepción no trae monto esperado (el operador
  teclea el monto a cobrar a mano), así que el badge se oculta con `!p.totalPaid` — el mismo
  umbral que ya usaba el botón Cobrar. "Cobro completo → badge desaparece" se cumple, y también
  con un pago parcial registrado en la puerta (borrar el pago lo restaura, D3).
- `en.json` no tenía bloque `reception` (la vista vive solo en es con fallback); se agregó el
  bloque mínimo con `reception.paysAtHouse` para cumplir la regla de key en ambos locales.

## M4 — Verificación end-to-end + cierre

- [x] Extender tests frontend (Balances, List, Recepción, toggle Palancas)
- [x] E2E Playwright (`tests/e2e/pays-at-house.spec.ts`, 5 tests chromium): badge/toggle con
      overlay del GET, PUT capturado-aborto con payload asertado, recepción badge+Cobrar y
      umbral totalPaid. Sin persistir nada.
- [x] Levantar dev del worktree (`start-worktree-dev.sh`, puertos 3003/5175 — los default los
      ocupaba otro worktree) y correr el guion:
  1. Migración aplicada (PRAGMA: col 38 `paysAtHouse`)
  2. Saldos: toggle → badge sky, montos y summary intactos (D6)
  3. Palancas: marcar desde la fila → Saldos lo refleja (cadena cruzada en ambos sentidos)
  4. Beca: acción oculta; beca limpia marca (D4); recordatorio WhatsApp oculto (D5)
  5. Recepción: badge + Cobrar conviven; pago registrado → badge fuera (e2e + unit; D3 en tests)
  6. Filtro `pays_at_house` en Saldos (solo el marcado); segmento/condición con paridad
     backend-lista (D2, M2); "Pendiente" del Select = saldo > 0, los incluye
  7. Dos retiros: marca per-retiro (crossRetreatPayments.test.ts, M2)
- [x] `pnpm --filter api test` (299 suites / 4605 tests, 2 shards secuenciales) +
      `pnpm --filter web test` (216 archivos / 3273 tests) + `vue-tsc --noEmit` limpio
- [x] `pnpm --filter api build` (gate bundle ESM)
- [x] `## Reconcile` en spec.md (cada CA contra lo implementado)
- [ ] PR a master; esperar `gh pr checks` en verde antes de merge
- [ ] Commit final `docs(specs): pays-at-house reconcile`

**Done**: 2026-10-15. El guion se corrió con persistencia real sobre la DB desechable del
worktree (copia que `start-worktree-dev.sh` re-hace en cada arranque) y se restauró el estado
de los participantes usados al final. El e2e corre contra el stack de dev con `E2E_BASE_URL`
apuntando al puerto del worktree.

### Desviaciones 2026-10-15

- El guion de Palancas se corrió con el superadmin local en vez de un usuario de perfil
  comunicaciones (no sembrado en la DB del worktree): el gate real es el permiso
  `participant:update`, que ese perfil ya tiene (migración de roles) y el caso sin permiso está
  cubierto por unit test.
- "Pagar → badge fuera / borrar pago → vuelve" de Recepción se verificó por e2e (overlay con
  `totalPaid > 0`) y unit tests, no manipulando pagos reales en el guion.
- La marca per-retiro (punto 7) quedó cubierta por los tests M2 de cross-retreat; no se
  reprodujo a mano en el guion.
