# Duración de la sesión logueada (rolling + techo absoluto, configurable por ENV)

**Fecha:** 2026-06-09 · **Hardening de seguridad:** 2026-06-15
**Archivos:** `apps/api/src/config.ts`, `apps/api/src/index.ts`,
`apps/api/src/middleware/sessionExpiry.ts`, `apps/api/src/services/sessionService.ts`,
`apps/api/src/controllers/authController.ts`, `apps/api/src/types/session.ts`,
`apps/api/.env.example`

## Qué cambió

La sesión de un usuario logueado pasó de **24 horas fijas desde el login** a
**30 días rolling** (se renueva con cada actividad; el usuario solo es deslogueado
tras 30 días de **inactividad** real, no 30 días desde el login).

El valor es **configurable por variable de entorno** sin recompilar.

### Hardening 2026-06-15 (security review)

El rolling puro tenía un riesgo: una sesión usada con regularidad **nunca caduca**,
así que una cookie robada daba acceso indefinido, y cambiar la contraseña **no**
mataba las sesiones existentes. Se añadió:

1. **Techo absoluto de sesión** (default **90 días** desde el login, configurable):
   independientemente del rolling, una sesión muere a los N días del login.
2. **Revocación de sesiones al cambiar/resetear contraseña**: se borran las demás
   sesiones del usuario en la tabla `sessions`.
3. **Validación/clamp de los ENV de días**: un valor inválido (`NaN`, `0`, `"30d"`)
   ya no degrada silenciosamente la expiración; cae al default y se acota a un máximo.

## Contexto técnico

Emaús usa **session-based auth con `express-session` + `TypeormStore`** (NO JWT, NO
refresh tokens). Las sesiones se almacenan en la tabla `sessions` (`Session` entity).
La duración la controlan dos valores que deben ir sincronizados:

- `store.ttl` (segundos) — expiración del registro en la tabla `sessions`.
- `cookie.maxAge` (milisegundos) — expiración de la cookie `emaus.sid` en el browser.

## Implementación

### 1. `apps/api/src/config.ts`

```ts
session: {
  secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
  cookieDomain: process.env.COOKIE_DOMAIN,
  // Ventana de inactividad (rolling). Se renueva en cada request.
  maxAgeDays: parseDaysEnv(process.env.SESSION_MAX_AGE_DAYS, 30, 365),
  // Techo absoluto desde el LOGIN, sin importar la actividad.
  absoluteMaxAgeDays: parseDaysEnv(process.env.SESSION_ABSOLUTE_MAX_AGE_DAYS, 90, 365),
},
```

`parseDaysEnv(raw, fallback, max)` (en el mismo `config.ts`) parsea un ENV de
días con clamp: `NaN`/`""`/`"30d"`/`0`/negativo → `fallback`; un valor válido se
acota a `max`. Evita que un typo en el ENV degrade la expiración de la sesión.

### 2. `apps/api/src/index.ts` (bloque `sessionMiddleware`)

```ts
const sessionMaxAgeMs = config.session.maxAgeDays * 24 * 60 * 60 * 1000;
const sessionMiddleware = session({
  store: new TypeormStore({
    cleanupLimit: 2,
    limitSubquery: false,
    ttl: config.session.maxAgeDays * 24 * 60 * 60, // segundos
  }).connect(sessionRepository),
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Renueva la cookie en cada respuesta → expira por inactividad
  cookie: {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'strict',
    maxAge: sessionMaxAgeMs,
    domain: config.env === 'production' ? config.session.cookieDomain : undefined,
    path: '/',
  },
  name: 'emaus.sid',
  proxy: config.env === 'production',
});
```

Con `rolling: true`, `express-session` reescribe la cookie en cada respuesta y
`TypeormStore` actualiza `expiredAt` vía su `touch`, así que tanto la cookie como la
fila en `sessions` se extienden con cada request. No requiere cambios en
`session.entity.ts`.

### 3. Techo absoluto — `middleware/sessionExpiry.ts`

`enforceAbsoluteSessionExpiry` se monta **después de `passport.session()`** en
`index.ts`. Sella el login con `req.session.loginAt` (epoch ms; el login lo fija
en `authController.ts` tras el `regenerate()`) y, en cada request autenticado:

- Si `loginAt` está ausente (sesiones creadas **antes** de este deploy) → la sella
  con `Date.now()` y continúa (no se expulsa a nadie al desplegar).
