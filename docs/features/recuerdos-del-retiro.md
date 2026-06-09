# Recuerdos del Retiro (galería de fotos + canciones)

Cada retiro puede guardar **varias fotos** y **varias canciones** de recuerdo. Una foto y una
canción se marcan como **principal**: son las que se muestran inicialmente en la vista pública
**"Mis Retiros"** (la foto principal encabeza el carrusel, la canción principal va destacada).

La gestión (subir, eliminar, marcar principal) es **solo de admin/coordinador**, desde el modal
del retiro → pestaña **Recuerdos**. En "Mis Retiros" el participante solo visualiza.

> Antes de esta feature el retiro guardaba **una sola** foto (`memoryPhotoUrl`) y **una sola**
> URL de música (`musicPlaylistUrl`) como columnas en `retreat`, y el key de S3 era fijo por
> retiro, así que subir otra foto sobrescribía la anterior.

## Para el coordinador

1. Abre el retiro → pestaña **Recuerdos**.
2. **Fotos**: arrastra o selecciona varias imágenes (JPG/PNG/WebP, máx. 5 MB c/u, hasta 30). Pasa
   el cursor sobre una miniatura para **marcarla como principal** (★) o **eliminarla** (🗑). La
   principal lleva el badge "Principal".
3. **Canciones**: agrega un enlace (Spotify, YouTube, etc.) con un **título opcional**. Marca la
   principal con ★. Edita el título/URL en línea; se guarda al salir del campo.

En "Mis Retiros" (y en el dashboard del retiro) la foto se muestra en un **carrusel inline**
(flechas, contador y puntos). Al hacer **clic en la foto se amplía** en un visor a pantalla
completa (lightbox) que navega con ◀ ▶ / flechas del teclado y cierra con la **X**, clic fuera o
**Esc**.

## Modelo de datos

Dos tablas hijas con FK `ON DELETE CASCADE` a `retreat` (patrón `Tag`/`RetreatBed`):

- **`retreat_memory_photo`**: `id`, `retreatId`, `url`, `s3Key` (null si es base64/disk),
  `isPrimary`, `sortOrder`, `createdAt`.
- **`retreat_memory_song`**: `id`, `retreatId`, `url`, `title` (nullable), `source`
  (`'manual'` | `'mam'`, default `'manual'`), `isPrimary`, `sortOrder`, `createdAt`.

Entidades: `apps/api/src/entities/retreatMemoryPhoto.entity.ts`,
`retreatMemorySong.entity.ts`. Relaciones `@OneToMany` `memoryPhotos`/`memorySongs` en
`retreat.entity.ts`.

### Campos derivados (compatibilidad)

`retreat.memoryPhotoUrl` y `retreat.musicPlaylistUrl` **se conservan** como espejo de solo
lectura de la principal. Cada mutación los re-sincroniza (`syncDerivedPhotoUrl` /
`syncDerivedSongUrl` en `retreatMemoryService.ts`). Esto deja intactos los consumidores previos
(dashboard, filtros de "Mis Retiros") sin tocarlos.

### Invariante "principal"

Hay **a lo sumo una** principal por retiro y tipo. Al marcar una como principal se desmarcan las
demás. Al **borrar la principal** se promueve la de menor `sortOrder`; si no quedan, el campo
derivado pasa a `null`. Toda esta lógica está centralizada en
`apps/api/src/services/retreatMemoryService.ts`.

### Almacenamiento (S3)

Key por foto: `retreat-memories/{retreatId}/{photoId}.webp` (varias fotos sin sobrescribir).
`s3Service.uploadRetreatMemoryPhotoById` / `deleteRetreatMemoryPhotoByKey`. Con
`AVATAR_STORAGE=base64` (default en dev/tests) la imagen se guarda como data URI y `s3Key` queda
`null`.

## Música del minuto a minuto (importación)

Cada item del MAM guarda una URL de música por charla/actividad en
`RetreatScheduleItem.musicTrackUrl`. **Después de que el retiro termina**
(`isRetreatPast(endDate)` en `participantService.ts`), el coordinador ve en la pestaña
**Recuerdos** el botón **"Importar música del minuto a minuto"** (deshabilitado mientras el
retiro no haya terminado). Al pulsarlo se importan todos los items con una URL `http(s)` como
canciones `source='mam'`, tituladas con el nombre de la charla/actividad.

- Es **aditivo + dedup** por `(url, title)` entre las canciones `source='mam'`: re-importar solo
  agrega lo nuevo (no duplica). Limitación conocida: si se edita el `musicTrackUrl` en el MAM, la
  entrada vieja queda; bórrala a mano si hace falta.
