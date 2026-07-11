# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

> **Regla general sobre skills**: este archivo describe el proyecto y sus convenciones de alto nivel. Cualquier patrón profundo (bugs recurrentes, recetas de testing, migrations SQLite, timezones, Safari iOS, security) vive en `.ruler/skills/<name>/SKILL.md`. Si una sección de aquí empieza a crecer en código de ejemplo o checklist detallado, **debe migrarse a un skill** y reemplazarse por un puntero.

## Project Architecture

This is a retreat logistics management system built as a monorepo using pnpm workspaces and Turborepo. The system manages religious retreats with features for participant management, housing assignments, table assignments, and various administrative tasks.

### Monorepo Structure

- **apps/api**: Express.js backend with TypeORM and SQLite
- **apps/web**: Vue.js 3 frontend with Composition API, Vite, and Pinia
- **packages/config**: Shared ESLint configurations
- **packages/tsconfig**: Shared TypeScript configurations
- **packages/types**: Shared Zod schemas and TypeScript types
- **packages/ui**: Shared Vue components

### Core Development Commands

```bash
# Install dependencies
pnpm install

# Run all pending migrations
pnpm --filter api migration:run

# Development (runs both API and web)
pnpm dev

# Build all applications
pnpm build

# Lint / Format
pnpm lint
pnpm format

# Testing
pnpm test                    # All tests
pnpm --filter api test       # Backend (Jest)
pnpm --filter web test       # Frontend (Vitest)
```

### Development Environment

- API runs on `http://localhost:3084` (default en `index.ts`; configurable con `PORT`. El proxy de Vite del web apunta ahí)
- Web app runs on `http://localhost:5173`
- DB local: `apps/api/database.sqlite`

### Dependencias nuevas en `apps/api` → externalizar en el build

El `apps/api` se empaqueta como **bundle SSR** con Vite/Rollup. **Toda dependencia de Node
que agregues** (`pnpm --filter api add <dep>`) **debe añadirse a `rollupOptions.external`
en `apps/api/vite.config.ts`**, junto a `typeorm`/`express`/etc. Si no, `pnpm build` falla
con *"Rollup failed to resolve import «dep»"*. **Ni los tests, ni el lint, ni `tsc`/`vue-tsc`
detectan esto — solo `pnpm build`.** Regla: tras agregar una dep al api, externalizarla y
correr `pnpm build` antes de dar por terminado.

**El bundle de prod es ESM (`"type": "module"`): `__dirname` y `require` NO existen.** Código
del `apps/api` que los use **compila y pasa tests/tsc en dev** (vite-node/jest los shimean) pero
en el bundle de prod lanza `ReferenceError: __dirname is not defined in ES module scope` **al
cargar el módulo** → el API entra en crash-loop y el deploy falla en el healthcheck (incidente
2026-07-09, `preparationDocSeeder`). Para rutas de archivos, resolvé contra `process.cwd()` (que
en prod y dev es `apps/api`), NO contra `__dirname`. Evitá `import.meta` en código del bundle
(tiene su propio historial de romper en runtime). Ni tests, ni lint, ni `tsc` lo detectan — solo
arrancar el bundle. Regla: si tocás rutas/paths en `apps/api`, corré el `dist/index.js` una vez
(o al menos `grep __dirname dist/index.js`) antes de dar por terminado.

## Key Business Concepts

### Participants

- Two main types: 'walkers' (caminantes) and 'servers' (servidores)
- Participants are never deleted — marked as 'deleted' instead (soft delete pattern)
- Can be imported/exported via Excel/CSV with column selection
- Family/friend relationships are tracked with color coding
- Age-based room assignments (younger participants get bunk beds, older get regular beds on lower floors)
- Marked as 'waiting' when capacity exceeded

### Retreats

- Each retreat has a house with specific room/bed configurations
- Room assignments consider age, snoring habits, and bed types (normal, bunk, mattress)
- Table assignments with leaders (lider, colider1, colider2) and walkers
- Maximum limits for walkers and servers based on house capacity
- Table assignments prevent family/friend conflicts

