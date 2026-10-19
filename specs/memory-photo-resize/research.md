# Research: Fotos del recuerdo grandes

## Recorrido de una foto hoy

1. `apps/web/src/components/social/MemoryUploadForm.vue` — `triggerFileInput` → `pickFiles`
   (`accept: image/jpeg,image/png,image/webp`, `multiple`) → `handleFiles`.
2. `validateFile` rechaza `file.size > 5 MB` y los MIME fuera de jpeg/png/webp.
3. `readAsDataURL` (propio del componente) lee el archivo **tal cual** y `addRetreatMemoryPhoto`
   (`apps/web/src/services/api.ts`) lo manda como `{ photoData }` a `POST /retreats/:id/memory-photos`.
4. `apps/api/src/index.ts:135` — `express.json({ limit: '5mb' })`, global. Más grande → 413.
5. `apps/api/src/routes/retreatRoutes.ts:109` — `validateRequest(createRetreatMemoryPhotoSchema)`:
   data-URI de imagen, `max(4_000_000)` caracteres (`packages/types/src/index.ts:282`).
6. `apps/api/src/services/retreatMemoryService.ts:85` `addPhoto`:
   - **S3** (prod): `imageService.base64ToBuffer` (rechaza > 2 MB binario) →
     `imageService.processAvatar` → `s3Service.uploadRetreatMemoryPhotoById`.
   - **base64** (dev local, `AVATAR_STORAGE=base64`): guarda el data-URI tal cual.
7. `apps/api/src/services/imageService.ts` `processAvatar`: si `width > 512`,
   `resize(512, 512, { fit: 'cover' })` → **cuadrado recortado** → WebP q85.

Límite efectivo: **≈ 2 MB** (el que gane entre `base64ToBuffer` y el schema), no los 5 MB que anuncia el formulario.

## Evidencia en producción (2026-10-19)

`aws s3 ls s3://emaus-media/retreat-memories/ --recursive --profile emaus`: 10 objetos WebP de 68 a 98 KB.
Se descargaron dos (uno del 2026-06-16 y otro del 2026-10-19) a un temporal, se midieron con `sips` y
se borraron: los dos miden **512×512**.

## Lo que ya existe y se reutiliza

- `apps/web/src/utils/imageResize.ts` — `resizeImageToDataUrl(file, { maxSide, quality })`: lee por
  FileReader (la CSP de prod no permite `blob:` en `img-src`), dibuja en canvas y devuelve JPEG
  (Safari iOS devuelve PNG en silencio si se le pide WebP). Lo usan `MemberPhotoDialog.vue` (512)
  y `FlyerImagePicker.vue`. Tiene tests en `apps/web/src/utils/__tests__/imageResize.test.ts`.
- `imageService.processFlyerAsset` — ya procesa **sin recortar**:
  `resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })` → WebP q85, con
  `MAX_FLYER_BACKGROUND_SIZE = 1600`. Es exactamente lo que necesita una foto del recuerdo.

## Dónde se muestran

- `apps/web/src/components/social/MemoryPhotoCarousel.vue` — tarjeta con `object-cover` y visor a
  pantalla completa con `max-h-[90vh] max-w-[92vw] object-contain`. Hoy el visor amplía 512 px.
- `RetreatMemoryCard.vue` y `RetreatDashboardView.vue` («Mis Retiros») consumen el mismo carrusel.

## Tests actuales

- `apps/web/src/components/__tests__/MemoryUploadForm.spec.ts` — carga, canciones, principal, MAM.
  **Ningún test de subida de fotos.**
- `apps/api/src/tests/services/retreatMemoryService.integration.test.ts` — solo modo base64.
  **El camino S3 (el de prod) no tiene test.**
- `apps/api/src/tests/services/imageService.test.ts` — `processAvatar`; `processFlyerAsset` en
  `apps/api/src/tests/services/flyerAsset.test.ts`.
