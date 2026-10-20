# Tasks: ux-mam-responsabilidades

Cada milestone cierra con sus pruebas verdes. Los commits esperan el OK de Leonardo (en bloque,
al final). Nada a `master` sin su OK. Las desviaciones se anotan bajo su milestone.

## M0 — specs SDD

- [x] `research.md` con capturas a 1280 y 390 sobre el retiro de oct-2026
- [x] `spec.md` con D1-D6 y criterios contra datos que existen
- [x] `plan.md`
- [x] **Gate**: OK de Leonardo a D1-D6 (2026-10-19)

## M1 — Minuto a Minuto: contraer días (D4)

- [x] `views/mamCollapse.ts` + `mamCollapse.test.ts` (12 casos)
- [x] Chevron por día, resumen visible contraído, clase `mam-day-collapsed` + regla de impresión
- [x] Búsqueda y `⏱` abren el día del destino
- [x] "Contraer todos" / "Expandir todos" en `MamMoreActions.vue` + `MamMoreActions.test.ts` (3)
- [x] `MinuteByMinuteCollapse.test.ts` (5)
- Criterios: 1, 2, 3

### Desviaciones 2026-10-19

- **El estado por defecto no se guarda.** Solo se escribe en `localStorage` cuando el coordinador
  toca algo. Así, mientras no elija, cada mañana del retiro abre en el día de ese día; guardar el
  default lo congelaría en el día de la primera visita.
- **La apertura del día vive en `scrollToItem`**, no en cada llamador. Cubre búsqueda, `⏱` y
  también crear o editar una actividad en un día contraído (todos terminan ahí).
- `MamMoreActions` recibe `collapsible` (booleano, apagado por defecto): la instancia que se
  muestra con el Minuto a Minuto vacío no tiene días que contraer.

## M2 — Minuto a Minuto: chips y móvil (D5)

- [x] Chips de día en la barra sticky
- [x] Barra de búsqueda en una línea a 390 px; acciones en la fila de la hora
- [x] `relativeTime` vacío en retiro terminado
- Criterios: 4, 5 (Minuto a Minuto)

### Desviaciones 2026-10-19

- Los chips dicen **"Día 1"**, no "D1": caben a 390 px y no hay que adivinar la abreviatura.
  Uno contraído lleva "▸".
- **"Hace 3d" no se pudo ver desaparecer en el navegador**: el retiro de prueba terminó el
  2026-10-18 y la regla lo quita desde el segundo día después del fin. Lo cubren las pruebas de
  `isRetreatOver`.
- Filas en móvil: de ~150 px a 115 px (medido en el retiro de prueba).

## M3 — Responsabilidades: encabezado y pestañas (D2)

- [x] `⋮` con Crear, Columnas, Exportar, Imprimir (`deferOpen` en Crear e Imprimir)
- [x] Pestañas que bajan a otra línea cuando no caben (ver desviaciones)
- [x] ~~`DropdownMenuRadioGroup`/`RadioItem` en el mock de `@repo/ui`~~ — no hizo falta
- Criterios: 5 (Responsabilidades), 6

### Desviaciones 2026-10-19

- **No hubo que tocar el mock global de `@repo/ui`.** El plan suponía que la prueba de la vista lo
  usaba, pero `ResponsabilitiesBriefing.test.ts` trae su propio mock con `Proxy`, que acepta
  cualquier componente.
- **Las pestañas envuelven, no se desplazan.** Con `overflow-x-auto`, "Por servidor" (la última)
  quedaba fuera de la vista por debajo de ~900 px: Leonardo no la encontró. Medido después del
  cambio: visible a 1440, 1024, 900, 768 y 390 px (en 390, tres líneas de pestañas).
- El `⋮` del encabezado pasó de `ghost` a `outline`: es el único control junto a la búsqueda y
  tiene que verse como botón.

## M4 — API: último envío por tipo de plantilla (D3)

- [x] Controller + ruta con `requireRetreatAccess`
- [x] Pruebas: tipo, último envío, sin cuerpos, 400, 403 (`participantCommunicationLatestByType.test.ts`, 3)
- Criterio: 8

### Desviaciones 2026-10-19

- Además del middleware de la ruta, el handler comprueba el acceso al retiro
  (`callerHasRetreatAccess`), como el resto de ese controller. Es lo que verifica la prueba de
  403.

## M5 — Pestaña "Por servidor" (D1)

- [x] `ServerAssignmentsTab.vue` + `ServerAssignmentsTab.test.ts` (6) — en M8 se volvió `BriefingSendList.vue`
- [x] Mover el popover a la pestaña; recargar la marca al cerrar el `MessageDialog`
- [x] Adaptar `ResponsabilitiesBriefing.test.ts` (11) y `ResponsabilitiesSearch.test.ts` (su mock de la API)
- Criterio: 7

