---
name: community-overlay
description: "Modelo overlay de CommunityMember: cómo se resuelve el perfil per-community (firstName/lastName/email/cellPhone) sobre el Participant global. Cuándo usar resolveMemberProfile vs member.participant directo. Anti account-takeover by design."
---

# CommunityMember Profile Overlay

Cada `community_member` tiene 4 columnas opcionales (`firstName`, `lastName`, `email`, `cellPhone`) que actúan como **override per-community** del `Participant` subyacente. El `Participant` queda como identidad global, pero cada comunidad puede tener su propio alias para la misma persona — y un community admin nunca toca `participants` directamente.

## Cuándo cargar este skill

- Tocar lectura/escritura de datos de un `CommunityMember` (display, búsqueda, mensajes, attendance).
- Bug donde el nombre/email mostrado en una comunidad no coincide con el del participant.
- Implementar nuevo endpoint que mute `community_member.*` con datos overlay.
- Revisar permissions de edit member profile (owner-only).
- Migración o feature que toque PII de miembros.

## Reglas de oro

1. **NUNCA leer `member.participant.firstName` directamente en contexto community.** Usa siempre `resolveMemberProfile(member).fullName / firstName / email / cellPhone`.
2. **NUNCA escribir a `participants.X` desde el flow de comunidad.** El endpoint `updateMemberProfile` escribe SOLO en `community_member.*`. El `Participant` lo edita el dueño (vía retreat coordinator con `participant:update`) o el propio user.
3. **Empty string en overlay = "limpiar override"**: el service convierte `''` a `null` antes de persistir; el helper hace fallback al participant.
4. **`firstName` siempre debe tener valor**: empty se rechaza con `'firstName cannot be empty'`. Los otros 3 sí pueden quedar null.
5. **Edit overlay es owner-only** (`requireCommunityOwner`). Razón: un co-admin podría rerutear notificaciones cambiando `overlay.email = attacker`.

## Helper: `resolveMemberProfile`

Vive en `packages/utils/src/index.ts`. Mismo helper usado por backend y frontend.

```ts
import { resolveMemberProfile } from '@repo/utils';

const profile = resolveMemberProfile(member);
// profile.firstName / lastName / email / cellPhone / fullName
```

- Acepta `CommunityMember` con `.participant` cargado, o un objeto literal compatible (`MemberOverlayLike`).
- Regla: `m.X` gana si está set y no es empty string. Sino fallback a `m.participant.X`. Sino empty string.
- `fullName` precomputado para display.

## Patrones por capa

### Backend — display/notification (server-side renderTemplate)

```ts
import { resolveMemberProfile } from '@repo/utils';

// En notifyMembersOfMeeting, notifyMemberStateChange, bulkRecordAttendance, etc.
const profile = resolveMemberProfile(member);
const tplBody = await this.renderTemplate('COMMUNITY_MEETING_INVITATION', community.id, {
  firstName: profile.firstName, // overlay wins
  communityName: community.name,
});
await emailService.sendEmail({ to: profile.email, ... });
```

### Backend — búsqueda SQL (LIKE)

Buscar contra ambos lados (overlay + participant). El SQL queda más largo pero captura ambos:

```sql
WHERE (
  LOWER(p.firstName) LIKE :q OR LOWER(p.lastName) LIKE :q OR
  LOWER(cm.firstName) LIKE :q OR LOWER(cm.lastName) LIKE :q OR
  LOWER(p.email) LIKE :q OR LOWER(cm.email) LIKE :q
)
```

### Backend — search/match en memoria

```ts
const matches = members.filter(m => {
  const eff = resolveMemberProfile(m);
  return tokens.every(t => eff.fullName.toLowerCase().includes(t));
});
```

### Frontend — display

```vue
<template>
  <span>{{ resolveMemberProfile(member).fullName }}</span>
  <span>{{ resolveMemberProfile(member).email }}</span>
</template>

<script setup lang="ts">
import { resolveMemberProfile } from '@repo/utils';
</script>
```

### Frontend — filter en computed

```ts
const filtered = computed(() =>
  members.value.filter(m => {
    const profile = resolveMemberProfile(m);
    return profile.fullName.toLowerCase().includes(query) ||
           profile.email.toLowerCase().includes(query);
  })
);
```

### Frontend — MessageDialog mergea overlay sobre participant data

`MessageDialog.vue` arma `participantData` para `replaceAllVariables`. Cuando context='community', merge el overlay sobre el participant:

