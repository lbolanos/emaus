# Plan: Fotos del recuerdo grandes

Sin migraciones ni dependencias nuevas. Dos cambios independientes: navegador (D1, D3, D4) y API (D2).

## Web — `apps/web/src/components/social/MemoryUploadForm.vue`

- Constantes: `MAX_SOURCE_BYTES = 30 * 1024 * 1024`, `PHOTO_MAX_SIDE = 1600`.
- `validateFile`: el tope pasa de 5 MB a `MAX_SOURCE_BYTES`; el mensaje dice «supera los 30 MB».
- Se borra el `readAsDataURL` local; en su lugar
  `resizeImageToDataUrl(file, { maxSide: PHOTO_MAX_SIDE })` de `@/utils/imageResize`
  (calidad por defecto, 0,85).
- `handleFiles`:
  - `slots = MAX_PHOTOS - photos.value.length`; se procesan solo `files.slice(0, slots)`.
  - `try/catch` **por archivo**: si falla, toast «No se pudo subir {nombre}» con `apiErrorMessage`, y se sigue.
  - `load()` + `emitDerived()` en `finally`, una sola vez por lote.
- Texto de ayuda (R6).

## API — `apps/api/src/services/imageService.ts`

- Se extrae el cuerpo de `processFlyerAsset` a un privado
  `processWithoutCrop(buffer, contentType, maxSide)`, con las validaciones de tamaño y magic bytes,
  `fit: inside`, `withoutEnlargement` y WebP.
- `processFlyerAsset(buffer, contentType, kind)` delega en él con el `maxSide` de hoy. Sin cambio de comportamiento.
- Nuevo `processMemoryPhoto(buffer, contentType)` = `processWithoutCrop(…, MAX_MEMORY_PHOTO_SIZE)`,
  con `MAX_MEMORY_PHOTO_SIZE = 1600`. Constante propia aunque valga lo mismo que la del volante:
  son decisiones distintas y pueden separarse.
- `retreatMemoryService.addPhoto`: `processAvatar` → `processMemoryPhoto`. Se corrige también el
  comentario «Reuse the corrected image flow», que ya no aplica.

## Por qué 1600 px

Es el lado mayor que el servidor ya usa para fondos de volante y alcanza para el visor
(`max-w-[92vw]` en una pantalla de 1920 px). Si el cliente reduce a lo mismo que el servidor, el
servidor solo recodifica a WebP y no vuelve a escalar. En JPEG 0,85, una foto de 1600 × 1200 queda
muy por debajo de 2 MB; el límite del servidor nunca debería verse.

## Tests

- **Web** (`MemoryUploadForm.spec.ts`): mock de `@/utils/filePicker` (devuelve los `File` del caso) y
  de `@/utils/imageResize`. Casos de los criterios de aceptación, más el de más de 30 MB y el de
  formato no válido. Para revisar los toasts hay que sobrescribir `useToast` en el archivo: el mock
  global devuelve un `vi.fn()` nuevo en cada llamada.
- **API**: en `retreatMemoryService.integration.test.ts`, un caso S3 con `avatarStorageService.isS3Storage`
  forzado a `true` y `s3Service.uploadRetreatMemoryPhotoById` espiado; se genera un JPEG real de
  3000 × 2000 con `sharp` y se comprueba con `sharp(buffer).metadata()` que lo subido es WebP de 1600 × 1067.
- `flyerAsset.test.ts` y `imageService.test.ts` deben quedar verdes sin tocarlos: prueban que el refactor no cambió nada.

## Riesgos

- **Memoria en iOS** al decodificar una foto de 48 MP: el canvas de destino es de 1600 px, así que el
  pico es la imagen decodificada (unos 190 MB en 8064 × 6048). El tope de 30 MB (D3) acota los casos raros.
- **Lotes grandes**: las fotos se procesan una por una, nunca en paralelo, para no multiplicar ese pico.
