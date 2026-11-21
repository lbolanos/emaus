# Editor del volante del retiro

Cómo se diseña el volante de un retiro y dónde vive cada pieza.

## Superficies

| Ruta | Qué es |
| --- | --- |
| `/app/retreats/:id/flyer` | El volante, con imprimir / copiar imagen / exportar PDF |
| `/app/retreats/:id/flyer/edit` | El editor: bloques, imágenes, textos y plantillas |

El volante público de la landing (`PublicRetreatFlyerModal.vue`) es **otro** componente y no lee
`flyer_options`: no se ve afectado por nada de esto. Si `LandingView.vue` no puede cargar el
detalle del retiro, monta el volante con los datos del listado y le pasa `detailFailed`
(`:detail-failed`) para que muestre el aviso de que el detalle no pudo cargarse
(key `retreatFlyer.detailFailed`).

Los volantes de reuniones de comunidad comparten el maquinario de este editor (factory del store,
paneles, layout) bajo su propio flavor: ver
`docs/features/community-meeting-flyer-editor.md`. Los tres estilos legacy de aquél
(Default/Cartel/WhatsApp) siguen siendo un sistema aparte, sin relación con este.

## Anatomía

El lienzo mide 850px de ancho (diseño fijo, se escala para móvil e impresión) y se compone de:

- **Chrome fijo**: `FlyerHeader.vue`, `FlyerBanner.vue`, `FlyerFooter.vue`.
- **Cuerpo**: un grid de tres celdas — `left`, `right` (dos columnas) y `wide` (fila completa) —
  donde se colocan ocho **bloques**: intro, startTime, endTime, location, contact, payment,
  whatToBring, registrationQr.

Cada bloque es un componente "tonto" en `apps/web/src/components/flyer/blocks/` que recibe una
sola prop `content` (ver `useFlyerContent.ts`). Añadir un bloque nuevo son tres pasos:

1. Crear el componente en `blocks/`, marcando cada texto con su clase de rol — `fb-title`,
   `fb-emphasis`, `fb-body` — y su tamaño en `text-[length:calc(Nrem*var(--fb-<rol>-scale,1))]`.
2. Registrarlo en `FLYER_BLOCK_COMPONENTS`, darle posición en `FLYER_DEFAULT_LAYOUT`, estilo en
   `FLYER_BLOCK_STYLE_DEFAULTS` y sus roles en `FLYER_BLOCK_FONT_SLOTS`
   (`apps/web/src/components/flyer/blockRegistry.ts`).
3. Añadir su id a `flyerBlockIdSchema` en `packages/types/src/index.ts` y su nombre a
   `retreatFlyerEditor.blocks.*` en los locales.

Los diseños ya guardados no se rompen: `resolveFlyerLayout` reconcilia lo almacenado contra el
layout por defecto, así que el bloque nuevo aparece en su sitio en vez de faltar.

## Estilo: es un cartel, no una interfaz

Por defecto **ningún bloque tiene caja**: el texto va directo sobre la imagen, con los colores del
volante original — azul en los horarios y el costo, verde en el lugar, texto claro donde el arte se
oscurece abajo, y los chips de icono con sus gradientes de siempre.

Que ninguno la tenga no es un detalle estético: si un bloque llevara velo de fábrica, el panel de
diseño diría "Fondo: Ninguno" mientras el volante enseña una caja, y eso se lee como que el editor
no responde. Las placas blancas que el bloque de costo necesita para su letra pequeña son parte de
su plantilla —como la píldora del precio o los platos de los QR—, no un fondo de bloque.

Esos colores **asumen la posición por defecto de cada bloque sobre el arte por defecto**, que es
donde el diseño original los puso. Si mueves un bloque de texto claro a la mitad pálida, o cambias
la imagen de fondo, va a necesitar su propio color: para eso están el tema y los overrides del
editor, y el velo (`scrim`), que está apagado por defecto igual que en el original.

La cascada de estilo (`apps/web/src/utils/flyerStyle.ts`, puro y con tests):

