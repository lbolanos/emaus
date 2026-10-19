# Spec: Foto de perfil grande

**Estado**: implementado · **Branch**: `worktree-flyer-background-resize` · **Fecha**: 2026-10-19

Cuarta instancia del defecto de `specs/memory-photo-resize/`, ahora en la foto de perfil («Mi Perfil»,
`/app/profile`, botón de la cámara sobre el avatar). La encontró la auditoría de `troubleshooting` §37
al cerrar `specs/flyer-background-resize/`, y el usuario pidió el arreglo el 2026-10-19 («ok mi perfil
también»). Va en la misma rama que el fondo del volante para salir en un solo deploy. Cambio chico:
spec, plan y tareas van en este archivo.

## Problema

`AvatarUpload.vue` rechaza en el navegador todo lo que pase de 2 MB (`maxSize: 2048`, en KB) y sube el
archivo crudo. Una foto de celular pesa de 3 a 8 MB, así que desde el teléfono la foto de perfil no sube.

El servidor está bien y no cambia: `avatarStorageService.uploadAvatar` → `processAvatar`, que corta en
2 MB y, si el ancho pasa de 512 px, recorta a un cuadrado de 512. Para una cara el recorte es correcto.

## Decisiones

| # | Decisión |
| --- | --- |
| D1 | Reducir en el navegador con `resizeImageToDataUrl` a **512 px** de lado mayor (el default), como ya hace `MemberPhotoDialog.vue` con la foto de rostro. Con 512 el ancho nunca pasa de 512, así que `processAvatar` no la vuelve a recortar ni la agranda. El avatar más grande se pinta a 192 px. |
| D2 | Heredada: el original puede pesar hasta **30 MB** (`MAX_PHOTO_SOURCE_BYTES`). |
| D3 | Heredada de `flyer-background-resize`: **solo se reduce lo que pasa de 2 MB.** Lo que hoy sube se manda igual que antes, y conserva la transparencia de un PNG. |
| D4 | Se quita la prop `maxSize` de `AvatarUpload`: su único llamador (`ProfileView`) pasaba el mismo 2048 del default, y el límite ahora lo fijan las constantes compartidas. |

## Requerimientos

- **R1** Una imagen de más de 2 MB y hasta 30 MB se reduce a 512 px y se emite reducida.
- **R2** Una de 2 MB o menos se emite tal cual, sin reducir.
- **R3** Más de 30 MB, o un archivo que no es imagen: aviso, y no se emite nada.
- **R4** Mientras se reduce, el botón de la cámara queda deshabilitado, para que un segundo toque no
  abra otro selector.
- **R5** El texto de ayuda deja de prometer «máx 2MB».

## Criterios de aceptación (`components/social/__tests__/AvatarUpload.test.ts`, nuevo)

- 8 MB → `resizeImageToDataUrl` sin `maxSide` (512), y `upload` emite el data-URI reducido.
- 1 MB → no se reduce; `upload` emite el archivo leído tal cual.
- 31 MB → aviso con «30MB»; ni se reduce ni se emite.
- Mientras se reduce, el botón de la cámara está deshabilitado.

## Plan y tareas

- [x] `AvatarUpload.vue`: tope de 30 MB, reducir si pasa de 2 MB, botón deshabilitado mientras tanto; sin `maxSize`
- [x] `ProfileView.vue` y su test: sin `:max-size`
- [x] `es.json`: `uploadInfo` y `fileTooLarge`
- [x] Tests (los cuatro criterios); suite web completa (225 archivos, 3357 tests), `vue-tsc` y lint
- [x] `troubleshooting` §37: ya no queda la foto de perfil como pendiente

Desviaciones:

- Dos tests más de los cuatro del criterio: el aviso cuando la reducción falla, y el texto en español
  (no promete un tope en MB y `fileTooLarge` dice MB). Con el componente de master fallan los cinco
  de comportamiento.
- Probado en vivo en el dev del worktree: la foto de 4032×3024 y 6.5 MB se guardó como JPEG de
  512×384 y unos 48 KB, y el avatar la muestra. En dev el avatar se guarda en base64 tal como llega;
  el paso por `processAvatar` (prod, S3) no se probó en vivo. Con ancho 512 no entra en su recorte.

## Fuera de alcance

- `en.json` no tiene ninguna clave `social.avatar.*`. El hueco ya estaba y en inglés se pintan las
  claves crudas. Va aparte.
- Un GIF animado de más de 2 MB queda como JPEG fijo. En S3 ya quedaba fijo, porque `sharp` lee solo
  el primer cuadro.
