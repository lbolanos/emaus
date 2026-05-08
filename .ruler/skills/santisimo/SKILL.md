---
name: santisimo
description: "Horario de Guardias de la Capilla (adoración al Santísimo) — arquitectura, API, flujo público y convenciones."
---

# Santísimo / Horario de Guardias de la Capilla

Sistema de inscripción a slots horarios de adoración eucarística para cada retiro. Permite generar slots automáticamente entre dos fechas, activar un enlace público (slug del retiro) para que la comunidad externa ("angelitos") se inscriba solo con nombre, y administrar las inscripciones desde la vista admin.

## Dominio

- Formato tradicional: columnas **Viernes / Sábado / Domingo**, filas de "X a Y AM/PM".
- Rango típico: viernes 17:00 → domingo 13:00, slots de 60 min.
- Capacidad típica = **1 persona por slot** (configurable).
- Algunas horas se marcan "No se requiere" — el slot aparece pero no acepta inscripción (`isDisabled=true`).
- Quien se inscribe: mayoritariamente la **comunidad externa** (padrinos, ex-retirantes, familiares) — los caminantes no se inscriben.
- Un "angelito" puede inscribirse con solo el nombre. Teléfono y correo son opcionales.

## Modelo de datos

Dos tablas nuevas + un flag en `retreat`:

### `retreat.santisimoEnabled`
Flag booleano que habilita el enlace público. El enlace funciona si `retreat.isPublic && retreat.santisimoEnabled`.

### `santisimo_slot`
- `id`, `retreatId` (FK → retreat, CASCADE)
- `startTime`, `endTime` (datetime)
- `capacity` (int, default 1)
- `isDisabled` (boolean, default false) — equivale a "No se requiere esta hora"
- `intention`, `notes` (text, nullable)
- Índice único `(retreatId, startTime)` evita duplicados al regenerar.

### `santisimo_signup`
- `id`, `slotId` (FK → santisimo_slot, CASCADE)
- `name` (requerido, 120 chars)
- `phone`, `email` (opcionales)
- `userId` (nullable FK → users) — vincula si la persona existe como usuario
- `cancelToken` (único) — para auto-cancelación por enlace
- `ipAddress` (auditoría)

## Backend

### Archivos
- `apps/api/src/entities/santisimoSlot.entity.ts`
- `apps/api/src/entities/santisimoSignup.entity.ts`
- `apps/api/src/services/santisimoService.ts` — toda la lógica
- `apps/api/src/controllers/santisimoController.ts`
- `apps/api/src/routes/santisimoRoutes.ts` — montado bajo `/api/santisimo`
- `apps/api/src/migrations/sqlite/20260418120000_CreateSantisimo.ts`
- `packages/types/src/santisimo.ts` — Zod schemas

### Endpoints admin (auth + `requirePermission`)
- `GET    /api/santisimo/retreats/:retreatId/slots` — lista con `signedUpCount` e inscripciones
- `POST   /api/santisimo/retreats/:retreatId/slots` — crear slot
- `POST   /api/santisimo/retreats/:retreatId/slots/generate` — body `{ startDateTime, endDateTime, slotMinutes=60, capacity=1, clearExisting? }`
- `POST   /api/santisimo/retreats/:retreatId/slots/regenerate-from-schedule` — **destructivo**: borra TODOS los slots+signups, re-materializa el Minuto a Minuto desde el template con la timezone actual y regenera slots desde los items santísimo. Devuelve `{ deleted, created, replacedItems, removedTemplateItems, slots[] }`. Ver sección "Botón Borrar todo y regenerar" abajo.
- `PATCH  /api/santisimo/slots/:id` — editar (incluye toggling `isDisabled`)
- `DELETE /api/santisimo/slots/:id`
- `GET    /api/santisimo/slots/:id/signups`
- `POST   /api/santisimo/retreats/:retreatId/signups` — admin inscribe (body: `{ slotId, name, phone?, email?, userId? }`, solo `name` requerido)
- `DELETE /api/santisimo/signups/:id`