```
FLYER_BLOCK_STYLE_DEFAULTS  ←  flyer_options.theme  ←  flyer_options.blockStyles[id]
```

Cada capa solo pisa los campos que fija. Las campos planos (`--fb-bg`, `--fb-text`, `--fb-heading`,
`--fb-shadow`) gobiernan caja y herencia; y cada **rol de letra** (`title` / `emphasis` / `body`,
ver `FLYER_BLOCK_FONT_SLOTS`) resuelve además sus propias vars — `--fb-<rol>-font`, `-scale`,
`-color`, `-align`, `-justify`, `-shadow` — desde `flyer_options.fonts.<rol>` con la misma cascada
de tres capas. El editor ofrece por rol: familia (webfonts ya cargadas + mono), tamaño (5–200%),
color, alineación, sombra (Auto/Sí/No) y **velo propio** (fondo solo detrás de las líneas de ese
rol, con radio y aire — resalta la fecha o el precio sin velar el bloque). Las secciones son
**acordeón**: abrir una cierra la anterior, y nacen cerradas.

Lo que cuenta como cada rol está fijado por bloque: **title** es su encabezado («INICIO:»),
**emphasis** su línea estrella (la fecha, el precio, la insignia, los teléfonos, el dominio del
QR), **body** lo de apoyo. Los looks de nacimiento viven en `FLYER_BLOCK_STYLE_DEFAULTS.fonts`
(intro en Playfair, precio en Oswald **y su gris casi negro**, teléfonos y dominio en mono,
nombre de la casa en negro, líneas blancas de los volantes de reunión) — son datos editables, no
clases clavadas. ⚠️ Un color de nacimiento que no era `headingColor`/`textColor` (el precio, el
nombre de la casa, los teléfonos, las fechas de reunión) **debe** ir como default explícito de
`fonts.<rol>.color`: sin él, el slot hereda el color del título y repinta en silencio todos los
volantes guardados. La hora de Inicio viaja en **body** por lo mismo: nació casi negra y un solo
slot no puede sostener dos colores.

⚠️ **Un campo ausente no borra lo que hereda, solo deja pasar la capa de abajo.** Por eso "sin
fondo" se dice con `backgroundOpacity: 0` y no quitando `backgroundColor`: el bloque de costo trae
velo por defecto, y limpiar el color solo destapaba ese velo otra vez. `hasBox` es falso cuando la
opacidad resuelta es 0, así que el bloque pierde también el redondeo y el desenfoque.

Dos reglas que no se pueden cambiar sin romper la impresión:

- **La opacidad se compone en JS a `rgba(...)`**, nunca con `opacity` de CSS: eso atenuaría el
  texto y su sombra junto con la caja, que es justo lo contrario de lo que se busca.
- **Solo `background-color`, nunca `background-image`**, y **`text-shadow`, nunca
  `filter: drop-shadow`** — Chrome descarta el filtro al imprimir.

### Partes que ignoran el tema a propósito

No las "arregles": su color es información, no decoración.

1. Los platos blancos de los dos QR — que se puedan escanear.
2. La píldora del precio en `payment` — el dato más importante, con contraste garantizado.
3. El aviso ámbar de `endTime` ("importante que tu familia asista") — es una advertencia.
4. Los chips verde/azul de `contact` — verde es teléfono y azul es correo.

## Textos: personalizar u ocultar

La pestaña **Textos** del editor lista los quince textos editables del volante. Cada uno tiene dos
cosas distintas:

- **Dejarlo vacío** = usar la redacción por defecto (la del i18n, que se ve como marca de agua).
- **El ojo** = quitarlo del volante. Se guarda en `flyer_options.hiddenTexts`, y el composable
  devuelve `''` para esa clave, así que el `v-if` de la plantilla no dibuja el elemento. Sirve para
  quitar "Retiro Católico", "¡Atrévete, vívelo!" o lo que sobre en un volante concreto.

Ocultar no borra la redacción: si vuelves a mostrarlo, tu texto sigue ahí.

