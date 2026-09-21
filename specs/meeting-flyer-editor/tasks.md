# Tasks: Editor del flyer de reunión

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `specs/meeting-flyer-editor/spec.md`
- [x] `specs/meeting-flyer-editor/research.md`
- [x] `specs/meeting-flyer-editor/plan.md`
- [x] `specs/meeting-flyer-editor/tasks.md`

## M1 — Fundación: schema + entidad + migración + API

- [x] `packages/types/src/flyer.ts` — extraer schemas flyer compartidos de `index.ts`
      (`flyerSlotSchema`, `flyerImagesSchema`, `flyerBlockStyleSchema`, `flyerThemeSchema`,
      `flyerBlockLayoutSchema`, `FLYER_LAYOUT_VERSION`); `index.ts` importa y re-exporta `[P]`
- [x] `packages/types/src/community.ts` — `meetingFlyerBlockIdSchema`,
      `meetingFlyerBlockLayoutSchema`, `meetingFlyerTextKeySchema`, `meetingFlyerOptionsSchema`,
      `communitySchema` += `flyerOptions`, `setCommunityFlyerOptionsSchema`
- [x] `touch apps/api/src/index.ts` tras editar packages/types
- [x] Migración `20260921200000_AddCommunityFlyerOptions.ts` (ADD COLUMN con guarda
      `PRAGMA table_info`, `down` DROP COLUMN)
- [x] `community.entity.ts` — `flyerOptions` simple-json nullable
- [x] Rutas `PUT`/`DELETE /:id/flyer-options` + controller + service (patrón flyer-card-opacity)
- [x] `api.ts` + `communityStore` — `setCommunityFlyerOptions`/`deleteCommunityFlyerOptions`
- [x] Test API `communityFlyerOptionsSchema.simple.test.ts` (18 tests)
- [x] Verificar: `pnpm --filter api build`; migración aplicada **por el dato** (copia DB a /tmp +
      `PRAGMA table_info` + PUT roundtrip); jest; PUT sin sesión → 403, admin ajeno → 403

**Done**: el diseño de una comunidad se guarda y se lee por API, sin tocar nada del retiro.

## M2 — Motor del editor

- [x] Generalizaciones con defaults (gate: suite retiro verde sin editar tests):
  - [x] `flyerStyle.ts` — parámetro `defaults` en `resolveBlockStyle`/`checkBlockContrast` `[P]`
  - [x] `flyerLayout.ts` — `reconcileStoredBlocks<T>` + `moveBlockInLayout` genérico `[P]`
  - [x] `flyerEditorStore.ts` → factory `createFlyerEditorStore(config)`
  - [x] `FlyerSlotColumn.vue` — prop `components` `[P]`
  - [x] `FlyerDesignPanel.vue` — props `tPrefix`/`styleDefaults` `[P]`
  - [x] `FlyerTextPanel.vue` — prop `config` + `placeholderOverrides` `[P]`
  - [x] `FlyerImagePicker.vue` — props `presets`/`tPrefix` `[P]`
- [x] `meetingBlockRegistry.ts` (COMPONENTS, DEFAULT_LAYOUT, STYLE_DEFAULTS, PRESET_IMAGES)
- [x] 5 bloques en `apps/web/src/components/flyers/blocks/MeetingFlyerBlock*.vue` `[P]`
- [x] `MeetingFlyerHeader.vue` + `MeetingFlyerFooter.vue` + `MeetingFlyerCanvas.vue` `[P]`
- [x] `useMeetingFlyerContent.ts` (formatters de `meetingFlyer.ts`, timezone de comunidad)
- [x] `meetingFlyerLayout.ts` — `resolveMeetingFlyerLayout` (sin rama v1)
- [x] `meetingFlyerEditorStore.ts` (factory config comunidad + semilla bodyBackground)
- [x] `CommunityMeetingFlyerEditView.vue` — 3 tabs, Deshacer/Descartar/Guardar/Restaurar,
      guards de salida
- [x] Ruta `community-meeting-flyer-edit` en el router
- [x] i18n `meetingFlyerEditor.*` + `meetingFlyer.*` en es **Y** en
- [x] `apps/web/src/test/setup.ts` — allowlist lucide += íconos nuevos (`Palette`…)
- [x] Verificar: suite del retiro verde sin editar un test; suite web completa; flujo manual en
      dev (mover, tema, guardar, recargar)

**Done**: el editor funciona completo en su ruta, guardando en `community.flyerOptions`.

## M3 — Vista publicada: 4º estilo "Personalizado"

- [x] `flyerStorage.ts` — `VALID_STYLES` += `'custom'`
- [x] Selector: 4º botón "Personalizado" (icono `Palette`)
- [x] Caso `'custom'` renderiza `MeetingFlyerCanvas` con TODAS las props (layout + imágenes +
      theme + blockStyles resueltos) — lección "Saved design"
