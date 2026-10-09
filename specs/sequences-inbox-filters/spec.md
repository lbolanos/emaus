# Bandeja de WhatsApp: filtros, historial y ficha

> SDD spec — versión 1.0 (2026-10-08). Estado: borrador, esperando aprobación.

## Problema

La bandeja de pendientes de WhatsApp (tab "Pendientes" de Secuencias automáticas) es la lista de
trabajo del coordinador durante el retiro. Con la bandeja cargada (decenas de mensajes), hoy:

1. Solo se puede filtrar por texto libre, orden, y asignación propia (míos / sin asignar). No hay
   filtro por **tipo de mensaje** (plantilla) ni por **asignado concreto** — revisar qué tomó otra
   persona obliga a preguntarle.
2. La fila solo dice "Asignado" (anónimo): el dato del `assignedTo` viaja como id de usuario sin
   nombre.
3. Para ver qué le contestó la familia al mensaje anterior hay que abrir WhatsApp a mano y buscar
   el chat: el único botón que hay abre el compositor con el mensaje precargado.
4. El paginado está clavado en 10 filas; recorrer una bandeja de 60 mensajes a páginas de 10
   cansa, y no hay forma de verla completa.
5. El contexto del participante (teléfonos, invitador, cama) exige salir de la bandeja a otra
   vista; el panel de detalle existente es del **mensaje**, no de la ficha.

La infraestructura casi toda existe: `buildWhatsAppChatLink` (chat sin texto) vive en
`apps/web/src/utils/phone.ts` desde el fix de la lada, y `ParticipantInfoPopover` es la superficie
de ficha que ya usa la vista de mesas. Lo que falta es integrarlos a la bandeja y resolver el
nombre del asignado.

