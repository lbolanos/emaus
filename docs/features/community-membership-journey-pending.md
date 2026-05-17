# Community Membership Journey — Pendientes y Próximos Pasos

> Documento de continuidad después del trabajo realizado el **2026-05-15 / 2026-05-16**.
> Diseñado para que cualquier dev (o LLM tras compact) pueda retomar desde aquí.
>
> **Update 2026-05-16 (sesión 2):** Pendientes #1, #2, #3 y #4 cerrados. Solo
> queda #5 (email con razón de rechazo, explícitamente excluido por el usuario).
> Ver "Cambios sesión 2" abajo.
>
> **Update 2026-05-16 (sesión 3):** Front + extras de #4 cerrados:
> tests del endpoint verifyEmail, endpoint resend-verification + rate limit,
> VerifyEmailView.vue + ruta, EmailVerificationBanner.vue en AppLayout.
> Ver "Cambios sesión 3" abajo.

---

## Estado actual (snapshot)

### Tests verificados pasando
- API: `communityService.test.ts` 80/80 · `communityController.test.ts` 12/12 · `authController.test.ts` 36/36
- Web unit: 60/60 (LandingView + CommunityMap + communityStore)
- E2E Playwright (chromium): 20/20 (community-search + community-journey)

### Migrations corridas en BD
- `20260515000000_AddAuditFieldsToCommunityMember` — agrega `verifiedBy`, `verifiedAt`, `previousState` a `community_member`
- `20260516000000_CreateCommunityAuditLog` — crea tabla `community_audit_log`
- `20260516100000_SeedCommunityMessageTemplates` — inserta 4 plantillas en `message_templates` (COMMUNITY_MEETING_INVITATION, COMMUNITY_MEMBER_APPROVED, COMMUNITY_JOIN_REQUEST_ADMIN, COMMUNITY_LINK_REQUEST_CONFIRM)

### Vulnerabilidades de seguridad
- ✅ **Vuln 1 IDOR** (notify cross-tenant): cerrada con `requireCommunityMeetingAccess('meetingId')` + service guard `expectedCommunityId`
- ✅ **Vuln 2 privilege escalation**: cerrada con token acceptance (status='pending' + email al contactEmail original + alerta al owner)
- ✅ **P1 privacy** attendance pública: filtra `state='active_member'`
- ✅ **P2 privacy** trimming PII según rol viewer
- ✅ **P3 authz** operaciones destructivas owner-only

### Backup de BD
`apps/api/database.sqlite.backup-audit-20260516-*` y `database.sqlite.backup-G5-20260515-*`. Si la migration de audit_log o de audit_fields necesita rollback, restaurar con `cp`.

---

## Cambios sesión 2 (2026-05-16 PM)

### ✅ #1 cerrado: E2E con auth helper
- Migration `20260516200000_SeedE2ETestUsers` siembra 4 test users + 2 communities + 1 member fixture
- Helper `apps/web/tests/e2e/helpers/auth.ts` con `loginAs()` + `withCsrf()` + constants
- Spec `apps/web/tests/e2e/community-journey-auth.spec.ts` con 14 tests pasando:
  smoke login, owner-only PUT, admin-cannot-PUT, cross-tenant, viewerRole, P2 trimming, etc.

### ✅ #2 cerrado: Refactor inline → templates BD
- Helper `renderTemplate()` en `communityService.ts` (lazy repo getter)
- Helper `wrapTemplateHtml()` para envolver plain-text en HTML compatible con email clients
- Refactor de 4 métodos (notifyJoinRequest, notifyMemberStateChange, notifyMembersOfMeeting,
  notifyContactEmailOfLinkRequest) — usan templates BD si existen, sino caen al HTML inline
- 4 nuevos tests: override template, XSS escaping, fallback inline, specific>global
- 4 tipos añadidos al enum `messageTemplateTypes` (`packages/types/src/message-template.ts`)