### Houses

- Track rooms with beds (identified by room number + bed number)
- Bed types: normal, bunk, mattress
- Default usage: walker or server
- Google Maps integration and notes about facilities
- Each house has a fixed IANA `timezone` (default `America/Mexico_City`); each retreat may override it

### Database Schema

System uses TypeORM with SQLite. Key entities: Participant (`family_friend_color`, snoring info), Retreat (house, capacity limits, notes, timezone), House (rooms + beds), RoomBed (retreat-specific bed assignments), Table (leader assignments), and various assignment/tracking entities.

## Authentication and Authorization

### Roles (RBAC)

- **Superadmin**: Complete system access, including database management and user administration
- **Admin**: Full access to retreat management, user management within scope
- **Coordinator**: Retreat-specific access, can manage participants and assignments for assigned retreats
- **Viewer**: Read-only access to retreat information and participant lists

Implementation: route-level protection via decorators, resource-based authorization checks, hierarchical role inheritance, dynamic permission checking in middleware, audit logging for sensitive operations.

### Authentication

JWT-based with refresh tokens, session management, bcrypt password hashing, account lockout on failed attempts, email verification for signup.

### Security stack (high level)

CSRF tokens + SameSite cookies + Origin validation, Zod input validation, TypeORM parameterized queries, XSS-safe output encoding, rate limiting on auth endpoints, HTTPS in prod, CORS allowlist, request logging.

> Para hardening detallado, OWASP Top 10, configuración de CORS/CSRF y rate limiting → cargar el skill **`security-best-practices`**.
> Para API keys/secretos (dónde vive cada uno, cambiar una var de entorno en prod, responder a una key filtrada, barrido con gitleaks) → cargar el skill **`secrets-management`**. Regla dura: **nunca hardcodear keys, ni en scripts de prueba** — el repo es público.

## API Integration

**Always use the centralized API service** — never direct fetch calls.

```typescript
// CORRECT
import { getSmtpConfig } from '@/services/api';
const config = await getSmtpConfig();

// INCORRECT
const response = await fetch('/api/endpoint', {
  headers: await setupCsrfHeaders(),
  credentials: 'include',
});
```

Built-in CSRF, error handling, authentication, and consistent configuration. Add new functions to `apps/web/src/services/api.ts`.

## UI / UX conventions

- Todo el texto de UI en **español**.
- Usar `WalkerView.vue` como template para nuevas list views.
- Componentes compartidos viven en `packages/ui` (basados en reka-ui / Radix port).
- Cuando un `<DropdownMenuItem>` abre un `Dialog`/`AlertDialog`/`Sheet`/`Drawer` de `@repo/ui`, usar **`useRekaDialogFix`** (`apps/web/src/composables/useRekaDialogFix.ts`) y `@select="deferOpen(...)"` para evitar dejar `pointer-events: none` huérfano en `<body>`. Detalle en skill `troubleshooting`.
- Patrones de Vue 3 Composition API (`<script setup>` + TypeScript). Si tocas Vue, cargar el skill **`vue-best-practices`**.

## Database Migrations

Sistema TypeORM contra SQLite. Comandos: `migration:generate`, `migration:run`, `migration:revert`, `SEED_FORCE=true … migration:run`.

**Reglas clave**:

- Toda mutación de schema debe ir vía migration.
- Migrations deben ser reversibles y documentar breaking changes.
- **Trata de crear un solo archivo de migration por feature.**
- **Avísale al usuario cuando necesites restaurar el backup de la base.**
- **Migraciones que corren en prod NO deben importar `@repo/types`** (ni encadenar a un paquete del workspace con `main` `.ts`): quedan "pending" para siempre con `Unknown file extension .ts`. Usar valores literales / SQL plano (solo `typeorm` + `uuid`).

