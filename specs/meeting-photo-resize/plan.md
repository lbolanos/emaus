# Plan: Fotos de reunión grandes

Sin migraciones ni dependencias nuevas.

## API

- `imageService.processMemoryPhoto` → **`processPhoto`** y `MAX_MEMORY_PHOTO_SIZE` → `MAX_PHOTO_SIZE`:
  ya no es solo del recuerdo, es «foto de evento que se ve a pantalla completa». Lo usan
  `retreatMemoryService.addPhoto` y `communityService.setMeetingPhoto`.
- `setMeetingPhoto`: `processAvatar` → `processPhoto`; corregir el comentario que decía que reutiliza
  el flujo de avatares.

## Web

- `apps/web/src/utils/imageResize.ts` exporta `PHOTO_MAX_SIDE = 1600` y
  `MAX_PHOTO_SOURCE_BYTES = 30 MB`; `MemoryUploadForm.vue` deja sus constantes locales y los importa.
- `CommunityMeetingsView.handlePhotoFile`: tope de 30 MB, `resizeImageToDataUrl` en vez de
  `FileReader`. `uploadingPhotoId` se marca **antes** de reducir, para que el botón muestre que trabaja.
- `MeetingFormModal.applyPhotoFile`: igual, con un `isProcessingPhoto` que deshabilita «Guardar» y el
  mosaico de «Agregar foto» mientras se reduce (R2).

## Tests

- Mocks de `@/utils/imageResize` con `importOriginal`, para conservar las constantes reales y
  sustituir solo `resizeImageToDataUrl` (también en `MemoryUploadForm.spec.ts`, que hoy mockea
  el módulo entero y dejaría las constantes en `undefined`).
- `CommunityMeetingsView.test.ts`: 8 MB reducida y subida; más de 30 MB rechazada.
- Modal: test nuevo de la foto (reducción + «Guardar» deshabilitado mientras dura).
- `communityMeetingPhoto.test.ts`: caso S3 con `sharp` real, igual que en `retreatMemoryService`.
