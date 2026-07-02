# Tasa de asistencia por miembro + fecha de ingreso editable

_Julio 2026._

Agrupa tres cambios relacionados sobre la asistencia de miembros de comunidad:

1. Corrección del cálculo de la **tasa de asistencia** (`lastMeetingsAttendanceRate`).
2. **Fecha de ingreso** (`joinedAt`) editable al crear y editar un miembro.
3. **Registro de asistencia por miembro**: marcar a un miembro en varias reuniones a la vez.

## 1. Cálculo de la tasa de asistencia

`communityService.getMembers` calcula, por miembro:

```
validMeetings   = reuniones no canceladas, no anuncios, con startDate >= joinedAt
                  ∪ reuniones a las que el miembro tiene asistencia registrada (attended = true)
attendedCount   = # de validMeetings con attended = true
rate            = attendedCount / validMeetings.length   (0 si no hay validMeetings)
```

Clasificación (`lastMeetingsFrequency`): `high` ≥ 75, `medium` ≥ 25, `low` ≥ 1, `none` = 0.

### El bug que corrige (`|| attendedIdSet.has(m.id)`)

Antes, `validMeetings` solo consideraba `startDate >= joinedAt`. Si a un miembro se
le daba de alta **durante** una reunión (su `joinedAt` quedaba después del `startDate`
de esa reunión) y se le marcaba presente, la reunión quedaba **fuera del denominador**
pese a tener asistencia registrada → tasa **0% falsa** (0 reuniones válidas).

Fix: una reunión con `attended = true` **siempre** cuenta, aunque sea anterior a
`joinedAt`. Se conserva la intención original de no penalizar a un miembro por
reuniones previas a su ingreso a las que **no** asistió.

Tests: `communityService.test.ts` → `getMembers - Attendance Rate` y `joinedAt custom`.

## 2. Fecha de ingreso (`joinedAt`) editable

`joinedAt` es la fecha desde la que cuentan las reuniones para la tasa. Es un
`@CreateDateColumn` (TypeORM la autofija en el INSERT), así que para respetar un
valor custom se sobreescribe con un `UPDATE` posterior.

- **Crear**: `createCommunityMember` acepta `joinedAt` opcional. Si no viene, queda
  el default (ahora). El modal `CreateMemberModal` expone el campo (opcional).
- **Editar**: `updateMemberProfile` acepta `joinedAt`; compara por timestamp (dos
  `Date` nunca son `===`) y solo persiste si cambió, reportándolo en `changedFields`
  para el audit log. El schema `updateMemberProfileSchema` lo valida (`z.coerce.date`).
  El diálogo `EditCommunityMemberDialog` expone el campo, precargado.

**Timezone**: el `<input type="date">` intercambia `YYYY-MM-DD`. La lectura usa
`toISOString().slice(0,10)` (UTC) y el guardado `new Date('YYYY-MM-DD')` (UTC
medianoche). Usar UTC en ambos lados evita el off-by-one por zona horaria.

> Caso típico: un miembro recién creado muestra 100% porque su única reunión "que
> cuenta" es a la que asistió. Si en realidad se unió antes, corregir `joinedAt` hace
> que las reuniones previas entren al denominador y el porcentaje refleje la realidad.

## 3. Registro de asistencia por miembro

Componente `MemberAttendanceDialog.vue`, abierto desde el botón "Registrar asistencia"
(ícono portapapeles) en la fila del miembro (`CommunityMembersView`).

- Lista reuniones **pasadas o de hoy** (excluye anuncios, canceladas y futuras),
  más recientes primero.
- Precarga con **una** llamada (`getMemberAttendance`) y guarda con **una** llamada
  bulk (`bulkRecordMemberAttendance`), enviando solo las reuniones que cambiaron.
- Al guardar emite `saved`; la vista refetchea miembros para refrescar el badge.

Tests: `MemberAttendanceDialog.test.ts` (unit) y `tests/e2e/community-attendance.spec.ts` (E2E).

### Endpoints de asistencia por miembro

Agregados para evitar las N llamadas por-reunión del cliente:

- `GET /communities/:id/members/:memberId/attendance` → `[{ meetingId, attended }]`
  (solo registros existentes; ausencia implícita = sin registro). Servicio
  `getMemberAttendance`.
- `POST /communities/:id/members/:memberId/attendance/bulk` con `{ records: [{ meetingId, attended }] }`
  → `{ updated }`. Upsert idempotente; ignora reuniones que no son de la comunidad.
  Servicio `bulkRecordMemberAttendance`, schema `bulkMemberAttendanceSchema`.

## 4. UI de la lista de miembros

- **Badge con conteo**: el badge de asistencia muestra `Alta (100% · 1/1)`. `getMembers`
  devuelve `lastMeetingsAttended` y `lastMeetingsTotal` además del rate; con `total = 0`
  se omite el `· n/total`. Da contexto y evita la lectura engañosa (100% con 1 reunión).
- **Responsive + paginación**: tabla en escritorio (`hidden md:block`), **tarjetas** en
  móvil (`md:hidden`), y **paginación** client-side de 25 por página (se resetea a la
  página 1 al cambiar búsqueda/filtro/orden).
- **`MemberActions.vue`**: componente reutilizable con las acciones de fila (Contactado,
  Asistencia, Mensaje visibles + menú "⋮" con Notas/Historial/Editar/Eliminar), usado
  tanto por la tabla como por las tarjetas. Usa `useRekaDialogFix({ poll: false })`
  (`deferOpen`); el poll global de limpieza vive una sola vez en la vista padre.

## UI relacionada

- La columna/tarjeta antes llamada **"Frecuencia de Participación"** ahora se llama
  **"Asistencia"** (`community.participationRate` / `community.stats.participationRate`).

## Archivos clave

- `apps/api/src/services/communityService.ts` — `getMembers`, `createCommunityMember`, `updateMemberProfile`, `getMemberAttendance`, `bulkRecordMemberAttendance`
- `apps/api/src/controllers/communityController.ts` — `updateMemberProfile`, `getMemberAttendance`, `bulkRecordMemberAttendance`
- `apps/api/src/routes/communityRoutes.ts` — rutas de asistencia por miembro
- `packages/types/src/community.ts` — `updateMemberProfileSchema`, `bulkMemberAttendanceSchema`
- `apps/web/src/components/community/MemberAttendanceDialog.vue`
- `apps/web/src/components/community/MemberActions.vue` — acciones de fila reutilizables
- `apps/web/src/components/community/CreateMemberModal.vue`
- `apps/web/src/components/EditCommunityMemberDialog.vue`
- `apps/web/src/views/CommunityMembersView.vue` — tabla/tarjetas + paginación
- `apps/web/tests/e2e/community-attendance.spec.ts` — E2E del flujo