Todos los textos libres se pintan con `whitespace-pre-line`, así que **los saltos de línea que
escribe el coordinador se respetan**. Sin eso, un texto de dos líneas salía en una sola y parecía
que la edición no se había guardado.

**"Qué llevar" acepta las dos formas de escribir una lista**: una línea por ítem (con o sin
viñetas) o todo en una línea separado por comas. Las comas solo separan cuando no hay saltos ni
viñetas — con estructura, un ítem como "Chamarra, sudadera" es legítimo y partirlo inventaría
entradas.

## Mover bloques

Se arrastran **sobre el volante**, no en el panel. `RetreatFlyerCanvas` acepta `editable` (apagado
en la vista publicada, para que el volante no gane `draggable`) y emite `moveBlock` y
`selectBlock`; `FlyerSlotColumn` es la celda que recibe el drop.

El índice de inserción es **el índice del bloque sobre el que estás**, sin geometría: nada de
`getBoundingClientRect`, que devuelve ceros bajo happy-dom y además tendría que compensar el
`transform: scale()` de la vista previa.

## Alineación dentro del bloque

La alineación es **por rol** (`fonts.<rol>.align`), con el `textAlign` plano como capa base para
los tres. Los valores de fábrica son los del volante original — contacto a la derecha,
introducción, costo y QR centrados, el resto a la izquierda.

`text-align` solo mueve las palabras, y hay dos familias de elementos que no se enteran:

- **Cajas inline** (la placa del dominio del QR, la insignia de intro, la píldora del precio):
  `text-align` no mueve una caja inline. Son `block w-fit` con `data-emphasis-box` y se colocan
  por los márgenes automáticos `--fb-emph-ml/mr`, que siguen la alineación del rol **emphasis**.
- **El mobiliario flex** (chips de icono, viñetas, placas): sigue a su dueño vía atributos —
  `data-title-align` mueve la fila del icono (`.fb-lead`), `data-body-align` las filas de lista
  (`.fb-row`). ⚠️ Esas reglas anclan en `[data-flyer-block][data-*-align]`: sin el doble
  atributo, la regla plana de `center` de algunos bloques empata en especificidad y gana por
  orden — el clic no hacía nada.

| marca | qué es | cómo se mueve |
|---|---|---|
| `.fb-lead` | la fila principal: icono y su texto | sigue al título: centrada se apila (icono arriba); a la derecha se invierte |
| `.fb-row` | una fila secundaria: un ítem de lista, la nota de llegada | sigue al cuerpo |
| `.fb-box` / `[data-emphasis-box]` | una caja con ancho máximo | por `--fb-box-ml/mr` (bloque) o `--fb-emph-ml/mr` (destacado) |
| `.fb-stack` | una rejilla de tarjetas (los contactos) | cada celda se ajusta a su contenido con `justify-items` |

Dos trampas que costaron una vuelta:

- **Invertir la fila invierte el eje**: con `flex-direction: row-reverse`, `justify-content:
  flex-end` es el borde **izquierdo**. Las filas alineadas a la derecha justifican a `flex-start`.
- Al apilar, solo el hijo que se llevaba el ancho sobrante (`.flex-1`) pasa a `width: 100%`. Si
  se aplica a todos, el chip del icono se estira de lado a lado.

## En un teléfono

El panel es un pantallazo entero por sí solo, así que con el volante debajo —donde lo dejaba la
rejilla de una columna— ocultar un bloque o cambiar un color no enseñaba nada: el volante estaba
a pantalla y media. Por debajo de `lg` la vista previa va **primero** y **pegada arriba**
(`sticky`), con la altura tope en `42vh` y su propio scroll; de `lg` para arriba vuelve a ser la
columna derecha de siempre.

Dos trampas al hacerlo:

- **El `ref` que mide el ancho va en la caja donde entra el volante**, no en el envoltorio: éste
  lleva `px-4`, y `clientWidth` cuenta el relleno como espacio útil, así que el volante se
  escalaba de más y se salía por la derecha.
