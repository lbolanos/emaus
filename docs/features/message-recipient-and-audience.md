# Destinatario dinámico + clasificación de audiencia (MessageDialog)

Dos mejoras en el envío de mensajes (`apps/web/src/components/MessageDialog.vue`).

## 1. Nombre del destinatario dinámico

El encabezado `Enviar Mensaje a {{ displayName }}` ahora refleja **a quién** se le envía según
el contacto seleccionado en el dropdown de teléfono/correo:

- Contacto propio del participante → su nombre.
- `emergencyContact1*` / `emergencyContact2*` → nombre del contacto de emergencia + sufijo
  "(Contacto de emergencia)".
- `inviter*` → nombre del invitador (`invitedBy`) + sufijo "(Invitador)".

`displayName` deriva el nombre de `selectedContactKey` (reactivo a `selectedContact`). El cuerpo
del mensaje se adapta con la variable existente **`{participant.emergencyContactName}`**, que
resuelve a EC1/EC2 según el contacto elegido (`@repo/utils` `buildParticipantReplacements`); el
`watch(selectedContact)` ya recalcula el preview al cambiar el contacto. Así, una plantilla de
audiencia "familiar" puede saludar al contacto de emergencia con esa variable.

## 2. Clasificación de audiencia (caminante / servidor / familiar / general)

La audiencia se **deriva del tipo** de plantilla (sin cambios de BD) vía
`getMessageTemplateAudience(type)` en `packages/types/src/message-template.ts`:

- **walker (Caminantes):** WALKER_WELCOME, WALKER_FOLLOWUP_*, WALKER_REUNION_INVITATION,
  WALKER_CONFIRMATION, PALANCA_*, PRE_RETREAT_REMINDER, PAYMENT_REMINDER, POST_RETREAT_MESSAGE,
  CANCELLATION_CONFIRMATION, BIRTHDAY_MESSAGE.
- **server (Servidores):** SERVER_WELCOME, TABLE_LEADER_BRIEFING, PALANQUERO_NEW_WALKER.
- **family (Familiares / contacto de emergencia):** EMERGENCY_CONTACT_VALIDATION,
  FAMILY_CLOSING_INVITATION_WHATSAPP, FAMILY_CLOSING_INVITATION_EMAIL.
- **general:** todo lo demás (default).

Cambios:
- **Filtro arreglado:** el filtro de tipo en `MessageDialog` comparaba `template.type === 'WALKER'`
  contra tipos reales (`WALKER_WELCOME`), por lo que "Caminantes"/"Servidores" **no filtraban nada**.
  Ahora usa `getMessageTemplateAudience(template.type) === typeFilter` y se agregó **Familiares**.
- **Badges en el admin:** `MessageTemplatesView.vue`, `GlobalMessageTemplatesView.vue` y el editor
  `BaseMessageTemplateModal.vue` muestran la audiencia de cada plantilla.
- i18n: `messageTemplates.audience.{walker,server,family,general,label}` (es/en). También se
  agregaron las etiquetas faltantes `messageTemplates.types.{TABLE_LEADER_BRIEFING,WALKER_CONFIRMATION}`.

## Archivos

- `packages/types/src/message-template.ts` — `messageTemplateAudiences` + `getMessageTemplateAudience()`.
- `apps/web/src/components/MessageDialog.vue` — `displayName` dinámico + filtro por audiencia.
- `apps/web/src/components/BaseMessageTemplateModal.vue` — etiqueta de audiencia.
- `apps/web/src/views/{MessageTemplatesView,GlobalMessageTemplatesView}.vue` — badge de audiencia.
- `apps/web/src/locales/{es,en}.json` — labels de audiencia + tipos faltantes.

## Mejoras adicionales

- **Variable `{participant.recipientName}` / `{participant.recipientFirstName}`** (`@repo/utils`
  `buildParticipantReplacements`): se adapta al contacto elegido (caminante / EC1 / EC2 / invitador),
  para que UNA plantilla salude al destinatario correcto sin condicionales. Expuesta en el picker.
- **Default inteligente de contacto:** al elegir una plantilla de audiencia `family`, si el contacto
  actual es el propio del participante, `MessageDialog` preselecciona automáticamente el contacto de
  emergencia disponible (`applyAudienceContactDefault`).
- **Aviso de teléfono/correo inválido:** computed `contactWarning` en `MessageDialog` muestra un aviso
  inline cuando el contacto seleccionado parece incompleto (teléfono < 10 dígitos / correo mal
  formado), para evitar links de WhatsApp muertos. La validación dura en `sendMessage` se mantiene.

## Tests

- `apps/web/src/utils/__tests__/messageTemplateAudience.test.ts` — mapeo tipo→audiencia.
- `apps/web/src/utils/__tests__/recipientVariable.test.ts` — `{participant.recipientName}` adaptativo.
- `apps/web/src/utils/__tests__/messageTemplateI18n.test.ts` — guard: cada tipo tiene etiqueta i18n
  (es/en) + audiencia válida.
- `apps/web/src/components/__tests__/MessageDialog.test.ts` — `displayName` cambia con el contacto
  (propio / EC1 / EC2 / invitador).
