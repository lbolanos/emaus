# AI Chat — herramientas de comunidad (Jessy)

Tools agregadas al bot interno **Jessy** (`apps/api/src/services/aiChatService.ts`) para que ayude al coordinador a gestionar miembros y asistencia de comunidad desde el chat.

Hasta esta entrega, Jessy solo trabajaba con retiros (`retreatId`). Ahora también acepta contexto de comunidad (`communityId`) y expone tools para:

- agregar miembros en lote a partir de una lista en texto libre,
- registrar asistencia de miembros a una reunión.

## Contexto: cómo el bot sabe la comunidad

El frontend (`AiChatWidget.vue`) inyecta `communityId` en el body del request al chat cuando el usuario está viendo una vista de comunidad, leyendo de `useCommunityStore().currentCommunity?.id`. Es **paralelo** a cómo se inyecta hoy `retreatId` desde `useRetreatStore`.

`ChatConversation` ahora persiste ese `communityId` (migration `20260518000000_AddCommunityIdToChatConversation`), para que al reabrir una conversación guardada siga apuntando a la misma comunidad.

Si el usuario abre el chat sin estar en una comunidad y pide agregar miembros / asistencia, el bot debe llamar `getMyAdminCommunities` y preguntar cuál.

## Tools nuevas

### `getMyAdminCommunities`

Sin parámetros. Devuelve las comunidades activas donde el usuario es admin activo (o todas si es superadmin). Útil para preguntar al usuario cuando no hay `communityId` en contexto.

```json
{
  "count": 2,
  "communities": [
    { "id": "uuid-1", "name": "Buen Despacho", "role": "owner" },
    { "id": "uuid-2", "name": "Santa Catarina", "role": "admin" }
  ]
}
```

### `findCommunityMember(communityId, query)`

Busca un miembro existente por nombre / apellido / email / teléfono. Útil antes de agregar (para confirmar si la persona ya está) o como apoyo a la desambiguación de asistencia.

### `addCommunityMembersBulk(communityId, members[], state?)`

Agrega múltiples miembros a partir de una lista parseada. Cada entrada debe traer al menos `firstName + lastName + (email O cellPhone)`.

**Comportamiento por entrada**:

| Caso | Resultado | Acción |
|---|---|---|
| Faltan datos mínimos | `rejected[]` con `missingFields` | El bot debe pedir al usuario los datos faltantes |
| Email/teléfono ya es Participant pero NO miembro de la comunidad | `linked[]` | Reusa el Participant existente, solo crea `CommunityMember` |
| Email/teléfono coincide con Participant que ya es miembro | `skipped[]` (`already_member`) | Omitir |
| No existe en BD | `added[]` | Crea Participant + CommunityMember |

**Estado por defecto**: `pending_verification` (para que el coordinador haga seguimiento luego). Si el usuario dice *"agrégalos como confirmados / activos / verificados"* el bot debe pasar `state: 'active_member'`.

**Dedupe por teléfono**: best-effort — compara los últimos 10 dígitos del número normalizado (sin espacios/paréntesis/guiones/`+`). Así `+52 55 8765 4321` matchea con `5587654321`.

**Si solo hay teléfono y no email**: el Participant se crea con un email placeholder determinístico `phone-{normalizedPhone}@placeholder.local`. Eso permite que un re-add posterior (mismo teléfono, con o sin email) deduplique vía el lookup por phone.

### `listCommunityMeetings(communityId, limit?, onlyUpcoming?)`

Lista reuniones de la comunidad ordenadas por fecha descendente. Excluye templates de recurrencia y announcements. Default `limit=10`. Si `onlyUpcoming=true` solo retorna reuniones futuras.

Útil para que el bot pregunte al usuario *"¿a qué reunión?"* cuando no es obvio.

### `recordMeetingAttendance(communityId, meetingId, attendees[], attended?)`

Registra asistencia para varios miembros en una reunión. Cada attendee se identifica por **uno de**: `memberId`, `email`, `cellPhone`, `name` (nombre completo).

**Upsert acumulativo**: la implementación usa `recordSingleAttendance` por miembro (no `recordAttendance`, que borraría las marcas previas). Llamadas sucesivas durante la misma reunión NO pierden marcas anteriores — el coordinador puede ir mandando "anota a Juan", luego "anota a María" sin perder a Juan.

