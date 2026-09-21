# Editor del volante de la reunión

Cómo se diseña el volante de una reunión de comunidad: el cuarto estilo "Personalizado", su
editor, y qué comparte con el editor del volante del retiro
(`docs/features/retreat-flyer-editor.md` — leer esa primero; esta documenta las diferencias).

## Superficies

| Ruta | Qué es |
| --- | --- |
| `/app/communities/:id/meetings/:meetingId/flyer` | El volante: 4 estilos (Default, Cartel, WhatsApp, **Personalizado**) + imprimir / copiar imagen |
| `/app/communities/:id/meetings/:meetingId/flyer/edit` | El editor del estilo Personalizado: bloques, imágenes, textos |

Decisiones de producto (cerradas con la organización):

1. **Convive como cuarto estilo.** Default, Cartel y WhatsApp quedan intactos: siguen mandando
   `flyerBackgroundUrl` / `flyerCardOpacity` y no leen nada de `flyerOptions`. El popover Fondo
   se oculta en Personalizado (el fondo pasa a gestionarlo el editor).
2. **El diseño es de la comunidad.** Todo persiste en `community.flyerOptions` y **todas las
   reuniones lo heredan** — coherente con que el fondo ya era identidad de comunidad. La reunión
   aporta sus datos (título, fecha, descripción); el diseño no viaja con ella.
3. **Sin plantillas en v1.** El editor del retiro las tiene; si algún día se piden, el modelo del
   retiro (`flyer_templates`) es el patrón.

## Qué se comparte y qué es nuevo

El editor del retiro se generalizó **por capas**, sin duplicar su maquinario ni parametrizar su
canvas:

| Pieza | Cómo |
|---|---|
| `stores/createFlyerEditorStore.ts` | **Nueva factory**: cada flavor la envule en `defineStore` y decide `resolveLayout`, `textOverrideKeys` y `persist` (el retiro guarda en `retreat.flyer_options`, la reunión en `community.flyerOptions` vía `communityStore.setFlyerOptions`) |
| `utils/flyerLayout.ts` | Núcleo genérico `reconcileStoredBlocks` + `moveBlockInLayout`; `resolveFlyerLayout` (retiro) mantiene su rama v1. `utils/meetingFlyerLayout.ts` envuelve el núcleo **sin rama legacy** |
| `utils/flyerStyle.ts` | `resolveBlockStyle`/`checkBlockContrast` reciben los defaults del flavor como parámetro |
| `components/flyer/editor/Flyer{Design,Text,Image}Panel.vue` | Flavor-agnósticos por props: `tPrefix`, `styleDefaults`, `presets`, `config` (keys/prefijos de textos), `placeholderOverrides`. `FlyerStyleFields` conserva el wording `retreatFlyerEditor.design.*` a propósito: es vocabulario genérico de estilo |
| `components/flyer/FlyerSlotColumn.vue` | Recibe el registry de componentes por prop |
| `packages/types/src/flyer.ts` | Esquemas compartidos extraídos del `index.ts` para que `community.ts` pueda usarlos sin ciclo de imports |
| `MeetingFlyerCanvas.vue`, bloques, header/footer | **Nuevos** — el chrome y el contenido son por definición propios del flavor, como en el retiro |

El bug de la factory que hay que recordar: un parámetro de `applyThemePreset` que se llame igual
que un ref del store (`blockStyles`) lo sombrea en silencio — compila, pasa types y falla solo en
pantalla. El parámetro se llama `presetBlockStyles` y hay un regression guard en
`meetingFlyerEditorStore.test.ts`.

## Anatomía

Canvas de 850px, mismo maquinario de escala/impresión del retiro. **Chrome fijo**:
`MeetingFlyerHeader` (fondo + logo + kicker + el título de la reunión — el título no es un bloque,
igual que el banner del retiro) y `MeetingFlyerFooter`. **Cinco bloques**:

| id | default | contenido |
|---|---|---|
| `dateTime` | left 0 | fecha y hora + duración (si no es anuncio) |
| `description` | left 1 | `flyerTemplate` con variables reemplazadas |
| `location` | right 0 | comunidad + dirección |
| `locationQr` | right 1 | QR a `community.googleMapsUrl` — **plato blanco fijo que ignora el tema** (escaneabilidad) |
| `community` | wide 0 | branding "Comunidad {nombre}" + línea EMAÚS |

La línea "EMAÚS" del header y del bloque `community` se omite si la comunidad ya empieza con
"Emaús" (`/^ema[úu]s\b/i`) — si no, quedaba "EMAÚS — Emaús del Valle". El nombre se muestra con
`titleCaseForDisplay`, que deja conectores cortos en minúscula ("Emaús **del** Valle").

### Defaults de estilo