- **`overflow-x-hidden`** en esa caja: un elemento escalado conserva su caja de 850px, que sin
  eso asoma como una barra de scroll horizontal bajo la vista previa.

Arrastrar sigue siendo cosa de ratón; en el teléfono se mueve con las flechas de la lista, y el
texto de ayuda nombra las dos formas.

## El panel de Diseño

Dos secciones plegables (`FlyerPanelSection`), independientes entre sí: **Todo el volante** —la
paleta del tema y el velo sobre la foto— y **Bloques** —la lista, y el estilo del que esté
seleccionado—. Los estilos rápidos quedan fuera, siempre visibles: son el primer golpe de vista.

- Arranca con **Bloques abierta** y la paleta plegada: la lista es a la que se vuelve todo el
  rato, el tema se elige una vez.
- Seleccionar un bloque **sobre el volante** despliega Bloques aunque estuviera cerrada; si no,
  el clic no tendría efecto visible.
- El cuerpo va con `v-show`, no `v-if`: plegar una sección no puede perder lo que se esté
  escribiendo dentro, ni el foco.
- La cabecera resume lo que la sección diría abierta —los colores del tema o "Original", cuántos
  bloques están ocultos y el aviso de contraste—, porque plegada es lo único que se ve.

`@repo/ui` no trae Accordion ni Collapsible; es un `<button aria-expanded>` con su `<div>`, que
es todo lo que hace falta.

## Red de seguridad del editor

Cosas que evitan errores caros, todas nacidas de usarlo:

- **Deshacer y rehacer** (`⌘Z` / `⌘⇧Z` o los botones): cada acción apila el estado anterior, con
  tope de 30 pasos; una acción nueva corta el camino de rehacer. Cargar o guardar vacía la pila.
- **Autoguardado de borrador**: cada cambio del draft va a `localStorage`
  (`emaus-flyer-draft-<id>`); si el tab muere sin Guardar, al reabrir el editor el borrador
  vuelve con un aviso ámbar y su «Descartar borrador». Desactivado bajo vitest (filtraba estados
  entre suites).
- **Copiar diseño de…**: trae el `flyer_options` de otro retiro como punto de partida. Lee por
  `getRetreatFlyerOptions` (servicio de API), **no** con `fetchRetreat` del store — ése cambia el
  retiro seleccionado global y la app navega sola.
- **Doble clic sobre un texto del volante** abre la pestaña Textos en ese campo exacto (los
  elementos editables llevan `data-text-override`). El foco aterriza con reintento por frames:
  el input monta cuando el contenido del Tabs lo hace, después del `nextTick`.
- **Salir con cambios sin guardar** pregunta, tanto al navegar dentro de la app
  (`onBeforeRouteLeave`) como al cerrar la pestaña (`beforeunload`).
- **Aviso de contraste**: `checkBlockContrast` compara el color del cuerpo contra un gris medio y
  marca el bloque. **Calle mientras el color sea el de fábrica**: el gris-azul original del QR no
  pasa la línea base teórica aunque sobre el volante real se lea bien — avisar del diseño de
  fábrica enseñaba a ignorar el aviso.
- **"Ajustar colores a la imagen"**: `averageImageLuminance` mide el brillo medio y
  `themeForBackground` devuelve la paleta que le va. **"Colores de la imagen"** (`imagePalette`)
  extrae además los 5 colores dominantes reales (buckets por canal, duplicados colapsados,
  oscuro primero) y los ofrece como swatches en la fila Color de cada rol.
- **Resaltado por rol**: el hover sobre una sección de rol hace brillar en el volante las líneas
  que controla — con alcance: la sección de un bloque brilla solo ese bloque; la de «Todo el
  volante», todos. El store lleva `{ slot, blockId }`.

## Mover y redimensionar bloques

