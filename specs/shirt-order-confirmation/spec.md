# Spec: Confirmación del pedido de camisetas (servidores)

**Estado**: en desarrollo · **Branch**: `shirt-order-confirmation` (worktree) · **Fecha**: 2026-09-21

## Problema

El proceso real de camisetas del equipo servidor: se lanza la secuencia de WhatsApp
"Confirmación de camisetas (servidores)" (plantillas `SERVER_SHIRT_CONFIRMATION` /
`_REMINDER`, migración `20260910120000`), el servidor responde confirmando sus tallas y su
cargo, y el coordinador le da por bueno. Hoy **no queda rastro de quién ya confirmó**: la
cuadratura se hace imprimiendo el "Reporte de Camisetas" (`ShirtsReportView.vue`, ruta
`shirts-report`) y palomeando a mano la columna ✓ que solo aparece al imprimir.

El sistema ya sabe qué prendas pide cada servidor (`participant_shirt_size` +
`retreat_shirt_type`) y ya envía el mensaje. Faltan dos cosas:

1. El flag **"confirmado"** por servidor que el coordinador marca al recibir la respuesta.
2. Un botón para **abrir rápido la conversación de WhatsApp** del servidor y verificar si ya
   contestó — las respuestas viven en el teléfono (los envíos de Emaús son deep-link asistido:
   la app solo registra lo que se envió, nunca lo que contestaron).

## Decisiones de dominio (cerradas con Leonardo, 2026-09-21)

1. **Por retiro**: el flag vive en la fila `retreat_participants` (retiro×participante), como
   `bagMade` o `attendanceConfirmation`.
2. **Un solo estado**: sin confirmar ↔ confirmado. Columna `shirtOrderConfirmedAt` datetime
   nullable (null = sin confirmar; el timestamp registra cuándo se dio el chulo). No hay
   estado intermedio.
3. **Lo marca el coordinador/admin** (`participant:update`) cuando el servidor responde. Sin
   parsing automático de la respuesta de WhatsApp.
4. **Evolucionar el "Reporte de Camisetas"**, no una vista nueva: misma ruta `shirts-report`,
   sin entrada de sidebar. El reporte ya lista exactamente a los interesados (server +
   partial_server con ≥1 prenda pedida).
5. **Contador X/Y sobre `participants.length`**: el INNER JOIN del reporte garantiza que todo
   listado pidió ≥1 prenda; quien no pidió nada no entra al flujo de confirmación.
6. **Botón WhatsApp por fila**: link `wa.me` del participante (`buildWhatsAppChatLink`,
   `apps/web/src/utils/phone.ts`) — abre la conversación real sin texto precargado. El reporte
   debe devolver `cellPhone` y `country` (hoy no los devuelve). Oculto sin teléfono.

## Objetivo

Que el coordinador abra el reporte, vea de un vistazo "Confirmados 9/15", entre a la
conversación de WhatsApp de cada pendiente con un clic, y al ver la confirmación le dé el
chulo sin salir de la vista.

## Historias

1. Como coordinador, abro el Reporte de Camisetas y veo la stat card "Confirmados X/Y".
2. Como coordinador, hago clic en el botón de WhatsApp de un servidor y se abre su
   conversación real; leo si confirmó.
3. Como coordinador, al ver la confirmación hago clic en el badge "● Sin confirmar" y pasa a
   "✓ Confirmado" al instante (optimista), sin recargar la página.
4. Como coordinador, activo "Solo sin confirmar" para trabajar la lista de pendientes, y la
   impresión sigue sirviendo de lista de control con el ✓ ya marcado para los confirmados.
5. Como coordinador, si el guardado falla, el badge vuelve a su estado anterior y veo un toast.

## Requerimientos

- Columna `retreat_participants.shirtOrderConfirmedAt` (datetime, nullable) vía migración
  única SQLite, idempotente, reversible, sin importar `@repo/types`.
- `GET /retreats/:retreatId/shirt-report` incluye por participante `shirtOrderConfirmedAt`
  (string ISO/SQLite, nullable), `cellPhone` y `country` (nullable).
- `PATCH /history/retreat/:retreatId/participant/:participantId/shirt-order-confirmation`
  body `{ confirmed: boolean }` — `true` setea `new Date()`, `false` limpia a null. Auth:
  `isAuthenticated` + `participant:update` + `requireRetreatAccess('retreatId')` (patrón
  `bag-made`).
- Toggle optimista en la vista con rollback + toast de error y guard anti doble-tap (patrón
  `CommunityAttendanceView.toggleAttendance`). Sin refetch del reporte tras el toggle.
- La columna ✓ print-only refleja el estado real (✓ para confirmados, cuadrito vacío para
  pendientes); la columna "Confirmado" en pantalla lleva `no-print`.
- Filtro "Solo sin confirmar" como botón/chip (no input), componiendo AND con la búsqueda.

## Criterios de aceptación

1. Un retiro sin confirmaciones muestra "Confirmados 0/N" y todos los badges "● Sin confirmar".
2. Dar chulo persiste: recargar la página mantiene el badge y el contador.
3. Quitar el chulo (clic en "✓ Confirmado") limpia el timestamp y vuelve a "● Sin confirmar".
4. El botón de WhatsApp abre `https://api.whatsapp.com/send?phone=…` con la lada resuelta del
   país del servidor; sin teléfono no se renderiza.
5. "Solo sin confirmar" + búsqueda componen; el contador siempre cuenta sobre el total.
6. La suite existente de `ShirtsReportView` queda verde (asserts actualizados en el mismo
   commit que la vista, no caídas silenciosas).
7. Un usuario sin `participant:update` recibe 403 del PATCH.
8. El reporte de un retiro no filtra confirmaciones de otro retiro (el flag es per-retiro).

## Fuera de alcance

- Parseo automático de respuestas de WhatsApp o auto-chulo (el flujo es deep-link asistido).
- Eventos realtime/websockets (bag-made los emite porque recepción es multi-pantalla; el
   reporte es herramienta de un coordinador).
- Walkers: solo server y partial_server, que son los que ya salen en el reporte.
- Historial in-app de mensajes enviados por participante (existe `ParticipantMessageHistory`,
   pero el chulo se decide en la conversación real; se puede añadir después).
- Cambios en la secuencia de mensajes, plantillas o en el sistema de tipos de playera.
