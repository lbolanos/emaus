# Tasks: retreat-favorites

> SDD tasks — versión 1.0 (2026-10-19). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone.

## M0 — specs SDD

- [x] `specs/retreat-favorites/spec.md` (D1-D8 con defaults propuestos)
- [x] `specs/retreat-favorites/research.md`
- [x] `specs/retreat-favorites/plan.md`
- [x] `specs/retreat-favorites/tasks.md`
- [x] **Gate**: Leonardo revisa D1-D8 antes de codear M1 — aprobado («si», 2026-10-19). Decisión
      previa tomada en conversación: persistencia backend en el perfil (D1) y UI estrella + chips
      (D6/R5-R6).
- [x] Commit `docs(specs)` en master (con OK de Leonardo)
- [x] Worktree `.claude/worktrees/retreat-favorites`, branch `worktree-retreat-favorites`
      (skill `worktree-testing`: `.env`, DB con `-wal`/`-shm`, `packages/ui/dist`, puertos 3002/5174)

**Done**: 2026-10-19 — specs commiteadas en master como `e1248283`; worktree creado desde ese
commit (`git worktree add` + EnterWorktree por path).

## M1 — API: columna, validación y privacidad

- [x] Migración `20261019200000_AddFavoriteRetreatIdsToUserProfile.ts` (idempotente, `down`)
- [x] Entidad `userProfile.entity.ts` (`simple-array`, nullable)
- [x] `UpdateSocialProfileSchema` en `packages/types/src/user.ts` + export + wire
      `validateRequest` en `userSocial.routes.ts`
- [x] Controller + service: destructure, `UserProfileData`, sanitización dedupe/cap
- [x] Strip de `favoriteRetreatIds` en `getPublicProfile` y `searchUsers`
- [x] Tests: migración (idempotencia/down), schema (400 por uuid/>100), controller/service
      (pasa el campo; no sale en público)
- [x] Una sola corrida de jest a la vez; suite API afectada verde (31/31)

**Done**: 2026-10-19 — 3 suites nuevas/extendidas verdes; `tsc --noEmit` del API queda en 145
errores vs 146 de master (no es gate del repo; sin errores netos añadidos, se arregló uno
preexistente en la línea del strip).

### Desviaciones 2026-10-19

- El timestamp de la migración pasó de `20261019120000` (plan) a `20261019200000`: el mismo día
  ya existían `20261019120000`/`130000`/`140000` (assignment-documents) y el runner exige orden
  estricto. Spec y tasks corregidos en este mismo commit.
- El test del schema zod se implementó como test de rutas
  (`src/tests/routes/userSocialProfileRoutes.simple.test.ts`, patrón `communityUpdateRoutes`):
  ejercita el schema real **y** el wire de `validateRequest` en la ruta — cubre lo planeado y el
  medio de montaje, que un test de schema puro no pisa.

**Gate**: commit `feat(api): favorite retreat ids in user profile` (con OK de Leonardo).

## M2 — Fix del acordeón

- [x] `useUIStore`: state + `initSidebarAccordion` / `toggleSidebarSection` / `toggleRetreatGroup`
      + persistencia (mismas keys)
- [x] `Sidebar.vue`: delegar en el store; `onMounted` siembra desde `menuSections`
- [x] Tests: `ui.test.ts` (siembra, >1 abierta, idempotencia, ≤1 abierta) + regresión en
      `Sidebar.test.ts` con localStorage viejo
- [x] Verificar en la app que el modo rail (flyout) y la búsqueda siguen igual

**Done**: 2026-10-19 — 51/51 tests (ui 9, Sidebar 37, SidebarFocusState 5); `vue-tsc` 0 errores.
En vivo contra el dev del worktree: record viejo de 2 claves se sembró a 10 (faltantes
colapsadas); abrir una sección sin clave cerró la abierta (el bug reportado); rail `w-20` y
búsqueda con expansión forzada intactos.

**Gate**: commit `fix(web): sidebar accordion shared in uiStore with key seeding` (con OK).

## M3 — Favoritos en el sidebar

- [x] `favoriteRetreatsStore.ts` (load / toggle optimista / rollback + toast)
- [x] `services/api.ts`: tipo de `updateUserProfile` + `favoriteRetreatIds`
- [x] `Sidebar.vue`: estrella (expandido + rail) y chips (join con `retreatStore.retreats`,
      huérfanos ocultos, `selectRetreat` al clic)
- [x] i18n es **y** en (4 keys)
- [x] Tests: store nuevo; `Sidebar.test.ts` con mocks ampliados (`Star`, funciones del service);
      chips huérfanos; estrella conmuta/llama PUT

**Done**: 2026-10-19 — 49/49 tests (store 7, Sidebar 42); `vue-tsc` 0 errores. En vivo contra el
dev del worktree: los favoritos sembrados por API en la demo del M1 aparecen como chips (persistencia
de punta a punta), clic de chip cambia el retiro seleccionado y navega, estrella quita/repone con
PUT real.

**Gate**: commit `feat(web): favorite retreat star and quick-jump chips` (con OK).

## M4 — E2E y QA móvil

- [x] `apps/web/tests/e2e/sidebar-favorites.spec.ts`: regresión acordeón + flujo favoritos
- [x] QA con chrome-devtools MCP (viewport iPhone + touch) sobre el dev del worktree: drawer,
      acordeón entre instancias, chips táctiles ≥40px con scroll, estrella persiste tras recarga
- [x] Screenshots del QA; checklist firmado acá
- [ ] Leonardo abre la feature (URL del worktree) antes de darla por entregada

**Done**: 2026-10-19 — e2e 2/2 en chromium contra el dev del worktree (login dev con fallback
`E2E_LOCAL_*`, patrón `sequences-inbox`; restore del perfil verificado por el dato: el perfil
quedó con los 2 favoritos originales). QA móvil (390x844, touch): drawer abre; chips de 40px
exactos con `overflow-x` real (435px/240px, scroll verificado); tocar PERSONAS cerró
ASIGNACIONES y las dos instancias del DOM quedaron consistentes (`["true","true"]` /
`["false","false"]`) — fix D7 confirmado en móvil; estrella toggle optimista + PUT persistido
tras recarga; chip navegó de retiro y el drawer cerró solo; 0 errores/warnings de consola.
Estado del browser dev restaurado (favoritos y retiro seleccionado originales).

### Desviaciones 2026-10-19

- Screenshots a `apps/web/test-results/mobile-qa/` (ignorado por git), no a `/tmp/chrome`:
  chrome-devtools MCP solo escribe dentro del workspace (denegado en /tmp).
- El spec se declaró `test.describe.configure({ mode: 'serial' })`: con `fullyParallel` del repo
  los 2 tests caían en workers distintos y el `afterAll` de un worker podía restaurar el perfil
  mientras el otro aún lo testeaba (estado compartido = perfil del usuario).

**Gate**: commit `test(e2e): sidebar accordion regression and favorites` (con OK).

## M5 — Cierre

- [ ] Reconcile en `spec.md` (cada CA verificada ✓, negativos incluidos)
- [ ] `**Done**` por milestone + desviaciones
- [ ] Merge a master con `gh pr checks` verde y OK de Leonardo (push a master deploya prod)
- [ ] Cerrar worktree (skill `cerrar-worktree`)

## Checklist de verificación final

- [ ] `pnpm --filter web test` verde
- [ ] Suite API afectada verde (una corrida de jest a la vez)
- [ ] E2E M4 verde
- [ ] Criterios 1-7 + negativos del spec verificados contra la app del worktree
- [ ] `git status` limpio de archivos ajenos a la feature antes de cada commit
