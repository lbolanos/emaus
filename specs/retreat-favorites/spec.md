# Spec: retiros favoritos en el sidebar

> SDD spec — versión 1.1 (2026-10-19). Estado: **implementada** en
> `worktree-retreat-favorites`; Reconcile cerrado abajo (v1.0 = borrador aprobado por Leonardo
> el 2026-10-19, gate de M0).

**Branch**: por crear (worktree `.claude/worktrees/retreat-favorites` al implementar) ·
**Fecha**: 2026-10-19 · **Para**: acceso rápido al retiro de turno desde cualquier dispositivo.

## Problema

El sidebar tiene **un único selector de retiro** (un `Select` dentro del grupo «Retiro»). Con la
lista creciendo (8+ retiros en dev, más en prod), llegar al retiro de turno cuesta abrir el select
y leer etiquetas casi idénticas (`parish - fecha`). El "retiro activo" ya persiste en localStorage
(`selectedRetreatId`), pero **por dispositivo**: el retiro que dejaste elegido en la laptop no
aparece elegido en el celular.

De paso se reparó un bug observado por Leonardo el 2026-10-19: **abrir una sección del sidebar a
veces no cierra las demás**. Causa confirmada (research §2): categorías sin clave en el record de
`sidebar-collapsed-sections` cuentan como abiertas para siempre, porque el toggle solo colapsa
claves presentes y `loadCollapsedState` no siembra las faltantes; y en móvil hay dos instancias del
Sidebar con estado divergente.

## Objetivo

1. Que cualquier usuario pueda **marcar retiros como favoritos** y saltar a ellos **con un clic**
   desde el sidebar, en desktop y celular, y que sus favoritos **lo sigan a cualquier dispositivo**
   (viven en su perfil, no en el navegador).
2. Que el acordeón del sidebar vuelva a ser determinista: **una sola sección abierta a la vez**,
   en ambas instancias (desktop y drawer), con localStorages viejos incluidos.

## Historias de usuario

1. Como coordinador, con el retiro de turno seleccionado, pulso la **estrella** junto al selector
   y queda marcado como favorito; vuelvo a pulsarla y se desmarca.
2. Como coordinador, bajo el selector veo **chips con mis retiros favoritos**; pulso el chip de
   «San Agustín» y ese queda seleccionado (permisos, ruta y conteos se refrescan como si lo
   hubiera elegido en el select), en desktop y en el celular.
3. Como coordinador, marco favoritos en la laptop y al abrir el celular **ya están**: el dato vive
   en mi perfil, no en el navegador.
4. Como cualquier usuario, al abrir una sección del sidebar las demás se cierran — siempre, aunque
   el estado guardado venga de una versión vieja del menú (regresión del bug observado).

## Decisiones de diseño

- **D1 — Persistencia: `user_profiles.favoriteRetreatIds` (`simple-array`, nullable).** Preferencia
  del usuario, no dato social: vive en su perfil y lo sigue a cualquier dispositivo. Precedente de
  `simple-array` en la misma tabla (`interests`/`skills`). Los UUID v4 no llevan comas, así que el
  separador de `simple-array` es seguro. Semántica: `null` = nunca usado, `[]` = sin favoritos
  (quitar el último envía `[]`, nunca `null`).
- **D2 — Una migración SQLite idempotente** (patrón `PRAGMA table_info` + `ALTER TABLE ADD COLUMN`,
  `down` con `DROP COLUMN`, sin `@repo/types` — regla dura de prod).
- **D3 — Reutilizar `GET/PUT /social/profile`.** Sin endpoint nuevo. El PUT parcial es seguro
  (TypeORM salta `undefined`): el toggle manda solo `{ favoriteRetreatIds }` y no pisa bio,
  intereses ni avatar. *Alternativa descartada*: endpoint dedicado
  `PUT /social/profile/favorite-retreats` — un campo más del perfil no merece ruta propia.
- **D4 — Validación zod nueva y permisiva.** Hoy el PUT no valida nada; se agrega
  `UpdateSocialProfileSchema` en `packages/types` con bounds retrocompatibles con la página de
  perfil existente (strings largos, booleans opcionales). `favoriteRetreatIds`:
  `array(uuid).max(100)`. *Alternativa descartada*: validación estricta — rompería la página de
  perfil por un cambio que no es suyo.
- **D5 — Sanitización y privacidad en el service.** Sanitizar antes de guardar: dedupe + cap 100
  ids. Y `favoriteRetreatIds` **no sale hacia otros usuarios**: strip explícito en
  `getPublicProfile` y en `searchUsers` (ambos devuelven hoy el perfil completo — research §4). El
  `GET /social/profile` propio sí lo devuelve.
- **D6 — Store pinia nuevo `favoriteRetreatsStore`** (`load()` tras auth, `toggleFavorite(id)`
  optimista con rollback + toast si falla el PUT). Los chips son el join
  `favoritos ∩ retreatStore.retreats`: **un favorito huérfano** (retiro que ya no está en la lista
  accesible del usuario) **se oculta; el dato queda en el perfil**. La estrella no tiene RBAC: es
  preferencia personal. *Alternativa descartada*: meterlo en `retreatStore` (dominio distinto,
  ciclo de vida distinto) o un `profileStore` completo (sobre-ingeniería para un campo).
