---
name: arquitectura
description: "Arquitectura del sistema Emaus: monorepo, stack, capas, patrones (REST, WebSockets, RBAC) y decisiones clave"
---

# Emaus — Arquitectura del Sistema

Sistema de gestión logística de retiros Emaus. Monorepo pnpm + Turborepo con backend Express/TypeORM y frontend Vue 3, desplegado en Lightsail con PM2 + Nginx.

---

## Monorepo

```
emaus/
├── apps/
│   ├── api/          # Express + TypeORM + SQLite/Postgres
│   └── web/          # Vue 3 + Vite + Pinia
├── packages/
│   ├── config/       # ESLint compartido
│   ├── tsconfig/     # TSConfig bases
│   ├── types/        # Zod schemas + tipos compartidos
│   └── ui/           # Componentes Vue compartidos (reka-ui)
└── docs/features/    # Documentación por feature
```

**Gestor**: `pnpm` workspaces. **Orquestador**: `turbo`. **Comandos**: `pnpm dev`, `pnpm build`, `pnpm test`.

---

## Backend (`apps/api`)

### Stack
- **Framework**: Express 4 + `express-async-errors`
- **ORM**: TypeORM (SQLite en dev, Postgres en prod opcional)
- **Auth**: Passport (local + Google OAuth20) + sesión `connect-typeorm` cookie-based
- **Validación**: Zod (vía `@repo/types`)
- **Realtime**: `socket.io` v4 (ver sección WebSockets)
- **CSRF**: middleware propio (`csrfAlternative`)
- **Rate limiting**: `express-rate-limit` global en `/api`
- **Seguridad**: `helmet` con CSP dinámico por entorno

### Capas
```
routes/          → HTTP routing
  └─ controllers/   → validación de request, auth checks
       └─ services/    → lógica de negocio, TypeORM
            └─ entities/  → modelos ORM
```

Reglas:
- Los controllers nunca llaman directamente al repositorio — siempre vía service.
- Los services son funciones puras donde sea posible; las que mutan estado emiten eventos WS al finalizar (ver `realtime.ts`).
- Las migraciones viven en `apps/api/src/migrations/sqlite/` con timestamp prefix.

### RBAC
- Roles: `superadmin`, `admin`, `coordinator`, `viewer` (más roles por retiro).
- `authorizationService` (singleton, `middleware/authorization.ts`) centraliza todo permission/role check.
- Middlewares: `requirePermission`, `requireRole`, `requireRetreatAccess`, `requireRetreatRole`.
- Cache de permisos vía `performanceOptimizationService` (`node-cache`).

### Punto de entrada
`apps/api/src/index.ts` → `main()` async:
1. `AppDataSource.initialize()`
2. Middlewares globales (CORS, helmet, JSON)
3. Sesión + Passport
4. Middleware de performance + CSRF
5. Routes (`/api`)
6. Estáticos de `apps/web/dist`
7. Error handler
8. `http.createServer(app)` + `initRealtime(httpServer, sessionMiddleware)` + `listen()`

---

## Frontend (`apps/web`)

### Stack
- **Framework**: Vue 3 Composition API + `<script setup>` + TypeScript
- **Build**: Vite
- **Estado**: Pinia (stores en `src/stores/`)
- **HTTP**: Axios singleton (`services/api.ts`) con interceptor CSRF
- **WS**: `socket.io-client` singleton (`services/realtime.ts`)
- **Router**: `vue-router`
- **i18n**: `vue-i18n` (JSON, español por defecto)
- **UI**: `@repo/ui` (wrappers de `reka-ui`)
- **Iconos**: `lucide-vue-next`

### Reglas importantes
- **Siempre usar `services/api.ts`** — nunca `fetch` directo (CSRF y cookies).
- **Todo el texto de UI en español**.
- **reka-ui Checkbox**: `:model-value` + `@update:model-value` (NO `:checked`).
- **Reactividad**: no usar `Set`/`Map` dentro de `ref` — usar arrays/objetos planos.
- **Composition API + Pinia setup stores** como default.

---

## Base de Datos

- **Dev**: SQLite (`apps/api/database.sqlite`)
- **Prod**: Postgres opcional (`DB_TYPE=postgresql`)
- **Migraciones**: `pnpm --filter api migration:run` / `migration:revert` / `migration:generate`
- **Seeding**: `SEED_FORCE=true pnpm --filter api migration:run`
- **Entidades clave**: `Participant`, `Retreat`, `House`, `RoomBed`, `RetreatParticipant`, `TableMesa`, `Payment`, `User`, `UserProfile`, `Session`.
- **Soft delete**: los participantes nunca se borran — se marcan como `deleted`.

---

## Realtime (WebSockets)

> Ver doc completa: `docs/features/websockets-realtime.md`

### Topología
```
Browser ──wss──▶ Express+IO (port 3001) ──emit──▶ services
         ◀─reception:* ───────────────────────┘
```

