# Plan: estado de pago "Paga en la casa de retiro"

> SDD plan — versión 1.0 (2026-10-15). Cómo se implementa, por capas. El qué/por qué vive en
> `spec.md`; el estado verificado del código, en `research.md`.

## Diseño

Réplica del patrón `isScholarship` (bool per-retiro + virtual + estado derivado):

```
getter paymentStatus (orden de precedencia):
  scholarship → (sin retiro) unpaid → overpaid → expected===0 → paid
  → [NUEVO] paysAtHouse && total < expected → pays_at_house
  → unpaid → partial → paid
```

- Columna `retreat_participants.paysAtHouse` (bool NOT NULL DEFAULT 0).
- Virtual `Participant.paysAtHouse?: boolean` hidratado en los 4 puntos (research §"4 puntos").
- Escritura por `PUT /participants/:id` con `contextRetreatId` (camino de la beca).
- Enum de filtros: `'pays_at_house'` insertado antes de `'owing'` en `segment.ts`,
  `savedSegment.entity.ts` y `CONDITION_PAYMENTS`.

## Capa API (M1)

| Archivo | Cambio |
|---|---|
| `apps/api/src/migrations/sqlite/20261015120000_AddPaysAtHouseToRetreatParticipants.ts` | NUEVO. `up`: `ALTER TABLE "retreat_participants" ADD COLUMN "paysAtHouse" boolean NOT NULL DEFAULT 0`. `down`: DROP COLUMN. SQL plano, sin imports del workspace. |
| `apps/api/src/migrations/sqlite/20250910163337_CreateSchema.ts` | `"paysAtHouse" BOOLEAN NOT NULL DEFAULT (0)` junto a `"isScholarship"` (~153). |
| `apps/api/src/entities/retreatParticipant.entity.ts` | `@Column({ type: 'boolean', default: false }) paysAtHouse!: boolean;` junto a `isScholarship`. |
| `apps/api/src/entities/participant.entity.ts` | Virtual `paysAtHouse?` (~207); getter `paymentStatus` + tipo de retorno; `toJSON` serializa (~542). |
| `apps/api/src/services/participantRetreatHydration.ts` | `participant.paysAtHouse = rp.paysAtHouse ?? false` (rama rp) / `undefined` (rama else). |
| `apps/api/src/services/participantService.ts` | `findAllParticipants`: `"paysAtHouse"` al select (~821) + overlay (~856). `updateParticipant`: destructure (~3017), `rpUpdates` + higiene D4 (~3150), `oldAuditSnapshot` (~3132). `getReceptionStats`: `paysAtHouse: !!rp.paysAtHouse` en ambas listas (~5418-5452). |
| `apps/api/src/services/savedSegmentService.ts` | `evaluateFilters`: `p.paysAtHouse = rp.paysAtHouse ?? false` (~109-114). Lógica de filtros sin cambio (igualdad estricta; `owing` ya cubre). |
| `apps/api/src/services/aiChatService.ts` | `getParticipantDetails`: exponer `paysAtHouse` junto a `isScholarship` (~540). |
| `packages/types/src/index.ts` | `participantSchema`: `paysAtHouse: z.boolean().optional()` (habilita el `.partial()` del update). |
| `packages/types/src/segment.ts` | Enum + `'pays_at_house'` antes de `'owing'`. |
| `apps/api/src/entities/savedSegment.entity.ts` | Unión de tipos + `'pays_at_house'`. |

## Capa Web (M3)

