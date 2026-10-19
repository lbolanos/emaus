# Tasks: retreat-favorites

> SDD tasks — versión 1.0 (2026-10-19). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone.

## M0 — specs SDD

- [ ] `specs/retreat-favorites/spec.md` (D1-D8 con defaults propuestos)
- [ ] `specs/retreat-favorites/research.md`
- [ ] `specs/retreat-favorites/plan.md`
- [ ] `specs/retreat-favorites/tasks.md`
- [ ] **Gate**: Leonardo revisa D1-D8 antes de codear M1 — pendiente. Decisión previa ya tomada en
      conversación: persistencia backend en el perfil (D1) y UI estrella + chips (D6/R5-R6).
- [ ] Commit `docs(specs)` en master (con OK de Leonardo)
- [ ] Worktree `.claude/worktrees/retreat-favorites`, branch `worktree-retreat-favorites`
      (skill `worktree-testing`: `.env`, DB con `-wal`/`-shm`, `packages/ui/dist`, puertos 3002/5174)

## M1 — API: columna, validación y privacidad

- [ ] Migración `20261019120000_AddFavoriteRetreatIdsToUserProfile.ts` (idempotente, `down`)
- [ ] Entidad `userProfile.entity.ts` (`simple-array`, nullable)
- [ ] `UpdateSocialProfileSchema` en `packages/types/src/user.ts` + export + wire
      `validateRequest` en `userSocial.routes.ts`
- [ ] Controller + service: destructure, `UserProfileData`, sanitización dedupe/cap
- [ ] Strip de `favoriteRetreatIds` en `getPublicProfile` y `searchUsers`
- [ ] Tests: migración (idempotencia/down), schema (400 por uuid/>100), controller/service
      (pasa el campo; no sale en público)
- [ ] Una sola corrida de jest a la vez; suite API afectada verde

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

- [ ] `favoriteRetreatsStore.ts` (load / toggle optimista / rollback + toast)
- [ ] `services/api.ts`: tipo de `updateUserProfile` + `favoriteRetreatIds`
- [ ] `Sidebar.vue`: estrella (expandido + rail) y chips (join con `retreatStore.retreats`,
      huérfanos ocultos, `selectRetreat` al clic)
- [ ] i18n es **y** en (4 keys)
- [ ] Tests: store nuevo; `Sidebar.test.ts` con mocks ampliados (`Star`, funciones del service);
      chips huérfanos; estrella conmuta/llama PUT

**Gate**: commit `feat(web): favorite retreat star and quick-jump chips` (con OK).

## M4 — E2E y QA móvil

- [ ] `apps/web/tests/e2e/sidebar-favorites.spec.ts`: regresión acordeón + flujo favoritos
- [ ] QA con chrome-devtools MCP (viewport iPhone + touch) sobre el dev del worktree: drawer,
      acordeón entre instancias, chips táctiles ≥40px con scroll, estrella persiste tras recarga
- [ ] Screenshots a `/tmp/chrome`; checklist firmado acá
- [ ] Leonardo abre la feature (URL del worktree) antes de darla por entregada

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