### Endpoints públicos (sin auth, CSRF-exento, reCAPTCHA + rate limit)
- `GET    /api/santisimo/public/:slug` — esquema público (solo primer nombre de inscritos)
- `POST   /api/santisimo/public/:slug/signups` — body `{ slotIds[], name, phone?, email?, recaptchaToken }` → retorna `{ signups: [{ id, slotId, cancelToken }] }`
- `DELETE /api/santisimo/public/signups/:token` — auto-cancelación

Rechazos:
- 404 si `!retreat.isPublic || !retreat.santisimoEnabled`
- 409 si slot lleno (`CAPACITY`), deshabilitado (`DISABLED`), o ya pasó (`PAST`)

### Concurrencia
Capacidad suave: `SELECT COUNT → INSERT` sin lock. Overshoot de +1 aceptable (el admin puede ajustar manualmente). No usa `SELECT FOR UPDATE`.

### Permisos
- `santisimo:read` — ver horarios e inscripciones
- `santisimo:manage` — crear / editar / eliminar slots e inscripciones

Sembrados en la migración: `superadmin`, `admin`, `region_admin`, `communications` → ambos; `treasurer`, `logistics`, `regular_server`, `regular` → solo `read`.

## Frontend

### Archivos
- `apps/web/src/views/SantisimoAdminView.vue` — admin (tres columnas por día, generate dialog, inline edit, toggle disabled, inscripción admin de "angelitos")
- `apps/web/src/views/PublicSantisimoView.vue` — pública (tres columnas, checkbox multi-select, formulario con nombre/teléfono/email + reCAPTCHA, pantalla de éxito con links de cancelación)
- `apps/web/src/stores/santisimoStore.ts` — Pinia composition
- `apps/web/src/services/api.ts` — grupo `santisimoApi` al final

### Router
- `/app/retreats/:id/santisimo` (name: `santisimo`) — admin
- `/santisimo/:slug` (name: `public-santisimo`, `requiresAuth: false`) — pública

### Sidebar
Entrada en la sección `people`, icono `Cross`, con `routeName: 'santisimo'` y permiso `santisimo`. El helper `getRouteWithParams` en `Sidebar.vue` incluye `santisimo` en `routesRequiringId`.

### i18n
Claves bajo `santisimo.*` en `apps/web/src/locales/{es,en}.json`. El label de la sidebar está en `sidebar.santisimo` → "Guardias de la Capilla".

## Convenciones importantes

1. **Checkboxes**: reka-ui usa `model-value` (NO `checked`). Ya aplicado en la vista pública.
2. **reCAPTCHA**: acción `RECAPTCHA_ACTIONS.SANTISIMO_SIGNUP` añadida en `apps/web/src/services/recaptcha.ts`.
3. **CSRF**: las rutas `/santisimo/public` están en la lista de exenciones en `apps/api/src/routes/index.ts` (`applyCsrfProtectionExcept`).
4. **Slug reuse**: se usa `retreat.slug` existente, no se crea token aparte.
5. **Angelitos**: `name` es lo único obligatorio. Nunca validar contra usuarios existentes.
6. **Auto-cancelación**: los `cancelToken` solo se devuelven en la respuesta POST pública. La UI muestra URLs tipo `/santisimo/:slug?cancel=TOKEN`; el `onMounted` de la vista pública llama a `publicCancel` si detecta `?cancel=...`.

## Verificación end-to-end

1. `pnpm --filter api migration:run` → aplica `CreateSantisimo`.
2. Como admin: `/app/retreats/:id/santisimo` → activar toggle, click "Generar": viernes 17:00 → domingo 13:00, 60 min, cap 1 → se crean ~44 slots.
3. Marcar un slot como "No se requiere" → se muestra en gris con texto "No se requiere esta hora".
4. Editar capacidad de un slot a 2; añadir una inscripción admin con solo nombre.
5. Copiar enlace público; abrir en incógnita `/santisimo/<slug>`; seleccionar 2 slots, enviar con solo nombre; ver pantalla de éxito con cancelaciones.
6. La vista admin muestra las 2 inscripciones nuevas.
7. Visitar `/santisimo/<slug>?cancel=<token>` → cancela y libera cupo.
8. Endpoint público con `isPublic=false` o `santisimoEnabled=false` → 404.

