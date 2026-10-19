# Briefing de tareas del servidor

Permite, una vez asignadas responsabilidades y equipos, enviar por WhatsApp a cada
**servidor** un mensaje con **sus responsabilidades** y los **equipos de servicio** en
los que participa (como líder o miembro), para que sepa qué le toca en el retiro.

Es el patrón del [briefing de mesa](./table-leader-briefing.md) aplicado al equipo
servidor: botón → Popover de servidores → `MessageDialog` prellenado → envío asistido
WhatsApp (clipboard + deep link `wa.me` + registro en `participant_communications`).

## Disparador

En la vista **Responsabilidades** (`ResponsabilitiesView.vue`), el header tiene el
botón **"Enviar tareas"** (icono `Send`), deshabilitado si ningún servidor tiene
asignaciones.

Al pulsarlo abre un **Popover** con solo los servidores activos con ≥1 asignación
(responsabilidad activa o equipo, líder o miembro), con buscador tolerante (mismo
normalizador que el buscador principal de la vista) y el conteo
"N responsabilidades · M equipos" por servidor. Al elegir uno se abre el
`MessageDialog` con:

- el servidor elegido como destinatario (su teléfono),
- la plantilla **"Tareas del Servidor — responsabilidades y equipos"**
  (`SERVER_ASSIGNMENTS_BRIEFING`) preseleccionada,
- las variables `{assignments.*}` resueltas con los datos de ese servidor.

Se cierra el Popover **antes** de abrir el Dialog (patrón `nextTick`) para evitar el
bug de `pointer-events:none` huérfano de reka-ui, y el Dialog va **montado sin `v-if`**
(el watcher de `forceTemplateType` solo dispara si ya estaba montado).

## Scope de variables `assignments.*`

Definido en `packages/utils/src/index.ts` (`AssignmentsData`,
`buildAssignmentsReplacements`, `replaceAssignmentsVariables`, `getMockAssignments`)
e integrado en `replaceAllVariables` (9º param, tras `spouse`) / `findEmptyVariables`
(7º param). Misma semántica que `table.*`: `null` → mock (solo preview de UI),
`undefined` → placeholder literal.

| Variable | Contenido | Vacío |
| --- | --- | --- |
| `{assignments.responsibilitiesCount}` | Cantidad de responsabilidades | `0` |
| `{assignments.responsibilitiesList}` | Nombres por coma | `Ninguna` |
| `{assignments.responsibilitiesRoster}` | Bloque: `1. *Nombre* — Tipo (liderazgo)` | `(sin responsabilidades asignadas)` |
| `{assignments.teamsCount}` | Cantidad de equipos | `0` |
| `{assignments.teamsList}` | Nombres de equipo por coma | `Ninguno` |
| `{assignments.teamsRoster}` | Por equipo: `*Equipo* — Tu rol: Líder/Miembro (rol)` + líder + miembros | `(sin equipos asignados)` |
| `{assignments.momentsRoster}` | `• Viernes 20:57 · Momento` por momento del Minuto a Minuto; los de mesa con `(mesa)` | `(sin momentos asignados en el Minuto a Minuto)` |
| `{assignments.documentsRoster}` | Documentos con link: un bloque por momento, luego responsabilidades sin momento, mesa al final; cada URL una vez | `(sin documentos)` |
| `{assignments.documentsCount}` | Cantidad de URLs distintas | `0` |

## Documentos del Minuto a Minuto (specs/assignment-documents)

Desde 2026-10-19 el briefing lleva también los **documentos con link** de lo que le toca
a cada servidor. Spec, decisiones D1-D6 y desviaciones: `specs/assignment-documents/`.

- **Documento de un momento** (`utils/scheduleItemDocument.ts`):
  `scheduleTemplate.documentName` → responsabilidad del momento →
  `scheduleTemplate.responsabilityName`. El último paso cubre los momentos cuyo nombre
  canónico (`Texto: Dinámica de la Pared`…) no es una responsabilidad del retiro: al
  materializar quedan sin vínculo, pero la plantilla sigue nombrando su documento. La
  misma regla usan el `📎` del Minuto a Minuto, el `bundle.zip` y la vista de plantillas.
