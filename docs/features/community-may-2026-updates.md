# Community — actualizaciones mayo 2026

Bundle de mejoras al módulo de comunidades. Cada sección documenta el **qué**,
el **por qué** y los **call sites** críticos.

---

## 1. Timezone por comunidad

### Qué

La entidad `Community` tiene una columna nueva `timezone` (IANA, ej.
`America/Mexico_City`) opcional. Se infiere automáticamente desde
`latitude`/`longitude` cuando vienen en `createCommunity` / `updateCommunity`
vía `inferTimezoneFromCoords` (tabla embebida de `tz-lookup`, sin internet).

### Por qué

En producción (Lightsail Ubuntu corre en UTC), `toLocaleString` sin opción
`timeZone` usaba la TZ del sistema, así que un meeting guardado como `19:00`
hora local de México se rendereaba como `01:45 a.m.` UTC en los mensajes a
los miembros. Bug reportado por el usuario el 2026-05-18.

### Cómo aplicar

- Para formatear cualquier `meeting.startDate` u otra fecha-hora de la comunidad:
  ```ts
  import { getCommunityTimezone } from '@/services/communityService';
  new Date(meeting.startDate).toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: getCommunityTimezone(community),
  });
  ```
- `getCommunityTimezone(c)` es **sync** y cae a `'America/Mexico_City'` cuando
  la community no tiene `timezone` poblada (típicamente comunidades sin
  coordenadas todavía).
- El infer es **async** y solo se invoca en write (create/update). Las
  funciones de render NO deben llamar `inferTimezoneFromCoords` — es
  costoso (dynamic import + table lookup) y se persiste una vez.

### Migration

`20260519000000_AddTimezoneToCommunity.ts` — `ALTER TABLE community ADD COLUMN
timezone varchar(64)`. Aditiva, sin recreate-table. Incluye backfill que
recorre las communities con lat/lon definidas e infiere su timezone (corrió
sobre 14 comunidades en local).

### Call sites con `timeZone` ahora resuelto

- `participantService.findNextMeetingForParticipant` — render del
  `{community.meetingDate}` en mensajes.
- `communityService.sendWelcomeEmail` — bloque "Próxima reunión" en email
  de bienvenida.
- `communityService.notifyMembersOfMeeting` — notificación masiva.
- `retreatScheduleService.notifyAngelitosOfNewAssignments` — usa
  `retreat.timezone` (no `community`), fallback CDMX.
- `emailService.sendTestEmail`, `globalMessageTemplateService`,
  `serviceTeam/tableMesa/badge/room/responsability` PDFs — hardcoded
  CDMX (eventos generados por el server, no por la community).

---

## 2. Estados de miembro extendidos

### Qué

`MemberStateEnum` ahora incluye 5 estados adicionales además de los 5
originales:

| Estado | Significado | Notificación al cambiar a este estado |
|---|---|---|
| `active_member` | Miembro confirmado | Email de bienvenida |
| `pending_verification` | Por contactar/verificar | (estado de seguimiento, no se notifica) |
| `far_from_location` | Vive lejos | Email de rechazo suave |
| `no_answer` | No responde | Email de rechazo suave |
| `another_group` | Está en otro grupo | Email de rechazo suave |
| **`wrong_contact_info`** | Correo/teléfono inválido | **NO se envía email** |
| **`no_time`** | No tiene tiempo ahora — declinación blanda | Email de rechazo suave |
| **`paused`** | Pausa temporal (viaje, enfermedad, luto) | **NO se envía email** |
| **`not_interested`** | No le interesa, definitivo | Email de rechazo suave |
| **`do_not_contact`** | Lista negra explícita | **NO se envía email** |

### Por qué

El usuario reportó la necesidad de marcar miembros con motivos más
granulares para el follow-up del coordinador. Los 5 nuevos cubren los
escenarios reales que estaba intentando representar abusando de los 3
declined originales.

### Semántica clave — recordar

- El `state` es un **MARKER DE SEGUIMIENTO del coordinador**, NO un
  permiso para asistir.
- Solo `active_member` + `pending_verification` aparecen en:
  - Roster de meeting (`getPublicAttendanceData`).
  - Notificaciones masivas (`notifyMembersOfMeeting`).
  - Cálculo de próxima reunión para mensajes (`findNextMeetingForParticipant`).
