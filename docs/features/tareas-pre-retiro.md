# Tareas Pre-Retiro (checklist "Qué Hacer y Cuándo")

Checklist de logística previa al retiro, análogo al Minuto a Minuto: **templates
globales reutilizables** → **materialización por retiro** con fechas límite
calculadas desde `retreat.startDate`, y una vista de gestión con semáforo.
Reemplaza el Excel "Que Hacer y Cuando Antes de un Retiro" (hoja Que-Cuando).

## Para el coordinador

- **Crear retiro**: el modal "Agregar Retiro" → pestaña **Logística** tiene la
  sección **"Template Tareas Pre-Retiro"** (junto a la del MaM). Con el checkbox
  "Crear las tareas al crear el retiro" (default ✔), al guardar se genera el
  checklist completo con `dueDate = startDate − offset` por tarea. En modo
  edición hay botón **"Importar ahora (sobrescribe)"**.
- **Vista por retiro**: `Logística → Tareas Pre-Retiro`. Tareas agrupadas por
  bucket de tiempo ("4 meses antes" → "2 días antes" → "Otras fechas" → "Sin
  fecha") o lista corrida (toggle). Cada tarea padre muestra **semáforo**
  (🔴 Vencida / 🟡 Próxima ≤7 días / gris A tiempo / verde Lista), fecha límite,
  responsable y **progreso agregado** (2/4); expandible con sus sub-tareas.
- **Marcar estado**: checkbox = Listo/Pendiente (update optimista con rollback);
  menú `⋮` = Editar / Agregar sub-tarea (solo raíces) / Marcar no aplica /
  Eliminar. "No aplica" excluye la tarea del progreso.
- **Responsable**: opcionalmente un **servidor del retiro** (autocomplete) y/o
  **texto libre** ("JAAM", "Leo"…). Ambos opcionales, se muestran juntos. Las
  tareas sin responsable muestran **"👤 Sin asignar"**; un clic abre un **picker
  inline** (buscador de servidores + "✕ Quitar responsable") que asigna al
  instante sin abrir el modal (no cambia el estado de la tarea).
- **Marca "● Hoy"**: una línea rosa (estilo AHORA del MaM) separa las tareas
  vencidas de las próximas, ubicada antes del primer bucket cuyo vencimiento es
  hoy o futuro (solo en agrupación por tiempo).
- **Contador en el header**: además de "X/Y listas", badges de "N vencidas",
  "N esta semana" y "N sin asignar".
- **Filtro por estado**: chips Todas / Pendientes / Vencidas / Listas (filtra
  raíces y sub-tareas; conserva un padre si él o alguna sub-tarea coincide).
- **Exportar**: botón "⬇ Exportar" (visible a todos los roles) descarga un CSV
  (con BOM UTF-8, abre en Excel) con una fila por tarea/sub-tarea. Helper puro
  `tasksToCsv` en el store.
- **Importar desde template**: dialog con dos modos — **"Solo agregar
  faltantes"** (idempotente, mantiene lo capturado) o **"Reemplazar todo"**.
- **Card en el dashboard del retiro** (`Tareas Pre-Retiro`): muestra
  Listas N/M · Vencidas · Esta semana · Sin asignar + barra de progreso; enlaza
  a la vista. A diferencia del card del MaM, **no** está gated por
  `isRetreatLive` (las tareas aplican en los meses previos). Se personaliza/oculta
  desde el panel del dashboard (key `preRetreatTasks`).
- **Template global**: `Configuración Global → Template Tareas Pre-Retiro` — ABM
  de sets (crear, marcar ★ predeterminado, eliminar) y de tareas/sub-tareas.
  Las sub-tareas pueden **heredar el tiempo del padre** (offset null).

V1 es **solo semáforo visual**: no hay recordatorios automáticos por
email/WhatsApp (fase 2 si se necesita; la infraestructura de mensajes existe).

## Modelo de datos

Tres tablas (migración `20260702120000_CreatePreRetreatTasks.ts`):

```
pre_retreat_task_template_set     (agrupador; name UNIQUE, isDefault, sourceTag)
pre_retreat_task_template         (tarea del template; parentId self-FK CASCADE,
                                   dueOffsetDays, defaultOrder, supportNotes)
retreat_pre_retreat_task          (instancia; retreatId CASCADE, templateId SET NULL,
                                   parentId self-FK CASCADE, dueOffsetDays, dueDate,
                                   status, responsibleParticipantId SET NULL,
                                   responsibleText, notes, supportNotes, sortOrder,
                                   completedAt)
```

Decisiones clave:

- **Sub-tareas por self-FK `parentId`** en la misma tabla, profundidad **máx 2**
  validada en el servicio (no en DDL). Una raíz con hijos no puede volverse
  sub-tarea, ni un hijo tener hijos.
- **Responsable = FK única + texto libre** (no tabla N:N como el MaM): el
  requerimiento es 1 participante opcional + nombre libre.
- **Offsets como `dueOffsetDays: integer`** con mes = 30 días. Mapa del Excel:
  4 meses=120, 3=90, 2=60; 12 sem=84, 10=70, 8=56, 5=35, 4=28, 3=21, 2=14,
  1 sem=7, 2 días=2. Regla de formato round-trip (`offsetDaysToParts`):
  `≥60 && %30==0` → meses; si no `%7==0 && ≥7` → semanas; si no → días.
- **`dueDate` es date-only (`YYYY-MM-DD` string, columna `date`)** — nunca
  `Date`/`z.coerce.date()`: `retreat.startDate` es columna `date` y un Date con
  TZ local hace saltar la fecha un día (lección `timezone-handling`). Toda la
  aritmética vive en `computeDueDate` (UTC puro).
- `status`: `pending | in_progress | done | not_applicable`. `done` setea
  `completedAt`; salir de `done` lo limpia. `not_applicable` se excluye del
  progreso (`computeTaskProgress`).

## Helpers compartidos (`packages/types/src/preRetreatTaskTime.ts`)

`partsToOffsetDays` / `offsetDaysToParts` / `formatDueOffset` ("4 meses",
"12 semanas", "2 días") / `computeDueDate(startDate, offsetDays)` / `diffDays` /
`taskSemaphore(dueDate, todayISO, status)` → `'done'|'overdue'|'soon'|'ok'|'none'`
(soon = ≤7 días) / `computeTaskProgress(children)`. Single source of truth para
API y web (el web los importa de `@repo/types`).

Schemas Zod en `packages/types/src/preRetreatTask.ts`. Los write schemas parten
del **base sin campos derivados** (`responsible`, `children`, `progress`,
`completedAt`, timestamps se descartan, no revientan) — regla anti-400 del
proyecto, guard en `preRetreatTaskWriteSchemas.simple.test.ts`.

## Endpoints REST

```
GET    /api/pre-retreat-task-templates/sets            preRetreatTaskTemplate:read
POST   /api/pre-retreat-task-templates/sets            preRetreatTaskTemplate:manage
GET/PATCH/DELETE /api/pre-retreat-task-templates/sets/:id
GET    /api/pre-retreat-task-templates?setId=<uuid>    (flat con parentId)
POST/PATCH/DELETE /api/pre-retreat-task-templates[/:id]

GET    /api/pre-retreat-tasks/retreats/:retreatId/tasks         preRetreatTask:read  + requireRetreatAccess
POST   /api/pre-retreat-tasks/retreats/:retreatId/tasks         preRetreatTask:manage + requireRetreatAccess
POST   /api/pre-retreat-tasks/retreats/:retreatId/materialize   {templateSetId?, clearExisting?, baseDate?}
POST   /api/pre-retreat-tasks/retreats/:retreatId/add-missing   idempotente → {added, skipped, total}
PATCH  /api/pre-retreat-tasks/tasks/:id                         preRetreatTask:manage + guard anti-IDOR
POST   /api/pre-retreat-tasks/tasks/:id/status                  {status}
DELETE /api/pre-retreat-tasks/tasks/:id                         (CASCADE a sub-tareas)
```

`GET …/tasks` devuelve el **árbol**: raíces con `children[]`, `progress` y
`responsible` (lite: id/firstName/lastName/nickname), orden `dueDate ASC NULLS
LAST, sortOrder`.

**Guard anti-IDOR en rutas item-level**: `requireRetreatAccess` por parámetro no
aplica en `/tasks/:id`, así que el controller (`loadTaskWithAccess`) carga la
tarea y valida `authorizationService.hasRetreatAccess(userId, task.retreatId)`
antes de mutar (lección incidente 2026-05-15; el MaM no lo hace, aquí sí).

## Materialización

`retreatPreRetreatTaskService.materializeFromTemplate(retreatId, templateSetId?,
clearExisting?, baseDate?)`:

- Set explícito o el `isDefault`; base = `baseDate ?? retreat.startDate`.
- **Dos pasadas**: raíces primero (map `templateId → instanceId`), luego hijos
  con `parentId` mapeado. Offset efectivo de un hijo sin offset = el del padre.
- `dueDate = computeDueDate(base, offset)`; sin offset → sin fecha.

`addMissingTemplateItems` es idempotente: dedup por `templateId` y por clave
`(nombre del padre normalizado || '', nombre normalizado)` — análogo al
`(day, name)` del MaM. Sirve para propagar tareas nuevas del template a retiros
ya materializados sin tocar lo capturado.

## Permisos RBAC

| Recurso | Ops | Roles |
|---|---|---|
| `preRetreatTask` | read, manage | superadmin/admin/region_admin/logistics (manage); communications/treasurer/regular_server/regular (read) |
| `preRetreatTaskTemplate` | read, manage | superadmin/admin (manage); region_admin (read) |

Espejo exacto de la matriz `schedule`/`scheduleTemplate`. UI: `canManage.preRetreatTask`
(permisos del retiro) y `canManage.preRetreatTaskTemplate` (globales) en
`useAuthPermissions`; union `PermissionType` del Sidebar y catálogo `RESOURCES`
de `utils/permissions.ts` extendidos.

## Seeder

`apps/api/src/data/preRetreatTaskSeeder.ts` — set **"Pre-retiro — Emaús"**
(`sourceTag: 'que_cuando_xlsx'`, `isDefault: true`) con las **40 tareas raíz +
33 sub-tareas** del Excel Del Valle I. Sin responsables (esos son por retiro).
Patrón del seeder MaM: `upsertSet` por nombre → `seedSet` **aditivo** por clave
`(padre, nombre)` → `syncTemplateFields` (`dueOffsetDays`, `defaultOrder`,
`description`, `supportNotes`; undefined=no tocar, null=limpiar). Invocado en
`apps/api/src/index.ts` (bootstrap) y `retreatService.createRetreat`.

## Frontend

- Store: `apps/web/src/stores/preRetreatTaskStore.ts`. Sin WebSockets en V1. Además del árbol:
  - `buckets` (agrupación por tiempo), `totalProgress`, `counts` (`{total, done, overdue, soon, unassigned}` — helper puro `computeTaskCounts`), `semaphoreFor`.
  - `toggleDone(id)`: **cascada** optimista padre↔hijos ignorando `not_applicable` — marcar el padre marca los hijos activos; al marcar el último hijo activo el padre se marca solo; ante error del server recarga el árbol.
  - `tasksToCsv(tasks)`: helper puro que serializa a CSV (usado por el botón Exportar, con BOM UTF-8).
- Vistas: `PreRetreatTasksView.vue` (por retiro — semáforo, marca "● Hoy", contador, filtro por estado, export, cascada) y `PreRetreatTaskTemplateView.vue` (global) — rutas lazy `retreats/:id/tareas-pre-retiro` y `settings/pre-retreat-task-template`.
- Componentes:
  - `PreRetreatTaskEditModal.vue` (offset valor+unidad ↔ fecha con preview; responsable = `ParticipantSelect` + texto libre).
  - `PreRetreatTaskTemplateEditModal.vue` (hijos pueden heredar offset).
  - `PreRetreatTaskAssignInline.vue`: picker inline de responsable al tocar "Sin asignar" (buscador + "Quitar responsable"); clampa el panel al viewport y usa `focus({ preventScroll: true })` + input `text-base` en móvil (evita el salto de pantalla / zoom iOS).
- **Nombres de responsable**: helper compartido `apps/web/src/utils/participant.ts` (`participantLabel` + `isMeaninglessNickname`) — apodos vacíos o "N/A" caen al nombre completo. Usado en el chip, el picker inline, el CSV, `ParticipantSelect`, y las vistas del MaM / Asignar Responsables / Badges (consolida el patrón `nickname || nombre` que estaba duplicado).
- **Card en el dashboard** (`RetreatDashboardView.vue`): key `preRetreatTasks` en `dashboardSettingsStore` + `DashboardCustomizePanel` (label); conteos vía `fetchPreTasks` → `computeTaskCounts`. **No** gated por `isRetreatLive`.
- **Ayuda contextual** ("Obtener ayuda para esta página"): registrada en `apps/web/src/config/helpIndex.ts` (`routeContext: ['pre-retreat-task']`, cubre ambas rutas) + docs `apps/web/src/docs/{es,en}/pre-retreat-tasks.md`.
- API centralizada: `preRetreatTaskApi` / `preRetreatTaskTemplateApi` en `services/api.ts`; errores con `apiErrorMessage`.
- Sidebar: ítem "Tareas Pre-Retiro" (sección Logística, requiere retiro) y "Template Tareas Pre-Retiro" (Configuración Global), ícono `ClipboardList`.

## Tests

| Archivo | Cubre |
|---|---|
| `apps/api/src/tests/services/preRetreatTaskTime.simple.test.ts` | round-trip de todos los offsets del Excel, formato, computeDueDate (cruce mes/año), semáforo, progreso |
| `apps/api/src/tests/services/preRetreatTaskWriteSchemas.simple.test.ts` | guard anti-400: DTO de lectura sucio pasa por write schemas; dueDate date-only; `""→null` en responsable |
| `apps/api/src/tests/services/preRetreatTaskSeeder.simple.test.ts` | claves (padre,nombre) únicas, offsets 120→2, sin nietos |
| `apps/api/src/tests/services/retreatPreRetreatTaskService.materialize.test.ts` | integración DB real: dos pasadas + herencia de offset, clearExisting, add-missing idempotente, profundidad 2 rechazada, completedAt, seeder idempotente |
| `apps/api/src/tests/services/preRetreatTaskTemplateService.depth.test.ts` | integración DB real: jerarquía del template — sub-tarea válida, rechazo de nieto / padre-de-otro-set / raíz-con-hijos→sub-tarea / auto-padre, borrado en cascada |
| `apps/web/src/stores/__tests__/preRetreatTaskStore.test.ts` | buckets, progreso, `computeTaskCounts`, `tasksToCsv`, semáforo, setStatus optimista + rollback, **cascada `toggleDone`** (padre↔hijos, ignora N/A) |
| `apps/web/src/views/__tests__/PreRetreatTasksView.test.ts` | grupos, semáforo, contador de vencidas, gating sin manage, checkboxes raíz/hijo, marca "Hoy", filtro por estado, asignación inline, export CSV, dialog de importar |
| `apps/web/src/components/__tests__/PreRetreatTaskAssignInline.test.ts` | picker inline: "Sin asignar", solo-lectura sin manage, oculta apodos "N/A", emite `assign(id)` / `assign(null)` (quitar), filtro del buscador |
| `apps/web/src/components/__tests__/PreRetreatTaskEditModal.test.ts` | crear con `dueOffsetDays` derivado (valor+unidad→días, dueDate calculada), no guarda sin nombre, edición precarga offset + llama `updateTask`, sub-tarea con `parentId` |
| `apps/web/src/utils/__tests__/participant.test.ts` | `isMeaninglessNickname` (N/A y variantes) + `participantLabel` (apodo vs nombre completo) |

Notas de testing:
- Entidades nuevas registradas también en `apps/api/src/tests/test-setup.ts` (usa `synchronize`, no corre migraciones — por eso no hay test funcional de la migración; la seguridad estructural la cubre `sqliteSafePattern.simple.test.ts`).
- Íconos `ClipboardList`/`ChevronsUpDown`/`Download` en los mocks de lucide (`apps/web/src/test/setup.ts` y el mock local de `Sidebar.test.ts`).
- Al mockear `@repo/ui` `Button` para tests que cuentan clics, declarar `emits: ['click']` — si no, Vue añade un listener nativo además del `$emit('click')` y el handler se dispara **dos veces**.
