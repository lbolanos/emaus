# Cartas de familias

📺 **[Ver video tutorial](https://youtu.be/b5ADc_QGmCE)**

Las cartas son la sorpresa del retiro: las familias de los participantes (caminantes **y**
servidores) escriben un mensaje de apoyo que se imprime y se entrega durante el fin de semana.
**No se menciona a los participantes antes de tiempo.**

Este módulo reemplaza la recolección manual por WhatsApp: cada participante obtiene una
**dirección de email única** y las cartas que llegan quedan organizadas para revisión e
impresión.

## Cómo funciona

1. **Activar buzones** — un solo botón genera la dirección de cada participante activo del
   retiro (sin cancelados ni lista de espera). Es idempotente: si ya tienen dirección, no
   cambia nada.
2. **Difundir** — genera el mensaje por participante con su dirección para copiar o mandar por
   WhatsApp a cada familia. También puedes copiar todas las direcciones de una vez para pegar
   en un grupo.
3. **Recibir** — la familia escribe a `carta.XXXX@emaus.cc` con texto y fotos. Si la dirección
   está mal escrita, el email **rebota** y la familia sabe que no llegó. Las cartas entran como
   *Por revisar*.
4. **Revisar** — en la bandeja filtra por estado, mesa o texto; abre cada carta (texto completo
   y fotos adjuntas) y márcala **Aprobar** u **Ocultar**.
5. **Imprimir** — imprime las cartas aprobadas por mesa o de todo el retiro: una sección por
   participante (orden por mesa), con las fotos incluidas. Lo impreso queda marcado como
   *Impresa* (puedes reimprimir cuando haga falta).

## Cosas que conviene saber

- **Buzones**: en el dialog de buzones puedes apagar la dirección de un participante (abusos o
  petición expresa) — los emails a esa dirección rebotan hasta que la vuelvas a encender.
- **Fotos no imprimibles**: si una familia manda fotos en formato HEIC (iPhone) o PDF, se
  guardan pero no salen en el papel — la carta lleva un aviso. Pide que la reenvíen en JPG/PNG.
- **Reenvíos**: si una familia manda dos veces el mismo correo, se detecta y solo entra una.
  Un correo reenviado como mensaje nuevo entra como carta nueva — oclúyala en la revisión.
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