- Las canciones `source='mam'` **no** participan del "principal" ni espejan `musicPlaylistUrl`
  (eso es exclusivo de las manuales). No tienen el tope de 30 (ese es solo para manuales).
- En "Mis Retiros" se muestran en una **sección aparte** "Música del minuto a minuto", separada
  de "Canciones del recuerdo" (manuales). Lógica en `retreatMemoryService.importSongsFromMam`.

## API

Todas bajo `requireRetreatAccess('id')` (`apps/api/src/routes/retreatRoutes.ts`):

| Método | Ruta | Cuerpo / efecto |
| --- | --- | --- |
| `GET` | `/retreats/:id/memories` | `{ photos, songs }` |
| `POST` | `/retreats/:id/memory-photos` | `{ photoData }` (base64) → crea foto |
| `DELETE` | `/retreats/:id/memory-photos/:photoId` | borra (S3 + fila) |
| `PUT` | `/retreats/:id/memory-photos/:photoId/primary` | marca principal |
| `POST` | `/retreats/:id/memory-songs` | `{ url, title? }` → crea canción manual |
| `PUT` | `/retreats/:id/memory-songs/:songId` | edita `url`/`title` |
| `DELETE` | `/retreats/:id/memory-songs/:songId` | borra |
| `PUT` | `/retreats/:id/memory-songs/:songId/primary` | marca principal |
| `POST` | `/retreats/:id/memory-songs/import-from-mam` | importa MAM (solo si el retiro terminó) → `{ imported, skipped, songs }` |

Los endpoints legacy `POST /:id/memory-photo` y `PUT /:id/memory` se conservan (clientes en
caché) y ahora **delegan** al servicio de galería. `getAttendedRetreats` y `findById` cargan las
relaciones `memoryPhotos`/`memorySongs`.

**Schemas (`packages/types`)**: los write schemas (`createRetreatMemorySongSchema`,
`updateRetreatMemorySongSchema`) **omiten** los campos derivados/read-only (`id`, `isPrimary`,
`sortOrder`, `createdAt`) — evita el 400 recurrente cuando el cliente reenvía el DTO de lectura.
Los arrays `memoryPhotos`/`memorySongs` también se omiten en `create/updateRetreatSchema`.

## Frontend

- `apps/web/src/services/api.ts`: `getRetreatMemories`, `addRetreatMemoryPhoto`,
  `deleteRetreatMemoryPhoto`, `setPrimaryRetreatMemoryPhoto` y equivalentes para canciones.
- `components/social/MemoryUploadForm.vue`: gestión múltiple (admin), carga la galería al montar.
- `components/social/MemoryPhotoCarousel.vue`: carrusel inline + lightbox; principal primero;
  fallback a `memoryPhotoUrl` para retiros viejos.
- `components/social/RetreatMemoryCard.vue` (Mis Retiros) y `views/RetreatDashboardView.vue`:
  usan el carrusel + lista de canciones, con fallback a los campos derivados.

## Migración

`apps/api/src/migrations/sqlite/20260609180000_CreateRetreatMemoryGallery.ts`: crea ambas tablas
+ índices y **backfillea** los `memoryPhotoUrl`/`musicPlaylistUrl` existentes como item primario
(deriva el `s3Key` legacy `retreat-memories/{id}.webp` solo si la URL apunta a S3). Solo usa
`typeorm` + `uuid` (no importa `@repo/types`, regla de prod) y declara `transaction = false`.

`apps/api/src/migrations/sqlite/20260609190000_AddSourceToRetreatMemorySong.ts`: agrega la columna
`source` (`ALTER TABLE ADD COLUMN ... DEFAULT 'manual'`); las filas existentes quedan en `'manual'`.

## Tests

- **Backend (Jest)**:
  - `tests/services/retreatMemoryService.integration.test.ts` — invariante principal, promoción
    al borrar, recomputo del derivado; e **importación del MAM**: `importSongsFromMam` crea
    `source='mam'` titulado por el item, dedup en re-import, ignora URLs no-http y no afecta la
    principal manual ni `musicPlaylistUrl`.
  - `tests/controllers/retreatController.test.ts` — `importRetreatMemorySongsFromMam`: 400 si el
    retiro no terminó, 404 si no existe, importa cuando ya terminó.
  - `tests/services/retreatMemoryWriteSchemas.simple.test.ts` — guard de write schemas.
- **Frontend (Vitest)**: `components/__tests__/MemoryPhotoCarousel.spec.ts` (orden, navegación,
  fallback, lightbox), `MemoryUploadForm.spec.ts` (carga, agregar canción, marcar principal,
  **botón de importar MAM deshabilitado/habilitado según fin del retiro**),
  `RetreatMemoryCard.spec.ts` (galería, canciones, **sección MAM aparte**, fallback, vacío).
