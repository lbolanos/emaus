# Research: documentos de cada servidor en el briefing de tareas

> SDD research — versión 1.0 (2026-10-16). Estado verificado del código y de los datos el día del
> envío manual. Las líneas son de `master` en `068193e6`. Repo público: personas por rol, sin
> teléfonos ni URLs de documentos.

## §1 Adjuntos de responsabilidad

- Globales, por **nombre canónico** (`responsability_attachment.responsabilityName`), no por
  retiro. Upload: `POST /api/responsability-attachments/by-name/:name/attachments` con `dataUrl`.
  El nombre se acepta libre (solo `trim` y no vacío), así que crear un nombre nuevo no requiere
  migración.
- `apps/api/src/services/responsabilityAttachmentService.ts`:
  - L30 `MAX_PER_RESPONSABILITY = 5` (cuenta también el markdown).
  - L33-41 MIME permitidos: pdf, doc, docx, png, jpeg, webp.
  - L247-262: con S3 sube a `public-assets/responsability-attachments/<slug>/<uuid>-<archivo>`,
    una **URL pública sin expiración** (bucket policy de `public-assets/`). Sin S3, guarda
    `data:` inline (máximo 1 MB), que no sirve como link.
  - L184-214 `listForNames(names)`: batch sin N+1, pero **"lite": no trae `storageUrl`**. El
    briefing necesita la URL, así que hace falta una variante que la traiga solo para
    `kind='file'`.
- Los guiones canónicos (sembrados 2026-05-04, "Guion canónico del manual Emaús") son
  `kind='markdown'` con `storageUrl` = `data:text/markdown…`. No tienen link que se pueda
  compartir.

## §2 El vínculo momento → documento ya existe en la plantilla

- `schedule_template.responsabilityName` liga cada momento de la plantilla con su documento:
  "Dinámica La Pared" → `Texto: Dinámica de la Pared`, "Explicación de las Palancas" →
  `Texto: Explicación de La Palanca`, "La Rosa" → `Charla: De la Rosa`, etc.
- Al materializar (`retreatScheduleService.ts` L895-896 y L991-992) y en el backfill
  `relinkResponsibilities` (L444-490), `responsabilityId` se resuelve buscando una
  responsabilidad **del retiro** con ese nombre (`buildResponsabilityNameIndex`). Si no existe,
  el momento queda con `responsabilityId = null`. El `scheduleTemplateId` sí se conserva, así
  que el nombre de documento se puede recuperar desde la plantilla (D1).
- En el retiro de oct-2026, según una copia de dev anterior a la carga del Excel (143 momentos,
  todos de plantilla; en prod se crearon después 6 más sin plantilla), **14 momentos** tienen
  nombre de documento en la plantilla y ningún `responsabilityId`:

  | Día | Momento | Nombre de documento (plantilla) |
  |---|---|---|
  | 1 | Cuelgue del Cartel "Jesucristo Ha Resucitado" | Texto: Explicación del Lema "Jesucristo Ha Resucitado" |
  | 1 | Reglas: confidencialidad, descansos, equipo… | Texto: Explicación de la Confidencialidad |
  | 1 | La Rosa — explicación del símbolo de Emaús | Charla: De la Rosa |
  | 1 | Explicación de las Palancas | Texto: Explicación de La Palanca |
  | 1 | Explicación de la Exhortación "Jesucristo Ha Resucitado" | Texto: Explicación del Lema "Jesucristo Ha Resucitado" |
  | 1 | Oración al Espíritu Santo (explicación) | Texto: Oración al Espíritu Santo |
  | 2 | Dinámica de Sanación (3 voces) | Texto: Dinámica de Sanación |
  | 2 | Dinámica: Hoja de Pecados | Texto: Quema de Pecados |
  | 2 | Aplicación de Cenizas | Texto: Quema de Pecados |
  | 2 | Preparación para La Pared | Texto: Dinámica de la Pared |
  | 2 | Dinámica La Pared | Texto: Dinámica de la Pared |
  | 2 | Dinámica: Lavado de Manos | Texto: Lavado de Manos |
  | 2 | Entrega de Palancas | Texto: Explicación de La Palanca |
  | 3 | Dinámica: Carta de Jesús | Texto: Carta de Jesús |

