# Plan: documentos de cada servidor en el briefing de tareas

> SDD plan — versión 1.0 (2026-10-16). Cómo se implementa, por capas. El qué/por qué vive en
> `spec.md`; el estado verificado del código, en `research.md`.

## Diseño

```
documentName(item) = item.scheduleTemplate?.documentName        (D3, columna nueva)
                  ?? item.responsability?.name                   (vínculo del retiro)
                  ?? item.scheduleTemplate?.responsabilityName   (D1, fallback)

recipients(item) = documentAudience === 'table_leaders'
                     ? líderes y colíderes de todas las mesas del retiro           (D3)
                     : item.responsables ∪ { item.responsability?.participantId }   (D2)
                   ∩ servidores activos (type server|partial_server, !isCancelled)

documents(name)  = adjuntos kind='file' con storageUrl http(s)                     (D4)
```

Un único servicio en el API calcula, para todo el retiro, `participantId → { moments,
responsibilityDocuments }`. Lo consumen el endpoint (envío manual), el motor de secuencias y,
con mock, el preview del editor (los 3 caminos de resolución).

## Capa API

| Archivo | Cambio |
|---|---|
| `apps/api/src/migrations/sqlite/<ts>_AddDocumentFieldsToScheduleTemplate.ts` | NUEVO. `ALTER TABLE schedule_template ADD COLUMN documentName varchar NULL` y `ADD COLUMN documentAudience varchar NOT NULL DEFAULT 'responsables'`, con guarda de idempotencia por `PRAGMA table_info`. Datos: los dos momentos de oración de mesa → `documentName='Texto: Dinámicas de Oración en Grupo'`, `documentAudience='table_leaders'` (match por nombre de plantilla, verificado en el test). SQL plano, sin imports del workspace. `down`: DROP COLUMN. Skill `sqlite-migrations`. |
| `apps/api/src/migrations/sqlite/20250910163337_CreateSchema.ts` | Las dos columnas en el CREATE TABLE de `schedule_template` (patrón de pays-at-house). |
| `apps/api/src/entities/scheduleTemplate.entity.ts` | `@Column documentName?: string \| null` y `@Column documentAudience: 'responsables' \| 'table_leaders'`. |
| `packages/types/src/schedule.ts` | Esquemas de la plantilla (~L70 y ~L102): `documentName` nullable/optional y `documentAudience` enum con default. |
| `apps/api/src/services/responsabilityAttachmentService.ts` | NUEVO `listFilesForNames(names)`: igual que `listForNames` (L184-214) pero solo `kind='file'`, **con** `storageUrl` y filtrando a los que empiezan por `http`. |
| `apps/api/src/services/retreatScheduleService.ts` | `populateTemplateAttachments` (L94-123): usar `documentName(item)` en vez de `i.responsability?.name` (los templates ya se cargan en L109-119; agregar `documentName`, `documentAudience` y `responsabilityName` al `select`). Exponer `documentName` en el DTO del momento. |
| `apps/api/src/services/assignmentDocumentsService.ts` | NUEVO. `forRetreat(retreatId)` → `Map<participantId, AssignmentDocumentsData>`: momentos del retiro con plantilla y responsable, `retreat_schedule_item_responsable`, mesas (líder/colíder 1/2), servidores activos, `listFilesForNames`. Día y hora en la zona horaria del retiro (skill `timezone-handling`). Orden: `day`, `startTime`. `forParticipant(retreatId, participantId)` delega en `forRetreat` y devuelve vacío para quien no sea servidor activo (R6). |
| `apps/api/src/routes/retreatScheduleRoutes.ts` + controller | `GET /retreats/:retreatId/assignment-documents` con `requirePermission('schedule:read')`, igual que `/items` (L46). Verificar que el acceso por retiro aplique (memoria: el middleware valida el recurso más específico). |
| `apps/api/src/services/messageSequenceService.ts` | `buildAssignmentsData` (L836): completar `moments` y `responsibilityDocuments` con `assignmentDocumentsService.forParticipant`. Los cuatro usos (L919-934, L1444, L2445 y L2964) heredan sin cambios. |

## Capa utils / types

| Archivo | Cambio |
|---|---|
| `packages/utils/src/index.ts` | `AssignmentsData` (L1389) + `moments?: AssignmentMomentData[]` y `responsibilityDocuments?: AssignmentDocumentData[]`. Tipos nuevos `AssignmentMomentData { dayLabel, time, name, documents, note? }` y `AssignmentDocumentData { label, url }`. `buildAssignmentsReplacements` (L1430): `momentsRoster`, `documentsRoster` (dedup de URL por mensaje; bloque de mesa al final) y `documentsCount`. `getMockAssignments` (L1447): un momento con dos documentos y uno de mesa. |

## Capa Web

| Archivo | Cambio |
|---|---|
| `apps/web/src/services/api.ts` | `getAssignmentDocuments(retreatId)`. |
| `apps/web/src/views/ResponsabilitiesView.vue` | Al abrir el Popover de "Enviar tareas", una llamada (cacheada mientras está abierto). `onChooseServer` (L856) mezcla `moments` y `responsibilityDocuments` del participante en el `assignmentsData`. Si falla, toast y se envía sin documentos (R4). El conteo del Popover suma "· N documentos". |
| `apps/web/src/utils/serverAssignments.ts` | `buildAssignmentsData` (L17) acepta los documentos ya resueltos. Sin llamadas propias. |
| `apps/web/src/views/MinuteByMinuteView.vue` | `onShowAttachments` (L586-591) usa `item.documentName`. Con eso desaparece el `return` silencioso para los momentos con documento de plantilla. |
| `apps/web/src/components/BaseMessageTemplateModal.vue` | Las tres variables nuevas en la categoría "Tareas". |
| `apps/web/src/locales/es.json` + `en.json` | Keys nuevas en los dos idiomas (regla del repo: una key ausente pinta la key cruda). |

## Contenido

- Migración de contenido para `SERVER_ASSIGNMENTS_BRIEFING`: agregar `*Tus documentos:*\n
  {assignments.documentsRoster}` **solo** en las filas (global y por retiro) cuyo `message` sigue
  igual a la semilla de `20261015130000_AddServerAssignmentsBriefingTemplate.ts` (D6). Formato
  WhatsApp, no HTML (memoria: las plantillas WhatsApp son texto plano desde 20260914).
- `docs/features/server-assignments-briefing.md`: sección de documentos. Ayuda in-app de
  Responsabilidades y Minuto a Minuto (es/en).

## Pruebas

- Unit utils: rosters, dedup de URL, vacíos, mock con `null` y literal con `undefined`.
- Service API (DB de test): fallback de plantilla, audiencia de mesa, filtro http, caminante
  vacío, servidor cancelado excluido, orden cronológico y zona horaria.
- Migración: columnas, datos de los dos momentos de mesa, idempotencia y `down`.
- Web: vista con el endpoint mockeado (documentos llegan al `assignmentsData`; con fallo sale el
  toast), y `onShowAttachments` con `documentName`.
- Secuencias: snapshot de cola con links, igual al envío manual (criterio 6).
- E2E manual en el worktree, con S3 deshabilitado (los archivos quedan `data:` y no deben
  aparecer en el mensaje) y con un adjunto http sembrado (sí debe aparecer).