Sin diseño guardado, el volante lee como el estilo Cartel hermano: **texto claro con sombra
directo sobre la imagen, sin cajas** — los fondos preset son arte oscuro pensado para letra
clara. La tarjeta blanca sigue deletreada en el default (`backgroundColor` blanco con
`backgroundOpacity: 0`, § "Estilo" de la doc del retiro): subir la opacidad del fondo de un
bloque en el panel devuelve la tarjeta translúcida de siempre en un solo movimiento. `locationQr`
mantiene texto oscuro: su plato blanco es su contraste. Y el default visible sigue coincidiendo
con lo que el panel Diseño muestra como "Original" — la lección del retiro (un default que no
coincide con el panel se lee como "el editor no responde").

> Nació al revés: la primera iteración replicó las tarjetas blancas translúcidas del DefaultFlyer
> legacy. El mismo día de cerrarse la feature, pedido del usuario, pasó a cajas transparentes —
> se ve más volante y menos ficha. Ningún diseño guardado se rompió: el cambio toca solo la capa
> más baja de la cascada.

### El header: el nombre de la comunidad lleva `max-w`

El nombre bajo el logo tiene `max-w-[160px]` (en `MeetingFlyerHeader` **y** en el `DefaultFlyer`
— el markup está duplicado a propósito entre ambos estilos). Sin el tope, un nombre largo en
mayúsculas + tracking ancho (`Emaús Santa María de los Reyes Huatlatlauca, Puebla` midió 432px)
estira la columna del logo — que es `flex-shrink-0` y no cede — y estrangula el título en una
franja pegada al borde derecho: el usuario lo reportó como "no hay espacio derecho en el título"
(2026-09-21). Con el tope, un nombre largo envuelve en líneas cortas centradas bajo el logo y el
título recupera su ancho (5 líneas/328px → 2 líneas/600px con esa comunidad). Poster y WhatsApp
no lo necesitan: son layouts centrados donde el nombre no compite con el título.

La columna del título lleva además `pr-4` (mismo par de archivos): era la otra mitad del mismo
reporte. Con solo el `px-8` del header, el título right-aligned quedaba a ~31px del borde, que a
tamaño display lee como "pegado/cortado" — con capturas, el usuario mostró el look deseado con
40–60px de aire. El padding de la columna (no del header) airea kicker y título **juntos** —
siguen flush entre sí — y no cambia el wrap: la línea más larga tenía 42px de slack en su columna
de 600px. Medido en dev: gap 31px → 46–48px en ambos estilos, mismas 2 líneas.

### Presets = receta completa

`MEETING_FLYER_THEME_PRESETS` no es solo el tema: cada preset de reunión viaja con su
`blockStyles` (`meetingPresetBlockStyles(theme)`). Un preset con `backgroundColor` en el tema
(Velos, Tinta) pinta su propio velo sobre todo el lienzo y manda `{}` — los overrides por bloque
siguen siendo del usuario; un preset sin él (**Cartel**) lee el texto directo sobre la foto y
**limpia cualquier caja guardada** en los cuatro bloques que pueden llevarla. El default ya es
sin cajas, pero una comunidad puede haber dejado una caja manual: sin ese paquete, "Cartel"
dejaría una tarjeta blanca bajo su texto blanco. `clearTheme(true)` limpia tema y cajas juntos.

## Semilla del fondo

Al abrir el editor sin diseño guardado, `images.bodyBackground` arranca en
`community.flyerBackgroundUrl` (si existe) — la identidad que la comunidad ya eligió, sin
migración y **sin leer como trabajo sin guardar**: la semilla se inyecta antes del primer
snapshot del undo. Con diseño guardado, manda el `images` del diseño. En la vista publicada,
Cartel/WhatsApp siguen leyendo `flyerBackgroundUrl` directamente.

## Datos

Todo vive en `community.flyerOptions` (columna `simple-json`), validado por
`meetingFlyerOptionsSchema` (`packages/types/src/community.ts`):

```jsonc
{
  "layoutVersion": 2,
  "blocks": [{ "id": "dateTime", "slot": "left", "order": 0, "visible": true }],
  "images": { "bodyBackground": "…", "headerBackground": "…", "footerBackground": "…", "logo": "…" },
  "theme": { "textColor": "#ffffff" },
  "blockStyles": { "dateTime": { "backgroundOpacity": 0 } },
  "hiddenTexts": ["footerTextOverride"],
  "titleOverride": "Convivencia de Adviento"   // …y el resto de los 8 overrides
}
```

- **API**: `PUT` / `DELETE /api/communities/:id/flyer-options` (patrón de
  `flyer-card-opacity`: `requireCommunityAccess` + `validateRequest`). Ambos devuelven la
  comunidad refrescada.
