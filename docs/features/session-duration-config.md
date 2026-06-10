# Duración de la sesión logueada (30 días, rolling, configurable por ENV)

**Fecha:** 2026-06-09
**Archivos:** `apps/api/src/config.ts`, `apps/api/src/index.ts`, `apps/api/.env.example`

## Qué cambió

La sesión de un usuario logueado pasó de **24 horas fijas desde el login** a
**30 días rolling** (se renueva con cada actividad; el usuario solo es deslogueado
tras 30 días de **inactividad** real, no 30 días desde el login).

El valor es **configurable por variable de entorno** sin recompilar.

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
  // Duración de la sesión logueada en días. Rolling: se cuenta desde la última
  // actividad, no desde el login. Configurable sin recompilar.
  maxAgeDays: parseInt(process.env.SESSION_MAX_AGE_DAYS || '30', 10),
},
```

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

## Configuración

Variable de entorno (`apps/api/.env`):

```
# Duración de la sesión logueada en días (rolling: cuenta desde la última actividad)
SESSION_MAX_AGE_DAYS=30
```

- **Default = 30** (tanto en código como en `.env.example`). Si no se define la
  variable en producción, igual usa 30.
- Para cambiar la duración en prod: ajustar `SESSION_MAX_AGE_DAYS` en el `.env` del
  servidor y reiniciar el API (`pm2 restart`). No requiere recompilar.

## Seguridad

Se conservan intactas todas las protecciones previas:

- `httpOnly: true` (no accesible desde JS → anti-XSS).
- `secure` en producción (solo HTTPS).
- `sameSite: 'strict'` (anti-CSRF).
- `req.session.regenerate()` en el login (anti session-fixation, en
  `authController.ts`).

Trade-off: una sesión más larga amplía la ventana si se pierde un dispositivo;
mitigado porque `rolling` expira por inactividad real y la cookie sigue siendo
`httpOnly`/`secure`.

## Verificación

1. Login local y revisar la cookie `emaus.sid` en DevTools → Application → Cookies:
   `Expires` debe estar **~30 días** en el futuro.
2. Hacer una acción cualquiera (navegar/recargar) y confirmar que el `Expires` se
   **recorre hacia adelante** (prueba de `rolling`).
3. Override: arrancar con `SESSION_MAX_AGE_DAYS=1` → la cookie vuelve a ~24 h.

Prueba real con `curl` (puerto local del API):

```bash
CSRF=$(curl -s -c cj.txt http://localhost:3084/api/csrf-token | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
curl -s -i -b cj.txt -c cj.txt -X POST http://localhost:3084/api/auth/login \
  -H "Content-Type: application/json" -H "x-csrf-token: $CSRF" \
  -d '{"email":"...","password":"..."}' | grep -i set-cookie
# → Set-Cookie: emaus.sid=...; Expires=<hoy + 30 días>; HttpOnly; SameSite=Strict
```
