---
name: template-variables
description: "Sistema de variables {scope.var} en plantillas de mensaje (Emaús): scopes (participant/retreat/community), cómo agregar variables nuevas, server-only vs cliente, casos comunes."
---

# Template Variables — sistema canónico `{scope.var}`

Los placeholders en plantillas de mensaje (`message_templates` + `global_message_templates`) siguen una sintaxis única: **single-brace + scope-dotted**, p. ej. `{participant.firstName}`, `{retreat.startDate}`, `{community.name}`.

NO usamos mustache (`{{var}}`). La única excepción es retro-compat en `communityService.renderTemplate` que acepta ambos formatos para overrides legacy — ver sección "Doble syntax".

## Cuándo cargar este skill

- Agregar una variable nueva a un scope existente (p. ej. `{retreat.foo}`).
- Agregar un scope nuevo (p. ej. `{house.X}`, `{user.X}` en contexto cliente).
- Bug: una variable queda como texto literal en el envío.
- Diseñar un endpoint server-side que renderice plantillas (similar a `userManagementMailer`).
- Auditar variables fantasma (listadas en picker pero no implementadas).

## Arquitectura

### Pieza canónica: `@repo/utils`

`packages/utils/src/index.ts` define:

- `interface ParticipantData`, `RetreatData`, `CommunityData` — los datos que las plantillas pueden interpolar.
- `buildParticipantReplacements(data)`, `buildRetreatReplacements(data)`, `buildCommunityReplacements(data)` — mapping `{scope.var} → string`.
- `replaceParticipantVariables`, `replaceRetreatVariables`, `replaceCommunityVariables` — el reemplazo individual (con fallback a mock cuando data es null/undefined, para previews).
- `replaceAllVariables(message, participant, retreat, contactKey?, community?)` — entry point que combina los tres scopes.
- `findEmptyVariables(...)` — para mostrar "variables sin datos" en MessageDialog.

**Regla de oro**: si una variable debe resolver en el cliente (MessageDialog, BaseMessageTemplateModal preview, comunicación a participantes), tiene que estar en uno de los `build*Replacements`.

### Scopes disponibles

| Scope | Cuándo usar | Ejemplos |
| --- | --- | --- |
| `participant.*` | Datos del destinatario (caminante/servidor) | `firstName`, `nickname`, `cellPhone`, `email`, `emergencyContact1Name`, `palanqueroName`, `pickupLocation`, `dataDeleteUrl` |
| `retreat.*` | Datos del retiro al que pertenece el participante | `parish`, `startDate`, `endDate`, `cost`, `paymentInfo`, `thingsToBringNotes`, `closingChurchName`, `walkerArrivalTime`, `next_meeting_date` |
| `community.*` | Datos de comunidad (solo en plantillas community-scoped) | `name`, `meetingTitle`, `meetingDate`, `attendanceLink`, `requesterName`, `acceptUrl` |

### Cómo se conecta el cliente

`MessageDialog.vue`:
1. Carga el template seleccionado.
2. Arma `participantData` desde `props.participant`.
3. Arma `retreatData` desde `retreatStore.selectedRetreat` (modo retreat) o un partial con `currentCommunity.name` (modo community).
4. **Pre-resuelve `nextMeetingDate`** llamando `GET /api/participants/:id/next-meeting` y lo inyecta en `retreatData.nextMeetingDate`.
5. Si scope=community, arma `communityData` desde `currentCommunity`.
6. Llama `replaceAllVariables(message, participant, retreat, contactKey, community)`.

`BaseMessageTemplateModal.vue` (editor de plantillas):
- Mismo patrón para el preview. Cuando hay `selectedParticipant`, dispara la misma llamada `getParticipantNextMeeting()` para que el preview muestre el mismo texto que MessageDialog enviaría.
- Cuando no hay participante, `getMockRetreat()` provee placeholders realistas.

### Variables server-only

Algunas variables NO viven en `@repo/utils` porque solo aplican a correos automáticos que el servidor emite vía `apps/api/src/services/userManagementMailer.ts` (USER_INVITATION, RETREAT_SHARED_NOTIFICATION, PASSWORD_RESET, SYS_*):

| Variable | Contexto |
| --- | --- |
| `{user.name}`, `{user.displayName}`, `{user.email}`, `{user.nickname}` | Datos del User destinatario |
| `{inviterName}` | Quien invitó al user |
| `{shareLink}`, `{invitationUrl}` | URL para aceptar invitación |
| `{resetToken}` | Token de password reset |
| `{role.name}`, `{role}` | Nombre del rol asignado |

El picker en `BaseMessageTemplateModal` las muestra bajo la categoría **"Sistema"** con badge `Server-only` y descripción explicando que **NO resuelven en MessageDialog manual** — solo en correos automáticos del backend.

Si alguien pega `{user.name}` en una plantilla GENERAL y la envía a un participante via MessageDialog, queda literal. Esto es por diseño: no hay un "user destinatario" en ese flujo.

### `{custom_message}` — placeholder editable, NO variable

Es un marcador en la plantilla GENERAL que el usuario reemplaza tipeando su mensaje real en MessageDialog antes de enviar. No resuelve automáticamente. Se categoriza como "Placeholder editable" en el picker, no como variable.

