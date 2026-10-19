# Tasks: assignment-documents

> SDD tasks — versión 1.0 (2026-10-16). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone.

## M0 — specs SDD

- [x] `specs/assignment-documents/spec.md` (D1-D6 con defaults propuestos)
- [x] `specs/assignment-documents/research.md`
- [x] `specs/assignment-documents/plan.md`
- [x] `specs/assignment-documents/tasks.md`
- [x] **Gate**: Leonardo revisa D1-D6 antes de codear M1 — aprobado 2026-10-19, las cuatro
      preguntas con la opción recomendada (D1 plantilla, D2/D3 responsables + regla de mesa,
      D4 solo archivos con link, D5/D6 variables + actualizar la semilla sin editar)
- [x] Worktree `.claude/worktrees/assignment-documents`, branch `worktree-assignment-documents`

## M1 — Modelo: columnas de documento en la plantilla

- [x] Migración `20261019120000_AddDocumentFieldsToScheduleTemplate.ts` (columnas; idempotente;
      `down`)
- [x] Entidad `scheduleTemplate.entity.ts` + esquemas de `packages/types/src/schedule.ts` + DTO
      web + `ITEM_FIELDS` de auditoría
- [x] Seeder: las 4 filas de oración de mesa (2 por conjunto) con `documentName` +
      `documentAudience`; ambos campos en `SYNCABLE_FIELDS`
- [x] Tests: migración (down/up/idempotencia) y seeder (datos + sync al arrancar)

**Done**: 2026-10-19.

### Desviaciones 2026-10-19

- **Los datos no van en la migración, van en el seeder.** `createDefaultScheduleTemplate` corre
  al arrancar el API y `syncTemplateFields` propaga los campos de `SYNCABLE_FIELDS` a la DB; es
  el camino de todos los demás campos de la plantilla. Un `UPDATE` por nombre en la migración
  habría sido un segundo camino, frágil ante renombres.
- **Son 4 filas, no 2**: el conjunto Colombia (Sta Clara) también tiene sus dos dinámicas de
  oración (`Dinámica de Oración de Intercesión`, `Dinámica Oración Compartida`).
- **Sin `CreateSchema.ts`**: `schedule_template` nace en `20260423120000_CreateMinutoAMinuto`,
  no en el baseline. Esa migración no se toca; la DB de test sincroniza desde la entidad.

## M2 — Minuto a Minuto muestra los documentos heredados

- [x] `listShareableFilesForNames` en `responsabilityAttachmentService`
- [x] Helper puro `utils/scheduleItemDocument.ts` (`resolveScheduleItemDocumentName`, regla D1)
- [x] `populateTemplateAttachments` con el helper; `documentName` en el DTO
- [x] `MinuteByMinuteView.onShowAttachments` usa `documentName`
- [x] Tests: service (DB de test) y vista (comprobado que falla sin el fix)

**Done**: 2026-10-19.

### Desviaciones 2026-10-19

- **Renombre**: `listFilesForNames` → `listShareableFilesForNames`. El nombre dice qué filtra
  (solo links http(s)).
- **Alcance extra, misma regla D1**: `streamRetreatBundle` (el `bundle.zip` del Minuto a Minuto)
  y `scheduleTemplateService.listAll` (adjuntos en la vista de plantillas) resolvían el
  documento solo por la responsabilidad del momento, así que tenían la misma brecha: el ZIP no
  incluía la Pared ni la Carta de Jesús. Ahora usan el helper.

## M3 — Servicio y endpoint de documentos por servidor

- [x] `assignmentDocumentsService.forRetreat` / `forParticipant` (D2, D3, D4, R6, R7)
- [x] `GET /api/schedule/retreats/:retreatId/assignment-documents` + verificación de acceso
      por retiro (`checkRetreatAccess` en el handler, el patrón del controller)
- [x] Tipos compartidos en `packages/utils` (`AssignmentDocumentsData` y relacionados;
      `AssignmentsData` los extiende como opcionales)
- [x] Tests del service (DB de test, 5 casos) y del controller (403 sin leer, 200, 500)

**Done**: 2026-10-19.

### Desviaciones 2026-10-19

- **La verificación de acceso va en el handler, no en la ruta.** Así lo hace todo
  `retreatScheduleController` (`checkRetreatAccess`); `requirePermission` es global (junta los
  roles de cualquier retiro) y no basta solo.
- **`table` y `forTable` en los datos**: el bloque de la mesa (D5) necesita saber la mesa y el
  rol del servidor y qué momentos le llegan por ser de mesa.
- **Hallazgo previo, fuera de alcance**: los handlers por id de momento (`updateItem`,
  `deleteItem`, `startItem`, `completeItem`, `shiftItem`) no verifican a qué retiro pertenece el
  momento; con `schedule:manage` de cualquier retiro se pueden mutar momentos de otro. Reportado
  a Leonardo para un fix aparte.

## M4 — Variables `{assignments.*}` nuevas

- [x] `momentsRoster`, `documentsRoster`, `documentsCount` en `buildAssignmentsReplacements` +
      mock en `packages/utils`
- [x] Categoría "Tareas" del editor de plantillas + re-export de tipos en `utils/message.ts`
- [x] Tests unitarios (orden, dedup de URL, bloque de mesa, vacíos, mock)

**Done**: 2026-10-19.

### Desviaciones 2026-10-19

- **Sin keys i18n**: las etiquetas de la categoría "Tareas" de `BaseMessageTemplateModal` son
  texto fijo en español, igual que las seis variables existentes del scope.
- **Bloque de mesa**: sus momentos van como encabezado y los documentos debajo, todos juntos. Un
  documento por momento habría puesto el documento del domingo bajo el título del sábado (los
  dos momentos comparten el mismo nombre de documento).

## M5 — Los tres caminos de resolución

- [ ] Envío manual: `ResponsabilitiesView` (llamada al abrir el Popover, toast si falla)
- [ ] Motor de secuencias: `buildAssignmentsData` usa el service
- [ ] Preview del editor: mock
- [ ] Tests de vista y de secuencias (criterio 6)

## M6 — Contenido, docs y cierre

- [ ] Migración de contenido de la semilla (solo filas sin editar, D6)
- [ ] `docs/features/server-assignments-briefing.md` + ayuda in-app es/en
- [ ] E2E manual en el worktree (criterios 1-7)
- [ ] Reconcile en `spec.md`