- Si `Date.now() - loginAt > absoluteMaxAgeDays` → `req.logout()` +
  `req.session.destroy()` + `clearCookie('emaus.sid')` + responde **401**.

`loginAt` se declara en `SessionData` (`apps/api/src/types/session.ts` e
`index.ts`).

### 4. Revocación al cambiar/resetear contraseña — `services/sessionService.ts`

`revokeUserSessions(userId, exceptSessionId?)` borra de la tabla `sessions` las
filas del usuario, buscando el fragmento que passport serializa en el JSON:
`"passport":{"user":"<id>"}` (ver `authService.serializeUser`).

- `changePassword` (autenticado) → `revokeUserSessions(userId, req.sessionID)`:
  mata las **demás** sesiones, conserva la actual (no desloguea a quien la cambia).
- `resetPassword` (vía token, no autenticado) → `revokeUserSessions(userId)`: mata
  **todas**.

## Configuración

Variables de entorno (`apps/api/.env`):

```
# Ventana de inactividad en días (rolling: cuenta desde la última actividad)
SESSION_MAX_AGE_DAYS=30
# Techo absoluto en días desde el login (sin importar la actividad)
SESSION_ABSOLUTE_MAX_AGE_DAYS=90
```

- **Defaults:** `SESSION_MAX_AGE_DAYS=30`, `SESSION_ABSOLUTE_MAX_AGE_DAYS=90`.
  Un valor inválido/0/negativo cae al default (vía `parseDaysEnv`), acotado a 365.
- Para cambiar en prod: ajustar el `.env` del servidor y reiniciar el API
  (`pm2 restart`). No requiere recompilar.

## Seguridad

Protecciones previas (intactas):

- `httpOnly: true` (no accesible desde JS → anti-XSS).
- `secure` en producción (solo HTTPS).
- `sameSite: 'strict'` (anti-CSRF).
- `req.session.regenerate()` en el login (anti session-fixation) y
  `req.session.destroy()` en el logout (`authController.ts`).

Hardening 2026-06-15 (cierra el HIGH del security review del feature CRM):

- **Techo absoluto**: una cookie robada deja de dar acceso indefinido aunque la
  víctima siga usando la app; caduca a los 90 días del login.
- **Revocación en cambio de contraseña**: la acción natural ante sospecha de robo
  (cambiar contraseña) ahora **sí** corta las sesiones del atacante de inmediato.
- **Clamp de ENV**: un typo (`SESSION_MAX_AGE_DAYS=30d`) ya no produce
  `maxAge: NaN` ni degrada silenciosamente la expiración.

Trade-off: el techo absoluto obliga a re-login periódico aun con uso continuo; 90
días equilibra comodidad y exposición. Ajustable por ENV.

## Verificación

1. Login local y revisar la cookie `emaus.sid` en DevTools → Application → Cookies:
   `Expires` debe estar **~30 días** en el futuro.
2. Hacer una acción cualquiera (navegar/recargar) y confirmar que el `Expires` se
   **recorre hacia adelante** (prueba de `rolling`).
3. Override: arrancar con `SESSION_MAX_AGE_DAYS=1` → la cookie vuelve a ~24 h.
4. Techo absoluto: arrancar con `SESSION_ABSOLUTE_MAX_AGE_DAYS=1`, loguearse, y al
   día siguiente cualquier request devuelve **401** aunque la cookie no haya
   expirado por inactividad.
5. Revocación: con dos sesiones abiertas del mismo usuario, cambiar la contraseña en
   una → la **otra** queda invalidada (el siguiente request da 401); la actual sigue.

Cobertura de tests: `src/tests/security/sessionExpiry.test.ts` (unit del middleware
y de `parseDaysEnv`) y `src/tests/services/revokeUserSessions.integration.test.ts`
(integración con la tabla `sessions`).

Prueba real con `curl` (puerto local del API):

```bash
CSRF=$(curl -s -c cj.txt http://localhost:3084/api/csrf-token | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
curl -s -i -b cj.txt -c cj.txt -X POST http://localhost:3084/api/auth/login \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d '{"email":"...","password":"..."}' | grep -i set-cookie
# → Set-Cookie: emaus.sid=...; Expires=<hoy + 30 días>; HttpOnly; SameSite=Strict
```
