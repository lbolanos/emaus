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

## M4b — Feedback de Leonardo tras abrir la feature (2026-10-19)

- [x] Espacio Buscar→Favoritos: header compactado a `px-2 py-1` (antes `px-4 pt-2 pb-1` + `mt-1`),
      alineado con los headers de `SidebarSection` (~22px de aire hasta el texto → 14px al botón).
- [x] Favoritos colapsable: header botón con chevron + `aria-expanded`/`aria-controls`, estado
      `uiStore.favoritesCollapsed` **fuera** del record del acordeón (la siembra lo cerraría y el
      full-accordion también), default expandida, persistido en `sidebar-favorites-collapsed`.
- [x] Tests: `ui.test.ts` (default/toggle/persistencia + independencia del acordeón),
      `Sidebar.test.ts` (colapsa/expande por el header, clases max-h-0),
      e2e nuevo (colapso + reload) — 5/5 verde.
- [x] QA vivo desktop + drawer móvil (390×844 touch): toggle 196→0→196px, aria y localStorage
      sincronizados; screenshot `.playwright-mcp/qa-favoritos-colapsable-movil.png`.
- [ ] Leonardo revisa el resultado y confirma (el punto 3 de su feedback se implementó como M4c).

**Done**: 2026-10-19 — unit (11+43+5 tests) y e2e (5/5) verdes; `vue-tsc --noEmit` exit 0.
Desviaciones: (a) la aserción e2e del colapso usa `not.toBeInViewport()` — el contenido colapsado
conserva su bounding box (clipping por `max-h-0` + `overflow-hidden`) y Playwright lo reporta
«visible»; (b) el header mide ~24px, igual que todos los headers de sección existentes — se
priorizó consistencia con `SidebarSection` sobre el criterio táctil de 40px, que sí aplica a las
estrellas; (c) el contenedor usa `max-h-[34rem]` (cap de 12 items ≈ 528px) en vez del `max-h-96`
de `SidebarSection`, que recortaría las últimas filas.

**Gate**: commit `feat(web)`.

## M4c — Popover de sugerencias por telemetría (feedback punto 3)

- [x] API: `getFavoriteSuggestions(userId, pinned)` en el service — top-12 telemetría ∩
      `MENU_ROUTE_NAMES` (vistas desc) ∪ `DEFAULT_FAVORITE_MENU_ITEMS`, menos pineadas, cap 5 —
      expuesto como `favoriteSuggestions` en el GET propio, computado al vuelo y nunca
      persistido; controller lo añade solo al GET propio.
- [x] Store: `suggestions` viaja con el perfil; pin/unpin mueve la sugerencia (graduación al
      fijar, re-oferta al quitar) con rollback conjunto del PUT.
- [x] Sidebar: botón `+` en el header de Favoritos (solo cuando hay sugerencias; hit area 40px
      vía `::before -inset-[6px]`) + `Popover` `side="right" align="start"` con hover-intent
      400ms/250ms (grace para cruzar al contenido portaleado) y cierre automático al vaciarse;
      i18n es+en (`sidebar.suggestedFavorites` / `sidebar.pinSuggestion`).
- [x] Tests API (11): telemetría orden/filtro allowlist, fallback defaults menos pineadas, cap 5,
      todo-pineado → [], privacidad (public/search sin el campo).
- [x] Tests web: mock fiel del trío `Popover` (provide/inject con la API controlada de reka-ui)
      — trigger condicionado, pin con un clic + graduación + cierre del popover, hover-intent
      con fake timers (46); store (10).
- [x] e2e: el popover fija una vista frecuente con un clic (por su propio label — telemetría
      variable), graduación visible y persistencia tras reload.
- [x] QA desktop + móvil (chrome-devtools MCP): apertura por clic y por hover-intent, contenido
      de telemetría real, aria-labels, pin táctil end-to-end con PUT real + restore, outside
      dismiss, posición side=right/align=start, grace period; screenshot de registro.

**Done**: 2026-10-19 — unit (46+10+11) y cuerpo del e2e verde; `vue-tsc --noEmit` exit 0.
Desviaciones: (a) la corrida completa del e2e satura el `apiLimiter` global (300 req/min por IP
sobre todas las rutas `/api`) y el PUT del `afterAll` recibió 429 — los 6 cuerpos pasaron; el
perfil se restauró a mano por curl y se verificó por el dato (GET 200 con el array esperado);
para corridas futuras del spec completo conviene `SKIP_RATE_LIMIT=true` en el API del worktree
(requiere restart) o grep puntual; (b) el `hover()` del chrome-devtools MCP no dispara
`mouseenter` nativo en el wrapper — el QA del hover-intent se verificó con
`dispatchEvent(new MouseEvent('mouseenter'))` sintético (limitación de la herramienta, no del
código); (c) en móvil hay dos instancias del Sidebar montadas (desktop oculta + drawer): los
selectores del QA filtraron por rect no-cero para operar la visible; (d) el hit area de 40px del
botón `+` lleva `relative z-10` acompañante — sin él, el stacking del DOM tape las esquinas del
`::before` y el área efectiva vuelve a 28px.