## Disponibilidad horaria de angelitos (filtro de mealWindow)

Cada `Participant` con `type='partial_server'` (angelito) puede declarar **uno o más bloques** de disponibilidad horaria por retiro. La auto-asignación a slots `mealWindow=true` y la búsqueda manual del admin filtran candidatos por horario.

### Modelo

Tabla `participant_availability`:
- `id` (uuid PK)
- `participantId` (FK → participants, CASCADE)
- `retreatId` (FK → retreat, CASCADE)
- `startTime`, `endTime` (datetime UTC)
- Índice `(participantId, retreatId)` para lookup en `autoAssignAngelitos`.

Migración: `apps/api/src/migrations/sqlite/20260507270000_AddParticipantAvailability.ts` (con `transaction = false` por contener DROP en `down()`).

### Captura
- **Registro público** (`Step5ServerInfo.vue`): cuando el toggle "Soy angelito" está ON, aparece `<AngelitoAvailabilityEditor>` con bloques `<Input type="datetime-local">`. La validación exige ≥1 bloque y `endTime > startTime`.
- **Admin participantes** (`EditParticipantForm.vue`): el editor aparece cuando `localParticipant.type === 'partial_server'`. Carga vía `GET .../availability` y guarda vía `PUT .../availability`.
- **Admin santísimo** (`SantisimoAdminView.vue`): no captura, solo lee. Muestra los bloques del angelito candidato como chip "sáb 10:00 → 14:00".

### Endpoints

- `GET  /api/santisimo/retreats/:retreatId/participants/:participantId/availability`
- `PUT  /api/santisimo/retreats/:retreatId/participants/:participantId/availability` (body: `{ blocks: [{startTime, endTime}, ...] }` — reemplazo total)
- `GET  /api/santisimo/retreats/:retreatId/slots/:slotId/eligible-servers?ignoreAvailability=true|false`

Todos requieren `santisimo:read` o `santisimo:manage`.

### Política de elegibilidad (`listEligibleServersForSlot`)

| `slot.mealWindow` | `?ignoreAvailability` | `partial_server` (angelitos)                                | `server` (regulares)            |
| ----------------- | --------------------- | ----------------------------------------------------------- | ------------------------------- |
| `false`           | (cualquiera)          | filtrados por horario (legacy: 0 bloques → siempre)         | sin filtro                      |
| `true`            | `true`                | sin filtro de horario                                       | sin filtro                      |
| `true`            | `false` (default UI)  | solo si algún bloque cubre el slot completo (legacy aplica) | **excluidos** (están comiendo)  |

Cobertura: un bloque `b` cubre el slot si `b.start ≤ slot.start && b.end ≥ slot.end`.

**Política legacy-compatible**: angelitos sin bloques registrados → considerados disponibles siempre (preserva flujos previos a la feature).

Servidores en mesa (`retreat_participants.tableId IS NOT NULL`) **siempre se excluyen**, sin importar el filtro.

### UI del filtro (modal de signup admin)

`SantisimoAdminView.vue` muestra un panel azul **solo en slots `mealWindow`** con:
- Icono `Filter` / `FilterX` de lucide.
- Label dinámico: "Mostrando solo angelitos disponibles para este horario." / "Mostrando todos (sin filtro de horario)."
- Contador "N servidor(es) en la lista".
- Botón "Quitar filtro" / "Aplicar filtro" → ejecuta `toggleAvailabilityFilter()` que invierte `filterByAvailability` y dispara `loadServers(slotId)`.

`filterByAvailability` arranca `true` cuando el slot es `mealWindow` y `false` cuando no (en cuyo caso el panel ni siquiera se renderiza).

### Filtro en autoAssignAngelitos

