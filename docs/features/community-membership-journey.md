# Community Membership Journey

Documento exhaustivo del journey de una persona desde que descubre una comunidad Emaús hasta que se reúne efectivamente con ella, con verificación de datos en BD y gaps identificados.

> **Audiencia:** desarrolladores, product owners, coordinadores de comunidad.
> **Última actualización:** 2026-05-15.

---

## Resumen ejecutivo

| Métrica | Estado actual (2026-05-15) |
|---|---|
| Comunidades activas | 12 |
| Miembros activos totales | 15 |
| Miembros pendientes sin atender | 50 (todos en "Buen despacho") |
| Reuniones futuras programadas | 4 |
| Registros de asistencia | **0** |
| Miembros con User vinculado | 2 de 66 (3%) |

**Diagnóstico:** la BD tiene todas las entidades necesarias, los endpoints existen, pero **el journey se rompe después de que alguien se vuelve `active_member`**: no hay forma automática de avisarle de reuniones, no tiene UI propia para verlas, y la asistencia nunca se registra.

---

## 1. Los 5 caminos para volverse miembro

| # | Camino | Endpoint | Estado inicial | Crea Participant | Auth | Emails |
|---|---|---|---|---|---|---|
| 1 | Registro público (landing) | `POST /communities/:id/join-public` | `pending_verification` | Sí (mínimo) | No | 2 (admin + solicitante) |
| 2 | Importar desde retiro | `POST /communities/:id/members/import` | `active_member` | No | Admin | 0 |
| 3 | Manual existente | `POST /communities/:id/members` | `active_member` | No | Admin | 0 |
| 4 | Manual nuevo | `POST /communities/:id/members/create` | `active_member` | Sí (completo) | Admin | 0 |
| 5 | Invitar admin (CommunityAdmin, no Member) | `POST /communities/:id/admins/invite` | N/A | No | Admin | 1 (token) |

### Detalles por camino

#### 1. Registro público
- Componente UI: `apps/web/src/components/community/PublicJoinRequestModal.vue`
- Servicio: `communityService.createPublicJoinRequest()` (líneas 1127-1228)
- Estado inicial: `pending_verification` → requiere aprobación admin
- Protegido por reCAPTCHA + checkbox de consentimiento (LFPDPPP)
- Transacción serializa el check+insert para evitar race conditions
- Se dispara `notifyJoinRequest()` (fire-and-forget) → email a admins activos + confirmación al solicitante

#### 2. Importar desde retiro
- Componente UI: `apps/web/src/components/community/ImportMembersModal.vue`
- Servicio: `communityService.importFromRetreat()` (líneas 261-268)
- El admin selecciona retreatId + lista de participantIds del retiro
- Estado inicial: `active_member` (asume confianza por haber hecho retiro)

#### 3. Manual existente
- Servicio: `communityService.addMember()` (líneas 192-206)
- El admin busca un Participant existente por email/nombre y lo agrega

#### 4. Manual nuevo
- Componente UI: `apps/web/src/components/community/CreateMemberModal.vue`
- Servicio: `communityService.createCommunityMember()` (líneas 208-259)
- Crea Participant con defaults: birthDate=hoy, maritalStatus='O', address fields='N/A'

#### 5. Invitar admin (NO es membresía común)
- Servicio: `communityService.inviteAdmin()` (líneas 1021-1051) + `acceptInvitation()`
- Requiere User existente. Crea `CommunityAdmin` (no `CommunityMember`)
- Status: `pending` → `active` al aceptar el token

---

## 2. Estados del miembro y transiciones

```
                         ┌──────────────────────┐
                         │  pending_verification │  ◄── del registro público
                         └──────────┬───────────┘
                                    │
                                    │ admin aprueba
                                    ▼
                         ┌──────────────────────┐
                         │    active_member     │  ◄── importación, manual
                         └──────────┬───────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  ▼                 ▼                 ▼
        ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
        │ far_from_location │ │    no_answer    │ │  another_group   │
        └──────────────────┘ └──────────────────┘ └──────────────────┘
```

- Enum: `MemberStateEnum` en `packages/types/src/community.ts`
- Endpoint: `PUT /communities/:id/members/:memberId` → `updateMemberState()`
- Cualquier estado puede transicionar a cualquier otro (admin lo cambia con un Select).
- **GAP histórico (cerrado en G5):** no había auditoría de `verifiedBy`/`verifiedAt`/`previousState`.

