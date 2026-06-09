# Lección aprendida: "Mi agenda" (`/app/my-schedule`) vacía — participantId leído del objeto equivocado

**Fecha:** 2026-06-09
**Vista afectada:** `apps/web/src/views/MyScheduleView.vue`
**Síntoma reportado:** Un usuario vinculado a un participante del retiro (San Agustín) abría `/app/my-schedule` y la página "no mostraba nada", pese a tener responsabilidades y actividades asignadas en el horario.

## Causa raíz

La vista resolvía el participante del usuario desde el objeto **equivocado** del `authStore`.

El endpoint `/auth/status` (y `/auth/login`) responde con esta forma:

```js
// apps/api/src/controllers/authController.ts
res.json({
  ...user.toJSON(),          // ← participantId vive AQUÍ (raíz), campo de la entidad User
  profile: userProfile,      // ← userService.getUserProfile() = { roles, permissions } SOLAMENTE
});
```

El `authStore` lo reparte en dos refs distintos:

```ts
// apps/web/src/stores/authStore.ts
user.value = response.data;            // tiene participantId
userProfile.value = response.data.profile;  // { roles, permissions } — SIN participantId
```

Pero `MyScheduleView` buscaba el `participantId` dentro de `userProfile`:

```ts
// ❌ BUG — userProfile solo trae { roles, permissions }
const myParticipantId = computed(() => {
  const p = authStore.userProfile as any;
  return p?.participantId ?? p?.participant?.id ?? null;
});
```

Como `userProfile.participantId` siempre es `undefined`, `myParticipantId` resolvía a `null`, y la vista renderizaba la tarjeta *"Tu cuenta no tiene un participante vinculado en este retiro"* — aunque el vínculo y los datos sí existían en la base.

## Fix

Leer el `participantId` desde `authStore.user`, que es donde realmente viaja:

```ts
// ✅ apps/web/src/views/MyScheduleView.vue
const myParticipantId = computed<string | null>(() => {
  // El participantId vive en el objeto `user` (raíz del response de /auth/status),
  // NO en `userProfile`, que solo trae { roles, permissions }.
  const u = authStore.user as any;
  return u?.participantId ?? u?.participant?.id ?? null;
});
```

## Regla general

`authStore.userProfile` **NO** es el perfil del usuario en el sentido de datos personales: es exclusivamente `{ roles, permissions }` (RBAC), producido por `userService.getUserProfile()`. Cualquier dato del usuario que no sea rol/permiso (incluido `participantId`, email, nombre, flags) vive en `authStore.user` (raíz de `user.toJSON()`).

- Para datos de identidad / vínculo → `authStore.user`.
- Para roles y permisos → `authStore.userProfile`.

## Limitación de diseño latente (no corregida aquí)

`User.participantId` es un campo **global** (un solo participante vinculado por usuario), no por retiro. El fix funciona porque el participante vinculado del usuario afectado pertenecía al retiro seleccionado. Si un usuario fuera participante en varios retiros simultáneamente, esta vista podría apuntar al participante de otro retiro. Lo robusto sería resolver el participante vía `retreat_participants` filtrando por `selectedRetreatId`. Pendiente si surge el caso multi-retiro.

## Tests

`apps/web/src/views/__tests__/MyScheduleView.test.ts` (6 tests), incluye:

- Resuelve `participantId` desde `authStore.user` y muestra los items asignados.
- **Regresión**: si el `participantId` está solo en `userProfile` y no en `user`, NO se resuelve (guard contra reintroducir el bug).
- Card de "no vinculado" cuando `user` no tiene `participantId`.
- Forma anidada `user.participant.id`.
- Items vía `responsables[]` (no solo responsabilidad principal).
- No muestra items de otro participante.
