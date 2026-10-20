# Spec: favoritos de items del menú en el sidebar

> SDD spec — versión 2.0 (2026-10-19), prospectiva. Reescribe «retiros favoritos» tras el giro del
> pedido (2026-10-19): **favoritos de items del menú** — las vistas que más se usan, arriba del
> sidebar —, no favoritos de retiros. El fix del acordeón del spec anterior queda absorbido aquí
> como R7 (ya implementado y commiteado). v1.x (retiros) fue deshecha: nunca llegó a master y el
> PR que la llevaba (#14) se cerró.

**Branch**: `worktree-menu-favorites` (worktree `.claude/worktrees/retreat-favorites`) ·
**Fecha**: 2026-10-19 · **Para**: llegar en un clic a las vistas de uso diario, en desktop y móvil.

## Problema

El sidebar agrupa ~40 items en 10 secciones de un acordeón estricto (una abierta a la vez, fix
2026-10-19). Llegar a «Caminantes» o «Secuencias» desde una sección distinta cuesta: cerrar la
abierta, abrir la correcta, clicar el item — en móvil, además, abrir el drawer. La telemetría
muestra el desfase: el usuario de prueba concentra 450 vistas en `retreat-dashboard` y 169 en
`walkers`, pero cada visita repite la navegación completa (research §3).

De paso se reparó (commit absorbido) el bug del acordeón: **abrir una sección a veces no cerraba
las demás** (claves faltantes contaban como abiertas para siempre; dos instancias del Sidebar
divergían en móvil).

## Objetivo

1. Que cualquier usuario **marque items del menú como favoritos** y los tenga **arriba del sidebar,
   visibles sin abrir secciones**, en desktop y móvil; sus favoritos **lo siguen a cualquier
   dispositivo** (viven en su perfil, no en el navegador).
2. Que la primera vez la lista **arranque con lo que más usa**: los 5 items con más `page_view`
   propios según telemetría (fallback a un default razonable si no hay historial).
3. Acordeón determinista (una sección abierta a la vez, ambas instancias) — ya implementado.

## Historias de usuario

1. Como coordinador, abro el sidebar y **mis 5 vistas más usadas ya están arriba** («Favoritos»),
   sin abrir ninguna sección; clic en una me lleva igual que desde su sección.
2. Como coordinador, toco la **estrella** de un item del menú (p. ej. «Palancas») y aparece arriba;
   vuelvo a tocarla y se quita. En móvil funciona igual.
3. Como coordinador, marco favoritos en la laptop y al abrir el celular **ya están**: el dato vive
   en mi perfil.
4. Como cualquier usuario, al abrir una sección del sidebar las demás se cierran — siempre
   (regresión ya cubierta, se re-verifica en el QA móvil).

## Decisiones de diseño

- **D1 — Persistencia: `user_profiles.favoriteMenuItems` (`simple-array`, nullable).** Contenido:
  **route names** (`MenuItem.routeName`) — la clave que coincide con el page name de telemetría
  (research §3) y con `getRouteWithParams`. Preferencia personal, no dato social: no RBAC propio.
  Semántica: `null` = nunca usado (dispara el seed), `[]` = explícitamente vacío (quitar el último
  envía `[]`, nunca `null`). Cap: **12**. Los route names no llevan comas (kebab-case); el
  separador de `simple-array` es seguro.
- **D2 — Una migración SQLite idempotente** (`PRAGMA table_info` + `ALTER TABLE ADD COLUMN` text,
  `down` con `DROP COLUMN`, sin `@repo/types` — regla dura de prod).
- **D3 — Reutilizar `GET/PUT /social/profile`.** Sin endpoint nuevo. El PUT parcial es seguro
  (TypeORM salta `undefined`): el toggle manda solo `{ favoriteMenuItems }` y no pisa bio,
  intereses ni avatar. Se (re)agrega `UpdateSocialProfileSchema` (zod, permisiva, bounds
  retrocompatibles con la página de perfil): `favoriteMenuItems:
  z.array(z.string().min(1).max(64)).max(12).optional()`.
- **D4 — Sanitización y privacidad en el service.** Al guardar: dedupe + cap 12 (defense in depth
  con el zod). Y `favoriteMenuItems` **no sale hacia otros usuarios**: strip explícito en
  `getPublicProfile` y en `searchUsers` (research §4). El GET propio sí lo devuelve.
- **D5 — Pre-seed por telemetría (write-on-first-read).** La primera vez que `getUserProfile`
  carga un perfil con la columna `null`, el service computa el seed y lo guarda: top 5 de
  `telemetry_events` (`eventType='page_view'`, `userId` del perfil, `json_extract(eventData,
  '$.page')`), **filtrado contra `MENU_ROUTE_NAMES`** (route names con item de menú, exportado en
  `@repo/types/src/menu.ts` — sin el filtro, slots del top se gastan en páginas sin item como
  `community-dashboard`), orden por vistas desc. Sin telemetría útil → `DEFAULT_FAVORITE_MENU_ITEMS`
  (`retreat-dashboard`, `walkers`, `servers`, `message-sequences`, `tables`). Con el usuario de
  prueba el seed real es `retreat-dashboard, walkers, servers, communities, message-sequences`.
  Nota de mantenimiento: un item de menú nuevo debe añadirse a `MENU_ROUTE_NAMES` para ser
  sembrable (el estrellado manual funciona igual sin estar en la lista).
- **D6 — Sección «Favoritos» arriba, colapsable de forma independiente.** Primer bloque del área
  navegable, con header propio. **Revisión 2026-10-19 (feedback de Leonardo tras abrir la
  feature):** la sección pasó de «fija, no colapsa» a **colapsable** — el header es un botón con
  chevron (`aria-expanded`/`aria-controls`, patrón de `SidebarSection`) cuyo estado vive en
  `uiStore.favoritesCollapsed` (`sidebar-favorites-collapsed` en localStorage), **fuera** del
  record del acordeón: la siembra de `initSidebarAccordion` cerraría una clave desconocida y el
  acordeón completo la cerraría al abrir otra sección. Default expandida. El mismo cambio
  compactó el header (antes `px-4 pt-2 pb-1` + `mt-1`, ahora `px-2 py-1` como las demás
  secciones) cerrando el hueco excesivo entre «Buscar» y «Favoritos».
  Render: join `favoriteMenuItems ∩ filteredMenuSections` (mismo gating de RBAC/requiresRetreat
  que las secciones; un favorito oculto se conserva en el perfil y reaparece si vuelve a ser
  visible — mismo criterio que un item de sección). Cada fila usa `SidebarMenuItem` (label, ícono,
  badge y navegación idénticos; `data-menu-item-index="-1"` para no chocar con la navegación por
  teclado). Orden: el del array guardado (seed = vistas desc; altas manuales al final). Oculta si
  no hay favoritos visibles o durante una búsqueda activa. Modo rail: íconos apilados con Tooltip
  lateral (sin header ni colapso en rail). En móvil (drawer) es la misma sección, targets
  táctiles ≥40px (el header mide lo mismo que los headers de sección existentes, ~24px —
  consistencia con `SidebarSection` por encima del criterio de 40px, que sí aplica a las
  estrellas).
- **D7 — Estrella por item en `SidebarMenuItem`.** Props opcionales `isFavorite` /
  `showFavoriteStar` + emit `toggle-favorite`. El botón va **fuera del `<a>`** (wrapper flex):
  anidar un botón dentro del link es HTML inválido y rota el clic. Siempre visible (gris discreto;
  no depender de hover — móvil no lo tiene), amber con relleno cuando es favorito, `aria-pressed` +
  `aria-label` con i18n. Oculta en modo rail (sin espacio; se toggla desde la vista expandida) y en
  las copias de la sección Favoritos (el toggle vive junto al item real en su sección).
- **D8 — Store pinia nuevo `menuFavoritesStore`** (`load()` tras auth en el `onMounted` del
  Sidebar, `toggleFavorite(routeName)` optimista con rollback + toast si falla el PUT). Sin RBAC:
  preferencia personal. *Alternativa descartada*: `localStorage` — no seguiría al usuario de
  dispositivo; o un `profileStore` completo (sobre-ingeniería para un campo).
- **D9 — E2E mínimo de Playwright**: regresión del acordeón (conservada del spec anterior) + flujo
  de favoritos de menú (seed por PUT, sección arriba, clic navega, estrella conmuta, persiste tras
  recarga; restore del perfil en `afterAll`).
- **D10 — Popover de sugerencias por telemetría sobre el header de «Favoritos»** (feedback de
  Leonardo, 2026-10-19, punto 3). Hover sobre la sección (intent 400ms para abrir, 250ms para
  cerrar — grace para cruzar al contenido portaleado) o clic en el botón `+` (touch/teclado) abre
  un popover (`Popover` de `@repo/ui`, `side="right" align="start"`) con hasta **5 vistas
  frecuentes no fijadas**: top-12 de telemetría propia (`page_view` ∩ `MENU_ROUTE_NAMES`, vistas
  desc) ∪ `DEFAULT_FAVORITE_MENU_ITEMS`, menos las ya pineadas, cap 5. Se computa **al vuelo en el
  GET propio** (campo `favoriteSuggestions`, nunca persistido) y viaja con el perfil; al fijar,
  la sugerencia «se gradúa» del popover (moves optimistas en el store con rollback conjunto del
  PUT). El popover se cierra solo al quedarse sin sugerencias, y el botón `+` desaparece cuando
  no hay ninguna. Privacidad: solo el GET propio lo devuelve (`getPublicProfile`/`searchUsers`
  no lo exponen, cubierto por tests). Hit area del `+`: 40px vía `::before -inset-[6px]` (mismo
  estándar que la estrella) sin engordar el header compacto.

## Requerimientos

- **R1** — Migración + columna + entidad: `favoriteMenuItems` en `user_profiles`, idempotente en
  dev (auto-aplicada al restart) y reversible.
- **R2** — `UpdateSocialProfileSchema` (zod) en `packages/types`, wire con `validateRequest` en el
  `PUT /social/profile`. El GET propio devuelve el campo sin cambios extra.
- **R3** — Service: sanitización (dedupe, cap 12) al guardar; strip del campo en `getPublicProfile`
  y `searchUsers`; seed D5 en `getUserProfile` cuando la columna es `null`.
- **R4** — `menuFavoritesStore` con load/toggle optimista/rollback+toast; carga una vez por sesión
  tras autenticar; sin RBAC propio.
- **R5** — Sección «Favoritos» arriba (D6): solo items visibles según `filteredMenuSections`,
  navegación vía `getRouteWithParams`, badge igual que el item original, activo destacado por ruta;
  oculta sin favoritos visibles y durante búsqueda; íconos en rail; header colapsable (estado
  propio en `uiStore`, default expandida, persistido).
- **R6** — Estrella por item (D7): fuera del link, siempre visible, `aria-pressed`, i18n es+en,
  targets táctiles cómodos; toggle = PUT parcial; al quitar el último manda `[]`.
- **R7** — Acordeón determinista (ya implementado, commit absorbido): a lo sumo una sección
  abierta; claves faltantes se siembran colapsadas; estado compartido desktop/drawer; mismas keys
  de localStorage.
- **R8** — i18n es **y** en para todos los textos nuevos de UI.
- **R9** — `MENU_ROUTE_NAMES` + `DEFAULT_FAVORITE_MENU_ITEMS` exportados en `@repo/types` y usados
  por el seed del API (y testeados contra `menuSections` para que no deriven en silencio).

## Criterios de aceptación (end-to-end)

Verificados contra la app corriendo en el worktree, con el usuario local de prueba (perfil +
telemetría propia en la DB del worktree — research §7):

1. Primera carga con la columna `null` (perfil recién migrado): el GET devuelve los 5 items con más
   page_view **que tengan item de menú**, en orden de uso; la sección «Favoritos» los muestra
   arriba sin abrir secciones.
2. Clic en un favorito navega igual que el item original (misma ruta, con `:id` del retiro
   seleccionado cuando corresponde; en móvil el drawer se cierra solo).
3. La estrella de un item de sección lo agrega a Favoritos (PUT parcial); recarga y sigue; tocarla
   de nuevo lo quita; al quitar el último el PUT manda `[]`, nunca `null`.
4. Sin retiro seleccionado, los favoritos `requiresRetreat` desaparecen de la sección (igual que
   sus items) y reaparecen al seleccionar uno; el array del perfil no se toca.
5. localStorage viejo sin clave de una sección: esa sección arranca colapsada y el acordeón nunca
   deja dos secciones abiertas (regresión, ya cubierta por tests).
6. En emulación móvil: drawer abre/cierra, Favoritos con targets ≥40px, la estrella conmuta, y
   abrir una sección en el drawer deja consistente el estado al volver a desktop.
7. `GET /social/profile/:userId` (perfil público de otro usuario) y `GET /social/search` no
   devuelven `favoriteMenuItems`.
8. El header de «Favoritos» colapsa la sección (chevron rota, `aria-expanded` false, contenido
   recortado) y el colapso **sobrevive un reload** (localStorage) — sin que el acordeón de
   secciones lo abra ni lo cierre nunca.
9. Hover sobre el header de «Favoritos» (400ms) o clic en el `+` abre el popover de sugerencias
   con vistas frecuentes **no fijadas** (telemetría propia, cap 5); clic en una la fija (PUT
   parcial), la sugestión se gradúa del popover y aparece en la sección; el pin **sobrevive un
   reload**. Al vaciarse las sugerencias el popover se cierra solo y el `+` desaparece.

**Negativos** (lo que NO debe pasar):

- El toggle de favorito no pisa `bio`/`interests`/`avatarUrl` (PUT parcial).
- Un payload del PUT con `favoriteMenuItems` inválido (string vacío, >64 chars, >12 items) → 400,
  sin escribir nada.
- La página de perfil existente sigue funcionando con su payload actual (validación permisiva).
- Un favorito cuyo item no es visible (sin permiso, sin retiro, página sin item) no renderiza; el
  route name sigue en el perfil (GET lo devuelve).
- El seed no corre sobre un perfil con `[]` ni reordena favoritos ya guardados.
- Las sugerencias nunca se persisten ni salen del GET propio (no son un campo del perfil público
  ni de la búsqueda de usuarios).

## Fuera de alcance

- Reordenar favoritos (drag & drop): el orden es el del array; moverlos es trabajo futuro.
- Favoritos compartidos por rol/equipo — es preferencia personal (D8).
- Sincronizar el acordeón entre pestañas del mismo navegador (storage events).
- Sembrar favoritos con telemetría **de otros** usuarios o recomendaciones globales: solo el
  historial propio.
- Telemetría nueva: se usa la existente, no se instrumenta nada adicional.
- Estrella en modo rail (D7): se toggla desde la vista expandida.

## Reconcile

(vacío — se cierra al terminar la implementación)
