# Spec: Foto del comprobante de pago

**Estado**: aprobada 2026-11-05, en implementación · **Branch**: `worktree-worktree-payment-receipt-photo` · **Fecha**: 2026-11-05

## Problema

Al cobrar en Recepción solo queda registrado el monto y el método (efectivo/transferencia/tarjeta).
Cuando alguien paga con transferencia y muestra la captura en la puerta, no hay evidencia: el
comprobante vive en el WhatsApp de quien cobra, con la compresión q50 del reenvío, y al día
siguiente nadie lo encuentra. Lo mismo pasa con pagos registrados desde la pantalla de Pagos.

## Objetivo

Que quien registra un pago —desde el modal **Cobrar** de Recepción o desde el formulario de la
pantalla **Pagos**— pueda adjuntar **una foto opcional del comprobante**, que se vea como
miniatura en la lista de pagos y se pueda ampliar. La Recepción debe seguir funcionando sin señal:
la foto viaja dentro del mismo pago encolado offline.

## Decisiones

| # | Decisión | Alternativa descartada |
| --- | --- | --- |
| D1 | **La foto va embebida en el body de `POST /payments`** (campo opcional `receiptPhoto`, data-URL JPEG ≤2MB tras resize). Es la única opción que conserva el flujo offline: `reception.payment` en el outbox ya acepta el POST completo, lo clona a IndexedDB y lo re-replay con la misma Idempotency-Key. **Cero cambios en el outbox.** | Endpoint separado `POST /payments/:id/receipt` (patrón setTablePhoto): en offline el pago encolado responde id sintético `offline-…` y una segunda llamada encolada no conocería el id real — habría que encadenar ops en el outbox o dejar la foto sin soporte sin señal. |
| D2 | **Columnas `receiptUrl` (text nullable) + `receiptS3Key` (varchar nullable) en `payments`** (patrón "una foto por entidad" de `communityMember`/`tables`). `payments` es tabla hoja (sin FKs entrantes, verificado): migration simple de `ADD COLUMN`, sin recreate-table. | Tabla aparte `payment_receipts`: un join más para el caso trivial de una foto por pago; mismas reglas de borrado con más superficie. |
| D3 | **Prefijo privado NUEVO `payment-receipts/`** (entrada en `PRIVATE_PREFIXES` de `s3Service` + statement en la policy IAM `EmausMediaRW` de `emaus-app`, procedimiento de `docs/s3-backup-permissions-fix-2026-05-14.md`). Key fija `payment-receipts/{paymentId}.webp` ⇒ re-subir reemplaza, sin huérfanos. La foto se sirve por `presignPrivateUrl` en cada lectura y `receiptS3Key` nunca sale al cliente. | Anidar bajo un prefijo privado existente para no tocar IAM (como hizo `table-memory-photo` D2): `retreat-memories/` y `community-*` tienen semántica de galería; `documents/` ya está en IAM pero meterlo a `PRIVATE_PREFIXES` altera el presign de lecturas existentes. Los comprobantes son documentos financieros: merecen aislamiento propio. **Paso ops explícito: la IAM va ANTES del deploy** (upload precede al insert; sin permiso, cobrar con foto da 500 y el pago no se registra — seguro pero confuso). |
| D4 | **Upload a S3 ANTES del insert, con uuid pre-generado** (`randomUUID()` de `node:crypto` + `repository.insert()`, no `save()`). El middleware de idempotencia solo libera la key en 5xx: si se guardara primero y fallara el upload, el reintento del dispositivo con la misma key duplicaría el pago. Un objeto S3 huérfano entre pasos es basura inofensiva; un pago duplicado no. | Guardar el pago y luego subir la foto (o en un hook post-save): reintento duplica. |
| D5 | **Foto opcional y sin permisos nuevos**: subir exige `payment:create` / reemplazar y quitar `payment:update`, ver `payment:read` — la foto hereda los permisos del pago. Procesado tipo foto de grupo: cliente `resizeImageToDataUrl(file, {maxSide: 1600, quality: 0.85})` (JPEG data-URL por el bug WebP de Safari iOS) + servidor `imageService.processPhoto` (fit 1600, WebP q85, **sin crop**). En dev sin S3 se persiste el data-URI validado en `receiptUrl` (modo base64 de `communityService.setMemberPhoto`). | `processAvatar` recorta a cuadrado 512×512 y destruye la legibilidad de un recibo. Foto obligatoria: el efectivo no lleva comprobante y bloquearía la fila de la puerta. Permiso nuevo `payment:read-receipt`: superficie sin beneficio, el acceso financiero ya está definido por `payment:read`. |
| D6 | **Limpieza en todos los caminos de borrado**: `DELETE /payments/:id` borra el objeto S3 (fire-and-forget tras `remove()`); `PUT /payments/:id` con `receiptPhoto: ''` limpia la foto (save con nulls ANTES de borrar el objeto: un fallo deja un huérfano, nunca una fila apuntando a nada); `receiptPhoto` no vacío con key fija = reemplazo por sobrescritura. | Solo confiar en re-subida sobre la misma key: borrar el pago dejaría el objeto para siempre en el bucket. |
| D7 | **El data-URL no deja rastro**: el audit log mantiene su whitelist explícita de campos (sin campos de receipt), y el middleware de idempotencia guarda solo la respuesta (que devuelve URL presignada, no el data-URL). `validateRequest` de paymentRoutes no usa `assignParsedBody`: el controller lee el body crudo, así que el significado de `''` (limpiar en PUT, ausente en POST) lo resuelve el controller; el schema solo valida que lo que llegue sea `data:image/`. | Meter `receiptPhoto` al audit snapshot: data-URLs de cientos de KB en la bitácora. |

