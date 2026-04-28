# Historial de mensajes — vista completa

Funcionalidad del `MessageDialog` que permite revisar los mensajes
(WhatsApp / email) enviados previamente a un participante o miembro de
comunidad, y abrir cualquiera de ellos para verlo completo con metadata.

## Ubicación

- Diálogo contenedor: `apps/web/src/components/MessageDialog.vue`
- Lista de historial (retiro): `apps/web/src/components/ParticipantMessageHistory.vue`
- Lista de historial (comunidad): `apps/web/src/components/CommunityMessageHistory.vue`
- Stores: `stores/participantCommunicationStore.ts`, `stores/communityCommunicationStore.ts`
- Utilidad de formato de fecha: `packages/utils/src/index.ts` → `formatDate`

## Flujo de usuario

1. En el `MessageDialog` el usuario abre el panel **Historial** (botón con
   accesskey `H`, badge con el número total de mensajes).
2. Se muestra una lista paginada de comunicaciones (`sentAt DESC`), cada
   ítem con: icono/tipo, plantilla usada, fecha/hora local, destinatario,
   remitente y preview truncado a 80 caracteres.
3. Al hacer **clic en un mensaje**, se emite `message-click` y el
   `MessageDialog` abre un segundo diálogo (`viewingMessage`) con el
   contenido completo.
4. El diálogo de vista completa muestra:
   - Encabezado con tipo (📱 WhatsApp / 📧 Email) y badge de plantilla.
   - Metadata: fecha larga en hora local, destinatario, remitente y
     asunto (solo email).
   - Contenido completo: HTML sanitizado (`sanitizeEmailHtml`) para
     email, texto plano con `whitespace-pre-wrap` para WhatsApp.
   - Acciones: **Copiar** (al portapapeles) y **Cerrar**.

El botón **Copiar** de cada ítem del listado sigue disponible sin abrir
la vista completa (emite `copy-message` con `@click.stop`).

## Formato de fecha / hora

Las fechas se renderizan con `formatDate` de `@repo/utils`. La función
distingue dos modos:

- **`datetime`** (usado en el listado y en la vista completa): convierte
  el ISO `sentAt` al instante en la **zona horaria local del navegador**
  usando `toLocaleString`. Muestra `DD/MM/YYYY, HH:MM`.
- **`short` / `long` / `full`** (fechas sin hora, como cumpleaños o
  fechas de retiro): extrae año/mes/día con getters UTC y reconstruye un
  `Date` local, evitando corrimientos por DST/offset.

### Bug histórico corregido

Antes, `datetime` también pasaba por la ruta de "solo fecha", lo que
descartaba la hora y mostraba siempre `00:00` — que los usuarios
interpretaban como "hora en UTC". El fix separa la rama `datetime` para
preservar el instante original.

Ver regresión en `apps/web/src/utils/__tests__/formatDate.test.ts`.

## Contrato de datos

Forma mínima esperada por la vista completa (común a
`ParticipantCommunication` y `CommunityCommunication`):

```ts
{
  id: string;
  messageType: 'whatsapp' | 'email';
  recipientContact: string;
  messageContent: string;   // HTML para email, texto plano para WhatsApp
  subject?: string;         // solo email
  templateName?: string;
  sentAt: string;           // ISO 8601 con zona (ej. 2026-04-23T15:30:00.000Z)
  sender?: { email: string };
}
```

## Permisos

El historial y la vista completa heredan los permisos de
`canShowHistory` en `MessageDialog` (requiere destinatario seleccionado
y contexto válido). La autorización de listado ya la valida el backend
vía los endpoints de los stores.

## Tests

- `apps/web/src/utils/__tests__/formatDate.test.ts` — 9 tests sobre
  `formatDate`, cubriendo preservación de hora en `datetime` y
  no-corrimiento de timezone en modos solo-fecha.
