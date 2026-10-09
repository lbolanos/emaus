# Auditoría de cambios en secuencias de mensajes

> **Estado**: implementado y verificado en dev (worktree `audit-secuencias`, branch
> `worktree-audit-secuencias`), 2026-10-06. Falta: deploy (paso 8, requiere autorización).

## Disparador — incidente 2026-10-06 (retiro Buen Despacho, `e9b3c568-050a-4d66-a99d-305f287a59df`)

Tras un alta batch de 5 caminantes, los mensajes de palancas no aparecieron en la bandeja y se
hicieron cambios de corrección a ciegas. La reconstrucción forense solo fue posible leyendo
`updatedAt` de las filas — **ningún cambio tiene autor registrado**:

| Hora (CDMX) | Cambio | Autor |
| --- | --- | --- |
| 1-oct 20:22 | Se crea "Palancas (copia)" `4738ac91` (activa) | ¿? |
| 6-oct 10:32 | Alta de 5 caminantes; el guard M2 suprime pasos vencidos | sistema |
| 6-oct 10:32 / 11:58 | "Ejecutar ahora" sobre PALANCA_DEFINITION y PALANCA_REQUEST | ¿? |
| 6-oct 19:38 | Se crea "Bienvenida Caminantes" `b1073428` (activa) | ¿? |
| 6-oct 19:45 | Se **desactiva** "Palancas (copia)" → bandeja los oculta + pendientes congelados | ¿? |
| 6-oct 21:02 | Se crea "Palancas (copia)(copia)" `4882ed9d` (inactiva, vacía) | ¿? |

El síntoma "no veo los mensajes en la bandeja" tuvo dos capas: (1) el guard anti-retroactivo M2
suprimió los pasos vencidos al enrolar a los nuevos (por diseño, ver
`isRetroactiveAtEnroll` en `messageSequenceService.ts`), y (2) la desactivación de la secuencia
hizo que el filtro `'active'` de la bandeja (`MessageSequencesView.vue`, `queueAssignFilter`)
ocultara los `queued` existentes.

## Gap verificado (evidencia, no suposición)

Consultado sobre copia local de prod (db-pull del 2026-10-06 21:15):

- `domain_audit_log` tiene 1227 filas pero **solo** `participant` (991), `table` (116),
  `bed` (73), `retreat` (39), `payment` (6), `house` (2). Cero filas de secuencias.
- `audit_logs` (20 filas) solo registra `role_assigned` / `role_invited`.
- `user_activities` está **vacía** (0 filas) — mecanismo muerto, no usarlo.
- `grep -n audit apps/api/src/controllers/messageSequenceController.ts` → sin resultados;
  el servicio solo menciona "auditoría" en comentarios.

Conclusión: el mecanismo existe (`domainAuditService`), falta invocarlo desde el módulo.

## Diseño

Reutilizar `domainAuditService` (`apps/api/src/services/domainAuditService.ts`, helpers
`logCreate` / `logUpdate` / `logDelete` / `log`, con `actorUserId`, `retreatId`, `oldValues`,
`newValues`, `metadata`, `ipAddress`, `userAgent`). Sin tabla nueva ni migración.

ResourceTypes nuevos: `message_sequence`, `sequence_step`, `scheduled_message`.

### Acciones a auditar

| Método (servicio/controller) | Evento | Qué capturar |
| --- | --- | --- |
| `createSequence` | `create` message_sequence | name, trigger, audience, isActive; metadata `{ clonedFrom }` si es copia |
| `updateSequence` | `update` message_sequence | old/new de `isActive`, `maxOverdueDays`, name; **los cambios de pasos** (offsets borrados/agregados/archivados) en metadata |
| `deleteSequence` | `delete` message_sequence | snapshot mínimo (sus `scheduled_messages` se borran en cascade) |
| `runNow` (por retiro) | `custom` message_sequence, action `run_now` | metadata `{ sendNowStepIds }` — es la confirmación M5 de enviar vencidos |
| `rescheduleStep` | `custom` scheduled_message, action `reschedule` | old/new `scheduledFor` — el "Ejecutar ahora" de un paso |
| `markDispatched`, `markSkipped`, `retry`, `discard` | `custom` scheduled_message | action correspondiente; `markSkipped` exige motivo (ya existe en la UI) |
| `assign` | `custom` scheduled_message | old/new `assignedTo` |
| `markOpened` | **no auditar** (ruido: es telemetría de deep-link) | — |
| Cron `processDue`/`enrollAll` | **no auditar** por fila (volumen) | alternativa a decidir: un evento agregado por corrida si se quiere traza del motor |

