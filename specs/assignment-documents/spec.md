# Spec: documentos de cada servidor en el briefing de tareas

> SDD spec — versión 1.0 (2026-10-16). Estado: **aprobado por Leonardo el 2026-10-19**, D1-D6
> tal como están. Gate de M0 cerrado: se puede empezar M1.

**Branch**: por crear (worktree al implementar) · **Fecha**: 2026-10-16 · **Para**: el próximo
retiro (no se toca el retiro de oct-2026, en curso y con Minuto a Minuto alineado por SQL).

> Repo público: este spec no lleva nombres de servidores, teléfonos ni URLs de documentos
> (los links de S3 abren sin sesión). Las personas van por rol.

## Problema

El 2026-10-16 el coordinador del retiro mandó por correo 19 documentos de las dinámicas (Palancas, Pared, Carta de
Jesús, Hoja de pecados…) para que cada servidor tuviera el texto de lo que le toca. Se subieron
como adjuntos de responsabilidad (S3, URL pública) sin problema, pero **ningún mensaje del sistema
pudo llevarlos a quien los necesita**. El envío salió a mano: cruzar el Excel del programa con
las mesas, armar 20 mensajes con un script y mandarlos uno por uno desde una página local.

El botón **"Enviar tareas"** (`docs/features/server-assignments-briefing.md`) solo lista los
*nombres* de las responsabilidades y equipos. Si leyera adjuntos, de los 19 documentos solo
habrían llegado 2. Hay tres brechas (detalle en `research.md`):

1. **El briefing no consulta adjuntos.** Arma el mensaje con lo que la vista ya tiene cargado.
2. **Los documentos cuelgan de nombres que no son responsabilidades de nadie.** Los momentos con
   documento (`Texto: Dinámica de la Pared`, `Texto: Explicación de La Palanca`…) llevan ese
   nombre en la **plantilla** del Minuto a Minuto (`schedule_template.responsabilityName`), pero
   al materializar el retiro el vínculo solo se conserva si existe una responsabilidad *del
   retiro* con ese nombre, y no existe. En el retiro de oct-2026, 14 momentos quedaron sin vínculo,
   así que **ni el Minuto a Minuto muestra sus documentos**.
3. **Quién hace cada momento vive en el Minuto a Minuto** (`retreat_schedule_item_responsable`),
   que el briefing no lee. Las dinámicas de oración, además, las hacen todos los líderes y
   colíderes de mesa, y eso no está modelado.

## Objetivo

Que "Enviar tareas" mande a cada servidor, además de sus responsabilidades y equipos, **sus
momentos del Minuto a Minuto con el link a cada documento**, sin trabajo manual. Y que el Minuto a
Minuto muestre esos mismos documentos en cada momento.

## Historias de usuario

1. Como coordinador, al pulsar "Enviar tareas" y elegir al servidor que explica las palancas,
   el mensaje ya trae "Viernes
   20:57 · Explicación de las palancas" con el link al PDF de Palancas.
2. Como coordinador, a los líderes y colíderes de mesa les llegan solos los documentos de las
   dinámicas de oración de mesa (Dinámica 1 sábado, Dinámica 2 domingo, letreros).
3. Como servidor, abro el link desde el celular y veo el PDF sin iniciar sesión.
4. Como coordinador, en el Minuto a Minuto el momento "Dinámica La Pared" muestra `📎 1` y abre
   el documento, aunque el retiro no tenga una responsabilidad "Texto: Dinámica de la Pared".

## Decisiones de diseño (aprobadas 2026-10-19)

- **D1 — De dónde sale el documento de un momento.** Nombre de documento del momento, en
  orden: `scheduleTemplate.documentName` (columna nueva, D3) → `responsability.name` del momento
  → `scheduleTemplate.responsabilityName`. *Alternativa descartada*: crear en cada retiro
  responsabilidades `Texto: …`; ensucia la lista de Responsabilidades con 10
  pseudo-responsabilidades que son textos, no tareas.