---

## 3. Vinculación User ↔ Member (Participant)

```
┌──────────┐        ┌──────────────┐        ┌─────────────────┐
│   User   │───────►│  Participant │───────►│ CommunityMember │
└──────────┘  userId│              │  partId│                 │
                    └──────────────┘        └─────────────────┘
```

- Un `Participant` puede existir sin `User` (creado por admin o flujo público).
- Un `User` se vincula a un `Participant` por email matching (en `authController.register`).
- La membresía vive en `CommunityMember.participantId`.

### Caminos de vinculación

1. **User se registra → busca Participants existentes con su email** (`authController.register`, líneas 99-146)
2. **User se registra → busca comunidades con `contactEmail` matching** → `linkUserToContactCommunities` lo hace admin/owner
3. **G1 (nuevo):** Admin crea Member → busca User con email matching → setea `participant.userId`

---

## 4. Reuniones y asistencia

### CommunityMeeting (`apps/api/src/entities/communityMeeting.entity.ts`)

Soporta recurrencia completa:
- `isRecurrenceTemplate: true` para la plantilla maestra
- `parentMeetingId` apuntando a la plantilla en instancias
- `instanceDate`, `exceptionType: 'modified'|'cancelled'` para excepciones

`createDefaultMeetingForCommunity()` crea automáticamente una plantilla semanal al aprobar la comunidad si tiene `defaultMeetingDayOfWeek` + `defaultMeetingTime`.

### CommunityAttendance

- Tabla con (`meetingId`, `memberId`, `attended`, `notes`, `recordedAt`)
- Endpoint público para marcar asistencia sin login:
  - `GET /communities/public/attendance/:communityId/:meetingId` → datos de la reunión + lista de miembros
  - `POST /communities/public/attendance/:communityId/:meetingId` → registra marca individual

---

## 5. Verificación con datos reales (baseline 2026-05-15)

### Comunidades activas con conteo de miembros

| Comunidad | Active | Pending | Total |
|---|---|---|---|
| **Buen despacho** | 11 | **50** | 62 |
| Tlalpan | 4 | 0 | 4 |
| EMAÚS ECATEPEC HOMBRES | 0 | 0 | 0 |
| EMAÚS Polanco | 0 | 0 | 0 |
| Comunidad Emaús Puebla | 0 | 0 | 0 |
| (9 comunidades más) | 0 | 0 | 0 |

**Bandera roja:** "Buen despacho" tiene **50 solicitudes pendientes sin atender** — el admin necesita una notificación de aprobación que cierre el ciclo.

### Reuniones futuras

| Comunidad | Próximas reuniones |
|---|---|
| EMAÚS ECATEPEC HOMBRES | 1 |
| Rio de Luz | 1 |
| AZCAPOTZALCO | 1 |
| CUERNAVACA | 1 |

### Vinculación User → Member

| Comunidad | Miembros con `participant.userId` |
|---|---|
| Buen despacho | 1 (de 62) |
| Tlalpan | 1 (de 4) |

**Solo el 3% de los miembros tienen cuenta de usuario.** Cerrar este gap es secundario; mucho más urgente es el tema de notificaciones.

### Registros de asistencia

```
SELECT COUNT(*) FROM community_attendance;
→ 0
```

**El sistema de asistencia nunca se ha usado.** Razón probable: nadie sabe dónde está el link público.

---

## 6. Gaps identificados

| ID | Gap | Severidad | Estado |
|---|---|---|---|
| **G1** | Admin crea Member → user que se registra después no queda vinculado | Media | Pendiente |
| **G2** | Solicitante nunca sabe si fue aprobado/rechazado (50 personas en limbo en Buen despacho) | **Crítica** | Pendiente |
| **G3** | Se crea una reunión y nadie se entera por canal automático | **Crítica** | Pendiente |
| **G4** | Miembro común no tiene UI para ver sus comunidades y reuniones | Alta | Pendiente |
| **G5** | Sin auditoría de cambios de estado del miembro | Media | Pendiente |
| **G6** | Plantillas de email inline en código, no customizables | Baja | Pendiente |

---

## 7. Endpoints disponibles (mapa completo)