### Decisiones ya tomadas

- Actor: pasar `req.user.id` desde el controller (hoy los métodos del servicio no lo reciben).
  Para eventos del motor, `actorUserId = null` + metadata `{ system: true }`.
- `scheduled_message` se audita solo en transiciones **manuales** (despacho/skip/retry/discard/
  assign/reschedule), no en el CRUD interno del motor.

## ⚠️ Riesgo conocido — no repetir el patrón del import

`participantService.ts` llama `void domainAuditService.logUpdate(...)` **sin await** dentro del
camino de import y causó `cannot start a transaction within a transaction` (skill
`troubleshooting` §25.3). En secuencias: **nunca disparar la auditoría sin await dentro de una
transacción abierta**; hacer `await` después de cerrarla, o encolarla fuera. Con el driver
síncrono better-sqlite3 la ventana es de microtasks, pero la regla se mantiene.

## Puntos abiertos (decide el usuario) — RESUELTOS en la implementación

1. **Evento agregado de cron**: sí, pero **por retiro tocado** (decisión del usuario): la corrida
   horaria emite un `message_sequence.cron_run` por cada retiro con actividad (enrolled>0 o
   processed>0). Retiros sin actividad no generan fila. `actorUserId = null` +
   `metadata { system: true, enrolled, processed }`.
2. **Visor**: sí, con labels i18n es+en (decisión del usuario). `DomainAuditView` ya derivaba las
   acciones de `DomainAuditAction`; sólo faltaron los labels y los colores de badge.

## Alcance final (módulo mensajería completo — decisión del usuario)

Además de las secuencias del plan original, se auditó:

- **Plantillas de mensaje** (`messageTemplateService`): create/update/delete para scope retreat y
  community. El cuerpo NO va al diff (HTML grande); metadata `{ messageChanged, messageChars }` y
  `communityId` cuando aplica.
- **Secuencias globales** (`globalMessageSequenceService`): create/update/delete/toggleActive +
  `copy_to_retreat` (una fila con `createdSequenceId`; el clon deja además su
  `message_sequence.create` con `metadata.clonedFrom`).
- **Plantillas globales de mensaje** (`globalMessageTemplateService`): create/update/delete/
  toggleActive + `copy_to_retreat` / `copy_to_community` / `copy_from_retreat`. La copia escribe
  `message_templates` por repo directo: UN solo evento de copia (con `targetTemplateId` y
  `updatedExisting`), sin duplicar como `message_template.create`.

## Desviaciones del plan original

- **Actor sin tocar firmas**: el plan preveía pasar `req.user.id` por el controller (paso 3).
  No hizo falta: `requestContextMiddleware` (global, tras passport) llena un `AsyncLocalStorage`
  que `domainAuditService` lee solo — el actor fluye sin propagar userId por las firmas.
- **`rescheduleStep` audita el PASO, no el mensaje**: el "Ejecutar ahora" de un paso mueve N
  pendientes con un solo UPDATE; el recurso es `sequence_step` (resourceId = step.id) y el conteo
  va en `metadata.affected`.
- **`bulkResolveIssues`** (bulk retry/discard de "Problemas") y **`regenerateQueuedForRetreat`**
  (regenerar bandeja) se añadieron a la tabla original: son acciones masivas con efecto visible
  y no estaban en el plan.
- **`runForRetreat`** (el "Ejecutar ahora" por retiro que disparó el incidente) emite
  `message_sequence.run_now` con `{ sendNowStepIds, enrolled, processed, pastStepsCount }`.
- El cron se extrajo a `runEngineCycle(now)` (método público, testean los tests) invocado por el
  schedule horario; `enrollAll`/`processDue` ganaron colectores opcionales (`Map<retreatId, n>`)
  para el agregado, sin romper firmas existentes.
- **Riesgo §25.3 verificado**: ni `messageSequenceService` ni el seed de `createRetreat`
  (`copyAllActiveTemplatesToRetreat` / `createDefaultMessageSequencesForRetreat` corren tras
  `repos.retreat.save`, sin wrapper de transacción; el `ds.transaction` de `retreatService` es
  del path de DELETE). El fire-and-forget no puede reproducir el bug del import.

## Implementación (2026-10-06, worktree `audit-secuencias`)

