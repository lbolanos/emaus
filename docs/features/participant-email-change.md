# Corrección del correo de un participante

A los caminantes los inscribe otra persona (un servidor, un familiar), y esa persona pone **su
propio correo** en la ficha — o lo teclea mal. El sistema de mensajes del retiro le escribe a
quien no es, o a nadie. Esta feature da al administrador del retiro una vía única y explícita
para corregir el correo **con todo lo que conlleva**.

Spec SDD: `specs/participant-email-change/` (aprobada 2026-10-19, D1-D7).

## Dónde está

Ficha del participante (`ParticipantList` → editar) → grupo **Contacto** → campo Correo
Electrónico: read-only con **dos botones de ícono** a la derecha:

- **Copiar** (siempre visible): copia el correo al portapapeles y lo confirma con un toast.
  No pide permiso — la dirección ya está a la vista.
- **Corregir** (lápiz): abre el diálogo de corrección. Solo aparece con el permiso
  `participant:identity:update` (superadmin y admin).

Antes de esta feature el campo no era editable: `formColumnsToEdit` ya excluía `email` de la
edición genérica y el form lo mostraba como texto read-only, sin input ni botón.

Ojo: el form refleja las columnas visibles del listado (`formColumnsToShow`). Si ocultas la
columna Correo en el selector de columnas de `ParticipantList`, el campo —y con él el botón—
desaparece del form; vuelve a mostrarla para corregir.

## Por qué una puerta propia (D1)

El correo es la **identidad global** de la ficha: el reuso por `findParticipantByEmail`, el
auto-link de cuentas (`LOWER(participant.email)`) y los mensajes pendientes dependen de él.
Editarlo como un campo más saltaba todas las consecuencias.

- `PATCH /api/participants/:id/email` — schema propio (`changeParticipantEmailSchema`), permiso
  `participant:identity:update`. Body: `{ email, contextRetreatId? }`.
- El PUT genérico (`PUT /participants/:id`) **stripea `email` en silencio**: el form reenvía el
  DTO completo por spread y no debe fallar, pero el correo ya no entra por ahí. El self-update
  nunca lo incluyó (`SELF_UPDATE_ALLOWED_FIELDS`).

## Qué hace el cambio (servicio `changeParticipantEmail`)

1. **No-op**: si el correo normalizado es el mismo (case-insensitive), no toca nada ni audita.
2. **Colisiones (D3) — siempre rechazo, nunca fusión**, contra todas las fichas con
   `LOWER(email)` igual (excepto la propia):
   - **Excepción cónyuge primero**: comparten retiro activo y ambos tienen género distinto →
     pasa (el índice único lo permite), y queda avisado en `spouseShareRetreats`.
   - **Otra persona** (`isImportNameConflict`): 409 `EMAIL_OWNED_BY_OTHER` con mensaje
     pedagógico que nombra al dueño y aclara si está "inscrito en este retiro" o "registrado
     fuera de este retiro" — "este retiro" es el retiro desde el que se corrige
     (`contextRetreatId`), no cualquier retiro que las fichas compartan.
   - **Parece la misma persona**: 409 `EMAIL_OWNED_BY_SAME_PERSON` sugiriendo el flujo de
     fusión de fichas existente.
   - Carrera contra el índice único en el save → 409 `EMAIL_UNIQUE_VIOLATION` sin efectos
     colaterales.
3. **Cuenta de usuario (D4)**: si la ficha no tenía `userId` y existe user con ese correo →
   vincula (mismo criterio que el alta, link recíproco solo si `user.participantId IS NULL`).
   Si existe user con el correo **viejo** → `userWithOldEmail: true` (aviso; corregir
   `users.email` es otro flujo).
4. **Overlay de comunidad (D5)**: las filas de `community_member` del participant cuyo
   `email` overlay sea el correo viejo quedan en `null` → `resolveMemberProfile` cae al correo
   corregido.
5. **Cola de mensajes (D6)**: por cada retiro **activo** del participant
   (`messageSequenceService.isRetreatClosed`, TZ-aware) corre `regenerateQueuedForRetreat`, y
   también por cualquier retiro —cerrado o no— donde el participant tenga mensajes aún sin
   despachar (`pending`/`processing`/`queued`): las secuencias `days_after_retreat` siguen
   saliendo hasta 30 días después del retiro y la bandeja WhatsApp vive en `queued`.
   Falla tolerada (console.error): la corrección no revienta por la cola.
6. **Auditoría**: evento `participant.email_change` con `oldEmailHash`/`newEmailHash`
   (SHA-256 truncado a 12), **nunca el correo en claro**, más los efectos
   (`userLinked`, `userWithOldEmail`, `overlaysCleared`, `queueRegenerated`,
   `spouseShareRetreats`).

## UI (D7): type-to-confirm

`ParticipantEmailChangeDialog.vue` — se teclea el correo nuevo **dos veces** (evita repetir el
error original de dedo/autocomplete), muestra el resumen de consecuencias antes de aceptar y el
detalle después. La validación cliente reusa el schema zod del server, así el botón habilita
exactamente lo que el API acepta. El 409 se muestra inline con el mensaje del server (nombra al
dueño del correo).

## Permisos

- Permiso nuevo `participant:identity:update`, creado por la migration
  `20261019120000_AddParticipantIdentityUpdatePermission` (data-only, idempotente) y concedido
  a **superadmin y admin**. La spec original hablaba de un rol Coordinator que **no existe** en
  la base (desviación D2, ver `specs/participant-email-change/tasks.md`): quien atiende
  inscripciones en la práctica es `admin`.
- También entró al catálogo del frontend (`apps/web/src/utils/permissions.ts`, unión cerrada)
  con el patrón de `health`.

## Riesgo cerrado

El correo editable por el PATCH general era un vector de account takeover: quien podía poner
`participants.email` lograba que una cuenta nueva se auto-vinculara a la ficha. D1 lo cierra
(stripe); queda la puerta dedicada con permiso propio, confirmación explícita y auditoría con
hash.

## Tests de referencia

- Servicio: `apps/api/src/tests/services/participantEmailChangeService.test.ts` (13: colisiones,
  cónyuge, link, overlay, cola activa, raza del índice, auditoría sin PII).
- Rutas: `apps/api/src/tests/routes/participantEmailChangeRoute.simple.test.ts` (4: strip del
  PUT, 403 sin permiso, normalización, mapeo del 409).
- Migration: `apps/api/src/tests/migrations/addParticipantIdentityUpdatePermission.simple.test.ts`
  (4: concesiones exactas, idempotencia, down, roles ausentes).
- Web: `apps/web/src/components/__tests__/ParticipantEmailChangeDialog.test.ts` (éxito, 409,
  guards del doble tecleo) y el describe "email field" de
  `EditParticipantForm.test.ts` (read-only, gate de permiso, re-emit del resultado).

## Fuera de alcance

`users.email` y el login; fusión de fichas (`participantMergeService`); correos descriptivos de
emergencia/invitador (esos sí van por el form genérico); cambios al índice
`UQ_participants_email_retreat`.
