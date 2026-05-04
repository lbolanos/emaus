# Minuto a Minuto

Agenda en tiempo real de un retiro Emaús. Reemplaza la hoja de cálculo "minuto a minuto" en papel por una vista web colaborativa con notificaciones por WebSocket, manejo automático de conflictos Santísimo↔comida, y plantillas reutilizables (Colombia / México) con todos los testimonios, dinámicas y comidas pre-cargados.

## Para el coordinador

### Antes del retiro

1. **Crear retiro**. En el modal "Agregar Retiro" → pestaña **General** verás la sección **"Template Minuto a Minuto"**:
   - Selecciona uno de los templates disponibles (`Emaús — México` ★ predeterminado, basado en Polanco III, ~135 items con descripciones detalladas, 13 campanas y tareas divididas por equipo; o `Emaús — Colombia`, basado en Santa Clara, ~85 items con los 10 testimonios clásicos).
   - Mantén marcado **"Importar la agenda al crear el retiro"**.
   - Al guardar, los items de la agenda se clonan automáticamente con las fechas calculadas desde `startDate`. **Las Responsabilidades de las charlas/testimonios del set escogido se crean en este mismo paso** (las 27 operativas ya estaban; las charlas se derivan del template — ver "Responsabilidades canónicas" más abajo).
2. **Asignar responsabilidades**. En `Asignaciones → Responsabilidades` asigna participantes a cada Responsabilidad (Charlista 1, Campanero, Lector, etc.). Si cambias de TemplateSet a posteriori, "Importar desde template" agrega las charlas exclusivas del nuevo set sin duplicar las existentes.
3. **Marcar angelitos**. En el form de cada participante, selecciona `tipo = Angelito (partial_server)`. El sistema usará automáticamente este flag para cubrir slots de Santísimo durante las comidas.

### Durante el retiro (vista en vivo)

`Logística → Minuto a Minuto`

- **Timeline compacto por día** (~50px por fila): hora · duración + tiempo relativo (`en 35m` / `hace 2h` / `en curso`) · status icon · nombre · type badge · responsable principal · apoyos · 📎 docs.
- **Indicador "AHORA"**: línea horizontal rosa que separa pasado y futuro del día calendario actual; se actualiza cada 60 s sin recargar.
- **Item activo destacado**: fondo verde tenue + punto pulse + acciones siempre visibles (`✓ Completar · −5 · +5`).
- **Acciones en hover** para items pending: `▶` Iniciar (verde), `−5` `+5` para ajustar al vuelo. Items completed quedan tachados/grises.
- **Tap-targets en mobile** (refactor 2026-04-29): los botones `−5` `+5` antes estaban ocultos en móvil (`hidden sm:inline-flex`) — el coordinador tenía que abrir el modal de edición para cada ajuste de tiempo. Ahora se renderizan también en móvil como botones cuadrados de 32 px (`h-8 w-8`, cumple WCAG 2.5.5) y `active:bg-gray-200` para feedback táctil. En desktop se conserva el padding compacto (`sm:p-1`).
- **Día header con fecha y resumen**: `Día 1 — vie, 17 abr — 5/47 completados`. Si hay un item activo: `5/47 · ▶ Charla: De la Rosa`.
- **Type badges colorizados**: charla=azul, comida=verde, dinámica=naranja, misa=amarillo, oración=rojo, logística=gris, etc.
- **Toggle de agrupación 📅 Día / 🎤 Responsabilidad**, persistido por usuario (localStorage).
- **Búsqueda sticky**: filtra por hora, nombre, responsabilidad, palanquita y nombre del participante asignado. Enter avanza, Esc limpia.
- **Header de acciones consolidado** (refactor 2026-04-29 — antes 6 botones, ahora 2):
  - Visibles: `+ Nueva actividad` · (`Importar desde template` solo si la agenda está vacía) · `⋮ Más acciones`.
  - Menú `⋮ Más acciones` (visible para TODOS los roles, items de manage filtrados con `v-if`):
    - **Frecuente**: `🔔 Tocar campana` · `🖨 Imprimir` · `📦 Descargar guiones (zip)` · `📺 Copiar link de pantalla pública` · `❓ Ayuda` (manual con 8 secciones explicativas).
    - **Manage**: `🔗 Re-vincular responsabilidades` · `👥 Apoyos / sobreescribir` · `✨ Auto-asignar angelitos` · `📥 Importar desde template (sobrescribe)`.

- **Layout container**: `max-w-5xl mx-auto` (1024px) — antes el MaM se estiraba a todo el ancho disponible y dejaba demasiado espacio en la derecha.

- **Descripción del template visible por fila**: cada item muestra el `description` del `schedule_template` correspondiente como línea inferior con prefijo 📝, truncada a 1 línea con `line-clamp-1`. Click en la línea expande/colapsa la descripción completa. Read-only desde el retiro — para editarla hay que ir al `Template Minuto a Minuto`. Inyectado al list time vía `populateTemplateAttachments` que también hace JOIN al `schedule_template` por `scheduleTemplateId`.

- **Tiempo relativo compacto**: bajo la duración (`text-[9px]`), siempre oculto en print (`print:hidden` + `.print-mam .relative-time`) — la hora absoluta a la izquierda basta en papel.
- Click en cualquier fila abre el modal de edición (responsable principal + N apoyos + nombre/hora/duración/notas/descripción + sección **📎 Documentos del template** read-only).
- Indicador `● conectado (WS)` arriba.

### Documentos por Responsabilidad (📎)

Cada **Responsabilidad canónica** (`Comedor`, `Charla: De la Rosa`, `Logística`, `Santísimo`, etc.) puede tener documentos asociados — guiones, manuales, materiales de apoyo. Los documentos viven globalmente vinculados al **nombre canónico**: un mismo guion sirve a todos los retiros y templates donde aparezca ese rol, sin necesidad de re-subir.

**Tipos de documento**:
- **Archivo**: PDF, DOC, DOCX, PNG, JPG, WEBP — máximo 10 MB cada uno, hasta 5 archivos por rol. Se sube vía drag & drop al dialog.
- **Texto Markdown**: editor inline con preview en vivo (`marked`). Descargable como `.md` o como **PDF generado en el cliente** (`jspdf`). Máximo 200 KB.

**Dónde se gestionan**:
1. `Configuración Global → Template Minuto a Minuto` → cada item con responsabilidad asignada muestra `📎 N` en la columna *Documentos*. Click → dialog full edit (subir, editar, borrar). Solo gestores con `scheduleTemplate:manage`.
2. Desde la vista del retiro `Logística → Minuto a Minuto` → el `📎 N` abre el dialog **read-only** (descarga MD/PDF/archivo, sin editar/borrar).
3. Desde `Mi agenda` (servidor) → cada item con docs muestra chips de descarga directa.

**Almacenamiento**:
- Con S3 configurado (`AVATAR_STORAGE=s3`) → archivos suben a `public-assets/responsability-attachments/<rol-slug>/<uuid>-<filename>`. URLs públicas vía bucket policy.
- Sin S3 → archivos ≤ 1 MB se guardan inline como data URL en columna `text`. Archivos > 1 MB rechazados con error claro.
- Markdown siempre cabe inline (≤ 200 KB), funciona sin S3.