- `packages/types/src/audit.ts`: 30 acciones nuevas + 6 resourceTypes. El visor y el keystone
  `auditLocaleCoverage.test.ts` derivan de aquí.
- `apps/api/src/services/`: `messageSequenceService.ts`, `messageTemplateService.ts`,
  `globalMessageSequenceService.ts`, `globalMessageTemplateService.ts` instrumentados.
- `apps/api/src/tests/services/`: `messageSequenceAudit.test.ts` (14),
  `messageTemplateAudit.test.ts` (5), `globalMessagingAudit.test.ts` (10). Flush del
  fire-and-forget con el patrón `waitForLogs` del test de integración de participantes.
- Web: labels es+en (`audit.actions.*` / `audit.resources.*`), badges por recurso en
  `DomainAuditView.vue`, `clonedFrom` en el duplicar de `MessageSequencesView.vue`
  (`createMessageSequenceSchema.body.clonedFrom` nullish en `@repo/types`).
- Verde: 297 tests jest del módulo + 62 vitest (incluido el keystone de locales) +
  `pnpm --filter web build` (vue-tsc) + `pnpm --filter api build` con `grep __dirname`
  limpio (las 2 apariciones son el shim local preexistente de `index.ts`, no el global CJS).

## Pasos restantes

6. ~~Verificar en dev~~ — **hecho (2026-10-06)** con el dev del worktree (API 3002 / web 5174,
   DB copia del main). Login con usuario real, retiro Buen Despacho seleccionado:
   - Toggle de "Palancas (copia)" (`4738ac91`, la secuencia del incidente) en
     `/app/settings/message-sequences` → el visor `/app/audit` mostró de inmediato la fila
     `Secuencia editada` con **actor Leonardo Bolaños + email**, diff `isActive: sí → no`,
     metadata `{archivedStepCount, archivedPendingCount, cancelledPendingCount}` e IP.
   - Filtro por área: las 6 áreas nuevas aparecen con label i18n y el filtro deja solo las
     filas de secuencias. Badges con color propio (índigo para `message_sequence.*`).
   - Fix de label encontrado en la verificación: `audit.resources.global_message_sequence`
     decía "Plantilla global de secuencia" (una secuencia no es plantilla) → "Secuencia global
     de mensajes" / "Global message sequence" (es+en).
   - Estado restaurado (la secuencia volvió a Activa). Keystone de locales en verde.
   - Nota de rutas: `MessageSequencesView` vive en `/app/settings/message-sequences` y el
     visor en `/app/audit` — el retiro sale del store, no de la URL (`/app/retreats/:id/...`
     no matchea y deja página vacía).
8. Deploy normal (sin migración de schema) + verificación en prod: hacer un cambio de prueba
   (activar/desactivar una secuencia) y comprobar la fila en `domain_audit_log`.

## Tanda P1 — merge de duplicados y accesos (mismo día)

Segunda ola, priorizada por riesgo (destructivas / acceso):

- **`participantMergeService`**: el merge ejecutaba SQL crudo en transacción sin rastro
  alguno. Ahora deja `participant.merge` en `domain_audit_log`, **después** de cerrar la
  transacción (riesgo §25.3). Recurso = la ficha absorbida; `retreatId` del log = el retiro
  del absorbido (capturado antes de que la fusión lo NULLee); old/new
  `{mergedIntoParticipantId, retreatId}`; metadata `{keepId, keepLabel, mergeLabel,
  attendanceMoved, attendanceMerged, moves[]}` — el detalle por tabla reconstruye la fusión.
- **`retreatRoleService`**: invite/remove ya auditaban en `audit_logs`, pero
  `approveRetreatInvitation`/`rejectRetreatInvitation` cambiaban el acceso sin registro.
  Approve deja `role_invitation_approved` (acción nueva en el enum); reject reutiliza
  `role_invitation_revoked` (lea la invitación pendiente antes de revocar para llevar
  email+rol en la fila).
- **Corrección del mapa de cobertura**: `permissionOverrideService` y `roleRequestService`
  SÍ auditan (vía `AuditService`/`audit_logs`) — el barrido inicial solo buscaba
  `domainAuditService` y los dio por descubiertos. Lección: el grep de cobertura tiene que
  incluir ambos mecanismos.

Verificación: 5 tests nuevos (2 merge + 3 invitaciones), 52 en las 9 suites de auditoría,
26 en las suites de merge preexistentes, 7 RBAC, keystone de locales, builds web+api y
`grep __dirname` limpio.

