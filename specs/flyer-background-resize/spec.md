# Spec: Fondo del volante de la comunidad con fotos grandes

**Estado**: implementado · **Branch**: `worktree-flyer-background-resize` · **Fecha**: 2026-10-19

Tercera instancia del defecto de `specs/memory-photo-resize/` y `specs/meeting-photo-resize/`,
ahora en el fondo del volante de una reunión (`/app/communities/:id/meetings/:meetingId/flyer`,
estilos «Poster» y «WhatsApp» → «Fondo» → «Subir mi imagen…»). El usuario pidió el arreglo el
2026-10-19 («2. ok dale»). Cambio chico: spec, plan y tareas van en este archivo.

## Problema

`handlePickBackground` (`apps/web/src/views/CommunityMeetingFlyerView.vue`) rechaza en el navegador
todo lo que pase de 2 MB con «La imagen no puede exceder 2MB». Una foto de celular pesa de 3 a 8 MB.

El servidor ya está bien: `setFlyerBackground` → `storeFlyerAsset(…, 'bodyBackground')` →
`processWithoutCrop` a 1600 px, sin recortar, WebP. No cambia.

El estilo «Personalizado» (`custom`) sube su fondo por `FlyerImagePicker.vue`, que ya reduce en el
navegador. No se toca.

## Decisiones

| # | Decisión |
| --- | --- |
| D1 | Heredada: reducir en el navegador con `resizeImageToDataUrl`, lado mayor **1600 px** (el mismo de `MAX_FLYER_BACKGROUND_SIZE` del servidor), calidad 0.9 como `FlyerImagePicker`. |
| D2 | Heredada: el original puede pesar hasta **30 MB** (`MAX_PHOTO_SOURCE_BYTES`). |
| D3 | Nueva: **solo se reduce lo que pasa de 2 MB.** La reducción produce JPEG, que no tiene transparencia, y el servidor guarda WebP, que sí. Lo que hoy sube (≤ 2 MB) se manda igual que antes y conserva la transparencia de un PNG. |

## Requerimientos

- **R1** Una imagen PNG/JPG/WebP de más de 2 MB y hasta 30 MB se reduce y se guarda como fondo.
- **R2** Una de 2 MB o menos se manda tal cual, sin reducir.
- **R3** Más de 30 MB, o un archivo que no es imagen: aviso, y no se sube.
- **R4** Mientras se reduce, el botón «Fondo» muestra «Guardando...» y queda deshabilitado.

## Criterios de aceptación (tests de `CommunityMeetingFlyerView.test.ts`)

- 8 MB → `resizeImageToDataUrl` con `maxSide: 1600`, y `setFlyerBackground` recibe el data-URI reducido.
- 1 MB → no se reduce; `setFlyerBackground` recibe el archivo leído tal cual.
- 31 MB → aviso con «30MB»; ni se reduce ni se sube.

## Plan y tareas

- [x] `imageResize.ts`: los comentarios de `PHOTO_MAX_SIDE` y `MAX_PHOTO_SOURCE_BYTES` incluyen el fondo del volante
- [x] `handlePickBackground`: tope de 30 MB, reducir si pasa de 2 MB, «Guardando...» desde antes de reducir
- [x] Tests (los tres criterios y R4); suite web completa (224 archivos, 3351 tests), `vue-tsc` y lint
- [x] `troubleshooting` §37: el fondo del volante ya no es el caso pendiente

Desviaciones:

- `imageResize.ts` exporta además `SERVER_MAX_IMAGE_BYTES` y `readAsDataUrl` (antes privada), para
  que D3 no repita el `FileReader` en la vista.
- Se agregó un cuarto test, para R4 («Guardando...» mientras se reduce). Los cuatro se comprobaron por
  mutación: con la vista de master fallan los cuatro, y si «Guardando...» se activa después de
  reducir falla el de R4.
- Probado en vivo en el dev del worktree: una foto de 4032×3024 y 6.5 MB, con el estilo Poster, se
  guardó como WebP de 1600×1200 y el volante la muestra de fondo.
- La auditoría de §37 encontró otro caso: la foto de perfil (`AvatarUpload.vue`) corta en 2 MB y sube
  el archivo crudo. Queda fuera de este cambio y anotada en §37.

## Fuera de alcance

- Un PNG con transparencia de más de 2 MB pierde la transparencia (el JPEG la pinta de negro). Es raro
  en un fondo, y antes ni siquiera subía.
- Los fondos que ya están guardados no cambian: el servidor nunca los recortó.
