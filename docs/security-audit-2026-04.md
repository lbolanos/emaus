# Auditoría de Seguridad — Abril 2026

Registro de la auditoría de código y seguridad realizada sobre la rama `master` con las tres features nuevas (recepción/check-in, `bagMade`, personalización de dashboard) integradas.

| Fecha | Alcance | Estado |
|-------|---------|--------|
| 2026-04-22 | API Express + Vue 3 en producción Lightsail | Remediaciones aplicadas y verificadas con tests |

## Resumen ejecutivo

Arquitectura de seguridad sólida (bcrypt, sessions `httpOnly`+`sameSite:strict`+`secure` en prod, CSRF con comparación constant-time, reCAPTCHA, rate-limiting estratificado, Helmet CSP sin `unsafe-eval`, RBAC con scope por retiro). Los hallazgos fueron localizados — sin fallos arquitectónicos.

**Total:** 1 crítico, 3 altos, 3 medios, 3 bajos. Se remediaron 6 de 10 en este ciclo (1C + 2A + 2M + 1B). Los 3 bajos y 1 medio quedan como backlog.

## Hallazgos y remediaciones

### C-1 — Credenciales semilla por defecto en código
- **Severidad:** Crítica
- **Ubicación:** `apps/api/src/config.ts:48-50`
- **Problema:** si `SEED_AUTO_RUN=true` y `SEED_FORCE=true` se activaban en producción sin `SEED_MASTER_USER_EMAIL`/`SEED_MASTER_USER_PASSWORD`, se creaba un superadmin `admin@example.com` / `password`.
- **Remediación:** fail-fast en el arranque si ambas condiciones se cumplen sin credenciales explícitas. Mismo patrón que el guard existente para `SESSION_SECRET`.
- **Test:** `C-1: Seed credentials fail-fast in production` (7 casos).

### A-1 — Mass assignment en `PUT /participants/:id`
- **Severidad:** Alta
- **Ubicación:** `packages/types/src/index.ts` — `updateParticipantSchema`
- **Problema:** el schema usaba `participantSchema.partial()` sin omitir campos de relación. Un usuario con permiso `participant:update` podía cambiar `retreatId` (mover participante a otro retiro) o `id_on_retreat` (suplantar ID secuencial).
- **Remediación:** `participantSchema.omit({ retreatId: true, id_on_retreat: true }).partial()`. Zod con comportamiento por defecto `strip` remueve cualquier clave no reconocida.
- **Test:** `A-1: updateParticipantSchema omits retreatId / id_on_retreat` (5 casos).

### A-2 — Mass assignment en `POST /retreats`
- **Severidad:** Alta
- **Ubicación:** `packages/types/src/index.ts` — `createRetreatSchema`
- **Problema:** el schema aceptaba `createdBy` del body. El controller sobrescribía con `userId` vía spread (`{ ...req.body, createdBy: userId }`), pero quedar sujeto al orden de evaluación no es defensa en profundidad.
- **Remediación:** `retreatSchema.omit({ id: true, createdBy: true })`. El server sigue asignando `createdBy` desde la sesión.
- **Test:** `A-2 / M-2: Retreat schemas omit createdBy` (1 caso).

### A-3 — XSS almacenado en `PublicRetreatFlyerModal`
- **Severidad:** Alta
- **Ubicación:** `apps/web/src/components/PublicRetreatFlyerModal.vue:79`
- **Problema:** `v-html="retreat.paymentInfo.replace(/\n/g, '<br>')"` renderizaba HTML del backoffice sin sanitizar en la vista pública del flyer. Un admin/coordinador comprometido podía inyectar `<script>` visible por cualquier visitante anónimo.
- **Remediación:** nuevo computed `sanitizedPaymentInfo` que aplica `DOMPurify.sanitize(...)`, siguiendo el patrón de `RetreatFlyerView.vue:649-657`.
- **Test:** `A-3: paymentInfo sanitization (pre-DOMPurify transform)` (4 casos — DOMPurify en sí está probado upstream).

### M-1 — Autorización por retiro faltante en endpoints nuevos
- **Severidad:** Media
- **Ubicaciones:**
  - `apps/api/src/routes/participantRoutes.ts:42-44` — `GET /reception/:retreatId`, `PUT /:id/checkin`
  - `apps/api/src/routes/retreatParticipant.routes.ts:109-113` — `PATCH .../bag-made`
- **Problema:** `requirePermission('participant:list'|'participant:update')` verificaba el permiso global, pero no que el usuario fuera miembro del retiro. Un coordinador de retiro A podía leer/modificar check-ins del retiro B.
- **Remediación:**
  - `GET /reception/:retreatId` → `requireRetreatAccess('retreatId')`
  - `PATCH .../bag-made` → `requireRetreatAccess('retreatId')`
  - `PUT /:id/checkin` → `requireRetreatAccess('retreatId', 'body')` (el `retreatId` viaja en el body, no en el path)
  - Se extendió `requireRetreatAccess(retreatIdParam, source)` con un segundo parámetro `'params' | 'body'` (default `'params'` preserva compatibilidad).
- **Test:** `M-1: requireRetreatAccess reads retreatId from configurable source` (6 casos).