Arrastrar siempre funcionó (sobre el volante, o las flechas de la lista); el bloque
seleccionado ahora muestra un **agarre azul** que lo anuncia. Y el borde derecho trae un
**asa de redimensión**: arrastrar cambia el ancho del bloque (50–100% de su columna, pasos
de 5%, captura de puntero; doble clic restaura 100%). Persiste en `blocks[].width` —
`resolveFlyerLayout` lo respeta y descarta fuera de rango — y un bloque encogido se alinea
por su propia alineación (márgenes auto). Mientras se redimensiona, el drag-and-drop queda
suspendido para que el borde nunca mueva el bloque.

⚠️ `blocks[].width` vive en el schema de `@repo/types`: tras tocarlo en dev hay que reiniciar
el API (`touch apps/api/src/index.ts` — nodemon no mira `packages/*`) o el PUT valida con el
schema viejo y el ancho se pierde en silencio.

## El layout del editor

Vista dividida en escritorio: panel de herramientas y volante **sticky** con alto del viewport y
scroll propio cada uno — bajar a las herramientas de abajo no esconde el volante. Sobre el ajuste
por ancho hay un **zoom manual** (40–100%, `previewZoom`), y el volante vive dentro de una **caja
interna** `overflow-hidden` con alto = alto × escala efectiva: un `transform` no encoge la caja de
layout, así que sin esa caja el panel scrollea espacio vacío aunque el volante ya quepa a la vista.

Los bloques se reordenan arrastrando sobre el volante, que es solo con ratón; las flechas de la
lista del panel hacen lo mismo y llegan por teclado. Al llegar al extremo de una columna, el
bloque cruza a la siguiente.

## Datos

Todo vive en `retreat.flyer_options` (columna `simple-json`), validado por `flyerOptionsSchema`:

```jsonc
{
  "layoutVersion": 2,
  "blocks": [{ "id": "intro", "slot": "left", "order": 0, "visible": true }],
  "images": { "bodyBackground": "https://…/flyer-assets/….webp" },
  "hopeOverride": "Encuentro"        // …y el resto de overrides de texto
}
```

**Nada se migra en su sitio.** Una fila sin `blocks` (v1) se resuelve al layout por defecto
traduciendo `showQrCodesRegistration`/`showQrCodes`; una v2 se reconcilia. La lógica es
`resolveFlyerLayout` en `apps/web/src/utils/flyerLayout.ts`, pura y con tests.

⚠️ **`PUT /retreats/:id` reemplaza la columna entera.** Cualquier pantalla que guarde un retiro
debe conservar lo que no edita:

- El editor arrastra el resto de `flyer_options` en `untouchedOptions` (`flyerEditorStore.ts`).
- `RetreatModal.vue` hace spread del objeto guardado en vez de enumerar campos. Si vuelve a
  enumerarlos, se lleva por delante `blocks` e `images` sin ningún error visible.
- Un campo que no esté declarado en `flyerOptionsSchema` lo descarta Zod en silencio.

## Imágenes

`POST /flyer-assets` (`{ kind, dataUrl }`) procesa y almacena; devuelve `{ url }`.

- Cliente: `resizeImageToDataUrl()` (1600px para fondos, 512px para el logotipo). **Nunca**
  `URL.createObjectURL`: la CSP de producción no permite `blob:`.
- Servidor: `imageService.processFlyerAsset` valida magic bytes, tope de 2MB, y redimensiona con
  `fit: 'inside'` (no recorta, al contrario que los avatares) a WebP q85.
- Almacenamiento: `public-assets/flyer-assets/` vía `s3Service.uploadPublicAsset`. Ese prefijo se
  sirve **sin firma**: los prefijos privados usan URLs presignadas de una hora, que caducarían en
  un volante abierto en una pestaña, exportado a PDF más tarde o compartido como enlace.
- Sin S3 (dev): cae a un data URI inline, con tope de 512KB para no llenar la fila del retiro.

Los presets están en `apps/web/src/components/flyer/flyerPresetAssets.ts` y apuntan a
`apps/web/public/`, así que son same-origin y no tienen problema de CORS con `html-to-image`.

## Plantillas

Tabla `flyer_templates`: una instantánea de `flyer_options` reutilizable en otro retiro.