- **D2 — Quién recibe el documento de un momento.** Los responsables del momento
  (`retreat_schedule_item_responsable`) más el titular de su responsabilidad, si la tiene.
  Solo servidores activos (`type in ('server','partial_server')`, `isCancelled = false`).
- **D3 — Dinámicas de mesa.** Dos columnas nuevas en `schedule_template`:
  - `documentName` (nullable): el documento del momento cuando no coincide con su
    responsabilidad.
  - `documentAudience` (`'responsables'` por defecto | `'table_leaders'`): con
    `'table_leaders'`, el documento va a todos los líderes y colíderes de mesa del retiro.

  Los dos momentos de oración de mesa conservan su `responsabilityName` (`Oración de
  Intercesión`, que sigue ligando al responsable) y reciben `documentName = 'Texto: Dinámicas
  de Oración en Grupo'` con `documentAudience = 'table_leaders'`. Cambiar su
  `responsabilityName` rompería ese vínculo. *Alternativa*: lista fija en código, que es frágil.
- **D4 — Qué documentos viajan.** Solo adjuntos `kind='file'` con `storageUrl` http(s), es decir
  los de S3. Los guiones markdown y los archivos inline (`data:`) se omiten: no tienen URL
  que se pueda abrir desde WhatsApp. Un visor público de markdown queda fuera de alcance.
- **D5 — Formato del mensaje.** Variables nuevas en el scope `assignments.*`, en sintaxis
  WhatsApp (`\n`, `*negrita*`), como el resto del scope:
  `{assignments.momentsRoster}`, `{assignments.documentsRoster}` y `{assignments.documentsCount}`.
  El roster de documentos agrupa por momento en orden cronológico (`*Viernes 20:57 · Explicación
  de las palancas*` + viñetas `• etiqueta: url`), cierra con un bloque de la mesa y **no repite
  una URL** dentro del mismo mensaje. La etiqueta es `description` del adjunto o, si no tiene,
  `fileName` sin extensión.
- **D6 — Texto semilla.** Migración de contenido que agrega `{assignments.documentsRoster}` a
  la plantilla `SERVER_ASSIGNMENTS_BRIEFING`, solo en las filas cuyo `message` sigue igual a la
  semilla original. No pisa ediciones de ningún retiro.

## Requerimientos

- **R1** — `populateTemplateAttachments` usa el nombre de documento de D1, con lo que el `📎 N` del
  Minuto a Minuto aparece en los momentos que heredan el documento de la plantilla. El API expone
  `documentName` por momento y `MinuteByMinuteView.onShowAttachments` abre ese nombre (hoy sale
  en silencio con `if (!name) return` cuando el momento no tiene responsabilidad).
- **R2** — Servicio `assignmentDocumentsService` en el API, **única fuente** para los tres caminos
  de resolución (envío manual, motor de secuencias y preview). Calcula, por participante, sus
  momentos (D2 y D3) con sus documentos (D4), más los documentos de sus responsabilidades que no
  pasan por ningún momento.
- **R3** — Endpoint `GET /api/schedule/retreats/:retreatId/assignment-documents` → `{
  [participantId]: { moments, responsibilityDocuments } }` para todos los servidores del retiro
  en una llamada. Mismo guard que `GET /schedule/retreats/:retreatId/items`
  (`requirePermission('schedule:read')`), verificando además que aplique el acceso por retiro.
  No recibe `participantId` por URL, así que no hay IDOR por participante.
- **R4** — "Enviar tareas" hace esa llamada al abrir el Popover (una por apertura, cacheada
  mientras está abierto) y pasa `moments` y documentos dentro de `assignmentsData`. Si falla,
  el mensaje sale sin documentos y un toast lo dice (sin degradar en silencio).
- **R5** — El motor de secuencias resuelve las variables nuevas con el mismo servicio (rama lazy
  `message.includes('{assignments.')`, ya existente). Sin skip-guard, igual que hoy (D4 del
  briefing original).