### M-2 — `updateRetreat` sin omitir `createdBy`
- **Severidad:** Media
- **Ubicación:** `packages/types/src/index.ts` — `updateRetreatSchema`
- **Problema:** `retreatSchema.omit({ id: true }).partial()` permitía reasignar `createdBy` desde el cliente (p. ej., un admin compromete un retiro y se asigna propiedad).
- **Remediación:** `retreatSchema.omit({ id: true, createdBy: true }).partial()`.
- **Test:** `A-2 / M-2: Retreat schemas omit createdBy` (2 casos adicionales).

### B-1 — Stack traces en logs de producción
- **Severidad:** Baja
- **Ubicación:** `apps/api/src/middleware/errorHandler.ts:31-32`
- **Problema:** `console.error('Error stack:', err.stack)` siempre activo. En caso de exposición accidental de logs (agregador mal configurado, acceso de lectura amplio), el stack trace filtraba rutas y versiones internas.
- **Remediación:** guard `if (process.env.NODE_ENV !== 'production')`. El `err.message` sigue logueándose para observabilidad operativa.
- **Test:** `B-1: Stack traces are not logged in production` (4 casos).

## Remediaciones en backlog

| ID | Descripción | Razón de diferirlo |
|----|-------------|--------------------|
| M-3 | Código comentado en `retreatController.ts:190-197` que deshabilita asignación automática de rol admin al creador | Requiere decisión de producto: ¿fallback operacional o reactivar con try/catch? |
| B-2 | Rate-limiter in-memory (no persistente, no cluster-safe) | Lightsail corre en fork mode con 1 worker; tomar acción si se escala horizontalmente |
| B-3 | Polling 30s sin batching en `RecepcionView` | No es riesgo de seguridad; aceptable para interfaz admin con pocos usuarios simultáneos |

## Archivos modificados

```
apps/api/src/config.ts
apps/api/src/middleware/authorization.ts
apps/api/src/middleware/errorHandler.ts
apps/api/src/routes/participantRoutes.ts
apps/api/src/routes/retreatParticipant.routes.ts
apps/web/src/components/PublicRetreatFlyerModal.vue
packages/types/src/index.ts
apps/api/src/tests/security/securityAuditApril2026.test.ts   (nuevo)
docs/security-audit-2026-04.md                               (este archivo)
```

## Verificación

### Tests unitarios
```bash
pnpm --filter api test --testPathPattern=securityAuditApril2026
# Expected: 29/29 passed
```

### Test suite completo
```bash
pnpm --filter api test
# Expected: 75 suites passed (2 skipped por límite de DB de integración), 1534+ tests passing
```

### Pruebas manuales recomendadas

1. **C-1 — seed guard**
   ```bash
   NODE_ENV=production SEED_AUTO_RUN=true pnpm --filter api start
   # Expected: proceso aborta con mensaje "SEED_MASTER_USER_EMAIL and SEED_MASTER_USER_PASSWORD are required..."
   ```

2. **A-3 — XSS sanitization**
   - Como admin, editar un retiro y poner `paymentInfo = "<img src=x onerror=alert(1)>\nBanco BBVA 1234"`.
   - Abrir el modal público del flyer (`PublicRetreatFlyerModal`).
   - Expected: "Banco BBVA 1234" aparece, el tag `<img onerror>` es removido por DOMPurify, no salta alert.

3. **M-1 — retreat-scoped access**
   - Dar al usuario U coordinador del retiro A únicamente (no B).
   - Intentar como U:
     ```http
     GET /api/participants/reception/<retreatB>
     PUT /api/participants/<id>/checkin
     { "retreatId": "<retreatB>", "checkedIn": true }
     ```
   - Expected: ambos responden 403.

4. **A-1 / A-2 / M-2 — mass assignment**
   - Como admin, llamar a `PUT /api/participants/<id>` con body:
     ```json
     { "firstName": "Nombre", "retreatId": "<otro-retiro>", "id_on_retreat": 999 }
     ```
   - Verificar en DB que `retreatId` e `id_on_retreat` no cambiaron.
   - Como admin, llamar a `PUT /api/retreats/<id>` con `{ "createdBy": "<otro-usuario>" }`.
   - Verificar que `createdBy` no cambió.

5. **B-1 — stack traces en prod**
   - Desplegar a prod y forzar un 500 (endpoint malformado).
   - Inspeccionar logs: no debe aparecer `Error stack:` ni el árbol de `at functionName (...)`.

### Lint y type-check
```bash
# API
cd apps/api && npx eslint src/config.ts src/middleware/authorization.ts \
  src/middleware/errorHandler.ts src/routes/participantRoutes.ts \
  src/routes/retreatParticipant.routes.ts

# Web
cd apps/web && npx eslint src/components/PublicRetreatFlyerModal.vue
cd apps/web && NODE_OPTIONS='--max-old-space-size=4096' npx vue-tsc --noEmit --skipLibCheck

# Types
cd packages/types && npx eslint src/index.ts
```

Todos los anteriores pasaron limpios en los archivos modificados (errores pre-existentes de tsc en otros services no están relacionados con esta auditoría y se verificaron con `git stash`).

## Próxima auditoría recomendada

- **Trigger:** antes del próximo release mayor o si se introducen nuevos endpoints públicos.
- **Cobertura sugerida:** integración de WebSocket (si se migra el polling de recepción), nuevos proveedores OAuth, cualquier integración con servicios de pago.