- `scope: 'personal'` — solo su autor. `scope: 'community'` — cualquier administrador **activo**
  de esa comunidad.
- El alcance lo elige quien guarda, no se deriva: **`retreat` no tiene FK a `community`**, así que
  no hay camino relacional para inferirlo. Mismo enfoque que `message_templates`.
- `scope` y `communityId` son inmutables tras crear la plantilla; re-escoparla cambiaría quién la
  ve.
- API: `GET/POST /flyer-templates`, `PUT/DELETE /flyer-templates/:id`. El permiso de entrada es
  `retreat:update`; quién puede tocar cada plantilla concreta lo decide
  `flyerTemplateService.ts`.
- Aplicar una plantilla **solo copia el diseño**: fechas, costo, contactos y QR siguen siendo los
  del retiro destino.
- El botón del ojo abre una **vista previa con el canvas de verdad**, dibujado con el diseño de la
  plantilla y los datos de este retiro, y desde ahí se puede aplicar. Como aplicar reemplaza el
  diseño entero, aplicar y borrar preguntan antes con el `Dialog` de la app.
- Ese segundo canvas en pantalla **no puede llevar el id `printable-area`** —imprimir, copiar
  imagen y exportar PDF lo buscan—, así que el canvas lo pone solo con `printable` (default
  `true`). Sus estilos cuelgan de la clase `.print-optimized` justamente para que la vista previa
  conserve las fuentes; las reglas de `@media print` siguen ancladas al id.

## La vista publicada tiene que recibir el diseño

`RetreatFlyerView` —la pantalla que se imprime, se copia y se exporta— resuelve
`flyer_options` con `resolveFlyerLayout` y le pasa al canvas `layout`, `imageOverrides`, `theme`
y `blockStyles`, igual que el editor.

No es un detalle: el canvas cae a sus valores de fábrica en cada prop que no recibe, así que una
prop olvidada no se ve como un fallo sino como "este retiro no personalizó nada". Estuvo así
desde M1 hasta que lo cazó una prueba de alineación en el navegador: el editor guardaba y esta
pantalla enseñaba el volante de siempre. Lo cubre `RetreatFlyerView.test.ts` → "Saved design".

## Impresión y exportación

Un volante es un documento de una página, y con bloques que se ocultan y se mueven la altura
cambia en cada configuración. Por eso:

- **Impresión**: la vista calcula `--flyer-print-scale` desde la altura real y el `@media print`
  la usa. Se trunca hacia abajo con 1% de holgura — redondear hacia arriba desborda a una segunda
  página.
- **PDF**: `html-to-image` (`toJpeg`) + `jsPDF`, encajando la imagen por la dimensión que limite y
  centrándola. JPEG y no PNG: el mismo volante pasa de ~15MB a menos de 1MB, que es la diferencia
  entre poder mandarlo por WhatsApp y no.
- **Copiar imagen**: `toBlob` en PNG al portapapeles, que es lo que conviene al pegarlo en un
  documento.

### CORS con las imágenes de S3 — verificado, no hace falta tocar nada

Preocupaba que una imagen cross-origin contaminase el canvas al exportar. No ocurre, y conviene
saber por qué antes de "arreglarlo" algún día:

- `html-to-image` **no** pinta la URL remota en el canvas: hace `fetch(url, fetchRequestInit)`,
  la pasa a blob y la inlinea como data URI (`es/dataurl.js`). Un data URI es same-origin, así
  que el canvas nunca queda contaminado. Cubre tanto los `<img>` como el `background-image` de
  **estilos inline**, que es como el volante pinta el fondo (`es/embed-images.js`).
- El bucket `emaus-media` ya responde `Access-Control-Allow-Origin: *` con `GET` (regla a nivel
  de bucket, aplica a todo objeto). Comprobado el 2026-09-02 con un `fetch(..., { mode: 'cors' })`
  desde el origen real `https://emaus.cc`: 200 y blob leído sin error.