- Los demás son **declinaciones** efectivas (explícitas o por canal roto).
- `SILENT_STATES = {wrong_contact_info, do_not_contact, paused}` también
  cortan las notificaciones de `notifyMemberStateChange`.

### Migration

`20260519100000_ExtendMemberStateValues.ts` — recreate-table del CHECK
constraint en `community_member.state`.

⚠️ **CRITICAL** (skill `sqlite-migrations`):
- `community_attendance.memberId` tiene FK `ON DELETE CASCADE` hacia
  `community_member`. Dentro de transacción TypeORM con foreign_keys=ON,
  el DROP TABLE intermedio cascadearía y borraría TODA la asistencia.
- La migration corre con `transaction = false as const` y
  `PRAGMA foreign_keys = OFF` envuelto en `try/finally`.
- Copia explícita de TODAS las columnas (audit fields + overlay) para
  no perder data acumulada después del CHECK original.
- Safety check `COUNT(*)` antes del DROP — aborta si las filas no
  coinciden.
- Down migration mapea estados nuevos → `no_answer` (fallback no
  destructivo).

### i18n

`apps/web/src/locales/es.json` y `en.json` — sección
`community.memberStates`. Labels cortos para caber en el `<SelectTrigger>`
de 140px.

### Colores (border del select)

| Estado | Tailwind |
|---|---|
| `active_member` | `border-green-500` |
| `pending_verification` | `border-yellow-500` |
| `paused` | `border-amber-500` |
| `wrong_contact_info` | `border-orange-500` |
| `no_answer` | `border-red-500` |
| `no_time` | `border-cyan-500` |
| `far_from_location` | `border-blue-500` |
| `another_group` | `border-purple-500` |
| `not_interested` | `border-rose-500` |
| `do_not_contact` | `border-zinc-700` |

---

## 3. Lista de miembros — orden por último mensaje

### Qué

`getMembers` ahora devuelve `lastMessageSentAt` (ISO o null) por miembro.
El frontend tiene una columna nueva "Último mensaje" en
`CommunityMembersView` con texto relativo (`hace 23 min`, `hace 3 d`,
`hace 2 sem`, fecha corta) y permite ordenar por esa columna.

### Por qué

El coordinador quiere ver primero a los que no ha contactado en mucho
tiempo (orden ascendente) o los recientes (descendente).

### Implementación

- Query agregada en `getMembers`:
  ```sql
  SELECT participantId, MAX(sentAt) as lastSentAt
    FROM participant_communications
   WHERE scope = 'community' AND communityId = ?
   GROUP BY participantId
  ```
- Filtra por scope=`community` para no contaminar con mensajes del
  participante en retiros.
- Filtra por communityId para que un miembro que está en N comunidades
  solo vea el último mensaje de ESTA.

### Frontend

- `formatLastMessage(iso)` helper: `ahora`, `hace N min`, `hace N h`,
  `hace N d`, `hace N sem`, fecha corta `dd/mm/yy` cuando es >30 días.
- Sort con null al final cuando desc (los que nunca recibieron mensaje
  no deben tapar los más recientes).
- Columna toggleable desde el dropdown `Settings2`. Default `true`. Merge
  con localStorage para que un user con preferencias viejas reciba la
  columna nueva automáticamente.

---

## 4. Overlay per-community en `MessageDialog.contactOptions`

### Bug reportado

"Cuando el número está mal lo cambio pero no toma el cambio al enviar
WhatsApp."

### Causa

`MessageDialog.contactOptions` (el dropdown de teléfonos) leía
`participant.cellPhone` del Participant global, ignorando el **overlay**
(`community_member.cellPhone`). Cuando el coordinador editaba el teléfono
del miembro en `EditCommunityMemberDialog`, el cambio se persistía en el
overlay pero el dropdown seguía mostrando el viejo.

### Fix

`contactOptions` y `checkEmailServerConfig` aplican `resolveMemberProfile(p)`
cuando `context === 'community'`. El overlay gana sobre el Participant
para `cellPhone` y `email`.

Ver skill `community-overlay` para el modelo overlay completo.

---

## 5. Historial de mensajes — fix del raw INSERT

### Bug reportado

"El mensaje se envió pero no se pudo guardar en el historial."

### Causa