**Gate**: commit `feat(api)` + `feat(web)`.

## M4d — Sin estrella: menú de favoritos por dwell (feedback ronda 3)

- [x] `SidebarMenuItem.vue`: estrella eliminada de las filas; menú con `role="menu"` + un
      `menuitem` («Añadir/Quitar de favoritos», keys i18n de M3) que se despliega tras dwell:
      **hover 1000ms** (mouse), **long-press 500ms** (touch, tolerancia 10px), **focus-dwell
      1000ms** (teclado). Teleport a `<body>` + `position:fixed` posicionado a mano del rect de la
      fila (derecha +8, centrado vertical, **clampeado al viewport**), grace 250ms para cruzar,
      cierre por Escape (devuelve focus) / click fuera / scroll / click en la fila.
- [x] Guardas táctiles: supresión de mouseenter post-touch (800ms), `preventDefault` del click
      sintético tras long-press, context-menu solo durante hold, `select-none` +
      `[-webkit-touch-callout:none]`.
- [x] `Sidebar.vue`: copias de Favoritos togglables (`is-favorite` + `toggle-favorite` en el site
      índice -1); los 3 sites de secciones sin `show-favorite-star`; prop eliminada del componente.
- [x] Tests unit: `SidebarMenuItem.test.ts` nuevo (8 — abre tras 1s y no a 600ms, leave cancela,
      acción remove para pineado, grace al cruzar, long-press táctil, Escape, click fuera, rail
      nunca); `Sidebar.test.ts` (46 — stub sin estrella, wiring desde fila real y copia).
- [x] e2e reescrito: el menú por hover quita y repone el pin desde la fila real, sobrevive reload.
- [x] QA desktop + móvil (chrome-devtools MCP): dwell 1s, posición right+8 centrada, Escape +
      focus; móvil 390×844 touch: long-press 500ms (no a 200ms), touchend no navega ni cierra,
      tap en acción → PUT real, tap fuera cierra; consola limpia; perfil restaurado por PUT.

**Done**: 2026-10-20 — unit 54/54 (8+46), `vue-tsc --noEmit` exit 0, e2e «el menú por hover quita
y repone el pin» verde (5.2s). El QA móvil cazó un bug real: el menú desplegado a la derecha de la
fila se salía del viewport en el drawer (390px) — clamp horizontal + vertical en `openMenu`
(`left = min(row.right+8, innerWidth-232)`), re-verificado en vivo (158→382 de 390) y re-tests.
Desviaciones: (a) **posicionamiento manual en vez de `Popover` de `@repo/ui`** — el paquete no
exporta `PopoverAnchor` y encadenar `as-child` (TooltipTrigger→Popover→router-link) secuestra el
click de navegación del `<a>`; el menú mide el rect del wrapper exterior (sin el
`transform hover:scale-105` del anchor); (b) **touch 500ms vs mouse 1000ms** — el long-press
estándar de móvil es más corto que el dwell de mouse pedido («a second»); (c) teclado = dwell por
focus (1000ms): el toggle es alcanzable sin puntero y un tab rápido nunca lo abre; (d)
`createTestWrapper` **descarta `options.props`** (nunca los pasa a `mount`) — `SidebarMenuItem.test.ts`
monta directo con VTU; (e) las copias de Favoritos quedaron togglables (cambio de diseño vs. la
estrella, que las excluía): quitar el pin directo desde arriba, sin cazar la fila en su sección.

**Gate**: commit `feat(web)`.

## M4e — Favoritos entra al acordeón completo (feedback ronda 4)

- [x] `ui.ts`: `toggleSidebarSection` y `toggleRetreatGroup` pliegan Favoritos al abrir;
      `toggleFavoritesSection` al expandir pliega el grupo «Retiro» y todas las secciones;
      `initSidebarAccordion` repara el estado legacy (sección abierta + Favoritos expandida)
      plegando Favoritos. Key de localStorage propia conservada (dentro del record de secciones,
      la siembra la cerraría y la reparación de >1 la plegaría).
- [x] Tests `ui.test.ts`: 4 nuevos (sección pliega favoritos sin re-expandirla al cerrar, grupo
      Retiro pliega favoritos, expandir favoritos pliega todo + no filtra al record, init repara
      legacy) — el test de independencia de M4b reescrito a la semántica inversa.
- [x] e2e: test nuevo «favoritos entra al acordeón» (exclusión mutua bidireccional + reload) y el
      del menú por hover ajustado (re-expandir Favoritos antes de ver la copia pineada).
- [x] QA vivo: caso exacto del feedback (Favoritos abierta → clic en sección → se pliega),
      dirección inversa, persistencia tras reload, consola limpia.

**Done**: 2026-10-20 — unit 68/68 (14+46+8), `vue-tsc --noEmit` exit 0, e2e 3/3 (nuevo acordeón +
menú por hover + regresión). Desviaciones: (a) la reparación del legacy pliega Favoritos cuando
hay una sección abierta (conserva la sección que el usuario dejó abierta, pliega la sección de
arriba) — sin ella, un localStorage previo al cambio mostraría dos abiertas; (b) cerrar una
sección NO re-expande Favoritos (el acordeón nunca abre paneles por sí solo, igual que entre
secciones).

