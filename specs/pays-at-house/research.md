# Research: estado de pago "Paga en la casa de retiro"

> SDD research — versión 1.0 (2026-10-15). Estado actual del código relevante, verificado el
> 2026-10-15 sobre master (877bae7d).

## Modelo de pagos: no hay columna de estado

`paymentStatus` es un **getter** de `Participant`
(`apps/api/src/entities/participant.entity.ts:499-515`):

- `'scholarship'` si `isScholarship` (precedencia absoluta);
- sin retiro → `'unpaid'`;
- `expected > 0 && total > expected` → `'overpaid'`; `expected === 0` → `'paid'`;
  `total === 0` → `'unpaid'`; `total < expected` → `'partial'`; si no `'paid'`.

`computeCharges()` (línea 432) arma `expected = retreatFee + meals + debts + shirts` (becado → 0).
`toJSON()` (529-549) serializa `totalPaid/paymentStatus/paymentRemaining/chargeBreakdown/...`.
La tabla `payments` (`payment.entity.ts`) es inmutable en esta feature; `paymentMethod` tiene
CHECK en SQLite (`20250910163337_CreateSchema.ts:493`).

**Precedente exacto**: `isScholarship` — bool per-retiro en `retreat_participants`
(`retreatParticipant.entity.ts:104-107`, junto a `scholarshipAmount`/`mealCount`/
`takesFridayMeal`), virtual en `Participant` (línea 207) hidratado en query time.

## Los 4 puntos que hidratan fuera de la lista principal

`paymentStatus` se computa en más lugares que `findAllParticipants`; cada uno hidrata los
virtuales por su cuenta y hay que agregar `paysAtHouse` en todos o el estado diverge entre
superficies:

1. `apps/api/src/services/participantRetreatHydration.ts:33-52` — helper general (motor de
   secuencias).
2. `apps/api/src/services/participantService.ts` — `findAllParticipants`: `select` explícito del
   overlay (~813-843, lista blanca: columna omitida = overlay siempre false) y asignación
   `p.isScholarship = h.isScholarship ?? false` (~856).
3. `apps/api/src/services/savedSegmentService.ts` — `evaluateFilters` (~109-114) hidrata **en
   lote** con asignaciones propias, sin llamar al helper. Es el motor de segmentos guardados Y de
   condiciones de pasos de secuencia. `owing` ≠ estado: es `paymentRemaining > 0` (~127-135).
4. `apps/api/src/services/participantService.ts` — `getReceptionStats` (~5393-5455): pendingList/
   arrivedList exponen `totalPaid`/`isScholarship` desde `rp` directamente.

## Camino de escritura (el de la beca)

`updateParticipant` (`participantService.ts:3010-3160`):

- destructurea los campos per-retiro fuera del spread (`isScholarship`, `mealCount`,
  `palancas*`, …, línea 3017+) — lo que quede en `...personalData` se mergea a la entidad
  `Participant` (que NO tiene la columna) y se pierde;
- resuelve la fila con `contextRetreatId || participant.retreatId` (~3059-3062);
- `rpUpdates.isScholarship = !!isScholarship` (~3150) + higiene de `scholarshipAmount` al quitar
  la beca (~3159);
- `oldAuditSnapshot` incluye los campos per-retiro (~3132).

**Gate zod**: `updateParticipantSchema` es `.partial()` de `participantSchema`
(`packages/types/src/index.ts:908`); un campo no declarado se strippea en `validateRequest` antes
de llegar al servicio. El preprocess de ese schema convierte `null`/`''` a `undefined` pero
conserva `false` → el toggle a false pasa.

## Enum de filtros/segmentos (3 espejos)

- `packages/types/src/segment.ts:22` — `z.enum(['paid','partial','unpaid','overpaid',
  'scholarship','owing'])` (`owing` documentado como pseudo-estado).