## Tanda P2 — operación del retiro (13 servicios, en bloques)

Tercera ola: la operación diaria del retiro (plantillas, minuto a minuto, Santísimo,
responsabilidades, equipos) corría sin rastro. Mismo patrón que la mensajería: helpers del
`domainAuditService`, actor implícito del `auditContext`, fire-and-forget **siempre fuera de
transacciones abiertas**.

### Bloque A — plantillas y operación instalada (commit pendiente)

- **Plantillas globales** (`preRetreatTaskTemplateService`, `scheduleTemplateService`): CRUD de
  sets e ítems con allowlist de campos; `cascadeItems`/`cascadeChildren` contados **antes** del
  delete (el FK CASCADE ya se llevó las filas después). Textos largos (`description`,
  `musicTrackUrl`, `palanquitaNotes`, `planBNotes`) fuera del diff: metadata `xxxChars`.
- **Tareas pre-retiro del retiro** (`retreatPreRetreatTaskService`): CRUD + `set_status` +
  `materialize` agregado (`{mode, createdRoots, createdChildren, clearExisting}`) +
  `add_missing` solo si `added > 0`.
- **Minuto a minuto** (`retreatScheduleService`): CRUD + transiciones manuales (`start`,
  `complete` con `actualStartTime/EndTime`) + masivas agregadas (`bulk_assign`, `relink`,
  `materialize`, `shift_day`, `shift_all`, `shift_downstream`, `reorder_day`,
  `regenerate_santisimo`). `resolveSantisimoConflicts` y la auto-asignación de angelitos NO se
  auditan: consecuencias derivadas que corren tras casi cada edición.

### Bloque B — Santísimo, responsabilidades y equipos

- **Santísimo** (`santisimoService`): CRUD de slots + `generate` agregado
  (`{cleared, created, skippedExisting}`); signups con `admin_create`, `public_signup`
  (agregado por request, **IP en el evento** — ruta pública sin `auditContext`), `delete` y
  `cancel` (por token; el token es bearer secret y **nunca** entra al log). PII mínima:
  `{slotId, name}` en newValues, `hasPhone`/`hasEmail` en metadata. El agregado de
  `publicSignup` se emite en `finally`: el loop valida por slot y puede lanzar a mitad, y los
  ya creados no deben quedar sin traza.
- **Responsabilidades** (`responsabilityService`): CRUD + `assign`/`remove` (diff de
  `participantId` viejo→nuevo, que captura la reasignación directa) + `create_speaker`
  (distingue "asignó a alguien existente" de "creó charlista nuevo"; nombre sí, teléfono y
  correo como banderas). `createDefaultResponsibilitiesForRetreat` y
  `ensureCharlaResponsibilitiesFromTemplateSet` exentas: semilla del retiro / derivadas del
  materialize.
- **Documentos de responsabilidades** (`responsabilityAttachmentService`): create (archivo y
  markdown) + update + `restore_version` (metadata `historyId`) + delete. `storageUrl`
  (data:URL hasta 10MB) y `content` (markdown 200KB) **nunca** entran al log — `sizeBytes`
  informa el tamaño; metadata `historySnapshot` señala que la edición guardó versión. Nota
  hallada: el historial NO tiene FK/cascade — al borrar un attachment sus versiones quedan
  huérfanas (comportamiento previo, documentado en el código).
- **Equipos de servicio** (`serviceTeamService`): CRUD + `add_member`/`remove_member`/
  `assign_leader`/`unassign_leader` con `movedFromTeamId`, `wasLeader`, `addedAsMember` en
  metadata. `createDefaultServiceTeamsForRetreat` exenta (semilla); `leaderSyncService` no se
  audita (sincronización derivada de las acciones manuales de ambos lados).

### Hallazgo de la tanda — §25.3 confirmado empíricamente en tests

`shiftDay` corre dentro de `AppDataSource.transaction`; los `void logCreate` de los creates
previos (mismo tick) dejan microtasks pendientes que aterrizan dentro de la ventana
transaccional y revientan el commit (`TransactionNotStartedError`) con better-sqlite3. En prod
el request boundary HTTP da margen, pero **encadenar create+transacción en el mismo tick es
vulnerable**. En tests: flush con `waitForLogs` antes de abrir la transacción (patrón ya en
`scheduleAudit.test.ts`). Regla vigente: el log se dispara fuera de la transacción.

### Verificación de la tanda P2