```ts
if (isCommunityCtx && props.participant && 'participant' in props.participant) {
  const overlay = resolveMemberProfile(props.participant);
  participantData = {
    ...participantData,
    firstName: overlay.firstName || participantData.firstName,
    lastName: overlay.lastName || participantData.lastName,
    email: overlay.email || participantData.email,
    cellPhone: overlay.cellPhone || participantData.cellPhone,
  };
}
```

Así `{participant.firstName}` en una plantilla resuelve al overlay si existe.

## Editar overlay (writes)

### Endpoint
`PATCH /api/communities/:id/members/:memberId/profile` — body con cualquier subset de `firstName/lastName/email/cellPhone`.

### Permissions
**Owner-only** (`requireCommunityOwner()`). Co-admins no acceden.

### Validaciones del service
- `cross-tenant guard`: el member debe pertenecer a `:id` (sino throw `Member not found in this community`).
- `firstName`: empty/whitespace → throw `firstName cannot be empty`.
- `email` cambia (case-insensitive):
  - Check application-level: ¿otro member de la misma comunidad ya tiene ese email (overlay o participant)? Si sí → `EMAIL_DUPLICATE_IN_COMMUNITY`.
  - Defense in depth: partial unique index `uq_community_member_overlay_email ON (communityId, LOWER(email)) WHERE email IS NOT NULL` dispara el mismo error si hay race.
- `email`/`lastName`/`cellPhone` con empty string → persiste como `null` (limpia overlay).

### Audit log
Solo se emite cuando hay cambios efectivos (no en no-ops). Metadata:
- `changedFields`: lista de campos que realmente cambiaron.
- `overlay: true` (marcador del modelo).
- `newEmailHash`: SHA-256 truncado a 12 chars del nuevo email (correlación cross-tenant sin duplicar PII).

### bulkAddMembers + overlay
Cuando el bot/import detecta que un Participant existente matchea por email/phone Y el input tiene datos distintos, **guarda overlay**:

```ts
const overlay: Partial<CommunityMember> = {};
if (firstName && firstName !== existing.firstName) overlay.firstName = firstName;
// ... etc para lastName, email, cellPhone
if (Object.keys(overlay).length > 0) {
  await this.memberRepo.update(newMember.id, overlay);
}
```

Esto resuelve el bug donde "Juan Pérez" del bot quedaba sobrescrito por "Joseph Perez" del Participant existente.

## Por qué NO existe account takeover via overlay

El vector original: admin malicioso cambia `participants.email = attacker@x.com`. Cuando el atacante registra una cuenta con ese email, `authService.linkParticipantToExistingUser` hace `WHERE LOWER(participant.email) = :email` y vincula el Participant al user del atacante → heredan historial.

**Con overlay no existe ese vector**:
- `updateMemberProfile` escribe SOLO en `community_member.email`, NUNCA en `participants.email`.
- `authService` sigue haciendo `LOWER(participant.email)` — el overlay no participa en auto-link.
- Test que lo asserta: `apps/api/src/tests/services/communityService.test.ts > 'editar email NO afecta participant.email (anti account-takeover)'`.

## Riesgo residual mitigado: email-rerouting via co-admin

Aunque el overlay no toca participants, un co-admin podía cambiar `overlay.email` para que las notificaciones de comunidad (invitaciones a reunión, bienvenida) se enviaran al atacante. **Mitigado con `requireCommunityOwner`**: solo owner (o superadmin) puede editar overlay.

## Migration

`apps/api/src/migrations/sqlite/20260518200000_CommunityMemberOverlayAndTemplateRewrite.ts`:
- `ALTER TABLE community_member ADD COLUMN firstName/lastName/email/cellPhone` (nullable)
- `CREATE UNIQUE INDEX uq_community_member_overlay_email ON community_member (communityId, LOWER(email)) WHERE email IS NOT NULL`

Sin backfill — miembros existentes quedan con overlay null hasta que alguien edite.

## Tests de referencia

- Helper: `apps/api/src/tests/services/resolveMemberProfile.test.ts` (8 tests)
- Service: `apps/api/src/tests/services/communityService.test.ts > updateMemberProfile` (13 tests, incluye anti-takeover, colisión scoped, race condition, owner-only)
- Service: `> bulkAddMembers` (3 tests overlay behavior)
- Service: `> getMembersForViewer > admin non-owner recibe el overlay`