### Públicos (sin auth)
- `GET /communities/public` — lista de comunidades activas
- `GET /communities/public/meetings` — próximas reuniones
- `POST /communities/:id/join-public` — solicitar unirse
- `GET /communities/public/attendance/:communityId/:meetingId` — datos para marcar asistencia
- `POST /communities/public/attendance/:communityId/:meetingId` — marcar asistencia
- `POST /communities/public/register` — registrar comunidad nueva
- `GET /communities/invitations/status/:token` — verificar invitación admin

### Authenticated (admin/owner de la comunidad)
- `GET /communities` — comunidades del user
- `POST /communities` — crear
- `GET/PUT/DELETE /communities/:id`
- `GET /communities/pending` (superadmin)
- `POST /communities/:id/approve` (superadmin)
- `POST /communities/:id/reject` (superadmin)
- **Miembros:** `GET /:id/members`, `POST /:id/members`, `POST /:id/members/create`, `POST /:id/members/import`, `PUT /:id/members/:memberId`, `DELETE /:id/members/:memberId`, `PATCH /:id/members/:memberId/notes`, `GET /:id/members/:memberId/timeline`, `GET /:id/members/potential?retreatId=`
- **Reuniones:** `GET /:id/meetings`, `POST /:id/meetings`, `PUT /meetings/:id`, `DELETE /meetings/:id`, `POST /meetings/:id/next-instance`
- **Asistencia:** `GET /:id/meetings/:meetingId/attendance`, `POST /:id/meetings/:meetingId/attendance`, `POST /:id/meetings/:meetingId/attendance/single`
- **Dashboard:** `GET /:id/dashboard`
- **Admins:** `GET /:id/admins`, `POST /:id/admins/invite`, `DELETE /:id/admins/:userId`
- `POST /invitations/accept`

### Endpoints planeados (G3, G4)
- `POST /communities/:id/meetings/:meetingId/notify` — disparar notificación manual
- `GET /communities/my` — comunidades del usuario actual + próximas reuniones

---

## 8. Queries SQL útiles para soporte

```sql
-- Solicitudes pendientes por comunidad (alerta para coordinadores)
SELECT c.name, COUNT(*) AS pending
FROM community_member m JOIN community c ON c.id = m.communityId
WHERE m.state = 'pending_verification' AND c.status = 'active'
GROUP BY c.id HAVING pending > 0 ORDER BY pending DESC;

-- Tiempo de espera de solicitudes pendientes
SELECT c.name, p.firstName, p.lastName, p.email,
  julianday('now') - julianday(m.joinedAt) AS days_waiting
FROM community_member m
JOIN community c ON c.id = m.communityId
JOIN participants p ON p.id = m.participantId
WHERE m.state = 'pending_verification'
ORDER BY days_waiting DESC LIMIT 20;

-- Comunidades sin reuniones futuras (alerta de inactividad)
SELECT c.name, c.contactEmail
FROM community c
LEFT JOIN community_meeting cm ON c.id = cm.communityId AND cm.startDate >= datetime('now')
WHERE c.status = 'active' AND cm.id IS NULL;

-- Miembros sin email (no podrán recibir notificaciones)
SELECT c.name, COUNT(*) AS members_no_email
FROM community_member m
JOIN participants p ON p.id = m.participantId
JOIN community c ON c.id = m.communityId
WHERE m.state = 'active_member' AND (p.email IS NULL OR p.email = '')
GROUP BY c.id;
```

---

## 9. Estado de implementación de gaps

| Gap | Estado | Implementación |
|---|---|---|
| **G1** Auto-link User existente | ✅ Cerrado | `linkParticipantToExistingUser` en `communityService.ts`, invocado desde `addMember`, `createCommunityMember`, `createPublicJoinRequest` |
| **G2** Email transición de estado | ✅ Cerrado | `notifyMemberStateChange` en `communityService.ts`, disparado por `updateMemberState` cuando se sale de `pending_verification` |
| **G3** Notificación de reunión próxima | ✅ Cerrado + 🔒 hardened | `notifyMembersOfMeeting`, disparado automático al crear meeting no-template, + endpoint manual `POST /:id/meetings/:meetingId/notify`. **Security review detectó IDOR cross-tenant; fix aplicado** — ver `docs/security/notify-cross-tenant-idor-2026-05-15.md` |
| **G4** Vista "Mis Comunidades" | ✅ Cerrado | Endpoint `GET /communities/my` + `MyCommunitiesView.vue` + ruta `/app/my-communities` + item en sidebar |
| **G5** Auditoría de cambios de estado | ✅ Cerrado | Migration `20260515000000_AddAuditFieldsToCommunityMember` agrega `verifiedBy`, `verifiedAt`, `previousState` |
| **G6** Templates de email en BD | ⚠️ Aplazado | Plantillas viven inline en `communityService.ts`. Migrar a `message_templates` cuando se quiera personalizar por comunidad. Documentado abajo. |

