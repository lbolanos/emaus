# Editor del volante del retiro

Cómo se diseña el volante de un retiro y dónde vive cada pieza.

## Superficies

| Ruta | Qué es |
| --- | --- |
| `/app/retreats/:id/flyer` | El volante, con imprimir / copiar imagen / exportar PDF |
| `/app/retreats/:id/flyer/edit` | El editor: bloques, imágenes, textos y plantillas |

El volante público de la landing (`PublicRetreatFlyerModal.vue`) es **otro** componente y no lee
`flyer_options`: no se ve afectado por nada de esto.

Los volantes de reuniones de comunidad (`apps/web/src/components/flyers/*`) son un sistema
aparte, sin relación con este.

## Anatomía

El lienzo mide 850px de ancho (diseño fijo, se escala para móvil e impresión) y se compone de:

- **Chrome fijo**: `FlyerHeader.vue`, `FlyerBanner.vue`, `FlyerFooter.vue`.
- **Cuerpo**: un grid de tres celdas — `left`, `right` (dos columnas) y `wide` (fila completa) —
  donde se colocan ocho **bloques**: intro, startTime, endTime, location, contact, payment,
  whatToBring, registrationQr.

Cada bloque es un componente "tonto" en `apps/web/src/components/flyer/blocks/` que recibe una
sola prop `content` (ver `useFlyerContent.ts`). Añadir un bloque nuevo son tres pasos:

1. Crear el componente en `blocks/`, con sus colores en `var(--fb-text)` / `var(--fb-heading)`.
2. Registrarlo en `FLYER_BLOCK_COMPONENTS`, darle posición en `FLYER_DEFAULT_LAYOUT` y estilo en
   `FLYER_BLOCK_STYLE_DEFAULTS` (`apps/web/src/components/flyer/blockRegistry.ts`).
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

Cada capa solo pisa los campos que fija, y el resultado son cuatro CSS vars (`--fb-bg`,
`--fb-text`, `--fb-heading`, `--fb-shadow`) que el canvas pone en el envoltorio de cada bloque.

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

Cuatro cosas que evitan errores caros, todas nacidas de usarlo:

- **Deshacer** (`⌘Z` o el botón): cada acción apila el estado anterior, con tope de 30 pasos.
  Cargar o guardar vacía la pila. "Descartar cambios" sigue existiendo para tirarlo todo; deshacer
  es para el bloque que soltaste donde no era.
- **Salir con cambios sin guardar** pregunta, tanto al navegar dentro de la app
  (`onBeforeRouteLeave`) como al cerrar la pestaña (`beforeunload`).
- **Aviso de contraste**: `checkBlockContrast` calcula el ratio WCAG del texto contra lo que tiene
  detrás y marca el bloque en la lista y en su panel. Sin caja no se puede muestrear la foto bajo
  el bloque, así que se compara contra un gris medio: basta para cazar blanco sobre blanco y
  oscuro sobre oscuro, que es lo que la gente se hace.
- **"Ajustar colores a la imagen"**: `averageImageLuminance` mide el brillo medio del fondo en un
  canvas de 32×32 y `themeForBackground` devuelve la paleta que le va. Cambiar la imagen ya no
  obliga a repasar ocho bloques.

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
