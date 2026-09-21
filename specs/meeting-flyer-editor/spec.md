# Spec: Editor del flyer de reunión de comunidad

**Estado**: en desarrollo · **Branch**: `master` (local) · **Fecha**: 2026-09-21

## Problema

El flyer de reunión (`/app/communities/:id/meetings/:meetingId/flyer`) ofrece hoy tres estilos
fijos (Default/Poster/WhatsApp) más dos ajustes de identidad por comunidad (fondo y transparencia
del recuadro). El coordinador no puede:

- **Reorganizar** la información: cada estilo tiene el orden y la jerarquía hardcodeados.
- **Ajustar textos puntuales**: solo puede reescribir la descripción de la reunión; el kicker,
  etiquetas y pie no se tocan.
- **Estilar por bloque**: la transparencia del recuadro es un único dial global; no hay tema ni
  colores por bloque.
- **Reutilizar nada**: cada estilo es código; la única personalización persistente es el fondo.

El flyer del retiro ya resolvió esto con un editor completo (`specs/flyer-editor/`, doc maestra
`docs/features/retreat-flyer-editor.md`). Este spec replica ese patrón para reuniones.

## Decisiones de dominio (cerradas con Leonardo, 2026-09-21)

1. **Paridad completa con el editor del retiro**: bloques arrastrables, tema/estilos por bloque,
   overrides de texto, imágenes, deshacer, aviso de salida con cambios sin guardar.
2. **El diseño es identidad de COMUNIDAD**, no de la reunión: vive en `community.flyerOptions` y
   todas las reuniones lo heredan. Coherente con la decisión previa de que
   `flyerBackgroundUrl`/`flyerCardOpacity` viven en `community`.
3. **Convive como 4º estilo "Personalizado"**: Default/Poster/WhatsApp quedan intactos; el
   selector gana una cuarta opción que renderiza el canvas editable.
4. **Sin plantillas de diseño en v1**: con diseño por comunidad (una comunidad = un diseño), la
   pestaña Plantillas del retiro no se replica. Se puede añadir después sin romper nada.

## Objetivo

Que el coordinador de una comunidad diseñe el flyer de sus reuniones una sola vez —con la misma
potencia que el editor del retiro— y que todas las reuniones de esa comunidad lo hereden.

## Historias

1. Como coordinador, abro el flyer de una reunión, elijo "Personalizado" y entro al editor, donde
   veo el volante con los datos de ESA reunión y el diseño guardado de mi comunidad (o el diseño
   inicial si es la primera vez).
2. Como coordinador, muevo bloques (fecha/hora, descripción, ubicación, QR, branding) arrastrando
   sobre el volante o con flechas, los oculto con el ojo, y veo el cambio al instante.
3. Como coordinador, aplico un tema de colores, ajusto el velo sobre el fondo y el estilo de cada
   bloque (fondo, color de texto, alineación), con el aviso de contraste y el "ajustar colores a
   la imagen".
4. Como coordinador, cambio las cuatro imágenes (fondo del cuerpo, encabezado, pie, logo) con
   presets o subiendo las mías.
5. Como coordinador, reescribo textos puntuales (kicker, título, etiquetas, pie) sin tocar la
   reunión, u oculto los que sobran; lo vacío usa el valor por defecto (marca de agua).
6. Como coordinador, me equivoco y deshago (⌘Z); si salgo sin guardar, se me pregunta.
7. Como coordinador, guardo; al volver (a esa u otra reunión de la comunidad) el diseño está.

## Requerimientos

- Canvas de 850px con chrome fijo (header con título de la reunión + footer) y grid
  `left`/`right`/`wide` con 5 bloques: `dateTime`, `description`, `location`, `locationQr`,
  `community`.
- 8 overrides de texto + `hiddenTexts` (mismo mecanismo del retiro).
- Imágenes: mismas 4 keys que el retiro (`bodyBackground`, `headerBackground`,
  `footerBackground`, `logo`), subida por `POST /flyer-assets` existente.
- Persistencia: columna `community.flyer_options` (simple-json, nullable) vía
  `PUT/DELETE /api/communities/:id/flyer-options`. El PUT reemplaza la columna entera → el editor
  arrastra lo que no toca (`untouchedOptions`).
- Impresión (una página, `--flyer-print-scale`), copiar imagen (`domToBlob`) y los tres estilos
  legacy siguen funcionando igual.
- Semilla: al abrir el editor sin diseño guardado, `images.bodyBackground` parte de
  `community.flyerBackgroundUrl || '/poster.png'`.
- En custom, el fondo es `images.bodyBackground` del diseño; `flyerBackgroundUrl` /
  `flyerCardOpacity` siguen mandando para Poster/WhatsApp.

## Criterios de aceptación

1. Una comunidad sin diseño guardado ve el estilo Personalizado con el layout por defecto y su
   fondo actual — sin tocar su fila de la base.
2. Mover/ocultar un bloque se refleja en el preview al instante; guardar y recargar persiste el
   diseño, y OTRA reunión de la misma comunidad lo muestra igual.
3. Cambiar las cuatro imágenes (incluida una subida) aparece en el flyer publicado, la impresión
   y la imagen copiada.
4. Los overrides de texto vacíos usan el default (placeholders con marca de agua); ocultar con el
   ojo no borra lo escrito.
5. La suite del editor del retiro queda verde SIN editar un solo test de los existentes.
6. Default/Poster/WhatsApp no cambian en nada (incluido el popover Fondo y el slider de
   transparencia).
7. Guardar el diseño no borra `flyerBackgroundUrl` ni `flyerCardOpacity` de la comunidad, ni nada
   de lo que otras pantallas guarden en la misma fila.

## Fuera de alcance

- Plantillas de diseño reutilizables (v1 sin la pestaña Plantillas).
- Editar el diseño por reunión individual (el diseño es de comunidad).
- Los estilos Default/Poster/WhatsApp y su popover Fondo/transparencia.
- El volante público del retiro (`PublicRetreatFlyerModal.vue`) — sin relación.
- Tipografías configurables.
- Contenido prohibido en superficies públicas: sin palancas/cartas, dinámicas internas, becas ni
  montos en los textos por defecto.