⚠️ **El modo de fallo, si algún día el CORS se rompe, es silencioso.** `resourceToDataURL` captura
el error, hace `console.warn` y devuelve `options.imagePlaceholder || ''`. No hay excepción: el
PDF o la imagen copiada **salen sin esa imagen**. Si alguien reporta "el volante se exporta sin
fondo", mira primero la consola y los headers CORS del bucket, no el código del volante.

## Ayuda para quien lo usa

`apps/web/src/docs/{es,en}/flyer-editor.md`, enlazado en `helpIndex.ts` con
`routeContext: ['retreat-flyer']` — por substring, así que cubre la vista y el editor. Sale por
"Obtener ayuda para esta página". Al cambiar la interfaz, ese texto se actualiza con ella:
describe botones concretos.

## Qué cubre cada test

| Archivo | Qué fija |
|---|---|
| `utils/__tests__/flyerStyle.test.ts` | La cascada de estilo, la opacidad compuesta a rgba, el contraste y la alineación resuelta a cuatro variables |
| `utils/__tests__/flyerLayout.test.ts` | Normalizar v1→v2, descartar bloques inventados y mover uno sin desordenar el resto |
| `composables/__tests__/useFlyerContent.test.ts` | Todo el contenido derivado: el parseo de "qué llevar", los textos ocultos, teléfonos y correos, el coste, las horas, las fechas sin desfase, el saneado del pago y los enlaces |
| `components/flyer/__tests__/RetreatFlyerCanvas.test.ts` | El volante: bloques por hueco, arrastre, variables CSS, el velo, los textos ocultos y las marcas de alineación |
| `components/flyer/__tests__/FlyerDesignPanel.test.ts` | Las secciones plegables, el resumen de la cabecera y que seleccionar un bloque despliegue la suya |
| `components/flyer/__tests__/FlyerStyleFields.test.ts` | Los campos de estilo, incluido el "sin fondo" que se escribe como opacidad 0 |
| `components/flyer/__tests__/FlyerTextPanel.test.ts` | Un campo por texto, los largos con textarea, y ocultar sin perder lo escrito |
| `components/flyer/__tests__/FlyerImagePicker.test.ts` | Elegir preset y subir imagen propia |
| `components/flyer/__tests__/FlyerTemplatePanel.test.ts` | Guardar, alcance, vista previa y las confirmaciones |
| `stores/__tests__/flyerEditorStore.test.ts` | El borrador: qué ensucia, qué guarda, deshacer, aplicar plantilla y **no pisar lo que otras pantallas guardan en `flyer_options`** |
| `views/__tests__/RetreatFlyerView.test.ts` | La vista publicada, incluido que reciba el diseño guardado (§ "Saved design") |
| `views/__tests__/RetreatFlyerEditView.test.ts` | El editor completo: pestañas, arrastre sobre el volante, guardar y avisar al salir |
| `utils/__tests__/imagePalette.test.ts` | La extracción de colores dominantes (buckets, duplicados, transparencias) |
| `tests/e2e/retreat-flyer-editor.spec.ts` | E2E de solo lectura: secciones colapsadas, color/tamaño por rol en el canvas, deshacer/rehacer, doble clic → Textos con foco, alineación de cajas emphasis, paleta de la imagen |
| `api/tests/services/flyerOptionsSchema.simple.test.ts` | Lo que el API acepta y lo que rechaza en `flyer_options` |
| `api/tests/services/flyerTemplateService.test.ts` | Quién puede ver, editar y borrar cada plantilla |
| `api/tests/services/flyerAsset.test.ts` | La subida de imágenes y su recorte a `public-assets/` |
| `api/tests/routes/flyerRoutes.simple.test.ts` | El cableado: sesión, `retreat:update` y validación **antes** del controlador |

Los tests de la vista pública montaban el volante de fábrica, que es exactamente el punto ciego
por el que el diseño guardado nunca llegó a la hoja impresa. Cuando añadas cobertura aquí, pasa
opciones **con** diseño: un flyer por defecto pasa todos los tests que importan y ninguno que
sirva.
