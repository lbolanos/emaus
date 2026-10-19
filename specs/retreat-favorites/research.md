# Research: retiros favoritos en el sidebar

> SDD research — versión 1.0 (2026-10-19). Estado verificado del código el día del spec. Las líneas
> son de `master` en `b3b02cb1`. Se citan `archivo` + función; las líneas son andamio de esta
> verificación, no parte del contrato.

## §1 El sidebar y su selector de retiro

- `apps/web/src/components/layout/Sidebar.vue` concentra toda la navegación (~1490 líneas): array
  estático `menuSections` con **10 secciones** (`community`, `social`, `main`, `people`,
  `assignments`, `logistics`, `communications`, `reports`, `administration`, `settings`) más el
  grupo padre **«Retiro»** que envuelve al selector y a las sub-secciones de retiro
  (`RETREAT_CATEGORIES`, L439).
- El selector es un `Select` de `@repo/ui` con `v-model` directo a
  `retreatStore.selectedRetreatId` (L220), dentro de un bloque `v-if="!isCollapsedView"` (L210) —
  en modo rail (w-20) el selector entero se oculta. Debajo, fila de botones +/editar/eliminar
  (L244-279) con Tooltip, gated por RBAC (`can.create/update('retreat')`, `canDeleteSelectedRetreat`).
- No hay agrupación ni favoritos en el selector: lista `retreatStore.retreats` con label
  `parish - formatDate(startDate)`. El orden viene del backend (descendente por fecha, asumido en
  `mostRecentRetreat`).
- `RETREAT_CATEGORIES` arrastra una categoría fantasma `'services'` sin ninguna sección: la lista
  de categorías válida debe derivarse de `menuSections`, nunca de una constante aparte.

## §2 El bug del acordeón (observado por Leonardo el 2026-10-19)

Tres hechos encadenados en `Sidebar.vue`:

1. `isSectionCollapsed` (L1208) trata una categoría **sin clave** en el record como abierta
   (`collapsedSections[category] ?? false`).
2. `toggleSection` (L1225-1227) solo colapsa `Object.keys(collapsedSections.value)` — claves
   **presentes**. Una categoría sin clave nunca se cierra y convive con la que se abra.
3. `loadCollapsedState` (L622-639), cuando hay `saved` en localStorage, hace
   `collapsedSections.value = parsed` **sin sembrar las claves faltantes**. Un localStorage anterior
   a una sección nueva (o un record parcial) deja esa sección abierta para siempre. La "reparación"
   de >1 abierta (L628-632) también solo ve claves presentes.

Además, **en móvil hay dos instancias de `Sidebar.vue` montadas a la vez**: la desktop
(`hidden md:flex`, `AppLayout.vue` L123-125, oculta por CSS pero viva) y la del drawer
(Teleport + Transition, L146-155). Cada una tiene sus refs locales (`collapsedSections` L517,
`isRetreatGroupCollapsed` L521) leídos de localStorage al montar (onMounted L1453): el estado puede
divergir entre instancias dentro de la misma sesión.

El resto del acordeón sí es estricto: `toggleSection` colapsa todo antes de abrir la clicada
(incluido el grupo Retiro si la sección no es de retiro, L1234-1236) y `toggleRetreatGroup`
(L529-539) colapsa todas las secciones al abrir el grupo.

## §3 Estado del web relacionado

- `apps/web/src/stores/retreatStore.ts`: `selectedRetreatId` persistido en localStorage
  (`STORAGE_KEY = 'selectedRetreatId'`), `fetchRetreats()` trae `/retreats` y auto-selecciona
  `mostRecentRetreat` si el guardado ya no existe. El watcher de `selectedRetreatId` en
  `Sidebar.vue` (L588-619) refresca permisos, reescribe el `:id` de la ruta activa y carga
  participantes/recepción. El drawer móvil se cierra al navegar (watch de `route.fullPath`,
  L583-585).
- `apps/web/src/stores/ui.ts`: `useUIStore` (setup style) ya es dueño de `isSidebarCollapsed`
  (localStorage `isSidebarCollapsed`), `isMobile` (matchMedia <768px) y `isMobileMenuOpen`. Es el
  hogar natural del estado del acordeón compartido.
