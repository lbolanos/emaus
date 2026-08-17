# Preparaciones semanales pre-retiro

**Reuniones semanales del equipo de servidores** antes del retiro (número variable, 1–12;
típico 7–9). Cada reunión trabaja una charla con un objetivo específico (Servicio, Conocerte
a ti mismo, Sanación y Perdón, Familia y Amigos, Palabra y Oración, La Confianza, El Amor del
Padre) para que el equipo llegue preparado a darlas. **No son para los caminantes** — son la
formación del equipo que servirá el retiro. Cada reunión lleva el documento de su charla, y hay
una **vista pública sin auth** (calendario y archivos públicos) para compartir con los servidores.

## Modelo

- `retreat_preparation`: entrada del calendario por retiro.
  - `type = 'session'`: preparación semanal (`weekNumber`, `title`, `date` YYYY-MM-DD, `time` HH:MM local).
  - `type = 'break'`: festivo — fecha saltada, solo informativa.
- `retreat_preparation_document`: documentos por sesión, modelo dual como los docs de responsabilidades:
  - `kind = 'file'`: archivo en S3 bajo `public-assets/preparations/{retreatId}/…` (URL pública directa,
    sin cambios de IAM). Fallback inline data-url ≤1MB si no hay S3.
  - `kind = 'markdown'`: texto editable in-app (`content`), renderizado con `marked` + DOMPurify.
    `content` guarda **siempre la plantilla cruda**; la lectura expone además `renderedContent`
    (ver *Plantillas* abajo).
- Migración: `20260708120000_CreateRetreatPreparations.ts` (+ permisos `retreatPreparation:read/manage`,
  matriz de roles espejo de `preRetreatTask`).

## Comportamiento

- **Al crear un retiro** se genera automáticamente el calendario por defecto: 7 sesiones semanales
  que terminan una semana antes de `startDate`, a las 20:00 (`retreatService.createRetreat` paso 6.6),
  **con los documentos por defecto de cada semana ya adjuntos**.
- **Documentos por defecto** (serie "Emaús hombres IX", la única completa 1ª–7ª): son **plantillas
  markdown** (`semanaN-*.md`) en `apps/api/src/data/preparation-docs/`, con manifest en
  `apps/api/src/data/preparationDocSeeder.ts`. `generate({ includeDefaultDocs: true })` adjunta a
  cada semana su copia como `kind: 'markdown'`; la semana 5 lleva dos (charla + dinámica de
  oración). El checkbox del diálogo "Configurar y crear" viene marcado por defecto. Si el folder de
  assets no está en el deploy, el calendario se genera igual sin documentos (degradación silenciosa
  con warn).
  - Las imágenes de los documentos viven en `apps/web/public/preparation-assets/<slug>/` y se
    referencian por ruta raíz-relativa: así el texto se copia barato a cada retiro sin duplicar
    ~1.3MB de binarios por retiro.
  - Los `.docx` originales siguen versionados al lado como referencia, y se pueden adjuntar como
    descarga opcional con `includeOriginalDocx` (apagado por defecto).
- Retiros existentes: botón **"Configurar y crear"** en la vista admin (semanas, fecha de la primera,
  hora; preview de fechas; `clearExisting` para reemplazar).
- **Saltar por festivo** (`POST /:id/skip`): registra un `break` en la fecha original y **adelanta
  −7 días esa sesión y todas las anteriores**. Las posteriores no se mueven: la fecha del retiro es
  fija, así que el final del calendario queda anclado y la **primera preparación toma una fecha
  anterior**. Los breaks existentes no se mueven.
- Todo es editable inline (título, fecha, hora) y se pueden agregar entradas manuales.
- Vista pública `/preparaciones/:slug` (requiere `retreat.slug` + `retreat.isPublic`, mismo gate que
  Santísimo): calendario completo + tarjeta **"Próxima preparación"** con botón de descarga directa
  del documento de la siguiente sesión.

## Plantillas: variables que se resuelven al vuelo