`communityCommunicationController.createCommunication` usa raw query
sobre `participant_communications`. El driver `sqlite3` lanza
`SQLITE_RANGE: column index out of range` cuando algún binding viene
`undefined` (por ejemplo `subject` cuando se envía por WhatsApp — el
frontend explícitamente manda `undefined` no `null`).

### Fix

Coerción explícita `?? null` en los 4 bindings opcionales antes del
INSERT: `templateId`, `templateName`, `subject`, `userId`.

Logging endurecido: en lugar del 500 mudo, ahora se logea
`{message, code, stack, dto}` redactado, y el frontend recibe `details`
con el mensaje SQL específico cuando `NODE_ENV !== 'production'`.

### Próximo

Si vuelve a aparecer en producción, el toast del frontend ahora muestra
el detalle del backend — usar eso para diagnosticar (e.g., FK
violation, NOT NULL, etc.).

---

## 6. Marcas locales "ya contacté"

### Qué

Botón ✓ por cada miembro en `CommunityMembersView` que el coordinador puede
togglear para marcar visualmente "ya contacté a este miembro hoy". Las marcas
viven SOLO en `localStorage` por comunidad — no se sincronizan al backend ni
entre dispositivos. Un botón "Reiniciar marcas" en la toolbar las borra todas
para empezar una nueva ronda.

### Por qué NO en backend

El usuario lo pidió explícitamente — quiere algo efímero, sin entrar al
historial real ni contaminar `lastMessageSentAt`. Casos de uso:

- Sesión de follow-up: marcar 12 de 60 ya hablados.
- Empezar ronda nueva: un click "reiniciar" para limpiar.
- Cada coordinador en su navegador (multi-coord = vistas distintas, ok).

### API del composable

```ts
import { useContactedMarks } from '@/composables/useContactedMarks';
const communityIdRef = computed(() => props.id);
const marks = useContactedMarks(communityIdRef);

marks.isMarked(memberId);     // boolean
marks.getMarkedAt(memberId);  // ISO timestamp o undefined
marks.toggle(memberId);       // marca/desmarca
marks.mark(memberId);         // idempotente
marks.unmark(memberId);       // idempotente
marks.clear();                // borra todas las marcas DE ESTA comunidad
marks.count.value;            // computed ref<number>
```

### Storage layout

- Key: `community-contacted-${communityId}`
- Value: JSON `{ [memberId]: ISO_timestamp }`
- Tolerante a corrupción: si el JSON está malformado, reset silencioso.
- Tolerante a `QuotaExceededError`: el toggle no persiste pero no rompe la UI.

### UX

- Botón ✓ (CheckCircle2 verde) si marcado, ○ (Circle gris) si no.
- Tooltip muestra "hace X min/h/d" cuando está marcado.
- Botón "Reiniciar marcas (N)" en la toolbar (solo visible cuando hay
  marcas). Click → confirm dialog → clear.

## Tests

- **Backend**: `apps/api/src/tests/services/communityMay18Updates.test.ts`
  (24 tests). Cubre: `lastMessageSentAt` scope filtering, SILENT_STATES,
  persistencia de los 5 estados nuevos, exclusión de roster, timezone
  inference + helper fallback + recalculation.
- **Frontend**: `apps/web/src/components/__tests__/MessageDialog.test.ts`
  (2 tests adicionales). Cubre: overlay cellPhone gana, fallback a
  participant cellPhone sin overlay.
- **Frontend composable**: `apps/web/src/composables/__tests__/useContactedMarks.test.ts`
  (8 tests). Cubre: estado vacío inicial, toggle persiste, mark idempotente,
  unmark idempotente, clear, aislamiento por comunidad, reload al cambiar
  communityId, tolerancia a JSON corrupto.

## Deploy notes

1. Build types: `pnpm --filter @repo/types build` (si tiene build script).
2. Backup DB en prod ANTES de correr migration:
   ```bash
   ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
     "bash /var/www/emaus/backup-db.sh"
   ```
3. Migration:
   ```bash
   ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
     "cd /var/www/emaus && pnpm --filter api migration:run"
   ```
4. Build + deploy frontend (usual flow con `?v=` cache bust).
5. Verificar logs por la primera hora — el `notifyMemberStateChange` y el
   raw INSERT del historial son los más sensibles.