**Live reference**: el retiro NO copia URLs al materializar. Al consultar `GET /retreats/:id/items`, el server hace JOIN por nombre canónico y devuelve `attachments[]` para cada item. Reemplazar un guion en el template arregla automáticamente todos los retiros pasados y futuros.

**Seeder al boot**: `apps/api/src/data/responsabilityAttachmentSeeder.ts` carga los 47 guiones canónicos del manual oficial Emaús desde `apps/api/src/data/charlaDocumentation.ts` como markdown. Idempotente: si ya existe attachment para un rol, no lo toca.

**Versioning de markdown** (📜): cada `updateMarkdown` snapshota el estado anterior en `responsability_attachment_history` ANTES de aplicar el cambio (solo si content o title cambian — description-only no contamina el historial). En el dialog, click `📜` abre un panel con todas las versiones (timestamp + tamaño + preview) y botón "Restaurar" (con confirm). Restaurar también snapshota lo actual antes de cambiar, así "deshacer la restauración" siempre está disponible. Solo markdowns se versionan; archivos binarios viven inmutables en S3.

### Vista del servidor

`Mi agenda` — solo muestra los items donde el participante actual aparece como responsable principal o como apoyo. Recibe toast `🎯 Te toca en N min` 10/5/0 minutos antes. Cada item con documentos muestra chips de descarga directa.

### Vista pública big-screen (📺)

URL: `/mam/<slug>` — auth-less, diseñada para proyectar en el salón durante el retiro o para que servidores sin cuenta la abran en su celular vía QR.

- Muestra el item AHORA en grande (banner verde con pulse), próximos 5 items, día actual con fecha legible y reloj.
- Auto-refresh cada 30s (no usa WebSocket — un poll cubre el caso de proyectar de fondo y evita reconexiones).
- Día activo se calcula del lado cliente: el día cuyo rango `[primer item, último item]` contiene `now`. Fallback: próximo día futuro si el retiro aún no empezó, último día si ya terminó.
- Item AHORA: prioriza `status === 'active'` (lo que el coordinador marcó); fallback al item cuyo slot temporal contiene `now`.
- Solo expone retiros con `isPublic=true`. El payload **excluye PII**: no manda emails, teléfonos, IDs de participante, `notes`, `palanquitaNotes`, `description` de la responsabilidad. Solo manda nombre + horario + responsabilidad-name.
- En la vista del MaM autenticada, botón "📺 Pantalla pública" (visible cuando el retiro tiene slug + isPublic) copia el link al clipboard.

### Templates globales

`Configuración Global → Template Minuto a Minuto` — ABM de los conjuntos de plantillas:
- Editar items existentes (Colombia / México vienen seedeados; cada item tiene nombre, hora, duración, tipo, responsabilidad asignada, descripción breve, palanquita musical y plan B).
- **Búsqueda sticky** y **toggle de columnas** (Hora, Duración, Tipo, Santísimo, Acciones — Actividad siempre visible). Las preferencias de columnas se guardan en localStorage por usuario.
- Crear un template propio.
- Cambiar cuál es el ★ predeterminado.

**Idempotencia del seeder:**
- `seedSet` es **aditivo**: si el set ya existe, sólo inserta los items que faltan (match por `(defaultDay, name)`). No duplica items existentes.
- `syncTemplateFields` se ejecuta después: actualiza campos en items ya seedeados cuando el seed tiene un valor distinto. Lógica: `undefined` → no toca, `null` → limpia el campo, valor → actualiza si difiere.
- `upsertSet` también sincroniza `isDefault` cuando cambia el predeterminado en el seed.

### Dashboard

Cuatro cards quedan colapsadas con mensaje "⏳ Aplica durante los días del retiro · faltan N días" cuando el retiro no está en curso (`isRetreatLive` calcula la ventana `[startDate−1 día, endDate]`):
- **Recepción de Caminantes**
- **Minuto a Minuto** — currentItem, próximo, completados/total del día, sin responsable, retraso acumulado
- **Santísimo + angelitos** — slots cubiertos, en horario de comida, sin cubrir, pool de angelitos (disponibles / en mesa)
- **Reporte de Bolsas**

## Para desarrolladores

### Modelo de datos

Cuatro tablas nuevas:

```
schedule_template_set
├── id, name (UNIQUE), description, sourceTag, isActive, isDefault
└── 1..N schedule_template

schedule_template
├── templateSetId → schedule_template_set
└── id, name, type, defaultDay, defaultStartTime ('HH:MM'), defaultDurationMinutes,
    defaultOrder, requiresResponsable, allowedResponsibilityTypes,
    musicTrackUrl, palanquitaNotes, planBNotes, blocksSantisimoAttendance,
    locationHint, isActive

retreat_schedule_item       (instancia por retiro, clonada del template)
├── retreatId → retreat
├── scheduleTemplateId → schedule_template (nullable, si es ad-hoc)
├── responsabilityId → retreat_responsibilities (responsable principal)
└── id, name, type, day, startTime, endTime, durationMinutes,
    orderInDay, status, location, notes, musicTrackUrl, palanquitaNotes,
    planBNotes, blocksSantisimoAttendance, actualStartTime, actualEndTime

retreat_schedule_item_responsable   (N:N apoyos)
├── scheduleItemId → retreat_schedule_item
└── participantId → participants

responsability_attachment           (docs globales por nombre canónico de rol)
├── responsabilityName VARCHAR (matchea contra Responsability.name)
├── kind: 'file' | 'markdown'
├── fileName, mimeType, sizeBytes
├── storageUrl (S3 público o data:URL inline si no hay S3)
├── storageKey (path en bucket, null si inline)
├── content (TEXT, solo para kind='markdown')
├── description, sortOrder, uploadedById
└── createdAt, updatedAt
```

Adicionalmente:
- `santisimo_slot.mealWindow` — flag derivado por `resolveSantisimoConflicts`.
- `santisimo_signup.{isAngelito, autoAssigned, participantId}` — auditoría de auto-asignaciones.

### Permisos RBAC

| Recurso            | Operaciones    | Roles que la reciben               |
|--------------------|----------------|------------------------------------|
| `schedule`         | `read`, `manage` | superadmin, admin, region_admin, logistics, regular_server (read) |
| `scheduleTemplate` | `read`, `manage` | superadmin, admin                  |

Los botones de mutación (Nueva actividad, Re-vincular, Apoyos, Campana, Auto-asignar, Importar) están gateados por `canManage.schedule.value` en `MinuteByMinuteView`. En `ScheduleTemplateView` los botones (Crear, Marcar predeterminado, Eliminar, editar items) están gateados por `canManage.scheduleTemplate.value`.

### Endpoints REST

Todos los endpoints autenticados (sesión Passport + CSRF, salvo lectura).