- **Quién lo recibe**: los responsables del momento y el titular de su responsabilidad;
  con `schedule_template.documentAudience = 'table_leaders'` (las dinámicas de oración de
  mesa), todos los líderes y colíderes de mesa. Solo servidores activos
  (`server` + `partial_server`).
- **Qué viaja**: solo archivos con link http(s) (S3). Markdown y archivos inline
  (`data:`) no tienen link que abrir desde el celular.
- **Una sola fuente**: `assignmentDocumentsService` (API) alimenta el endpoint
  `GET /api/schedule/retreats/:retreatId/assignment-documents` (envío manual, una llamada
  al abrir el Popover) y `messageSequenceService.buildAssignmentsData` (motor). Si la
  llamada falla, el mensaje sale sin documentos y un toast lo dice.
- **Plantilla**: `20261019130000_AddDocumentsToServerAssignmentsBriefing` agrega el bloque
  `*Tus documentos*` solo donde el texto sigue igual a la semilla.
- **Conjuntos clonados**: el seeder sincroniza solo los dos conjuntos que siembra. Un clon
  ("Emaús — Del Valle", `sourceTag = clon:emaus_mexico`) no recibe esos campos, así que
  `20261019140000_MarkTablePrayerDocumentOnAllTemplateSets` marca las dinámicas de oración
  de mesa en todos los conjuntos (solo si siguen ligadas a "Oración de Intercesión" y sin
  documento propio). Un clon creado después de esa migración no la hereda: hay que
  marcarlo igual.
- **Negritas consecutivas**: el colapso de énfasis vacíos de `replaceAllVariables` usaba
  `\s*` y borraba el `*\n*` entre una línea en negrita y la siguiente (`*Tus documentos:*`
  + `*Viernes 20:57 · …*` salían pegadas). Ahora solo cuenta el espacio horizontal.

**Los rosters van en sintaxis WhatsApp** (`\n` + `*negrita*`), no `<br>`/`<strong>`:
desde la migración `20260914120000_FormatWhatsappMessageTemplates` el formato canónico
de plantillas WhatsApp es texto plano (el motor de secuencias manda el texto resuelto
crudo). Decide la organización: no describe dinámicas internas del retiro.

### Semántica de "vacío" (diferencia clave con `table.*`)

`buildAssignmentsData` **siempre** devuelve un objeto válido: un servidor sin tareas
recibe "0 · Ninguna — (sin responsabilidades asignadas)", que es contenido legítimo
del briefing, no un error. Consecuencia (decisión **D4**): el motor de secuencias
**no tiene skip-guard** para `{assignments.*}` — a diferencia de `{table.*}` (que se
skippea si el líder no tiene mesa), una plantilla con este scope a un servidor sin
tareas **sí despacha**.

## Plantilla

Un solo tipo: **`SERVER_ASSIGNMENTS_BRIEFING`** (audiencia `server`), sembrada por la
migración y editable por retiro. El texto semilla lo **aprobó la organización el
2026-10-16** (regla: un documento que sale de la organización no está cerrado hasta
que lo lee quien lo firma).

**No aparece en el selector manual** de plantillas del `MessageDialog`
(`MANUAL_HIDDEN_TEMPLATE_TYPES`, junto a `TABLE_LEADER_BRIEFING`): sus variables solo
se llenan vía el botón "Enviar tareas" (que pasa el `assignmentsData`). Se selecciona
solo cuando el diálogo se abre con `forceTemplateType='SERVER_ASSIGNMENTS_BRIEFING'`.
Tampoco se **persiste ni se restaura** como preferencia de plantilla del contexto
(`emaus.messageDialog.lastTemplate.*`): sin el `assignmentsData` del flujo, restaurarla
abriría el diálogo manual con `{assignments.*}` literales y sin forma de ver qué está
seleccionado (bug pre-existente con `TABLE_LEADER_BRIEFING`, cazado en el E2E de esta
feature). El picker de variables muestra la categoría **"Tareas"**
(`BaseMessageTemplateModal.vue`; su preview usa el mock).

## Migración

