# Spec: Foto de los participantes de la mesa para el recuerdo

**Estado**: implementada y verificada 2026-10-20, pendiente de merge · **Branch**: `worktree-mesas-ux-foto` · **Fecha**: 2026-10-19

## Problema

No hay forma de adjuntar a cada mesa la foto de sus participantes. Hoy esa foto vive solo en
WhatsApp (con la compresión q50 del reenvío, que la degrada para siempre) y el armador del
recuerdo tiene que pedirla de vuelta. La galería **Recuerdos del Retiro** existente
(`retreat_memory_photo`, visible para participantes en "Mis Retiros") solo tiene fotos genéricas
del retiro, sin noción de mesa; y el botón cámara que ya vive en cada card es otra cosa
(`PhotoAssignmentDialog`: asigna walkers leyendo la foto, no la guarda).

## Objetivo

Que quien administra mesas pueda subir, cambiar y eliminar **una foto por mesa**, que se vea como
miniatura en el card de la mesa y en la galería "Recuerdos del Retiro" de "Mis Retiros" con la
etiqueta "Mesa N" — reutilizando la infraestructura de la galería (S3 privado + presign + resize).

## Decisiones

| # | Decisión | Alternativa descartada |
| --- | --- | --- |
| D1 | **Columnas `photoUrl` + `photoS3Key` en `tables`** (patrón "una foto por entidad" de `communityMeeting`), y la galería agrega las fotos de mesa en los **dos únicos puntos de lectura** (`retreatMemoryService.listMemories` y `retreatController.getAttendedRetreats`) vía un helper compartido. Cada foto tiene un único dueño (la mesa): no hay doble escritura ni sincronización. | **(ii)** FK `table_id` en `retreat_memory_photo`: exige recreate completo de la tabla (SQLite no tiene `ADD CONSTRAINT`), contamina el cupo `MAX_MEMORY_PHOTOS`, el invariante una-foto-principal y el mirror `retreat.memoryPhotoUrl`. **(iii)** Espejo en dos tablas: sync en cada write-path; un camino olvidado muestra fotos fantasma en la galería o huérfanas en el card. |
| D2 | **Key S3 `retreat-memories/{retreatId}/tables/{tableId}.webp`**, dentro del prefijo privado existente: `presignPrivateUrl` y `deleteRetreatMemoryPhotoByKey` se reutilizan sin cambios y la policy IAM (que cubre `bucket/*`) no cambia. Key fija por mesa ⇒ subir de nuevo reemplaza. | Prefijo nuevo `table-photos/`: habría que sumarlo a `PRIVATE_PREFIXES` sin ganar nada a cambio. |
| D3 | **Items de galería derivados en lectura**: `{ id: tableId, url, isPrimary: false, sortOrder: 1000+i, label: table.name, source: 'table' }` al final del array de fotos. No cuentan para `MAX_MEMORY_PHOTOS`, no pueden ser principales, y el label se deriva del nombre de la mesa en cada lectura (renombrar la mesa actualiza la galería solo). | Persistir filas de galería al subir: vuelve al problema de sync de (iii). |
| D4 | **Sube quien administra mesas**: endpoints `PUT/DELETE /tables/:id/photo` con `requirePermission('table:update')` + `ensureRetreatAccess` (igual que `updateTable`). | Que el líder de mesa pueda subir la foto de su mesa: superficie de permisos nueva (endpoint acotado al líder); queda para otra spec si se pide. |
| D5 | **Procesado como foto de grupo**, igual que la spec `memory-photo-resize`: `resizeImageToDataUrl` (1600 px, en el navegador) + `imageService.processPhoto` (1600 inside, **sin** crop — `processAvatar` recorta a cuadrado y cortaría gente) + WebP. | Reusar el pipeline del avatar: destruiría la foto de grupo (recorte 512). |
| D6 | **Limpieza de S3 en los caminos de borrado de mesa** (`deleteTable`, y el bulk de `rebalanceTablesForRetreat` pasa por ahí). El borrado de retiro no limpia objetos: la key es determinista y un re-upload sobreescribe. | Declarar todos los borrados best-effort: el bulk de rebalance borra mesas en masa y dejaría basura silenciosa en el bucket. |