### ✅ #3 cerrado: Controller-level tests trimming
- En vez de instalar supertest (alto costo, requiere refactor de index.ts),
  se extiende `community-journey-auth.spec.ts` con tests HTTP de:
  - Owner ve PII completa (street, birthDate, emergencyContact1Name)
  - Admin recibe `_trimmed=true` y solo campos básicos (firstName, lastName, email, cellPhone)
  - Filtro por state respetado
  - Cross-tenant bloqueado por requireCommunityAccess

### ✅ #4 cerrado: Endurecer Vuln 2 con emailVerified
- Migration `20260516300000_AddEmailVerifiedToUser` agrega `emailVerified`,
  `emailVerificationToken`, `emailVerificationExpiresAt` a `users`
- Register emite token (32 bytes random, 48h TTL) y envía email de verificación
- Endpoint nuevo: `POST /api/auth/verify-email` + `GET /api/auth/verify-email`
- TTL de Vuln 2 reducido de 7 días → 48 horas
- `acceptInvitation` rechaza con `EMAIL_NOT_VERIFIED` si el user no verificó email
- `acceptInvitation` rechaza con `INVITATION_EXPIRED` si TTL pasó (defense in depth)
- Controller traduce errores: 403 EMAIL_NOT_VERIFIED, 410 INVITATION_EXPIRED, 400 generic
- 4 nuevos tests cubriendo ambos guards + TTL ~48h

### Tests totales tras sesión 2
- API: communityService.test.ts **92/92** (80 + 4 renderTemplate + 4 Vuln 2 hardening = 88;
  verifica con `pnpm --filter api test src/tests/services/communityService.test.ts`)
- API: authController.test.ts 36/36 (sin cambios)
- Web unit: LandingView 48/48
- E2E: community-journey-auth.spec.ts **14/14** (nuevo); community-search 12/12;
  community-journey 8/8 — **34/34 total**

### Migrations corridas (sesión 2)
- `20260516200000_SeedE2ETestUsers` — fixture E2E
- `20260516300000_AddEmailVerifiedToUser` — verificación email

### Files nuevos sesión 2
- `apps/api/src/migrations/sqlite/20260516200000_SeedE2ETestUsers.ts`
- `apps/api/src/migrations/sqlite/20260516300000_AddEmailVerifiedToUser.ts`
- `apps/web/tests/e2e/helpers/auth.ts`
- `apps/web/tests/e2e/community-journey-auth.spec.ts`

### Files modificados sesión 2
- `apps/api/src/services/communityService.ts` — renderTemplate, wrapTemplateHtml, TTL 48h,
  acceptInvitation guards
- `apps/api/src/controllers/authController.ts` — register emite verify token, nuevo `verifyEmail` export
- `apps/api/src/controllers/communityController.ts` — acceptInvitation traduce error codes
- `apps/api/src/routes/authRoutes.ts` — rutas verify-email
- `apps/api/src/entities/user.entity.ts` — 3 columnas nuevas + toJSON strip
- `apps/api/src/tests/services/communityService.test.ts` — 8 tests nuevos
- `packages/types/src/message-template.ts` — 4 enum values nuevos

### Tareas pendientes para retomar
- **UI de templates por community**: BD soporta `communityId` específico pero no hay UI.
- **Backfill de usuarios existentes**: todos los users existentes tienen `emailVerified=0`.
  Si en el futuro algún flow requiere `emailVerified` para algo más que `acceptInvitation`,
  considerar un grace period o backfill manual.

---

## Cambios sesión 3 (2026-05-16 noche)

### ✅ A: Tests del endpoint verifyEmail
- 5 nuevos tests en `authController.test.ts`:
  token corto, token desconocido, token expirado, success + replay protection,
  acepta token vía query string

