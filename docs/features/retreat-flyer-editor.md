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

1. Crear el componente en `blocks/`.
2. Registrarlo en `FLYER_BLOCK_COMPONENTS` y darle una posición en `FLYER_DEFAULT_LAYOUT`
   (`apps/web/src/components/flyer/blockRegistry.ts`).
3. Añadir su id a `flyerBlockIdSchema` en `packages/types/src/index.ts` y su nombre a
   `retreatFlyerEditor.blocks.*` en los locales.

Los diseños ya guardados no se rompen: `resolveFlyerLayout` reconcilia lo almacenado contra el
layout por defecto, así que el bloque nuevo aparece en su sitio en vez de faltar.

> **Las tarjetas llevan fondo propio a propósito.** Los bloques se mueven y el fondo lo elige el
> usuario, así que ninguno puede dar por hecho lo que tiene debajo. Un bloque con texto claro
> "sobre la parte oscura de la foto" es un volante ilegible en cuanto alguien lo mueve.

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