**Gate**: commit `feat(web)`.

## M4f — Mejoras UX: hint, toast con deshacer, transición, conteo de vistas

Selección explícita de Leonardo (AskUserQuestion 2026-10-20): las 4 opciones.

- [x] API (commit `a0150133`): `getFavoriteSuggestions` devuelve `{ route, views }` y el GET
      propio lo expone junto a `favoriteMenuItems`; views = conteo real de telemetría.
- [x] `@repo/ui`: export `ToastAction` (existía en el paquete, no salía por `index.ts`).
- [x] Store: hint de descubrimiento (`favorites-hint-dismissed` en localStorage, descartado al
      primer toggle o por `dismissHint`), `announceToggle` — toast 8s con `ToastAction`
      «Deshacer» que re-toggla y re-anuncia.
- [x] `Sidebar.vue`: hint bajo el header de Favoritos + conteo de vistas en las sugerencias
      (`viewCountOne`/`viewCountMany`, i18n es+en).
- [x] `SidebarMenuItem.vue`: transición fade+scale (~120ms) del panel del menú dwell; chevron
      con fade-in durante el dwell (400ms) como affordance.
- [x] Tests: store 13 (hint persistente, undo re-toggla, **`altText` presente**), Sidebar 46
      (mock local de `@repo/ui` con `ToastAction`), e2e +2 (toast con deshacer **sin reload**
      — bandera de `window` como tripwire — y conteo de vistas en el popover).

**Done**: 2026-10-20 — unit 67/67 (13+46+8), `vue-tsc --noEmit` exit 0, e2e 2/2 los nuevos (los
6 previos ya verdes en su milestone). QA vivo desktop (1440×900) + móvil (390×844 touch)
completo: hint visible → «Ocultar la ayuda» persiste; dwell chevron a 460ms sin menú, menú a
1160ms; toast «Fijado/Quitado + Deshacer» sin reload, el undo revierte y re-anuncia, expira solo
(8s); conteos reales («Dashboard del Retiro 535 vistas», «Servidores 153»…); long-press móvil
600ms abre el menú y el toggle no recarga. Desviaciones: (a) **bug crítico cazado en QA: reload
completo en cada toggle** — `ToastAction` exige la prop `altText`; sin ella lanza en setup, el
`errorHandler` de `main.ts` lo lee como fallo de arranque y fuerza `window.location.reload()`;
los unit tests no lo ven (el stub acepta cualquier prop) — blindado con aserción de la prop en
el test del store + el e2e con bandera de `window`; (b) **diagnóstico a ciegas dos veces**: el
proxy de módulo de vitest **lanza** al acceder una export no definida en el mock (no devuelve
`undefined`) y `setup.ts:199` silencia `console.error` — el rollback silencioso del catch solo
se vio debuggeando a archivo (`appendFileSync`); (c) el label del e2e del popover ahora sale del
`span.truncate` interno: el `innerText` del botón trae el conteo pegado y `hasText` dejaba de
matchear la copia; (d) los títulos del toast se asertan con `exact: true` — la live region del
viewport del Toaster anuncia el mismo texto como nombre accesible y un `getByText` suelto matchea
dos elementos.

**Gate**: commit `feat(web)`.

## M5 — Cierre

- [x] Reconcile en `spec.md` (cada CA verificada ✓, negativos incluidos, lo descartado).
- [x] `**Done**` por milestone + desviaciones (M0-M4f).
- [x] Suite web completa + API afectada + e2e re-verificados al cierre (ver abajo).
- [ ] PR nuevo (con switch de cuenta gh), `gh pr checks` verde.
- [ ] Merge a master con OK de Leonardo (push a master deploya prod).
- [ ] Cerrar worktree (skill `cerrar-worktree`).

**Done (parcial)**: 2026-10-20 — Reconcile completo contra tests/QA de los milestones, con las
verificaciones puntuales de los dos criterios sin evidencia fresca (CA4 → test «hides favorites
whose item is filtered out (no selected retreat)»; payload de la página de perfil → bio+interests
en el test de rutas). Verificación final: web **3416 pasados** (único rojo: `runtimeConfig.test.ts`,
falso positivo del `.env.local` del worktree, documentado en M3); API userProfile **37/37**; e2e
**8/8 por cuerpo** el mismo día (la corrida completa de una pieza aborta en el 6º por el
`apiLimiter` global — 429 en el afterAll, como en M4c; tras ella el perfil de Leonardo quedó en
SEED y se restauró a mano por PUT verificado por el dato a su top-5 de telemetría real);
`vue-tsc --noEmit` exit 0.

## Checklist de verificación final

- [x] `pnpm --filter web test` verde (3416 + el falso rojo de entorno documentado).
- [x] Suite API afectada verde (userProfile 37/37, una corrida a la vez).
- [x] E2E verde (chromium contra el dev del worktree, 8/8 por cuerpo).
- [x] Criterios 1-10 + negativos del spec verificados contra la app del worktree (Reconcile).
- [x] `git status` limpio de archivos ajenos a la feature antes de cada commit.