- `apps/web/src/services/api.ts` (regla: el frontend SIEMPRE pasa por aquí): ya existen
  `getUserProfile()` (L2211) y `updateUserProfile(data)` (L2216) sobre `/social/profile`.

## §4 El perfil social en el API

- Entidad `user_profiles` (`apps/api/src/entities/userProfile.entity.ts`): `bio`, `location`,
  `website`, `showEmail/showPhone/showRetreats`, `interests`/`skills` como **`simple-array`**
  (precedente del formato que usaremos), `avatarUrl`, `testimonialVisibilityDefault`. **No tiene
  ninguna columna de preferencias de UI.**
- Rutas (`apps/api/src/routes/userSocial.routes.ts`): `GET /social/profile` devuelve la entidad
  completa (`getMyProfile` → `getUserProfile(userId)`); `PUT /social/profile` (L41) **no tiene
  `validateRequest`** — el controller destructura `req.body` a mano
  (`userProfileController.updateMyProfile`).
- `userProfileService.updateUserProfile` hace `Object.assign(profile, data)` + save. PUT parcial
  seguro en TypeORM 0.3.27: las propiedades `undefined` no se escriben
  (`SubjectChangedColumnsComputer`, "we don't perform operation over undefined properties");
  `null` SÍ se escribe.
- **Fuga de privacidad a cerrar**: `getPublicProfile` (L80-82) y **`searchUsers`** (L152,
  `leftJoinAndSelect('user.profile', 'profile')`) devuelven el perfil completo — cualquier columna
  nueva que se agregue sale por ambos caminos hacia otros usuarios.
- Grep de `favorite|favorito` en `apps/api`: cero resultados. No hay nada previo.

## §5 Migraciones SQLite

- Patrón idempotente a copiar: `apps/api/src/migrations/sqlite/20261005120000_AddShirtOrderEstimateToRetreat.ts`
  — `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` condicional, `down` con `DROP COLUMN`, solo
  `typeorm`, sin `@repo/types` (regla dura para prod). Un `ALTER TABLE` aditivo no exige
  `transaction = false` (el guard estático solo aplica con `DROP TABLE`/FK changes).
- Las migraciones se auto-descubren por `readdirSync` (`base-migration-manager.ts`): basta crear el
  archivo `AAAAMMDDHHMMSS_Nombre.ts`. El API de dev las aplica en cada restart.

## §6 Tests y mocks

- Sidebar: `apps/web/src/components/__tests__/Sidebar.test.ts` (render, persistencia, RBAC) y
  `SidebarFocusState.test.ts`. **Sidebar.test.ts tiene un mock local de `lucide-vue-next` que pisa
  al global** de `apps/web/src/test/setup.ts` (que sí tiene `Star`) — un ícono nuevo hay que
  añadirlo en ambos. Su mock de `@/services/api` solo exporta `api`.
- `retreatStore.test.ts` (patrón para el store nuevo). El mock global de axios en
  `apps/web/src/test/setup.ts`.
- API: Jest. Patrón de test de migración idempotente: `apps/api/src/tests/migrations/`
  (p. ej. `addMissingServiceTeams.test.ts`). Regla dura: **una sola corrida de jest a la vez**.
- E2E Playwright en `apps/web/tests/e2e/` con `loginAs` en `helpers/auth.ts` y webServer propio.

## §7 Datos de la DB de dev (verificados 2026-10-19, copia read-only)

- 8+ retiros con fecha ≥ 2025-11, p. ej. Buen Despacho (2026-10-16), San Miguel Arcángel
  (2026-09-04), Celaya (2026-08-28), San Agustín (2026-06-05), San Judas Tadeo, La Esperanza de
  María. Suficientes para chips múltiples y saltos entre retiros.
- 50 usuarios, 47 `user_profiles`, 48 `user_retreats`. El usuario de prueba local
  (`leonardo.bolanos@gmail.com`) tiene perfil para ejercitar GET/PUT.
