# Total pagado por caminante en Recepción

La vista de **Recepción** (`/app/.../recepcion`) muestra junto a cada caminante
el **total que ha pagado** para el retiro, como una etiqueta tipo badge. Sirve
para que en la mesa de recepción se vea de un vistazo quién va al corriente y
quién debe saldo al llegar.

## Comportamiento

- Cada renglón (en **Pendientes de llegar** y en **Ver llegados**) muestra un
  badge `$<monto>` después del nombre/hora.
- El monto es la **suma de todos los pagos** (`payments.amount`) del participante
  **en ese retiro**. Pagos de otros retiros no se cuentan.
- Si el caminante no tiene pagos, el badge muestra `$0` en gris (muted). Con al
  menos un pago, el badge se pinta en verde.
- El monto se formatea con `es-MX` sin forzar centavos (`$1,500`, `$2,750.5`).
- Se actualiza con el polling/realtime existente de la vista (check-in,
  bag-made); no hay un canal nuevo.

## Implementación

### Backend

`apps/api/src/services/participantService.ts` → `getReceptionStats(retreatId)`:

- Carga todos los `Payment` del retiro (`paymentRepo.find({ where: { retreatId } })`).
- Agrega por `participantId` en un `Map<string, number>` sumando `Number(amount)`
  (el campo es `decimal`, llega como string desde SQLite).
- Cada entrada de `pendingList` y `arrivedList` incluye `totalPaid`. Si el
  `RetreatParticipant` no tiene `participantId` vinculado, `totalPaid` es `0`.

El cálculo es **al vuelo**, igual que en `PaymentManagement`. No existe una
columna persistida de total pagado.

### Frontend

- `apps/web/src/services/api.ts`: la interfaz `ReceptionParticipant` declara
  `totalPaid: number`.
- `apps/web/src/views/RecepcionView.vue`:
  - `formatCurrency(amount)` formatea el monto (`toLocaleString('es-MX', …)`).
  - Un `<span>` badge tras el nombre en ambas listas, con clase condicional
    verde / muted según `p.totalPaid > 0`.
- `apps/web/src/locales/es.json`: clave `reception.totalPaid` ("Total pagado")
  usada como `title` del badge (tooltip).

## Tests

- **Backend** — `apps/api/src/tests/services/receptionTotalPaid.integration.test.ts`
  (integración con `testDataSource`):
  - Suma varios pagos del mismo caminante.
  - `totalPaid === 0` sin pagos.
  - No suma pagos de otro retiro al mismo participante.
  - `totalPaid` presente en `arrivedList` tras el check-in.
- **Frontend** — `apps/web/src/views/__tests__/RecepcionView.totalPaid.test.ts`:
  - Renderiza el monto formateado en pendientes.
  - Muestra `$0` cuando no hay pagos.
  - Renderiza el total con decimales en la lista de llegados.
  - Pinta el badge en verde con pago y en muted (`text-muted-foreground`,
    sin verde) cuando el monto es `$0`.

> La lógica de orden/búsqueda de la vista se prueba aparte en
> `RecepcionView.sort.test.ts` (su factory de fixtures también incluye ahora
> `totalPaid`).