- `apps/api/src/entities/savedSegment.entity.ts:24` — unión de tipos equivalente.
- `apps/web/src/views/sequenceEditorShared.ts:37` — `CONDITION_PAYMENTS` (condición "Solo si
  pago" de MessageSequencesView y GlobalMessageSequencesView).

## Frontend

- `apps/web/src/views/PaymentsView.vue` — pestañas Saldos (`ParticipantBalances.vue`) y Pagos
  (`PaymentManagement.vue`).
- `ParticipantBalances.vue`: estado local propio (`isPazYSalso = balance <= 0`; badges Becado /
  Paz y salvo / Pendiente), toggle beca espejo (~288-309, `window.confirm`,
  `participantStore.updateParticipant(id, { isScholarship, contextRetreatId })`), recordatorio
  WhatsApp (`canWhatsapp` ~312), filtro estado (~472), orden (~191), export Excel con columna
  "Estado" vía `statusLabel`. Gates: `canEditParticipant = participant:update` (56),
  `canRegisterPayment = payment:create` (57).
- `PaymentManagement.vue`: modal de pago con botón "🎓 Marcar como Becado" (~630-653; su confirm
  está hard-codeado en español — no se arregla en esta feature).
- `RecepcionView.vue`: badge Beca (~414), badge totalPaid, botón "Cobrar" inline con
  `!p.totalPaid` (~163-193, 400-430).
- `ParticipantList.vue` (lo usan Walkers/Servers/Angelitos/Canceled…): `statusMap` hard-codeado
  español (~755-765, sin `owing`), colores/emojis (~1976-1987), filtro cliente por igualdad
  exacta (~645-656). Prop `inline-phone-edit` (solo vista Palancas) = molde de la acción rápida.
- `PalancasView.vue`: wrapper de `ParticipantList type="walker"` con columnas fijas
  (incluye `lastPaymentDate`); edición de teléfonos vía `ParticipantQuickPhoneEditor` gate
  `participant:update` (CA12 de `specs/palancas-quick-phone-edit/spec.md`).
- `FilterDialog.vue` (~68, 182-190): opciones del filtro con i18n.
- `EditParticipantForm.vue` (~157): grupo Financiero — computados en `READ_ONLY_COMPUTED_FIELDS`,
  `isScholarship` editable. Layout "palancas" cuando `columnsToShow` incluye
  `palancasCoordinator` (diálogo Gestionar Palancas).
- `constants/participantFieldControls.ts`: `paysAtHouse` NO se infiere booleano (no empieza con
  is/has/requests) → necesita entrada exacta.
- i18n: archivos únicos `apps/web/src/locales/es.json` / `en.json` (key ausente = key cruda).
- `apps/web/src/test/setup.ts`: mock allowlist de lucide (ícono nuevo sin entrada rompe `mount()`).

## Roles y permisos (verificado)

- `communications` (perfil de los palanqueros): tiene `participant:update` y `participant:read`
  (`20250910163337_CreateSchema.ts:953-979`, línea 961), y `payment:read/list`
  (migración `20260422120000`). → ve Palancas y puede usar una acción gateada con
  `participant:update` sin ningún cambio de permisos.
- Escritura de pagos: retreat admin, treasurer, logistics. `regular_server` es solo lectura.

## Migraciones — patrón canónico

- `20260610120000_AddRetreatFeesMealsAndDebts.ts`: ALTER TABLE ADD COLUMN en
  `retreat_participants`, SQL plano, cero imports del workspace (regla dura para prod),
  documentación del guard `sqliteSafePattern.simple.test.ts`.
- `20250910163337_CreateSchema.ts:153` crea `retreat_participants` desde cero → hay que sumar la
  columna ahí también para DBs frescas.

## Tests existentes a extender

- Backend: `apps/api/src/tests/services/paymentStatus.test.ts` (getter maestro),
  `crossRetreatPayments.test.ts` (aislamiento per-retiro),
  `receptionTotalPaid.integration.test.ts`.
- Frontend: `components/__tests__/ParticipantBalances.test.ts`, `ParticipantList.test.ts`,
  `views/__tests__/RecepcionView.totalPaid.test.ts`, `participantFieldControlParity.test.ts`.

## Trampas catalogadas que aplican aquí

- `select` explícito del overlay: columna no listada = virtual siempre false (badge fantasma).
- Destructure + zod: campo sin declarar = toggle silenciosamente no persiste.
- `evaluateFilters` en lote: divergencia lista↔segmentos↔secuencias.
- Ícono lucide sin allowlist en `setup.ts`.
- Una sola corrida de jest a la vez (SQLITE_MISUSE fantasma).
