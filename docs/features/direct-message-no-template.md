# Mensajes directos sin plantilla

Permite escribir y enviar un mensaje (WhatsApp o email) a un miembro de
comunidad o participante de retiro **sin necesidad de seleccionar una
plantilla** desde `MessageDialog`. Antes el botón "Enviar Mensaje" se
mantenía deshabilitado mientras no se eligiera una plantilla, lo cual
bloqueaba el envío en comunidades nuevas que aún no tenían plantillas
con `scope='community'` (la única fuente que el dialog carga en ese
contexto).

## Cuándo se usa

- Una **comunidad nueva** que todavía no ha importado plantillas y se
  necesita enviar un mensaje puntual a un miembro.
- Un mensaje **único / no repetible** que no justifica crear una
  plantilla (recordatorio personalizado, aclaración, etc.).
- En un retiro, cuando se quiere mandar algo libre sin pasar por la
  pantalla de plantillas.

## Cambios funcionales

| Estado | Editor visible | Botón Enviar | Variables |
|---|---|---|---|
| Sin plantilla | Sí, vacío | Habilitado si hay contacto + texto | No hay reemplazo |
| Con plantilla | Sí, prefilado | Habilitado igual | Se reemplazan al elegir plantilla |
| Sin plantillas en BD (community) | Editor vacío + CTA "importar plantillas" | Habilitado | — |

## Frontend

- Componente principal: `apps/web/src/components/MessageDialog.vue`
  - El bloque `<!-- Message Editing -->` ya no depende de
    `selectedTemplate`; el `Textarea` se renderiza siempre.
  - El botón Enviar usa
    `:disabled="!selectedContact || !editedMessage.trim() || isSending"`.
  - `validateMessage()` solo exige contacto válido y mensaje no vacío.
  - `updateMessagePreview()` y `watch(sendMethod, …)` preservan lo
    escrito a mano cuando no hay plantilla (no se sobrescribe
    `editedMessage`).
  - Cuando `relevantTemplates.length === 0`, debajo del Select se
    muestra un mensaje contextual con un `<router-link>` a la página
    `/app/communities/:id/templates` (sólo en `context === 'community'`).
- Stores: `stores/communityCommunicationStore.ts` (community) y
  `stores/participantCommunicationStore.ts` (retreat) — ambos ya
  aceptan `templateId?: string` opcional.

## Backend

Cambios mínimos en `apps/api/src/`:

- **Routes** (`routes/communityCommunicationRoutes.ts`): se registró el
  endpoint `POST /community-communications/email/send`. El controller
  ya tenía implementado `sendEmailViaBackend`, pero la ruta nunca se
  había montado, por lo que el envío automático desde el backend para
  miembros de comunidad fallaba con 404.
- **Controller** (`controllers/communityCommunicationController.ts`):
  `createCommunication` normaliza `templateId` y `templateName` —
  cualquier valor _falsy_ (incluido `""`) se coerciona a `null` antes
  del INSERT raw, evitando la violación de la FK
  `templateId → message_templates(id)`. Esto vuelve el endpoint robusto
  ante clientes que envíen string vacío en vez de `undefined`.
- **Persistencia**: los registros en `participant_communications`
  quedan con `templateId IS NULL` y `templateName IS NULL` cuando no
  hubo plantilla. El historial los muestra sin badge de plantilla.

## Endpoints relevantes

Cada endpoint exige que el caller sea **admin activo de la comunidad
involucrada** (o `superadmin`). La verificación se hace en el controller
mediante `callerHasCommunityAccess(req, communityId)` —
`isAuthenticated` por sí solo no basta.

| Método | Ruta | Uso | Authz |
|---|---|---|---|
| `GET` | `/community-communications/member/:memberId` | Lista historial de un miembro | admin de la comunidad del member (o superadmin) |
| `GET` | `/community-communications/community/:communityId` | Lista historial de la comunidad | `requireCommunityAccess` middleware |
| `POST` | `/community-communications` | Crea registro de comunicación (WhatsApp y "mailto") | admin de `body.communityId` |
| `POST` | `/community-communications/email/send` | Envía email vía SMTP del backend y guarda historial | admin de `body.communityId` |
| `DELETE` | `/community-communications/:id` | Elimina registro | admin de la comunidad del registro |

## Hallazgos de seguridad arreglados

1. **403 fantasma para superadmins** en `GET /communities/:id` y demás
   rutas con `requireCommunityAccess`: si el superadmin no tenía un row
   en `community_admin`, el middleware lo rechazaba aun cuando
   `getCommunities` ya lo trataba como acceso total. Fix: bypass de
   superadmin en `requireCommunityAccess`, `requireCommunityMeetingAccess`,
   `messageTemplateController.checkCommunityAccess` y
   `globalMessageTemplateController.isCommunityAdminOrSuperadmin`.
