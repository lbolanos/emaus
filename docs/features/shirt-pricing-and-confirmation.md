# Precio de camisetas y confirmación a servidores

Dos piezas relacionadas:

1. **Precio por tipo de prenda**: cada `retreat_shirt_type` puede tener un `price`; el valor de las prendas pedidas se suma al saldo esperado de **servidores y angelitos** (no del caminante — su prenda va incluida en la cuota del retiro).
2. **Secuencia de confirmación**: un aviso + recordatorio por WhatsApp (asistido) que le muestra a cada servidor/angelito su pedido actual (prendas, tallas, valor) para que lo confirme o corrija antes del retiro.

> No confundir con [Reporte de Camisetas](./shirts-report.md) (vista de confirmación en papel para la reunión semanal) — esa vista ahora también muestra el valor por prenda, pero es un documento aparte.

---

## 1. Precio y cargo computado

### Dónde se configura

`/app/settings/shirt-types` (`RetreatShirtTypesView.vue`) — campo **"Precio ($)"** por tipo de prenda, con el helper "Vacío o 0 = sin cargo". Columna `retreat_shirt_type.price` (`decimal(10,2)`, nullable).

### Cómo se cobra

El cargo **es computado**, no una fila manual en `participant_debts`: se deriva en caliente de `participant_shirt_size` en `Participant.computeCharges()` (`apps/api/src/entities/participant.entity.ts`). Consecuencia práctica: si el coordinador cambia la talla o el tipo de prenda de alguien, el saldo se recalcula solo, sin tocar nada más.

```ts
// Participant.totalShirtCharge — suma las prendas del retiro EN CONTEXTO
// (participant_shirt_size es global al participante; el filtro es vía
// shirtType.retreatId, porque esa tabla no tiene retreatId propio).
get totalShirtCharge(): number { /* ... */ }

// computeCharges(): shirts solo para server/partial_server.
const shirts = this.type === 'server' || this.type === 'partial_server'
  ? this.totalShirtCharge
  : 0;
expected = round2(retreatFee + meals + debts + shirts);
```

`chargeBreakdown.shirts` se expone en la UI de Saldos (`ParticipantDebtManager.vue`, fila "Prendas") y en el Reporte de Camisetas (columna "Valor" + tile "Valor total").

Becado (`isScholarship`) sigue exento de todo — sin cambios, el early return de `computeCharges()` ya cubría este caso.

---

## 2. Secuencia "Confirmación de camisetas (servidores)"

Sembrada por la migración `20260910120000_ServerShirtPricingAndConfirmation` como plantilla **global** (se importa por retiro, queda inactiva hasta que el coordinador la activa — mismo patrón que el resto del catálogo en `/app/settings/global-message-sequences`).

| Paso | Offset | Canal | Destinatario | Plantilla |
|---|---|---|---|---|
| Aviso | 21 días antes del retiro | WhatsApp (asistido) | Participante | `SERVER_SHIRT_CONFIRMATION` |
| Recordatorio | 7 días antes del retiro | WhatsApp (asistido) | Participante | `SERVER_SHIRT_CONFIRMATION_REMINDER` |

Audiencia `server` (→ `server` + `partial_server`, cubre angelitos). Sin `maxOverdueDays`: un retiro a menos de 21 días igual dispara el aviso como catch-up legítimo (mismo criterio que "Pre-retiro: palancas"); el único freno es `isRetreatClosed` por `endDate`.

El mensaje usa dos variables nuevas:

- `{participant.shirtOrderSummary}` — una línea por prenda pedida (`• Nombre (talla X) — $precio`, sin el sufijo de precio si es `0`/`null`); fallback `"Aún no has configurado tus tallas"` cuando no hay filas.
- `{participant.shirtCharge}` — el total formateado (`formatCurrency`).

---

## 3. Las variables tienen TRES caminos de resolución (lección de esta feature)

La primera versión de esta feature solo resolvía estas dos variables en el **motor de secuencias automáticas**. El envío **manual** (botón "Enviar mensaje" desde Saldos/Angelitos/Servidores) y el **editor de plantillas** con preview quedaron mostrando las variables vacías, con el warning "esta plantilla tiene variables sin datos" — porque arman el participante desde un objeto ya en memoria (una fila de lista), sin `shirtSizes` cargado.