## Historias

1. Como coordinador, al cerrar el retiro subo desde el celular la foto de cada mesa y la veo como
   miniatura en su card.
2. Como coordinador, cambio la foto de una mesa (reemplazo) o la quito, sin dejar objetos viejos.
3. Como caminante, en "Mis Retiros" veo la foto de mi mesa en la galería del retiro, etiquetada
   "Mesa N".
4. Como coordinador, el grid admin de Recuerdos (`MemoryUploadForm`) no me deja borrar ni reordenar
   las fotos de mesa: se gestionan desde Mesas.

## Requerimientos

- **R1** `PUT /tables/:id/photo` acepta un data-URI (mismo schema zod que la galería), exige
  `table:update` + acceso al retiro de la mesa, y devuelve la mesa completa con la URL presignada (D4).
- **R2** La foto se guarda a lado mayor ≤ 1600 px, sin crop, WebP en S3; en dev sin keys (modo
  base64) queda como data-URI en la columna (D5).
- **R3** `GET /tables/retreat/:retreatId` y `GET /tables/:id` devuelven `photoUrl` presignada (las
  data-URIs pasan sin tocar); `tableMesaSchema` acepta el campo nuevo sin romper el `.array().parse`
  de `findTablesByRetreatId` (D1).
- **R4** La galería (`GET /retreats/:id/memories` y `GET /retreats/attended`) incluye las fotos de
  mesa al final, con `label` = nombre de mesa, `source: 'table'`, no principales y fuera del cupo;
  el carrusel de "Mis Retiros" muestra el label como badge (D3).
- **R5** `DELETE /tables/:id/photo` borra el objeto S3 y anula las columnas; borrar una mesa (o el
  rebalance que elimina mesas vacías) también limpia su objeto S3 (D6).
- **R6** Un retiro cuya única señal de recuerdo son fotos de mesa aparece en "Mis Retiros" (el gate
  del `retreatMemoryStore` cuenta las fotos lleguen de donde lleguen) (D3).

## Criterios de aceptación

- Test de migración (patrón `.simple.test.ts`): up agrega las dos columnas sobre una tabla `tables`
  con filas y los datos previos quedan intactos; down las quita.
- Test de servicio (`tableMesaService`): subir en modo S3 llama `processPhoto` y
  `uploadTablePhoto` con la key `retreat-memories/{rid}/tables/{tid}.webp` y persiste url/key; en
  modo base64 persiste el data-URI; `removeTablePhoto` borra el objeto y anula; `deleteTable` con
  foto borra el objeto; ambos readers devuelven la URL presignada y el `.parse` pasa con
  `photoUrl: null` y con URL.
- Test de servicio (`retreatMemoryService`): `listMemories` agrega las fotos de mesa al final con
  label/source/sortOrder correctos, sin contarlas para `MAX_MEMORY_PHOTOS`.
- Test de controller: PUT/DELETE photo → 400 con body inválido, 404 mesa inexistente, 200 con la
  mesa.
- Test web (`TableMemoryPhotoDialog`): un archivo grande llega al store ya reducido
  (`resizeImageToDataUrl` con `maxSide: 1600`); error de subida → toast destructivo; eliminar llama
  `removeTablePhoto`.
- Test web (`MemoryPhotoCarousel`): foto con `label` pinta el badge; sin label no pinta nada.
- Verificación manual en el worktree: subir una foto real en una mesa del retiro demo (San Agustín),
  ver la miniatura en el card, verla en "Mis Retiros" con la etiqueta "Mesa N", reemplazarla y
  eliminarla.

## Fuera de alcance