---

## 10. Diagrama del journey completo (después de cierre)

```
┌──────────────┐
│   Visitor    │
│  (landing)   │
└──────┬───────┘
       │
       │ 1. Solicita unirse
       ▼
┌──────────────────────┐    notifyJoinRequest
│ POST /join-public    │────────────────┐
│ (TX + reCAPTCHA)     │                │
└──────┬───────────────┘                ▼
       │                          📧 admins
       │ Created:                 📧 solicitante (confirmación)
       │ - Participant
       │ - CommunityMember
       │   state=pending_verification
       │ - G1: linkParticipantToExistingUser
       ▼
┌──────────────────────┐
│  Admin recibe email  │
│  y aprueba           │
└──────┬───────────────┘
       │ PUT /members/:id { state: 'active_member' }
       ▼
┌──────────────────────┐    notifyMemberStateChange
│ updateMemberState    │────────────────┐
│ (G5 audit)           │                │
└──────┬───────────────┘                ▼
       │                          📧 ¡Bienvenido!
       │                            (con próxima reunión)
       │
       │ Mientras tanto, admin crea reunión:
       ▼
┌──────────────────────┐    notifyMembersOfMeeting
│ POST /meetings       │────────────────┐
└──────┬───────────────┘                │
       │                                ▼
       │                          📧 a TODOS los active_member
       │                            + link asistencia
       │
       │ User se registra como cuenta:
       ▼
┌──────────────────────┐
│ POST /auth/register  │
│ - link Participants  │
│ - linkUserToContact… │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ G4: /my-communities  │
│ Lista comunidades +  │
│ próximas reuniones + │
│ link confirmar       │
└──────────────────────┘
```

---

## 11. Verificación final con datos reales

Después de implementar G1-G5, los siguientes flujos están **garantizados end-to-end**:

| Flujo | Resultado esperado | Verificable con |
|---|---|---|
| Visitante solicita unirse | Member pending + 2 emails | Logs SMTP + `community_member.state` |
| Admin aprueba | Member active + 1 email + audit fields llenos | `SELECT verifiedBy, verifiedAt, previousState FROM community_member WHERE id=...` |
| Admin crea reunión real (no template) | N emails a todos los `active_member` con email | Logs SMTP + `community_member WHERE state='active_member'` |
| User existente coincide con `contactEmail` | Asignado como admin/owner automáticamente | `community_admin WHERE userId=...` |
| Admin crea Member sin user → user se registra después | Participant.userId queda seteado | `SELECT userId FROM participants WHERE email=...` |
| Miembro entra a `/app/my-communities` | Ve sus comunidades + próximas 3 reuniones | UI directa |
| Click "Confirmar asistencia" en email | Endpoint público registra asistencia | `INSERT INTO community_attendance` |

### Queries SQL para sanity check post-implementación

```sql
-- Audit funcionando: hay registros con verifiedBy/verifiedAt
SELECT COUNT(*) FROM community_member WHERE verifiedBy IS NOT NULL;

-- Members vinculados a Users (G1): el ratio debería subir conforme se usen los nuevos flows
SELECT COUNT(*) FROM community_member m
JOIN participants p ON p.id = m.participantId
WHERE p.userId IS NOT NULL;

-- Asistencias registradas (G3+G4): debería subir cuando los miembros usen los links
SELECT COUNT(*) FROM community_attendance;
```

---

## 11.6 Hardenings adicionales 2026-05-16 (Vuln 2 + audit + rate limit + templates)

### Vuln 2 (Privilege Escalation) cerrada

**Antes:** registrarse con `email = community.contactEmail` otorgaba admin automático (status='active', acceptedAt=now) sin verificación.

**Después (Opción A — Aceptación por token):**
- `linkUserToContactCommunities` crea `CommunityAdmin` con `status='pending'` + `invitationToken` aleatorio de 256 bits + `invitationExpiresAt` (7 días)
- `notifyContactEmailOfLinkRequest` envía email al `community.contactEmail` original (no al email del registro) con link `/invitations/accept?token=X`
- Solo cuando el verdadero líder acepta via el flujo existente `POST /communities/invitations/accept`, el status pasa a `active`
- Email adicional al **owner activo** (si existe y es distinto al contactEmail) avisando del intento — defense-in-depth