- **R6** — Para participantes no servidores (caminantes) el servicio devuelve vacío. Los
  documentos de dinámicas no deben llegar nunca a un caminante, aunque alguien ponga la
  variable en una plantilla suya.
- **R7** — Día y hora del momento en la zona horaria del retiro (helpers del skill
  `timezone-handling`), con el día como nombre del día de la semana.

## Criterios de aceptación (end-to-end)

1. Con un retiro sembrado de la plantilla, el momento "Dinámica La Pared" muestra `📎` en el
   Minuto a Minuto y abre el PDF de `Texto: Dinámica de la Pared`.
2. "Enviar tareas" → el responsable de "Explicación de las Palancas", que además es colíder de mesa →
   el preview muestra su momento con el link de Palancas **y** el bloque de dinámicas de mesa.
3. Un servidor con dos momentos que comparten documento (Pared y Lavado de manos) recibe esa
   URL **una sola vez**.
4. Un adjunto markdown o `data:` no aparece en el mensaje; en `documentsCount` tampoco cuenta.
5. Un caminante con la variable en su plantilla recibe el texto de vacío, sin links.
6. Secuencia programada con `{assignments.documentsRoster}` → el snapshot de la cola trae los
   links (misma salida que el envío manual para el mismo servidor).
7. El mensaje del colíder de la Mesa 4 del retiro de oct-2026 (research §6), regenerado con datos equivalentes,
   sale igual en contenido al que se armó a mano el 2026-10-16.

## Fuera de alcance

- Visor público de guiones markdown (D4).
- Envío masivo sin revisión: el briefing sigue siendo uno por uno, con revisión (D5 del
  briefing original).
- Momentos creados a mano sin plantilla: no heredan documento. Si hiciera falta, una columna
  `documentName` por momento sería la extensión natural.
- Servidores cancelados que igual participan (caso de una charla del 2026-10): no son
  candidatos del briefing, igual que hoy.
- Re-materializar el retiro de oct-2026.

## Reconcile

Cerrado el 2026-10-19 (M6). Cada criterio verificado contra lo implementado. El E2E corrió en
el dev del worktree (API 3006 / web 5178) sobre una copia de la DB del main, que ya traía el
Minuto a Minuto y los PDFs del retiro de oct-2026 sincronizados desde prod, más 4 adjuntos de
ejemplo (`https://example.com/e2e/…`).

1. **📎 heredado** ✓: "Explicación de las Palancas" (sin responsabilidad en el retiro)
   muestra `📎 3` y abre "Documentos · Texto: Explicación de La Palanca"; antes el clic
   salía en silencio. Test de vista que falla sin el fix.
2. **Responsable + colíder** ✓: el servidor que explica las palancas recibe ese momento con
   su link y el bloque "Mesa 7 (colíder) · Dinámicas de mesa" con los documentos de mesa.
3. **Una URL una vez** ✓: los 5 documentos de mesa salen una sola vez aunque llegan por dos
   momentos; test unitario con la Pared repetida.
4. **Markdown y `data:` fuera** ✓: el guion `.md` de Palancas no aparece en el mensaje;
   test de servicio con `data:` y markdown.
5. **Caminante vacío** ✓: test de servicio (`forParticipant` de un caminante → vacío) y de
   vista (un caminante con datos no es candidato).
6. **Snapshot de secuencias** ✓: `sequenceRecipientsAndSeed.test.ts`, el snapshot de la cola
   trae momento y link.
7. **Forma del mensaje del 2026-10-16** ✓: momentos con día/hora en negrita, viñetas
   `• etiqueta: url`, mesa al final con su rol. Diferencia aceptada: el bloque de mesa lista
   los momentos como encabezado (research §6 los nombraba en la etiqueta del documento).

### Notas de cierre

- Desviaciones por milestone en `tasks.md` (M1-M6). Las dos que cazó el E2E (conjuntos
  clonados y negritas consecutivas) no se habrían visto con los tests unitarios: los datos
  de prueba no tenían clones y los tests del roster no pasaban por `replaceAllVariables`.
