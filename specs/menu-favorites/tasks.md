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
- [x] Re-verificación en vivo (QA móvil del M4).

**Done**: 2026-10-19 (cherry-pick; tests verdes en su commit original).

## M3 — Favoritos en el sidebar

- [x] `menuFavoritesStore.ts` (load / toggle optimista / rollback + toast).
- [x] `services/api.ts`: `favoriteMenuItems` en el tipo de `updateUserProfile`.
- [x] `SidebarMenuItem.vue`: estrella opcional (wrapper flex, botón fuera del `<a>`,
      `showFavoriteStar`/`isFavorite` + emit `toggle-favorite`, defaults seguros).
- [x] `Sidebar.vue`: sección «Favoritos» arriba (fija, fuera del acordeón; filas con
      `SidebarMenuItem` índice -1, badge y `getRouteWithParams`; rail con íconos + tooltip; oculta
      sin favoritos visibles y en búsqueda); sin nada de retiros favoritos.
- [x] i18n es **y** en (3 keys — ver desviaciones).
- [x] Tests: store; `Sidebar.test.ts` — sección render del seed, toggle de estrella emite + PUT,
      favorito no visible oculto, búsqueda; mocks ampliados.

**Done**: 2026-10-19 — suite web completa 230 archivos / 3395 tests verde; `vue-tsc --noEmit`
exit 0. El test del store cazó un bug real: `slice(0, LIMIT)` descartaba el pin NUEVO al llenar
la lista (toggle no-op silencioso); corregido a `slice(-LIMIT)` (el nuevo entra, el más viejo
sale). Desviaciones: (a) 3 keys de i18n (`sidebar.favorites`/`addFavorite`/`removeFavorite`) en
vez de 4 — la spec listaba `favoriteToggleFailed`, pero los stores del repo no usan i18n: los
toasts de error van en inglés vía `apiErrorMessage` (convención verificada en `retreatStore`);
(b) el stub de `SidebarMenuItem` en `Sidebar.test.ts` declara las props booleanas con `type:
Boolean` — con props-array el runtime no castea el atributo sin valor `show-favorite-star` y todo
llegaba como `""` (el componente real usa `defineProps` tipado, en producción no ocurre);
(c) `runtimeConfig.test.ts` ("falls back to development default") falla en el worktree porque el
`.env.local` del dev (worktree-testing) define `VITE_API_URL`: verificado pasando al moverlo
fuera — fallo del entorno local, no del branch (en CI no existe el archivo).

**Gate**: commit `feat(web)`.

## M4 — E2E y QA móvil

- [x] `apps/web/tests/e2e/sidebar-favorites.spec.ts` reescrito: regresión acordeón (intacta) +
      favoritos de menú (seed por PUT → sección → clic navega → estrella quita/repone → reload
      persiste; restore en afterAll; serial).
- [x] QA con chrome-devtools MCP (viewport iPhone + touch) sobre el dev del worktree: drawer,
      acordeón entre instancias, Favoritos táctiles ≥40px, estrella persiste tras recarga.
- [x] Screenshots del QA; checklist firmado acá.
- [ ] Leonardo abre la feature (URL del worktree) antes de darla por entregada.

**Done**: 2026-10-19 — e2e 4/4 verde contra el dev del worktree (login local, seed por PUT,
restore verificado por el dato: el perfil quedó con el top-5 de telemetría que el beforeAll
capturó tras el primer GET). QA móvil (390×844 touch): drawer, Favoritos arriba con el seed,
copias sin estrella, toggle táctil quita/repone, persistencia tras reload, clic en copia navega
y cierra el drawer, acordeón persiste entre instancias (remonte del drawer vía uiStore).
Screenshots en `.playwright-mcp/qa-movil-*.png`. Desviaciones: (a) la estrella medía 28×28px
(< 40px mínimo táctil WCAG 2.5.8) — subida a `p-2.5` + `w-5` (40×40 exactos, verificado en
vivo; 55 tests de las suites afectadas re-corridas en verde); (b) el test de la estrella expande
`section-community` primero: el acordeón siembra colapsado y el header tapa la estrella (igual
que un usuario real, que abre la sección antes de tocar la estrella); (c) el restore del afterAll
devuelve el array capturado tras el primer GET — si el perfil venía `null`, ese GET dispara el
seed D5 y es ese seed el que se restaura (el `null` puro no es expresible por PUT); (d) dos
correcciones de aserción durante la corrida: índices del pin-order invertidos y label
«Escritorio» → «Dashboard del Retiro» (`sidebar.retreatDashboard`) — fallos del test, no de la
feature.

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