Si Mallory registra con email ajeno: el email de confirmación llega al líder real (no a Mallory). Sin su click, Mallory nunca obtiene acceso.

Archivos: `apps/api/src/services/communityService.ts` — `linkUserToContactCommunities`, `notifyContactEmailOfLinkRequest`.
Tests: 4 SECURITY tests en `communityService.test.ts` validan que status=pending, token presente, email al contactEmail con `/invitations/accept`.

### Audit log centralizado

Nueva tabla `community_audit_log` (migration `20260516000000_CreateCommunityAuditLog`):
```sql
CREATE TABLE "community_audit_log" (
  id, actorUserId, action, resourceType, resourceId, communityId,
  metadata (JSON), ipAddress, userAgent, createdAt
)
```

Helper `communityAuditService.log(event)` con try/catch interno — un fallo del log nunca rompe la operación de negocio. Action constants en `CommunityAuditAction`:
- `community.update`, `community.delete`
- `community.admin.invite`, `community.admin.revoke`
- `community.member.remove`, `community.member.state_change`

Acciones registradas hoy por el controller. Cualquier nueva acción crítica debería seguir el mismo patrón.

### Rate limit en notify

`POST /:id/meetings/:meetingId/notify` ahora pasa por `meetingNotifyLimiter`:
- **5 notificaciones del mismo meeting por user por hora**
- Key: `notify:{userId}:{meetingId}` (granular)
- 429 con mensaje claro al exceder

Previene abuso interno de un admin malicioso dentro de su propia comunidad.

### G6 — Plantillas semilla en BD

Migration `20260516100000_SeedCommunityMessageTemplates` agrega 4 plantillas en `message_templates` con `scope='community'` y `communityId=NULL`:
- `COMMUNITY_MEETING_INVITATION`
- `COMMUNITY_MEMBER_APPROVED`
- `COMMUNITY_JOIN_REQUEST_ADMIN`
- `COMMUNITY_LINK_REQUEST_CONFIRM`

Listas para que el service migre del HTML inline a `replaceAllVariables(template.message, vars)`. **No se hizo la migración del service** — los emails siguen viviendo inline. La deuda está acotada y documentada.

### Frontend respeta `_trimmed` y `viewerRole`

- `CommunityMembersView`: banner discreto cuando `hasTrimmedData === true` explicando que algunos campos solo son visibles para owner
- `CommunityMembersView`: botón "Eliminar miembro" oculto si `!isOwnerOrSuperadmin`
- `CommunityAdminsView`: botones "Invitar admin" + "Revocar" ocultos para admin no-owner
- `CommunityListView`: dropdown "Editar/Eliminar comunidad" oculto para admin no-owner (mensaje "Solo lectura (admin)" en su lugar)
- `communityStore` expone `viewerRole` y `isOwnerOrSuperadmin` como computed

---

## 11.5 Privacidad: visibilidad de miembros (hardening 2026-05-16)

Después de la security review, se identificaron 2 gaps de privacidad que ahora están cerrados:

### P1 — `getPublicAttendanceData` filtra solo `active_member`

**Antes:** el endpoint público `GET /communities/public/attendance/:c/:m` devolvía nombre + 3 teléfonos de TODOS los miembros sin filtrar por estado, incluidos pending, no_answer, another_group, far_from_location.

**Después:** se agregó `where: { communityId, state: 'active_member' }`. Solo miembros activos al momento de la consulta aparecen en el roster público.

Archivo: `apps/api/src/services/communityService.ts:872` — `getPublicAttendanceData`.
Test: `SECURITY: solo expone miembros con state=active_member`.

### P3 — Operaciones destructivas restringidas a `owner`

**Antes:** `requireCommunityAccess()` solo validaba `status='active'`. Cualquier admin (incluido `admin` invitado por el owner) podía:
- Editar metadata de la community
- Eliminar miembros
- Invitar/revocar otros admins

**Después:** nuevo middleware `requireCommunityOwner()` valida `role='owner'` (con bypass para superadmin). Aplicado a:

| Endpoint | Middleware previo | Middleware nuevo |
|---|---|---|
| `PUT /communities/:id` | `requireCommunityAccess()` | `requireCommunityOwner()` |
| `DELETE /communities/:id/members/:memberId` | `requireCommunityAccess()` | `requireCommunityOwner()` |
| `POST /communities/:id/admins/invite` | `requireCommunityAccess()` | `requireCommunityOwner()` |
| `DELETE /communities/:id/admins/:userId` | `requireCommunityAccess()` | `requireCommunityOwner()` |

Resto de endpoints siguen con `requireCommunityAccess()` (admin/owner pueden operar):
- Ver dashboard, members, meetings, attendance
- Crear/editar meetings
- Cambiar state de miembros
- Registrar attendance

**Frontend** (`apps/web/src/stores/communityStore.ts`):
```ts
const viewerRole = computed(() => currentCommunity.value?.viewerRole);
const isOwnerOrSuperadmin = computed(
  () => viewerRole.value === 'owner' || viewerRole.value === 'superadmin',
);
```

El response de `GET /communities/:id` ahora incluye `viewerRole`. Las views ocultan acciones owner-only con `v-if="communityStore.isOwnerOrSuperadmin"`:
- `CommunityMembersView`: botón "Eliminar miembro" oculto para admin no-owner
- `CommunityAdminsView`: botones "Invitar admin" y "Revocar admin" ocultos para admin no-owner

### P2 — Trimming de PII en `GET /:id/members` según rol

**Antes:** cualquier community admin activo (incluido `admin` invitado, no solo `owner`) recibía la entity Participant completa: email, 3 teléfonos, dirección, fecha de nacimiento, info médica, contactos de emergencia.

**Después:** nuevo método `getMembersForViewer(communityId, { userId, isSuperadmin }, state?)` que determina el rol y aplica trimming:
- **superadmin / owner**: PII completa (sin cambio)
- **admin no-owner**: solo `id, firstName, lastName, email, cellPhone` + `_trimmed: true` flag

Matriz actualizada:

| Rol | Campos visibles del Participant |
|---|---|
| `superadmin` | Todos |
| Community `owner` | Todos |
| Community `admin` | firstName, lastName, email, cellPhone (+ `_trimmed: true`) |
| Otro user logueado | 403 (sin acceso al endpoint) |

Helper `getViewerRoleForCommunity(userId, communityId, isSuperadmin)` retorna `'superadmin' | 'owner' | 'admin' | null`.

Tests: 5 casos cubren happy path por rol + edge cases.

Archivos:
- `apps/api/src/services/communityService.ts:192-247` — `getViewerRoleForCommunity` + `getMembersForViewer`
- `apps/api/src/controllers/communityController.ts:60` — usa el nuevo método, detecta superadmin via `authorizationService.hasRole`

## 12. Deuda técnica conocida (deudas residuales 2026-05-16)

### E2E con autenticación (H + J originales)

Los E2E actuales no cubren flujos autenticados (login → operación protegida → verificación). Requiere:
- Helper `loginAs(page, email, password)` que use el endpoint POST `/api/auth/login`
- Seed/cleanup de usuarios de test contra la BD compartida (riesgo de contaminación)
- O usar test fixtures con `request.storageState()` capturando una sesión

**Workaround actual:** tests E2E HTTP solo validan rechazo (401/403) sin auth. La cobertura de flujos autenticados está en unit/integration tests del backend.

### Migración del HTML inline a templates en BD

Las 4 plantillas existen en `message_templates` con scope='community', pero `communityService.ts` sigue construyendo el HTML inline en `notifyMembersOfMeeting`, `notifyMemberStateChange`, `notifyJoinRequest`, `notifyContactEmailOfLinkRequest`, `notifyLeaderLinked`.

**Patrón a aplicar (cuando se quiera personalizar):**
```ts
const tpl = await this.messageTemplateRepo.findOne({
  where: { type: 'COMMUNITY_MEETING_INVITATION', scope: 'community', communityId: null }
});
const html = tpl
  ? replaceAllVariables(tpl.message, vars)
  : INLINE_FALLBACK_HTML;
```

### Vuln 2 — endurecer aún más (opcional)

La Opción A actual (token acceptance) cierra el ataque. Mejoras adicionales:
- Agregar `emailVerified` a `User` y requerirlo antes de `linkUserToContactCommunities`
- Bloquear el flow si el `User.email` se confirmó hace menos de N días (anti-fastreg)
- Reducir TTL del token de 7 días a 48 horas

