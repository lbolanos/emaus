# Spec: cartas de familias por email — buzón por participante, bandeja y impresión

> SDD spec — versión 1.2 (2026-11-07). Estado: implementado y en producción (b856dfcb); ver
> Reconcile y Reconcile v1.2. v1.0 era la aprobada para implementación.

**Branch**: `worktree-letters-email` · **Fecha**: 2026-11-05 · **Para**: el próximo retiro.

> Repo público: sin PII. Ninguna dirección real de familia ni contenido de carta aparece en
> estos archivos ni en los fixtures commiteados. Regla dura de la organización: nada de esto se
> menciona en la landing ni en material público — las cartas son la sorpresa del retiro para el
> caminante (guard: `landingPublicContent.test.ts`).

## Problema

Durante el retiro, las familias de los participantes (caminantes **y** servidores) envían cartas
de apoyo. Hoy la recolección es manual: llegan por WhatsApp al equipo, alguien las transcribe o
imprime a mano, y el reparto por mesa es artesanal. No hay trazabilidad de qué familia escribió,
qué carta llegó para qué participante, ni qué se imprimió. Escalar esto al tamaño del retiro
(cientos de participantes) es inviable.

## Objetivo

1. Cada participante activo de un retiro obtiene una dirección de email única
   `carta.{CODE}@emaus.cc` que la app genera y difunde.
2. Los emails que llegan a esas direcciones se reciben automáticamente (Cloudflare Email
   Routing → Worker → webhook del API), quedan asociados al participante y guardados (texto +
   adjuntos en S3 privado).
3. Una bandeja en la app permite revisar (aprobar / ocultar) y **imprimir organizado** por
   participante / mesa / retiro, con marca de impreso.
4. La difusión de la dirección a las familias se hace con un mensaje de WhatsApp generado por
   participante.

## Historias de usuario

1. Como coordinador, activo los buzones del retiro y obtengo una dirección única por
   participante, lista para copiar o mandar por WhatsApp a cada familia.
2. Como familia, escribo un email a la dirección de mi familiar con fotos adjuntas; si me
   equivoco de dirección, el email rebota y sé que no llegó.
3. Como revisor con permiso de cartas, veo la bandeja del retiro, filtro por mesa o
   participante, y apruebo u oculto cada carta que llega.
4. Como logística, imprimo el paquete de cartas aprobadas de una mesa (una sección por
   participante, texto + fotos) para repartirlo, y el sistema recuerda qué cartas ya se
   imprimieron.

## Decisiones de diseño (cerradas con Leonardo, 2026-11-05)

- **D1 — Alcance de destinatarios: caminantes y servidores** (incluye angelitos
  `partial_server`): sus familias también escriben. `waiting` no recibe buzón.
- **D2 — Recepción con Cloudflare Email Routing + Email Worker** (decisión de infra):
  catch-all de la zona → Worker que parsea (postal-mime) y POST-ea al API. Sin servidor SMTP
  propio en Lightsail (spam, deliverabilidad, carga) ni SES inbound (más piezas IAM).
  *Alternativas descartadas* registradas en `plan.md` §Infra.
