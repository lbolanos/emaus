# Research: favoritos de items del menú en el sidebar

> SDD research — versión 2.0 (2026-10-19). Reescritura del research de «retiros favoritos» tras el
> giro del pedido: el feature son **favoritos de items del menú** (las vistas que más se usan), no
> de retiros. El §2 (acordeón) se conserva — su fix ya está commiteado (`fec75d89`, cherry-pick) —
> y el §3 nuevo es la telemetría que habilita el pre-seed. Se citan `archivo` + función; las líneas
> son andamio de esta verificación, no parte del contrato.

## §1 El sidebar y su menú

- `apps/web/src/components/layout/Sidebar.vue` concentra la navegación (~1520 líneas): array
  estático `menuSections` con **10 secciones** (`community`, `social`, `main`, `people`,
  `assignments`, `logistics`, `communications`, `reports`, `administration`, `settings`; la última
  con `position: 'bottom'`) más el grupo padre **«Retiro»** que envuelve al selector y a las
  sub-secciones de retiro (`RETREAT_CATEGORIES`).
- `MenuItem` (interfaz exportada del propio Sidebar): `{ name, routeName, icon, permission?,
  permissionOperation?, requiresRetreat?, label, href?, onClick? }`. **`name` ≠ `routeName` en
  varios items** (`'dashboard'`→`'retreat-dashboard'`, `'user-type-table'`→`'user-type-and-table'`,
  `'notes'`→`'notes-and-meeting-points'`): la clave estable para favoritos es **`routeName`**, que
  además es lo que registra la telemetría (§3).
- `filteredMenuSections` (computed) aplica todo el gating: `requiresRetreat` (sin retiro
  seleccionado el item desaparece), `permission === 'superadmin'`, permisos por recurso vía
  `useAuthPermissions`, casos especiales (`communities`, `role-management`, `domain-audit`) y el
  filtro de búsqueda por label traducido o `name`. Es la fuente de verdad de qué items son
  visibles: los favoritos deben renderizar como join contra este computed, no contra
  `menuSections` crudo.
- `getRouteWithParams(item)` arma el target de navegación y añade `{ id: selectedRetreatId }` a
  los `routeName` de `routesRequiringId` (retreat-dashboard, bed-assignments, responsibilities,
  inventory, role-management, santisimo, reception, minuto-a-minuto, pre-retreat-tasks,
  retreat-preparations); devuelve `null` si falta el retiro. El clic de un favorito debe usar esta
  misma función.
- `SidebarMenuItem.vue` renderiza cada fila: `Tooltip > TooltipTrigger as-child > <a>` (router-link
  custom), badge opcional (`itemBadge`), `data-menu-item-index` para la navegación por teclado
  (`allMenuItems` + `navigateUp/Down` + `scrollIntoView` por `querySelector` — duplicar ese atributo
  en las copias de favoritos rompería el scroll; la copia de favoritos lleva índice `-1`).
- Modo rail (`isCollapsedView`, w-20): items como icono suelto con Tooltip lateral; el grupo Retiro
  muestra flyout con `expandedWhenCollapsed` (local, transitorio).

## §2 El bug del acordeón (observado por Leonardo el 2026-10-19) — YA CORREGIDO

Causa original en `Sidebar.vue`: una categoría **sin clave** en el record de
`sidebar-collapsed-sections` contaba como abierta para siempre (el toggle solo colapsaba claves
presentes y el `loadCollapsedState` no sembraba faltantes), y en móvil hay **dos instancias del
Sidebar** montadas (desktop `hidden md:flex` + drawer Teleport en `AppLayout.vue`) con refs
locales divergentes.

**Fix ya en el branch** (`fec75d89`, cherry-pick del commit original del feature): el estado migra
a `useUIStore` (pinia) compartido por ambas instancias, con `initSidebarAccordion(categories)` que
siembra toda clave faltante **colapsada** y repara >1 abierta. Cubierto por
`apps/web/src/stores/__tests__/ui.test.ts` + regresión en `Sidebar.test.ts` + e2e. Este spec lo
trata como dependencia cerrada; solo se re-verifica en el QA móvil del M4.

## §3 Telemetría de páginas (el dato que habilita el pre-seed)

- `apps/web/src/router/index.ts` (afterEach): `trackPageView(to.name || to.path)` →
  `telemetryService` → `POST /telemetry/track/page-view` con `{ userId, sessionId, page }`. El
  **page name es el route name**: exactamente la clave elegida para los favoritos (§1).
- `apps/api/src/entities/telemetryEvent.entity.ts`: enum `TelemetryEventType.PAGE_VIEW =
  'page_view'`; columnas `eventData` (json, el page va en `$.page`), `userId`, `endpoint`.
