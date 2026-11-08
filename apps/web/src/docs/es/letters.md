# Cartas de familias

📺 **[Ver video tutorial](https://youtu.be/b5ADc_QGmCE)**

Las cartas son la sorpresa del retiro: las familias de los participantes (caminantes **y**
servidores) escriben un mensaje de apoyo que se imprime y se entrega durante el fin de semana.
**No se menciona a los participantes antes de tiempo.**

Este módulo reemplaza la recolección manual por WhatsApp: cada participante obtiene una
**dirección de email única** y las cartas que llegan quedan organizadas para revisión e
impresión.

## Cómo funciona

Todo arranca en el **⋮** de arriba a la derecha: ahí están **Imprimir**, **Buzones**,
**Difundir** y **Activar buzones**.

1. **Activar buzones** — genera la dirección de cada participante activo del retiro (sin
   cancelados ni lista de espera). Es idempotente: si ya tienen dirección, no cambia nada.
2. **Difundir** — el mensaje por participante con su dirección, para copiar o mandar por
   WhatsApp a cada familia. Cada fila dice si ya se mandó («✓ Mandada el…») y puedes filtrar
   las que faltan. Bajo el título ves cuántos buzones están activos.
3. **Recibir** — la familia escribe a `carta.XXXX@emaus.cc` con texto y fotos. Si la dirección
   está mal escrita, el email **rebota** y la familia sabe que no llegó. Las cartas entran como
   *Por revisar*.
4. **Revisar** — en la **Bandeja** filtra por estado, mesa, palanquero, caminante o texto. Abre
   una carta para leerla completa; sus acciones (**Aprobar**, **Ocultar**, copiar dirección,
   imprimir) están en el **⋮** de su fila. Una carta oculta por error se puede volver a aprobar.
   Atajos: `j`/`k` para moverte, `Enter` para abrir, `a` aprueba, `o` oculta.
5. **Imprimir** — desde el ⋮ de arriba: **Solo las no impresas** (lo que falta, según tus
   filtros), el retiro completo, la mesa, las carpetas de un palanquero, el caminante filtrado
   o las cartas que marques con la casilla. Antes de imprimir ves la vista previa; al terminar
   te pregunta si salió bien, y **solo entonces** las marca como *Impresas*.

## Carpetas: el folder de cada caminante

La pestaña **Carpetas** (junto a Bandeja) muestra una fila por participante con el estado de
su folder: **✓ Completa**, **Faltan N** por imprimir o **N por revisar**. Desde ahí:

- **Click en la fila** abre sus cartas en la bandeja; **← Volver a Carpetas** te regresa a su
  fila.
- **Imprimir lo que falta** de esa persona, o **Imprimir todo lo que falta** de lo que estás
  viendo.
- Si no tiene cartas, dice si ya se le mandó la dirección a la familia y permite reenviarla.

## Para el palanquero

El selector de **palanquero** (junto a Bandeja | Carpetas) deja ver solo a sus caminantes, en
las dos vistas. La selección queda en el enlace de la página: copia la dirección del navegador
y mándasela al palanquero para que entre directo a sus carpetas. El último palanquero que
elegiste se recuerda en ese navegador.

## Qué sale en el papel

Solo **lo que escribió la familia**: el texto de la carta y sus fotos, **una carta por hoja**.
No se imprime el nombre del caminante, la mesa, quién la manda, la fecha ni el asunto, y el
navegador no agrega fecha ni dirección de la página. Como la hoja no dice de quién es, marca
**Incluir carátula** en la vista previa para que cada carpeta lleve una hoja con el nombre, la
mesa y cuántas cartas trae.

Si una hoja se perdió o salió mal: **⋮ → Quitar marca de impresa** (en la carta) o **Marcar la
carpeta como no impresa** (en Carpetas), y vuelve a imprimir lo que falta.

Si ya las imprimiste por otro lado (otra computadora, o cerraste la vista previa sin confirmar):
**⋮ → Marcar como impresa** (en la carta), **Marcar la carpeta como impresa** (en Carpetas) o,
con varias cartas seleccionadas, **⋮ de arriba → Marcar seleccionadas como impresas**. Solo se
marcan las aprobadas que faltaban.

## Cosas que conviene saber

- **Buzones**: en el dialog de buzones puedes apagar la dirección de un participante (abusos o
  petición expresa) — los emails a esa dirección rebotan hasta que la vuelvas a encender.
- **Fotos y documentos**: haz click en una foto para verla en grande (con flechas entre las
  fotos de la carta). Las familias también pueden mandar la carta como **PDF, Word,
  PowerPoint, Excel u OpenDocument**: se guardan, la carta lo indica con «📎 N adjuntos» y en
  su detalle **Abrir** muestra el PDF en una pestaña y **Descargar** baja el resto para abrirlo
  con su programa. Estos documentos y las fotos HEIC (iPhone) **no salen en el papel**: la
  vista previa los lista y Carpetas muestra «📎 N documentos» para imprimirlos aparte.
- **Lo que se descarta** (queda un aviso en la carta): ejecutables, comprimidos, páginas web,
  SVG y los documentos **con macros** (docm, pptm, xlsm o con macros dentro), por seguridad.
- **Reenvíos**: si una familia manda dos veces el mismo correo, se detecta y solo entra una.
  Un correo reenviado como mensaje nuevo entra como carta nueva — ocúltalo en la revisión.
- **Privacidad**: solo los roles con permiso de cartas (admin, logística, comunicaciones,
  superadmin) ven este módulo, y toda lectura queda en la auditoría.
- **Topes por carta**: máximo 10 adjuntos, 8 MB por adjunto y 12 MB en total. Lo que excede
  rebota o llega con un aviso.

## ¿Y las palancas?

La vista **Palancas** sigue siendo el control logístico de las cartas físicas entre hermandades
(cuántas se pidieron y cuántas llegaron). Este módulo es solo para las cartas que las familias
mandan por email. No se sincronizan entre sí.

## La variable en las plantillas de mensajes

Las plantillas de mensajes (globales y por retiro) ya incluyen una línea que informa el buzón
a la familia usando `{participant.letterMailbox}` — la variable resuelve a la dirección
completa del caminante (`carta.XXXX@emaus.cc`). También puedes agregarla a cualquier plantilla
nueva desde el selector de variables del editor.

**Importante**: la variable resuelve **vacía** si aún no activaste los buzones del retiro
("Activar buzones") o si apagaste el buzón de ese participante. Antes de enviar mensajes a
familias, activa los buzones.
