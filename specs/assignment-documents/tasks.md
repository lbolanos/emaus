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
- [ ] Worktree + branch al arrancar M1

## M1 — Modelo: columnas de documento en la plantilla

- [ ] Migración `<ts>_AddDocumentFieldsToScheduleTemplate.ts` (columnas + datos de los dos
      momentos de mesa; idempotente; `down`)
- [ ] `CreateSchema.ts`: columnas en `schedule_template`
- [ ] Entidad `scheduleTemplate.entity.ts` + esquemas de `packages/types/src/schedule.ts`
- [ ] Test de migración

## M2 — Minuto a Minuto muestra los documentos heredados

- [ ] `listFilesForNames` en `responsabilityAttachmentService`
- [ ] `populateTemplateAttachments` con `documentName(item)`; `documentName` en el DTO
- [ ] `MinuteByMinuteView.onShowAttachments` usa `documentName`
- [ ] Tests (service + vista)

## M3 — Servicio y endpoint de documentos por servidor

- [ ] `assignmentDocumentsService.forRetreat` / `forParticipant` (D2, D3, D4, R6, R7)
- [ ] `GET /api/schedule/retreats/:retreatId/assignment-documents` + verificación de acceso
      por retiro
- [ ] Tests del service (DB de test) y del controller (401/403 y acceso cruzado entre retiros)

## M4 — Variables `{assignments.*}` nuevas

- [ ] Tipos + `buildAssignmentsReplacements` + mock en `packages/utils`
- [ ] Categoría "Tareas" del editor de plantillas + i18n es/en
- [ ] Tests unitarios (dedup de URL, vacíos, mock)

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
