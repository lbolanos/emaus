# Spec: corrección del correo de un participante por el administrador del retiro

> SDD spec — versión 1.0 (2026-10-19). Estado: **aprobado por Leonardo el 2026-10-19**, D1-D7
> tal como están (D2 con Coordinator incluido). Gate de M0 cerrado: se puede empezar M1.

**Branch**: `worktree-participant-email-change` · **Fecha**: 2026-10-19

> Repo público: sin nombres de personas, teléfonos ni correos reales.

## Problema

A los caminantes los inscribe otra persona (un servidor del equipo, un familiar), y esa persona
pone **su propio correo** en la ficha — o lo teclea mal. El resultado: la ficha queda con un
correo que no pertenece al caminante, y todo el sistema de mensajes del retiro (secuencias,
angelitos, avisos) le escribe a quien no es, o a nadie.

El problema ya está reconocido a medias: el importador de Excel detecta el "correo prestado" y se
niega a sobrescribir la ficha (`importEmailReuse.isImportNameConflict`). Pero una vez que la fila
mala **ya entró** (por import, por registro público o por alta manual), no hay vía para
corregirla con lo que conlleva. Y lo que existe hoy es una trampa:

1. **El correo ya es editable** — el PATCH general (`participantController.updateParticipant`,
   permiso `participant:update`) acepta `email`, lo normaliza y lo persiste
   (`participantService.updateParticipant` lo deja caer en `personalData`). El form de edición lo
   muestra en la pestaña Contacto. Parece que se puede… pero:
2. **No valida ninguna consecuencia.** Un correo que ya usa otra ficha (en este u otro retiro)
   se acepta sin aviso — dentro del retiro con el mismo género revienta con el error crudo del
   índice único; fuera del retiro pasa en silencio y **siembra el bug de identidad global**: el
   próximo registro/import con ese correo reutiliza "la ficha más reciente" y sobrescribe a una
   de las dos personas (`findParticipantByEmail`).
3. **No re-vincula la cuenta de usuario** ni limpia el **overlay de comunidad**
   (`community_member.email` gana sobre el participant: si quedó con el correo malo, la comunidad
   sigue escribiendo al correo viejo aunque la ficha ya esté corregida).
4. **No renueva la cola de mensajes**: `scheduledMessage` congela `resolvedContact` (con el
   correo) al encolar. Los pendientes siguen saliendo al correo viejo. El remedio existe pero es
   manual (`regenerate-queue` por retiro).
5. **No deja traza**: el update general no emite evento de auditoría de dominio.

## Objetivo

Que el administrador del retiro corrija el correo de un participante **por una vía única y
explícita**, que: valida colisiones contra otras fichas, limpia los overlays de comunidad que
quedaron con el correo viejo, renueva la cola de mensajes pendientes de los retiros activos, y
deja auditoría con hash del correo nuevo. El PATCH general deja de aceptar `email` (se quita de
la vía genérica para que las consecuencias no se salten).

## Historias de usuario

1. Como admin del retiro, abro la ficha de un caminante inscrito con correo prestado, pulso
   "Corregir correo", tecleo el correo propio de la persona y confirmo re-escribiéndolo; el
   sistema me avisa qué más tocó (overlays limpiados, cola renovada, cuenta vinculada).
2. Como admin, si el correo que pongo ya es de otra persona (en este u otro retiro), el sistema
   me lo rechaza diciendo de quién es — nunca sobrescribe ni fusiona en silencio.
3. Como admin, si el correo corregido ya tiene cuenta de usuario y la ficha no tenía vínculo,
   la ficha queda vinculada (mismo criterio que el alta), y el evento queda en auditoría.
4. Como coordinador de comunidad, tras la corrección los mensajes de mi comunidad van al correo
   correcto (el overlay viejo se limpia solo).
5. Como servidor del equipo de mensajes, los pendientes de la cola salen al correo corregido sin
   regenerar a mano.

## Decisiones de diseño (aprobadas 2026-10-19)

- **D1 — Vía única: endpoint dedicado.** `PATCH /api/participants/:id/email` con schema propio
  (`{ email }`, `requiredEmailSchema`). El PATCH general **stripea** `email` en silencio (mismo
  patrón que `scholarshipAmount` sin permiso), y el form general muestra el correo read-only con
  botón "Corregir correo" que abre el diálogo dedicado. *Alternativa descartada*: validar
  consecuencias dentro del update general — el cliente reenvía el DTO completo por spread y
  dispararía las validaciones sin intención; y mezcla dos contratos.
