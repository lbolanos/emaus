# Research: Fotos de reunión grandes

## Recorrido hoy

1. **Modal** — `apps/web/src/components/community/MeetingFormModal.vue`: `triggerPhotoInput` →
   `applyPhotoFile` (tope `MAX_PHOTO_BYTES = 2 MB`, `FileReader`) → `pendingPhotoData`. Al guardar,
   `communityStore.setMeetingPhoto(meetingId, pendingPhotoData)`.
2. **Lista** — `apps/web/src/views/CommunityMeetingsView.vue`: `triggerPhotoUpload` → `handlePhotoFile`
   (mismo tope y `FileReader`) → `communityStore.setMeetingPhoto` directo.
3. **API** — `PUT /communities/meetings/:id/photo` (`communityRoutes.ts:248`, `requireCommunityMeetingAccess`,
   `validateRequest(setCommunityMeetingPhotoSchema)`, `.catch(next)`) →
   `CommunityController.uploadMeetingPhoto` → `communityService.setMeetingPhoto`:
   - S3: `base64ToBuffer` (2 MB) → **`processAvatar`** (cuadrado de 512) → `uploadCommunityMeetingPhoto`.
   - base64: guarda el data-URI tal cual.

## Dónde se ve

- Miniatura de 64/80 px con `object-cover` en `CommunityMeetingsView.vue` y `CommunityAttendanceView.vue`.
- Visor: `CommunityMeetingsView` (lightbox), `CommunityAttendanceView` (`max-h-[75vh] object-contain`)
  y el lightbox propio del modal.

## Reutilizable (de `memory-photo-resize`, ya en master)

- `resizeImageToDataUrl` en `apps/web/src/utils/imageResize.ts`.
- `imageService.processMemoryPhoto` → `processWithoutCrop(…, 1600)`.
- `MemoryUploadForm.vue` define `MAX_SOURCE_BYTES` y `PHOTO_MAX_SIDE` localmente: con un tercer
  consumidor conviene subirlos a `imageResize.ts`.

## Tests actuales

- `apps/web/src/views/__tests__/CommunityMeetingsView.test.ts` — bloque «meeting photo»: miniatura,
  rótulo del botón, subida (`FileReader` real) y rechazo de no-imagen. Con la reducción, la subida
  necesita mockear `@/utils/imageResize` (happy-dom no tiene canvas).
- `apps/web/src/components/community/__tests__/MeetingFormModalType.test.ts` — no cubre la foto.
- `apps/api/src/tests/services/communityMeetingPhoto.test.ts` — solo modo base64.