- **La identidad del flyer NO viaja por el PUT genérico de comunidad** (`PUT /api/communities/:id`):
  `updateCommunitySchema` omite `flyerBackgroundUrl`, `flyerCardOpacity` y `flyerOptions`
  (fix de code-review, 2026-09-21). Antes el schema los aceptaba y un community owner podía
  saltarse las garantías de los endpoints dedicados — un `flyerBackgroundUrl` arbitrario (el
  volante público, sin login, lo renderiza como CSS `url(...)` = fuga de IP/UA de quien lo ve)
  o una `flyerCardOpacity` sin el clamp 0.3–1 (`-5` persistía). Zod descarta esas keys en
  silencio; el único llamador del PUT genérico (`CommunityListView`) manda una lista explícita
  de campos sin flyer. Las URLs de storage (S3) quedaron deliberadamente NO restaurables por
  API — mismo cierre.
- `resolveMeetingFlyerLayout` **no tiene rama v1**: honra cualquier `blocks` array sin pedir
  `layoutVersion` (columna nueva, sin legacy), descarta ids duplicados/inventados y rellena
  faltantes en su spot por defecto.
- Mismo riesgo que el retiro: el PUT **reemplaza la columna entera** — el store arrastra el resto
  en `untouchedOptions`, y Zod descarta en silencio cualquier campo no declarado en el schema.

## La vista publicada tiene que recibir el diseño

La lección pagada del retiro, aplicada desde el día uno: `CommunityMeetingFlyerView` en estilo
Personalizado resuelve `flyerOptions` y le pasa al canvas `layout`, `imageOverrides`, `theme` y
`blockStyles`. Una prop olvidada no rompe nada: enseña el volante por defecto y se lee como "esta
comunidad no personalizó". Lo cubre `CommunityMeetingFlyerView.test.ts` (§ "Saved design",
escrito en M3 antes de cerrar la vista) y el e2e.

## Copiar / compartir la imagen

El botón sigue la capacidad de la plataforma, en este orden:

1. **Portapapeles** (desktop): `ClipboardItem.supports('image/png')` + `clipboard.write`. El
   blob se le entrega al `ClipboardItem` como **Promise creada sincrónicamente con el click** —
   los checks de render y la captura corren DENTRO de esa promise, porque un solo `await` previo
   al `write` gasta el user gesture que la escritura necesita (el patrón del volante del retiro).
2. **Share sheet** (teléfonos): iOS Safari no puede escribir imágenes al portapapeles, así que
   el camino primario ahí es `navigator.canShare({ files })` → `navigator.share({ files })` —
   compartir directo a WhatsApp es el caso de uso real del teléfono. El botón lo anuncia: en un
   teléfono dice **"Compartir"** con icono de share, no "Copiar imagen". `AbortError` = el
   usuario cerró el sheet: silencioso.
3. **Descarga** como último recurso en ambos caminos (`flyer-reunion.png`): si el portapapeles
   rechaza o el share falla, la imagen se guarda para adjuntar a mano.