> Cualquier migration con `DROP TABLE`, recreate-table, FK changes o cualquier cambio sobre tabla con FKs entrantes → cargar el skill **`sqlite-migrations`**.
> Para operar la DB de prod (descargar con `make db-pull`, backups, DB corrupta, `database is locked`, watchdog) o cuando una migración **no corre en prod** pese a un deploy verde → cargar el skill **`db-production-resilience`**.

## Skills disponibles — cuándo cargarlas

| Trigger / situación | Skill |
| --- | --- |
| Bug reportado por el usuario (UI congelada, página blanca, fechas saltan, checkbox no marca, test falla, etc.) | `troubleshooting` (índice maestro síntoma → causa → fix) |
| Tocar fechas, horas, defaults de pickers, filtros por rango, `datetime-local`, helpers `makeDateInTimezone`/`calendarDateOnly` | `timezone-handling` |
| Crear o modificar archivo en `apps/api/src/migrations/sqlite/` | `sqlite-migrations` |
| Operar la DB de prod: `make db-pull`, backups, DB corrupta, `database is locked`/lock colgado, watchdog, o una migración que no corre en prod ("No pending migrations" / "Unknown file extension .ts") | `db-production-resilience` |
| Agregar/modificar variables `{scope.var}` en plantillas, debugear variable que queda literal, o crear nuevo scope de reemplazo | `template-variables` |
| Tocar lectura/escritura de `CommunityMember` (display, búsqueda, mensajes, attendance, edición de perfil), nombre/email que no coincide entre comunidad y retiro, o nuevo endpoint que mute `community_member.*` | `community-overlay` |
| Tocar `community_member.state` (agregar estados, filtros de roster/asistencia/notificaciones, lógica de `notifyMemberStateChange`) | `community-state-semantics` |
| Reporte de blank page en iPhone/iPad o `Maximum call stack size exceeded` | `safari-ios-compatibility` |
| Trabajar con archivos `.vue`, Pinia, Vue Router, Vite | `vue-best-practices`, `vue-pinia-best-practices` |
| Hardening de API, CORS, CSRF, rate limit, OWASP | `security-best-practices` |
| API keys/secretos: key filtrada o expuesta, rotar una key, cambiar una variable de entorno en prod (`.env.production`), escanear secretos (gitleaks) | `secrets-management` |
| Tests con Playwright o Chrome DevTools en local | `webapp-testing` |
| Crear/regenerar un video-demo NARRADO de una feature (Playwright headed + subtítulos + TTS Deepgram/`say` + mux ffmpeg) | `demo-videos` |
| Subir videos al canal de YouTube "Emaús Retiros", generar arte del canal/miniaturas con IA (nano banana/Gemini), OAuth de YouTube, o el botón de ayuda `HelpVideoButton` in-app | `youtube-publishing` |
| Levantar `pnpm dev` en un git worktree (`.claude/worktrees/<branch>/`) sin chocar con los puertos del main | `worktree-testing` |
| Features puntuales del dominio | `closing-mass-church`, `santisimo`, `whatsapp-admin`, `arquitectura` |

## Testing — solo el qué y el cómo correr

- **Backend (Jest)**: ~2100 tests. Config: `apps/api/jest.config.json`. Setup global: `apps/api/src/tests/jest.setup.ts`. Helpers de integration: `apps/api/src/tests/test-setup.ts` (`setupTestDatabase`/`teardownTestDatabase`/`testDataSource`).
- **Frontend (Vitest)**: ~1500 tests con `happy-dom`. Config: `apps/web/vitest.config.ts`. Mocks globales (`@repo/ui`, `lucide-vue-next`, `vue-router`, `vue-i18n`, `axios`): `apps/web/src/test/setup.ts`.
- **E2E**: Playwright configurado, tests escasos.

```bash
pnpm --filter api test                                 # backend
pnpm --filter web test                                 # frontend
pnpm --filter web test src/components/__tests__/X.ts   # un archivo
```