Los documentos por defecto traían **quemadas dentro del `.docx`** las fechas del retiro del que
se copiaron (tabla de 8 filas con fechas incoherentes, "Retiro Polanco III", "cupo de 30
caminantes"), así que cada retiro nuevo recibía el calendario de otro. Ahora son plantillas:

| Variable | Sale de |
|---|---|
| `{preparations.table}` | las filas de `retreat_preparation` de ese retiro, como tabla markdown |
| `{preparations.count}` / `{preparations.firstDate}` / `{preparations.lastDate}` | ídem |
| `{retreat.parish}`, `{retreat.startDate}`, `{retreat.maxWalkers}`, `{retreat.serverArrivalTimeFriday}` | el retiro |

Reglas:

- **`content` nunca se congela.** Se guarda con los `{...}` crudos; `listForRetreat`/`get`/
  `getPublicBySlug` devuelven además `renderedContent` con todo resuelto. Mover una fecha o saltar
  un festivo actualiza el documento solo, sin regenerarlo.
- **El editor admin edita `content`; el lector y el PDF usan `renderedContent`.** Confundirlos hace
  que el coordinador guarde las fechas como texto fijo y se pierda la plantilla.
- El motor vive en `packages/utils/src/index.ts` (scope `preparations.*`, molde de `table.*`) y es
  isomórfico: el mismo código alimenta el API y el preview en vivo del editor.
- `preparations.*` **no está en el picker** de `BaseMessageTemplateModal`: `{preparations.table}` es
  un bloque de tabla, no un escalar, y no tendría cómo resolverse en un WhatsApp.

## PDF con panel de marcadores (generado en el navegador)

El botón **"Descargar PDF"** arma el archivo con jsPDF **en la máquina del usuario**
(`apps/web/src/utils/markdownToPdf.ts`) y lo baja con el panel de marcadores desplegado.

### Por qué en el cliente y no en el servidor

Primero se implementó con Chrome headless en el API. Medido sobre el documento real:

| | |
|---|---|
| Pico de Chrome headless (5 páginas) | **345 MB** |
| RAM libre en el Lightsail de producción | **~408 MB** (914 MB totales, API ~116 MB) |

Con 63 MB de margen, cualquier render concurrente con el backup de las 3 AM o el watchdog
dispara el OOM killer y se lleva el API. Se descartó y **se revirtió**: nada de puppeteer ni de
instalar Chrome en el servidor. jsPDF ya estaba en el bundle (lo usan el flyer y los guiones de
responsabilidades) y su API `outline` produce marcadores reales, así que el coste lo paga el
navegador del usuario y el servidor no se entera.

### Cómo está hecho

- `marked.lexer()` da los tokens y se dibuja con la API de jsPDF (no `doc.html()`, que rasteriza
  mal las tablas). El módulo entra por `import()` dinámico: solo lo descarga quien pulsa el botón.
- **Marcadores**: `doc.outline.add(parent, título, { pageNumber })` con un padre por nivel, para
  que los `h3` cuelguen del `h2` que los precede. jsPDF los escribe en UTF-16BE **con BOM**, así
  que los acentos y los espacios sobreviven (el bug que documenta el skill `pdf-membretado`).
- **El panel se abre solo** con `doc.setDisplayMode(undefined, undefined, 'UseOutlines')`, que es
  el `/PageMode /UseOutlines` del PDF. Sin eso el índice existe y nadie lo ve.
- **Encabezado y pie en todas las páginas** (`paintChrome`), en una pasada final cuando ya se sabe
  el total de páginas.
- **Tablas** con `jspdf-autotable`, con la cabecera azul del .docx y filas alternas.
- **Fuentes**: las estándar del PDF (Times para títulos, Helvetica para el cuerpo) en vez de
  Cambria/Calibri. Embeber los clones libres (Caladea/Carlito) costaba **2.7 MB** en base64 porque
  Carlito trae cirílico, griego y vietnamita. Las estándar cubren acentos, `—`, `·` y `ª`.

### Detalles del renderizado que costaron

- **Espacios entre trozos con distinto estilo**: al partir el texto en palabras se pierde si había
  espacio, y `**SERVIR**?` salía como `SERVIR ?`. Cada unidad lleva un `spaceBefore` que lo
  conserva.
- **Citas**: se mide el alto con `measureOnly` ANTES de pintar, porque el fondo va debajo del
  texto. Si no cabe en lo que queda de página se deja fluir sin fondo — forzarla entera a la hoja
  siguiente dejaba medio folio en blanco.
- **Rótulos** (`Tema:`, `Objetivo:`): sangría francesa con el rótulo en su columna, como el .docx.
  Se detectan por longitud (≤24) y por acabar en dos puntos: un párrafo entero en negrita no es un
  rótulo y no debe sangrarse.

## Impresión a PDF (desde el navegador)

`printMarkdownDocument()` (`apps/web/src/composables/usePrintableDocument.ts`) abre una ventana con
la hoja A4 compartida (`PRINT_STYLESHEET`) y dispara `window.print()`; el usuario elige "Guardar
como PDF". Compartido con `ResponsabilityAttachmentsDialog.vue`. Dos detalles que costaron:

- **`<base href>` obligatorio**: `window.open('')` abre `about:blank` sin base URI, y sin él las
  rutas `/preparation-assets/…` no resuelven → PDF sin imágenes.
- **Esperar a que carguen las `<img>`** antes de `print()` (con timeout de 3s), o las páginas salen
  con huecos.

## Retiros creados antes de las plantillas

Botón **"Actualizar documentos por defecto"** en la vista admin →
`POST /retreats/:retreatId/resync-default-docs`. Reemplaza los `.docx` de fábrica por sus
plantillas haciendo match por `fileName` **exacto** contra `legacyFileName`: si el coordinador
renombró el archivo o subió otro, no se toca. Conserva el `.docx` salvo que se marque
`removeLegacy`. Es idempotente. **No hay migración de datos** a propósito — el contenido pudo
haberse editado a mano.


## Lecciones aprendidas (2026-08-17)

Lo que costó descubrir, para no repetirlo.

**El bug de origen no estaba en el código, estaba en un binario.** Las fechas de "Polanco III"
vivían dentro de un `.docx` versionado, así que ningún test, lint ni revisión de código las iba a
encontrar jamás. Cuando un dato de negocio se guarda en un formato opaco, deja de estar sujeto a
revisión. De ahí el guard `preparationTemplateAssets.simple.test.ts`: ahora las plantillas son texto
y una fecha literal rompe la suite.

**Convertir el .docx fue más barato de lo que parecía.** `zipfile` + `xml.etree` de la stdlib de
Python bastó (cobertura del 95–100% verificada contra el original por solapamiento de palabras). No
hizo falta instalar pandoc. Lo que sí hubo que hacer a mano fue la pasada editorial: estos `.docx`
no usan estilos de encabezado, los rótulos son negrita inline.

**Las imágenes "perdidas" en la conversión eran logos de header/footer.** Antes de dar por buena una
pérdida de datos, mirar `word/_rels/*.rels`: `pdfimages`/`unzip -l` cuentan también las imágenes que
no son contenido.

**Medir antes de decidir la arquitectura.** El PDF con marcadores se implementó primero en el
servidor con Chrome headless. Funcionaba. Pero el pico real medido —345 MB frente a 408 MB
libres— lo hacía inviable en producción, y hubo que revertirlo entero. **La medición debió ir
primero**: `ps -Ao rss,args | grep -- "--headless"` cuesta un minuto y habría ahorrado la
implementación completa. Y la alternativa buena (jsPDF con `outline`) ya estaba en el bundle.

**Un render a baja resolución miente.** Revisando el PDF a 80 dpi parecía haber palabras pegadas
("Tenemosque"). `pdftotext` demostró que el archivo estaba bien. Verificar el contenido con la
herramienta que lee el archivo, no con el ojo sobre un PNG reescalado.

**Los fallos de test que cambian de suite en cada corrida no son del código.** 21 tests en
`houseService`, luego 2 en otras dos suites, y aisladas todas pasan: era presión de memoria en la
máquina (57 GB usados, 23 GB comprimidos). Distinto del `SQLITE_MISUSE` por dos jest simultáneos,
que sí es determinista. Ver `troubleshooting` #21.

**Cuando el usuario cuestiona una decisión técnica, medir en vez de argumentar.** "Instalar Chrome
consume mucha memoria que no tiene" era correcto, y el número lo confirmó en un minuto.

## Archivos clave

| Capa | Archivo |
|---|---|
| Types | `packages/types/src/retreatPreparation.ts` |
| Entities | `apps/api/src/entities/retreatPreparation{,Document}.entity.ts` |
| Service | `apps/api/src/services/retreatPreparationService.ts` |
| Controller/Routes | `apps/api/src/{controllers,routes}/retreatPreparation*.ts` (montado en `/api/retreat-preparations`, público exento de CSRF) |
| Vista admin | `apps/web/src/views/RetreatPreparationsView.vue` (sidebar → Logística → Preparaciones) |
| Vista pública | `apps/web/src/views/PublicPreparationsView.vue` |
| Ayuda in-app | `apps/web/src/components/PreparationsHelpDialog.vue` (botón ⍰ en la vista admin, patrón `MamHelpDialog`) |
| Plantillas | `apps/api/src/data/preparation-docs/*.md` (+ `.docx` originales) e imágenes en `apps/web/public/preparation-assets/` |
| Motor de variables | `packages/utils/src/index.ts` (scope `preparations.*`) |
| Documento imprimible | `packages/utils/src/printableDocument.ts` (hoja A4 + armado del HTML, compartido) |
| Impresión navegador | `apps/web/src/composables/usePrintableDocument.ts` |
| PDF con marcadores | `apps/web/src/utils/markdownToPdf.ts` + `apps/web/src/composables/usePreparationPdf.ts` |
| Tests | `apps/api/src/tests/services/{retreatPreparationService,preparationsVariables,preparationTemplateAssets}.simple.test.ts`, `apps/web/src/utils/__tests__/markdownToPdf.test.ts`, `apps/web/src/views/__tests__/PublicPreparationsView.test.ts`, `apps/web/src/composables/__tests__/usePrintableDocument.test.ts`, `apps/web/src/components/__tests__/PreparationsHelpDialog.test.ts` |
| Video demo | `apps/web/e2e/demo/record-preparations.mjs` (→ `output/preparaciones-demo.mp4` + `.meta.json`) |

## Gotchas

- Fechas siempre como strings `YYYY-MM-DD`/`HH:MM` (nunca `Date` — skill `timezone-handling`);
  aritmética de días con componentes UTC (`addDaysYmd`).
- El endpoint público devuelve URLs de S3 directas; los archivos bajo `public-assets/` ya son
  públicos por bucket policy.
- `generate` con calendario existente exige `clearExisting` y borra también los documentos (S3 incluido).
- `preparationTemplateAssets.simple.test.ts` es el guard de regresión del bug original: falla si una
  plantilla reintroduce una fecha literal, usa un placeholder que nadie resuelve, o referencia una
  imagen que no está desplegada. Ese test **sí** usa `__dirname` — corre bajo Jest (CommonJS), no
  dentro del bundle ESM.
