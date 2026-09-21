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

- [x] Unit: `meetingFlyerEditorStore.test.ts` (semilla, dirty, undo, save)
- [x] Unit: `meetingFlyerLayout.test.ts` (ids inventados, faltantes, mover)
- [x] Unit: `MeetingFlyerCanvas.test.ts` (slots, draggable, css vars, printable; mock qrcode.vue)
- [x] Unit: `CommunityMeetingFlyerEditView.test.ts` (tabs, flechas, guardar, salir)
- [x] Unit: `CommunityMeetingFlyerView.test.ts` — **"Saved design"** + legacy intactos
      (escrito en M3, ver desviaciones M3)
- [x] Unit: casos con config de reunión en `FlyerDesignPanel`/`FlyerTextPanel` tests
- [x] E2E `community-meeting-flyer-editor.spec.ts` (locale es-MX, reunión desechable,
      afterAll restaura `flyer-options` SIEMPRE)
- [x] Ayuda in-app `apps/web/src/docs/{es,en}/meeting-flyer-editor.md` + `helpIndex.ts`
- [x] Doc maestra `docs/features/community-meeting-flyer-editor.md` con tabla de cobertura;
      actualizar la referencia en `retreat-flyer-editor.md`
- [x] Verificar: playwright chromium verde + comunidad restaurada (GET → flyerOptions null);
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

### M4

- Los casos de reunión de `FlyerDesignPanel`/`FlyerTextPanel` se añadieron como describes
  "meeting flavour" DENTRO de los archivos de test existentes del retiro, no como archivos
  propios: son el mismo componente, y así el contrato flavor-agnóstico (tPrefix/config/
  styleDefaults/presets) queda fijado junto al del retiro. Ningún test del retreat se editó.
- E2E: el beforeAll también borra `flyer-options` Y `flyer-background` antes de crear la
  reunión desechable — la comunidad de dev venía con un diseño guardado de la verificación M3 y
  un fondo residual volvería no-determinista el assert de "distribución por defecto" y el fondo
  preset de Cartel. Ambos DELETE son idempotentes y el afterAll restaura exactamente igual.
- E2E, dos hallazgos del camino real: el "Volver al volante" de la toolbar llega al árbol de
  accesibilidad como **link** (Button `as-child` sobre router-link), no como button; y la caja
  apagada del look Cartel se resuelve a `--fb-bg: transparent` en el style inline (la opacidad
  0 nunca llega como `rgba(...,0)`), consistente con el bloque `locationQr` del unit test.
- helpIndex: la sección nueva (`routeContext: ['community-meeting-flyer']`, substring cubre
  vista y editor) más un test que fija que ambas rutas caen en SU sección y no en la del retiro
  (la substring "flyer" del retreat solo matchea `retreat-flyer*`; verificado sin colisión).
- La doc maestra se escribió como "diferencias sobre la del retiro" (la referencia se lee
  primero), no como pieza autocontenida — el maquinario compartido ya está documentado ahí.
- Gate final: suite web completa 204 archivos / 3029 pasados (+79) | 2 skipped, sin editar
  tests del retreat; e2e chromium 3/3; helpIndex 33/33; restauración verificada por el dato en
  copia de la DB (`flyerOptions` NULL, `flyerBackgroundUrl` NULL, 0 reuniones ZZE2E) — esto
  además dejó la comunidad de dev limpia del diseño que había dejado la verificación M3.

### Post-M4 — defaults sin caja (mismo día, pedido del usuario)

- `MEETING_FLYER_BLOCK_STYLE_DEFAULTS` pasó de tarjetas blancas translúcidas (texto `#111827`,
  heading `#6b7280`) a **sin caja con texto claro directo sobre la imagen**: tarjeta aún
  deletreada (`backgroundColor '#ffffff'` con `backgroundOpacity: 0`), `textColor '#ffffff'`,
  `headingColor '#fde68a'`, `textShadow: true` — el look del estilo Cartel hermano, para el que
  está pensado el arte de los fondos preset. `locationQr` no cambió (texto oscuro: su plato
  blanco es su contraste). Ningún diseño guardado se rompe: toca solo la capa más baja de la
  cascada, y subir la opacidad del fondo de un bloque devuelve la tarjeta de siempre.
- `meetingPresetBlockStyles` se conserva como reset defensivo, con el matiz invertido: ya no
  apaga "las cajas default" (ya no las hay) sino cualquier caja GUARDADA por la comunidad.
