# Research: corrección del correo de un participante

> SDD research — versión 1.0 (2026-10-19). Verificado contra master (42976728) leyendo código;
> citas como `archivo` + función/constante. Sin líneas: envejecen.

## El estado de hoy, verificado

### El email ya es editable por la vía genérica

- Ruta: `apps/api/src/routes/participantRoutes.ts` → `PATCH /:id` con
  `validateRequest(updateParticipantSchema)` + `requirePermission('participant:update')`.
- Schema: `packages/types/src/index.ts` → `updateParticipantSchema` =
  `participantSchema.omit({ retreatId, id_on_retreat }).partial()` con preprocess
  `''/null → undefined`. `email` usa `requiredEmailSchema` (normaliza con `normalizeEmail`
  de `@repo/utils`, valida `.email()`). **El email pasa.**
- Service: `apps/api/src/services/participantService.ts` → `updateParticipant` separa campos de
  retiro y deja `email` en `...personalData`; luego `participantRepository.merge(participant,
  personalData)` + `save`. **Se persiste.** Sin ninguna validación de colisión ni consecuencia.
- Form: `apps/web/src/components/EditParticipantForm.vue` — `email` vive en la pestaña Contacto
  (`keys: ['email', 'cellPhone', …]`), editable según `columnsToEdit` del usuario.
- Self-update: `SELF_UPDATE_ALLOWED_FIELDS` en `participantController.ts` **no** incluye email.
  Correcto; no se toca.

### El email no es único global; la identidad es soft

- `apps/api/src/entities/participant.entity.ts`: comentario de la columna — participa en
  `UQ_participants_email_retreat` vía `COALESCE(gender,'')` para que un matrimonio comparta
  correo en el retiro. Definición real en
  `apps/api/src/migrations/sqlite/20260822130000_AddCouplesRetreatSupport.ts` (reemplaza a la de
  `20260408130000`).
- `participantService.findParticipantByEmail`: búsqueda global por `LOWER(email)`, devuelve la
  más reciente. La usan el registro de servers, el create y el import para **reutilizar** la
  ficha y sobrescribir sus datos.
- `importEmailReuse.isImportNameConflict` (import): si la fila nombra a otra persona, la fila se
  salta con razón pedagógica ("el correo ya es de X…"). Es el reconocimiento oficial del
  problema del correo prestado — pero solo en import.
- Registro de parejas: reuso por **email+gender** (`createParticipantForCouple`), no email a
  secas, para no fusionar al segundo cónyuge sobre el primero.

### El auto-link por correo (el vector de takeover)

- `authService` (bloque "Link any existing participants that share this email"): al crear una
  cuenta, vincula TODAS las fichas con `LOWER(participant.email) = LOWER(user.email)` y les
  hereda historial.
- `participantService.createParticipant` y el flow de parejas también auto-linkean a la inversa
  (user existente con ese email → `participant.userId`).
- Consecuencia: quien controla `participants.email` controla qué ficha "secuestra" la próxima
  cuenta que se registre. Hoy el PATCH general lo permite sin barrera ni traza. El skill
  `community-overlay` documenta el vector y por qué el overlay de comunidad NO lo tiene.

### Overlay de comunidad

- `community_member.email` es override per-comunidad; `resolveMemberProfile` (`@repo/utils`):
  overlay gana si está set, fallback a participant.
- Editar overlay es owner-only (`communityService.updateMemberProfile`), escribe SOLO
  `community_member.*`, audita `changedFields` + `newEmailHash` (SHA-256 12 chars), y hay índice
  único `(communityId, LOWER(email))` para colisiones de overlay.
- **Nada** sincroniza overlay ↔ participant al cambiar el correo de la ficha (verificado: el
  único uso de `CommunityMember` en `participantService` es lectura de meetings y el anonymize de
  fotos). Si el overlay quedó con el correo malo, corregir la ficha no arregla la comunidad.

### Cola de mensajes

- `scheduledMessage` congela snapshot (`resolvedContent`/`resolvedContact`) al encolar;
  el envío usa el snapshot, no el correo vivo de la ficha (memoria del incidente del dato viejo).
- Remedio existente: `messageSequenceService.regenerateQueuedForRetreat(retreatId)` →
  `POST /message-sequences/retreat/:retreatId/regenerate-queue`
  (`messageSequenceController.regenerateQueue`), renueva snapshots pendientes contra la plantilla
  vigente y audita `MESSAGE_SEQUENCE_REGENERATE_QUEUE`.

### Auditoría de dominio

- Catálogo: `packages/types/src/audit.ts` (`DomainAuditAction`). No existe acción de cambio de
  correo; `PARTICIPANT_UPDATE` existe como constante pero el update general **no la emite**
  (solo `PARTICIPANT_HEALTH_VIEW` desde el controller).
- La web deriva i18n keys `audit.actions.<action>` → una acción nueva necesita su key
  (`apps/web/src/locales`).
- Patrón PII a copiar: `newEmailHash` de `communityService.updateMemberProfile`.

### Fusión de duplicados (para el caso "mismo correo, misma persona")

- `participantMergeService`: `previewMerge` + `mergeParticipants`, con `PARTICIPANT_REFERENCES`
  (reapunta todas las FKs, bloquea solapamientos serios como dos cuentas de usuario) y guard
  `participantMergeReferences.test.ts` contra el esquema. Audita `PARTICIPANT_MERGE`.

## Datos que faltan o no se pudieron comprobar

- Herencia exacta de `participant:identity:update` (permiso nuevo): el sistema de permisos es
  dinámico (`permissionInheritanceService` / `permissionOverrideService`); el default de D2 se
  materializa al implementar, no está predeterminado en código.
- Si algún deployment limita `columnsToEdit` del form de edición (config por usuario) de forma
  que el correo no aparezca: irrelevante para la feature (el diálogo dedicado es independiente),
  pero explica por qué a algunos admins "no les aparece" el campo hoy.

## Qué NO se tocó (verificado como fuera de alcance)

- `emergencyContact*Email`, `inviterEmail`: descriptivos, sin lookup de identidad.
- `users.email`: login, flujo propio.
- Registro público y import: ya tienen sus guards (`checkEmailExists`,
  `importEmailReuse`).