2. **Endpoints de community-communications sin authz**: las rutas
   `GET /member/:memberId`, `POST /`, `POST /email/send` y
   `DELETE /:id` sólo aplicaban `isAuthenticated`. Cualquier usuario
   autenticado podía leer historiales, crear comunicaciones falsas o
   abusar del SMTP del sistema para enviar correos a cualquier
   destinatario. Fix: cada handler valida ahora que el caller sea
   admin activo de la comunidad involucrada (o superadmin); además se
   verifica que el `communityMember` realmente pertenezca a la
   `communityId` reclamada en el body, como defensa en profundidad.
3. **Endpoint `/community-communications/email/send` no estaba
   montado**: el controller existía pero la ruta nunca se exportó, así
   que el frontend recibía 404. Fix: registrar la ruta en
   `communityCommunicationRoutes.ts`.
4. **`templateId=""` violaba la FK**: el frontend podía mandar string
   vacío y el INSERT raw lo insertaba directo, fallando la FK contra
   `message_templates(id)`. Fix: el controller normaliza cualquier
   `templateId` falsy a `null` antes de insertar.

## Cómo poblar plantillas en una comunidad nueva

Si quieres seguir teniendo plantillas disponibles (recomendado para
mensajes recurrentes):

1. Ir a `http://<host>/app/communities/<communityId>/templates`
   (vista `CommunityMessageTemplatesView.vue`).
2. **"Importar Plantillas"** abre `CommunityTemplateImportModal.vue`.
   Pestañas:
   - **Globales** → `globalTemplateStore.copyToCommunity(templateId, communityId)`.
   - **Desde un retiro** → `messageTemplateStore.copyRetreatTemplateToCommunity(templateId, communityId)`.
3. Alternativamente, **"Nueva Plantilla"** crea una manualmente.

## Tests

Backend (Jest):

- `apps/api/src/tests/controllers/communityCommunicationController.test.ts`
  - `createCommunication` sin `templateId` → 201, `templateId/templateName` falsy.
  - `createCommunication` con `templateId=""` → 201 (defensivo, no FK error).
  - `sendEmailViaBackend` sin `templateId/templateName` → 200 y persiste con NULL.
  - **Authorization** — outsider obtiene 403 en `getMemberCommunications`,
    `createCommunication`, `sendEmailViaBackend` y `deleteCommunication`.
  - `createCommunication` con member que no pertenece a la `communityId`
    del body → 400 (defense in depth).
- `apps/api/src/tests/middleware/requireCommunityAccess.test.ts`
  - Cubre 401/400/403, admin activo OK, **bypass superadmin** (regresión)
    y revoked admin sigue rechazado.
- `apps/api/src/tests/routes/communityCommunicationRoutes.simple.test.ts`
  - Verificación estática de que cada endpoint que el frontend invoca
    está montado, incluido el `POST /email/send` que faltaba antes.

Correr sólo estos:

```sh
pnpm --filter api jest \
  src/tests/controllers/communityCommunicationController.test.ts \
  src/tests/middleware/requireCommunityAccess.test.ts \
  src/tests/routes/communityCommunicationRoutes.simple.test.ts
```

## Verificación end-to-end (manual)

1. **Caso A — Mensaje directo sin plantillas en BD**
   - Ir a `/app/communities/<communityId>/members`.
   - Abrir el modal de mensaje en cualquier miembro.
   - Ver que el dropdown muestra "Sin plantilla — escribe abajo" y el
     CTA con link a `/templates`.
   - Escribir contenido libre, elegir contacto → enviar.
   - Confirmar registro en SQLite:
     ```sh
     sqlite3 apps/api/database.sqlite \
       "SELECT id, scope, communityId, messageType, templateId, templateName \
        FROM participant_communications \
        WHERE scope='community' \
        ORDER BY sentAt DESC LIMIT 3;"
     ```
     El nuevo registro debe tener `templateId` y `templateName` = NULL.
2. **Caso B — Con plantillas importadas**
   - Importar plantillas vía `/templates`.
   - Volver a `/members` → el dropdown se llena → seleccionar plantilla
     → el editor se prefilla con variables resueltas → enviar.
   - El registro persiste con `templateId` y `templateName` poblados.
3. **No regresión en retiros** — abrir `MessageDialog` desde un retiro
   y verificar que con/sin plantilla todo sigue funcionando como antes
   (incluyendo `POST /participant-communications/email/send`).
