# Spec: Fotos del recuerdo grandes

**Estado**: implementado, D1-D4 aprobadas el 2026-10-19 · **Branch**: `worktree-memory-photo-resize` · **Fecha**: 2026-10-19

## Problema

En la pestaña **Recuerdos** del retiro (`RetreatModal` → `MemoryUploadForm`) no se pueden subir
las fotos tal como salen del celular:

- **El límite real es 2 MB, no los 5 MB que dice la pantalla.** El formulario deja pasar hasta
  5 MB, pero el servidor rechaza todo lo que pase de 2 MB binarios (`imageService`) y además el
  schema corta el data-URI en 4 M caracteres (≈ 2,9 MB). Una foto de celular pesa de 3 a 8 MB:
  falla siempre, con el mensaje del cliente (más de 5 MB) o con un error del servidor (entre 2 y 5 MB).
- **Lo que sí sube se recorta a un cuadrado de 512 px.** En producción (almacenamiento S3) la foto
  pasa por `processAvatar`, que la recorta a 512×512 desde el centro. Una foto de grupo pierde a
  la gente de las orillas, y el visor a pantalla completa muestra 512 px. Verificado por el dato:
  las 10 fotos que hay en `s3://emaus-media/retreat-memories/` miden 512×512, también las tres que
  se subieron el 2026-10-19 a las 12:41.
- **Un lote se corta con la primera falla.** Si se eligen varias fotos y una falla, las siguientes
  no se intentan y la galería no se recarga: las que sí subieron no aparecen hasta reabrir el modal.

## Objetivo

Elegir cualquier foto del celular o de la cámara y que suba sin más, completa y con resolución
suficiente para verla a pantalla completa.

## Decisiones

| # | Decisión | Alternativa descartada |
| --- | --- | --- |
| D1 | **Reducir en el navegador antes de subir**, con el `resizeImageToDataUrl` que ya existe: JPEG, lado mayor **1600 px**, calidad 0,85. Una foto así pesa de 0,3 a 1 MB. Los límites del servidor (2 MB, 4 M caracteres, body de 5 mb) **no cambian**: son la defensa contra DoS y quedan holgados. | Subir los límites del servidor: un base64 de 8 MB pasa de 10 MB por request, y el body JSON global de 5 mb afecta a todo el API. |
| D2 | **Dejar de recortar en el servidor**: las fotos del recuerdo se procesan como foto, sin recorte, con lado mayor de 1600 px (`fit: inside`) y en WebP. La foto de perfil sigue con su recorte a 512. | Mantener `processAvatar`: entonces reducir a 1600 px en el navegador no sirve de nada en prod, porque la foto se sigue guardando como cuadrado de 512. |
| D3 | **El archivo original puede pesar hasta 30 MB** (hoy 5 MB). Si pesa más, sale el aviso «supera los 30 MB». El tope es para no tumbar la pestaña del celular al decodificar la imagen. | Sin tope: un archivo enorme puede cerrar la pestaña en iOS sin dar ningún error. |
| D4 | **El lote no se corta**: si una foto falla, se sigue con las demás, se avisa cuál falló y la galería se recarga siempre al final. El cupo de 30 fotos cuenta también las que se van subiendo en el mismo lote. | Mantener el corte al primer error: con 10 fotos elegidas, la persona cree que no subió ninguna. |

## Historias

1. Como coordinador, elijo 6 fotos de 4 a 9 MB desde el celular y suben las 6 sin ningún aviso.
2. Como coordinador, abro una foto de grupo a pantalla completa y se ve la foto entera, nítida, sin recortar.
3. Como coordinador, si una de las fotos del lote está dañada, me avisa cuál fue y las demás sí suben.

## Requerimientos

- **R1** Toda foto JPG, PNG o WebP de hasta 30 MB se reduce en el navegador (D1) y se sube.
- **R2** En S3, la foto se guarda sin recortar y con lado mayor ≤ 1600 px (D2). Una foto más chica no se agranda.
- **R3** Archivo de más de 30 MB, o de otro formato: aviso con el nombre del archivo y no se sube (D3).
- **R4** Una falla, sea al reducir o al subir, no detiene el resto del lote; la galería se recarga al terminar (D4).
- **R5** Elegir más fotos que cupos libres sube solo las que caben (D4).
- **R6** El texto de ayuda deja de decir «máx. 5MB»: «JPG, PNG o WebP. Las fotos grandes se reducen solas.»

## Criterios de aceptación

- Test del formulario: un archivo de 8 MB llega a `addRetreatMemoryPhoto` ya reducido, y `resizeImageToDataUrl` se llama con `maxSide: 1600`.
- Test del formulario: de tres fotos, la segunda falla; la primera y la tercera se suben y `getRetreatMemories` se vuelve a llamar.
- Test del formulario: con 29 fotos y 3 elegidas, se sube una sola.
- Test del API (`retreatMemoryService`, modo S3): una imagen de 3000×2000 se sube como WebP de 1600×1067.
- En local, con el navegador: subir una foto real de celular de más de 5 MB y verla completa en el visor.

## Fuera de alcance

- **Las 10 fotos que ya están en S3 se quedan cuadradas.** El original nunca se guardó, así que no
  hay de dónde rehacerlas. Si se quieren completas, hay que volver a subirlas después del deploy.
- HEIC: el selector pide `image/jpeg,image/png,image/webp` y iOS convierte las fotos HEIC a JPEG al elegirlas.
- Un PNG con transparencia queda con fondo negro al pasarlo a JPEG. Es el comportamiento actual del
  utilitario compartido y no aplica a fotos de grupo.
- La ruta vieja `POST /:id/memory-photo` no se toca: usa el mismo `addPhoto`, así que hereda D2.