- 10 suites de auditoría juntas: **55/55** (mensajería 29 + P1 5 + bloque A 10 + bloque B 11).
- Regresión de los servicios tocados: 18 suites, **381/381** (lotes: 12 directas 170 + 6 con
  fixtures 211).
- Keystone `auditLocaleCoverage.test.ts` 6/6 con las 25 acciones y 5 recursos nuevos;
  labels es+en y badges en `DomainAuditView.vue`.
- `pnpm --filter api build` + `grep __dirname dist/index.js` = 2 (shim legítimo);
  `pnpm --filter web build` OK.
- No determinismo cazado en la propia tanda: `publicSignup` devuelve los slots en orden de
  DB, no en el pedido — el assert de `slotIds` compara como conjunto.

### Bloque C — inventario, playeras, CRM y preparaciones (2026-10-07)

- **Inventario** (`inventoryService`): catálogo global (categorías, equipos e ítems) con
  `retreatId` null — se comparte entre retiros; `description` viaja como `descriptionChars`.
  Ciclo del retiro: `addItemToRetreat`/`updateRetreatInventory`/`removeItemFromRetreat` con
  `itemName` + `source` (catalog/custom) en metadata, `notes`→`notesChars`, y
  `historyRows` contado ANTES del delete (la FK del historial es CASCADE). Ad-hoc:
  `addCustomItemToRetreat` marca `hasCustomCategory`. Agregados por retiro:
  `sync_catalog` (`added`), `recalculate` (`calcBase`, `items`), `copy_from_retreat` e
  `import`. `syncShirtItemsForRetreat` NO se audita: derivada del CRUD de playeras.
- **Playeras** (`shirtTypeService`): CRUD del tipo. `availableSizes` nunca entra al diff —
  viaja `sizes` en metadata; los precios por talla viajan como conteo
  (`sizePricesBefore`/`sizePricesAfter`): montos son dato financiero del retiro y con el diff
  de `name` basta el rastro. `seedDefaultShirtTypes` exenta (semilla del retiro).
- **CRM de seguimiento** (`crmService` + `crmController`): `upsertFollowUp` loguea SOLO el
  cambio de etapa (primer alta con `oldValues` vacío; repetir la etapa no deja fila) y
  `attendanceSynced` registra si confirmed/declined escribió la asistencia. Tareas: CRUD con
  `descriptionChars`. Notas: create/update exentos (trabajo vivo del equipo, como los drafts);
  el delete sí deja fila con `participantId`/`authorId`/`bodyChars` — el cuerpo nunca entra al
  log. `setDoNotContact` queda como `participant.update` con diff de `doNotContact` sólo al
  cambiar.
- **Preparaciones del equipo servidor** (`retreatPreparationService`): `generate` y
  `skipForHoliday` dejan UN agregado por retiro (metadata `{weeks, firstDate, time, created,
  cleared, clearedDocs, clearExisting}` y `{breakDate, reason, shiftedSessions,
  breakEntryId}` respectivamente; ninguna fila por sesión). CRUD de sesión con
  `descriptionChars` y `cascadeDocuments` contado ANTES (FK CASCADE). Documentos: el markdown
  y la url (data:URL inline o S3) NUNCA entran al log — `sizeBytes`, `contentChars`,
  `contentChanged`, `storage` informan tamaño y naturaleza. `resync_docs` agregado.

#### Hallazgos de la tanda C

