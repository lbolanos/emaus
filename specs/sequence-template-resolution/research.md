# Research: estado actual del código (pre-M1)

Verificado contra el código y contra datos (dev = copia de prod del 2026-10-01). Líneas al
momente del HEAD `3faf76c2`.

## Entities (`apps/api/src/entities/`)

- `SequenceStep`: NO tiene `templateId` (solo `templateType` NOT NULL).
- `ScheduledMessage`: guarda `templateType` + snapshots (`resolvedContent`/`resolvedContact`/
  `recipientName`) y **UQ `(stepId, participantId, occurrenceYear)`** — no templateId. La UQ es
  la razón de suprimir (no skipear) en el guard de enrol: una fila skipped bloquearía el
  re-enrol tras corregir el offset.
- `MessageTemplate`: sin unique `(retreatId, type)` (índice plano solo retreatId).

## Resolución `(retreatId, type)` — 5 sitios en `messageSequenceService.ts`

| Línea | Sitio | Nota |
| --- | --- | --- |
| 851-857 | batch de `processDue` | map por `${retreatId}:${type}`, `if (!templates.has(key))` → gana la de menor rowid |
| 1244 | `recordWhatsappCommunication` (auditoría dispatch) | findOne sin order |
| 1719 | `previewStep` | findOne sin order |
| 1863 | `getQueueItemDetail` (fallback de snapshot) | findOne sin order |
| 2166 | `regenerateQueuedForRetreat` | findOne sin order |

Fuera del motor: `userManagementMailer.ts` (3×, no secuencias, no se toca);
`globalMessageTemplateService.copyToRetreat` (**único** con upsert anti-duplicado); fallback
del cliente `MessageSequencesView.vue:1083` (`templates.find(x => x.type === item.templateType)`,
primera coincidencia).

## Endpoints

- Sin endpoint de pausa dedicado — pausar = `PUT /message-sequences/:id {isActive}`
  (`updateSequence` 1329-1367; desactivar NO toca filas materializadas).
- Purga de queued: solo `POST /scheduled/:id/discard` individual (2072; queued ES origen
  válido). El bulk `/issues/bulk` **excluye queued** por diseño (2109) → la purga de las 28 va
  por migration.
- `updateSequence` con cambio de semántica (trigger/audience/segmentId) hace DELETE físico de
  pending (1378-1386) — precedente del DELETE del guard de enrol.

## Creación de duplicados

`POST /message-templates` no chequea type duplicado (controller 84-95, service 47-50, Zod shape
puro). `BaseMessageTemplateModal.availableTypes` (578-599) no excluye types ya usados → el
duplicado es creable desde la UI normal. **Se mantiene así** (R5): el aviso es informativo.

## `{custom_message}`

NO es variable de plantilla — es placeholder "rellena tú" del flujo manual
(`BaseMessageTemplateModal` 767-772). `replaceAllVariables` (`packages/utils` 1518-1575) deja
unknowns intactos; las seeds lo escriben en plantillas (`CreateSchema:1029`,
`FormatWhatsappMessageTemplates:122,371`); la bandeja WhatsApp no tiene paso de edición → se
despacha literal. La plantilla VIEJA `74d8e87b` lo contiene (el mensaje a Marco salió con
`{custom_message}` crudo).

## Retroactividad

- `computeScheduledFor` (235-290) no valida pasado.
- Frenos actuales: `isRetreatClosed` (212-229, solo fin de retiro) y `maxOverdueDays` al ENVIAR
  (932-940; null = catch-up ilimitado). Nada al materializar.
- `rescheduleStep` (1656-1682) sin guard server-side (la UI sí avisa `reschedIsPast`).

## Editor (`apps/web/src/views/MessageSequencesView.vue`)

- Timeline de fechas por paso ya existe (`stepDates` 352-378, endpoint `schedule-preview`
  resuelto server-side con `computeScheduledFor`).
- `stepsWithMissingTemplate` (267-271) solo cubre type inexistente, no duplicado.
- `templateLabel` (747-750) muestra la primera coincidencia por type.
- Select trampa: 2085-2087 — `:value="tpl.type"` con `v-model="step.templateType"`.
- `saveDraft` (396-416) mapea steps sin templateId; `duplicateSequence` (497-524) igual.

## Datos de prod (IDs estables entre entornos — dev es copia)

| Entidad | ID | Estado |
| --- | --- | --- |
| Retiro Buen Despacho (16-18 oct 2026) | `e9b3c568-050a-4d66-a99d-305f287a59df` | — |
| Plantilla VIEJA "Confirmación de prendas" | `74d8e87b-8455-4187-8941-0b17f8911545` | a borrar (M1) |
| Plantilla NUEVA "Reconfirmar Prendas" | `62fec9ab-e77c-4c6d-bc1b-61bb28c1e1de` | única SERVER_SHIRT_CONFIRMATION tras M1 |
| Secuencia "Ultimo Prendas" | `a41ad6fb-5e64-42d7-9b5f-7c5004c9c0b2` | ACTIVA con 28 queued vencidos + 1 sent |
| Paso (offsetDays 20→5) | `734196da-f22d-4fb3-a3f0-72bbf812dbee` | — |
| Sent de Marco (queda) | — | dispatchedBy `2e04e70a-b2bb-4824-a118-9005d77f9ff2` |

`participant_communications` NO tiene FK a `message_templates` → borrar la plantilla vieja no
cascadea.

## Tests base existentes

`messageSequence.test.ts` (computeScheduledFor/isRetreatClosed/enrollSequence),
`messageSequenceProcessScope.test.ts`, `sequenceRecipientsAndSeed.test.ts` (previewStep),
`shirtConfirmationSequence.test.ts`, `messageVariables.test.ts`,
`controllers/messageSequenceAssign.integration.test.ts`.

## Antecedente de cirugía

`apps/api/src/migrations/sqlite/20260913193000_FixBuenDespachoPalancasSequence.ts` — patrón de
migración de datos puntual por id de prod, idempotente, sin `@repo/types`.
