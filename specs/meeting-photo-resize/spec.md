# Spec: Fotos de reunión grandes

**Estado**: implementado, D1-D3 heredadas y aprobadas · **Branch**: `worktree-meeting-photo-resize` · **Fecha**: 2026-10-19

Segunda instancia del defecto de `specs/memory-photo-resize/`, ahora en la foto de una reunión de la
comunidad (`/app/communities/:id/meetings`). El usuario pidió el arreglo el 2026-10-19 («ok arregla»).

## Problema

- **Una foto de celular no sube.** Los dos puntos de subida (el modal de la reunión y el botón
  «Subir foto» de la lista) rechazan en el navegador todo lo que pase de 2 MB, con «La imagen no puede
  exceder 2MB». Una foto de celular pesa de 3 a 8 MB.
- **Lo que sí sube se recorta a un cuadrado de 512 px.** En S3, `setMeetingPhoto` usa
  `processAvatar`. El visor de la foto (`object-contain`, hasta 75vh) muestra un cuadrado recortado y
  borroso. En `s3://emaus-media/community-meetings/` hay 12 objetos así.

## Decisiones

Heredadas de `specs/memory-photo-resize/spec.md`, ya aprobadas:

| # | Decisión |
| --- | --- |
| D1 | Reducir en el navegador antes de subir: `resizeImageToDataUrl`, JPEG, lado mayor **1600 px**. Los límites del servidor no cambian. |
| D2 | El servidor no recorta: la foto de reunión pasa por el mismo proceso sin recorte que la del recuerdo (`fit: inside`, 1600 px, WebP). |
| D3 | El original puede pesar hasta **30 MB**; más grande, aviso con el tamaño. |

D4 (lote que no se corta) no aplica: aquí se sube una foto por vez.

## Requerimientos

- **R1** En el modal y en la lista, una foto JPG/PNG/GIF/WebP de hasta 30 MB se reduce y se sube.
- **R2** En el modal, mientras la foto se reduce, «Guardar» queda deshabilitado: si no, guardar en ese
  segundo perdería la foto sin aviso.
- **R3** En S3 la foto se guarda sin recortar, con lado mayor ≤ 1600 px y sin agrandar.
- **R4** Más de 30 MB o un archivo que no es imagen: aviso y no se sube.

## Criterios de aceptación

- Test de la lista: una foto de 8 MB llega a `setMeetingPhoto` ya reducida, con `maxSide: 1600`.
- Test de la lista: más de 30 MB → aviso, no se reduce ni se sube.
- Test del modal: la foto elegida se reduce antes de guardarse, y «Guardar» está deshabilitado mientras tanto.
- Test del API (`communityMeetingPhoto.test.ts`, modo S3): 3000×2000 → WebP de 1600×1067.

## Fuera de alcance

- **Las 12 fotos de reunión que ya están en S3 se quedan cuadradas**: el original no se guardó.
- **El fondo del volante de la comunidad** (`CommunityMeetingFlyerView.vue`, `handlePickBackground`)
  tiene el mismo tope de 2 MB en el navegador; el servidor ya no recorta ahí (`storeFlyerAsset`).
  Es otra función: queda anotado en `troubleshooting` §37.
- El schema `setCommunityMeetingPhotoSchema` no acota el largo del data-URI (en modo base64 solo lo
  acota el body de 5 mb). Ya era así; en S3 lo acota `base64ToBuffer` (2 MB).
