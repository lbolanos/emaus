# Foto de reunión de comunidad

Cada reunión de comunidad (`CommunityMeeting`) puede tener **una sola foto**
(banner/portada). Se sube/cambia/quita desde la UI del coordinador y se muestra
como miniatura en el listado de reuniones.

Reutiliza el mismo pipeline de imágenes que avatares y retreat-memories
(`imageService` + `avatarStorageService` + `s3Service`): en modo S3 la imagen se
procesa (resize ≤512px + conversión a WebP, calidad 85) y se sube; en modo
`base64` (default de desarrollo y tests) el data-URI se persiste tal cual.

## Modelo de datos

Entidad `apps/api/src/entities/communityMeeting.entity.ts` — dos columnas
nullable:

| Columna       | Tipo      | Descripción                                                        |
| ------------- | --------- | ------------------------------------------------------------------ |
| `photoUrl`    | `varchar` | URL pública de S3, o el data-URI completo en modo base64.          |
| `photoS3Key`  | `varchar` | Object key en S3 (`community-meetings/{meetingId}.webp`). `null` en modo base64. |

Migration: `apps/api/src/migrations/sqlite/20260616140000_AddPhotoToCommunityMeeting.ts`
(`ALTER TABLE community_meeting ADD COLUMN`). El `down()` es **no-op intencional**:
SQLite no soporta `DROP COLUMN` directo y recrear `community_meeting` cascadearía
sus FKs entrantes (`community_attendance`, instancias self-referenciales) con
riesgo de pérdida de datos. Las columnas son nullable e inertes para consumidores
viejos.

Almacenamiento S3: key **fijo por meeting** (`community-meetings/{meetingId}.webp`),
así que volver a subir **reemplaza** la foto anterior — no se acumulan objetos
(a diferencia de retreat-memories, que es una galería con key por foto).

## API

Endpoints dedicados (no se gestiona la foto en el `PUT` genérico de la reunión):

| Método   | Ruta                                  | Body                | Respuesta            |
| -------- | ------------------------------------- | ------------------- | -------------------- |
| `PUT`    | `/communities/meetings/:id/photo`     | `{ photoData }` (data-URI) | `CommunityMeeting` actualizado |
| `DELETE` | `/communities/meetings/:id/photo`     | —                   | `CommunityMeeting` actualizado |

- **Autorización**: ambas rutas usan `requireCommunityMeetingAccess()`, que
  resuelve el permiso contra la comunidad **real** del meeting (el `:id` es el
  meetingId), igual que el `PUT`/`DELETE` de la reunión. Evita IDOR cross-tenant.
- **Validación**: `setCommunityMeetingPhotoSchema` (en `@repo/types`) exige que
  `photoData` matchee `^data:image/(jpeg|jpg|png|gif|webp);base64,`. El tamaño
  real (≤2MB) y los magic bytes se validan en `imageService` en modo S3.
- `photoUrl` se expone en `communityMeetingSchema` (lectura) pero está **omitido**
  de `updateCommunityMeetingSchema`: el cliente no puede setear URLs arbitrarias
  por el PUT genérico (ver memoria "Write schemas no deben requerir campos
  read-only").

Capa de servicio — `CommunityService` (`apps/api/src/services/communityService.ts`):
`setMeetingPhoto(meetingId, photoData)` y `deleteMeetingPhoto(meetingId)`. Ambas
lanzan `'Meeting not found'` si el meeting no existe; el controller lo traduce a
404. El borrado de S3 es best-effort (no falla si el objeto ya no está).

## Frontend

- **`services/api.ts`**: `setCommunityMeetingPhoto(meetingId, photoData)`,
  `deleteCommunityMeetingPhoto(meetingId)`.
- **`stores/communityStore.ts`**: acciones `setMeetingPhoto` / `deleteMeetingPhoto`
  que actualizan la reunión en el array `meetings` para reactividad inmediata.
- **`components/community/MeetingFormModal.vue`** (pestaña General): selector de
  imagen con preview, quitar (X) y validación (≤2MB). Como al **crear** aún no
  existe el `id`, la foto se sincroniza **después** de guardar la reunión
  (`syncMeetingPhoto`); un fallo de la foto no revierte la reunión ya guardada
  (toast no fatal).
- **`views/CommunityMeetingsView.vue`**:
  - Miniatura (`<img>`) en cada card cuando `meeting.photoUrl` existe.
  - Botón de **subida directa** (ícono `ImagePlus`) en las acciones del card que
    sube la foto sin abrir el modal completo. Un único `<input type=file>` oculto
    compartido + `photoTargetMeetingId` apuntan a la reunión clickeada. Muestra
    spinner durante la subida.
  - El botón tiene `aria-label`/tooltip dinámico: **"Subir foto"** sin foto,
    **"Cambiar foto"** con foto. Todos los botones de acción de la vista tienen
    tooltip (leyenda on-hover).

## Tests

- Backend: `apps/api/src/tests/services/communityMeetingPhoto.test.ts` —
  set/replace/delete + `'Meeting not found'`.
- Frontend store: `apps/web/src/stores/__tests__/communityStore.test.ts` (bloque
  "Meeting Photo").
- Frontend vista: `apps/web/src/views/__tests__/CommunityMeetingsView.test.ts`
  (bloque "meeting photo") — miniatura, label del botón, flujo de upload y rechazo
  de no-imágenes.

## Notas operativas

- En producción (S3) la foto sirve con `Cache-Control: immutable` por 1 año. Como
  el key es fijo por meeting, al reemplazarla el navegador podría servir la vieja
  desde caché; si se vuelve un problema, agregar un `?v=` o key con hash.
- El endpoint público de asistencia devuelve la reunión, así que `photoUrl` queda
  disponible si en el futuro se quiere mostrar en la página pública.