**Default `attended=true`**. Pasar `false` marca como ausente.

**Salida**:

| Bucket | Significado |
|---|---|
| `marked[]` | Asistencia registrada (con `memberId` y `name`) |
| `notFound[]` | La persona no es miembro de la comunidad. Sugiere `addCommunityMembersBulk` primero |
| `ambiguous[]` | Varios miembros matchean el query (ej. dos "Juan"). Incluye lista de matches para que el bot pida elegir |

**Match de nombre**: normalizado (lowercase + remove diacritics, NFD). Tokenizado por espacios — todos los tokens deben aparecer en `firstName + lastName`. Eso permite "maria lopez" → "María López".

**Match de teléfono**: mismo criterio que `findParticipantByEmailOrPhone` — sufijo de 10 dígitos.

## Verificación de autorización

`verifyCommunityAdminAccess(userId, communityId)` valida que el usuario sea:

- **superadmin** (vía `UserRole`), o
- **`CommunityAdmin` con `status='active'`** en esa comunidad (rol `owner` o `admin`).

Se llama al inicio de cada `execute` de tool de comunidad. Pasa por encima del middleware `requireCommunityAccess` de rutas HTTP — la tool del bot NO usa middleware Express, así que la verificación corre dentro del `execute`.

## Conversaciones del chat

`ChatConversation` agregó la columna nullable `communityId VARCHAR`. Migration `20260518000000`. Reversible no-op (la columna queda; SQLite < 3.35 no soporta `DROP COLUMN` trivialmente, y al ser nullable no estorba).

El controller (`aiChatController.ts`) lee, persiste y devuelve `communityId` en los tres endpoints: `streamChat`, `saveConversation`, `getConversations`.

## Cómo el bot debe usar estas tools (resumen del system prompt)

1. **Agregar miembros**:
   - Si no hay `communityId` en contexto → llamar `getMyAdminCommunities` y preguntar.
   - Parsear la lista del usuario y MOSTRARLA antes de ejecutar, pedir confirmación.
   - Ejecutar `addCommunityMembersBulk`.
   - Si hay `rejected[]` con `missingFields`, preguntar al usuario los datos faltantes nombre por nombre y reintentar.
   - Default `state: 'pending_verification'`; override si el usuario lo pide explícito.

2. **Registrar asistencia**:
   - "Anota que llegaron X, Y, Z" / "Marca asistencia de…" → `recordMeetingAttendance`.
   - Si no hay `meetingId` claro → `listCommunityMeetings` y preguntar.
   - Extraer del mensaje los identificadores disponibles (nombre, email, teléfono).
   - Resumir resultado: marcados / no encontrados (sugerir agregar) / ambiguos (pedir desambiguar).

## Archivos tocados

**Backend**:

- `apps/api/src/services/communityService.ts` — `addMember`/`createCommunityMember` aceptan `state` opcional. Nuevos métodos: `findParticipantByEmailOrPhone`, `bulkAddMembers`, `bulkRecordAttendance`.
- `apps/api/src/services/aiChatService.ts` — 5 tools nuevas, helper `verifyCommunityAdminAccess`, `createChatStream` y `buildSystemPrompt` aceptan `communityId`.
- `apps/api/src/controllers/aiChatController.ts` — propaga `communityId`.
- `apps/api/src/entities/chatConversation.entity.ts` — columna `communityId`.
- `apps/api/src/migrations/sqlite/20260518000000_AddCommunityIdToChatConversation.ts` — migration.

**Frontend**:

- `apps/web/src/components/AiChatWidget.vue` — inyecta `communityId` desde `useCommunityStore`.
- `apps/web/src/services/api.ts` — tipos de `saveChatConversation` y `getChatConversations`.

**Tests**:

- `apps/api/src/tests/services/communityService.bulkAddMembers.test.ts` (9 tests).
- `apps/api/src/tests/services/communityService.bulkRecordAttendance.test.ts` (9 tests).
- `apps/api/src/tests/services/chatConversation.simple.test.ts` — extendido para validar `communityId` en save/list/detail.