## Decisiones de dominio

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | El botón "ver conversación" **no muta estado**: no marca abierto, no marca enviado, no llama a `/open` ni `/dispatch` | Es lectura del historial, no un envío. Marcar sin enviar es exactamente el bug del incidente de los 20 recordatorios (2026-09-12) — ese camino no se abre |
| D2 | El nombre del asignado lo resuelve el **servidor** en `listQueued` (`assignedToName`), no el cliente | Mismo patrón que `palanqueroName`/`followUpStatus` (enriquecimiento server-side del payload). El cliente no tiene store de usuarios y `/retreat-roles/.../users` es más permiso y más costo para el mismo dato |
| D3 | El filtro "por tipo" filtra por **plantilla visible** (nombre resuelto), agrupando por `templateId` (fallback `templateType` para ítems legacy) | El coordinador piensa en "Recordatorio de saldo", no en el tipo crudo. La clave id+tipo evita colisionar dos plantillas con el mismo nombre |
| D4 | Selector de página 5/10/50/100/**Todos**, default 10, persistido en `localStorage` (`seq.queuePageSize`, como `seq.autoConfirmSend`) | "Todos" oculta el paginador. La bandeja es client-side y acotada (mensajes queued de un retiro): mostrarla entera no cuesta |
| D5 | Detalle del participante = **popover** (reuso de `ParticipantInfoPopover` en modo icono), no una vista nueva ni navegación fuera | Es la superficie de ficha estándar de la app; el participante completo ya está en `participantStore` (la vista lo carga hoy). La bandeja no debe perder el contexto del trabajo |
| D6 | Filtros nuevos **client-side**, junto a los existentes (barra escritorio + menú móvil) | La bandeja ya filtra/ordena/pagina 100% en el cliente sobre `queue`; no hay caso para server-side a este tamaño |
| D7 | La fila muestra el **nombre** del asignado (`Asignado: Ana`), no solo "Asignado" | Es el mismo dato que habilita el filtro; el anonimato actual no aporta nada y confunde con varios coordinadores |

## Historias de usuario

- **HU1** — *Coordinador procesa la bandeja*: "Hay 60 mensajes; quiero verlos de a 50 o todos de
  una vez, y quedarme solo con los de una plantilla para procesarlos en bloque homogéneo."
- **HU2** — *Coordinador revisa al equipo*: "Ana se llevó mensajes de la bandeja; quiero filtrar
  por ella y ver cuáles le quedan, sin preguntarle."
- **HU3** — *Coordinador lee respuestas*: "Antes de reenviarle a este caminante quiero ver qué me
  contestó la última vez — abrir el chat de WhatsApp sin que se arme ningún mensaje, y sin que la
  app crea que ya lo envié."
- **HU4** — *Coordinador quiere contexto*: "Este nombre no me suena; ver su ficha (teléfonos,
  invitador, cama) sin salir de la bandeja."

## Requerimientos funcionales

- **FR1 (M2)**: Select "Plantilla" en la bandeja con las plantillas presentes en la cola
  (etiqueta = nombre resuelto, con conteo), default "Todas". Compone con búsqueda, orden y
  asignación; vuelve a página 1 al cambiar.
- **FR2 (M1+M2)**: El select "Mostrar" gana opciones dinámicas "Asignado: \<nombre\>" por cada
  asignado presente en la cola (con conteo). Requiere `assignedToName` en el payload de
  `listQueued` (FR-API).
- **FR3 (M1+M2)**: La fila de la bandeja muestra el nombre del asignado cuando lo hay (hoy
  "Asignado" anónimo); "Míos" y "Sin asignar" se conservan igual.
- **FR4 (M2)**: Select "Por página": 5 / 10 / 50 / 100 / Todos. Default 10 (comportamiento
  actual). Persiste por navegador. Con "Todos" se oculta el paginador.
- **FR5 (M3)**: Botón icono "Ver conversación" en cada fila y en el footer del panel de detalle:
  abre `api.whatsapp.com/send?phone=…` **sin** `text` (chat/historial). Sin teléfono → toast
  (mismo que hoy). No muta estado del ítem (D1). El teléfono/país se resuelve igual que el envío
  (snapshot + fallback, contactos de emergencia incluidos).
- **FR6 (M3)**: Botón icono "Detalles del participante" en cada fila: abre el popover de ficha
  (`ParticipantInfoPopover` modo icono) con el participante enriquecido del store. Cierra limpio
  (sin `pointer-events` colgado).
- **FR-API (M1)**: `listQueued` enriquece cada ítem con `assignedToName` (`users.displayName`,
  lookup bulk por `In(ids)`), `null` sin asignar. Sin endpoint nuevo, sin migración.

## Criterios de aceptación

- CA1: con filtro de plantilla activo, la lista (y el paginado) reflejan solo ítems de esa
  plantilla; el contador de "X de la plantilla" en el select coincide con las filas filtradas.
- CA2: filtrar por un asignado deja exactamente sus ítems; los sin asignar y los de otros no
  aparecen; el nombre del select y el de las filas vienen del mismo campo (`assignedToName`).
- CA3: "Todos" muestra N filas y oculta el paginador; al volver a un número, el paginador reaparece
  y la página vuelve a 1. La preferencia sobrevive recargar (localStorage).
- CA4: el link de "Ver conversación" no contiene `text=`; al usarlo no sale request a
  `message-sequences/*/open|dispatch` ni cambia `status`/`openedAt` del ítem.
- CA5: el popover de ficha muestra los datos del participante del store (teléfonos con dígitos,
  cama si tiene) y al cerrarlo la página sigue interactiva.
- CA6: claves i18n nuevas existen en `es.json` **y** `en.json` (sin keys crudas en UI ni warnings
  por consola).

## No-goals

- **No** filtrado/paginación server-side de la bandeja: `queue` es acotado (queued de un retiro).
  Revisar si algún retiro supera ~300 queued.
- **No** acciones masivas (seleccionar N y omitir/marcar): se consideró como lectura alternativa
  del pedido y el usuario decidió que el selector es de tamaño de página (2026-10-08). El marcar
  enviado en bloque sin abrir WhatsApp no se construirá (riesgo del incidente 2026-09-12).
- **No** se toca el flujo de envío/marcado (orden marcar→abrir, auto-confirm, popup blocked).
- **No** se añaden estos controles a Programados ni Problemas (la bandeja es la lista de trabajo;
  Programados ya filtra server-side).
- **No** historial de WhatsApp dentro de la app: solo deep-link al chat (las respuestas viven en
  el teléfono de cada servidor, por diseño del envío asistido).