- Tests ajustados (solo reunión): Canvas (defaults sin caja + QR oscuro), DesignPanel meeting
  flavour (contraste: el default sin caja no avisa contra el gris medio; caja blanca + texto
  blanco sí avisa), View (**"Saved design" reforzado**: el fixture viejo —texto blanco + caja
  0— quedó indistinguible del default; usa ahora colores/caja que NO son defaults, o una prop
  olvidada volvería a pasar en silencio), EditView (comentario del preset).
- E2E: `--fb-bg: transparent` + `--fb-text: #ffffff` dejó de distinguir el diseño guardado del
  default → el assert pasó al velo del Cartel (`background-color: rgba(0, 0, 0, 0.4)`, el único
  background negro inline del canvas; los demás rgba oscuros viven en CSS scoped).
- Ayuda es/en y doc maestra actualizadas (§ "Defaults de estilo" reescrita; § presets ahora
  "limpia cajas guardadas").

### E2E móvil + fix a11y de labels (mismo día, pedido del usuario)

- Spec `community-meeting-flyer-mobile.spec.ts` (iPhone 12 inline al estilo
  `server-registration-mobile`, skip firefox): escala del diseño de 850px con altura reservada
  (`altura × escala` ±4px) y **cero overflow horizontal** en los 4 estilos; QR visible tras la
  escala; editor en móvil (vista previa ARRIBA del panel, flechas, Guardar PUT 200, persistencia
  tras reload). Misma disciplina de comunidad que el hermano (afterAll restaura SIEMPRE).
- Hallazgo 1 — a11y real cazado por el spec: los 8 labels `hidden sm:inline` de la vista
  publicada (4 estilos, Fondo, Volver, Imprimir, Copiar) dejaban botones **solo-ícono sin nombre
  accesible** en teléfono. Fix: `sr-only sm:not-sr-only` (nombre accesible siempre, visual
  igual). El spec clickea los estilos por nombre en 390px, que es el guard.
- Hallazgo 2 — el assert de llegada al editor usa la **barra de título del shell**
  (`span.truncate.pl-10`): en móvil `AppLayout` oculta el h1 de la página (`mobile-hide-h1`) y
  sube su texto a la barra fija, así que `getByRole('heading')` no existe en 390px (el hermano
  desktop sí lo usa y sigue verde).
- Gate: móvil 3/3, hermano desktop 3/3 (regresión de los spans), View unit 6/6; restauración
  verificada por el dato en copia de la DB (`flyerOptions` NULL, fondo NULL, 0 reuniones ZZE2E).

### Bugs reportados por el usuario con capturas (mismo día, segunda tanda)

Dos reportes con foto del teléfono y del desktop; ambos verificados por el dato en runtime
antes de tocar código.

- **"En desk no hay espacio derecho en título"** — el título NO desbordaba: el padding `px-8`
  del header se respetaba (gap medido 31.7px, línea por línea). Lo que pasaba: el nombre de la
  comunidad bajo el logo (`text-[11px] uppercase tracking-[0.2em]`, sin `max-width`) medía
  432px con "Emaús Santa María de los Reyes Huatlatlauca, Puebla" y, siendo su columna
  `flex-shrink-0`, se comía el header y estrangulaba el título en una franja de 328px contra el
  margen derecho (envolvía en 5 líneas). Fix: `max-w-[160px]` en el `<p>` del nombre, en
  `MeetingFlyerHeader.vue` **y** `DefaultFlyer.vue` (mismo markup duplicado) — el nombre largo
  envuelve en líneas cortas centradas bajo el logo y el título pasa a 2 líneas/600px. Poster y
  WhatsApp no lo necesitan (layouts centrados). Verificado en dev con la reunión real de
  Huatlatlauca en los dos estilos, midiendo logoCol/título/gap tras reload (sin el style inline
  del preview).
- **Re-apertura del bug del título (mismo día, con capturas #5/#6)**: "aún no deja espacio a la
  derecha". Las capturas confirmaron que el max-w SÍ funcionaba (nombre en 4 líneas cortas,
  título en 2 — el usuario veía dev, no prod), pero la queja literal siempre fue el margen: el
  título right-aligned quedaba a ~31px del borde (el `px-8`), que a tamaño display lee como
  pegado; el look deseado mostraba 40–60px. Sin clipping real (header sin overflow, verificado).
  Fix: `pr-4` en la columna del título (`MeetingFlyerHeader` **y** `DefaultFlyer`) — kicker y
  título ganan aire juntos sin cambiar el wrap (la línea más larga tenía 42px de slack).
  Verificado por el dato en dev en ambos estilos: gap 31.2 → 46.6px (custom) y 48.5px (default),
  mismas 2 líneas, sin overflow. Gate: familia flyer 100/100 + View 10/10.