> Para recetas de tests problemáticos (mocks Jest con ESM, tests 403 con path aliases, componentes con `defineModel` que rompen mocks globales) → skill **`troubleshooting`** (secciones #8, #9, #10).

### Git hooks (husky) — rápidos por diseño

- **pre-commit** (`.husky/pre-commit`): solo `lint-staged` → `eslint --fix` sobre los **archivos staged**, con **globs por paquete** en `.lintstagedrc.cjs` (solo `apps/api`, `apps/web`, `packages/{ui,types,utils}` — los 5 con `.eslintrc`). Linteear archivos de la raíz/`scripts/`/`*.config.js` rompería el hook con *"ESLint couldn't find a configuration file"* (no hay eslintrc en la raíz). **NO usa `prettier --write`**: el repo nunca se formateó con Prettier (~1000 archivos no conformes) → reescribiría el archivo entero en cada commit y enterraría el cambio real. Saltar: `SKIP_PRE_COMMIT=1 git commit` o `git commit --no-verify`.
- **pre-push** (`.husky/pre-push`): tests solo de lo que se va a pushear — **API**: `jest --findRelatedTests`; **web**: suite completa (`pnpm --filter web test`, ~10s; no `vitest related`, su grafo de imports rompe con los `.md`). Saltar: `SKIP_PRE_PUSH=1 git push` o `git push --no-verify`.
- **CI** (`.github/workflows/ci.yml`): lint + test-api + test-web + build en cada PR/push; `deploy-production.yml` redeploya en push a `master`. El hook local es feedback rápido; el CI es el backstop (`--findRelatedTests` solo halla tests que importan estáticamente el archivo). Los 5 workflows de **Gemini** se eliminaron (nunca configurados → fallaban en cada PR).
- `tsconfigRootDir: __dirname` en cada `.eslintrc.cjs` hoja → lint type-aware desde la raíz. No lo quites.
- Detalle completo y rationale: `docs/features/git-hooks-and-ci.md`.

## Infraestructura y acceso remoto

### SSH al servidor de producción

`emaus.cc` está detrás de Cloudflare (proxy), por lo que el puerto 22 **no es accesible** vía el dominio. Siempre usar la IP directa de Lightsail:

```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104
```

- Llave: `~/.ssh/lightsail-emaus.pem`
- Usuario: `ubuntu` · IP: `18.116.102.104`
- DB en prod: `/var/www/emaus/apps/api/database.sqlite`
- Backups locales: `/var/backups/emaus/` · Logs: `/var/log/emaus-backup.log`
- Deploy path web: `/var/www/emaus/apps/web/dist`

### AWS CLI

Perfil `emaus` → cuenta `585853725478`:

```bash
aws sts get-caller-identity --profile emaus
aws s3 ls s3://emaus-media/backups/database/ --human-readable --profile emaus | tail -10
```

Bucket `emaus-media` — prefijos: `backups/database/` (retención 90 días), `avatars/`, `retreat-memories/`, `public-assets/`, `documents/`.

### Backups de base de datos

Script: `/var/www/emaus/backup-db.sh` — cron diario a las **3:00 AM** del servidor.

```bash
# Backup manual
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 "bash /var/www/emaus/backup-db.sh"
```

La DB de prod corre en **WAL**; un watchdog (`scripts/db-watchdog.sh`, cron cada minuto) detecta
locks de escritura colgados y reinicia el API. Para descargar la DB usa **`make db-pull`** (snapshot
`.backup` consistente), **nunca** `scp`/`cp` del `.sqlite` vivo (corrompe la copia).

> Operar la DB de prod (db-pull, backups, DB corrupta, `database is locked`, lock colgado, watchdog) → skill **`db-production-resilience`**.

## Convenciones operativas

- **Chrome / Playwright screenshots**: guardarlos en `/tmp/chrome`.
- **Credenciales de testing local**: `leonardo.bolanos@gmail.com` / `123456`.
- **Configuración multi-asistente**: el repo usa `@intellectronica/ruler` — `CLAUDE.md` (raíz) se **regenera desde `.ruler/AGENTS.md`**. No edites `CLAUDE.md` directamente, los cambios se pierden. Para docs de features puntuales, crea archivos en `docs/features/<name>.md`.