- **D2 — Quién puede: permiso dedicado `participant:identity:update`.** Heredado por Superadmin,
  Admin **y Coordinator** (quien atiende inscripciones en la práctica). *Alternativa*: excluir
  Coordinator (sube el listón del vector de takeover, pero la corrección diaria queda bloqueada
  en quien no está viendo inscripciones).
- **D3 — Colisiones: siempre rechazo, nunca fusión.** Contra `LOWER(email)`: (a) igual al correo
  actual → no-op con aviso; (b) otra ficha en el mismo retiro y género → 409 con nombre de quién
  lo tiene (el índice `UQ_participants_email_retreat` hoy lo revienta crudo); (c) otra ficha en
  otro retiro → 409 con el mismo texto pedagógico del import (`importEmailReuse`): si el nombre
  es de otra persona, "el correo ya es de X"; si parece la misma persona, sugerir el flujo de
  fusión existente (`participantMergeService.previewMerge`) — dos fichas de la misma persona con
  un correo compartido rompen el reuso global y eso se arregla fusionando, no re-correando.
- **D4 — Cuenta de usuario: link solo si la ficha no tiene.** Si existe user con ese correo y
  `participant.userId` es null → vincular (mismo criterio que el auto-link del alta). Si ya hay
  vínculo → no se toca (`users.email` es identidad de login, fuera de alcance). Si existe user
  con el correo VIEJO → avisar en la respuesta: esa cuenta quedó con un correo que no controla
  su dueño; la corrección de `users.email` es flujo aparte.
- **D5 — Overlay de comunidad: limpiar los que apuntan al correo viejo.** Todas las filas de
  `community_member` del participant cuyo `email` (overlay) sea el correo viejo quedan en `null`,
  para que el fallback de `resolveMemberProfile` caiga al correo corregido. Va en el mismo
  cambio y se reporta en la respuesta y la auditoría (`overlaysCleared`).
- **D6 — Cola de mensajes: regenerar los retiros activos.** Tras el cambio, por cada retiro del
  participant con `endDate` >= hoy, correr `regenerateQueuedForRetreat` (remedio existente, ya
  auditado como `MESSAGE_SEQUENCE_REGENERATE_QUEUE`). *Alternativa descartada*: regeneración
  selectiva por participante — código nuevo para lo que el por-retiro ya resuelve.
- **D7 — Confirmación en UI: type-to-confirm.** Diálogo que pide teclear el correo nuevo dos
  veces (o pegar + confirmar), muestra un resumen de consecuencias antes de aceptar y el
  resultado detallado después. El correo es identidad: el doble tecleo evita repetir el error
  original (dedo, autocomplete).

## Fuera de alcance

- `users.email` y el login (corregir la cuenta de un servidor es otro flujo; D4 solo avisa).
- Fusión de fichas duplicadas (existe `participantMergeService`; D3 solo sugiere usarlo).
- El registro público y el import ya tienen sus propias mitigaciones de correo prestado.
- Correos de contacto de emergencia e invitador (`emergencyContact*Email`, `inviterEmail`):
  campos descriptivos, no identidad; se editan por el form general.
- Cambios al índice `UQ_participants_email_retreat` (los matrimonios que comparten correo
  siguen funcionando igual).

## Riesgos y mitigaciones

- **Account takeover por correo malicioso** (documentado en el skill `community-overlay`):
  quien puede poner `participants.email` puede lograr que una cuenta nueva se auto-vinlucle a la
  ficha (`authService.linkParticipantToExistingUser` busca por `LOWER(participant.email)`).
  El vector **ya existe hoy** vía el PATCH general (D1 lo cierra al stripear el email).
  Mitigaciones: permiso dedicado (D2), auditoría con hash del correo nuevo (patrón
  `newEmailHash` del overlay), confirmación explícita (D7).
- **PII en logs**: el evento de auditoría lleva `newEmailHash` (SHA-256 truncado), nunca el
  correo en claro — mismo criterio que `communityService.updateMemberProfile`.
- **Regeneración de cola ruidosa**: `regenerateQueuedForRetreat` toca todos los pendientes del
  retiro, no solo los del participante. Aceptado (D6): renueva snapshots contra plantilla
  vigente; el evento agregado ya existe.

## Puntos de extensión

- Añadir consecuencias nuevas al cambio de correo → servicio dedicado
  (`changeParticipantEmail`), una sola puerta: validación de colisión, link de cuenta, overlay,
  cola, auditoría.
- Otros campos de identidad (teléfono ya tiene su mini-editor `ParticipantQuickPhoneEditor`):
  si algún día se les exigen consecuencias, mismo patrón de endpoint dedicado + strip del general.
