# Spec: edición rápida de teléfonos para Palancas

**Estado**: en desarrollo · **Branch**: `palancas-quick-phone-edit` (worktree
`.claude/worktrees/palancas-quick-phone-edit`) · **Fecha**: 2026-10-07

## Problema

Cuando un tercero (p. ej. la esposa) inscribe a un caminante por el registro público, la ficha
queda con el teléfono de quien llenó el formulario en `participants.cellPhone`. El modelo no
tiene campo "quien inscribe" y el wizard no ofrece otro lugar natural para ese número (los
campos del invitador — `Step5OtherInfo.vue` — son opcionales y semánticamente distintos: "quién
lo invitó a Emaús").

Ese número es crítico para la operación de palancas:

- La cola de WhatsApp masiva usa `sanitizePhoneForWhatsapp(p.cellPhone)`
  (`apps/web/src/components/WhatsAppSendQueue.vue:53`).
- La plantilla `PALANQUERO_NEW_WALKER` incluye `{participant.cellPhone}` (texto sembrado en
  `apps/api/src/migrations/sqlite/20260914120000_FormatWhatsappMessageTemplates.ts:156-162`).
- La confirmación de asistencia (`recipientTarget: 'participant'`) se resuelve contra
  `participant.cellPhone`.
- Las peticiones de cartas (`PALANCA_REQUEST`/`PALANCA_REMINDER`) van a los contactos de
  emergencia 1 y 2 (`messageSequenceService.ts:610-625`), que también llegan con el teléfono de
  quien inscribió o sin teléfono.

Corregirlo hoy exige: vista Caminantes → buscar la fila → lápiz → diálogo completo de edición
(`EditParticipantForm`, hasta 11 secciones, `max-w-4xl`, scroll `max-h-[70vh]`, campos que
crecen con las columnas visibles del usuario: `formColumnsToShow/Edit = columnsToShowInForm ∪
visibleColumns`, `ParticipantList.vue:807-819`) → tocar un campo → Guardar reenviando el DTO
completo por spread. Además esa vía **no valida teléfono** ni canoniza por país: el
`updateParticipantSchema` es `participantSchema.partial()` con `z.string()` plano y el service
normaliza sin país (`participantService.ts:3001`).

Cita del usuario (2026-10-07): «para las palancas es muy difícil cambiar un teléfono de un
caminante cuando lo ha inscrito su esposa por ejemplo. Tiene el teléfono de la esposa y no del
caminante. Necesito una forma rápida de cambiar eso para las palancas». Y la ampliación de
alcance del mismo día: «también que se pueda cambiar o agregar teléfono de contactos de
emergencia».

## Decisiones de dominio (cerradas con Leonardo, 2026-10-07)

1. **Superficie**: edición rápida en dos lugares, con el mismo componente editor: (a) ✏ junto
   al número en el header del diálogo "Gestionar Palancas" (layout `isPalancasView` de
   `EditParticipantForm`), y (b) columna "Celular" nueva en la tabla de la vista Palancas con
   ✏ inline. Nada dentro de la cola de WhatsApp (`WhatsAppSendQueue`).
2. **Campos** (ampliada a mitad de sesión): `cellPhone` del caminante +
   `emergencyContact1CellPhone` + `emergencyContact2CellPhone` (cambiar o agregar; EC2 suele
   estar vacío). Un solo mini-editor con los 3 campos.
3. **Endpoint dedicado** `PATCH /participants/:id/phones` en vez de reusar el `PUT`: el PUT no
   valida formato ni canoniza por país, y su preprocess `''→undefined` impide limpiar un campo
   (memoria `feedback_zod_optional_empty_string`). El PATCH replica el patrón de validación del
   create (`participantController.ts:419-439`): valida contra `retreat.house.country` y
   canoniza a número nacional.
4. **Sin migración**: los 3 campos ya existen en `participants`; el feature no toca
   `retreat_participants` ni crea columnas.

## Objetivo

1. Corregir el celular del caminante desde la vista Palancas en 2 clicks, sin abrir la ficha
   completa (→ M2).
2. Agregar o corregir los celulares de los contactos de emergencia en el mismo editor (→ M2).
3. Mismo editor disponible en el diálogo de palancas (→ M3).
4. El número guardado queda validado y canonizado por el país de la casa del retiro, y auditado
   (→ M1).

## Historias de usuario

- **Como palanquero/coordinador**, cuando veo en la vista Palancas que el celular de un
  caminante es el de quien lo inscribió, quiero corregirlo ahí mismo en la fila, para que la
  cola de WhatsApp y el aviso al palanquero lleven el número correcto.
- **Como palanquero**, cuando el contacto de emergencia no tiene celular (o tiene el de la
  esposa que inscribió), quiero agregarlo o cambiarlo sin abrir la ficha completa, para que la
  petición de cartas le llegue a la persona correcta.
- **Como servidor sin permiso de edición** (p. ej. `regular_server`), no debo ver el ✏ ni poder
  cambiar teléfonos.

## Requerimientos

- **R1 (M1)**: endpoint `PATCH /participants/:id/phones` que acepta **solo**
  `cellPhone`/`emergencyContact1CellPhone`/`emergencyContact2CellPhone` (+ `retreatId` para el
  access check), exige `participant:update`, valida cada valor contra el país de la casa del
  retiro y responde angosto `{ id, cellPhone, emergencyContact1CellPhone,
  emergencyContact2CellPhone }`.
- **R2 (M1)**: semántica de vacío explícita: `''` en `cellPhone` o `emergencyContact1CellPhone`
  → 400 (ambos NOT NULL); `''` en `emergencyContact2CellPhone` → persiste `null` (limpiar).
- **R3 (M1)**: canonización a número nacional (`toNationalPhone`) antes de persistir, y audit
  `logUpdate` con allowlist propia de los 3 campos.
- **R4 (M2)**: componente editor único (`ParticipantQuickPhoneEditor`) con los 3 campos,
  etiquetas que identifiquen a quién pertenece cada número, validación por país al guardar,
  que envía solo los campos cambiados.
- **R5 (M2)**: la vista Palancas muestra la columna "Celular" con ✏; las demás vistas que usan
  `ParticipantList` quedan intactas (prop `inlinePhoneEdit` default `false`).
- **R6 (M2)**: al guardar, la fila se actualiza sin recargar (patch optimista con rollback y
  sobrescritura con los valores canónicos del servidor).
- **R7 (M3)**: el mismo editor cuelga del número del header del diálogo "Gestionar Palancas";
  al guardar, el diálogo refresca el participante en edición.
- **R8 (M3)**: strings de UI nuevos bilingües (es+en); sin permiso `participant:update` no se
  renderiza el ✏.

## Criterios de aceptación

- **CA1 (M1)**: `PATCH /participants/:id/phones` con `{ cellPhone: '55 1234 5678',
  retreatId }` persiste `5512345678` (nacional, sin espacios) y responde 200 angosto.
- **CA2 (M1)**: `+52 55 1234 5678` y `04455 1234 5678` se canonizan a `5512345678`.
- **CA3 (M1)**: `'123'` (largo inválido para MX) → 400 con mensaje que nombra el campo.
- **CA4 (M1)**: `''` en `cellPhone` o EC1 → 400; `''` en EC2 → 200 y queda `null` en la base.
- **CA5 (M1)**: sin rol con `participant:update` → 403; con `retreatId` de otro alcance → 403.
- **CA6 (M1)**: el cambio queda en DomainAudit (allowlist de los 3 campos).
- **CA7 (M2)**: en `/app/palancas`, la fila muestra el celular con ✏; al corregir y guardar, el
  valor nuevo aparece en la fila sin recargar la página.
- **CA8 (M2)**: se puede agregar un EC2 vacío→valor desde el editor; el payload solo incluye
  los campos que cambiaron.
- **CA9 (M2)**: en `/app/walkers` (y demás vistas que usan `ParticipantList`) no aparece el ✏ ni
  cambia el diálogo de edición.
- **CA10 (M3)**: el ✏ del header del diálogo palancas corrige el número y el header muestra el
  valor nuevo; los campos EC del colapsable se refrescan.
- **CA11 (M3)**: número inválido en el editor → error en español/español-inglés según locale, y
  no se envía el request.
- **CA12 (M3)**: usuario sin `participant:update` no ve el ✏ en tabla ni diálogo.

## Fuera de alcance

- Re-resolver snapshots de mensajes ya encolados: `sm.resolvedContact`
  (`messageSequenceService.ts:1285`) conserva el número viejo en los pasos ya encolados; los
  pasos futuros y la cola masiva sí toman el corregido. Limitación conocida, documentada en
  `docs/features`.
- Editar otros teléfonos (home/work) del caminante, invitador o contactos.
- Cambiar el formulario de registro público (capturar "¿de quién es este teléfono?") o modelar
  un campo "registrador".
- Edición masiva (bulk) de teléfonos.
- Edición dentro de la cola de WhatsApp (`WhatsAppSendQueue`).