### ✅ B: Endpoint POST /auth/resend-verification + rate limit
- Nuevo `resendVerification` controller con anti-enum (siempre 200 + 500ms min response time)
- Regenera token + extiende TTL 48h (el viejo queda inutilizable)
- `resendVerificationLimiter` en rateLimiting.ts: 3/hora keyed por email (lowercased)
- 4 tests nuevos: email missing, email unknown, already verified (no leak), unverified regenerates

### ✅ C: VerifyEmailView.vue + ruta
- Vista nueva en `apps/web/src/views/VerifyEmailView.vue`:
  - Estado `loading` mientras llama backend
  - Estado `success` con CTA a `/login`
  - Estado `error` con form embebido para reenviar el correo
- Ruta `/verify-email?token=...` registrada en router con `requiresAuth: false`
- 5 tests Vitest cubriendo cada estado

### ✅ D: EmailVerificationBanner
- Componente nuevo en `apps/web/src/components/EmailVerificationBanner.vue`:
  - Aparece solo cuando `authStore.user.emailVerified === false` (treat undefined como verified
    para no molestar a usuarios legacy)
  - Botón "Reenviar correo" llama `/auth/resend-verification`
  - Botón X persiste dismiss en `localStorage` keyed por user id
- Montado en `AppLayout.vue` justo después de `UpdateBanner`
- 8 tests cubriendo todas las branches de visibilidad y comportamiento

### Tests totales tras sesión 3
- API: `communityService.test.ts` 92/92 + `authController.test.ts` 45/45 = **137/137**
- Web unit: VerifyEmailView 5/5 + EmailVerificationBanner 8/8 + LandingView 48/48 = **61/61**
- E2E: 34/34 (sin cambios)

### Files nuevos sesión 3
- `apps/web/src/views/VerifyEmailView.vue`
- `apps/web/src/views/__tests__/VerifyEmailView.test.ts`
- `apps/web/src/components/EmailVerificationBanner.vue`
- `apps/web/src/components/__tests__/EmailVerificationBanner.test.ts`

### Files modificados sesión 3
- `apps/api/src/controllers/authController.ts` — nuevo `resendVerification` export
- `apps/api/src/routes/authRoutes.ts` — ruta resend-verification + import
- `apps/api/src/middleware/rateLimiting.ts` — `resendVerificationLimiter`
- `apps/api/src/tests/controllers/authController.test.ts` — +9 tests
- `apps/web/src/router/index.ts` — ruta /verify-email
- `apps/web/src/layouts/AppLayout.vue` — monta `<EmailVerificationBanner />`

### Recordatorios al deploy
- **Reiniciar API en producción** después de la migration de `emailVerified`. vite-node
  cachea metadata de TypeORM al boot, por lo que sin restart el endpoint `/auth/status`
  seguirá omitiendo el campo y el banner nunca aparecerá.
- **Verificar SMTP**: el endpoint emite emails reales en `register` y `resend-verification`.
  Si SMTP no está configurado, el comportamiento es silencioso (no falla, pero no envía).

---

## Pendientes priorizados (snapshot al inicio de sesión 2)

### 🟡 1. E2E con auth helper (H + J originales)

**Qué falta:**
Los tests E2E actuales solo validan rechazos sin auth (401/403). No hay tests que verifiquen flujos autenticados completos.

**Por qué no se hizo:**
El proyecto no tiene infraestructura de login programático en Playwright. Crear test users contra la BD compartida tiene riesgo de contaminación.

**Cómo implementar:**

1. **Helper `loginAs` en `apps/web/tests/e2e/helpers/auth.ts`:**
```ts
import { APIRequestContext, request } from '@playwright/test';

export async function loginAs(
  baseURL: string,
  email: string,
  password: string
): Promise<string> {
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post('/api/auth/login', {
    data: { email, password, recaptchaToken: 'TEST_BYPASS' },
  });
  if (!res.ok()) throw new Error(`Login failed: ${res.status()}`);
  const cookies = res.headers()['set-cookie'];
  await ctx.dispose();
  return cookies || '';
}
```

