# Plan: retiros favoritos en el sidebar

> SDD plan — versión 1.0 (2026-10-19). El qué/por qué vive en `spec.md`; el estado verificado del
> código, en `research.md`. Implementación en worktree `.claude/worktrees/retreat-favorites`,
> branch `worktree-retreat-favorites`, con el skill `worktree-testing` (puertos 3002/5174, `.env`,
> DB copiada con `-wal`/`-shm`, `packages/ui/dist`).

## API

| Archivo | Cambio |
|---|---|
| `apps/api/src/migrations/sqlite/20261019120000_AddFavoriteRetreatIdsToUserProfile.ts` | Nueva. Patrón `AddShirtOrderEstimateToRetreat`: `PRAGMA table_info("user_profiles")` + `ALTER TABLE … ADD COLUMN "favoriteRetreatIds" text` condicional; `down` con `DROP COLUMN`. Sin `@repo/types`. |
| `apps/api/src/entities/userProfile.entity.ts` | Columna `favoriteRetreatIds?: string[] \| null` (`simple-array`, nullable) tras `skills`. |
| `packages/types/src/user.ts` | `UpdateSocialProfileSchema` (zod, shape `{ body: … }` como `CreateRoleRequestSchema`) con los campos actuales del PUT, permisivos, + `favoriteRetreatIds: z.array(z.string().uuid()).max(100).optional()`. Exportar del index. |
| `apps/api/src/routes/userSocial.routes.ts` | Wire `validateRequest(UpdateSocialProfileSchema)` en `PUT /profile`. |
| `apps/api/src/controllers/userProfileController.ts` | `updateMyProfile`: destructure + pase de `favoriteRetreatIds`. |
| `apps/api/src/services/userProfileService.ts` | `UserProfileData` += `favoriteRetreatIds?: string[] \| null`. En `updateUserProfile`: sanitizar (`[...new Set(ids)].slice(0, 100)`). En `getPublicProfile` y `searchUsers`: strip del campo (privacidad). |

## Web — fix del acordeón (M2)

| Archivo | Cambio |
|---|---|
| `apps/web/src/stores/ui.ts` | State `sidebarCollapsedSections` + `isRetreatGroupCollapsed` (mismas keys de localStorage) y acciones `initSidebarAccordion(categories)` (siembra faltantes como colapsadas + repara >1 abierta + idempotente entre las dos instancias), `toggleSidebarSection(category, isRetreatCategory)`, `toggleRetreatGroup()` — portes de la lógica actual de Sidebar.vue. |
| `apps/web/src/components/layout/Sidebar.vue` | Borrar refs locales (`collapsedSections`, `isRetreatGroupCollapsed`), `loadCollapsedState`/`saveCollapsedState` y `toggleRetreatGroup` local; delegar en el store (`storeToRefs`). `onMounted` → `initSidebarAccordion(menuSections.map(s => s.category))`. `expandedWhenCollapsed` queda local. |

## Web — favoritos (M3)

| Archivo | Cambio |
|---|---|
| `apps/web/src/stores/favoriteRetreatsStore.ts` | Nuevo: `favoriteIds`, `loaded`, `load()` (GET `/social/profile`), `toggleFavorite(id)` optimista con rollback + toast (i18n global), `isFavorite(id)`. |
| `apps/web/src/services/api.ts` | `favoriteRetreatIds?: string[]` en el tipo de `updateUserProfile`. |
| `apps/web/src/components/layout/Sidebar.vue` | Estrella en la fila de botones del selector (tras eliminar; `h-8 w-8`, `aria-pressed`, `Star` fill ámbar marcada; icono suelto bajo el header «Retiro» en modo rail). Chips bajo el selector (`overflow-x-auto`, `min-h-[40px]`, chip activo con ring, `data-testid="favorite-retreat-chip"`, `v-if="!isCollapsedView"`). Clic de chip → `retreatStore.selectRetreat(id)`. |
| `apps/web/src/locales/es.json` + `en.json` | `sidebar.favoriteRetreats`, `sidebar.markAsFavorite`, `sidebar.unmarkFavorite`, `sidebar.favoriteToggleFailed` (ambos idiomas). |

## Tests

| Archivo | Casos |
|---|---|
| `apps/api/src/tests/migrations/addFavoriteRetreatIds.migration.test.ts` (nuevo) | up idempotente (dos corridas), columna presente, down la quita. Patrón `addMissingServiceTeams`. |
| `apps/api/src/tests/…userProfile…` (extender) | `updateMyProfile` pasa `favoriteRetreatIds`; schema: uuid inválido y >100 → 400; `getPublicProfile`/`searchUsers` sin el campo. |
| `apps/web/src/stores/__tests__/favoriteRetreatsStore.test.ts` (nuevo) | load mapea `?? []`; toggle añade/quita; rollback + toast al fallar el PUT; dedupe. |
| `apps/web/src/stores/__tests__/ui.test.ts` (nuevo) | Siembra de faltantes, reparación >1, idempotencia del init, invariante "≤1 abierta" tras toggles. |
| `apps/web/src/components/__tests__/Sidebar.test.ts` (extender) | **Mocks**: `Star` al mock local de lucide + `getUserProfile`/`updateUserProfile` al mock de `@/services/api`. Chips huérfanos ocultos; clic de chip selecciona; estrella conmuta y llama PUT; regresión acordeón con localStorage viejo. |
| `apps/web/tests/e2e/sidebar-favorites.spec.ts` (nuevo) | (a) abrir sección A luego B → solo B abierta; (b) estrella → recarga → chip; chip cambia retiro. |

## QA móvil (M4)

chrome-devtools MCP con viewport iPhone + touch sobre el dev del worktree: drawer, acordeón
consistente entre instancias, chips táctiles con scroll, estrella persiste tras recarga.
Screenshots a `/tmp/chrome`.

## Riesgos conocidos

- `simple-array` separa por comas: UUID v4 no llevan → seguro (documentado en D1).
- Validación zod retroactiva sobre un PUT vivo: bounds permisivos + test con el payload real de la
  página de perfil.
- Carrera PUT perfil + PUT favorito: imposible pisarse (columnas distintas; `undefined` se salta).