`apps/api/src/migrations/sqlite/20261015130000_AddServerAssignmentsBriefingTemplate.ts`
(espejo de la de `santisimo_guardia_invite`):

- Recrea el CHECK de `global_message_templates` para aceptar el tipo nuevo (baseline:
  el NEW_CHECK de `20261014120000_AddSantisimoGuardiaInviteTemplate.ts`).
- Siembra la plantilla global (idempotente por `type`) y la copia a cada retiro
  existente (NOT EXISTS retreatId+type). Retiros nuevos la reciben vía
  `copyAllActiveTemplatesToRetreat`.
- `transaction = false` + PRAGMA foreign_keys OFF/ON + `foreign_key_check`. Sin
  importar `@repo/types` (SQL plano). Idempotente y reversible.
- **No crea ninguna secuencia**: el envío es manual, con revisión del mensaje antes
  de salir.

## Resolución backend (motor de secuencias)

`apps/api/src/services/messageSequenceService.ts` — `buildAssignmentsData` privado,
espejo del builder web con repos TypeORM (responsabilidades activas del participante +
equipos del retiro donde es líder o miembro; nombres resueltos en un solo `findBy(In)`
en vez de una query por persona). Integración:

- `resolveContent`: param `precomputedAssignmentsData` (10º, posicional) + rama lazy
  `message.includes('{assignments.')`.
- `processDue`: precompute una vez, compartido por los dos renders del email. **Sin
  skip-guard** (D4).
- `regenerateQueue`: mismo lazy al regenerar snapshots; sin skip-guard.
- `previewStep`: precompute compartido con `findEmptyVariables` (7º arg).
- `getQueueItemDetail` (fallback de cola pre-snapshot) **no** resuelve este scope —
  tampoco resuelve `{table.*}`; los mensajes nuevos siempre llevan snapshot.

**Diferencia aceptada entre caminos**: el envío manual (web) identifica a las personas
con `participantLabel` (apodo significativo si existe); el motor usa nombre completo
(igual que `buildTableData`). No hay secuencia sembrada con esta plantilla, así que en
la práctica el camino activo es el manual.

## Archivos clave

- `packages/utils/src/index.ts` — scope `assignments.*`.
- `packages/types/src/message-template.ts` — tipo `SERVER_ASSIGNMENTS_BRIEFING`.
- `packages/types/src/index.ts` — `RESPONSABILITY_TYPE_LABELS` (fuente única de
  etiquetas de tipo, compartida web/motor).
- `apps/api/src/migrations/sqlite/20261015130000_AddServerAssignmentsBriefingTemplate.ts`.
- `apps/api/src/services/messageSequenceService.ts` — `buildAssignmentsData` + wiring.
- `apps/web/src/utils/serverAssignments.ts` — builder client-side (cero llamadas API:
  la vista ya tiene responsabilidades y equipos).
- `apps/web/src/composables/useParticipantMessageDialog.ts` — singleton con
  `assignmentsData` + `templateType`.
- `apps/web/src/components/MessageDialog.vue` — props `assignmentsData` +
  `forceTemplateType`; tipo oculto del selector manual.
- `apps/web/src/views/ResponsabilitiesView.vue` — botón + Popover + `onChooseServer`.
- `apps/web/src/components/BaseMessageTemplateModal.vue` — categoría "Tareas".

## Tests

- `apps/web/src/utils/__tests__/assignmentsVariables.test.ts` — counts/list/roster,
  vacíos explícitos, mock con `null`, literal con `undefined`, `$` en valores.
- `apps/web/src/utils/__tests__/serverAssignments.test.ts` — líder vs miembro,
  etiquetas de tipo, apodos, inactivos fuera, orden.
- `apps/web/src/views/__tests__/ResponsabilitiesBriefing.test.ts` — candidatos,
  búsqueda, apertura del dialog con plantilla + `assignmentsData`.
- `apps/api/src/tests/migrations/addServerAssignmentsBriefingTemplate.test.ts` —
  seed global + copia a retiros + idempotencia + down.
- `apps/api/src/tests/services/sequenceRecipientsAndSeed.test.ts` — resolución del
  motor (roster con equipo, inactivos fuera) y despache con lista vacía (sin skip).