**La captura renderiza el diseño a 1:1** (`isCapturing`, el mismo patrón que `isPrinting`):
`domToBlob` dimensiona su lienzo con el bounding rect del elemento, que arrastra el
`transform: scale(...)` de la escala móvil — capturado escalado, del diseño de 850px solo entra
su esquina (medido con un teléfono emulado: **704×812 en vez de 1700×1963**; reportado como "la
imagen sale cortada a la derecha y abajo", 2026-09-21). Durante la captura el canvas renderiza
sin escala, el contenedor se sostiene a 850px sin padding (a escala ≥ 1 el canvas va fluido y
apilaría el diseño en el ancho del teléfono: medido 704×3822), `overflow-hidden` recorta el
flash y el `ResizeObserver` se pausa para no re-escalar a media captura. En desktop corrige de
paso un recorte sutil que la escala 0.962 dejaba pasar (~4%, imperceptible).

## Impresión

- El canvas reunion reclama `#printable-area` **y** `data-custom-canvas` solo cuando `printable`
  — el preview del editor no compite por el blanco de impresión (el canvas lo expone como prop).
- La regla `@media print` de esta vista ancla por `#printable-area[data-custom-canvas]` para
  ganar a la regla genérica de 210mm de los otros estilos, con una regla extra
  `.absolute { max-width: none }`: esa 210px recortaría el velo del canvas de 850px escalado.
- A4 útil con margen `@page` 5mm — **el de esta página** (el retiro usa 3mm; cada vista define
  el suyo y no se comparten).
- Escala móvil: mismo ResizeObserver del retiro, descontando el padding computado de la caja
  (`getComputedStyle`, no `clientWidth` — que cuenta el relleno como útil). La caja de escala
  debe seguir siendo el primer hijo: `handleCopyImage` copia `firstElementChild`.

## Ayuda para quien lo usa

`apps/web/src/docs/{es,en}/meeting-flyer-editor.md`, enlazado en `helpIndex.ts` con
`routeContext: ['community-meeting-flyer']` — por substring cubre la vista y el editor, igual
que el del retiro.

## Qué cubre cada test

| Archivo | Qué fija |
|---|---|
| `apps/api/src/tests/services/communityFlyerOptionsSchema.simple.test.ts` | Lo que el API acepta y rechaza en `flyerOptions` (ids de bloque de reunión, imagen `javascript:`, tope de overrides) |
| `apps/web/src/utils/__tests__/meetingFlyerLayout.test.ts` | Honrar `blocks` sin `layoutVersion`, descartar ids del retiro/duplicados/inventados, rellenar faltantes, renumerar, y `moveBlockInLayout` con visibilidad preservada |
| `apps/web/src/stores/__tests__/meetingFlyerEditorStore.test.ts` | El borrador: semilla del fondo sin ensuciar, qué ensucia, deshacer, **el regression guard del shadowing de `blockStyles`**, el paquete del preset, preservar campos ajenos en el PUT, y guardar completo con `layoutVersion` 2 |
| `apps/web/src/components/flyers/__tests__/MeetingFlyerCanvas.test.ts` | Bloques por slot y orden, imágenes preset/override, chrome (línea EMAÚS y su omisión), QR, defaults sin caja (texto claro + sombra; `locationQr` oscuro sobre su plato), tema/override por bloque, velo, drag/drop/selección solo con `editable`, e `#printable-area` + `data-custom-canvas` solo con `printable` |
| `apps/web/src/views/__tests__/CommunityMeetingFlyerEditView.test.ts` | El editor: layout por slots, semilla visible, ocultar del preview, drag entre slots, preset ensucia con su receta, descartar, guardar completo, flechas y su cruce de columna, undo, borrar diseño con confirmación, guard de salida, overrides en vivo |
| `apps/web/src/views/__tests__/CommunityMeetingFlyerView.test.ts` | La vista publicada: el 4º botón, **"Saved design"** (el canvas recibe layout/imágenes/tema/cajas guardados — el fixture usa valores que NO son los defaults, o una prop olvidada pasaría), los defaults sin caja sin nada guardado, popover Fondo fuera en custom, los tres estilos legacy intactos, y **el botón copiar/compartir por plataforma** (ClipboardItem con Promise en desktop, share sheet con File en teléfono, AbortError silencioso, rechazo del portapapeles → descarga, y la captura del canvas custom a 1:1 con el contenedor a 850px) |
| `apps/web/src/components/flyer/__tests__/FlyerDesignPanel.test.ts` (describe *meeting flavour*) | El contrato flavor-agnóstico: `tPrefix`, `styleDefaults` (contraste juzgado contra los defaults sin caja) y `presets` con su paquete de cajas |
| `apps/web/src/components/flyer/__tests__/FlyerTextPanel.test.ts` (describe *meeting flavour*) | El contrato de `config`: 8 campos single-line, placeholder dinámico del título y nota de oculto con prefijo propio |
| `apps/web/src/config/__tests__/helpIndex.test.ts` | Que ambas rutas del volante de reunión caen en su sección de ayuda y no en la del retiro |
| `apps/web/tests/e2e/community-meeting-flyer-editor.spec.ts` | El camino real: Personalizado monta los 5 bloques, el editor guarda (flechas + Cartel + ocultar texto + PUT 200) y la vista publicada hereda layout + tema (el velo del Cartel) + textos tras reload, con Default/Cartel/WhatsApp intactos. **Escribe en una comunidad real**: su afterAll restaura SIEMPRE `flyer-options` y el fondo, y borra la reunión desechable |
| `apps/web/tests/e2e/community-meeting-flyer-mobile.spec.ts` | El camino real **en un teléfono** (iPhone 12 inline, skip firefox): el diseño de 850px escala (`transform` < 1) con el contenedor reservando `altura × escala` (±4px) y **cero scroll horizontal** en los 4 estilos; el QR visible tras la escala; y el editor utilizable en móvil — vista previa pegada ARRIBA del panel (la decisión de layout de pantalla chica), flechas, Guardar con PUT 200 y persistencia tras reload. Llegar al editor se afirma por la **barra de título del shell** (`span.truncate.pl-10`): en móvil `AppLayout` oculta el h1 de la página (`mobile-hide-h1`) y sube su texto a la barra fija. Los botones de estilo se clickean **por nombre accesible en 390px**, lo que a la vez guarda el fix de los labels `sr-only sm:not-sr-only` (antes `hidden sm:inline`: botones solo-ícono sin nombre en teléfono). Misma disciplina de comunidad que el hermano |
