# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

> **Regla general sobre skills**: este archivo describe el proyecto y sus convenciones de alto nivel. Cualquier patrón profundo (bugs recurrentes, recetas de testing, migrations SQLite, timezones, Safari iOS, security) vive en `.ruler/skills/<name>/SKILL.md`. Si una sección de aquí empieza a crecer en código de ejemplo o checklist detallado, **debe migrarse a un skill** y reemplazarse por un puntero.

## Project Architecture

Sistema de gestión logística de retiros religiosos: participantes, asignación de casas y camas,
asignación de mesas y tareas administrativas. Monorepo de pnpm workspaces + Turborepo.

La estructura (`apps/*`, `packages/*`), el stack de cada paquete y los scripts
(`pnpm dev`/`build`/`lint`/`test`) se leen de `pnpm-workspace.yaml` y de los `package.json`.
Lo que **no** es derivable está abajo.

### Development Environment

- API runs on `http://localhost:3084` (default en `index.ts`; configurable con `PORT`. El proxy de Vite del web apunta ahí)
- Web app runs on `http://localhost:5173`
- DB local: `apps/api/database.sqlite`

### Reglas duras del bundle de `apps/api`

> Detalle de la externalización de dependencias en `rollupOptions.external`: **`apps/api/CLAUDE.md`**
> (se carga solo al trabajar bajo `apps/api/`). La prohibición de abajo se queda aquí porque una
> sesión puede agregar una dependencia sin abrir ningún archivo de ese directorio.

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

TypeORM contra SQLite. Las entidades y sus columnas se leen de `apps/api/src/entities/`; los
detalles que importan y no son obvios (`family_friend_color`, info de ronquidos, `timezone` por
casa y por retiro) están arriba en Business Concepts.

## Authentication and Authorization

### Roles (RBAC)

- **Superadmin**: Complete system access, including database management and user administration
- **Admin**: Full access to retreat management, user management within scope
- **Coordinator**: Retreat-specific access, can manage participants and assignments for assigned retreats
- **Viewer**: Read-only access to retreat information and participant lists

Implementation: route-level protection via decorators, resource-based authorization checks, hierarchical role inheritance, dynamic permission checking in middleware, audit logging for sensitive operations.

### Authentication

JWT-based with refresh tokens, session management, bcrypt password hashing, account lockout on failed attempts, email verification for signup.

### Security stack

> Para hardening detallado, OWASP Top 10, configuración de CORS/CSRF y rate limiting → cargar el skill **`security-best-practices`**.
> Para API keys/secretos (dónde vive cada uno, cambiar una var de entorno en prod, responder a una key filtrada, barrido con gitleaks) → cargar el skill **`secrets-management`**. Regla dura: **nunca hardcodear keys, ni en scripts de prueba** — el repo es público.

## Frontend (API, UI, Vue)

Las convenciones del frontend — servicio centralizado de API en vez de `fetch` directo, texto de
UI en español, componentes de `packages/ui`, y el `useRekaDialogFix` obligatorio al abrir un
diálogo desde un `DropdownMenuItem` — viven en **`.claude/rules/frontend.md`**, con ámbito
`apps/web/**` y `packages/ui/**`.

> Ese directorio **no lo gestiona ruler**: se edita a mano y se versiona. Si añades convenciones
> atadas a un lenguaje o subdirectorio, van ahí y no en este archivo.

## Database Migrations

Sistema TypeORM contra SQLite. Comandos: `migration:generate`, `migration:run`, `SEED_FORCE=true … migration:run`.

**Reglas clave**:

- Toda mutación de schema debe ir vía migration.
- **No uses `migration:revert`**: no es confiable (revirtió migraciones más viejas que la última y dropeó schema en uso). Para deshacer en local: respaldar con `sqlite3 … ".backup"` antes de correr, y restaurar ese backup. Detalle en el skill `sqlite-migrations`.
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
| Entrar por SSH al servidor de prod, AWS CLI, bucket `emaus-media`, backup manual de la DB | `infra-remota` |
| Features puntuales del dominio | `closing-mass-church`, `santisimo`, `whatsapp-admin`, `arquitectura` |

## Testing — solo el qué y el cómo correr

- **Backend**: Jest. **Frontend**: Vitest con `happy-dom`. **E2E**: Playwright configurado, tests escasos.
- Lo que hay que saber y no se ve en la config: `apps/web/src/test/setup.ts` tiene **mocks globales** de `@repo/ui`, `lucide-vue-next`, `vue-router`, `vue-i18n` y `axios` — un ícono o un export nuevo que no esté en esa lista rompe el `mount()`.

```bash
pnpm --filter web test src/components/__tests__/X.ts   # un archivo
```

> Para recetas de tests problemáticos (mocks Jest con ESM, tests 403 con path aliases, componentes con `defineModel` que rompen mocks globales) → skill **`troubleshooting`** (secciones #8, #9, #10).

### Git hooks (husky) — rápidos por diseño

Tres reglas duras; el resto (qué corre cada hook, por qué, y los globs por paquete) está en
**`docs/features/git-hooks-and-ci.md`**:

- **No metas `prettier --write` en pre-commit.** El repo nunca se formateó con Prettier (~1000 archivos no conformes) → reescribiría el archivo entero en cada commit y enterraría el cambio real.
- **No amplíes los globs de `.lintstagedrc.cjs` a la raíz / `scripts/` / `*.config.js`.** No hay eslintrc en la raíz: el hook muere con *"ESLint couldn't find a configuration file"*.
- **No quites `tsconfigRootDir: __dirname`** de los `.eslintrc.cjs` hoja — es lo que hace que el lint type-aware funcione desde la raíz.

Saltar hooks: `SKIP_PRE_COMMIT=1 git commit` / `SKIP_PRE_PUSH=1 git push` (o `--no-verify`).

## Infraestructura y acceso remoto

SSH al servidor Lightsail (`emaus.cc` está tras Cloudflare: el puerto 22 **no** responde por el
dominio, hay que usar la IP directa), perfil de AWS CLI, bucket `emaus-media` y el backup diario
de la base → skill **`infra-remota`**.

> ⚠️ Para descargar la DB de prod usa **`make db-pull`**, nunca `scp`/`cp` del `.sqlite` vivo.
> Operarla (backups, DB corrupta, `database is locked`, watchdog) → skill
> **`db-production-resilience`**.

## Convenciones operativas

- **Chrome / Playwright screenshots**: guardarlos en `/tmp/chrome`.
- **Credenciales de testing local**: `leonardo.bolanos@gmail.com` / `123456`.
- **Configuración multi-asistente**: el repo usa `@intellectronica/ruler` — `CLAUDE.md` (raíz) se **regenera desde `.ruler/AGENTS.md`**. No edites `CLAUDE.md` directamente, los cambios se pierden. Para docs de features puntuales, crea archivos en `docs/features/<name>.md`.
## Modelos y effort

Este repo no fija modelo ni effort; se heredan de tu configuración de Claude Code.

- **Modelo**: Opus 5 para trabajo agéntico y arquitectura; Sonnet 5 para pases mecánicos y
  subagentes. `/model` para cambiar.
- **Effort**: `high` por defecto; `/effort xhigh` puntualmente en lo más duro. No lo fijes global.
- **Si el modelo se comporta raro** — se enrolla, amplía el alcance, verifica de más, delega de
  más, o dice que llamó a una herramienta y no pasó nada — carga la skill `claude-models`.
- **Antes de añadir instrucciones a este archivo**, lee `claude-models` §5. Varias prácticas que
  funcionaban en modelos anteriores hoy degradan a Opus 5.