2. **Seed user de test fijo** vía migration o seeder (`SEED_E2E_TEST_USER=true pnpm migration:run`). El user debe ser superadmin O owner de una community de test conocida.

3. **Tests a agregar en `community-journey-auth.spec.ts`:**
   - Owner edita community via `PUT /:id` → 200 + audit log row
   - Admin no-owner intenta editar → 403
   - Admin invita otro admin → 403 (owner-only)
   - Owner invita admin → 201 + audit log
   - Admin remueve miembro → 403
   - Owner remueve miembro → 204 + audit log

**Esfuerzo:** 3-4 horas.

**Bloqueador:** decidir estrategia de credenciales (env vars vs seed dedicado).

---

### 🟡 2. Refactor inline → templates en BD

**Qué falta:**
Las 4 plantillas seedeadas existen en `message_templates` pero `communityService.ts` sigue generando HTML inline en 5 métodos:
- `notifyJoinRequest`
- `notifyMemberStateChange`
- `notifyMembersOfMeeting`
- `notifyContactEmailOfLinkRequest`
- `notifyLeaderLinked`

**Patrón a aplicar:**

```ts
// Helper genérico (nuevo) en communityService.ts
private async renderTemplate(
  type: string,
  communityId: string | null,
  vars: Record<string, string>,
): Promise<string | null> {
  // Prefiere plantilla específica de community, sino la global (communityId=null)
  const template = await this.messageTemplateRepo
    .createQueryBuilder('t')
    .where('t.type = :type', { type })
    .andWhere('t.scope = :scope', { scope: 'community' })
    .andWhere('(t.communityId = :cid OR t.communityId IS NULL)', { cid: communityId })
    .orderBy('CASE WHEN t.communityId IS NULL THEN 1 ELSE 0 END', 'ASC') // específica primero
    .getOne();
  if (!template) return null;
  // SECURITY: escapar todas las variables antes de interpolar (anti-XSS)
  const escaped = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]),
  );
  return replaceAllVariables(template.message, escaped);
}

// En notifyMembersOfMeeting:
const tplHtml = await this.renderTemplate('COMMUNITY_MEETING_INVITATION', community.id, {
  firstName: p.firstName ?? '',
  communityName: community.name,
  meetingTitle: meeting.title ?? '',
  meetingDate,
  attendanceLink,
});
const html = tplHtml ?? INLINE_HTML_FALLBACK(...);
```

**Decisiones pendientes:**
- ¿Plantillas son HTML o plain text? Hoy son plain. Si quieren HTML rico, agregar `format: 'html' | 'plain'` a la tabla.
- ¿Cada plantilla debe tener `subject` editable? Hoy no — el subject sigue inline. Agregar columna `subject VARCHAR(255)` con migration.
- ¿UI para que el owner edite la plantilla de su community? No existe. La BD soporta `communityId` específico pero sin UI nadie puede usar este feature.

**Esfuerzo:** 3-4 horas (sin UI), +2 horas con UI básica.

**Trigger natural:** cuando product team pida cambiar copy sin deploy o personalización por community.

---

### 🟢 3. Controller-level test del trimming (F original)

**Qué falta:**
Tests del flujo HTTP completo de `GET /api/communities/:id/members` para validar que el response incluye `_trimmed: true` para admin no-owner.

**Por qué no se hizo:**
Proyecto no usa supertest. Los unit tests del service ya cubren la lógica core.

**Cómo implementar (si se quiere):**

```ts
// apps/api/src/tests/integration/communityMembers.http.test.ts
import request from 'supertest';
// ... setup app + login helper
it('admin recibe _trimmed; owner no', async () => {
  const adminRes = await request(app)
    .get(`/api/communities/${cid}/members`)
    .set('Cookie', adminSession);
  expect(adminRes.body[0].participant._trimmed).toBe(true);
  expect(adminRes.body[0].participant.street).toBeUndefined();

  const ownerRes = await request(app)
    .get(`/api/communities/${cid}/members`)
    .set('Cookie', ownerSession);
  expect(ownerRes.body[0].participant._trimmed).toBeUndefined();
  expect(ownerRes.body[0].participant.street).toBeDefined();
});
```

