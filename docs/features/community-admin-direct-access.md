# Administradores de comunidad — acceso directo con 1 clic

Permite que el **owner** de una comunidad agregue a otro administrador **eligiéndolo de una lista de usuarios** y otorgándole acceso **activo de inmediato**, sin tener que generar un enlace ni esperar a que la persona lo acepte.

Replica el patrón de la **"Asignación Rápida" de roles del retiro** (`RetreatRoleManagementView.vue`). El flujo anterior de invitación por enlace **se conserva** como segundo modo (respaldo).

## Contexto / motivación

Antes, `InviteAdminModal.vue` solo aceptaba un **email escrito a mano** y creaba una invitación `pending` con token: el invitado tenía que abrir un enlace, pasar reCAPTCHA y tener su email verificado para **aceptar**. No había listado de usuarios ni acceso de un clic.

Ahora el owner busca un usuario ya registrado y le da acceso al instante. El enlace por email queda disponible para casos donde se prefiera invitar a distancia.

## Dos modos en el modal

`apps/web/src/components/community/InviteAdminModal.vue` usa `Tabs`:

1. **Buscar usuario** (por defecto) → acceso inmediato.
   - Buscador `Command` que consume `searchUsers(query)` (`/social/search`), filtrando al escribir **≥ 2 caracteres** (debounce 300 ms + guard de generación para evitar carreras de respuestas).
   - Al seleccionar un usuario y pulsar **"Dar acceso"** se llama a `communityStore.addAdmin(communityId, userId)`. El usuario queda `active` de inmediato; el modal emite `invited` (la vista refresca) y se cierra.
2. **Invitar por enlace** (respaldo) → flujo original.
   - Campo de email → `communityStore.inviteAdmin(communityId, email)` → genera `invitationToken` y muestra el enlace `/accept-community-invitation/{token}` para compartir.

### Serialización del `invitationToken` (enlace `/undefined`)

`CommunityAdmin.toJSON()` (`apps/api/src/entities/communityAdmin.entity.ts`) **elimina `invitationToken`** al serializar, para no filtrarlo en respuestas genéricas. Como `res.json(entidad)` invoca `toJSON()`, tanto la respuesta del invite como el listado de pendientes devolvían `invitationToken: undefined` → el enlace quedaba en `/accept-community-invitation/undefined`.

Corrección: el controller serializa explícitamente el token vía `CommunityController.serializeAdminWithToken(...)`, **solo para owner/superadmin**:

- `POST /:id/admins/invite` (`requireCommunityOwner`) → la respuesta incluye `invitationToken` para que el modal arme el enlace.
- `GET /:id/admins` (`requireCommunityAccess`) → **solo si el solicitante es owner o superadmin** se incluye `invitationToken` (solo los `pending` lo tienen), para que su botón "copiar enlace" funcione tras recargar. A los co-admins no-owner se les devuelve la entidad cruda, cuyo `toJSON()` elimina el token.

**SECURITY** (hallazgo de la revisión de seguridad): `GET /:id/admins` está protegido por `requireCommunityAccess` (cualquier admin activo), pero el `invitationToken` es un secreto de la invitación. Exponerlo a co-admins no-owner cruzaría el límite de privilegio (un co-admin no genera ni gestiona invitaciones). Por eso el token se emite **solo** cuando `req.communityAdmin === null` (superadmin) o `req.communityAdmin.role === 'owner'`. No se modifica el `toJSON()` global: el resto del sistema sigue protegido.

La vista contenedora `CommunityAdminsView.vue` no cambió: ya abría el modal y refresca con `@invited="fetchAdmins"`, por lo que el nuevo admin aparece de inmediato en **"Administradores Actuales"**.

## Backend

### Endpoint

```
POST /api/communities/:id/admins/add
Body: { "userId": "<uuid>" }
```

- Protegido por `requireCommunityOwner()` — **solo el owner/superadmin** puede agregar admins (mismo middleware que `invite` y `revoke`).
- Validado por `addCommunityAdminSchema` (`packages/types/src/community.ts`): `userId` debe ser UUID.
- Responde `201` con el `CommunityAdmin` creado, **incluyendo la relación `user`** (para que el frontend lo pinte sin re-fetch).
- `404` si el usuario no existe; `400` para errores genéricos.

Ruta: `apps/api/src/routes/communityRoutes.ts`. Controller: `CommunityController.addAdmin` (`apps/api/src/controllers/communityController.ts`) — registra audit log `CommunityAuditAction.ADMIN_ADD` (`community.admin.add`).

### Servicio — `communityService.addAdminDirect(communityId, userId, addedBy)`

`apps/api/src/services/communityService.ts`. Lógica:

1. Valida que el usuario exista (`User` repo) — si no, lanza `User not found`.
2. Busca un `CommunityAdmin` existente para ese `{ communityId, userId }`:
   - Si existe y es **`owner`** → no lo toca (devuelve tal cual). Nunca degrada al owner.
   - Si existe (`pending`/`revoked`) → lo **reactiva**: `status='active'`, `acceptedAt=now`, limpia `invitationToken`/`invitationExpiresAt`, setea `invitedBy=addedBy`. **No duplica filas.**
   - Si no existe → crea `{ role:'admin', status:'active', acceptedAt:now, invitedBy:addedBy }`.
3. Invalida los caches de permisos (`invalidateUserPermissionCache` / `UserRetreatCache` / `UserPermissionsResultCache`) para que el acceso aplique al instante — igual que `acceptInvitation`.
4. Devuelve el admin recargado con `relations: ['user', 'inviter']`.

## Diferencia con el flujo por enlace

| | Acceso directo (`addAdminDirect`) | Invitación por enlace (`inviteAdmin` + `acceptInvitation`) |
| --- | --- | --- |
| Entrada | `userId` (elegido de lista) | `email` escrito a mano |
| Estado inicial | `active` (inmediato) | `pending` → `active` al aceptar |
| Token / enlace | No | Sí (`invitationToken`, 7 días) |
| Verificación de email | No | Sí (en `acceptInvitation`) |
| Quién puede | owner / superadmin | owner / superadmin |

### Nota de seguridad

El acceso directo **omite la verificación de email** del flujo por enlace, igual que la asignación rápida del retiro. Es aceptable porque:

- la ruta es **owner-only** (`requireCommunityOwner`),
- el usuario ya está **registrado** (se selecciona de una búsqueda de usuarios existentes), y
- se invalida el cache de permisos.

El flujo por enlace conserva intactas sus protecciones (TTL de 7 días + email verificado en el lado de aceptación — "Vuln 2 hardening").

## Archivos tocados

**Backend**
- `packages/types/src/community.ts` — `addCommunityAdminSchema`.
- `apps/api/src/services/communityService.ts` — `addAdminDirect`.
- `apps/api/src/services/communityAuditService.ts` — acción `ADMIN_ADD`.
- `apps/api/src/controllers/communityController.ts` — `addAdmin`.
- `apps/api/src/routes/communityRoutes.ts` — `POST /:id/admins/add`.

**Frontend**
- `apps/web/src/services/api.ts` — `addCommunityAdmin(communityId, userId)`.
- `apps/web/src/stores/communityStore.ts` — `addAdmin` (upsert en `admins`).
- `apps/web/src/components/community/InviteAdminModal.vue` — rework a dos modos.
- `apps/web/src/locales/{es,en}.json` — claves `community.admin.*` (tabSearch, tabLink, searchUser, giveAccess, addSuccess, linkDesc, etc.).

## Tests

- **Service (Jest)** `apps/api/src/tests/services/communityService.test.ts` → describe `Admin Logic`:
  - acceso activo inmediato sin token (con relación `user`),
  - reactivación idempotente de pending/revoked sin duplicar,
  - no degrada al owner,
  - lanza `User not found` con usuario inexistente.
- **Schema (Jest)** `apps/api/src/tests/controllers/communityController.test.ts` → contrato de `addCommunityAdminSchema` (UUID válido / inválido / faltante).
- **Store (Vitest)** `apps/web/src/stores/__tests__/communityStore.test.ts` → `addAdmin`: push de nuevo admin, upsert (reemplazo sin duplicar), propagación de errores.
- **Modal (Vitest)** `apps/web/src/components/__tests__/InviteAdminModal.test.ts` → ambos modos: búsqueda (≥2 chars, mapeo `.user`, `selectUser`, `handleAddAccess` → emite `invited` + cierra), enlace (`handleInvite`, `copyLink`), reset al cerrar.

```bash
pnpm --filter api test src/tests/services/communityService.test.ts
pnpm --filter api test src/tests/controllers/communityController.test.ts
pnpm --filter web test src/stores/__tests__/communityStore.test.ts
pnpm --filter web test src/components/__tests__/InviteAdminModal.test.ts
```

## Prueba manual

1. `pnpm dev`, entrar a una comunidad propia → **Administradores**.
2. **Invitar Administrador** → pestaña **Buscar usuario** → escribir ≥ 2 caracteres → seleccionar → **Dar acceso**.
3. El usuario aparece de inmediato en **Administradores Actuales**.
4. Probar la pestaña **Invitar por enlace** → genera el enlace como antes.
5. Revocar funciona igual (owner-only).
