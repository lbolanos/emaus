# Spec: Editor de volante de retiros

**Estado**: en desarrollo · **Branch**: `worktree-flyer-editor` · **Fecha**: 2026-09-02

## Problema

El volante del retiro (`/app/retreats/:id/flyer`) es un lienzo de 850px con ocho tarjetas en
`position:absolute` con coordenadas hardcodeadas en píxeles. Consecuencias medidas:

- **No se puede reorganizar**: el orden y la posición de cada tarjeta están en el código. Un retiro
  sin costo o sin QR deja un hueco; un retiro con mucha información recorta contenido
  (`max-height` + `overflow-hidden`, y `truncate` en los ítems de "Qué llevar").
- **No se pueden cambiar las imágenes**: fondo del cuerpo, encabezado, pie y logotipo apuntan a
  rutas fijas de `apps/web/public/`.
- **Personalizar es a ciegas**: los ~19 textos configurables se editan en una pestaña del
  `RetreatModal` (2014 líneas) sin vista previa, o en un `<textarea>` de JSON crudo.
- **Nada se reutiliza**: cada retiro se configura desde cero.

## Objetivo

Un editor de volante que cualquier coordinador pueda usar sin ayuda, cuyo resultado se vea
profesional por construcción, y cuyo diseño se reutilice entre retiros.

## Alcance

### Incluido

1. **Bloques reordenables.** El cuerpo del volante se compone de ocho bloques (intro, inicio, fin,
   ubicación, contacto, costo/pago, qué llevar, QR de registro) que el usuario reordena por
   arrastre entre tres celdas de un grid gestionado (`left`, `right`, `wide`), y puede ocultar o
   mostrar. Encabezado, banner y pie son fijos.
2. **Imágenes cambiables.** Fondo del cuerpo, imagen de encabezado, imagen de pie y logotipo:
   elegibles de una galería de presets (los assets actuales) o subiendo una propia.
3. **Plantillas reutilizables.** Guardar el diseño completo (bloques + imágenes + textos) como
   plantilla nombrada, con alcance personal o de comunidad, y aplicarla a otro retiro.
4. **Textos con vista previa en vivo**: los overrides existentes se editan en el editor, viendo el
   resultado al instante.

### Excluido

- Los volantes de reuniones de comunidad (`apps/web/src/components/flyers/*`) — sistema aparte,
  no se toca.
- Lienzo libre en píxeles estilo Canva (evaluado y descartado: mayor coste, produce volantes
  desalineados, complica impresión y responsive).
- Tipografías y colores configurables (posible extensión futura).
- `PublicRetreatFlyerModal.vue` (el volante público de la landing) no lee `flyer_options`;
  queda fuera y no debe romperse.

## Restricciones

- **Retrocompatibilidad**: los retiros existentes tienen `flyer_options` v1 y deben seguir
  viéndose prácticamente igual sin migrar sus datos.
- **Impresión, PDF y copiar-imagen** deben seguir funcionando (operan sobre `#printable-area`
  con `html-to-image` + `jsPDF`).
- **CSP de producción**: `img-src 'self' https: data:` — nada de `blob:` en el cliente.
- **Texto de UI en español** vía i18n; código e identificadores en inglés.

## Criterios de aceptación

1. Un retiro con `flyer_options` v1 (p.ej. Buen Despacho) se ve equivalente al volante actual sin
   tocar su fila en la base.
2. El coordinador puede mover un bloque de la columna izquierda a la derecha o a la fila ancha, y
   ocultarlo, viendo el cambio en la vista previa; al guardar y recargar, el diseño persiste.
3. El coordinador puede cambiar las cuatro imágenes, incluida una propia subida desde su
   dispositivo, y el resultado aparece en el volante publicado, en el PDF y en la imagen copiada.
4. El coordinador puede guardar el diseño como plantilla y aplicarla a un retiro distinto.
5. Una plantilla de comunidad es visible y editable por cualquier administrador activo de esa
   comunidad, y no por terceros.
6. Guardar el retiro desde otra pestaña del `RetreatModal` no borra el diseño del volante.