- **D7 — Fix del acordeón: el estado migra a `useUIStore` (pinia).** `collapsedSections` +
  `isRetreatGroupCollapsed` pasan a ser estado del store, compartido reactivo por las dos
  instancias del Sidebar (desktop oculta + drawer móvil). `initSidebarAccordion(categories)`
  **siembra toda clave faltante como colapsada** (el fix) y repara >1 abierta; las categorías se
  derivan de `menuSections` (la categoría fantasma `'services'` demuestra por qué no va una lista
  fija). Mismas keys de localStorage (sin migración de datos). `expandedWhenCollapsed` (flyout del
  modo rail) queda local por instancia: es transitorio. Efecto aceptado: una categoría que hoy está
  "abierta por accidente" queda colapsada tras el fix — es el default de instalación nueva.
  *Alternativa descartada*: composable singleton de módulo — más barato pero bifurca la convención
  pinia del repo.
- **D8 — E2E mínimo de Playwright**: regresión del acordeón (abrir A luego B → solo B abierta) +
  flujo de favoritos (estrella → recarga → chip; chip cambia retiro).

## Requerimientos

- **R1** — Migración + columna + entidad: `favoriteRetreatIds` en `user_profiles`, idempotente en
  dev (auto-aplicada al restart) y reversible.
- **R2** — `UpdateSocialProfileSchema` (zod) en `packages/types`, wire con `validateRequest` en el
  `PUT /social/profile`. El GET propio devuelve el campo sin cambios extra.
- **R3** — Service: sanitización (dedupe, cap 100) al guardar; strip del campo en
  `getPublicProfile` y `searchUsers`.
- **R4** — `favoriteRetreatsStore` con load/toggle optimista/rollback+toast; carga una vez por
  sesión tras autenticar; sin RBAC propio.
- **R5** — Estrella junto al selector (`aria-pressed`, tooltip, estado visual ámbar; sin RBAC),
  deshabilitada sin retiro seleccionado; en modo rail queda como icono bajo el header «Retiro».
- **R6** — Chips bajo el selector: solo con favoritos presentes en `retreatStore.retreats`, scroll
  horizontal, target táctil ≥40px, chip activo destacado; un clic selecciona el retiro (mismo
  efecto que el select, incluido el cierre del drawer al navegar); ocultos en modo rail.
- **R7** — Acordeón determinista: a lo sumo una sección abierta; claves faltantes se siembran
  colapsadas; estado compartido entre instancias desktop/drawer; mismas keys de localStorage.
- **R8** — i18n es **y** en para todos los textos nuevos de UI.

## Criterios de aceptación (end-to-end)

Verificados contra la app corriendo en el worktree, con el usuario local de prueba y los retiros de
la dev DB (Buen Despacho, San Miguel Arcángel, Celaya, San Agustín… — research §7):

1. Con un retiro seleccionado, la estrella lo marca; recarga la página y sigue marcado; el chip
   aparece bajo el selector con el nombre del retiro.
2. Un clic en el chip de otro favorito cambia el retiro seleccionado (título de página/ruta y
   conteos del sidebar pasan al retiro nuevo) — mismo comportamiento que elegirlo en el select.
3. Desmarcar con la estrella quita el chip; el PUT manda `favoriteRetreatIds: []` cuando era el
   último (nunca `null`).
4. Favorito cuyo retiro ya no está en la lista accesible: no renderiza chip; el id sigue en el
   perfil (GET lo devuelve).
5. Con localStorage viejo simulado (sin la clave de una sección): esa sección arranca colapsada y
   el acordeón nunca deja dos secciones abiertas (regresión del bug observado).
6. En emulación móvil: drawer abre/cierra, chips con scroll horizontal y targets ≥40px, la estrella
   conmuta, y abrir una sección en el drawer deja consistente el estado al volver a desktop.
7. `GET /social/profile/:userId` (perfil público de otro usuario) y `GET /social/search` no
   devuelven `favoriteRetreatIds`.

**Negativos** (lo que NO debe pasar):

- El toggle de favorito no pisa `bio`/`interests`/`avatarUrl` (PUT parcial).
- Un payload del PUT con `favoriteRetreatIds` inválido (uuid corrupto, >100) → 400, sin escribir
  nada.
- La página de perfil existente sigue funcionando con su payload actual (validación permisiva).
- Sin retiro seleccionado, la estrella no hace nada (deshabilitada) y no hay chips.

## Fuera de alcance

- Ordenar el select ni agruparlo por favoritos (D3: el select no cambia).
- Favoritos compartidos por rol/equipo — es preferencia personal (D6).
- Sincronizar el acordeón entre pestañas del mismo navegador (storage events): fuera de alcance.
- Migrar `selectedRetreatId` de localStorage al perfil (podría ser trabajo futuro si molesta).
- Rediseñar el drawer móvil más allá del estado compartido del acordeón (D7).