Misma regla en `retreatScheduleService.autoAssignAngelitos` (línea ~1185+): tras construir el `pool`, carga bloques con `participantAvailabilityService.getByParticipants(retreatId, ids)` (una sola query) y para cada slot mealWindow filtra `candidates` por `isAvailable(participantId, slot)`. Si ningún angelito cubre, el slot va a `unresolved`.

### Validaciones del editor de bloques

`AngelitoAvailabilityEditor.vue` valida:
- `endTime > startTime` (rangos invertidos: marca el campo "Hasta" en rojo).
- **No solapamiento entre bloques** del mismo angelito (ej. `10-14` y `12-16` se marcan ambos en ámbar). Backend `participantAvailabilityService.replaceAll` también rechaza con `availability blocks must not overlap`.

### Indicador de cobertura por slot

Cada slot `mealWindow` del calendario admin muestra un chip "N angelito(s) disponible(s)" (verde si N>0, rojo si N=0). Endpoint que alimenta:

- `GET /api/santisimo/retreats/:retreatId/mealwindow-coverage` → `{ slotId: count }` para todos los slots `mealWindow=true`.

Carga al montar la vista y al cambiar de retiro. Aplica la misma política legacy (0 bloques → cubre todo).

### Vista `/app/angelitos`

`AngelitosView.vue` muestra arriba del listado un panel con el estado de disponibilidad:
- "X de Y angelitos con horario configurado".
- Si hay angelitos sin horario, los lista con un warning ámbar y explica la regla legacy.
- Si todos tienen horario, muestra check verde "Todos los angelitos tienen horario configurado".

### Notificación por correo (auto-assign)

Tras `autoAssignAngelitos`, el servicio (best-effort, fire-and-forget) envía email a cada angelito asignado con la lista de slots ordenados cronológicamente. Si SMTP no está configurado o el angelito no tiene email, se omite sin error.

Implementado en `retreatScheduleService.notifyAngelitosOfNewAssignments(retreatId, pool, assignments)`.

### Tests

- `apps/api/src/tests/services/participantAvailability.simple.test.ts` — **24 tests** mirror puro:
  - `replaceAll` validación (rangos invertidos, dates inválidos, vacío idempotente, solapamiento).
  - `isAvailable` matriz de cobertura block ↔ slot.
  - `eligibleCandidates` (autoAssignAngelitos) con políticas legacy.
  - `listEligibleServersForSlot` matriz `mealWindow × ignoreAvailability`.

- `apps/api/src/tests/controllers/participantAvailability.integration.test.ts` — **6 tests integración** con TypeORM real:
  - mealWindow + filter ON: excluye servers regulares y angelitos fuera de horario.
  - mealWindow + filter OFF: incluye todos.
  - non-mealWindow: filtra angelitos por horario, mantiene servers.
  - `replaceAll` rechaza solapamiento.
  - `replaceAll` idempotente.
  - Angelito en mesa siempre excluido.

Ejecutar: `pnpm --filter api test -- src/tests/services/participantAvailability.simple.test.ts src/tests/controllers/participantAvailability.integration.test.ts`.

### Troubleshooting

- **El default del editor arranca un día antes del retiro** (ej. 04 jun cuando inicia el 05): bug clásico de zonas horarias. `new Date("2026-06-05T00:00:00Z")` en CDMX es 04-jun-18:00 local. Ver `calendarDateOnly()` en `AngelitoAvailabilityEditor.vue` y la sección "Manejo de fechas y zonas horarias" en `AGENTS.md`.
- **El filtro no responde al click**: verificar que el handler use método explícito (`@click="toggleAvailabilityFilter"`) y NO expresión inline con `v-model + @change` (timing inconsistente entre navegadores).
- **0 angelitos elegibles aunque hay angelitos creados**: probablemente sus bloques no cubren el slot O sus bloques se guardaron en horario equivocado por el shift de zona horaria. Revisar BD: `SELECT participantId, startTime, endTime FROM participant_availability WHERE retreatId = ?`.

## Timezone configurable (house + retreat)