| Archivo | Cambio |
|---|---|
| `apps/web/src/components/ParticipantBalances.vue` | `isPaysAtHouse(p)` helper; rama en `statusLabel` (tabla + print + Excel); badge `bg-sky-100 text-sky-800`; `togglePaysAtHouse` espejo del de beca (ícono `HousePlus`, confirm i18n, refetch); ocultar acción en becados; `canWhatsapp` excluye marcados (D5); filtro `house` + `matchesStatus`; orden por estado. |
| `apps/web/src/components/PaymentManagement.vue` | Botón "Marcar que paga en la casa" junto a "Marcar como Becado" (~630), oculto en becados; updateParticipant + refetch + `loadSummary`. |
| `apps/web/src/views/PalancasView.vue` + `ParticipantList.vue` | Acción rápida inline por fila (gate `useAuthPermissions().hasPermission('participant:update')`, molde `inline-phone-edit`): ícono casa que marca/desmarca + indicador del estado. Columna nueva "Casa" o celda junto a `lastPaymentDate`. |
| `apps/web/src/components/EditParticipantForm.vue` | `paysAtHouse` al grupo Financiero (~157); en layout palancas, toggle visible en el diálogo Gestionar Palancas. |
| `apps/web/src/components/ParticipantList.vue` | `statusMap` + `'pays_at_house': 'Paga en la casa'`; color `text-sky-600` + 🏠 (~1976). |
| `apps/web/src/components/FilterDialog.vue` | Opción `pays_at_house` en la lista (~68) + builder con i18n (~182). |
| `apps/web/src/views/sequenceEditorShared.ts` | `CONDITION_PAYMENTS` + `'pays_at_house'`. |
| `apps/web/src/constants/participantFieldControls.ts` | Entrada exacta boolean para `paysAtHouse`. |
| `apps/web/src/views/RecepcionView.vue` | Badge `reception.paysAtHouse` entre Beca y Cobrar (~414). Botón Cobrar intacto. |
| `apps/web/src/locales/es.json` + `en.json` | Keys nuevas (ambos idiomas, obligatorio). |
| `apps/web/src/test/setup.ts` | `HousePlus` al allowlist de lucide. |

### Keys de i18n

```
paymentManagement.balances.statusPaysAtHouse      "Paga en la casa" / "Pays at the house"
paymentManagement.balances.markPaysAtHouse        "Marcar que paga en la casa" / "Mark as pays at the house"
paymentManagement.balances.confirmPaysAtHouse    "¿Marcar a {name} como que paga en la casa de retiro? Seguirá debiendo el saldo; se le cobrará a su llegada el viernes." / EN
paymentManagement.balances.confirmRemovePaysAtHouse "¿Quitar la marca de que {name} paga en la casa de retiro?" / EN
paymentManagement.markPaysAtHouse (modal)        "Marcar que paga en la casa" / EN
participants.filters.options.paymentStatus.pays_at_house "Paga en la casa" / "Pays at the house"
reception.paysAtHouse                            "Paga en la casa" / "Pays at the house"
sequences.payments.pays_at_house                 "Paga en la casa" / "Pays at the house"
palancas.paysAtHouse (título de columna/acción)  "Paga en la casa" / "Pays at the house"
```

(los textos exactos en inglés se ajustan al glosario de `en.json` en M3)

## Tests (M2 backend, M4 frontend)

Backend: `paymentStatus.test.ts` (7 casos del getter + regresión exacta sin marca),
`crossRetreatPayments.test.ts` (overlay per-retiro), nuevo `paysAtHouseSegment.test.ts`
(`pays_at_house` matchea / `owing` incluye / `unpaid` excluye), update (retiro de contexto, higiene
beca, false persiste), `receptionTotalPaid.integration.test.ts` (expone bool; pago → paid).

Frontend: `ParticipantBalances.test.ts` (badge, precedencia, toggle payload con
`contextRetreatId`, filtro, WhatsApp oculto), `ParticipantList.test.ts` (celda renderiza el
label), `RecepcionView.totalPaid.test.ts` (badge + Cobrar persiste), test del toggle en Palancas.
`participantFieldControlParity.test.ts` custodia el catálogo.

## Verificación end-to-end (M4)

Worktree con `bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh`, login
`leonardo.bolanos@gmail.com` / `123456`. Script completo en `tasks.md` M4 (12 pasos: migración,
Saldos, Palancas como comunicaciones, beca/higiene, WhatsApp, Recepción con cobro y borrado,
filtros/segmentos/condición de secuencia, dos retiros, suites, build del api).

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| `evaluateFilters` diverge de la lista | Hidratar ahí también + test de paridad |
| `select` explícito omite la columna | Test cross-retreat del overlay |
| zod strippea / spread al lado equivocado | Test de update con retiro de contexto |
| Segmentos vivos con `unpaid` pierden marcados | D2 documentada en spec; comportamiento deseado |
| Ícono sin allowlist | Edit de `setup.ts` en el mismo milestone |
| Bundle ESM | `pnpm --filter api build` como gate de M4 |