### Piezas
| Archivo | Rol |
|---------|-----|
| `apps/api/src/realtime.ts` | Servidor `socket.io` + middleware de sesión + rooms + helpers `emitReception*` |
| `apps/web/src/services/realtime.ts` | Cliente singleton `socket.io-client` |
| `apps/web/src/stores/receptionStore.ts` | Store Pinia con `subscribeRealtime(retreatId, handlers)` |

### Principios de diseño
- **Una sola conexión WS por pestaña** (singleton).
- **Auth reutilizada**: el handshake pasa por `sessionMiddleware` + `passport.session()` — no hay tokens separados.
- **Rooms por retiro y dominio**: `retreat:{id}:reception`, luego `retreat:{id}:schedule`, `retreat:{id}:table`, etc.
- **Acceso validado antes de unir**: `authorizationService.hasRetreatAccess(userId, retreatId)`.
- **Read-only push**: el cliente **no** escribe vía WS; los mutadores siguen siendo endpoints REST con CSRF. El WS solo empuja actualizaciones.
- **Emit helpers no-op si no hay init**: los servicios pueden importar `emitReception*` sin romper tests que cargan el servicio sin el servidor HTTP.
- **Naming por prefijo de dominio**: `reception:checkin`, `reception:bag-made`, `schedule:update`, etc.

### Cómo agregar un nuevo dominio realtime
1. En `realtime.ts`: exportar `{dominio}Room(retreatId)` + `emit{Dominio}{Evento}(payload)`.
2. Agregar handler `{dominio}:subscribe` con `hasRetreatAccess` antes de `socket.join`.
3. Emitir desde el service tras persistir.
4. En el cliente, crear un store Pinia análogo a `receptionStore` que use `getSocket()`.

### Infra
- **Nginx**: ya propaga headers `Upgrade`/`Connection: upgrade` — no requiere cambios.
- **PM2**: modo fork (único proceso). Si se escala a cluster hay que agregar `@socket.io/redis-adapter`.
- **Costo**: $0 adicional en Lightsail (tarifa plana). WS idle < polling 30s en tráfico.

---

## Seguridad

- **HTTPS** forzado en producción, CORS restringido al `frontendUrl` configurado.
- **Cookies**: `httpOnly`, `secure` en prod, `sameSite: strict`, nombre `emaus.sid`.
- **CSRF**: token en sesión rotado, enviado al cliente vía `/api/csrf-token`, incluido en header por interceptor axios. **No aplica a WS** (read-only push).
- **Rate limiting**: global en `/api` + stricter en auth endpoints.
- **Validación**: Zod en todos los inputs; TypeORM parametrizado previene SQL injection.
- **CSP**: construido dinámicamente según entorno (dev vs prod) en `index.ts`.
- **Password**: bcrypt, lockout tras intentos fallidos, verificación por email.

---

## Despliegue

- **Host**: AWS Lightsail `micro_3_0` (1 GB RAM, 2 vCPU)
- **Reverse proxy**: Nginx con Let's Encrypt (certbot DNS-01)
- **Process manager**: PM2 (modo fork)
- **Estáticos**: `apps/web/dist` servido por Nginx
- **API**: `localhost:3001` proxied bajo `/api` y `/socket.io`
- **CI/CD**: GitHub Actions con SSH deploy a Lightsail (ver `.github/workflows/` y `deploy/lightsail/`)

Gotchas conocidos:
- **PM2 orphan processes**: al hacer deploy, matar procesos huérfanos antes de `pm2 restart`.
- **Ownership**: `chown` de `~/.pm2` y `package.json` por app antes de restart.

---

## Testing

- **Backend**: Jest (`pnpm --filter api test`). Tests puros "simple" (sin DB) son el patrón dominante por limitaciones de inicialización de TypeORM a nivel de módulo.
- **Frontend**: Vitest (parcialmente deshabilitado en `__tests__.bak` por issues de TS).
- **Field mapping**: 15 tests de importación Excel (patrón de referencia).
- **Realtime**: 7 tests con `socket.io` mockeado en `realtime.simple.test.ts`.

---

## Decisiones clave

| Decisión | Motivo |
|----------|--------|
| Monorepo pnpm + Turborepo | Tipos compartidos sin publicar paquetes |
| TypeORM + SQLite en dev | Setup cero, portable |
| Soft delete en participantes | Integridad histórica de retiros |
| Sesión cookie-based (no JWT) | Reutilizable en WS sin reinventar auth |
| `socket.io` vs `ws` nativo | Reconexión, rooms, fallback polling gratis |
| Rooms por retiro + dominio | Aislamiento por evento sin broadcast global |
| WS read-only push | No rediseñar CSRF ni autorización de escrituras |
| Emit helpers no-op si no init | Tests unitarios sin servidor HTTP |
| Todo UI en español | Requisito del usuario final |

---

## Documentación viva

- `docs/features/reception-caminantes.md` — recepción de caminantes
- `docs/features/websockets-realtime.md` — capa realtime
- `docs/features/bags-report.md` — reporte de morrales
- `docs/features/dashboard-personalizacion.md` — dashboard customizable
- `docs/features/duplicate-registration-guard.md` — prevención de duplicados
- `CLAUDE.md` (raíz) — instrucciones para agentes AI con contexto rápido