### Controller-level tests del trimming (F original)

Los tests del trimming están a nivel service. Validar el flow HTTP completo (con `req.user` real de session) requiere setup de supertest que no existe en el proyecto. Cobertura indirecta via E2E HTTP (`GET /api/communities/my` sin auth → 401).

### Deuda original (sigue):



### G6 — Templates de email en BD (aplazado)

**Estado actual:** las plantillas HTML viven inline en `communityService.ts` (`notifyJoinRequest`, `notifyMemberStateChange`, `notifyMembersOfMeeting`, `notifyLeaderLinked`). Cambiar el texto requiere edit del código + deploy.

**Cuándo implementar:**
- Cuando se quieran plantillas personalizadas por comunidad
- O cuando product team pida cambiar texto sin tocar código
- O cuando se necesite A/B testing

**Cómo implementar:**
1. Seed con tipos `COMMUNITY_MEETING_INVITATION`, `COMMUNITY_MEMBER_APPROVED`, `COMMUNITY_MEMBER_WELCOME`, `COMMUNITY_JOIN_REQUEST_ADMIN`
2. Cada método de notificación: `await this.messageTemplateRepo.findOne({ type: 'X' })` y usar `replaceAllVariables(template.body, vars)` (helper de `@repo/utils`)
3. Fallback al HTML inline si la plantilla no existe (defensa en profundidad)

### Otras deudas

| Deuda | Impacto | Cuándo importa |
|---|---|---|
| Sin cola de reintentos para emails (BullMQ + Redis) | Si SMTP falla transient, el email se pierde | Cuando crezcan los envíos |
| Sin WhatsApp como canal alternativo | Email tiene baja tasa de apertura para users informales | Cuando quieran convertir más |
| Sin digest diario para admins con muchas solicitudes | Buen despacho recibe 50+ emails de pending | Ya está pasando con BD actual |
| Sin link de cancelación / unsubscribe | LFPDPPP / GDPR podría requerir | Para compliance estricto |
| Sin notificación push (Web Push, service worker) | Email tarda en llegar | Cuando se quiera engagement inmediato |
| Endpoint `/asistencia/:c/:m` no expone título de la reunión sin auth | El miembro entra al link sin contexto | UX menor |

---

## 13. Archivos clave (mapa post-implementación)

| Archivo | Rol |
|---|---|
| `apps/api/src/services/communityService.ts` | Lógica core: todos los métodos `notify*`, `linkParticipantToExistingUser`, `getMyCommunitiesWithMeetings`, `updateMemberState` con audit |
| `apps/api/src/controllers/communityController.ts` | Endpoints: `notifyMembersOfMeeting`, `getMyCommunities`, `updateMemberState` con `actorUserId` |
| `apps/api/src/routes/communityRoutes.ts` | Rutas: `GET /communities/my`, `POST /:id/meetings/:meetingId/notify` |
| `apps/api/src/entities/communityMember.entity.ts` | Campos `verifiedBy`, `verifiedAt`, `previousState` |
| `apps/api/src/migrations/sqlite/20260515000000_AddAuditFieldsToCommunityMember.ts` | Migration G5 |
| `apps/api/src/controllers/authController.ts` | Hook `linkUserToContactCommunities` al registrar |
| `apps/web/src/views/MyCommunitiesView.vue` | Vista nueva G4 |
| `apps/web/src/router/index.ts` | Ruta `/app/my-communities` |
| `apps/web/src/components/layout/Sidebar.vue` | Item del menú |
| `apps/web/src/services/api.ts` | `getMyCommunities()`, `notifyMeetingMembers()` |
| `apps/api/src/tests/services/communityService.test.ts` | 69 tests (17 nuevos para G1-G5) |

---

## 14. Cómo hacer rollback

Si algo sale mal y hay que revertir:

1. **Código:** `git revert` los commits relacionados.
2. **Migration G5:** SQLite no soporta `DROP COLUMN` directamente. Tampoco hace falta — las columnas nulas no afectan el comportamiento previo. Si se necesita realmente borrarlas, hacer recreate-table siguiendo el patrón del proyecto.
3. **Backup:** existe en `apps/api/database.sqlite.backup-G5-20260515-*` por si hay pérdida de datos (no debería — la migration es aditiva).