- Los dos momentos de oración de mesa ("Dinámica: Oración en Grupo", sábado, y "Dinámica:
  Oración Compartida", domingo) apuntan en la plantilla a la responsabilidad
  `Oración de Intercesión`, pero los ejecutan **todos los líderes y colíderes de mesa**. Ningún
  momento de la plantilla apunta al nombre donde quedaron sus documentos
  (`Texto: Dinámicas de Oración en Grupo`, creado el 2026-10-16). De ahí D3.

## §3 El Minuto a Minuto tampoco muestra esos documentos

- `retreatScheduleService.populateTemplateAttachments` (L94-123) arma `attachments` de cada
  momento solo con `i.responsability?.name`. Esa función ya carga los templates (L109-119, para
  la descripción), así que el fallback de D1 cuesta cero queries extra.
- `MinuteByMinuteView.vue` `onShowAttachments` (L586-591) resuelve el nombre por
  `responsabilityId` y, si no hay, **sale en silencio** (`if (!name) return`).

## §4 Responsables de un momento

- `retreat_schedule_item_responsable` (`scheduleItemId`, `participantId`, `role` siempre NULL
  hoy). En prod, el 2026-10-16 se cargaron 36 de estos responsables desde el Excel del programa
  (bloque "QUIÉN HACE…"). Una copia de la DB de dev anterior a esa carga tiene 0: **el dato
  vive en prod**.
- Además, el titular de la responsabilidad del momento (`retreat_responsibilities.participantId`)
  cuando el momento tiene `responsabilityId`.

## §5 El briefing actual

- Web: `apps/web/src/utils/serverAssignments.ts` L17 `buildAssignmentsData(participantId,
  responsibilities, teams)`. **Cero llamadas al API** (usa lo que `ResponsabilitiesView` ya
  cargó). `ResponsabilitiesView.vue` `assignmentsCandidates` (L807) y `onChooseServer` (L856).
- Scope de variables: `packages/utils/src/index.ts` `AssignmentsData` (L1389),
  `buildAssignmentsReplacements` (L1430), `getMockAssignments` (L1447),
  `replaceAssignmentsVariables` (L1467).
- Motor: `messageSequenceService.ts` `buildAssignmentsData` (L836), rama lazy en
  `resolveContent` (L919-934) y usos en `processDue` (L1444), `previewStep` (L2445) y
  `regenerateQueue` (L2964).
- Regla del repo (memoria del proyecto): una variable nueva tiene **3 caminos de resolución**
  (secuencias, envío manual y preview del editor). Verificar solo uno deja vacíos los otros dos.

## §6 El envío manual del 2026-10-16 (la referencia de lo que el sistema debe producir)

- 19 documentos (18 PDF y 1 DOCX) subidos a 14 nombres canónicos: 9 de los de §2 (todos menos
  `Texto: Oración al Espíritu Santo`, que no venía en el paquete) más `Reglamento de la Casa`,
  `Sacerdotes`, `Diario`, `Texto: Historia del Retiro de Emaús` y
  `Texto: Dinámicas de Oración en Grupo`. Los 19 links respondieron 200 con el mismo tamaño que
  los archivos originales.
- Destinatarios cruzados a mano desde el Excel del programa: **20 servidores** (todos líderes o
  colíderes de mesa) más el coordinador y quien envía, que quedaron fuera.
- Con el modelo actual (adjuntos por nombre de responsabilidad del retiro) solo **2 de los 19**
  habrían llegado: `Reglamento de la Casa` y `Sacerdotes`.
- Forma del mensaje que se mandó (el criterio 7 del spec), con las URLs abreviadas:

  ```
  Hola <apodo> 🙏
  <coordinador> nos compartió los textos de las dinámicas. Te paso los de tus momentos del retiro:

  *Viernes 19:10 · Reglas y confidencialidad*
  • Reglas para el retiro: <url>
  • Confidencialidad: <url>

  *Viernes 23:20 · Entrega de Biblias y bendición*
  • Letreros: bendición, cenizas y lavado de manos: <url>

  *Sábado 20:40 · Confesiones*
  • Instrucciones a los sacerdotes: <url>
  • Pared, confesiones, lavado de manos y palancas: <url>

  *Mesa 4 (colíder) · Dinámicas de oración*
  • Dinámica 1, sábado 14:40: <url>
  • Dinámica 2, domingo 12:20: <url>
  • Letreros de las dinámicas 1 y 2: <url>

  Jesucristo ha resucitado… ¡En verdad ha resucitado!
  ```

  El más largo midió 2 161 caracteres (2 625 ya codificado en `wa.me`): cabe sin acortar links.
- Reglas que salieron del armado a mano: una URL no se repite en el mismo mensaje; los momentos
  van en orden cronológico; el bloque de la mesa va al final; hay notas por momento cuando un
  documento trae dos versiones ("usa la que prefieras").
