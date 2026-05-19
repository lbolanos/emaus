# Reuniones recurrentes — overhaul mayo 2026

## Resumen

Refactor end-to-end del sistema de reuniones recurrentes de comunidad. Cubre 4
fases:

- **A — Bugs P0**: instancias no notificaban a los miembros, `exceptionType=cancelled`
  era ignorado, `scope='all_future'` era un alias de `'all'`, sin tests de scope.
- **B — Cron + tope**: generación automática de instancias en background y campo
  opcional `recurrenceEndDate` (tope de la serie).
- **C — UX de listado**: tabs Próximas / Pasadas / Todas, búsqueda, edición con
  confirmación de reuniones pasadas.
- **D — Pulido**: tooltip de ocurrencia, responsive de modal.

Resultado: 18 tests backend nuevos + 21 tests frontend nuevos, 0 regresiones.

---

## Cambios visibles para el usuario

### 1. Las series ahora se autogeneran (notificación gated por flag)

**Antes**: el coordinador tenía que hacer click en "Crear siguiente reunión"
cada semana. Si se olvidaba, la serie se "paraba". Cuando finalmente generaba
la instancia, los miembros no recibían correo (bug latente).

**Ahora**: un cron diario (06:00 hora del servidor) recorre todos los templates
activos y materializa las instancias necesarias para los próximos 14 días.

**Envío de correos: pausado por feature flag** —
`isMeetingEmailNotificationsEnabled()` lee `process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED`.
Default `false` (apagado). Cuando se active (poniendo la env var en `true`):

- `createMeeting` envía email a los miembros activos al crear reunión one-time.
- `createNextMeetingInstance` (manual o vía cron) envía email por cada instancia
  generada, salvo que su fecha quede en el pasado o se pase `?notify=false`.

El endpoint manual `POST /communities/:id/meetings/:meetingId/notify` que el
coordinador dispara desde la UI **sigue funcionando sin importar el flag** — es
decisión consciente y explícita.

Para reactivar en prod: `MEETING_EMAIL_NOTIFICATIONS_ENABLED=true` en
`/etc/systemd/system/emaus-api.service.d/secrets.conf` y `systemctl restart
emaus-api`.

### 2. Tope opcional para la recurrencia

Nuevo campo en el form de "Repetición": **"Repetir hasta (opcional)"**.

- Vacío = la serie continúa indefinidamente, sujeta al safety net de 52 instancias
  por template.
- Con fecha: tanto el cron como `createNextMeetingInstance` se detienen cuando
  `nextDate > recurrenceEndDate`.

### 3. Filtros y búsqueda en el listado

`CommunityMeetingsView` ahora tiene 3 tabs:

- **Próximas** (default): solo `startDate >= now`, orden ascendente.
- **Pasadas**: solo `startDate < now`, orden descendente (más recientes arriba).
- **Todas**: todo, orden descendente.

Cada tab muestra contador. Búsqueda por título o descripción (case-insensitive,
match parcial). El filtro activo se persiste en la URL (`?filter=past`) para
deep-link y back/forward.

### 4. Cancelaciones reales

`exceptionType='cancelled'` antes existía en el schema pero era ignorado en todas
las queries. Ahora las instancias canceladas se excluyen de:

- `getMeetings` (listado principal)
- `getMyCommunitiesWithMeetings` (G4)
- `getPublicAttendanceData` (devuelve null → 404)
- `getDashboardStats` (no contribuyen a stats)
- `getPublicMeetings`
- `getMembers` cálculo de `lastMeetingsAttendanceRate`
- `getMemberTimeline`
- `notifyMembersOfMeeting` (guard al inicio: no envía)
- `notifyMemberStateChange` cuando busca "próxima reunión" para email de bienvenida

> Nota: aún no hay UI para "cancelar esta ocurrencia" — la columna se setea
> manualmente desde aiChat o por integración futura. Esto cierra el comportamiento
> a nivel de queries para cuando la UI llegue.

### 5. Editar reuniones pasadas requiere confirmación

Antes el botón Editar abría el modal y el usuario veía un error de validación al
guardar ("La fecha no puede ser anterior a hoy"). Ahora:

1. Click en Editar de una reunión pasada → abre dialog "Esta reunión ya pasó.
   Editar una reunión histórica puede crear inconsistencias con las asistencias
   ya registradas. ¿Quieres continuar?"
2. Si confirma → se abre el modal de edición con la validación de fecha
   suspendida (puede dejar la fecha original o moverla a cualquier momento).

### 6. Tooltip de ocurrencia

Hover sobre el badge "Recurrente" muestra:

- Template raíz: "Serie iniciada el 15 may. 2026 · 5 reuniones en el listado".
- Instancia: "Ocurrencia 3 de 5 · serie iniciada el 15 may. 2026".

---

## Cambios técnicos

### Schema

Migration `20260519200000_AddRecurrenceEndDateToCommunityMeeting`:

```sql
ALTER TABLE "community_meeting" ADD COLUMN "recurrenceEndDate" date;
```

Nullable. Entity en `apps/api/src/entities/communityMeeting.entity.ts` y schema
Zod en `packages/types/src/community.ts`.

### Modelo de instancias: `parentMeetingId` siempre apunta al root

**Cambio de comportamiento**: antes, `createNextMeetingInstance(seedId)` seteaba
`parentMeetingId: seedId` literalmente, lo que producía cadenas (template →
instance1 → instance2) cuando el caller pasaba la instancia previa como seed.

Ahora la función resuelve `rootId = seed.parentMeetingId ?? seed.id` y todas
las instancias apuntan al root. Esto:

- Simplifica queries de "todas las instancias de la serie X" (`WHERE
  parentMeetingId = X`).
- Hace que el conteo del límite de 52 sea contra la serie completa, no por
  segmento de cadena.
- Permite que el scope `all_future` opere consistentemente desde cualquier
  instancia.

Implicación: cualquier código que dependa de chaining via `parentMeetingId` debe
revisarse. El refactor cubre `updateMeeting` y `deleteMeeting`.

### `scope='all_future'` real

Antes era idéntico a `'all'`. Ahora:

- **`updateMeeting`**: actualiza template raíz + propaga campos no-fecha (title,
  description, durationMinutes, flyerTemplate, isAnnouncement) **solo** a
  instancias con `startDate >= esta ocurrencia`. Pasadas se quedan como estaban.
- **`deleteMeeting`**: borra instancias `>= esta ocurrencia` + corta la
  recurrencia del template raíz (`recurrenceFrequency=null`,
  `isRecurrenceTemplate=false`). Pasadas se conservan con su attendance histórica.

`scope='all'` también recibió mejora: ahora propaga los campos no-fecha al
template *y* a todas las instancias materializadas (antes solo modificaba el
template, dejando las instancias con datos viejos).

Helper privado `CommunityService.pickPropagableFields()` define los campos
propagables. `startDate/endDate/recurrence*` quedan deliberadamente fuera: cambiar
la hora de una instancia ya materializada rompería asistencias capturadas. Para
cambiar el horario de la serie, borrar las futuras con `all_future` y dejar que
el cron las regenere.

### Cron: `meetingInstanceGeneratorService`

`apps/api/src/services/meetingInstanceGeneratorService.ts`. Singleton estilo
`SantisimoReminderService`. Schedule `0 6 * * *`. Por cada template root activo:

1. Busca la instancia más reciente de la serie (o usa el template si no hay).
2. Calcula `calculateNextOccurrence` desde su startDate.
3. Si la próxima fecha cae dentro de `now + 14 días` y antes de
   `recurrenceEndDate` (si existe), llama
   `createNextMeetingInstance(seed.id, { notify: !isPast })`.
4. Repite (encadenando con la nueva instancia como seed) hasta superar la
   ventana, el endDate, o el safety net de 52 instancias por run.

Es idempotente: la verificación de duplicados por `startDate` dentro de
`createNextMeetingInstance` previene doble-creación cuando el cron se ejecuta
dos veces.

**Lazy init**: el singleton instancia `CommunityService` solo en su primer uso,
no al importar el módulo. Esto es necesario porque el harness de Jest reemplaza
`AppDataSource` después del import; capturar la referencia al import time daba
`Class constructor CommunityMeeting cannot be invoked without 'new'`.

Registrado en `apps/api/src/index.ts:212` junto a los otros servicios cron.

### Notificaciones de instancia

`createNextMeetingInstance` ahora acepta `options.notify` (default `true`).
Llama `notifyMembersOfMeeting(saved.id)` fire-and-forget al final. El endpoint
`POST /communities/meetings/:id/next-instance` lee `?notify=false` para opt-out
explícito.

`notifyMembersOfMeeting` ahora abre con guard `if (meeting.exceptionType ===
'cancelled') return;` — la notificación nunca anuncia una reunión cancelada.

---

## Archivos modificados

