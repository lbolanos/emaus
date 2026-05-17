# Cross-Tenant IDOR en POST /communities/:id/meetings/:meetingId/notify

**Fecha de descubrimiento:** 2026-05-15
**Fecha de fix:** 2026-05-15 (mismo día)
**Severidad:** HIGH
**Confianza:** 9/10
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key) + CWE-863 (Incorrect Authorization)
**Estado:** ✅ Cerrada en commit pendiente

---

## Resumen

El endpoint introducido en G3 del community membership journey (`POST /communities/:id/meetings/:meetingId/notify`) tenía un IDOR clásico: el middleware de autorización validaba al caller contra el `:id` de la URL, pero el controller y service operaban exclusivamente sobre `:meetingId` — sin verificar que el meeting realmente perteneciera a la community del URL.

Cualquier admin de community A podía disparar un email blast a TODOS los miembros activos de community B usando un `meetingId` perteneciente a B (públicamente descubrible vía `GET /api/communities/public/meetings`).

---

## Cronología

| Fecha | Evento |
|---|---|
| 2026-05-15 (mañana) | Implementación de G3 (`notifyMembersOfMeeting`) en el community membership journey |
| 2026-05-15 (tarde) | Security review automatizada detecta el IDOR con confianza 9/10 |
| 2026-05-15 (tarde) | Fix aplicado, defense-in-depth agregado, 2 unit tests + 2 E2E tests |

---

## Vulnerabilidad

### Código pre-fix

**Route** (`apps/api/src/routes/communityRoutes.ts:153`):
```ts
router.post('/:id/meetings/:meetingId/notify', requireCommunityAccess(), (req, res) =>
  CommunityController.notifyMembersOfMeeting(req, res),
);
```

`requireCommunityAccess()` con default param `'id'` solo valida que el caller sea admin de `req.params.id`.

**Controller** (`apps/api/src/controllers/communityController.ts`):
```ts
static async notifyMembersOfMeeting(req: Request, res: Response) {
  const { meetingId } = req.params;  // ← ignora req.params.id
  communityService.notifyMembersOfMeeting(meetingId).catch(...)
  res.status(202).json({ message: 'Notification queued' });
}
```

**Service** (`apps/api/src/services/communityService.ts:1614`):
```ts
async notifyMembersOfMeeting(meetingId: string): Promise<void> {
  const meeting = await this.meetingRepo.findOne({ where: { id: meetingId } });
  if (!meeting) return;
  const community = await this.communityRepo.findOne({ where: { id: meeting.communityId } });
  // ↑ resuelve la community real del meeting, sin validar contra :id del URL
  ...
  // Envía emails a TODOS los active_member de meeting.communityId
}
```

### Cadena de explotación

1. **Discovery (sin auth):** `GET /api/communities/public/meetings` devuelve hasta 20 reuniones próximas con `id` y `community.id`. No requiere autenticación.
2. **Selección:** atacante (admin legítimo de community A) selecciona un `meetingId X` perteneciente a community B (donde no tiene permisos).
3. **Exploitación:** `POST /api/communities/<A-id>/meetings/<X>/notify` con su cookie de sesión válida.
4. **Pase del middleware:** `requireCommunityAccess('id')` valida que es admin de A → OK.
5. **Acción dañina:** service resuelve community B desde `meeting.communityId`, envía emails a todos los `active_member` de B con título, descripción y link de asistencia de la reunión de B.
6. **Repetible:** sin rate limit específico. Permite spam transversal y abuso de la reputación SMTP del dominio.

### Impacto

- **Spam transversal entre tenants:** mensajes con apariencia oficial llegan a usuarios que no pertenecen a la comunidad del atacante.
- **Pivote de phishing:** combinado con la creación de meetings propios (donde el admin controla `title` y `description`), aunque `escapeHtml()` previene XSS, el texto plano puede inducir clicks maliciosos.
- **Daño de reputación SMTP:** envíos repetidos desde el mismo dominio pueden activar bloqueos anti-spam de Gmail/Outlook.
- **Confusión de tenants:** miembros de B reciben emails referidos a otra community sin contexto.

### Severidad: HIGH

Triggers para HIGH severity:
- Bypass de authorization en endpoint autenticado (no theoretical, exploitable en 2 pasos).
- Cruza límites de tenant (multi-tenancy intact).
- meetingIds son enumerables vía endpoint público.

---

## Fix

### Cambios aplicados

**Route** (`apps/api/src/routes/communityRoutes.ts:153`):
```diff
- router.post('/:id/meetings/:meetingId/notify', requireCommunityAccess(), (req, res) =>
+ router.post('/:id/meetings/:meetingId/notify', requireCommunityMeetingAccess('meetingId'), (req, res) =>
    CommunityController.notifyMembersOfMeeting(req, res),
  );
```

