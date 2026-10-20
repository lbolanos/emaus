# Tasks: menu-favorites

> SDD tasks — versión 2.0 (2026-10-19). Reescritura tras el giro (favoritos de **items del menú**,
> no de retiros). Al cerrar cada milestone se marcan los items y se añade una línea `**Done**:` con
> fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del milestone.

## M0 — specs SDD (reescritura)

- [x] Giro del pedido documentado; decisiones de Leonardo: sección **fija arriba**, pre-seed **top
      5 de telemetría**, **borrar y rehacer** (PR #14 cerrado, branch nuevo desde master).
- [x] Fix del acordeón cherry-pickeado (`fec75d89`) antes de la reescritura (era parte del pedido
      original y es independiente).
- [x] `specs/menu-favorites/{research,spec,plan,tasks}.md` reescritos (rename del directorio).

**Done**: 2026-10-19 — PR #14 cerrado con comentario; branch `worktree-menu-favorites` desde
`master` (`69951528`) + cherry-pick `12452fb0`; branch viejo `worktree-retreat-favorites` borrado.

## M1 — API: columna, validación, privacidad y seed

- [x] `packages/types/src/menu.ts`: `MENU_ROUTE_NAMES` (todos los route names de `menuSections`) +
      `DEFAULT_FAVORITE_MENU_ITEMS` + export; test de formato/sin-duplicados.
- [x] Migración `20261019210000_AddFavoriteMenuItemsToUserProfile.ts` (idempotente, `down`).
- [x] Entidad `userProfile.entity.ts` (`simple-array`, nullable).
- [x] `UpdateSocialProfileSchema` en `packages/types/src/user.ts` (favoriteMenuItems
      `array(string().min(1).max(64)).max(12)`) + export + wire `validateRequest` en
      `userSocial.routes.ts`.
- [x] Controller + service: destructure, `UserProfileData`, sanitización dedupe/cap 12.
- [x] Strip de `favoriteMenuItems` en `getPublicProfile` y `searchUsers`.
- [x] Seed D5 en `getUserProfile` cuando la columna es `null`: top 5 de telemetría ∩
      `MENU_ROUTE_NAMES`; fallback `DEFAULT_FAVORITE_MENU_ITEMS`; `[]` no re-semebra.
- [x] Tests: migración (idempotencia/down), rutas (400 por string vacío/>64/>12), controller
      (pasa el campo), seed del service (telemetría, fallback, no-reseed, privacidad).
- [x] Una sola corrida de jest a la vez; suites API afectadas verde.

**Done**: 2026-10-19 — 4 suites nuevas/ampliadas verde (7+1+6+25 tests). Desviaciones: (a) el
test del service importa el servicio dinámicamente tras `setupTestDatabase` (patrón
`rbac.integration.test.ts`): los repos módulo-level se conectan al `AppDataSource` parcheado;
(b) `packages/types/src/index.ts` re-exporta `./user` con listas nombradas — se añadió el value
export `UpdateSocialProfileSchema` (sin él el middleware recibía `undefined` y el PUT daba 500);
(c) `tsc --noEmit` del api arrastra ~145 errores preexistentes (avatarUrl/ParsedQs/authController,
verificados iguales en master): no es gate, ts-jest y `pnpm build` (vite) no los ven.

**Gate**: commit `feat(api)`.

## M2 — Fix del acordeón (absorbido)

- [x] Cherry-pick del fix original (`fec75d89`): estado en `useUIStore`, `initSidebarAccordion`
      siembra faltantes colapsadas, compartido desktop/drawer; tests `ui.test.ts` + regresión
      `Sidebar.test.ts`.
- [ ] Re-verificación en vivo (QA móvil del M4).

**Done**: 2026-10-19 (cherry-pick; tests verdes en su commit original).

## M3 — Favoritos en el sidebar

- [ ] `menuFavoritesStore.ts` (load / toggle optimista / rollback + toast).
- [ ] `services/api.ts`: `favoriteMenuItems` en el tipo de `updateUserProfile`.
- [ ] `SidebarMenuItem.vue`: estrella opcional (wrapper flex, botón fuera del `<a>`,
      `showFavoriteStar`/`isFavorite` + emit `toggle-favorite`, defaults seguros).
- [ ] `Sidebar.vue`: sección «Favoritos» arriba (fija, fuera del acordeón; filas con
      `SidebarMenuItem` índice -1, badge y `getRouteWithParams`; rail con íconos + tooltip; oculta
      sin favoritos visibles y en búsqueda); sin nada de retiros favoritos.
- [ ] i18n es **y** en (4 keys).
- [ ] Tests: store; `Sidebar.test.ts` — sección render del seed, toggle de estrella emite + PUT,
      favorito no visible oculto, rail; mocks ampliados.

**Gate**: commit `feat(web)`.

## M4 — E2E y QA móvil

- [ ] `apps/web/tests/e2e/sidebar-favorites.spec.ts` reescrito: regresión acordeón (intacta) +
      favoritos de menú (seed por PUT → sección → clic navega → estrella quita/repone → reload
      persiste; restore en afterAll; serial).
- [ ] QA con chrome-devtools MCP (viewport iPhone + touch) sobre el dev del worktree: drawer,
      acordeón entre instancias, Favoritos táctiles ≥40px, estrella persiste tras recarga.
- [ ] Screenshots del QA; checklist firmado acá.
- [ ] Leonardo abre la feature (URL del worktree) antes de darla por entregada.

**Gate**: commit `test(e2e)`.

## M5 — Cierre

- [ ] Reconcile en `spec.md` (cada CA verificada ✓, negativos incluidos).
- [ ] `**Done**` por milestone + desviaciones.
- [ ] PR nuevo (con switch de cuenta gh), `gh pr checks` verde.
- [ ] Merge a master con OK de Leonardo (push a master deploya prod).
- [ ] Cerrar worktree (skill `cerrar-worktree`).

## Checklist de verificación final

- [ ] `pnpm --filter web test` verde.
- [ ] Suite API afectada verde (una corrida de jest a la vez).
- [ ] E2E M4 verde (chromium contra el dev del worktree).
- [ ] Criterios 1-7 + negativos del spec verificados contra la app del worktree (Reconcile).
- [ ] `git status` limpio de archivos ajenos a la feature antes de cada commit.
