---
name: printable-documents
description: "Generar documentos imprimibles y PDFs en Emaús: cuándo usar el diálogo del navegador y cuándo generar el PDF con jsPDF (marcadores), la hoja A4 compartida en @repo/utils, y los gotchas ganados a pulso (encabezado por página, imágenes que no cargan, espacios perdidos, fuentes). Triggers — 'generar PDF', 'imprimir documento', 'descargar PDF', 'bookmarks/marcadores en el PDF', 'el PDF se ve plano', 'el encabezado sale abajo', 'exportar a PDF', 'window.print', 'jsPDF', 'puppeteer'."
---

# Documentos imprimibles y PDF en Emaús

Hay **dos rutas** y hacen cosas distintas. Elegir mal cuesta la tarde.

| | Diálogo del navegador | PDF generado con jsPDF |
|---|---|---|
| Cómo | `printMarkdownDocument()` → `window.print()` | `buildPreparationPdf()` → `Blob` |
| Tipografía | **Cambria/Calibri** (el CSS real) | Times/Helvetica (las estándar del PDF) |
| Marcadores (panel lateral) | **imposible** | **sí**, jerárquicos |
| Encabezado repetido por página | no (solo la 1ª hoja) | **sí** |
| Quién produce el archivo | el usuario, desde el diálogo | el código, se descarga solo |
| Coste | 0 | 3.2 kB gzip, carga diferida |

**Regla**: si hace falta el panel de marcadores o un encabezado en todas las páginas → jsPDF. Si lo
que importa es que el papel salga idéntico al diseño CSS → diálogo del navegador. Los documentos de
preparación ofrecen **las dos** con botones separados.

## La hoja A4 vive en `@repo/utils`

`packages/utils/src/printableDocument.ts` — `PRINT_STYLESHEET` + `buildPrintableHtml()`. Está ahí,
y no en `apps/web`, porque el HTML lo consumía también el servidor. Aunque hoy solo lo use el
navegador, **el diseño no debe duplicarse**: dos hojas de estilo divergen en una semana.

El diseño reproduce los `.docx` originales de las preparaciones. Los valores salen de
`word/styles.xml`, no están inventados:

| Elemento | Valor |
|---|---|
| Títulos | Cambria, `#16365C` |
| Cuerpo | Calibri 11pt |
| Rótulos de sección | `#002060`, versalitas |
| Cabecera de tabla | fondo `#4F81BD`, texto blanco |

Para leer el diseño de un `.docx` que haya que replicar:

```bash
unzip -p doc.docx word/styles.xml | grep -oE 'w:styleId="[^"]+"'
unzip -p doc.docx word/document.xml | grep -oE 'w:(color w:val|fill)="[0-9A-Fa-f]{6}"' | sort | uniq -c
unzip -p doc.docx word/theme/theme1.xml | grep -oE '<a:(majorFont|minorFont)>.{0,80}'
```

## Ruta A — diálogo del navegador

`apps/web/src/composables/usePrintableDocument.ts`. Tres cosas que **no** son opcionales:

1. **`<base href>` con el origen.** `window.open('')` abre `about:blank`, que no tiene base URI: sin
   esto las rutas raíz-relativas (`/preparation-assets/...`) no resuelven y el PDF sale sin imágenes.
2. **Esperar a que carguen las `<img>`** antes de `window.print()`, con timeout. Imprimir antes deja
   huecos en blanco.
3. **Ventana nueva, no `@media print` en la página.** Las vistas ya tienen sus propias reglas de
   impresión que ocultan diálogos; una ventana hija da un contexto limpio.

El pie de página lo pinta el navegador con la URL de la ventana — salía `about:blank`. Se arregla
con `history.replaceState` a una ruta legible. **Quitarlo del todo no se puede por CSS**: solo con
`@page { margin: 0 }`, que deja sin margen superior las páginas 2 en adelante.

## Ruta B — PDF con jsPDF

`apps/web/src/utils/markdownToPdf.ts`. `marked.lexer()` da los tokens y se dibuja con la API de
jsPDF. **No usar `doc.html()`**: rasteriza y destroza las tablas.

```ts
doc.outline.add(parent, 'Título', { pageNumber })          // marcadores jerárquicos
doc.setDisplayMode(undefined, undefined, 'UseOutlines')     // que el panel se abra solo
```

Sin `setDisplayMode` el índice existe y nadie lo ve — es el `/PageMode /UseOutlines` del PDF.

- **Encabezado y pie por página**: en una pasada final (`paintChrome`), cuando ya se conoce el total.
- **Tablas**: `jspdf-autotable`, con la cabecera azul del `.docx`.
- **Módulo cargado con `import()` dinámico**: jsPDF solo se descarga al pulsar el botón.

### Por qué NO se genera en el servidor

Se implementó con Chrome headless (`puppeteer-core`) y **se revirtió**. Medido sobre el documento
real de 5 páginas:

| | |
|---|---|
| Pico de Chrome headless | **345 MB** |
| RAM libre en el Lightsail de producción | **~408 MB** (914 totales, API ~116) |

63 MB de margen: un render concurrente con el backup de las 3 AM dispara el OOM killer y se lleva el
API. Para medirlo, filtrar por `--headless` o se cuela el Chrome del escritorio:

```bash
ps -Ao rss,args | grep -- "--headless" | awk '{s+=$1} END {print s/1024 " MB"}'
```

Si algún día hay un servidor con RAM: `page.pdf({ outline: true })` genera el outline desde los
`<h1>`–`<h6>`, pero **Chrome no marca `/PageMode`** — hay que añadirlo aparte (actualización
incremental del catálogo, ver skill personal `pdf-membretado`).

## Cromo opcional de la hoja: logo, firma, interlineado

`PrintableDocumentData` acepta tres cosas además del cuerpo, todas opt-in y apagadas para las
preparaciones (su salida no cambia):

| Campo | Qué hace |
|---|---|
| `logoUrl` | Logo sobre el título, dentro de `header.doc-head`, acotado a 24mm |
| `signature: { intro, label, dateLine? }` | Bloque de firma al pie: hueco, raya y rótulo |
| `relaxedLeading` (opción) | `class="relaxed"` en el `<body>`: interlineado 1.55 en vez de 1.42 |

**Van como cromo y NO dentro del markdown.** Es la lección de la carta al párroco: emitir el logo
como `![](…)` en el cuerpo lo pintaba **dos veces** en el impreso —el del cuerpo cae bajo la regla
global `img { max-height: 105mm }` y se comía media hoja— y además dejaba al usuario borrar la
marca al editar el texto. Un bloque de firma es un formulario, no prosa: lo mismo.

Si añades un elemento así, dale **su propia regla acotada**: la global de `img` permite 105mm, y en
un preview con `prose` de Tailwind hace falta acotarlo otra vez (`.letter-preview :deep(img)`) o el
preview deja de mostrar lo que se va a imprimir.

### El interlineado y el pie se pelean por la hoja: mídelo, no lo elijas

Un documento de una hoja llena más de lo que parece. Medido en la carta al párroco: a interlineado
1.65 la mancha ocupa **252 de los 257mm** útiles de la A4 — quedan 5, y un bloque de firma necesita
~28. Añadir el pie bajó el techo de 1.65 a 1.55, y la línea de fecha (6mm) hubo que apagarla.

El margen es de milímetros y depende de la **suma** de `line-height` + márgenes de `p` + de `h2`,
no solo del interlineado. Así que se barre y se cuenta, en el peor caso de longitud de los datos:

```bash
pdfinfo salida.pdf | grep -i "^Pages"
```

Y ojo con los datos que alargan el texto: `closingChurchName` viene del autocompletado de Google
Places como «Parroquia del Señor del Buen Despacho | Mexico City», y ese sufijo —que sale tres
veces en la carta— hacía imposible la hoja única a cualquier interlineado. Recórtalo en el
adaptador (`cleanChurchName`), no en la plantilla.

## Gotchas ganados a pulso

- **Encabezado repetido**: `position: fixed` **no** sirve; Chrome lo pinta al pie y encima del texto.
  Detalle en `troubleshooting` #19.
- **Espacios en texto con negritas**: partir en palabras pierde si había espacio entre trozos de
  distinto estilo. Cada unidad guarda `spaceBefore`. Detalle en `troubleshooting` #20.
- **Fondos detrás de texto** (citas): hay que **medir antes de pintar** (`measureOnly`), porque el
  rectángulo va debajo. Y si no cabe en lo que queda de página, dejarlo fluir sin fondo: forzarlo
  entero a la hoja siguiente deja medio folio en blanco.
- **`print-color-adjust: exact`** en el CSS, o el navegador descarta los fondos al imprimir y la
  tabla sale en blanco.
- **Backticks dentro de `PRINT_STYLESHEET`**: es un template literal de TS. Un `` `img` `` en un
  comentario CSS **cierra la cadena** y el build muere con «Expected ";" but found img». Pasó dos
  veces en la misma tarea (con `img` y con `relaxedLeading`). No lo ve ningún test: lo caza
  `vue-tsc --noEmit` o `pnpm build`. Escribe los identificadores sin comillas en esos comentarios.
- **Puntos numerados: `1.-`, no `1.`**. `marked` abre una `<ol>` con `\d+[.)]` + espacio y
  **renumera** desde 1, así que dos listas seguidas ("Peticiones previas" / "durante") se pelean.
  Con guion sobrevive como texto plano. Y hace falta una línea en blanco entre puntos, o se juntan
  en un solo párrafo.