```
GET    /api/schedule-templates/sets
POST   /api/schedule-templates/sets
GET    /api/schedule-templates/sets/:id
PATCH  /api/schedule-templates/sets/:id
DELETE /api/schedule-templates/sets/:id

GET    /api/schedule-templates?setId=<uuid>
POST   /api/schedule-templates
GET    /api/schedule-templates/:id
PATCH  /api/schedule-templates/:id
DELETE /api/schedule-templates/:id

GET    /api/schedule/retreats/:retreatId/items
POST   /api/schedule/retreats/:retreatId/items
GET    /api/schedule/retreats/:retreatId/dashboard      ← stats card
POST   /api/schedule/retreats/:retreatId/materialize    ← clona template
POST   /api/schedule/retreats/:retreatId/relink-responsibilities?force=true
POST   /api/schedule/retreats/:retreatId/resolve-santisimo
POST   /api/schedule/retreats/:retreatId/bell
POST   /api/schedule/retreats/:retreatId/bulk-assign-responsables
GET    /api/schedule/retreats/:retreatId/suggest-responsables
GET    /api/schedule/canonical-responsabilities         ← lista para dropdown del template

PATCH  /api/schedule/items/:id
DELETE /api/schedule/items/:id
POST   /api/schedule/items/:id/start
POST   /api/schedule/items/:id/complete
POST   /api/schedule/items/:id/shift                    ← {minutesDelta, propagate}
POST   /api/schedule/retreats/:retreatId/days/:day/shift ← {minutesDelta} bulk shift de día completo
POST   /api/schedule/retreats/:retreatId/days/:day/reorder ← {itemIds[]} drag-to-reorder dentro del día

GET    /api/schedule/public/mam/:slug                   ← AUTH-LESS para vista big-screen
GET    /api/schedule/retreats/:retreatId/bundle.zip     ← stream ZIP con todos los guiones del retiro
GET    /api/responsability-attachments/counts           ← {[name]: count} agrupado SQL

GET    /api/responsability-attachments/by-name/:name/attachments
POST   /api/responsability-attachments/by-name/:name/attachments         ← upload archivo (15MB body limit)
POST   /api/responsability-attachments/by-name/:name/attachments/markdown ← crea texto MD
PATCH  /api/responsability-attachments/attachments/:id
PATCH  /api/responsability-attachments/attachments/:id/markdown          ← edita texto MD (snapshota historia antes)
GET    /api/responsability-attachments/attachments/:id/history           ← lista versiones (newest first, sólo preview 200ch)
GET    /api/responsability-attachments/attachments/:id/history/:historyId ← versión completa (read-only, para preview UI)
POST   /api/responsability-attachments/attachments/:id/restore/:historyId ← restaura versión
DELETE /api/responsability-attachments/attachments/:id
```

`:name` debe ir URL-encoded. Validación server-side: mime whitelist (PDF/DOC/DOCX/PNG/JPG/WEBP), 10MB max, 5 archivos por rol, MD ≤ 200KB. Body limit propio de **15MB** solo en POST de archivo (no afecta el global de 2MB).

### WebSocket

Sala: `retreat:${retreatId}:schedule`. Cliente envía `schedule:subscribe` con el `retreatId`; el server valida `authorizationService.hasRetreatAccess(userId, retreatId)` antes de unir.

| Evento server → cliente   | Payload                                                      |
|---------------------------|--------------------------------------------------------------|
| `schedule:item-started`   | `{retreatId, itemId, actualStartTime}`                       |
| `schedule:item-completed` | `{retreatId, itemId, actualEndTime}`                         |
| `schedule:upcoming`       | `{retreatId, itemId, name, startTime, minutesUntil, targetParticipantIds[]}` |
| `schedule:updated`        | `{retreatId, itemId}` — al editar/borrar/reordenar           |
| `schedule:bell`           | `{retreatId, message?}`                                      |
| `schedule:delay`          | `{retreatId, itemId, minutesDelta}`                          |

`schedule:upcoming` lo emite un `setInterval(60_000ms)` en `apps/api/src/index.ts` que consulta `listUpcoming(10)` y dispara el evento a `T-10`, `T-5` y `T-0` minutos. El cliente filtra por `targetParticipantIds.includes(myId)` para decidir si dar toast fuerte (mío) o suave (coordinador).

### Lógica clave