- [x] Popover "Fondo" excluye `'custom'`; botón "Editar diseño" siempre visible
- [x] Print custom: `--flyer-print-scale` + regla `#printable-area[data-custom-canvas]` que gana
      a la 210mm genérica
- [x] Escala móvil del canvas custom (ResizeObserver, patrón retreat)
- [x] Verificar: impresión de los 4 estilos en una página; copiar imagen con QR; Poster/WhatsApp
      siguen respetando `flyerBackgroundUrl`/`flyerCardOpacity`; test "Saved design" antes de
      cerrar

**Done**: el coordinador elige "Personalizado", ve el diseño de su comunidad y puede entrar al
editor desde ahí; los otros 3 estilos no cambian.

## M4 — Tests + docs + ayuda in-app

- [ ] Unit: `meetingFlyerEditorStore.test.ts` (semilla, dirty, undo, save)
- [ ] Unit: `meetingFlyerLayout.test.ts` (ids inventados, faltantes, mover)
- [ ] Unit: `MeetingFlyerCanvas.test.ts` (slots, draggable, css vars, printable; mock qrcode.vue)
- [ ] Unit: `CommunityMeetingFlyerEditView.test.ts` (tabs, flechas, guardar, salir)
- [ ] Unit: `CommunityMeetingFlyerView.test.ts` — **"Saved design"** + legacy intactos
- [ ] Unit: casos con config de reunión en `FlyerDesignPanel`/`FlyerTextPanel` tests
- [ ] E2E `community-meeting-flyer-editor.spec.ts` (locale es-MX, reunión desechable,
      afterAll restaura `flyer-options` SIEMPRE)
- [ ] Ayuda in-app `apps/web/src/docs/{es,en}/meeting-flyer-editor.md` + `helpIndex.ts`
- [ ] Doc maestra `docs/features/community-meeting-flyer-editor.md` con tabla de cobertura;
      actualizar la referencia en `retreat-flyer-editor.md`
- [ ] Verificar: playwright chromium verde + comunidad restaurada (GET → flyerOptions null);
      helpIndex test verde

**Done**: feature cubierta y documentada; nada rojo.

## Desviaciones respecto al plan

### M1

- Columna física `flyerOptions` (camelCase), no `"flyer_options"` como decía el plan:
  las columnas hermanas de la misma familia (`flyerBackgroundUrl`, `flyerCardOpacity`)
  son camelCase en la tabla y la entity no declara `name:`.
- PUT sin sesión responde **403**, no 401: es el comportamiento de
  `isAuthenticated`+`requireCommunityAccess` (verificado idéntico en la ruta hermana
  `flyer-background`). El plan decía "401" como expectativa, no como requisito del API.
- Los schemas de reunión viven ANTES de `communitySchema` en `community.ts` (TDZ:
  `communitySchema` referencia `meetingFlyerOptionsSchema`), no "junto a
  `FLYER_BACKGROUND_PRESETS`"; solo los write schemas quedaron junto a esa familia.
  `flyerBlockLayoutSchema` se partió en `flyerBlockLayoutBaseSchema` (compartido, sin
  id) + `extend({ id })` en cada flavour — el plan decía "genérico en el id".
- Fix preexistente incluido en la tanda: `CommunityMeetingFlyerView.vue` L390 llamaba
  `setFlyerBackground(id, string)` cuando el store espera `{ imageDataUrl }` — error de
  tipos que ya rompía `pnpm --filter web build` en HEAD (verificado con stash); no lo
  causó M1.
- `FLYER_TEXT_MAX` también se movió a `flyer.ts` (era privado en index.ts y ambos
  flavours lo usan).

### M2

- `FlyerImagePicker` recibió `presetsByKind` (mapa completo por key), no `presets` por
  instancia: el default de una prop de Vue no puede depender de otra prop, y la galería
  de `bodyBackground` de reunión (los 4 fondos de `FLYER_BACKGROUND_PRESETS`) difiere de
  la del retiro aunque el resto de keys compartan galería.
- `FlyerTextPanel` también necesitó `tPrefix` además de `config`: 4 claves propias
  (`texts.hint`, `texts.hiddenNote`, `show`, `hide`) se pintan con el mismo prefijo.
- La factory usa `shallowRef` para `blocks` + firmas `string` en move/toggle/select con un
  único cast interno a `TBlock['id']`: `UnwrapRefSimple` pelea con los genéricos y toda
  mutación reemplaza el array (shallow es suficiente). `RetreatFlyerCanvas` aflojó
  `selectedBlockId`/emits a `string` — solo tipos, sin cambio de comportamiento.
- `MeetingFlyerCanvas` también emite `data-custom-canvas` cuando SÍ es printable — junto con
  el id `#printable-area` que solo la vista publicada puede reclamar (el preview del editor
  no es printable). Es el ancla de la regla de print de M3. [Corregido en M3: esta línea
  decía al revés "cuando NO es printable".]