- Generar el cartel-recuerdo vertical desde la app (sigue armándose fuera, con la skill
  `retreat-keepsakes`; ahora podrá descargar las fotos originales de mesa desde la galería admin).
- Que el líder de mesa suba la foto de su mesa.
- Limpiar objetos S3 al borrar un retiro completo (key determinista; un re-upload sobreescribe).
- Reordenar fotos de mesa dentro de la galería ni marcarlas como principales.
- Fotos históricas: no hay backfill, las columnas nacen vacías.

## Reconcile (cierre)

**Implementada y verificada el 2026-10-20** en `worktree-mesas-ux-foto` (commits 09770f3f B1,
3eecbfc9 B2, d3af22bb B3). Suites tocadas: 48/48 tests verdes (Jest api + Vitest web), builds
api/web verdes. Verificación manual en Playwright 390×844 contra el retiro demo **Buen
Despacho** (`e9b3c568`, 10 mesas) — no San Agustín como decían los criterios: Buen Despacho
tenía mesas con walkers y sin fotos previas de mesa.

Verificado contra los criterios:

- Migración `.simple.test.ts`: up añade las dos columnas sobre filas existentes, down las quita.
- `tableMesaService` (13 tests): key S3 correcta + `processPhoto` sin crop, modo base64,
  `removeTablePhoto`, `deleteTable` limpia S3, presign en ambos readers, `.parse` con
  `photoUrl: null` y con URL.
- `retreatMemoryService.tablePhotos.test.ts`: merge con `label`/`source`/`sortOrder 1000+i`
  fuera del cupo `MAX_MEMORY_PHOTOS`.
- Controller (11 tests): 400/404/200 en PUT y DELETE.
- Web: `TableMemoryPhotoDialog` (5: reduce antes de subir, error → toast, eliminar, re-elegir
  descarta preview, reabrir sin preview vieja), `MemoryPhotoCarousel` (badge con/sin label),
  `MemoryUploadForm` (filtra `source: 'table'` + hint).
- Manual end-to-end: subir PNG 1200×800 (sintético, bajo `.playwright-mcp/`) en "Mesa 1" vía ⋮ →
  "Foto del recuerdo" → miniatura `table-photo-thumb` en el card; `GET /retreats/attended`
  devuelve `photoCount: 4` con `{label: 'Mesa 1', source: 'table'}`; carrusel de "Mis Retiros"
  la muestra como slide 4/4 con badge **"Mesa 1"**.

Desviaciones:

1. **Hint de `MemoryUploadForm` hardcodeado en español** ("Las fotos de las mesas (N) se
   gestionan desde la vista de Mesas.") en vez de la key `social.memories.tablePhotosHint`: ese
   componente no usa i18n (toda su UI es español literal) y añadir la key solo para el hint
   dejaba un archivo bilingüe a medias. Deuda: si algún día se internacionaliza el componente,
   el hint migra con el resto.
2. **Reemplazar y eliminar no se ejecutaron en browser**: del reemplazo se vio el preview con
   aviso ("al guardar se reemplaza la foto actual") pero no se guardó; la eliminación quedó en
   los tests unitarios (dialog → `removeTablePhoto`, service → borra S3 y anula). Pendiente de
   ejercicio real en el primer uso.
3. **R6 verificado por código, no end-to-end**: el gate de `retreatMemoryStore` cuenta
   `memoryPhotos.length` y las fotos de mesa viajan en ese mismo array (confirmado por el
   fetch), pero no existía un retiro cuya *única* señal fueran fotos de mesa para probar la
   pantalla completa.
4. **En dev (base64) la foto persiste como data-URI JPEG**, no WebP: el WebP es del path S3
   (`processPhoto` + `uploadTablePhoto`). Conforme a R2, que para dev solo exige data-URI.

Lo descartado se mantiene descartado: sin FK en `retreat_memory_photo`, sin espejo en dos
tablas, sin backfill, sin endpoint para el líder de mesa, sin cartel vertical in-app.