- **"La copia no funciona en celular"** — `handleCopyImage` hacía `await domToBlob(...)` ANTES
  de `navigator.clipboard.write([...])`: en iOS Safari el user gesture se gasta con el primer
  await Y además iOS no soporta escribir `image/png` al portapapeles → siempre fallaba.
  Reescritura por capacidad de plataforma: desktop → clipboard con el blob como **Promise dentro
  del ClipboardItem** (checks de render y captura corren DENTRO de la promise; patrón del
  retreat); teléfono → `canShare({files})` + `navigator.share` (share sheet, el caso de uso
  real es compartir a WhatsApp; el botón dice "Compartir" con icono Share2 allí, decidido en
  `onMounted`); `AbortError` del share = cancelado silencioso; **descarga** del PNG como último
  recurso en ambos caminos. El retiro NO se tocó (no reportado; su camino clipboard+download ya
  funciona en desktop).
- Tests: describe nuevo en `CommunityMeetingFlyerView.test.ts` (4 tests: Promise al
  ClipboardItem en desktop, rechazo del clipboard → descarga con `download="flyer-reunion.png"`,
  share sheet con File en teléfono + label "Compartir", AbortError sin descarga). Dos lecciones
  de happy-dom en el camino: `vi.restoreAllMocks()` en el afterEach restauraba TAMBIÉN los
  mocks globales del setup (mató el ResizeObserver mid-mount → restauración manual por spy) y
  las `<img>` de happy-dom nunca quedan `complete` (la espera de imágenes colgaba el handler
  para siempre → own property `complete` en las imgs del fixture).
- Gate: View unit 10/10; familia flyers 126/126; suite web completa 204 archivos / 3034 pasados
  | 2 skipped; e2e móvil 3/3; e2e hermano desktop 3/3; restauración por el dato (`flyerOptions`
  NULL, fondo NULL, 0 reuniones ZZE2E). La verificación física en un teléfono real (share sheet
  de iOS) queda como prueba manual del usuario.

### Tercer reporte: "al copiar en celular la imagen sale cortada" (mismo día, captura #7)

- **PNG truncado a la derecha y abajo** — `domToBlob` dimensiona su lienzo con el bounding
  rect del elemento, que arrastra el `transform: scale(0.414)` de la escala móvil: del diseño
  de 850px solo entra la esquina escalada. Reproducido por el dato con emulación 390×844 e
  interceptando el blob por el camino real del botón: **704×812** en vez de 1700×1963. Primer
  intento (quitar solo el transform) medido **704×3822**: a escala ≥ 1 el canvas va fluido
  (`width: 100%` = 352px) y el diseño se apila — mi experimento manual había funcionado porque
  borró el transform CONSERVANDO el `width: 850px` inline que el camino real del componente no
  conservaba. Opciones descartadas por el dato: `style: { transform: 'none' }` en las options
  de domToBlob (704×812) y transform en ancestro (gBCR hereda transforms de cualquier nivel).
- Fix (patrón `isPrinting` extendido): `isCapturing` → `effectiveScale 1` durante la captura,
  contenedor sostenido a 850px sin padding, `overflow-hidden` para el flash, y guard en
  `updateCustomScale` (el ResizeObserver no re-escala a media captura). De paso, en desktop la
  escala 0.962 también truncaba ~4% (imperceptible) — ahora la copia sale a 850px reales.
- Verificado por el dato: blob **1700×1963**, transform restaurado a `scale(0.414118)` tras la
  captura y contenedor fluid de nuevo; análisis visual del PNG generado: título entero, todas
  las secciones hasta el footer, sin cortes. Test nuevo en el describe de copiar/compartir
  (fija `transformAtCapture === ['']` y `containerWidthAtCapture === ['850px']`, y el
  downscale de vuelta al terminar).
- Gate: View unit 11/11; familia (flyers + stores + utils + View) 56 archivos / 965; suite web
  completa 204 archivos / 3035 pasados | 2 skipped; e2e móvil 3/3. La verificación física en
  un teléfono real (share sheet → WhatsApp) queda como prueba manual del usuario.