- **§25.3 rompió una suite pre-existente**: `shirtTypeService.test.ts` ("with [] clears every
  override") fallaba con `TransactionNotStartedError` — el `logCreate` fire-and-forget del
  create aterrizaba en la ventana transaccional del update siguiente sobre la conexión única
  better-sqlite3. Verificado empíricamente contra master (pasa) y con flush (pasa). Fix:
  helper `awaitAuditRow` en la suite pre-existente antes de los updates con `sizePrices`.
  Regla para futuras tandas: **al instrumentar un servicio, revisar las suites pre-existentes
  que encadenan create→update-transaccional y añadir el flush.**
- **Warning `EntityMetadataNotFound` de la sync de playeras: pre-existente.** Ocurre igual en
  master (verificado: 2 apariciones) — en test-env `syncShirtItemsForRetreat` sin `dataSource`
  explícito no resuelve la metadata y el catch de `syncInventoryShirts` lo traga desde siempre;
  las suites existentes pasan `getTestDS()` explícito. No es regresión de esta tanda.
- Nombres de tabla para el `beforeEach`: `participant_notes`, `participant_followups`,
  `crm_tasks` (plurales irregulares — `clearTestData` no las cubre).

#### Verificación de la tanda C

- 4 suites de auditoría nuevas: **15/15** (inventario 3, playeras 3, CRM 4, preparaciones 5).
  Total del proyecto: 14 suites, **70/70**.
- Regresión de los servicios tocados: **164/164** — shirtTypeService 35, inventoryService 72,
  crmService 21, retreatPreparationService.simple 20, crmNotesAuthz 11, crmParticipantScope 5.
- Keystone `auditLocaleCoverage.test.ts` 6/6 con los 10 recursos nuevos; labels es+en y
  badges en `DomainAuditView.vue`.
- `pnpm --filter api build` + `grep __dirname dist/index.js` = 2 (shim legítimo);
  `pnpm --filter web build` OK. Imports muertos de `DomainAuditAction` removidos
  (shirtTypeService, crmService).
- Las acciones `copy_from_retreat`, `import` y `resync_docs` quedaron instrumentadas y
  cubiertas por locales/keystone, pero sin caso de test propio (flujos derivados mayores).

## Revisión formal y arreglos post-PR (2026-10-07)

El PR #5 (43 archivos, +5.422/−116) pasó por code-review formal + CI. El CI destapó un bug
latente de 8 meses: **este PR fue el primero que corrió CI desde el 2026-02-09** (el último
verde de master es de esa fecha), y el runner usa `node-version: '20'`.

### El bug de la regex data:URL (fallo de CI)

`RangeError: Maximum call stack size exceeded` en el test pre-existente "rechaza archivo >
10MB" de `responsabilityAttachment.simple.test.ts`: `/^data:([^;]+);base64,(.+)$/.exec()`
sobre un payload de ~14MB revienta el stack del V8 de **Node 20 en Linux** (en Node 24/25 y
macOS pasa — por eso nunca se vio local). El test y el servicio compartían la regex. Fix:
string slicing (`indexOf(';base64,')` + `slice`) en `responsabilityAttachmentService.parseDataUrl`
(lanza `AttachmentValidationError`) y en el helper del test (devuelve null). La misma regex
vive en **5 archivos más** — quedan como follow-up (ver abajo).

### Hallazgos de la revisión (0 HIGH, 5 MED, 6 LOW) y su destino

| Hallazgo | Severidad | Destino |
|---|---|---|
| `description` de la secuencia entra al diff del update | MED (privacidad) | **Arreglado**: fuera del allowlist; `descriptionChars` + `descriptionChanged` en metadata (mismo patrón que attachments/inventario) |
| `description` del attachment entra al diff | MED (privacidad) | **Arreglado**: fuera de `ATT_AUDIT_FIELDS`; `descriptionChars` (+ `descriptionChanged` en update) en metadata |
| `intention` del slot de Santísimo entra al diff | MED (privacidad pastoral) | **Arreglado**: fuera de `SLOT_AUDIT_FIELDS`; helper renombrado a `slotTextMetadata` emite `notesChars` e `intentionChars` |
| `run_now` sin actividad genera fila por alta de participante | MED (ruido) | **Arreglado**: `runForRetreat` toma `trigger: 'manual' \| 'participant_create'`; manual SIEMPRE loguea (registra intención), auto sólo con actividad; `metadata.trigger` siempre |
| Semilla de retiro genera N filas `copy_to_retreat` | MED (ruido) | **Arreglado**: `copyToRetreat` toma `options.audit` (default true); `copyAllActiveTemplatesToRetreat` pasa `{audit: false}` — el `retreat.create` de la semilla ya cubre el evento |
| `removeMember` loguea aunque no hubiera membresía | LOW | **Arreglado**: log sólo si `(removed.affected ?? 0) > 0` |
| LOWs 6, 8–11 | LOW | **Follow-up** (ver abajo) |

### Verificación de los arreglos

- 7 suites afectadas: **111/111** (messageSequenceAudit 15 —incluye test nuevo del
  discriminador trigger—, santisimoAudit, serviceTeamsAudit, globalMessagingAudit,
  responsabilityAttachment.simple, messageSequenceProcessScope, globalMessageTemplateService).
- `pnpm --filter api build` OK, `grep -c __dirname dist/index.js` = 2.
- Nota: `tsc --noEmit` pelado del api falla con cientos de errores pre-existentes en archivos
  no tocados (authController, tableMesaService, …) — el gate real es el build de Vite/Rollup
  (lo que corre el CI); ningún error cae en los archivos/rangos editados.

### Follow-ups abiertos

1. **Réplicas de la regex data:URL** en `retreatScheduleService.ts`, `imageService.ts`,
   `retreatPreparationService.ts:100`, `aiChatService.ts`,
   `bundleS3Streaming.simple.test.ts`: mismo fix de string slicing. No explotan hoy (payloads
   chicos o rutas sin >10MB), pero es la misma trampa.
2. **LOWs de la revisión** (6, 8–11): detalles de consistencia de metadata menores que no
   bloquean el merge.
3. **Skill `troubleshooting` §nueva**: la trampa "regex sobre payloads de MBs explota el stack
   en Node 20/Linux pero no en Node 24/macOS" — documentar cuando se haga el siguiente pase.
4. **CI desatendido 8 meses**: considerar un workflow `schedule` semanal sobre master para que
   el próximo PR no herede 8 meses de deuda silenciosa.
5. **Flaky `telemetryClientError.simple`**: `socket hang up` bajo cierta concurrencia de workers
   (ver subsección de arriba); investigar el singleton compartido si vuelve a dar rojo en CI.

### El OOM del main de jest (segundo fallo de CI, 2026-10-07)

Tras el fix de la regex, el `Test API` volvió a morir a los ~11 min — sin ningún test en rojo:
`FATAL ERROR: Ineffective mark-compacts near heap limit` (exit 134). **El proceso MAIN de jest
retiene los resultados de todas las suites hasta el summary final**; con la suite actual
(~286 archivos) su heap cruza 3.3GB y revienta. Reproducido localmente igual (3.5GB, Node 25),
con y sin `--maxWorkers=2 --workerIdleMemoryLimit=512m` — esas flags no tocan al main.

Verificación por el dato (local): `--shard=1/2` y `--shard=2/2` por separado pasan sin OOM
(141-143 suites cada uno, ~180s). Fix: matrix de 2 shards en `ci.yml` — cada shard es un main
nuevo con la mitad de la suites (~1.7GB pico). Es la misma muerte que la memoria
`reference_api_full_jest_suite_sigabrt` documenta para corridas locales completas.

**Segundo episodio (2026-10-09): el shard solo era fronterizo.** El main del shard 1/2 picó a
3.39GB contra el límite de ~4GB de Node 20 en el runner — una corrida verde, la siguiente murió
con el mismo exit 134 (varianza de GC al borde del acantilado; el commit intermedio no añadió
suites). Fix definitivo (`45ad89d6`): el step del CI invoca `npx jest` directo con
`NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=6144"` — el script `test` del
package.json **hardcodea `NODE_OPTIONS`**, así que un override por `env:` a través de
`pnpm --filter api test` se descarta en silencio. El heap sube solo para el main (el retenedor);
los workers no cambian.

Hallazgo colateral: `telemetryClientError.simple.test.ts` ("accepts a report without a session")
falló 1 vez con `socket hang up` bajo una combinación específica de workers y pasa solo (11/11);
supertest sin puerto fijo apunta a un singleton compartido entre suites vecinas del mismo worker
(¿`AppDataSource` cerrado por un `afterAll` ajeno?). Flaky estructural pre-existente, no del PR.

## Arreglos pre-merge de las revisiones (2026-10-08)

Dos revisiones formales sobre el PR #5 (`/code-review` + una segunda) dieron 6 arreglos
pre-merge. Los «menores» de ambas quedaron como follow-ups (abajo); los descartados con motivo:
la doble fila de `copyToRetreat` es por diseño (el clon deja además su `message_sequence.create`
con `clonedFrom`), el shard SÍ funciona (143 suites por shard) y `parseDataUrl` sí rechaza tipos
con parámetros (`ALLOWED_MIMES` no hace match).

| Hallazgo | Severidad | Resolución |
| --- | --- | --- |
| El motor no contaba envíos fallidos: un retiro con todos los envíos caídos no dejaba rastro en `cron_run`/`run_now` | MED (forense) | **Arreglado**: `failedPerRetreat` atraviesa `processDue`; metadata `failed` en ambos eventos; la corrida automática con SOLO fallos también deja `run_now` (`failed > 0` en la condición). 2 tests nuevos con mock de `sendEmail` compartido |
| `updateShirtType`/`deleteShirtType` disparaban el log ANTES de `syncInventoryShirts` | MED (§25.3) | **Arreglado**: sync primero (`await`), log después — el INSERT fire-and-forget podía aterrizar en la ventana transaccional de la sync y el catch-all de ésta se lo tragaba (inventario desincronizado en silencio) |
| Snapshot parcial del doc de preparación: `before` solo traía 2 de 5 campos del allowlist | MED (forense) | **Arreglado**: `diffFields` trata `undefined` como cambio → cada edición reportaba kind/mimeType/sortOrder "cambiando" (diffs fantasma). `before` cubre los 5 campos de `PREP_DOC_AUDIT_FIELDS` |
| `crmService` TS2339 ×3: `audit` asignada solo en el closure de la transacción → TS la estrecha a `never` | MED (gate) | **Arreglado**: la transacción DEVUELVE `{ savedRow, audit }`. Funcionaba en runtime; el CI no lo veía porque no corre `tsc` sobre el api — el gate real es `pnpm --filter api build` |
| `generateSlots` con `clearExisting` no contaba los signups públicos que mueren en cascada | MED | **Arreglado**: `cascadeSignups` contado ANTES del delete (misma regla que `deleteSlot`); test sembrando un signup en el slot preexistente |
| Delete de plantilla global marcaba `messageChanged: true` (helper con `previous=null`) | LOW | **Arreglado**: metadata del delete = solo `messageChars`; nada "cambió" en un delete y la flag dejaría de filtrar |

Verificación: 10 suites afectadas — **208/208** (messageSequenceAudit 17, incluye los 2 tests
nuevos del conteo de fallos); `pnpm --filter api build` OK; `grep -c __dirname dist/index.js` = 2.

### Follow-ups de la segunda revisión (menores, post-merge)

- `clonedFrom` falseable desde el request (campo del create sin validar el origen)
- `clearOtherDefaults` sin registro propio en el toggle de default
- Nombres PII en metadata vs «PII mínima» declarada en el PR
- iniciar/completar una preparación no-op deja fila de auditoría
- copy-all a comunidad: 1 fila de log por plantilla
- service team move sin registro si el miembro ya pertenecía al equipo
- approve/reject esperan el log de auditoría → 500 si el INSERT falla
- helper de tamaño de texto copiado ~6× (ya listado en LOWs de la primera revisión)
- `doNotContact` es global del participante pero se loguea con el retreatId de donde se activó

### Nota pre-merge

El merge a master **despliega a producción automáticamente** (`deploy-production.yml` corre con
cada push a master).

**Master avanzó antes del merge (2026-10-09, push `76bb2fd2`)**: ~30 commits que esta rama no
tenía (duplicados M1–M4, palancas-quick-phone-edit, sequences-inbox-filters, 3 fixes de import),
con overlap en 6 archivos del PR (`messageSequenceService.ts`,
`messageSequenceController.ts`, `participantMergeService.ts`, `MessageSequencesView.vue`,
`apps/web/src/locales/{en,es}.json`). `git merge-tree` contra ese master da merge **limpio**
(sin conflictos); la rama se integró con `origin/master` y el CI corrió la combinación antes
del merge — el verde anterior del PR era contra master viejo.

**Doble registro de auditoría en el merge de duplicados (hallazgo de integración)**: el M4 de
duplicados (`b03ea39a`) registra `community.participant.merge` en `community_audit_log` desde
el `communityController`; esta rama registra `participant.merge` en `domain_audit_log` desde el
`participantMergeService` (al que ese controller llama). Tras el merge, cada fusión desde la
vista de comunidad deja fila en las **dos** tablas. No rompe nada (mecanismos independientes);
unificar en `domain_audit_log` —el que alimenta `/app/audit`— queda como follow-up post-merge.

Tras el merge, el `git pull` del checkout principal puede chocar con trabajo sin commitear de
otras sesiones.

## Reproducir el diagnóstico forense de hoy

```bash
# Copia de la base (nunca el archivo vivo): db-pull + cp de los 3 archivos a /tmp
sqlite3 -header -column /tmp/emaus-prod-analysis/database.sqlite "
SELECT substr(id,1,8) id, name, isActive, createdAt, updatedAt
FROM message_sequences WHERE retreatId='<retreatId>' ORDER BY updatedAt;"
# Mensajes re-agendados a mano (scheduledFor == createdAt con milisegundos):
SELECT substr(sequenceId,1,8) seq, status, scheduledFor, createdAt
FROM scheduled_messages WHERE retreatId='<retreatId>' AND scheduledFor=createdAt;"
```