Se resolvió replicando el mismo patrón que ya existía para `{retreat.next_meeting_date}` (`getParticipantNextMeeting`): un endpoint dedicado + fetch en cada componente de UI.

| Camino | Dónde resuelve | Cómo |
|---|---|---|
| Motor de secuencias | `messageSequenceService.ts` (`resolveContent`/`previewStep`) | Server-side, sin HTTP: llama directo a `getParticipantShirtOrderSummary` cuando el mensaje contiene `{participant.shirt` (hidratación perezosa, mismo patrón que `{table.*}`). |
| Envío manual | `MessageDialog.vue` | `loadShirtOrder()` (dispara junto con `loadNextMeeting()` al abrir el diálogo) llama a `getParticipantShirtOrder(participantId, retreatId)` y lo inyecta en `participantData` dentro de `updateMessagePreview()`. |
| Editor de plantillas (preview) | `BaseMessageTemplateModal.vue` | El `watch(selectedParticipant, ...)` que ya resolvía `previewNextMeetingDate` también llama a `getParticipantShirtOrder` y lo inyecta en el `participantData` del `previewMessage` computed. Sin participante seleccionado, cae al mock de `@repo/utils` (`getMockParticipant`). |

### El endpoint compartido

```
GET /participants/:id/shirt-order?retreatId=<uuid>
Permiso: participant:read + ensureRetreatAccess(retreatId)   (el retiro llega por query param,
                                                                requireRetreatAccess no lo cubre)
→ { shirtOrderSummary: string, shirtCharge: number }
```

La lógica vive en `shirtReportService.getParticipantShirtOrderSummary(participantId, retreatId)` — un solo lugar, importado tanto por `messageSequenceService.ts` como por `participantController.getParticipantShirtOrder`. Vive en `shirtReportService` (no en `participantService` ni en `messageSequenceService`) para evitar un import circular entre esos dos servicios.

**Regla para la próxima variable de plantilla que dependa de un dato no incluido en el `Participant` liviano**: verificar los tres caminos antes de dar la feature por cerrada, no solo el motor de secuencias.

---

## Tests

### Backend (Jest)

```
apps/api/src/tests/services/paymentStatus.test.ts        — cargo computado (9 casos: server/walker/partial_server/becado/otro-retiro/sin-relación/paymentRemaining)
apps/api/src/tests/services/shirtReportService.test.ts   — price/shirtCharge/totalCharge (5 casos nuevos)
apps/api/src/tests/migrations/serverShirtPricingAndConfirmation.simple.test.ts — seed-and-verify de la migración (6 casos)
apps/api/src/tests/services/shirtConfirmationSequence.test.ts — resolución de variables en el motor de secuencias (4 casos: resumen con precio, fallback, aislamiento por retiro, audiencia)
apps/api/src/tests/controllers/participantShirtOrder.authz.integration.test.ts — autorización del endpoint (5 casos: 400 sin retreatId, 401 sin user, 403 sin acceso, 200 con resumen, aislamiento por retiro)
```

### Frontend (Vitest)

```
apps/web/src/components/__tests__/MessageDialog.test.ts        — 36 casos (sin regresión tras agregar loadShirtOrder)
apps/web/src/components/__tests__/ParticipantDebtManager.test.ts — fila "Prendas" en el desglose
apps/web/src/views/__tests__/ShirtsReportView.test.ts           — columna Valor + tile Valor total
apps/web/src/utils/__tests__/messageTemplateI18n.test.ts        — guard de i18n para los 2 tipos de plantilla nuevos
```

`BaseMessageTemplateModal.vue` no tiene suite de tests dedicada (verificado manualmente con Playwright: fallback correcto sin participante/con caminante, resolución correcta con un servidor con prendas).

---

## Trabajos relacionados

- [Reporte de Camisetas](./shirts-report.md) — columna Valor y tile de total.
- [CRM de mensajería](./crm-messaging.md) — motor de secuencias, plantillas globales, bandeja de WhatsApp asistida. La sección "Pack sembrado" de ese doc describe el pack de `CrmSequencingSchemaAndSeed` (4 secuencias); esta secuencia vive en su propia migración (`ServerShirtPricingAndConfirmation`) y no forma parte de ese pack.
- Configuración de tipos de playera: `/app/settings/shirt-types` (`RetreatShirtTypesView.vue`).
