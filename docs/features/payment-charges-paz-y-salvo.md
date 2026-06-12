# Cobros por tipo, comidas y deudas — "paz y salvo" v2

Estado de cuenta per-participante per-retiro. **"Paz y salvo" = balance en 0**
(`totalPaid >= expected`). Reemplaza al modelo anterior donde el monto esperado era
el mismo para todos (el texto `retreat.cost` parseado).

## Modelo de cobros

El monto esperado se **computa** (no se materializa) en
`apps/api/src/entities/participant.entity.ts` (`computeCharges` → `chargeBreakdown`,
`paymentStatus`, `paymentRemaining`), a partir de:

| Tipo | Cobro del retiro | Comidas |
| --- | --- | --- |
| `walker` / `waiting` | `retreat.cost` (texto, parseado) | — |
| `server` | `retreat.serverFeeAmount`; **si está vacío, paga lo mismo que el caminante** (`cost`) | + 1 × `mealCost` si `takesFridayMeal` |
| `partial_server` (angelito) | **$0** (no se le cobra el retiro) | `mealCount` × `mealCost` |

- `expected = cobroRetiro + comidas + Σ deudas manuales` (redondeado a centavos).
- **Becado** (`isScholarship`): exento de TODO → `expected = 0`, status `scholarship`,
  paz y salvo automático. `scholarshipAmount` es **informativo/auditoría** (no afecta el
  cálculo; solo se valida que no supere el cobro del retiro).
- Los angelitos **ya no se fuerzan a beca** al inscribirse (regla anterior eliminada).
- El parseo de `cost` y el cobro por tipo viven en el helper único
  `apps/api/src/utils/retreatCharges.ts` (`parseRetreatCost`, `retreatFeeForType`).

## Configuración del retiro (tab Finanzas de RetreatModal)

- `cost` (texto existente) = cobro del **caminante** (con aviso en UI si no es numérico).
- `serverFeeAmount` = cobro del **servidor** (vacío → cae a `cost`).
- `mealCost` = valor de **una** comida. **Si está vacío o 0, el registro NO pregunta
  por comidas** (los endpoints públicos `/retreats/public/...` exponen `mealCost` para esto).

## Captura de comidas

- Registro nuevo (paso 5 servidor, `Step5ServerInfo.vue`): checkbox "comida del viernes";
  con el toggle "angelito" → input "¿cuántas comidas?".
- Flujo "ya estoy registrado" (confirmación por email): mismos campos →
  `confirmExistingParticipant(email, retreatId, type, shirtSizes, meals)`.
- Admin: editables en la ficha (grupo Financiero) y vía `updateParticipant`.
- Tope suave: `mealCount` ≤ nº de items `type='comida'` del schedule del retiro
  (error `MEAL_COUNT_EXCEEDS_RETREAT_MEALS`, 400). Sin schedule → sin tope.
- Import de Excel: columnas opcionales `numerocomidas` y `comidaviernes` (S/N).

## Deudas manuales (cobros adicionales)

- Solo para `server` / `partial_server`. Entidad `ParticipantDebt`
  (tabla `participant_debts`, espejo de `payments`), CRUD en `/api/participant-debts`
  (permisos `payment:*`, `ensureRetreatAccess`, validación Zod en rutas).
- **Concepto (`description`) obligatorio** al crear/editar.
- UI: botón "Agregar cobro" en la página de Pagos y `ParticipantDebtManager.vue`
  (desglose + CRUD), también embebido en el modal de pago y en la fila expandida de Saldos.

## UI (PaymentsView → tabs)

- **Saldos** (pestaña principal, `ParticipantBalances.vue`): tabla per-participante
  (esperado/pagado/balance/estado), filtros, orden persistente, columnas configurables,
  export a Excel, impresión (oculta montos agregados), fila expandible (desglose + pagos),
  acciones por fila: registrar pago, agregar cobro, recordatorio WhatsApp
  (usa `{participant.paymentRemaining}` como monto), marcar/quitar becado (gated por permisos).
- **Pagos** (`PaymentManagement.vue`): CRUD de pagos; en impresión NO se muestran
  "Total Recaudado" ni "Por Cobrar".
- Listas de participantes: columna por defecto **"Falta por pagar"** (`paymentRemaining`);
  `totalPaid` sigue disponible como columna opcional.
- Variable de plantilla `{participant.paymentRemaining}` disponible en mensajes
  (formateada como moneda).

## Regla crítica: scope per-retiro (incidente 2026-06-10)

Los participantes son **globales y multi-retiro**. Toda relación con `retreatId` propio
(`payments`, `debts`, `tags`, `retreatBed`) DEBE filtrarse por el retiro de contexto al
cargarla, y `participant.retreat` debe sobreescribirse con el retiro consultado (el FK
apunta al retiro *primario*). Si no, pagos/deudas/montos se mezclan entre retiros.
Implementado en `findAllParticipants` y `findParticipantById`; guard de regresión:
`apps/api/src/tests/services/crossRetreatPayments.test.ts`.

## Esquema (migración `20260610120000_AddRetreatFeesMealsAndDebts`)

- `retreat`: `serverFeeAmount`, `mealCost` (decimal 10,2 nullable).
- `retreat_participants`: `mealCount` (int nullable), `takesFridayMeal` (bool nullable).
- `participant_debts`: nueva tabla (FKs a participants/retreat/users).
- Aditiva (ADD COLUMN + CREATE TABLE), SQL plano sin imports del workspace.

## Tests principales

- `paymentStatus.test.ts` — cálculo por tipo, fallbacks, becado, redondeo.
- `crossRetreatPayments.test.ts` — aislamiento per-retiro.
- `participantDebt.integration.test.ts` + `participantDebt.audit.integration.test.ts`.
- `angelitoScholarship.test.ts` — angelito ya no se fuerza a beca.
- `fieldMapping.simple.test.ts` — columnas de comidas del Excel.
- Frontend: `ParticipantBalances.test.ts`, `ParticipantDebtManager.test.ts`,
  `PaymentManagement.search.test.ts`.

## Dinero: decisión consciente

Montos como `decimal(10,2)` + redondeo a centavos en cada getter (`Math.round(n*100)/100`)
y en `formatCurrency` de `@repo/utils`. La migración a centavos enteros en DB se evaluó y
se **difirió** (riesgo alto, beneficio bajo a esta escala).