El sistema soporta retiros en cualquier zona IANA — México, Colombia, etc. Las horas declaradas en el template (ej. "16:00") son hora **local del retiro**, no del servidor.

### Modelo
- `house.timezone` (varchar 64, NOT NULL, default `'America/Mexico_City'`) — fuente de verdad del lugar físico.
- `retreat.timezone` (varchar 64, nullable) — override opcional. Si es `null`, hereda de `house.timezone`.
- Resolución efectiva: `retreat.timezone ?? retreat.house?.timezone ?? 'America/Mexico_City'`.

### Migración
`apps/api/src/migrations/sqlite/20260507280000_AddTimezoneToHouseAndRetreat.ts` — solo `ADD COLUMN`, sin recreate-table.

### Helper backend
`apps/api/src/utils/date.transformer.ts`:

- **`makeDateInTimezone(y, m0, d, h, mi, tz)`** — construye un `Date` (instante UTC) que representa `(y/m0/d h:mi)` en la zona `tz`. Maneja DST vía `Intl.DateTimeFormat`. Reemplaza el patrón viejo `new Date(yyyy, mm, dd, h, m)` que usaba la hora local del servidor.
- **`inferTimezoneFromCoords(lat, lon)` (async)** — consulta `tz-lookup` (CommonJS, cargado con dynamic `import` para que funcione tanto en ESM runtime como en Jest/CJS). Devuelve `null` si las coords son inválidas.

### Endpoint timezone-from-coords
`GET /api/houses/timezone-from-coords?lat=&lon=` → `{ timezone: string | null }`. Usa `requirePermission('house:read')`. El frontend lo invoca al cambiar coords (Google Places autocomplete) en el formulario de la casa.

### UI
- **`AddEditHouseModal.vue`**: selector de timezone (Step 1, debajo del país). Al elegir una dirección, las coords disparan un watcher que llama a `getTimezoneFromCoords(lat, lon)` y autocompleta el campo. El usuario puede sobreescribir manualmente.
- **`RetreatModal.vue`**: selector con opción "Heredar de la casa" (default `null`); al elegir un valor concreto se almacena como override.

### Bug histórico — slots del Santísimo a "10am" en lugar de 16:00
Causa: `computeItemDateRange()` en `retreatScheduleService.ts` antes usaba `new Date(yyyy, mm, dd + dayOffset, h, m)` que interpreta `h:m` como **hora local del servidor**. En producción con server UTC y cliente CDMX (UTC-6), un template `'16:00'` se almacenaba como `16:00Z` y el navegador México lo renderizaba como `10:00 AM`.

Fix: `computeItemDateRange()` recibe ahora un argumento `timezone: string`. Usa `makeDateInTimezone()` para anclar `h:m` en esa zona. Tests: `apps/api/src/tests/services/scheduleMaterializeTimezone.simple.test.ts` (26 tests cubriendo MX, CO, Madrid DST, edge cases).

## Botón "Borrar todo y regenerar" (destructivo)

Ítem rojo en el menú **⋮ Más acciones** del `SantisimoAdminView`. Útil cuando el retiro acumuló items duplicados (típicamente por doble-materialización pre/post fix de timezone) o cuando hay slots fantasma que el admin no puede limpiar slot a slot.

### Flujo del endpoint `regenerate-from-schedule`
Implementado en `retreatScheduleService.regenerateSantisimoSlotsFromSchedule(retreatId)`:

1. Carga `retreat` con `house`. Resuelve `baseDate` (de `retreat.startDate`, normalizado a UTC midnight para evitar shifts) y `timezone`.
2. Busca el `templateSetId` mayoritario entre items con `scheduleTemplateId` no nulo. Si no hay, cae al `isDefault` set. Si tampoco, salta el paso de re-materialización.
3. **Borra TODOS los items con `scheduleTemplateId IS NOT NULL`**. Items sin templateId (manuales del admin) se preservan.
4. Llama `materializeFromTemplate(retreatId, baseDate, false, templateSetId)` — re-crea todos los items del template con la timezone correcta.
5. Borra TODOS los `santisimo_slot` del retiro (CASCADE → `santisimo_signup`).
6. `autoGenerateSantisimoSlotsFromItems` regenera slots desde items santísimo frescos.
7. `resolveSantisimoConflicts` marca mealWindows y reasigna angelitos.
8. Devuelve `{ deleted, created, replacedItems, removedTemplateItems, slots[] }`.