`requireCommunityMeetingAccess('meetingId')` (en `apps/api/src/middleware/authorization.ts:787-840`) resuelve la community real desde el meeting y valida admin status contra esa community. Es el mismo middleware usado en `PUT /meetings/:id`, `DELETE /meetings/:id`, etc.

**Service** (`apps/api/src/services/communityService.ts:1614`) — defense-in-depth:
```ts
async notifyMembersOfMeeting(meetingId: string, expectedCommunityId?: string): Promise<void> {
  const meeting = await this.meetingRepo.findOne({ where: { id: meetingId } });
  if (!meeting) return;
  if (expectedCommunityId && meeting.communityId !== expectedCommunityId) {
    const err = new Error('Meeting does not belong to the specified community');
    (err as any).code = 'MEETING_COMMUNITY_MISMATCH';
    throw err;
  }
  ...
}
```

**Controller** pasa el communityId del URL al service:
```ts
const { id: communityId, meetingId } = req.params;
communityService.notifyMembersOfMeeting(meetingId, communityId).catch(...);
```

### Capas de defensa

Dos capas independientes bloquean el IDOR:

1. **Middleware** (`requireCommunityMeetingAccess`): si alguien remueve esto en un futuro refactor, no compromete la integridad.
2. **Service** (`expectedCommunityId` check): si alguien llama el service directamente (programmatic), tiene que pasar el communityId esperado o el cross-tenant queda bloqueado por construcción.

---

## Tests

### Unit (`apps/api/src/tests/services/communityService.test.ts`)

```ts
it('SECURITY: rechaza con MEETING_COMMUNITY_MISMATCH si meetingId pertenece a otra comunidad (IDOR fix)', ...)
it('SECURITY: permite cuando expectedCommunityId coincide con la del meeting', ...)
```

### E2E (`apps/web/tests/e2e/community-journey.spec.ts`)

```ts
test('SECURITY: POST /:id/meetings/:meetingId/notify requiere autenticación')
test('SECURITY: el endpoint notify rechaza el cross-tenant attack incluso con community :id válido')
```

Estos E2E enumeran meetings de communities distintas via el endpoint público y verifican que el cross-tenant attack devuelve 4xx, no 2xx.

---

## Lecciones / patrones para prevenir similar

### Regla: el middleware debe resolver autorización contra el recurso **más específico** del URL

Si una ruta tiene múltiples params (`/:a/:b/:c/action`), el middleware debe validar contra el más profundo o el que dicta el target real de la operación. En este caso:

- Mal: `requireCommunityAccess()` con default `'id'` → valida contra params.id, ignora meetingId.
- Bien: `requireCommunityMeetingAccess('meetingId')` → resuelve community desde meeting + valida.

### Regla: si el service opera sobre un ID, debe validar el contexto

Cualquier method que reciba un `xxxId` debe aceptar también el `parentId` esperado cuando el caller lo conoce, y verificar la pertenencia. Es defense-in-depth contra refactors de routing.

### Regla: endpoints públicos que listan IDs son superficie de ataque para IDOR

`GET /communities/public/meetings` legítimamente expone `meeting.id` + `meeting.community.id` para el landing público. Cualquier endpoint autenticado que use esos mismos IDs debe asumir que están enumerables.

### Auditar el repo

```bash
# Encontrar rutas con :xxxId que usan requireCommunityAccess en vez de requireXxxAccess:
grep -rn ":meetingId\|:memberId" apps/api/src/routes/ | grep "requireCommunityAccess"
grep -rn ":userId" apps/api/src/routes/ | grep "requireCommunityAccess"
```

Resultado actual de la auditoría:
- `GET /:id/members/:memberId/timeline` — usa `requireCommunityAccess('id')`. **Verificar:** el service `getMemberTimeline(memberId)` ¿valida que el member pertenece a `:id`? → **TODO de seguimiento**.
- `PUT /:id/members/:memberId` — mismo análisis.
- `PATCH /:id/members/:memberId/notes` — mismo análisis.
- `DELETE /:id/members/:memberId` — mismo análisis.

---

## TODO de seguimiento (no implementado en este fix)

Los endpoints listados arriba (`/members/:memberId` etc.) pueden tener el mismo patrón IDOR. Verificar en próxima auditoría:

1. ¿Service valida que `member.communityId === :id` antes de operar?
2. ¿O usa `requireCommunityAccess` solo con el `:id` del URL sin re-check?

Si tienen el mismo problema: aplicar el mismo patrón de fix (middleware específico o `expectedCommunityId` en el service).

---

## Referencias internas

- Plan de implementación G3: `/Users/lbolanos/.claude/plans/la-busqueda-de-comunidad-compiled-hopper.md`
- Doc del journey: `docs/features/community-membership-journey.md`
- Middleware: `apps/api/src/middleware/authorization.ts:787-840` (`requireCommunityMeetingAccess`)
- Memoria persistente: agregar este fix a `~/.claude/projects/-Users-lbolanos-Developer-personal-emaus/memory/feedback_authorization_patterns.md`