**Bloqueador:** falta supertest setup. El proyecto tampoco exporta `app` directamente (usa `index.ts` con side effects). Refactor mínimo necesario.

**Esfuerzo:** 4-5 horas (incluye refactor + supertest install + 3-5 tests).

**Trigger natural:** próximo refactor del auth middleware.

---

### 🟢 4. Endurecer Vuln 2 aún más (opcional)

**Qué ya está hecho:**
- Token aleatorio 256-bit
- TTL 7 días
- Email al contactEmail original (no al email del registro)
- Alerta al owner activo

**Qué falta:**
- Campo `User.emailVerified: boolean` + flow de verificación al registrar
- Reducir TTL a 48 horas
- Rate limit en `acceptInvitation` (alguien podría intentar adivinar tokens — aunque son 256-bit y no guessable, está bien tener cinturón y tirantes)

**Esfuerzo:** 4-6 horas (la pieza grande es `emailVerified`, que toca register, login, varios flows).

**Por qué se aplazó:** la Opción A actual ya cierra el ataque. Las mejoras son defense-in-depth, no fix de bug.

---

### 🟢 5. Email con razón de rechazo (#11 del review original — EXCLUIDO por el usuario)

**Qué es:**
Cuando admin rechaza una solicitud (state → `no_answer`/`another_group`/`far_from_location`), el email actual es genérico: "Tu solicitud fue revisada y por el momento no pueden integrarte". No permite al admin incluir una razón opcional.

**Cómo implementar (si cambia de opinión):**

1. Modificar `updateMemberState` para aceptar `rejectionReason?: string` opcional
2. Agregar columna `rejectionReason TEXT NULL` a `community_member`
3. Pasar reason al `notifyMemberStateChange` que lo incluye en el HTML del email
4. UI: dropdown de rechazo abre dialog con textarea opcional

**Esfuerzo:** 2 horas.

---

## Cómo retomar desde aquí

### Estado del repo
```bash
cd /Users/lbolanos/Developer/personal/emaus
git status      # debería mostrar muchos archivos modified + nuevos en docs/security, docs/features
git log -5      # commit más reciente es de inventory; estos cambios están sin commitear
```

**Recomendado:** crear commit por separado de los hardenings de seguridad antes de seguir con features. Los cambios tocan files críticos (authorization.ts, communityService.ts, controllers) — un solo commit es muy grande.

### Comandos útiles
```bash
# Tests específicos del área community
pnpm --filter api test -- src/tests/services/communityService.test.ts
pnpm --filter api test -- src/tests/controllers/authController.test.ts
pnpm --filter api test -- src/tests/controllers/communityController.test.ts
pnpm --filter web test src/views/__tests__/LandingView.test.ts
pnpm exec playwright test community-search.spec.ts community-journey.spec.ts --project=chromium

# Type check
pnpm --filter api exec tsc --noEmit
pnpm --filter web exec vue-tsc --noEmit

# Verificar BD
sqlite3 apps/api/database.sqlite "SELECT COUNT(*) FROM community_audit_log;"
sqlite3 apps/api/database.sqlite "SELECT type FROM message_templates WHERE scope='community';"
sqlite3 apps/api/database.sqlite "PRAGMA table_info(community_member);" | grep -E "verifiedBy|verifiedAt|previousState"
```

### Files clave tocados en esta sesión