## Cómo agregar una variable nueva

### Variable cliente (resuelve en MessageDialog y preview)

Caso: quiero `{retreat.parish_address}`.

1. **Agregar al tipo** en `packages/utils/src/index.ts`:
   ```ts
   export interface RetreatData {
     // ...
     parish_address?: string;
   }
   ```

2. **Agregar al builder** (`buildRetreatReplacements`):
   ```ts
   'retreat.parish_address': retreatData.parish_address || '',
   ```

3. **Agregar al mock** (`getMockRetreat`) para que el preview muestre algo realista:
   ```ts
   parish_address: 'Av. Insurgentes Sur 1234, CDMX',
   ```

4. **Exponer en el picker** (`BaseMessageTemplateModal.vue`, `retreatVariables`):
   ```ts
   { key: 'parish_address', label: 'Dirección de la parroquia' },
   ```

5. **Si el dato viene de una API call extra** (no en `selectedRetreat`): seguir el patrón de `getParticipantNextMeeting` — endpoint + fetch en `MessageDialog` watcher de open + inyección en `retreatData`.

### Variable server-only (resuelve solo en correos automáticos)

1. Agregar al `EmailTemplateData` interface en `userManagementMailer.ts`.
2. Agregar el reemplazo en `processTemplate()` con `.replace(/{varName}/g, data.varName || '')`.
3. Exponer en `systemFlowVariables` o `userVariables` del picker en `BaseMessageTemplateModal`.

## Doble sintaxis en `communityService.renderTemplate`

Solo este renderer acepta ambos formatos para retro-compat con plantillas community sembradas en mustache antes de la migration `20260518173857_NormalizeCommunityTemplateVariables`. Hace dos pasadas:

1. `{{var}}` (mustache, legacy). 
2. `{participant.firstName}` / `{community.X}` (canónica).

Ambos pasan por `escapeHtml` para prevenir XSS. **Para todo lo demás (cliente, otros renderers server-side), use canónica.**

## Variables fantasma — checklist

Antes de listar una variable en el picker, verificar:

- [ ] ¿Está en `build*Replacements` (cliente) o en `processTemplate` (server)?
- [ ] ¿Hay mock realista para preview?
- [ ] Si requiere fetch extra (como `nextMeetingDate`), ¿hay endpoint + cliente que lo inyecte?
- [ ] Si es server-only, ¿está categorizada como "Sistema" con badge?

Si la respuesta a alguna es "no" y vas a listarla — está rota y aparecerá literal en el envío. **Mejor no listarla** que listarla rota.

### Variables fantasma históricas (ya removidas)

- `{retreat.fecha_limite_palanca}` — removida en migration `20260518181652`. Reemplazada por `{retreat.startDate}` en `PALANCA_REQUEST`.
- `{participant.hora_llegada}` — migrada a `{retreat.walkerArrivalTime}` / `{retreat.serverArrivalTimeFriday}` en migration `20251025181628`. Eliminada del picker en este ciclo.

## Endpoints relevantes

- `GET /api/participants/:id/next-meeting?communityId=X` — devuelve `{ nextMeetingDate, formattedDate, title, communityId, communityName }`. Comportamiento:
  - **Con `communityId`**: restringe a esa comunidad. Devuelve nulls si el participante no es miembro activo/pendiente ahí. **Este es el caso correcto cuando se envía un mensaje desde un contexto de comunidad específica** — el participante puede estar en varias y queremos la próxima reunión DE esa comunidad, no la más temprana entre todas.
  - **Sin `communityId`**: busca entre todas las comunidades del participante y devuelve la más temprana. Fallback para retreat-context donde no hay comunidad asociada.

  Implementado en `participantService.findNextMeetingForParticipant(id, communityId?)`. Tests: `apps/api/src/tests/services/participantNextMeeting.test.ts` (11 casos: con/sin scope, multi-membership, estados declinados, recurrence templates).

  El cliente (`MessageDialog.vue` y `BaseMessageTemplateModal.vue`) **siempre pasa `communityId` cuando hay contexto de comunidad** (props.communityId / props.template.communityId). En retreat context lo omite.

## Migrations relacionadas

- `20260516100000_SeedCommunityMessageTemplates` — siembra plantillas community con mustache (legacy).
- `20260518173857_NormalizeCommunityTemplateVariables` — reescribe mustache → canónica.
- `20260518175839_RewriteSeedTemplatesWithWarmerVoice` — reescribe todos los templates seed con voz más personal + `{community.name}` donde había "tu comunidad de Emaús" genérico.
- `20260518181652_FixPalancaRequestPhantomVar` — saca `{retreat.fecha_limite_palanca}` de PALANCA_REQUEST.
- `20251025181628_UpdateMessageTemplatesArrivalTimeVariables` — migra `{participant.hora_llegada}` → `{retreat.walkerArrivalTime}`/`{retreat.serverArrivalTimeFriday}`.

Todas son **conservadoras**: comparan `message = '<seed exacto>'` antes de UPDATE, preservando customizaciones del usuario.
