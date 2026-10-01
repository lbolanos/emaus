# Spec: Resolución de plantillas en secuencias + guard anti-retroactivo

**Estado**: en desarrollo · **Branch**: `sequence-template-resolution` (worktree) · **Fecha**: 2026-10-01

## Problema

Reporte de Leonardo (2026-10-01): *"cuando creo una plantilla nueva y la quiero utilizar en una
secuencia no funciona correctamente. Creé Ultimo Prendas y no funciona correctamente"*. Dos fallas
independientes, verificadas contra código y datos (dev = copia de prod del mismo día):

### Falla 1 — Plantilla nueva inalcanzable (colisión de tipo)

Leonardo creó "Reconfirmar Prendas" con tipo `SERVER_SHIRT_CONFIRMATION`, que ya existía en Buen
Despacho (`e9b3c568-…`) como "Confirmación de prendas" (`74d8e87b`). El paso de secuencia persiste
`templateType` (no el id de plantilla) y el motor resuelve la **primera** fila de
`(retreatId, type)` — gana la vieja. La nueva plantilla es inalcanzable por construcción.

- `apps/api/src/services/messageSequenceService.ts:851-857` (batch de `processDue`), `:1244`,
  `:1719`, `:1863`, `:2166` — `findOne({retreatId, type})` sin order.
- Trampa de UI: `apps/web/src/views/MessageSequencesView.vue:2086` — el `<select>` muestra
  **nombres** pero el `value` es el `type` (idéntico para ambas opciones).
- Sin índice único `(retreatId, type)` en `message_templates` → el duplicado entra sin aviso.

Es la **segunda ocurrencia** de esta clase (incidente de palancas de Luis, 2026-09-13): bug de
clase, no puntual.

### Falla 2 — Enrolamiento retroactivo

La secuencia "Ultimo Prendas" (`a41ad6fb`) se creó con un paso a `offsetDays=20` con el retiro a
15 días → `scheduledFor` en el pasado. `enrollSequence` solo filtra retiros *cerrados* →
materializa pasos con fecha pasada → el cron los procesa como vencidos. Estado en prod: secuencia
ACTIVA, **28 mensajes `queued` vencidos** en la bandeja de despacho WhatsApp, 1 `sent`
(despachado a mano a un participante real, con `{custom_message}` literal sin resolver).

## Decisiones de dominio (cerradas con Leonardo, 2026-10-01)

1. **Plantilla**: se borra la VIEJA ("Confirmación de prendas" `74d8e87b`); la nueva
   "Reconfirmar Prendas" queda como única `SERVER_SHIRT_CONFIRMATION` del retiro.
2. **Sent de Marco**: NO se borra. La cirugía purga solo las 28 `queued`; Marco queda excluido
   de la reconfirmación (la UQ `(stepId, participantId, occurrenceYear)` lo impide). Si el
   equipo quiere reenviarle, es envío manual.
3. **Fecha del paso**: `offsetDays=5` → 11 oct (5 días antes del retiro 16-18 oct). La
   secuencia queda **pausada**; Leonardo la revisa y la activa.
4. **`{custom_message}`**: dentro de este plan (hallazgo secundario, alcance chico).

## Objetivo

1. **Cirugía de datos en prod** (M1): pausar, purgar queued, borrar plantilla vieja, corregir
   offset — vía migration data-only.
2. **Guardas anti-retroactivas** (M2): el motor no materializa pasos con fecha pasada al enrolar;
   el editor lo muestra antes de guardar.
3. **Fix estructural** (M3): el paso referencia `templateId` con fallback a `type` — permite
   varias plantillas del mismo tipo (caso de uso real: 3ª comunicación de prendas sin tipo
   propio disponible).
4. **`{custom_message}` accionable** (M4): limpieza en plantillas existentes + guard al
   despachar.

## Historias de usuario

- Como coordinador, creo una segunda plantilla del mismo tipo y la uso en un paso de secuencia,
  y el motor envía **esa** plantilla, no la primera que exista.
- Como coordinador, al activar una secuencia cuyo paso cae en el pasado, el sistema no
  materializa mensajes retroactivos; el editor me advierte con la fecha en ámbar.
- Como coordinador, la bandeja de Buen Despacho ya no tiene los 28 vencidos de "Ultimo Prendas";
  al reactivar la secuencia, el paso cae el 11 oct.
- Como coordinador, una plantilla con `{custom_message}` (relleno manual) nunca se despacha
  literal desde una secuencia: salta como problema accionable.

## Requerimientos

- R1: Migration data-only idempotente que ejecute la cirugía de las decisiones 1-3 en dev y prod.
- R2: `enrollSequence` suprime (sin fila `skipped`) pasos cuya fecha calculada sea anterior a
  hoy en la TZ del retiro, salvo catch-up legítimo de `participant_created` (≤2 días).
- R3: `sequence_steps.templateId` nullable con backfill determinista por `(retreatId, type)` más
  antiguo; resolución por id validando retiro, con fallback a type.
- R4: El editor de secuencias selecciona plantilla por **id** y muestra el nombre resuelto en
  bandeja/detalle (`templateName` server-side).
- R5: Duplicados de type PERMITIDOS (sin 409 ni exclusión de types) — con aviso informativo.
- R6: Guard de `{custom_message}` en `processDue`/`regenerateQueuedForRetreat`/`previewStep` +
  migration de limpieza en plantillas `GENERAL`.

## Criterios de aceptación

- CA1: tras M1 en prod: 1 sola plantilla `SERVER_SHIRT_CONFIRMATION` en Buen Despacho, 0 queued
  de `a41ad6fb`, `isActive=0`, `offsetDays=5`, fila en `migrations`.
- CA2: re-enrolar "Ultimo Prendas" tras activarla → materializa SOLO el paso del 11 oct.
- CA3: paso con `templateId` apuntando a plantilla de OTRO retiro → cae al fallback por type.
- CA4: crear una 2ª plantilla del mismo type y seleccionarla en un paso → el preview y el envío
  usan esa.
- CA5: crear una secuencia con paso en fecha pasada y activarla → 0 filas materializadas
  retroactivas; el editor muestra el paso en ámbar.
- CA6: plantilla con `{custom_message}` en una secuencia → mensaje `skipped` con error que dice
  qué editar; en `GENERAL` existentes el placeholder queda reemplazado.

## Fuera de alcance

- Edición del snapshot encolado desde la bandeja (el texto se corrige editando la plantilla +
  "Regenerar").
- API de WhatsApp automática (el canal sigue siendo despacho asistido por deep-link).
- `scheduled_messages.templateId` (todo consumidor tiene `sm.step`; `templateType` queda como
  fallback desnormalizado).
- Pasos globales (`global_sequence_steps`) por id — sin retiro no hay id local; siguen por type.
- Índice único `(retreatId, type)` en `message_templates` — contradice R5.