## Reconcile

Cerrado el 2026-10-19 contra la app corriendo en el worktree (`worktree-retreat-favorites`,
dev :5175/:3003). Evidencia por criterio; las desviaciones van al final.

1. **✓** Estrella marca, persiste tras recarga y el chip aparece. En vivo (M3): PUT real contra
   el API del worktree; al recargar, los favoritos sembrados por API aparecen como chips. E2E
   (`sidebar-favorites.spec.ts`): tras `page.reload()` los chips vienen del GET del perfil. QA
   móvil: tras recarga completa, estrella y chips idénticos.
2. **✓** Clic en chip cambia el retiro seleccionado con el mismo efecto que el select. En vivo
   (M3): navegó al dashboard del retiro nuevo. QA móvil (M4): chip «Buen Despacho» → ruta
   `e9b3c568…/dashboard`, conteos del retiro nuevo, y el drawer se cerró solo al navegar. E2E:
   `selectedRetreatId` en localStorage y `aria-current` del chip.
3. **✓** Desmarcar quita el chip (E2E: `toHaveCount(1)` tras clic de estrella) y el PUT manda
   `[]` al quitar el último, nunca `null` (unit test del store: PUT con `[]` exacto; el store
   siempre manda array).
4. **✓** (por unit tests) Favorito huérfano: no renderiza chip (test del Sidebar con
   `getUserProfile` devolviendo un id fuera de `retreatStore.retreats` → 1 chip) y el id queda
   en el perfil: el join es solo de render, el store no elimina ids y el PUT manda el array
   completo. No se sembró un huérfano real en vivo — cubierto por tests, no por datos.
5. **✓** localStorage viejo sin clave de una sección: arranca colapsada y nunca quedan dos
   abiertas. Unit tests `ui.test.ts` (siembra de faltantes, reparación >1 dejando la primera,
   invariante ≤1 tras toggles), regresión en `Sidebar.test.ts` con record de 2 claves, y E2E en
   navegador limpio (todas colapsadas al arrancar; abrir la segunda cierra la primera). En vivo
   (M2): record inyectado de 2 claves se sembró a 10.
6. **✓** Móvil (QA M4, 390x844 + touch): drawer abre/cierra; chips de 40px exactos con
   `overflow-x` real (contenido 435px en 240px visibles, scroll verificado); estrella conmuta
   con toggle optimista y persiste tras recarga; tocar PERSONAS cerró ASIGNACIONES. La
   consistencia desktop/drawer se verificó más fuerte que «al volver a desktop»: ambas
   instancias del DOM concuerdan en el mismo instante (`aria-expanded` idéntico por categoría) —
   mismo store pinia (D7). 0 errores/warnings de consola.
7. **✓** (por tests del API) `getPublicProfile` y `searchUsers` no devuelven el campo: tests
   controller/service del M1 (no sale en público) + strip explícito en ambos métodos.

**Negativos**:

- **✓** PUT parcial: el toggle manda solo `{ favoriteRetreatIds }`; el controller hace
  destructure y TypeORM salta `undefined` (tests del service; en vivo, varios toggles seguidos
  no tocaron bio/avatar del perfil de prueba).
- **✓** Payload inválido → 400 sin escribir: test de rutas del M1 (uuid corrupto, >100) vía el
  schema real + wire de `validateRequest`.
- **✓** Página de perfil intacta: schema permisivo con bounds ≥ payloads existentes (gate M1) y
  suite web completa verde (3363 passed, incluye vistas de perfil).
- **✗ → corregido en esta spec** (desviación 1 abajo): sin retiro seleccionado la estrella no
  existe (v-if, no «deshabilitada») y **los chips sí se muestran** si hay favoritos.

**R5/R6 adicionales verificados en vivo (M4)**: estrella rail bajo el header «Retiro» con
`aria-pressed` y toggle funcionando; chips ocultos en rail.

### Desviaciones del cierre

1. **El negativo «sin retiro seleccionado … no hay chips» estaba mal pensado y no se implementó
   así.** Los chips se muestran siempre que haya favoritos accesibles — sin retiro seleccionado
   son precisamente el atajo para elegir uno; ocultarlos empeora el caso de uso que motivó la
   feature. La estrella, en cambio, no se renderiza sin retiro seleccionado (`v-if` en vez de
   botón deshabilitado). El spec se corrige en este Reconcile; no hay cambio de código.
2. **CA4 y CA7 cerrados por tests, no por datos en vivo**: no se sembró un favorito huérfano
   real ni se curioseó el perfil público de otro usuario en la demo — los tests del API y del
   Sidebar cubren ambos caminos.
3. **El e2e corrió solo en `--project=chromium`** (entorno del worktree); los projects móvil del
   config no se corrieron. El QA móvil real se hizo con chrome-devtools (emulación iPhone +
   touch), que ejercita lo mismo que haría el project Mobile Chrome.
4. Screenshots del QA en `apps/web/test-results/mobile-qa/` (gitignored), no en `/tmp/chrome`
   (chrome-devtools MCP no escribe fuera del workspace).
