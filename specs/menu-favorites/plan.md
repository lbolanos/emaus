# Plan: favoritos de items del menú en el sidebar

> SDD plan — versión 2.0 (2026-10-19). Reescritura tras el giro del pedido (ver spec v2.0). El
> branch arranca desde `master` con el fix del acordeón ya cherry-pickeado (`fec75d89`).

## Contexto

El spec v1.x («retiros favoritos») se implementó completo en `worktree-retreat-favorites` (5
commits, PR #14) antes del giro: el pedido era **favoritos de items del menú**. Decisión de
Leonardo (2026-10-19): sección fija arriba, pre-seed con top 5 de telemetría, borrar y rehacer.
El branch nuevo nace de `master` + cherry-pick del fix del acordeón; el PR #14 se cerró y nada de
retiros favoritos llega a master. Se reutiliza el **patrón** de v1 (columna en `user_profiles`,
schema zod permisivo, strip de privacidad, store optimista, e2e con restore) cambiando el
contenido: route names en vez de UUIDs de retiro, y sumando lo nuevo (seed por telemetría, sección
fija, estrella por item).

## Milestones

- **M0 — specs** (este branch): renombrar `specs/retreat-favorites` → `specs/menu-favorites` +
  reescritura (research/spec/plan/tasks). Gate: Leonardo ya aprobó el giro y las 3 decisiones
  (ubicación, pre-seed, borrado) vía pregunta directa — las D1-D9 quedan documentadas aquí.
- **M1 — API**: migración `20261019210000_AddFavoriteMenuItemsToUserProfile` (idempotente) +
  entity + `MENU_ROUTE_NAMES`/`DEFAULT_FAVORITE_MENU_ITEMS` en `packages/types/src/menu.ts` +
  `UpdateSocialProfileSchema` con `favoriteMenuItems` + wire `validateRequest` + controller
  (destructure) + service (sanitización cap 12, strip en `getPublicProfile`/`searchUsers`, seed
  D5). Tests: migración idempotente, rutas (400), controller pasa el campo, seed del service
  (telemetría ∩ allowlist, fallback, `[]` no re-semebra, privacidad). Una sola corrida de jest a la
  vez.
- **M2 — Fix del acordeón**: ya commiteado (`fec75d89`, cherry-pick verificado con tests en su
  momento). Solo re-verificación en vivo en el QA del M4.
- **M3 — Web**: `menuFavoritesStore` (load/toggle optimista/rollback+toast) + `api.ts`
  (`favoriteMenuItems` en `updateUserProfile`) + `Sidebar.vue` (sección Favoritos D6: filas vía
  `SidebarMenuItem` con índice -1, rail con íconos; quitar del template nada de retiros) +
  `SidebarMenuItem.vue` (estrella D7: wrapper flex, botón fuera del `<a>`, props/emits opcionales
  con defaults seguros) + i18n es/en (4 keys) + tests (store, Sidebar: sección render, toggle,
  huérfanos ocultos, estrella emite; `Sidebar.test.ts` amplía mocks: `Star` ya está en el mock
  local, añadir funciones del servicio).
- **M4 — E2E + QA móvil**: `sidebar-favorites.spec.ts` reescrito (regresión acordeón intacta +
  favoritos de menú con seed por PUT y restore) + QA chrome-devtools (iPhone + touch): drawer,
  targets ≥40px, estrella, consistencia del acordeón entre instancias. Gate: Leonardo abre la
  feature (URL del worktree).
- **M5 — Cierre**: Reconcile del spec (criterios + negativos con evidencia), `**Done**` por
  milestone, desviaciones. PR nuevo + `gh pr checks` verde. Merge a master **solo con OK explícito
  de Leonardo** (push a master deploya prod).

## Riesgos conocidos

- **json_extract en el driver del API**: verificado en la DB con sqlite3 CLI (research §3); si el
  driver de TypeORM difiriera, el seed cae al fallback default (no rompe el GET) — se testea en el
  M1 con la entity real en memoria.
- **Duplicación de `data-menu-item-index`**: la copia de favoritos lleva `-1`; la navegación por
  teclado y el scrollIntoView no se ven afectados (verificado por test de focus existente).
- **Deriva del allowlist**: test que compara `MENU_ROUTE_NAMES` contra los route names de
  `menuSections` del Sidebar — pero el Sidebar no importa de `@repo/types` (su fuente es el propio
  array); el test vive en web y lee el componente, o el allowlist se contrasta a mano en el M3.
  Decisión: test en web que importa `menuSections` no es posible (no exportado) — se exporta
  `MENU_ROUTE_NAMES` desde `@repo/types` y el Sidebar **no** cambia; la verificación de deriva es
  un test unitario de `@repo/types` que valida formato/sin-duplicados, y la revisión manual al
  añadir items (nota de mantenimiento en D5).
- **Cuenta de gh**: cerrar/crear PR exige `gh auth switch` a `lbolanos` y restaurar (memoria
  `reference-gh-two-accounts-pr-creation`); el push va por SSH alias y no necesita switch.

## Reglas duras durante la ejecución

- Cada milestone cierra con su commit (autorizado por la decisión «borrar y rehacer» del
  2026-10-19); **el merge a master espera OK explícito** de Leonardo para ese acto.
- Nunca sqlite3 CLI sobre la DB de dev viva: copia read-only de los 3 archivos a /tmp y consultar
  la copia.
- No `migration:revert`. Backup `.backup` antes de correr migraciones en local con datos
  importantes (aquí: DB del worktree desechable, se re-copia del main).
- Código en inglés; UI española vía i18n (es Y en). Rutas absolutas al nombrar archivos.
- El e2e corre `--project=chromium` contra el dev del worktree (3003/5175); QA móvil con
  chrome-devtools MCP (screenshots solo dentro del workspace).