### Desviaciones 2026-10-19

- **Documentos y marcas se cargan con el retiro, no al abrir la pestaña.** Con la carga al abrir,
  la pestaña decía "Por servidor (19)" y al entrar saltaba a 22: los servidores que solo tienen
  momentos del Minuto a Minuto aparecen cuando llegan los documentos.
- **La búsqueda es la del encabezado**, sin un segundo buscador en la pestaña. Filtra por nombre y
  también por responsabilidad. El contador de la pestaña usa la lista completa, como las demás.
- Cada fila lleva además **los nombres de sus responsabilidades**: sin eso la pestaña no
  responde "quién hace qué", que era parte de D1.
- Se quitaron las claves de i18n que solo usaba el popover (`sendTasks.button`, `title`,
  `searchPlaceholder`).

## M6 — Tarjetas con `⋮` (D6)

- [x] Editar, Agregar al equipo, Eliminar en un `⋮` por tarjeta (`deferOpen`)
- Criterio: 9

### Desviaciones 2026-10-19

- Mover tres íconos al `⋮` no bastaba: con los cuatro restantes flotando en `absolute`, el título
  seguía tapado. Título e íconos pasaron a la misma fila (`flex`), y el título envuelve en el
  ancho que queda.

## M7 — Docs y cierre

- [x] Ayuda in-app: `docs/es|en/minute-by-minute.md` y `docs/es|en/responsibilities.md`
- [x] `docs/features/server-assignments-briefing.md`: la pestaña reemplaza al popover
- [x] Verificación con Playwright, 1280 y 390, criterios 1-9
- [x] Traer `master`: no avanzó desde que se abrió la rama; `mam-compact-print` sigue sin fusionar
- [x] Suites, lint, build: lint, field-mapping y build en 0; web 3 405 verdes y 1 roja por el
  entorno del worktree (`runtimeConfig.test.ts` lee el `.env.local` del dev; 4/4 sin él); API 9/9
- [x] Reconcile en `spec.md`

### Desviaciones 2026-10-19

- **La ayuda de Responsabilidades describía botones que ya no existen** ("Abrir y marcar enviado",
  "Abrir WhatsApp"). El diálogo tiene "Enviar Mensaje". Se corrigió al reescribir la sección.

## M8 — Lista genérica de envíos (R14, Parte 2)

- [x] `ServerAssignmentsTab.vue` → `BriefingSendList.vue` (filas con líneas de detalle), textos en `briefingList.*` + `BriefingSendList.test.ts` (7)
- [x] Responsabilidades usa la lista genérica; pruebas adaptadas

## M9 — Mesas: «Enviar info a líderes» y encabezado (D7, D8)

- [x] ~~Pestañas «Mesas · Por líder»~~ → opción del `⋮` que abre un diálogo (cambio de Leonardo, ver desviaciones)
- [x] Marcas `TABLE_LEADER_BRIEFING` cargadas con el retiro y recargadas al cerrar el `MessageDialog`
- [x] `⋮` del encabezado con columnas (solo escritorio); fuera el popover de líderes
- [x] Mocks de `@/services/api` en las pruebas de la vista + `TablesViewLeaders.test.ts` (8)
- Criterios: 10, 12

## M10 — Tarjeta de mesa con `⋮` (D9)

- [x] Enviar info a cada líder, Ver caminantes, Asignar por foto, Eliminar (`deferOpen`)
- [x] `TableCardBriefing.test.ts` (5) y `TableCardRename.test.ts` con el `DropdownMenu` en su mock
- [x] Ayuda in-app de Mesas y `docs/features/table-leader-briefing.md`
- Criterio: 11

### Desviaciones 2026-10-19 (Parte 2)

- **De pestaña a diálogo.** La primera versión eran pestañas «Mesas · Por líder». Al verla,
  Leonardo pidió «en las mesas hazlo como opción que lanza diálogo». Quedó «Enviar info a
  líderes» en el `⋮`. Enviar cierra la lista y abre el mensaje diferido; al cerrar el mensaje
  (enviado o cancelado) la lista vuelve sola. Búsqueda y filtro sobreviven al ida y vuelta y se
  limpian cuando el usuario cierra la lista. Para el filtro, `BriefingSendList` ganó
  `v-model:filter`.
- La búsqueda es propia del diálogo (persona o mesa), no la del encabezado.
- La marca se recarga al cerrar **cualquier** `MessageDialog` de Mesas (también el de un
  caminante desde su ficha): es una consulta chica y evita llevar la cuenta de quién lo abrió.
- Se quitaron las claves `tables.briefing.*` (las usaban solo los popovers).
- `TablesViewLeaders.test.ts` necesitó `enableAutoUnmount`: cada vista montada escucha el
  `MessageDialog` compartido, y las de pruebas anteriores también recargaban las marcas.