### UI
- Botón con `data-testid="santisimo-regenerate-button"` en el dropdown.
- Confirm con texto destacando: "**Items editados manualmente que vengan del template SE PIERDEN. Items creados a mano (sin template) se conservan.**"
- Toast con summary: "{removed} items del template eliminados · {replaced} items re-materializados · {deleted} slots borrados · {created} slots creados".

### Tests
- `apps/api/src/tests/services/santisimoMaterializeAutogen.test.ts`:
  - "regenerateSantisimoSlotsFromSchedule descarta items santísimo viejos con timestamps incorrectos (caso San Agustín)"
  - "regenerateSantisimoSlotsFromSchedule deduplica items con el mismo scheduleTemplateId (caso comidas duplicadas)"
  - "regenerateSantisimoSlotsFromSchedule preserva items manuales (sin scheduleTemplateId)"
- `apps/api/src/tests/controllers/santisimoController.regenerate.test.ts` — 5 tests del controller (auth, body shape, error mapping).
- `apps/api/src/tests/routes/santisimoRoutes.regenerate.simple.test.ts` — source-level: ruta registrada con permiso correcto, frontend api apunta a la URL.

### Script ad-hoc para validar contra DB real
`apps/api/scripts/test-regenerate-san-agustin.ts` — invoca el service contra el retiro de San Agustín, reporta diff antes/después (items, duplicados, slots). Backup manual recomendado:

```bash
cp apps/api/database.sqlite apps/api/database.sqlite.backup-pre-regenerate-$(date +%Y%m%d-%H%M%S)
cd apps/api && DOTENV_CONFIG_PATH=./.env npx vite-node --require dotenv/config scripts/test-regenerate-san-agustin.ts
```

## Troubleshooting

- **"Sesión expirada" al hacer POST público**: el endpoint no está en la lista CSRF-excluida. Verificar `'/santisimo/public'` en `applyCsrfProtectionExcept` en `apps/api/src/routes/index.ts`.
- **`santisimoEnabled` no se actualiza**: el campo debe estar en `retreatSchema` (`packages/types/src/index.ts`) para que `updateRetreatSchema` lo acepte.
- **"Lleno" aparece con 0 inscritos**: `capacity` quedó en 0 por un error al crear. Editar inline.
- **Conflictos al regenerar**: el índice único `(retreatId, startTime)` y la estrategia `INSERT OR IGNORE` evitan duplicados silenciosamente. Si se necesita limpiar, usar `clearExisting: true` en `generateSlots`.
- **Slots arrancan a "10am del viernes" en lugar de las 16:00**: bug de timezone — el server creó los items con la hora local UTC en lugar de la del retiro. Solución: confirmar `house.timezone` o `retreat.timezone` y luego "Borrar todo y regenerar". Ver "Bug histórico" arriba.
- **Slots de madrugada (2-4 AM) aparecen como "Comida"**: hay items duplicados de comida con timestamps mal calculados (08:20 UTC que en CDMX es 2:20 AM). Síntoma típico de doble-materialización. Solución: "Borrar todo y regenerar" — el método deduplica items con `scheduleTemplateId` repetido.
- **Timezone almacenamiento**: SIEMPRE se guarda UTC en `santisimo_slot.startTime/endTime` y `retreat_schedule_item.startTime/endTime`. La zona `house.timezone`/`retreat.timezone` solo afecta la **construcción** de esas fechas al materializar el template (vía `makeDateInTimezone`). El render en el navegador usa los métodos locales (`getHours/getMinutes`), por lo que un usuario con su navegador en una zona distinta a la del retiro verá horas distintas — esto es esperado (un padrino en España viendo un retiro en CDMX ve horas Europe/Madrid).