### Backend
- `apps/api/src/entities/communityMeeting.entity.ts` (+ recurrenceEndDate)
- `apps/api/src/services/communityService.ts` (notif, scope, cancelled filter, root parentId)
- `apps/api/src/services/meetingInstanceGeneratorService.ts` **(nuevo)**
- `apps/api/src/controllers/communityController.ts` (?notify query)
- `apps/api/src/index.ts` (registra cron)
- `apps/api/src/migrations/sqlite/20260519200000_AddRecurrenceEndDateToCommunityMeeting.ts` **(nuevo)**
- `packages/types/src/community.ts` (schema)

### Frontend
- `apps/web/src/views/CommunityMeetingsView.vue` (tabs, búsqueda, confirmación)
- `apps/web/src/components/community/MeetingFormModal.vue` (endDate, validación, mobile)
- `apps/web/src/components/community/forms/MeetingRecurrenceForm.vue` (input endDate, preview)
- `apps/web/src/locales/es.json` y `en.json`

### Tests nuevos
- `apps/api/src/tests/services/communityService.test.ts`: 13 tests
  (createNextMeetingInstance notify, scope=this/all/all_future en update y delete,
  exceptionType=cancelled, recurrenceEndDate respetado, parentMeetingId al root).
- `apps/api/src/tests/services/meetingInstanceGenerator.test.ts` **(nuevo)**: 5
  tests (lookahead, idempotencia, endDate cap, skip cancelados, no regenerar tras
  sever).
- `apps/web/src/components/community/forms/__tests__/MeetingRecurrenceForm.test.ts`
  **(nuevo)**: 10 tests (input, emits, min vs startDate, preview con/sin endDate).
- `apps/web/src/views/__tests__/CommunityMeetingsView.test.ts` **(nuevo)**: 11
  tests (tabs, búsqueda título/descripción, ordenamiento, URL sync, empty state,
  past-edit confirm).

---

## Verificación end-to-end

1. **Notificación de instancia**: crear serie weekly. Forzar `performGeneration`
   (o esperar 6 AM). Verificar `__sentEmails` en test, o ver el inbox real con
   credenciales `leonardo.bolanos@gmail.com / 123456`.
2. **Cancelación**: setear `exceptionType='cancelled'` vía SQL/aiChat sobre una
   instancia. Verificar que desaparece del listado UI y que
   `GET /public/attendance/...` devuelve 404.
3. **Tope**: crear serie con `recurrenceEndDate = today + 21 días`. El cron
   genera 3 instancias y luego se detiene.
4. **Update propagado**: editar título de un template con scope `all`. Verificar
   que las instancias materializadas reflejan el cambio. Con scope `all_future`,
   solo las futuras.
5. **Filtros UI**: con 5 reuniones (3 pasadas + 2 futuras), tab Próximas muestra
   2, Pasadas 3, Todas 5. Búsqueda "domingo" filtra a las que tengan ese término.
6. **Edición de pasadas**: click en Editar de una reunión pasada → dialog de
   confirmación. Aceptar → modal abre sin error de validación de fecha.

### Comandos

```bash
# Backend
pnpm --filter api test -- --testPathPattern="communityService.test|meetingInstanceGenerator"
pnpm --filter api migration:run  # aplica AddRecurrenceEndDateToCommunityMeeting

# Frontend
pnpm --filter web test src/components/community/forms/__tests__/MeetingRecurrenceForm.test.ts
pnpm --filter web test src/views/__tests__/CommunityMeetingsView.test.ts

# Smoke build
pnpm --filter api build
pnpm --filter web build
```

---

## Lo que NO se hizo (decisiones explícitas)

- **Vista calendario** (mes/semana). Estimado ~6-8h. Decidido omitir hasta tener
  feedback de coordinadoras sobre si justifica el esfuerzo.
- **`Drawer` real en mobile**. `@repo/ui` no expone Drawer; agregar el componente
  requería 20+ archivos de reka-ui. En su lugar, el `Dialog` ahora ocupa pantalla
  completa en `<sm` (rounded-none, w-100vw) y los labels de tabs se abrevian.
- **`exceptionType='cancelled'` desde UI**. La columna ya se respeta en queries,
  pero no hay todavía botón "Cancelar esta ocurrencia". Quedó listo para cuando
  se decida la UX (probablemente como item del dropdown junto a Editar / Eliminar).

---

## Referencias

- Plan original: `/Users/lbolanos/.claude/plans/no-sera-mejor-tener-wondrous-narwhal.md`
- Commit base: `5652e18` (lastMessageSentAt UTC + OOM postmortem) — el overhaul
  parte de aquí.
- Skill `arquitectura/SKILL.md` describe el patrón cron singleton usado por
  `SantisimoReminderService` y replicado por `MeetingInstanceGeneratorService`.