## Historias

1. Como quien recibe en la puerta, al cobrar una transferencia adjunto la foto de la captura y el
   pago queda con su comprobante; si no hay señal, el pago con foto se guarda en el teléfono y
   sube solo al reconectar.
2. Como tesorero, en la pantalla de Pagos veo la miniatura del comprobante junto a cada pago, la
   amplío con un click y puedo reemplazarla o quitarla desde la edición del pago.
3. Como coordinador que revisa saldos, confío en que borrar un pago deja el bucket limpio.

## Requerimientos

- **R1** `POST /payments` acepta `receiptPhoto?: string` (data-URL `data:image/`, opcional; `''` se
  trata como ausente). Con foto: valida imagen (magic bytes + ≤2MB), procesa a WebP 1600px sin
  crop y persiste `receiptUrl`/`receiptS3Key` (D1, D2, D5). En modo base64 (dev sin S3) persiste
  el data-URI. Falla de imagen → **400**; falla de S3 → 500 con el pago sin registrar (D4).
- **R2** `PUT /payments/:id` acepta `receiptPhoto`: no vacío reemplaza (misma key), `''` limpia
  (nulls + borrado S3), ausente no toca la foto (D6).
- **R3** `DELETE /payments/:id` borra también el objeto S3 (D6).
- **R4** Todos los endpoints que devuelven pagos (create 201, lista, por id, update,
  por-participante, por-retiro y summary) devuelven `receiptUrl` presignada (las data-URIs de
  modo base64 pasan sin tocar) y **nunca** exponen `receiptS3Key` (D3). El resumen de recepción
  no cambia (solo suma montos).
- **R5** Modal **Cobrar** de Recepción: fila "Foto del comprobante (opcional)" con picker
  (`filePicker`, `capture: 'environment'` para cámara en móvil), preview y quitar; el body lleva
  `receiptPhoto` solo si hay foto; "Registrar pago" se deshabilita mientras procesa la imagen (D1, D5).
- **R6** Pantalla Pagos (`PaymentManagement`): en creación el mismo picker; en edición se ve el
  comprobante actual con Reemplazar/Quitar; la lista (card móvil y tabla de escritorio) muestra
  miniatura 40px junto al `referenceNumber`, click abre un Dialog con la imagen completa (D5).
- **R7** Offline: pago con foto sin señal → toast "Guardado en el teléfono", `totalPaid` sube
  local, replay al reconectar con la misma Idempotency-Key y la foto incluida; cero cambios en
  `outboxKinds` (D1).
- **R8** Textos nuevos de UI en `es.json` y `en.json` (`reception.*` y
  `paymentManagement.modal.*` / `.table.*`).

## Despliegue

1. **Antes del deploy**: statement Allow `s3:GetObject|PutObject|DeleteObject` sobre
   `arn:aws:s3:::emaus-media/payment-receipts/*` en la policy `EmausMediaRW` del user
   `emaus-app` (`aws --profile emaus`). Se documenta en el PR, no en archivos versionados.
2. Deploy: la migration corre sola al boot del API; confirmar "No pending migrations".

## Criterios de aceptación

- Test de migration (patrón `.test.ts` de `tests/migrations/`): up agrega las dos columnas sobre
  `payments` con filas existentes y los datos quedan intactos; down las quita.
- Test de ruta (`paymentReceiptPhoto.simple.test.ts`, supertest): POST con data-URI válido en
  modo base64 → 201 con `receiptUrl` = data-URI y sin `receiptS3Key` en la respuesta; POST con
  `data:text/html` → 400; POST con `''` → 201 sin foto; PUT reemplaza / `''` limpia / ausente
  intacto; binario >2MB → 400; en modo S3 (mock) `uploadPaymentReceipt` se llama ANTES del
  insert y el DELETE del pago llama `deletePaymentReceipt`.
- Test web (`RecepcionView.chargeReceipt.test.ts`, mockeando `filePicker` e `imageResize` —
  jsdom no tiene canvas): al elegir archivo `createPayment` recibe `receiptPhoto`; sin foto el
  campo no va en el body.
- Test web (`PaymentManagement`): payload con `receiptPhoto` / `''` al quitar; miniatura en la
  lista cuando hay `receiptUrl` y viewer al click.
- Test offline (`outboxKinds.test.ts` extendido): `reception.payment` acepta un body con
  `receiptPhoto`, `reduce` lo ignora y el body sobrevive el clon a IndexedDB.
- Verificación manual en el worktree: cobrar con foto (dev sin S3), ver miniatura y viewer;
  editar reemplazando y quitando; borrar pago con foto. Luego offline con foto y replay.

## Fuera de alcance

- Varios comprobantes por pago (uno solo; quien necesite más, los agrupa en una captura).
- PDF u otros formatos como comprobante: solo imagen.
- OCR / lectura automática del monto desde la foto.
- Backfill de pagos históricos: las columnas nacen vacías.
- Gestionar la foto desde el detalle de deudas (`ParticipantDebt`) o desde la ficha del
  participante: solo donde se registra/ve el pago.
- Limpiar objetos S3 al borrar un retiro completo (keys deterministas por pago; mismo criterio
  que las fotos de mesa).