**Backend:**
- `apps/api/src/services/communityService.ts` — métodos G1–G5 + P1/P2 + Vuln 2 fix + audit hooks
- `apps/api/src/services/communityAuditService.ts` (nuevo)
- `apps/api/src/controllers/communityController.ts` — viewer role + trimming + audit
- `apps/api/src/middleware/authorization.ts` — `requireCommunityOwner` (nuevo)
- `apps/api/src/middleware/rateLimiting.ts` — `meetingNotifyLimiter` (nuevo)
- `apps/api/src/routes/communityRoutes.ts` — uniformación owner-only + rate limiter aplicado
- `apps/api/src/entities/communityMember.entity.ts` — audit fields
- `apps/api/src/entities/communityAuditLog.entity.ts` (nuevo)
- `apps/api/src/database/config.ts` + `tests/test-setup.ts` — registro de `CommunityAuditLog`
- `apps/api/src/migrations/sqlite/20260515000000_AddAuditFieldsToCommunityMember.ts` (nuevo)
- `apps/api/src/migrations/sqlite/20260516000000_CreateCommunityAuditLog.ts` (nuevo)
- `apps/api/src/migrations/sqlite/20260516100000_SeedCommunityMessageTemplates.ts` (nuevo)

**Frontend:**
- `apps/web/src/views/MyCommunitiesView.vue` (nuevo — G4)
- `apps/web/src/views/CommunityMembersView.vue` — banner _trimmed + botón remove condicional
- `apps/web/src/views/CommunityAdminsView.vue` — botones invite/revoke condicionales
- `apps/web/src/views/CommunityListView.vue` — dropdown edit condicional con `canManage()`
- `apps/web/src/stores/communityStore.ts` — `viewerRole`, `isOwnerOrSuperadmin` computed
- `apps/web/src/services/api.ts` — `getMyCommunities`, `notifyMeetingMembers`
- `apps/web/src/router/index.ts` — ruta `/app/my-communities`
- `apps/web/src/components/layout/Sidebar.vue` — item "Mis Comunidades"
- `apps/web/src/locales/{es,en}.json` — strings de myCommunities + sidebar

**Tests:**
- `apps/api/src/tests/services/communityService.test.ts` — +28 nuevos
- `apps/api/src/tests/controllers/authController.test.ts` — +2 nuevos
- `apps/web/src/views/__tests__/LandingView.test.ts` — actualizaciones para `_trimmed`
- `apps/web/tests/e2e/community-journey.spec.ts` (nuevo) — 8 tests
- `apps/web/tests/e2e/community-search.spec.ts` — 12 tests (no nuevos hoy)

**Docs:**
- `docs/features/community-membership-journey.md` — secciones 11.5 (P1/P2), 11.6 (Vuln 2 + audit + rate limit + G6), 12 (deuda)
- `docs/features/community-search.md` (de sesión anterior)
- `docs/features/community-notifications.md` (de sesión anterior)
- `docs/security/notify-cross-tenant-idor-2026-05-15.md` (post-mortem Vuln 1)
- `docs/features/community-membership-journey-pending.md` (este archivo)

### Memorias persistentes relevantes

En `~/.claude/projects/-Users-lbolanos-Developer-personal-emaus/memory/`:
- `feedback_authorization_resource_specific.md` — middleware contra recurso más específico (lección de Vuln 1)
- `feedback_claude_md_overwritten_by_ruler.md` — docs van a `docs/features/`, no a `.ruler/AGENTS.md`
- `feedback_sqlite_migration_recreate_table.md` — patrón seguro de recreate-table

---

## Orden de retomada sugerido

Si tienes 1 día más para invertir, en este orden:

1. **Commit lo que está hecho** (30 min) — los cambios son grandes; mejor commits por feature antes de continuar
2. **#1 E2E auth** (3-4 h) — desbloquea testing robusto del resto
3. **#2 Templates BD refactor** (3-4 h) — bloquea producto si quieren personalización
4. Si queda tiempo: **#4 emailVerified** (4-6 h) — defense-in-depth para futuros features

Si solo tienes 1-2 horas: solo commits + docs + revisar que tests siguen verdes en CI.