- DB de dev (verificado 2026-10-19 sobre copia read-only): **6919 page_views**. Top del usuario de
  prueba (`leonardo.bolanos@gmail.com`): `retreat-dashboard` 450, `walkers` 169, `servers` 153,
  `community-dashboard` 153, `community-meetings` 152, `communities` 148, `message-sequences` 101,
  `tables` 84, `community-members` 82, `retreat-flyer` 79, `palancas` 71, `minuto-a-minuto` 67.
- **No todo page name es un item del menú**: `community-dashboard`, `community-meetings`,
  `community-members`, `retreat-flyer` son rutas a las que se navega desde dentro de vistas, sin
  item propio. El seed debe filtrar contra una lista de route names válidos para no gastar los 5
  slots en páginas sin item.
- `json_extract(eventData, '$.page')` funciona sobre la columna json (verificado con sqlite3 sobre
  la copia). La agregación del seed es un solo `GROUP BY` ordenado por vistas desc.

## §4 El perfil social en el API

- Entidad `user_profiles` (`apps/api/src/entities/userProfile.entity.ts`): `bio`, `location`,
  `website`, `showEmail/showPhone/showRetreats`, `interests`/`skills` como **`simple-array`**
  (precedente del formato), `avatarUrl`. **No tiene columna de preferencias de UI.**
- Rutas (`apps/api/src/routes/userSocial.routes.ts`): `GET /social/profile` devuelve la entidad
  completa (`getMyProfile` → `getUserProfile(userId)`); el `PUT /social/profile` **no tiene
  `validateRequest`** en master — el controller destructura `req.body` a mano.
- `userProfileService.updateUserProfile` hace `Object.assign(profile, data)` + save. PUT parcial
  seguro en TypeORM 0.3.27: `undefined` no se escribe; `null` sí.
- `getUserProfile(userId)` crea el perfil default si no existe; también lo llaman
  `getPublicProfile` y `searchUsers` como fallback de otros usuarios — el seed (D5) vive ahí y usa
  el `userId` del perfil, así que sembrar "por accidente" el de otro usuario solo le precomputa a
  ese usuario sus propios favoritos (campo privado, sin efecto visible).
- **Fuga de privacidad a cerrar**: `getPublicProfile` y `searchUsers`
  (`leftJoinAndSelect('user.profile', 'profile')`) devuelven el perfil completo — cualquier columna
  nueva sale por ambos caminos hacia otros usuarios.
- Grep de `favorite|favorito` en `apps/api` (master): cero resultados.

## §5 Migraciones SQLite

- Patrón idempotente a copiar: `apps/api/src/migrations/sqlite/20261005120000_AddShirtOrderEstimateToRetreat.ts`
  — `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` condicional, `down` con `DROP COLUMN`, solo
  `typeorm`, sin `@repo/types` (regla dura para prod; el allowlist de route names del seed vive en
  `@repo/types` pero lo importa el **service**, no la migración). Un `ALTER TABLE` aditivo no exige
  `transaction = false`.
- Las migraciones se auto-descubren por `readdirSync` (`base-migration-manager.ts`): basta crear el
  archivo `AAAAMMDDHHMMSS_Nombre.ts` (14 dígitos + guion bajo, o es invisible). El API de dev las
  aplica en cada restart (`MIGRATIONS_AUTO_RUN=true`).

## §6 Tests y mocks

- Sidebar: `apps/web/src/components/__tests__/Sidebar.test.ts` (render, persistencia, RBAC) y
  `SidebarFocusState.test.ts`. **Sidebar.test.ts tiene un mock local de `lucide-vue-next` que pisa
  al global** de `apps/web/src/test/setup.ts` — un ícono nuevo hay que añadirlo en ambos. Su mock
  de `@/services/api` solo exporta `api`: las funciones nuevas del servicio hay que añadirlas ahí.
- Store: patrón `retreatStore.test.ts`. Mock global de axios en `apps/web/src/test/setup.ts`.
- API: Jest. Patrón de test de migración idempotente: `apps/api/src/tests/migrations/`. Regla
  dura: **una sola corrida de jest a la vez**.
- E2E Playwright en `apps/web/tests/e2e/` con `loginAs` en `helpers/auth.ts`. Ojo (skill
  worktree-testing): los usuarios `@test.local` NO existen en la DB del worktree — usar el fallback
  `E2E_LOCAL_*` (patrón `sequences-inbox.spec.ts`), y restaurar el perfil en `afterAll`.

## §7 Datos de la DB de dev (verificados 2026-10-19, copia read-only)

- El usuario de prueba local (`leonardo.bolanos@gmail.com`) tiene perfil y **telemetría abundante**
  (§3): ejercita el seed personalizado de punta a punta. Un usuario nuevo sin page_views ejercita
  el fallback default (cubierto por unit test del service; en dev no hay cuenta limpia con sesión).
- 50 usuarios, 47 `user_profiles`. Suficiente para verificar privacidad contra el perfil de otro
  usuario (GET público / search) sin sembrar nada nuevo.