- **D3 — Buzón = 3 columnas en `retreat_participants`**: `mailboxCode` (varchar(12) nullable,
  índice único parcial `WHERE mailboxCode IS NOT NULL`), `mailboxEnabled` (boolean, default
  false), `mailboxIssuedAt` (datetime nullable). El grano (retiro, participante) ya vive ahí.
  CODE: 8 chars del alfabeto sin ambigüedad `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, con
  `crypto.randomBytes` + reintento por colisión. Match del local-part lowercased con prefijo
  `carta.` exacto; sin plus-addressing en v1.
- **D4 — Activación bajo demanda por retiro**: endpoint explícito e idempotente (llena
  faltantes, no rota existentes). Aplica a `isCancelled=false`, `dataDeletedAt IS NULL`,
  `type IN ('walker','server','partial_server')`. Toggle individual por participante para casos
  de abuso. No se generan códigos en migración (retiros viejos quedan sin buzones, bien).
- **D5 — Email con código desconocido o deshabilitado → 404 → el Worker rebota** al remitente
  (`setReject`). Un error técnico (401/5xx) NO rebota: solo se loguea y Cloudflare reintenta.
  Fail-closed: sin `LETTER_WEBHOOK_SECRET` configurado, el webhook responde 503.
- **D6 — Adjuntos en tabla propia `letter_attachments`** (no JSON): presign por adjunto,
  filtrado imprimible, borrado individual. Patrón `responsabilityAttachment`
  (`fileName/mimeType/sizeBytes/storageKey/storageUrl`). Key S3:
  `letters/{letterId}/{attachmentId}/{fileName}` bajo prefijo privado nuevo `letters/`.
- **D7 — Estado y "impresa" son cosas distintas**: único eje de ciclo de vida
  `status: pending → approved | hidden` (bandeja de revisión obligatoria — decisión del usuario).
  "Impresa" son columnas `printedAt` + `printedBatchId` (marca optimista al abrir la ventana;
  re-imprimible sin límite).
- **D8 — Dedupe por `messageId`** (índice único parcial): duplicado → `200 {duplicate:true}`
  sin bounce. Reenvíos sin Message-ID se aceptan como carta nueva (el revisor la oculta).
- **D9 — Permisos: resource nuevo `letter`** con `read | update | print | manage`; seed en la
  migration con grants a `superadmin`, `admin`, `logistics`, `communications` (quienes hoy
  manejan palancas). NO a `regular_server`, `region_admin` ni `treasurer`. Registrado en
  `RESOURCES` de `@repo/types` y en el union `PermissionType` del Sidebar.
- **D10 — XSS: el HTML del email jamás se persiste ni renderiza.** Solo `bodyText` derivado
  (`text` si viene; si solo hay `html`, conversión local a texto plano, sin dependencias
  nuevas). Impresión y pantalla siempre escapados (`escapeHtmlText`); adjuntos por presigned
  URL, nunca data-URI; el detalle nunca usa `v-html`.
- **D11 — HEIC/formatos raros: guardar tal cual, no normalizar** (sharp prebuilt no decodifica
  HEIC y `imageService` es para avatares). `isBrowserSafeImage` precalculado al ingest con
  magic bytes (jpeg/png/gif/webp + `%PDF` para PDF). En impresión, solo los browser-safe se
  inlinean; el resto placeholder textual + badge "no imprimible" en bandeja. Topes: ≤10
  adjuntos, ≤8 MB c/u, ≤12 MB total binario (re-valida el API con 413; el Worker aplica los
  mismos antes de postear).
- **D12 — Webhook**: ruta pública `POST /api/letters/webhook`, CSRF-exempt, limiter propio
  (60/min por IP), header `X-Emaus-Letter-Secret` con comparación constant-time sobre hashes
  SHA-256, body parser específico de 16 MB montado antes del global de 5 MB.
- **D13 — Impresión reutiliza la hoja A4 sin tocar `@repo/utils`**: `buildPrintableHtml` ya
  acepta `bodyHtml`; nueva función hermana `printHtmlDocument` en `usePrintableDocument.ts`
  (`autoPrint` ya espera imágenes presigned). Orden de reparto: mesa (natural) → `idOnRetreat` →
  apellido; `page-break-before` entre participantes.
- **D14 — Difusión WhatsApp autocontenida**: texto generado en la vista con
  `buildWhatsAppSendLink`/`toE164Phone`; sin tocar el motor de plantillas global ni
  `messageSequenceService` en v1. Mensaje por participante + acción masiva "copiar todas".
- **D15 — Sin dependencias nuevas en el API** (html→texto es función local; `postal-mime` vive
  solo en el Worker). Nada de `__dirname`/`require` en archivos nuevos (bundle ESM).

## Requerimientos

- **R1** — Migration única (solo-add, reversible): 3 columnas en `retreat_participants` con
  guardas de idempotencia, tablas `letters` y `letter_attachments` con índices (incluido el
  único parcial de `messageId`), seed de permisos D9. Test que instala la migration en la DB de
  test y verifica índices y grants.
- **R2** — Endpoints autenticados de gestión (permisos D9 + acceso al retiro): activar buzones,
  listar buzones con contadores, toggle por participante, bandeja con filtros
  (participante/mesa/estado/búsqueda), detalle con adjuntos presigned, review con sello
  (`reviewedAt/reviewedById` + audit), print-mark por lote, y print-batch con datos ordenados
  para el documento.
- **R3** — Webhook D12 con contrato versionado (ver `plan.md` §Contrato): acepta carta válida
  (200), rebota por código (404 unknown/disabled), dedupe (200 duplicate), topes (413),
  payload inválido (400), sin secret (503). La carta entra siempre como `pending`.
- **R4** — Bandeja web (`LettersView.vue` + store Pinia): activación, resumen por estado,
  filtros, revisión, detalle con texto interpolado (sin `v-html`) y adjuntos; badge no
  imprimible; marca de impresa visible.
- **R5** — Impresión: selector de alcance (participante / mesa / retiro completo, solo
  approved), documento A4 con una sección por participante, fotos browser-safe inline,
  placeholders para el resto, `batchId` y print-mark solo si la ventana abrió.
- **R6** — Difusión: dialog con mensaje por participante (nombre, retiro, dirección completa,
  instrucción y plazo sugerido), Copiar / Enviar por WhatsApp (deshabilitado sin teléfono) y
  copia masiva de direcciones.
- **R7** — Sidebar + router + locales (es/en) + help doc in-app (`docs/es/letters.md`); cero
  cambios en la landing; guard de contenido público en verde.
- **R8** — Worker de Cloudflare versionado en `infra/workers/` + sección en `infra/README.md`
  con contrato y runbook (rotar secret, desactivar catch-all, bucket policy Deny de `letters/`).

## Criterios de aceptación (end-to-end)

Verificación contra la DB desechable del worktree (copia del main; hay retiros y participantes
reales — usar uno en curso; sembrar cartas por el API, nunca por sqlite CLI).

1. "Activar buzones" sobre un retiro activo: genera código para cada participante activo
   (walker/server/partial_server), idempotente (segunda corrida no cambia nada) y respeta
   cancelados/borrados/waiting.
2. POST al webhook con un CODE real → carta `pending` visible en la bandeja; con adjunto jpeg →
   fila en `letter_attachments` con key bajo `letters/` y URL presigned legible desde el web.
3. Re-post del mismo `messageId` → `duplicate:true` y una sola fila.
4. CODE inventado → 404; buzón deshabilitado → 404; sin secret → 401/503 según caso; adjunto
   de 9 MB → 413; solo-HTML → `bodyText` sin tags.
5. Bandeja: aprobar y ocultar funcionan y sellan reviewed; 403 sin `letter:read` y sin acceso
   al retiro.
6. Imprimir "por mesa": documento con una sección por participante (orden por mesa), texto
   escapado (una carta con `<script>` se ve como texto), foto inline visible; al abrir la
   ventana, las cartas quedan con `printedAt`+`printedBatchId`.
7. Difusión: mensaje contiene la dirección `carta.{CODE}@emaus.cc` del participante correcto;
   botón WhatsApp arma link E.164; sin teléfono queda deshabilitado.
8. Sidebar muestra "Cartas" con el permiso `letter` (y no con roles sin él); `pnpm build` del
   api y del web en verde; arranque de `apps/api/dist/index.js` sin crash ESM;
   `landingPublicContent.test.ts` verde.

## Fuera de alcance (v1)

- Auto-ack/respuesta al remitente (ni "recibimos tu carta" ni bounce custom).
- Integración con secuencias/plantillas globales (`messageSequenceService`, `replaceAllVariables`).
- Subida directa Worker→S3; todo pasa por el API.
- Guardar el `.eml` crudo; OCR; conversión HEIC (server o cliente); rotación de códigos;
  plus-addressing; múltiples direcciones por participante; borrado de cartas (solo `hidden`);
  notificaciones realtime; link con `palancasReceivedCount`; export ZIP.
- Contador de cartas en el sidebar.

## Reconcile (2026-11-06, verificación e2e en el dev del worktree)

Cada criterio verificado contra la DB desechable del worktree (copia del main, retiro Buen
Despacho, dist de producción corriendo el bundle + web en 5174):

| # | Criterio | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | Activación idempotente y filtros | ✓ | curl: primera corrida `{activated:62}`, segunda `{activated:0, alreadyActive:62}`; cancelados/borrados/waiting excluidos por test de servicio |
| 2 | Webhook con CODE real → pending + adjunto | ✓ | `{status:accepted}` + bandeja `pending` + attachment con key/data-URL bajo `letters/`; foto renderizada en el detalle |
| 3 | Dedupe por messageId | ✓ | re-post → `{duplicate:true}`, una sola fila |
| 4 | 404/401/413/solo-HTML | ✓ | CODE inventado 404; sin secret 401; adjunto 9 MB 413 (handler); html→text sin `<` (test + e2e) |
| 5 | Bandeja: aprobar/ocultar con sello; 403s | ✓ | curl review sella reviewed; 403 sin acceso al retiro (test); UI: chips de estado con counts en vivo |
| 6 | Imprimir por mesa/retiro | ✓ | Playwright: ventana con autoPrint disparada; DB: ambas approved con `printed:true` + `printedBatchId`; papel capturado (membrete, título con conteo, sección por participante, foto inline). Corrección: "Mesa Mesa 1" duplicado en el encabezado → usa el tableName tal cual |
| 7 | Difusión con dirección correcta | ✓ | Dialog de difusión renderiza mensaje por participante con `carta.{CODE}@emaus.cc`; WhatsApp E.164 por `phone.ts` (unit-level); copia masiva |
| 8 | Sidebar/builds/guard landing | ✓ | Entrada "Cartas de familias" visible con permiso letter; `pnpm build` api OK + dist arranca (ESM) + `grep __dirname dist/index.js` = solo el shim preexistente; vue-tsc 0 errores; landing guard 11/11 |

**Suites**: API completa (2 shards) 342 suites / ~5024 tests verde; web completa 275 suites /
3965 tests verde; suites nuevas: migration 5/5, mailbox 10/10, webhook 9/9, controller 8/8,
store 6/6, print 8/8, view 6/6.

### Desviaciones del diseño (corregidas con el código, regla SDD 5)

1. **Montaje de routers** (plan §Fase 1): `letterRoutes` se monta CON prefijo `/letters`
   (paths internos sin el segmento) y ANTES de `shirtTypeRoutes` — ese router tiene un
   blanket `router.use(isAuthenticated)` sin path que exige sesión a todo lo montado después.
   El primer wiring daba 404 en el POST activate; lo cazó el e2e contra el dist, y el wiring
   test ahora fija el orden.
2. **Topes estrictos** (plan §Fase 2 decía "primeros 10 + warning"): >10 adjuntos → 413. El
   Worker aplica los mismos topes antes de postear; el API re-valida.
3. **reviewLetterHandler anti-IDOR** (no estaba en el diseño explícito): el permiso
   `letter:update` no basta — el handler valida acceso al retiro de ESA carta (regla del repo
   de recurso más específico).
4. **Worker con wrangler, no cloudflare.tf** (plan §Fase 6 asumía la convención failover):
   necesita bundler para postal-mime → `infra/workers/email-inbound/` con wrangler.toml; el
   README lo documenta.
5. **URLs del detalle/revisión**: `/api/letters/:id` y `/api/letters/:id/review` (no
   `/letters/letters/:id`) por el montaje con prefijo. El web (`api.ts`) y el e2e quedaron
   alineados.
6. **Casos no verificables con datos reales**: los adjuntos HEIC/PDF placeholders están
   cubiertos por unit tests (lettersPrint) y clasificación por magic bytes (webhook test);
   no hubo HEIC real en la corrida e2e.

Lo descartado / no construido: nada del diseño v1 quedó fuera; el auto-ack al remitente y el
resto del "fuera de alcance" sigue listado arriba.

### Residuos de la verificación (no van al commit)

- DB desechable del worktree con datos de prueba (3 cartas "Hola desde el e2e", 62 buzones
  activados, clave del usuario leonardo reseteada a 123456 en la COPIA) — la DB del main
  está intacta.
- `apps/web/.env.local`, `apps/web/public/runtime-config.js` y `apps/api/.env` del worktree:
  ignorados por git (convención del skill worktree-testing).
- El port 3002 lo tomó Chrome Beta de otra sesión durante la verificación; el dist de este
  worktree terminó en 3003 (runtime-config apuntando ahí) — al cerrar, bajar ambos dev.

## Reconcile v1.2 (2026-11-07, UX del palanquero, en producción con b856dfcb)

Iteración guiada por el uso real (pedidos de Leonardo en la sesión), sobre lo construido en v1.1.
Lo que cambió respecto al diseño:

| Tema | v1.1 | v1.2 (en código) |
| --- | --- | --- |
| Papel | Sección por participante con encabezado (nombre, mesa, Nº), tarjeta por carta con remitente, fecha y asunto; título y membrete | **Solo el cuerpo y las fotos de la familia, una carta por hoja**. Sin cromo del navegador: `@page { margin: 0 }` + espaciadores `thead`/`tfoot` por hoja (un margen > 0, incluso 9 mm, deja fecha/título/URL/n de N — verificado con Chrome headless). Carátula opcional por participante |
| Marcado de impresas | Optimista al abrir el diálogo del navegador | Se pregunta «¿salió bien?» tras `print()` y solo entonces se marca; **quitar la marca** por carta o por carpeta (`POST …/letters/print-unmark`, auditado `letter.print_unmark`); **marcar a mano** por carta, carpeta o selección (`print-mark` sin `batchId`: solo aprobadas sin imprimir, `printedBatchId` null, audit `manual: true`) |
| Alcances de impresión | Mesa / retiro | + caminante, palanquero, selección, **solo las no impresas** (`onlyUnprinted`) y «lo que falta» por carpeta |
| Organización | Bandeja carta por carta | + vista **Carpetas** (`GET …/letters/folders`): estado del folder por participante (completa / faltan / por revisar / sin cartas + si ya se mandó la dirección) |
| Filtros | Estado, mesa, texto | + caminante (en el servidor, con búsqueda) y **palanquero asignado** (`palancasCoordinator`, `__none__` = sin asignar), compartido entre Bandeja y Carpetas; vista/palanquero/caminante en la URL; etiquetas con ✕ |
| Difusión | Mensaje por participante | + marca de envío persistente (`mailboxSharedAt` / `receiptLinkSharedAt`, migración `20261107120000_AddShareMarksToRetreatParticipants`) |
| Interfaz | Botones por fila y en el detalle | Acciones en ⋮ (encabezado y fila); el detalle de la carta solo muestra contenido |

**Seguridad corregida en esta iteración**: el anti-IDOR de comprobantes (`d8c5c865`) definía
`assertRetreatAccess` pero no lo llamaba; apply/dismiss/from-letter quedaron sin chequeo de
acceso al retiro en prod hasta b856dfcb. Ahora lo exigen, con tests y prueba de mutación.
`GET /payments/from-letter/:letterId/photo` y `…/attach` exigen además `letter:read`.

**Botón «comprobante → formulario de pago estándar» (v1.3, 2026-11-08)**: implementado en
`worktree-letters-payment` cuando `PaymentManagement` embebible llegó a master local
(`1c259691`). El ⋮ de la fila ofrece **Registrar como comprobante de pago** a las cartas con
foto, con caminante asignado y estado `pending`/`approved`; abre el formulario estándar
prellenado con el caminante y la foto (`GET /payments/from-letter/:letterId/photo`); al
guardar, `payment-saved` dispara `POST …/attach`, que sella la carta `attached` y registra el
claim de «Comprobantes» como *Aplicado* (patrón `waReceiptClaimService`: si el pago ya nació
de un comprobante de familia, el claim original ya lo muestra y no se duplica). Si el attach
falla el pago queda igual (se revisa en Pagos); sin fotos no hay acción.

**Varias fotos en el correo (v1.3)**: con más de una foto, el ⋮ usa la primera imprimible,
pero el flujo pensado es elegir: el clic en una foto del detalle la abre en el visor, que
ofrece **Registrar esta foto como comprobante** para la que se está viendo
(`GET …/photo?attachmentId=`; una foto de otra carta → 404). Verificado E2E en el dev del
worktree (13/13: carta con 2 fotos por webhook, visor con la foto 2, attach y claim en
«Comprobantes»).

**Pendiente (fuera de v1.2)**: ~~el botón «comprobante → formulario de pago estándar»~~ hecho,
ver arriba (v1.3); queda publicar la rama.

**Adjuntos (2026-11-07, tras la v1.2)**: hasta aquí los PDF se guardaban sin forma de abrirlos y
Word/PowerPoint/Excel se descartaban (con la carta adentro, si la familia la mandó así). Ahora
se guardan PDF, Office y OpenDocument (sin macros: `.docm/.pptm/.xlsm`, `vbaProject.bin`,
`_VBA_PROJECT`/`Macros` en OLE y `Basic/` en ODF se descartan) y texto; el tipo sale del
contenedor (magic bytes) + extensión. En la bandeja: fotos en grande, PDF en pestaña (firmado
inline con `ResponseContentDisposition`, también los ya subidos), el resto se descarga. No van
al papel: la vista previa los lista y Carpetas cuenta `documents`. El `Content-Disposition`
de subida lleva `filename*` (RFC 5987) para nombres con acentos.

**Video tutorial**: el de la ayuda (`b5ADc_QGmCE`) muestra la interfaz de v1.1; regrabarlo con
la de v1.2 queda pendiente.