- **`markdownToPdf` no dibuja `hr`**: no hay `case 'hr'` para la raya, y un `&nbsp;` sale literal.
  Si necesitas una línea o un hueco en las dos rutas de PDF, va como cromo (ver arriba), no como
  markdown.
- **Fuentes**: jsPDF trae las 14 estándar (Times/Helvetica), que cubren acentos, `—`, `·` y `ª`.
  Embeber los clones libres de Cambria/Calibri (Caladea/Carlito) cuesta **2.7 MB** en base64 porque
  Carlito arrastra cirílico, griego y vietnamita. Si algún día hace falta, subsetear a latín con
  `pyftsubset` los deja en ~60 KB cada uno.
- **Versalitas**: jsPDF no tiene small-caps; se simulan escribiendo carácter a carácter con el
  tamaño reducido en las minúsculas.
- **Imágenes pegadas al texto** (2026-09-07): si el markdown no deja una línea en blanco entre la
  imagen y el párrafo, marked **no** emite un bloque `image` — la mete DENTRO del párrafo (o del
  encabezado, en `## ![](…)`). Un renderizador que solo dibuje el párrafo que es *exclusivamente*
  una imagen las pierde, y en silencio: `flattenInline` descarta el token `image` porque su único
  texto es el `alt`, que suele venir vacío. Hay que partir el bloque en tramos por sus imágenes.
  Se comió 9 de las 13 imágenes de las preparaciones durante tres semanas. Y cubrir los **cuatro**
  tipos de bloque: párrafo, encabezado, ítem de lista y cita — arreglar solo el párrafo deja el
  mismo bug vivo en `- ![](…) texto`, que el editor in-app permite escribir.
- **`fetch` de la imagen, no `<img>`**: jsPDF necesita los bytes, así que el PDF del cliente pide
  cada imagen por HTTP. Un `catch` mudo ahí convierte "el asset no está desplegado" en un PDF sin
  fotos y sin ningún error: dejar al menos un `console.warn`.

## Verificar un PDF

`pdftotext` y `pdfinfo` (poppler) están instalados en esta Mac. **Un render a baja resolución
miente**: a `-r 80` las palabras parecen pegadas aunque el archivo esté bien.

```bash
pdfinfo salida.pdf | grep -iE "pages|page size"        # si la xref estuviera rota, falla aquí
pdftotext salida.pdf - | head -40                      # lo que de verdad dice el archivo
pdftoppm -png -r 100 -f 1 -l 1 salida.pdf pag          # y mirarlo
python3 -c "d=open('salida.pdf','rb').read(); print('/UseOutlines' in str(d))"
```

Para comprobar que los marcadores conservan sus espacios (el bug del BOM que documenta
`pdf-membretado`), decodificar los `/Title`: los que empiezan por `FEFF` son UTF-16BE.

**Contar las imágenes incrustadas** — `grep -c '/Subtype */Image'` sobre el PDF, pero el número
no es la cuenta ingenua y por eso conviene afirmar `>=`, nunca `==`:

- jsPDF **reutiliza un solo XObject** para dos imágenes idénticas. Un test que incruste cuatro
  veces el mismo PNG y espere 4 encuentra 1, y parece un bug del renderizador que no existe.
- Cada PNG con **canal alfa** (colorType 4 o 6) añade un XObject extra como máscara, así que suma
  2 por imagen. `python3 -c "print(open('x.png','rb').read()[25])"` da el colorType.

Para un test determinista: tantos PNG distintos como imágenes, y sin alfa.

## Testing

- `apps/web/src/utils/__tests__/markdownToPdf.test.ts` — composición de texto (`toUnits`) y
  estructura del PDF resultante. El contenido va comprimido, así que se comprueba por marcadores,
  páginas y peso, no por el texto.
- `apps/web/src/composables/__tests__/usePrintableDocument.test.ts` — `<base href>`, escape,
  popup bloqueado.
- `apps/web/src/composables/__tests__/usePreparationPdf.test.ts` — que se use `renderedContent` y
  no la plantilla cruda.
- `apps/web/tests/e2e/preparation-pdf-images.spec.ts` — el botón de verdad, contra el stack de
  dev: los unitarios no ven que las imágenes se piden por HTTP, así que un deploy sin los assets
  daría un PDF sin fotos con toda la suite en verde.

## Archivos clave

| Capa | Archivo |
|---|---|
| Hoja A4 + armado del HTML | `packages/utils/src/printableDocument.ts` |
| Diálogo del navegador | `apps/web/src/composables/usePrintableDocument.ts` |
| PDF con marcadores | `apps/web/src/utils/markdownToPdf.ts` |
| Descarga + errores | `apps/web/src/composables/usePreparationPdf.ts` |
| Consumidores | `RetreatPreparationsView.vue`, `PublicPreparationsView.vue`, `ResponsabilityAttachmentsDialog.vue` |

Feature completa: `docs/features/retreat-preparations.md`.