- **`resolveSantisimoConflicts(retreatId)`** (`apps/api/src/services/retreatScheduleService.ts`)
  Tres pasos en orden:
  1. Marca `santisimo_slot.mealWindow=true` para los slots que solapan items con `blocksSantisimoAttendance=true`.
  2. Llama a `removeResponsableConflicts(retreatId, slots)` (privado): elimina cualquier signup cuyo participante sea responsable principal **o apoyo** de un item cuyo time-window overlap el slot — caso típico: charlista inscrito a Santísimo durante su propia charla. Construye `Map<participantId, [{start,end}]>` desde items+apoyos del retiro y cruza con signups.
  3. Llama a `autoAssignAngelitos` para los slots flaggeados.
  Return: `{mealSlots, angelitosAssigned, unresolvedSlots, responsableConflicts}` (el último es count de signups eliminados por la regla #2).

- **`autoAssignAngelitos(retreatId, slotIds?)`**
  1. Pool de candidatos: `retreat_participants.type='partial_server' AND participantId IS NOT NULL` (filtrado por retiro).
  2. Excluye los actualmente sentados a una mesa: `retreat_participants.tableId IS NOT NULL`.
  3. Para cada slot meal-window: borra `signups` cuyos `participantId` están en mesa, luego rellena hasta `capacity` con angelitos del pool, marcando `autoAssigned=true, isAngelito=true`.

- **`reorderDay(retreatId, day, orderedItemIds)`**
  Reordena items de un día con drag&drop preservando los slots de tiempo (las tuplas `(startTime, endTime, durationMinutes)` ya en uso ese día). Lo que cambia es el mapeo `item → slot`: items[0] ordenados por startTime ascending → primer id de la lista, etc. Valida set-equality; rechaza ids fuera del día, duplicados, count distinto. Actualiza `orderInDay = i`. Endpoint: `POST /api/schedule/retreats/:id/days/:day/reorder` body `{itemIds:string[]}`. Permiso `schedule:manage`. Llama a `resolveSantisimoConflicts` post-reorder.

- **`materializeFromTemplate(retreatId, baseDate, clearExisting, templateSetId?)`**
  Clona los `schedule_template` items del set en `retreat_schedule_item` calculando:
  ```
  startTime = baseDate + (defaultDay-1) días @ defaultStartTime (HH:MM, default 09:00)
  endTime   = startTime + defaultDurationMinutes
  ```
  **Antes** de construir el respIndex, invoca `ensureCharlaResponsibilitiesFromTemplateSet` para que los items de tipo `charla`/`testimonio` puedan vincularse a sus Responsabilidades en el mismo paso. Después llama, en orden:
  1. `autoGenerateSantisimoSlotsFromItems(retreatId, items)` — auto-crea los `santisimo_slot` (60 min, capacidad 1) cubriendo `min(startTime) → max(endTime)` de los items materializados con `type='santisimo'`. Es idempotente: el índice único `(retreatId, startTime)` + try/catch `SQLITE_CONSTRAINT` saltan los slots ya existentes y preservan inscripciones previas (no usa `clearExisting`).
  2. `resolveSantisimoConflicts` para precomputar `mealWindow` y auto-asignar angelitos sobre los slots recién creados.

  Con `clearExisting=true` borra los items previos del retiro pero **no** borra `santisimo_slot` ni signups (la regeneración cae sobre los slots ya existentes vía índice único).

- **`addMissingTemplateItems(retreatId, baseDate, templateSetId?)`**
  Inserta sólo los items del template que el retiro aún no tiene materializados. Detecta duplicados por `scheduleTemplateId` y por `(day, name)`. Invoca `ensureCharlaResponsibilitiesFromTemplateSet` igual que `materializeFromTemplate`. Si añade al menos un item, también dispara `autoGenerateSantisimoSlotsFromItems` + `resolveSantisimoConflicts` sobre el conjunto completo del retiro — así, agregar un item nuevo de tipo `santisimo` al template propaga los slots a los retiros existentes sin pasos extra. Returns `{added, skipped, total}`.

### Horario del Santísimo: auto-generación + UX

**Generación automática.** Los `santisimo_slot` (slots de inscripción de servidores y angelitos al Santísimo) se crean automáticamente al materializar el template. Duración fija **60 min por slot, capacidad 1**, cubriendo el rango `min/max` de los items con `type='santisimo'` en el template materializado. Para los template sets actuales:
- `Emaús — Colombia / STA_CLARA`: cubre la vigilia de la noche del día 1 (00:00 → 06:10 = **6 slots**), derivado de los items "Explicación de Adoración al Santísimo" + "Vigilia y Adoración al Santísimo (turnos)".
- `Emaús — México / POLANCO`: cubre del día 1 16:00 al día 3 13:41 (~46 slots), derivado de "Exposición del Santísimo", "Exponer al Santísimo (overnight)" y "Traslado del Santísimo y Catequesis".

El coordinador no necesita pulsar el botón **"Generar"** para retiros estándar; sigue disponible en `/santisimo` para casos custom (rangos puntuales, slot length distinto, etc.) y es idempotente: no duplica slots ni borra signups a menos que se marque "Eliminar horarios existentes".

**UI: ventanas de comida en color ámbar.** En `SantisimoAdminView.vue`, los slots con `mealWindow=true` (overlap con un item `blocksSantisimoAttendance=true`) se renderizan con fondo `bg-amber-50` + border lateral `border-amber-400` y un badge "Comida — sólo servidores fuera de mesa". Al abrir el dialog de inscripción sobre un slot ámbar, el buscador de servidores oculta automáticamente a quien tenga `tableId` asignada (los servidores en mesa están comiendo y no pueden cubrir el Santísimo en ese momento). El backend `autoAssignAngelitos` ya pre-asigna angelitos disponibles a esos slots; el coordinador solo tiene que llenar los huecos restantes.

**Botón "Ayuda".** En el toolbar de `/santisimo` un botón ⓘ abre un dialog que explica el flujo completo: auto-generación, semántica del color ámbar, generación manual y filtro de servidores en signup.

**Filtro de tableId en `/participants`.** El endpoint ya devuelve `tableId` para `type=server` (vía `findAllParticipants` en `participantService.ts:621`); el frontend lo usa para filtrar la lista en signup dialogs sobre slots ámbar.

- **`ensureCharlaResponsibilitiesFromTemplateSet(retreatId, templateSetId?, dataSource?)`** (en `responsabilityService.ts`)
  Crea las Responsabilidades de tipo `CHARLISTA` que el TemplateSet escogido requiere y que aún no existen en el retiro. Filtra `ScheduleTemplate` con `type IN ('charla','testimonio')` y `responsabilityName` definido; compara contra Responsabilidades del retiro por nombre normalizado (lowercase + trim) — misma lógica que `relinkResponsibilities` — y crea las faltantes. Si el `responsabilityName` matchea el catálogo de `getDefaultCharlas()`, la Responsabilidad se crea con `description = anexo` (ej. 'A-2-1'). Idempotente. Returns `{created, alreadyExisting}`.

- **`relinkResponsibilities(retreatId, force=false)`**
  Vincula `retreat_schedule_item.responsabilityId` por nombre canónico. Con `force=true` sobrescribe vínculos existentes; con `false` sólo asigna items con `responsabilityId === null`. Returns `{linked, alreadyLinked, noTemplate, noMatch}`.

- **`dashboardStats(retreatId)`**
  Devuelve un objeto agregado para el card del dashboard: currentItem, nextItem, conteos por estado, retraso acumulado del día, cobertura de Santísimo, pool de angelitos.

- **`streamRetreatBundle(retreatId, output)`** (`apps/api/src/services/retreatScheduleService.ts`)
  Genera y streamea un ZIP con todos los guiones del retiro a la `Writable` que el caller pasa (típicamente `res`). Estructura: `<rol-slug>/<filename>` por attachment, `README.md` top-level con el índice. Tres branches por attachment:
  1. **Markdown** → archivo `.md` directo desde `attachment.content`.
  2. **S3 file** (`storageKey != null`) → `s3Service.getObjectStream(storageKey)` y pipe al archive como **binario real**. Timeout 15s per-archivo. Si falla → fallback a `<filename>.url.txt` con la URL pública + nota explicativa, y se acumula en `failedS3Keys[]` para reportarlo en el README.
  3. **Inline base64** (`storageUrl: data:...`) → decode + append como buffer.
  El bundle es portable offline (real binarios, no pointers). Endpoint: `GET /api/schedule/retreats/:id/bundle.zip` (auth + `schedule:read` + retreat access). Botón "📦 Descargar guiones" en el header del MaM.

- **`attachmentHistoryCleanupService`** (`apps/api/src/services/attachmentHistoryCleanupService.ts`)
  Cron diario `15 3 * * *` (03:15 UTC). Mantiene las últimas **20 versiones por `attachmentId`** en la tabla `responsability_attachment_history`; elimina el resto. SQL: `GROUP BY attachmentId HAVING COUNT(*) > 20` → drop oldest `(total - 20)` por overflow. Wire en `index.ts` junto a otros cleanup services. Política coincide con la UI (panel de historia muestra 20).

### Live-only gating del dashboard

`apps/web/src/views/RetreatDashboardView.vue` define `isRetreatLive`:
```ts
const isRetreatLive = computed(() => {
  // ventana [startDate-1 día (preparación), endDate (cierre)]
});
```

Las cards de Recepción, Minuto a Minuto, Santísimo+angelitos y Reporte de Bolsas:
- Cuando `!isRetreatLive`: header visible con badge "⏳ Aplica durante los días del retiro · faltan N días", body NO se renderiza, click no navega, `opacity-70`.
- Cuando `isRetreatLive`: comportamiento normal con datos en vivo.

### Tests

Pure-logic tests (sin TypeORM ni DB):

| Archivo                                                                 | Suites | Tests | Cubre |
|-------------------------------------------------------------------------|--------|-------|-------|
| `apps/api/src/tests/services/scheduleTemplate.simple.test.ts`           | 6      | 30+   | sortItems, groupByDay, sortSets, controllers (mocks) |
| `apps/api/src/tests/services/scheduleTemplateSeeder.responsabilityNames.simple.test.ts` | 2 | 26 | conteo por template, cobertura de descripciones, responsabilidades canónicas, splits de tareas (revisión, desarmar logística), lecturas Camino Emaús, refrigerios → Snacks, campanas → Campanero (≥10), type→responsibility mapping, alias R.snacks/R.despedida/R.rosarios actualizados |
| `apps/api/src/tests/services/santisimo.simple.test.ts`                  | 4      | 14    | slot generation, capacity, angelito heuristic       |
| `apps/api/src/tests/services/realtime.simple.test.ts`                   | 3      | 8     | room naming, event payload shapes                   |
| `apps/api/src/tests/services/retreatScheduleDashboard.simple.test.ts`   | 5      | 23    | dashboardStats, recomputeMealWindow, angelitoPool, isRetreatLive, materialize date math |
| `apps/api/src/tests/services/serviceTeamData.simple.test.ts`            | —      | 27+   | **21 charlas/textos canónicos** (11 Charla + 10 Texto), anexos A-2-N únicos formato válido, **cobertura completa de docs** (every fixed responsibility + every charla tiene entry en charlaDocumentation/responsibilityDocumentation) |
| `apps/api/src/tests/services/responsabilityService.simple.test.ts`     | —      | —     | mismos 21 items vía `getDefaultCharlas()` |
| `apps/api/src/tests/services/responsabilityService.ensureCharlas.simple.test.ts` | 1 | 8 | `ensureCharlaResponsibilitiesFromTemplateSet`: defaults solo crean operativas, charlas se crean al materializar, anexo en description, idempotencia, sets distintos, ignora isActive=false, no duplica con homónimas |
| `apps/api/src/tests/services/retreatScheduleService.materializeWithCharlas.test.ts` | 1 | 3 | integración end-to-end (DB real): materialize crea charlas + vincula items en un paso; idempotencia; addMissingTemplateItems mismo comportamiento |
| `apps/api/src/tests/services/santisimoMaterializeAutogen.test.ts` | 1 | 6 | integración end-to-end (DB real) de la auto-generación de SantisimoSlots al materializar el template: rango cubierto, idempotencia (slot+signup preservados), auto-asignación de angelitos a mealWindow, exclusión de servidores en mesa, no-op sin items santisimo, propagación vía addMissingTemplateItems |
| `apps/web/src/views/__tests__/SantisimoAdminView.help.test.ts` | 1 | 3 | Vitest: el botón "Ayuda" del toolbar abre/cierra el dialog y renderiza las 4 secciones (auto, mealWindow, manual, signup) |
| `apps/api/src/tests/services/responsabilityAttachment.simple.test.ts`  | 5      | 23    | validación mime/tamaño (PDF/DOC/img + rechazo .exe), límite 10MB con S3 / 1MB sin S3, max 5 por rol, MD ≤ 200KB, slugFileName/slugResponsability, idempotencia del seeder, **JOIN por nombre canónico (live reference)** + case-sensitive + trim, UTF-8 multi-byte sizing |
| `apps/api/src/tests/services/santisimoResponsableConflict.simple.test.ts` | 1 | 7 | mirror puro de `removeResponsableConflicts`: responsable principal, apoyo, no-overlap, sin participantId, touching boundaries, multi-slot/item, anti-double-count cuando responsable+apoyo del mismo item |
| `apps/api/src/tests/services/scheduleReorderDay.simple.test.ts`         | 1      | 8     | mirror puro de `reorderDay`: preservación de slots `(startTime/endTime/duration)`, swap básico, no-op, validación de count/ids/duplicates, derivación de slots por sorted startTime, durationMinutes per-slot |
| `apps/api/src/tests/services/bundleS3Streaming.simple.test.ts`          | 1      | 7     | mirror puro del routing per-attachment del bundle: markdown → `.md`, S3 success → binary stream, S3 fail → `.url.txt` fallback (acumula en `failedS3Keys`), inline base64 sin call S3, count, folder identity por responsability |
| `apps/api/src/tests/services/attachmentHistoryCleanup.simple.test.ts`   | 1      | 7     | mirror puro de la retención: no-op bajo/igual a MAX (20), drop oldest beyond MAX, robusto a input order, isolation per-attachmentId, empty input, extreme 100→20 |
| `apps/api/src/tests/services/attachmentVersionPreview.simple.test.ts`   | 1      | 6     | mirror puro de `getMarkdownVersion` read-only: return shape, missing attachment/history, **cross-attachment refusal** (no leak), no mutation, full content (no truncate) |
| `apps/web/tests/e2e/mam-public-view.spec.ts` (Playwright)               | 1      | 5     | E2E auth-less: vista `/mam/:slug` no redirect a login, error claro 404, header structure, smoke del toast UI, ausencia de coordinator-only buttons |
| `apps/web/tests/e2e/auth-gate.spec.ts` (Playwright)                     | 1      | 5     | E2E auth gate: `/app/*` redirect a login, `/mam/:slug` y `/santisimo/:slug` y `/` no requieren auth |
| `apps/api/src/tests/services/templateDescriptionPopulate.simple.test.ts` | 1      | 8     | mirror del JOIN `populateTemplateAttachments` que inyecta description del schedule_template: presencia/ausencia, null description, missing template, mix custom+template items, dedup de templateIds, empty input, preserve fields |
| `apps/web/src/components/__tests__/MamHelpDialog.test.ts`                | 1      | 8     | smoke del manual MaM: open/close, 8 secciones (qué es, durante retiro, drag, más acciones, pantalla pública, docs, atajos, tips), controles ▶ ✓ ±5 📎, items de menú "Más acciones", atajos Ctrl+P / ESC |
| `apps/web/src/components/__tests__/ScheduleTemplateHelpDialog.test.ts`   | 1      | 8     | smoke del manual del editor de templates: open/close, 6 secciones, ambos templates por nombre (México/Colombia), funciones de docs (subir/markdown/imprimir/versiones/restaurar), warnings sobre delete y rename |
| `apps/web/src/stores/__tests__/dashboardSettingsStore.test.ts`          | 8      | 29    | toggle/move/persist/load + merge legacy sectionOrder + new keys (minutoAMinuto, santisimo) |

Correr todo:
```bash
pnpm --filter api test           # backend Jest
pnpm --filter web test           # frontend Vitest
```

End-to-end con la API real:
```bash
EMAIL=admin@... PASSWORD=... ./apps/api/scripts/e2e-minuto-a-minuto.sh
```

El script hace login, obtiene CSRF, crea un retiro temporal, materializa el template default, ejecuta `start/complete/shift/resolve-santisimo/bell` y borra el retiro. 10 pasos con aserciones, cleanup automático.

### Migraciones

| Timestamp           | Archivo                                          | Cambios                                             |
|---------------------|--------------------------------------------------|------------------------------------------------------|
| `20260423120000`    | `CreateMinutoAMinuto.ts`                         | tablas schedule_template, retreat_schedule_item, retreat_schedule_item_responsable; columns mealWindow / isAngelito / autoAssigned / participantId en santisimo_*; permisos schedule:* y scheduleTemplate:*. Incluye `schedule_template_set` + FK `templateSetId` y `responsabilityName`. |
| `20260427120000`    | `UpdateResponsibilities.ts`                      | rename `Texto: Dinámica Examen de Conciencia` → `Texto: Quema de Pecados`; agrega `Biblias`, `Rosarios`, `Bolsas`, `Resumen del día`, `Recepción`, `Texto: Carta de Jesús` a cada retiro; corrige typo `Santísmo` → `Santísimo`. |
| `20260428120000`    | `AddSalonAndReglamentoResponsibilities.ts`       | agrega `Salón` y `Reglamento de la Casa` como responsabilidades fijas a cada retiro. |
| `20260430120000`    | `RenameOracionToOracionDeIntercesion.ts`         | rename `Oración` → `Oración de Intercesión` en todos los retiros y schedule_template (evita confusión con Santísimo). |
| `20260501120000`    | `AddOracionEspirituSantoCharla.ts`               | agrega `Texto: Oración al Espíritu Santo` (anexo A-2-21) a cada retiro. |
| `20260502120000`    | `AddConocerteCharla.ts`                          | agrega `Charla: Conocerte a Ti Mismo` (anexo A-2-22) — separada de "Las Máscaras". |
| `20260503120000`    | `AddDinamicaSanacion.ts`                         | agrega `Texto: Dinámica de Sanación` (anexo A-2-23) — separa la dinámica de la charla. |
| `20260504120000`    | `AddDespedidaResponsibility.ts`                  | agrega responsabilidad fija `Despedida` (devolución de pertenencias y cierre). |
| `20260505120000`    | `MergeSnackPosteriorParedAndRenameRosario.ts`    | renombra `Rosarios` → `Explicación Rosario y entrega`; fusiona `Snack Posterior a la Pared` (orfana) con `Snacks`; elimina charlas A-2-10 y A-2-11 sin uso. |
| `20260503120000`    | `CreateResponsabilityAttachments.ts`             | tabla `responsability_attachment` (vinculada por nombre canónico, no por templateId). Migra datos de `schedule_template_attachment` (esquema viejo) si existe y la dropea. |

### Seeders

`apps/api/src/data/scheduleTemplateSeeder.ts` — `createDefaultScheduleTemplate()` es idempotente y se ejecuta en tres pasos:

1. **`upsertSet`**: crea cada `ScheduleTemplateSet` por nombre, o sincroniza `isDefault` si cambió.
2. **`seedSet` (aditivo)**: si el set ya existe, sólo INSERT los rows cuyo `(defaultDay, name)` no existe en DB. No duplica ni elimina nada.
3. **`syncTemplateFields`**: para cada item ya seedeado, actualiza campos sincronizables (`responsabilityName`, `defaultStartTime`, `defaultDurationMinutes`, `defaultOrder`, `type`, `palanquitaNotes`, `planBNotes`, `description`, `locationHint`, `requiresResponsable`, `blocksSantisimoAttendance`, `allowedResponsibilityTypes`, `musicTrackUrl`) cuando el seed difiere. Lógica: `undefined`=ignorar, `null`=limpiar, valor=actualizar si difiere.

Se invoca desde:
- `apps/api/src/index.ts` al boot de la API.
- `apps/api/src/services/retreatService.ts` `createRetreat()` (defensa adicional).

Datos seedeados (al 2026-04):
- **Emaús — México** (★ default, `sourceTag: polanco_xlsx`): **~135 items** basados en `Programa Retiro Polanco III.xlsx`. Cada item tiene descripción detallada (1-2 frases), responsabilidad asignada por equipo (Logistica, Cuartos, Comedor, Snacks, Salón, Música, Recepción, Despedida, Reglamento, Continua, Campanero, etc.), música/palanquita y plan B donde aplica. Incluye:
  - **5 lecturas del Camino de Emaús** (`Continua`)
  - **8 tiempos de meditación** post-charla (`Música`)
  - **12+ breaks/snacks** (`Snacks`)
  - **13 toques de campana** en transiciones clave (`Campanero`)
  - **5 tareas paralelas pre-retiro** (revisión Día 1 14:40 dividida: Cuartos / Salón / Comedor / Música / Recepción)
  - **5 tareas paralelas post-comida Día 3** (desarmado dividido: Cuartos / Salón / Comedor / Música / Despedida)
  - **Charlas con testimonio** integrado en el item de la charla (no placeholders separados)
  - **Dinámicas** (Pared, Quema de Pecados, Lavado de Manos, Carta de Jesús, Oración Compartida, Mantelitos, Sanación)
- **Emaús — Colombia** (`sourceTag: santa_clara_pdf`): **~85 items** basados en el PDF "Minuto a minuto Retiro Sta Clara NOV 2019 v2", con los 10 testimonios clásicos y 9 tiempos de meditación post-testimonio.

#### Responsabilidades canónicas

**27 fijas operativas** (rotables, en `responsabilityService.ts:defaultResponsibilities`) — se crean al ejecutar `createDefaultResponsibilitiesForRetreat()` cuando se crea el retiro:
Palanquero 1/2/3, Logistica, Inventario, Tesorero, Sacerdotes, Mantelitos, Snacks, Compras, Transporte, Música, Comedor, Salón, Cuartos, Oración de Intercesión, Palanquitas, Santísimo, Campanero, Continua, Biblias, **Explicación Rosario y entrega** (renombrada de "Rosarios"), Bolsas, Resumen del día, Recepción, Reglamento de la Casa, **Despedida**.

**Charlas/textos (CHARLISTA)** — **NO se crean por defecto al crear el retiro**. Se generan dinámicamente al **materializar el TemplateSet escogido** mediante `ensureCharlaResponsibilitiesFromTemplateSet()`, derivadas de los `ScheduleTemplate` del set con `type IN ('charla','testimonio')` y `responsabilityName` definido. Esto evita basura: cada retiro tiene exactamente las charlas que su minuto-a-minuto requiere.

El catálogo de referencia (`getDefaultCharlas()`, anexos A-2-1 a A-2-23 con gaps) sigue exportado y se usa para enriquecer la `description` de cada charla con su anexo correspondiente al crearla. **21 entries** (11 Charlas + 10 Textos). Eliminadas: `Texto: Reflexión sobre Lucas 24, 13-35` (A-2-10, duplicaba `Continua`) y `Texto: Historia de los Retiros de Emaús` (A-2-11, material de referencia sin item asignado). Añadidas: `Texto: Oración al Espíritu Santo` (A-2-21), `Charla: Conocerte a Ti Mismo` (A-2-22), `Texto: Dinámica de Sanación` (A-2-23).

> **Retiros existentes** (creados antes del cambio) mantienen sus 21 charlas default ya creadas — no hay migración retroactiva. La nueva lógica solo aplica a retiros que aún no tengan la Responsabilidad correspondiente a un `responsabilityName` del template (idempotente vía nombre normalizado).

#### Cobertura de documentación (anexo A-5)

**Cada responsabilidad canónica tiene documentación** en `apps/api/src/data/charlaDocumentation.ts`:
- `charlaDocumentation` (21 entries) — guía paso a paso para cada charla/texto.
- `responsibilityDocumentation` (29 entries) — descripción del rol con tabla `# | Descripción | Cuándo | Dónde` para cada uno. Incluye `Moderador` y `Diario` re-exportados desde `apps/api/src/data/serviceTeamData.ts` (single source of truth para esos dos, pues también los consume la migración `CreateServiceTeams`).

`Moderador` y `Diario` también están en `CANONICAL_RESPONSABILITIES` en `retreatScheduleController.ts` para que aparezcan en el dropdown del editor de templates (junto con los otros 27 roles operativos).

Tests `serviceTeamData.simple.test.ts` enforcan cobertura completa: si añades una nueva responsabilidad y olvidas documentarla, el test grita.

**`responsabilityAttachmentSeeder.ts`** — al boot consume `charlaDocumentation` + `responsibilityDocumentation` y crea attachments markdown vinculados al nombre canónico de cada rol. Idempotente: skipea si ya existe attachment para ese nombre. Cubre **49 entries** (21 charlas/textos + 28 roles operativos incluyendo Moderador/Diario).

#### CLI

```bash
# Propagar nuevos items del template a retiros existentes (idempotente)
pnpm --filter api exec vite-node src/cli/propagate-template-to-retreats.ts --dry-run
pnpm --filter api exec vite-node src/cli/propagate-template-to-retreats.ts <retreatId>
pnpm --filter api exec vite-node src/cli/propagate-template-to-retreats.ts --set <templateSetId>

# Re-vincular responsabilidades por nombre (un retiro)
pnpm --filter api exec vite-node src/cli/relink-retreat-responsibilities.ts <retreatId> [--force]

# Seed solo de responsabilityNames del template (sin reiniciar API)
pnpm --filter api exec vite-node src/cli/seed-template-responsibilities.ts
```

### Archivos clave

**Backend**
- `apps/api/src/entities/scheduleTemplate.entity.ts`, `scheduleTemplateSet.entity.ts`, `retreatScheduleItem.entity.ts`, `retreatScheduleItemResponsable.entity.ts`
- `apps/api/src/services/scheduleTemplateService.ts`, `retreatScheduleService.ts`
- `apps/api/src/controllers/scheduleTemplateController.ts`, `retreatScheduleController.ts`
- `apps/api/src/routes/scheduleTemplateRoutes.ts`, `retreatScheduleRoutes.ts`
- `apps/api/src/realtime.ts` — sala schedule + emisores
- `apps/api/src/index.ts` — timer setInterval(60s) para `schedule:upcoming` + boot del seeder de attachments
- `apps/api/src/data/scheduleTemplateSeeder.ts`
- `apps/api/src/entities/responsabilityAttachment.entity.ts`
- `apps/api/src/services/responsabilityAttachmentService.ts` — list/listForNames/upload/createMarkdown/update/updateMarkdown/delete + validación whitelist mime/tamaño
- `apps/api/src/controllers/responsabilityAttachmentController.ts`
- `apps/api/src/routes/responsabilityAttachmentRoutes.ts` — `/api/responsability-attachments/*` con body limit propio 15MB en POST de archivo
- `apps/api/src/data/responsabilityAttachmentSeeder.ts` — carga los 47 guiones canónicos al boot, idempotente

**Types compartidos**
- `packages/types/src/schedule.ts` — Zod schemas + payloads WS + `ResponsabilityAttachmentSchema`

**Frontend**
- `apps/web/src/views/MinuteByMinuteView.vue` — timeline coordinador con header colapsable (`⋮ Más acciones`), filas compactas, indicador "AHORA", item activo con pulse, tiempo relativo, type badges colorizados
- `apps/web/src/views/MyScheduleView.vue` — vista servidor con chips de descarga directa de docs
- `apps/web/src/views/AssignResponsiblesView.vue` — bulk assign con sugerencias heurísticas
- `apps/web/src/views/ScheduleTemplateView.vue` — ABM templates globales con columna `📎 Documentos` y toggle
- `apps/web/src/components/ScheduleItemEditModal.vue` — modal con sección read-only "Documentos del template"
- `apps/web/src/components/ResponsabilityAttachmentsDialog.vue` — drag&drop, editor MD con preview en vivo, descarga MD/PDF (jspdf), gestión de múltiples archivos por rol
- `apps/web/src/stores/scheduleStore.ts` — store + subscribeRealtime
- `apps/web/src/services/api.ts` — `scheduleTemplateApi`, `retreatScheduleApi`, **`responsabilityAttachmentApi`** (`list/upload/createMarkdown/update/updateMarkdown/remove`)
- `apps/web/src/views/RetreatDashboardView.vue` — cards y live-only gating
- `apps/web/src/stores/dashboardSettingsStore.ts` — merge legacy sectionOrder
- `apps/web/src/composables/useAuthPermissions.ts` — `canManage.schedule` y `canManage.scheduleTemplate`

### Decisiones de diseño

1. **Templates múltiples vs maestro único**: optamos por sets nombrados con flag `isDefault`. Permite tener variantes regionales y el `seeder` se mantiene idempotente buscando por nombre.
2. **Apoyos vs responsable principal**: ambos. Cada `retreat_schedule_item` apunta a una `Responsability` principal (1:1, reusa el ABM existente) y tiene N apoyos vía `retreat_schedule_item_responsable`. Las notificaciones WS llevan ambos en `targetParticipantIds`.
3. **Identificación de angelitos**: usamos `participants.type='partial_server'` (canónico, ya editable en el form) en vez de añadir una columna nueva. El form lo etiqueta literalmente como "Angelito".
4. **Live-only gating**: ocultar las cards confunde ("¿dónde está Recepción?"). Forzamos colapsado con un mensaje explicativo. El usuario puede expandir manualmente desde el chevron, pero el body solo se renderiza cuando `isRetreatLive`.
5. **Foreign-key en SQLite**: la tabla `retreat_schedule_item_responsable` tuvo un bug de FK apuntando a `participant` (singular) en vez de `participants`. Detectado vía e2e con `PRAGMA foreign_keys=ON`. Corregido en migración inicial; no requiere migración correctiva.
6. **Seeder aditivo + sync de campos**: el seeder se ejecuta cada vez que arranca el API. En vez de ser destructivo (delete + reseed), es idempotente: añade items faltantes y sincroniza campos cambiados. Permite editar el seed y reiniciar para propagar al template global sin perder ediciones manuales (que son raras en el template global).
7. **Responsabilidades por equipo, no por persona**: `Snacks` administra los breaks, `Cuartos` administra cuartos+baños, `Salón` administra el salón de charlas y banners, `Recepción` administra el embarque/desembarque de caminantes y custodia de celulares. Esto permite asignar 1 participante coordinador por equipo en vez de uno por tarea.
8. **Tareas paralelas para preparación/desmontaje**: la "revisión pre-retiro" y el "levantar logística post-comida" se dividen en 5 tareas concurrentes a la misma hora, una por equipo. Esto refleja la realidad operativa y permite que cada equipo vea sólo su parte en la vista por responsabilidad.
9. **Default Mexico**: cambiamos el default de Colombia a México porque la versión Polanco está más actualizada (~125 items vs ~85, con descripciones detalladas de todas las dinámicas). Colombia se mantiene disponible para retiros que prefieran el formato clásico de 10 testimonios.
10. **Charlas derivadas del template, no por default**: los retiros nuevos NO crean las 21 charlas hardcoded al inicio. El TemplateSet escogido es la fuente de verdad para qué charlas/testimonios necesita cada retiro; al materializar (o `addMissingTemplateItems`), el helper `ensureCharlaResponsibilitiesFromTemplateSet` crea solo las que el set requiere. Beneficio: la lista de Responsabilidades del retiro queda alineada con el minuto-a-minuto sin charlas huérfanas. Las 27 operativas (Logística, Comedor, Música, etc.) siguen siendo default fijo porque son universales. Retiros pre-existentes no se tocan (no hay migración retroactiva).
11. **Attachments por nombre canónico de Responsabilidad (Opción A)**: los documentos viven globalmente vinculados al `responsabilityName` (string), no al `scheduleTemplateId` (FK). Una sola fuente de verdad: un mismo guion `Charla: De la Rosa` se ve en todos los templates y todos los retiros que tengan esa Responsabilidad. Trade-off conocido: si renombran un rol vía la UI, los attachments quedan huérfanos hasta que se cree de nuevo el rol con el nombre original. Aceptado porque el catálogo canónico es estable y el caso de uso real es "subir un guion una vez, verlo en todos lados".
12. **Storage S3 con bucket policy de "public-assets"**: los archivos suben a `public-assets/responsability-attachments/<rol-slug>/<uuid>-<file>` para reusar la bucket policy ya bendecida que expone `public-assets/*` como público (`s3:GetObject` para todos). Los guiones del manual Emaús son públicos por naturaleza; cualquier doc custom es semi-público (necesita la URL exacta para leer). Si en el futuro hace falta privacidad real, cambiar a presigned URLs.
13. **List endpoint excluye `content`** para no inflar el response del retreat schedule (146 items × 5KB de markdown = 700KB por request). El frontend hace una segunda fetch a `responsabilityAttachmentApi.list(name)` cuando el usuario abre el dialog — ahí sí trae el contenido completo.

### Activación en producción

Para que los uploads de PDF/DOC funcionen en prod (los markdown ya funcionan inline ≤200KB sin S3), agregar al `.env` de la instance:

```
AVATAR_STORAGE=s3
S3_BUCKET_NAME=emaus-media
AWS_REGION=us-east-1
AWS_USE_IAM_ROLE=true
```

(o `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` de un IAM user dedicado con `s3:GetObject/PutObject/DeleteObject` sobre `emaus-media/public-assets/*`).

`pm2 restart emaus-api` después de editar. Nginx ya tiene `client_max_body_size 100M` — no requiere cambios.

### Help dialogs (manuales in-app, 2026-04-29)

Dos componentes Vue independientes con copy en español que documentan los flujos para usuarios finales:

**`apps/web/src/components/MamHelpDialog.vue`** — disparado desde el menú `⋮ Más acciones → ❓ Ayuda` en `MinuteByMinuteView`. Modal de 8 secciones:
1. Qué es el MaM
2. Controles por fila durante el retiro (▶ ✓ ±5 📎 click-to-edit)
3. Reordenar items con drag & drop
4. Menú "⋮ Más acciones" (todos los items)
5. Pantalla pública (`/mam/<slug>`, WS sync)
6. Documentos por responsabilidad (escope global, 📎 dialog, 📜 versiones)
7. Atajos de teclado (Ctrl+P, /, ESC, Enter)
8. Tips operativos (descripción truncada, cascade de fechas, etc.)

**`apps/web/src/components/ScheduleTemplateHelpDialog.vue`** — disparado desde el botón `❓ Ayuda` en el header del `ScheduleTemplateView`. Modal de 6 secciones:
1. Qué es un Template
2. Templates incluidos (Polanco México ★, Sta Clara Colombia)
3. Editar items (click fila, 📎 docs, 🗑 delete)
4. Editar documentos (markdown, PDF, imprimir, versiones, restore)
5. Workflow recomendado (5 pasos)
6. Cuidados (delete template rompe retiros, rename rol rompe JOIN, after-midnight items)

Visibles para TODOS los roles (lectura). El copy se mantiene como literal HTML/text en el componente (no i18n) — Spanish-only por diseño.

### Editor de Templates: ancho dinámico

`ResponsabilityAttachmentsDialog` (compartido entre MaM y Template editor) ajusta su ancho según contexto:
- Lista de attachments (default): `max-w-3xl` (768px)
- **Markdown editor abierto: `95vw`** (casi full-screen) — para que textarea + preview side-by-side aprovechen toda la pantalla. Antes era `max-w-6xl` (1152px) pero quedaba pequeño en monitores anchos.
- Preview de versión histórica (popup secundario): `max-w-5xl` (1024px).

Implementación: `:class="mdEditor.open ? 'sm:!max-w-[95vw] w-[95vw]' : 'max-w-3xl'"` con `transition-[max-width] duration-200`. El `!important` en `sm:` es necesario para sobreescribir el `max-w-lg` default del `DialogContent` shadcn.

### Bugs conocidos / limitaciones

- **No hay drag-to-reorder** en el timeline — los `−5/+5` y la edición inline de hora son el escape actual.
- **No hay export PDF** del minuto a minuto final (sí hay PDF de markdowns individuales vía jspdf en el dialog).
- **Heurística de conflictos** usa solo overlap temporal; no contempla "el responsable también es servidor de mesa" (un escenario raro pero válido).
- **No hay vista pública big-screen** (auth-less) para proyectar en el salón.
- **Attachments no envían WS** al editarse — los servidores con MaM abierto necesitan refresh para ver un guion subido durante el retiro. Aceptable para V1 (uploads suelen ser pre-retiro).
- **Endpoint legacy `/api/responsibilities/documentation`** sigue activo en paralelo al nuevo modelo. El frontend lo usa para servir markdown estático del archivo TS. Idealmente convertirlo a proxy del nuevo modelo (lee de `responsability_attachment`) — pendiente.
- **No hay vista directa "Documentos por Responsabilidad"**: para subir un guion al rol `Comedor` hay que navegar a Configuración Global → Template MaM → buscar item con `responsabilityName='Comedor'` → 📎. Mejor sería una vista dedicada con buscador.