- `FlyerStyleFields.vue` NO se generalizó: comparte las claves
  `retreatFlyerEditor.design.*` (texto genérico de estilo) — decisión consciente, no se
  duplicaron en `meetingFlyerEditor.*`.
- La vista no replica `FlyerTemplatePanel` (decisión de producto: sin plantillas en v1) y
  añade un botón "Borrar diseño" en la toolbar (DELETE + confirm + toast) que el retiro
  no tiene.
- Verificación M2: vue-tsc limpio; familia retreat 219/219 sin editar tests; suite web
  completa 2944/2944; flujo manual verificado en dev (mover community a columna derecha,
  preset Cartel, override "¡Nos vemos!" → PUT 200; recarga restaura limpio; Borrar diseño
  → DELETE 200 y `flyerOptions` NULL verificado por el dato en copia de la DB).
- Resuelto (era "pendiente de decisión de producto"): preset "Cartel" dejaba texto blanco
  sobre las cajas blancas default. Solución adoptada: **un preset es una receta completa**,
  no solo una paleta — `FlyerThemePreset` ganó `blockStyles?` opcional (ausente = theme-only,
  retiro intacto) y `applyThemePreset(preset, presetBlockStyles?)` hace set-or-clear en un
  solo `pushUndo`. La política del flavor vive en `meetingPresetBlockStyles(theme)`:
  theme con `backgroundColor` (velos) → `{}` (deja de lado los overrides por bloque); sin él
  (cartel/ink/matchBackground) → cajas con `backgroundOpacity: 0` en los 4 bloques con caja.
  La vista reenvía el fallback `blockStyles ?? meetingPresetBlockStyles(theme)` para cubrir
  también "Ajustar colores a la imagen" (que emite solo theme). "Original" →
  `clearTheme(true)`: limpia theme Y blockStyles, las tarjetas vuelven.
- Bug cazado al verificar el fix en dev: un parámetro `blockStyles` en
  `applyThemePreset` sombreaba el ref `blockStyles` del setup — la asignación caía sobre el
  parámetro y el ref (lo que el canvas lee) nunca cambiaba, en silencio para vue-tsc y para
  los tests. Solo visible en el código transformado que sirve Vite
  (`fetch('/src/stores/createFlyerEditorStore.ts')`) o por el dato en runtime. Fix: renombrar
  a `presetBlockStyles` + comentario en el archivo.
- Gate re-corrido tras el rename: vue-tsc limpio; familia retreat 277/277 sin editar tests;
  suite web completa 199 archivos / 2944 pasados | 2 skipped. Verificación manual en dev:
  Cartel → 5 bloques `bg: transparent` + texto `#ffffff` + shadow; Original → cajas
  `rgba(255,255,255,0.85)` + texto `#111827` restauradas; "Ajustar colores a la imagen" →
  mismo reset de cajas vía fallback. Sin PUT/DELETE en la sesión de verificación.

### M3

- La escala móvil descuenta el padding computado del contenedor (`getComputedStyle`
  paddingLeft+Right) en vez de medir una caja interior sin padding como el retiro: un div
  extra como primer hijo del contenedor rompería `handleCopyImage`, que captura
  `firstElementChild` (y ese flujo no se tocó en esta milestone).
- Regla print extra que el plan no preveía: `#printable-area[data-custom-canvas] .absolute
  { max-width: none }` — la regla 210mm genérica para `.absolute` recortaría el velo a
  full-bleed del canvas (850px de diseño sobre un tope de ~793px).
- A4 usable calculada con el margin `@page` de ESTA página (5mm → 200mm×287mm), no los 3mm
  del retreat: esta vista ya tenía su propio `@page` y no se cambió para no mover los otros
  3 estilos.
- El test "Saved design" (que el plan listaba en M4) se adelantó a M3 — el plan mismo exigía
  "test Saved design antes de dar por cerrado" M3 — y creció a 6 tests (canvas printable con
  atributo, defaults sin diseño, diseño guardado, Fondo oculto en custom, navegación al
  editor, legacy sin canvas custom).
- `handlePrint` ahora pasa por `isPrinting` + `nextTick` (el mobile-scale debe apagarse antes
  del render de impresión) + listeners `beforeprint`/`afterprint` para Ctrl/Cmd+P. Para los
  3 estilos legacy es inofensivo: solo alterna un flag que el branch custom lee.
- Verificación M3 por el dato en dev: `--flyer-print-scale: 0.880` servido; escala 0.962 en
  desktop y 0.514 a 390px con altura 478px reservada (sin overflow); flujo editor → Cartel →
  Guardar (PUT 200) → reload → la vista publicada renderiza el diseño guardado (5 bloques
  transparent + texto `#ffffff`); regla print presente en los styleSheets servidos; QR canvas
  190×190; poster legacy usa `/poster.png`. La **impresión física** de los 4 estilos queda
  como verificación manual (`window.print` abre un diálogo que el browser MCP no puede
  cerrar); ídem la copia real al portapapeles (dimensiones del canvas QR verificadas).

