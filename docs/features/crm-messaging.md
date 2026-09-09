# CRM de mensajería (segmentos, secuencias, pipeline)

Capacidades tipo CRM construidas sobre el sistema de plantillas existente. Branch: `worktree-crm-messaging`.

## Decisión de canal de WhatsApp (clave)

Requisito: **cada usuario envía desde SU propia cuenta de WhatsApp** (no un número central).

- ❌ **API oficial de Meta**: descartada — es centralizada (1 número de negocio); un número personal no puede estar en la app y en la API a la vez.
- ⚠️ **Baileys multi-sesión**: único camino 100% desatendido multi-cuenta, pero frágil y va contra los ToS (riesgo de ban del número personal). No se usó.
- ✅ **Deep-link asistido** (`api.whatsapp.com/send`): elegido. Cada quien envía desde su WhatsApp con 1 clic. Cero riesgo/costo. **Consecuencia transversal**: por WhatsApp nada es desatendido ni recibe respuestas → lo "automático" se materializa como **bandeja de pendientes** que el coordinador despacha. Email sí es 100% desatendido (SMTP).

## Fases

### Fase 1 — Cola WhatsApp asistida + segmentos guardados
- `SavedSegment` (filtros con nombre, scope retiro/comunidad). Tipo compartido `SegmentFilters` en `@repo/types`.
- API: `/saved-segments` (CRUD + `/preview`).
- UI: `WhatsAppSendQueue.vue` (cola de envío 1-clic con registro en `participant_communications`) + guardar/aplicar segmentos desde `ParticipantList.vue`.

### Fase 2 — Motor de secuencias (drip)
- Entidades `MessageSequence` / `SequenceStep` / `ScheduledMessage`.
- `messageSequenceService` (cron horario, patrón de `santisimoReminderService`): enrolamiento idempotente por audiencia (fuente `retreat_participants`), fecha TZ-aware (`makeDateInTimezone`), procesamiento de vencidos — **email envía+registra; whatsapp encola**.
- Triggers: `participant_created`, `days_before_retreat`, `days_after_retreat`, `birthday`.
- Audiencia (`MessageSequence.audience`): `all` / `walker` / `server` / **`table_leaders`** (líderes/colíderes de mesa, resueltos vía `liderId/colider1Id/colider2Id` de `tables` → `getTableLeaders`). O `segmentId` para audiencia dinámica (Fase 3).
- **Destinatario por paso** (`SequenceStep.recipientTarget`): `participant` / `emergencyContact1` / `emergencyContact2`. El motor (`resolveRecipient`) usa el teléfono/email del contacto y resuelve `{participant.recipientName}` con su nombre (vía `contactKey` a `replaceAllVariables`). Se copia a `ScheduledMessage` al enrolar para que el procesamiento y la bandeja lo usen sin recargar el paso.
- API: `/message-sequences` (CRUD + `/queue` + `/run` + `/scheduled/:id/dispatch`).
- UI: `MessageSequencesView.vue` (editor de pasos — incluye audiencia y selector "Enviar a" por paso — + bandeja de pendientes que despacha al teléfono del destinatario resuelto).

### Fase 3 — Segmentos dinámicos + tablero
- `savedSegmentService.evaluateFilters`: evalúa filtros en vivo (type/attendance vía `retreat_participants`; `paymentStatus` computado en memoria; tags; búsqueda). Usado como **audiencia dinámica** de secuencias (`MessageSequence.segmentId`).
- `CommunicationDashboardView.vue`: totales por canal, cobertura, actividad 30 días, top plantillas, pendientes.

### Fase 4 — Pipeline de seguimiento + tareas
- `ParticipantFollowUp` (estado `pending/contacted/confirmed/no_answer/declined` + nota + auditoría, único por participante-retiro; generaliza `CommunityMember.state`).
- `CrmTask` (recordatorios del coordinador con vencimiento).
- API: `/crm` (`/follow-ups` upsert, `/tasks` CRUD). UI: `FollowUpView.vue`.
- **Fuera de alcance**: bandeja 2-way de email (requiere ingesta IMAP/inbound) y 2-way de WhatsApp (inviable con deep-link). El seguimiento se registra manualmente.

## Robustez y observabilidad (motor)
- **Participante cancelado**: `processDue` verifica `retreat_participants.isCancelled` y marca el mensaje `cancelled` (no envía). Cubre cancelaciones posteriores al enrolamiento sin hookear cada punto de cancelación.
- **Editar sin re-enviar**: `syncSteps` preserva el `id` de los pasos existentes (el front lo envía); así el `unique(stepId, participantId)` se mantiene y editar una secuencia NO re-envía a quien ya recibió. Los pasos quitados se borran (cascade cancela sus pendientes).
- **Secuencia desactivada**: `processDue` hace `innerJoin` con la secuencia y filtra `isActive = true` → desactivar pausa los pendientes (se retoman si se reactiva).
- **Reintentos**: ante fallo SMTP, `attempts++` y status `failed`; `processDue` reintenta los `failed` con `attempts < MAX_ATTEMPTS` (3).
- **Snapshot al encolar/enviar**: `resolvedContent`/`resolvedContact`/`recipientName` guardan el envío resuelto; la bandeja despacha desde el snapshot (no recalcula variables aunque la plantilla cambie después).
- **Observabilidad**: `getStatsByRetreat` (conteo por secuencia y estado) + `getIssuesByRetreat` (omitidos/fallidos con motivo). Endpoint `GET /message-sequences/retreat/:id/stats` → `{ stats, issues }`. La UI muestra badges por secuencia y una sección de "Mensajes con problema".
- **Bandeja de WhatsApp**: `listQueued` enriquece cada ítem con `followUpStatus` (estado de seguimiento del participante, vía `ParticipantFollowUp`). Botón "Omitir" → `POST /message-sequences/scheduled/:id/skip` (`markSkipped` → status `skipped`).
- **Detalle del participante (decidir enviar/omitir)**: clic en el nombre del pendiente abre un panel con contexto. `getQueueItemDetail(id)` → `GET /message-sequences/scheduled/:id/detail` (gated por acceso al retiro vía el `retreatId` del mensaje) agrega: notas (de `retreat_participants`, fallback `participant.notes`), cartas/palancas (`palancasRequested/Received/Notes` per-retiro), estado + nota de seguimiento (`ParticipantFollowUp`), las últimas 10 comunicaciones (`participant_communications`) y la vista previa del mensaje (snapshot `resolvedContent`). El panel incluye los botones Enviar/Omitir.

## Plantillas globales de secuencias

Permiten definir una secuencia una vez y reutilizarla en cualquier retiro (espeja `GlobalMessageTemplate` → `copyToRetreat`).

- Entidades `GlobalMessageSequence` / `GlobalSequenceStep` (tablas `global_message_sequences` / `global_sequence_steps`): como una secuencia pero **sin `retreatId` ni `segmentId`** (los segmentos son por-retiro). Migración `CreateGlobalMessageSequences` (dos `CREATE TABLE` aditivos).
- `globalMessageSequenceService`: CRUD + `copyToRetreat(globalSeqId, retreatId)` que **clona** la secuencia en el retiro reutilizando `messageSequenceService.createSequence({ ..., isActive: false })` → **queda INACTIVA** (el coordinador la revisa y activa; evita envíos inesperados). NO hay auto-siembra al crear el retiro.
- API `/global-message-sequences` (CRUD + `/:id/toggle-active` + `/:id/copy-to-retreat`). Autorización: reutiliza el permiso `globalMessageTemplate:*`; `copy-to-retreat` además exige acceso al retiro destino.
- UI: vista `GlobalMessageSequencesView.vue` en **Configuración Global** (`/app/settings/global-message-sequences`, superadmin) — el selector de plantilla usa las **plantillas globales** (tipos que existirán en cualquier retiro). En el retiro, botón **"Importar de plantilla global"** en `MessageSequencesView.vue` → lista las globales activas → `copyToRetreat` → la secuencia aparece inactiva.
- Notas: re-importar crea otra copia (sin dedupe; el coordinador puede borrar duplicados). La audiencia `table_leaders` es portable (se resuelve por las mesas del retiro destino). El `templateType` de cada paso se resuelve contra las plantillas del retiro al procesar (aviso de plantilla faltante ya existente).

### Pack sembrado (migración `SeedGlobalRetreatSequences`)
Migración data-only (INSERT OR IGNORE, idempotente; sin DROP) que siembra 4 plantillas globales listas para importar. Como cada secuencia tiene UN `trigger` y UNA `audience`, el flujo de un retiro se reparte así (el destinatario sí varía por paso):
1. **Bienvenida al caminante** — `participant_created` · walker: `WALKER_WELCOME` (email, +0d).
2. **Pre-retiro: palancas y confirmación** — `days_before_retreat` · walker: `PALANCA_REQUEST` a EC1 y EC2 (−21d), `PALANCA_REMINDER` a EC1 y EC2 (−7d), `WALKER_CONFIRMATION` al participante (−3d). Todo WhatsApp.
3. **Briefing a líderes y colíderes de mesa** — `days_before_retreat` · table_leaders: `TABLE_LEADER_BRIEFING` (WhatsApp, −1d).
4. **Seguimiento post-retiro (Cuarto Día)** — `days_after_retreat` · walker: `POST_RETREAT_MESSAGE` (email, +1d). El link de landing / invitación a comunidades vive en el contenido de esa plantilla.

Canales y desfases son defaults editables tras importar. Test seed-and-verify: `seedGlobalRetreatSequences.simple.test.ts`.

## Targeting y ownership (mejoras del motor)
Migración aditiva `AddSequenceTargetingAndOwnership` (ADD COLUMN). Todo testeado en `messageSequence.test.ts` (bloque "mejoras de targeting/ownership").
- **Opt-out / no-contacto** (`participants.doNotContact`): `enrollSequence` no enrola y `processDue` salta (`skipped`). Toggle desde el panel de detalle de la bandeja vía `POST /crm/retreat/:id/participants/:pid/do-not-contact`.
- **Pasos condicionales** (`sequence_steps.condition`, `simple-json` = `SegmentFilters`): el participante debe cumplir los filtros para recibir ESE paso; si no, `skipped` "no cumple la condición". `processDue` evalúa con `savedSegmentService.evaluateFilters` (cache por retiro+filtros dentro de la corrida). UI compacta por paso (tipo / estado de pago / confirmación).
- **Parar al responder**: `declined` (en `ParticipantFollowUp`, marcado por el coordinador) es un freno global y detiene los pendientes. **Parar al CONFIRMAR NO es un flag**: se modela como condición de paso `attendanceFilter='pending'` ("enviar solo mientras la asistencia esté pendiente"), que consulta la confirmación de asistencia real (`retreat_participants.attendanceConfirmation`) y deja de enviar en cuanto confirma o declina.
- **Ventana de gracia** (`message_sequences.maxOverdueDays`): no envía un paso vencido hace más de N días (null = catch-up histórico).
- **Tope diario por participante**: env `SEQUENCE_MAX_PER_PARTICIPANT_PER_DAY` (0 = off) → pospone (no marca) los excedentes. **Throughput**: env `SEQUENCE_PROCESS_LIMIT` (default 200).
- **WhatsApp: abrir vs enviar + ownership** (`scheduled_messages.openedAt/dispatchedBy/assignedTo`): "Abrir WhatsApp" registra apertura (`POST .../open`, sigue en bandeja); "Ya lo envié" confirma el envío real (`dispatch`, registra `dispatchedBy`). Asignación "tomar/soltar" (`POST .../assign`) + "Abrir siguiente".
- Estos campos se copian al importar una plantilla global (`copyToRetreat`); el editor global también los expone.
- **Fuera de alcance (infra)**: captura de **rebotes de email** — requiere webhook/IMAP del proveedor SMTP (no presente). Hoy un `sendEmail` que no lanza se cuenta como enviado.

## Envíos del alta movidos a secuencias + destinatarios ampliados

Los correos que antes mandaba `participantService.createParticipant` de forma instantánea **se movieron al motor de secuencias** (decisión "mover duro"): bienvenida caminante (`WALKER_WELCOME`), bienvenida servidor (`SERVER_WELCOME`), aviso de privacidad (`PRIVACY_DATA_DELETE`) y aviso al invitador/palanqueros (`PALANQUERO_NEW_WALKER`). Los bloques de envío se eliminaron del alta.

- **Destinatario por paso ampliado** (`messageRecipientTarget`): además de `participant`/`emergencyContact1`/`emergencyContact2`, ahora `inviter` y `responsibility` (+ columna `recipientResponsibility` con el nombre). `resolveRecipient` es **async**: `inviter` resuelve el servidor por `participant.invitedBy` (= nickname) en el retiro; `responsibility` resuelve al titular de `Responsability` por nombre (helper estilo `getTableLeaders`, primero por `priority`). Migración aditiva `AddRecipientResponsibility`. El front ordena "Enviar a" por más usados primero y muestra un campo de responsabilidad (datalist con las del retiro) cuando aplica.
- **Siembra por retiro**: `createDefaultMessageSequencesForRetreat` crea 4 secuencias `participant_created` offset-0 **activas** (bienvenida caminante/servidor → participante, privacidad → all, palanquero → inviter), respetando `notifyParticipant`/`notifyInviter` (false ⇒ inactivas). Se invoca en `retreatService.createRetreat` y se hace **backfill** de retiros existentes con la migración `SeedRetreatRegistrationSequences` (idempotente por `(retreatId, name)`).
- **Inmediatez**: tras commitear el alta, `participantService` dispara best-effort `messageSequenceService.runForRetreat(retreatId)` (enrola + `processDue`) para que los pasos offset-0 salgan al momento, sin esperar al cron horario. En importación masiva se omite (lo procesa el cron).
- ⚠️ El aviso de privacidad/GDPR ahora depende de que su secuencia esté activa (se siembra activa por eso). Si se desactiva, deja de enviarse.

## Tres ejes: enrolamiento, "enviar a" y audiencia de plantilla

Aclaración de diseño (caso palanquero): son **tres conceptos distintos**, no uno.
- **Enrolamiento / "a quién aplica"** (`MessageSequence.audience`): quién se enrola = el **sujeto** (`{participant.*}`). Valores: `all/walker/server/table_leaders/responsables` (+ `segmentId`). `responsables` enrola a los titulares de cualquier responsabilidad (`getResponsibleParticipants`).
- **"Enviar a"** (`SequenceStep.recipientTarget`): a qué **contacto** llega cada paso. **Flexible** (no limitado por el enrolamiento). Valores: `participant`, `emergencyContact1/2`, `inviter`, `tableLeader`, `responsibility` (+ `recipientResponsibility`).
  - `inviter`: usa los campos del propio participante (`inviterCellPhone/Email/Home/Work`); si falta el teléfono y hay `inviterEmail`, busca el servidor por ese email. `contactKey='inviter'` → `{participant.recipientName}`/`{participant.inviter*}` resuelven al invitador.
  - `tableLeader`: `RetreatParticipant.tableId` del enrolado → `TableMesa.liderId/colider*` → ese participante.
  - `responsibility`: titular de `Responsability` por `recipientResponsibility` (nombre). "Todas" se modela con un paso por responsabilidad.
- **Audiencia de la plantilla** (`MESSAGE_TEMPLATE_AUDIENCE_BY_TYPE`): clasifica plantillas — `walker/server/family/general/table_leader/responsible`. `TABLE_LEADER_BRIEFING→table_leader`, `PALANQUERO_NEW_WALKER→responsible`. El editor **filtra las plantillas por la audiencia del DESTINATARIO** ("enviar a"), no del enrolamiento: `inviter`/`emergencyContact*`→family, `tableLeader`→table_leader, `responsibility`→responsible, `participant`→audiencia del enrolamiento (+general siempre; audiencia `all`→sin filtro).

Caso palanquero coherente: disparador=registro de caminante (enrolamiento=caminantes) + enviar a=responsabilidad "Palanquero 1/2/3" + plantilla `PALANQUERO_NEW_WALKER` (audiencia=responsable). Las semillas crean "Aviso al invitador" (inviter, activa si `notifyInviter`) y "Aviso al palanquero" (responsabilidad Palanquero 1/2/3, activa si `notifyPalanqueros`).

## Resolución de destinatario y contenido (motor)
- **Teléfono con fallback**: `resolveRecipient` toma `cellPhone || homePhone || workPhone` para participante, líder/colíder de mesa y titular de responsabilidad (antes solo `cellPhone`). El invitador ya tenía este fallback (+ búsqueda del servidor por `inviterEmail` si no hay teléfono).
- **Destinatario indirecto inexistente → cancelado en silencio**: si el destinatario es `inviter`/`tableLeader`/`responsibility`/`emergencyContact*` y el participante **no tiene ese vínculo** (sin nombre ni contacto), el mensaje se marca `cancelled` con motivo claro (`el caminante no registró invitador`, `sin titular para la responsabilidad`, etc.) y **no aparece en "Problemas"** (no es un error a corregir). Si el destinatario existe pero le falta teléfono/email, sí queda `skipped` (accionable).
- **Apodo con fallback**: `{participant.nickname}` cae al **primer nombre de pila** cuando no hay apodo (no deja el saludo en blanco). Aplica a todas las plantillas que saludan con nickname. `findEmptyVariables` ya no lo marca como vacío.
- **Contexto `{table.*}` en el motor**: el briefing de mesa usa variables `table.name`/`table.walkersCount`/`table.walkersRoster`. El motor arma ese contexto (`buildTableData`: mesa del líder + roster de caminantes con teléfonos y contactos de emergencia) y lo pasa a `replaceAllVariables`. Se usa tanto al encolar (`processDue`) como al renovar la bandeja.

## Acciones de la bandeja (mensajes programados)
- **Reenviar** (`retryScheduled`): re-encola un mensaje (`pending`, `attempts=0`, vencimiento ahora) tras corregir el dato que lo hizo fallar/omitir. Endpoint `POST /scheduled/:id/retry`.
- **Descartar** (`discardScheduled`): lo saca de la lista (`cancelled`) sin enviarlo ni reaparecer. `POST /scheduled/:id/discard`.
- **Acciones masivas** (`bulkResolveIssues`): "Reenviar todos" / "Descartar todos" los `failed`/`skipped` de un retiro en un solo UPDATE. `POST /retreat/:id/issues/bulk`.
- **Renovar con plantilla actual** (`regenerateQueuedForRetreat`): re-resuelve el snapshot (`resolvedContent`/`resolvedContact`/`recipientName`) de los `queued` contra la plantilla vigente, sin cambiar su programación. Útil tras editar una plantilla. `POST /retreat/:id/regenerate-queue`.
- **Despacho asistido por id**: `dispatch` (marca enviado), `open` (registra apertura), `assign` (tomar/liberar = `assignedTo`, marcador de coordinación, NO candado ni filtro de envío).

## Candado anti-correos-reales (no producción)
- `EmailService.isSmtpConfigured()` devuelve `false` fuera de producción (`NODE_ENV !== 'production'`) **aunque haya SMTP completo**, salvo `ALLOW_REAL_EMAILS=true`. Evita que dev/staging (DB suele ser copia de prod con emails reales) envíe correos al procesar secuencias. Documentado en `apps/api/.env.example`. Prod fija `NODE_ENV=production` (ecosystem/deploy).

## UI de secuencias (`MessageSequencesView`)
- **3 pestañas**: Secuencias (lista + acciones Ejecutar/Importar/Nueva), Pendientes (bandeja WhatsApp) y Problemas (omitidos/fallidos con motivo + "Cómo corregir"). Barra de tabs `flex-1` en móvil (sin scroll horizontal).
- **Pendientes y Problemas**: buscador (nombre/plantilla/destinatario), orden (fecha/recientes/nombre/tipo/estado) y paginación (10/pág). En Pendientes, filtro **Mostrar: Todos / Míos / Sin asignar**. "Abrir siguiente" respeta el filtro/orden/búsqueda actual.
- **Móvil**: las acciones de barra (marcar enviado al abrir, ordenar, filtrar, renovar, abrir siguiente, reenviar/descartar todos) se agrupan en un menú **⋮** al lado del buscador; las acciones por mensaje quedan en una sola fila (Abrir = ícono, "Enviado").
- **Detalle del participante**: el nombre es clickeable tanto en Pendientes como en Problemas (panel con seguimiento, mensaje, palancas, notas, comunicaciones, opt-out).
- **Canal por defecto = WhatsApp** al agregar pasos (editor por-retiro y global); el pack global se siembra todo en WhatsApp.

## Migración consolidada del feature
- Todo el esquema + seed del feature está en **`20260612130000_CrmSequencingSchemaAndSeed`** (una sola migración): columnas de targeting/ownership, tablas globales con sus columnas finales, pack global (10 secuencias), backfill de secuencias de registro por retiro, mejora de textos de palanca/clausura para familiares y siembra de la clausura por-retiro. Las tablas base (`CreateSavedSegments`/`CreateMessageSequences`/`CreateFollowUpAndTasks`) quedan aparte (commiteadas).

## Notas de implementación
- **Registros tardíos (catch-up, decisión de diseño)**: `processDue` toma todo lo vencido (`scheduledFor <= now`, sin límite inferior). Si un participante se enrola después de la fecha de un paso "X días antes", el mensaje se dispara de inmediato; varios pasos vencidos se disparan juntos. Se eligió este comportamiento a propósito (no hay ventana de gracia). Si se quisiera cambiar, el punto único es el `where` de `processDue` (filtrar por antigüedad) o marcar `skipped` en `enrollSequence` cuando `scheduledFor` ya pasó.
- `participant.type` es **virtual**; la fuente per-retiro de type/isCancelled es `retreat_participants` (las queries de audiencia lo usan).
- Resolución de variables en backend vía `@repo/utils` `replaceAllVariables` (acepta `contactKey` para resolver el destinatario contacto-de-emergencia).
- Tabla real `participants` (plural) — las FKs de las migraciones deben usar `"participants"`, no `"participant"` (los tests con `synchronize` no detectan FKs colgadas; usar la migración real para validar).
- Las migraciones con `DROP TABLE` en `down()` declaran `transaction = false` (guard `sqliteSafePattern`). Desde 2026-09-08 el runner **obedece** ese flag (`database/transaction-policy.ts`): antes lo ignoraba y el arranque del API las envolvía en transacción, anulando el `PRAGMA foreign_keys = OFF`.
- Navegación: rutas bajo `/app/settings/*` + `/app/follow-up`, items en `Sidebar.vue`.

## Ayuda al usuario
- Sección "Comunicación (CRM)" en la Ayuda in-app (`/app/help/crm`): índice en `apps/web/src/config/helpIndex.ts` (key `crm`) + contenido en `apps/web/src/docs/{es,en}/crm.md`. Aparece como ayuda contextual en las vistas de secuencias, tablero y seguimiento.

## Tests
- Backend: `savedSegment.test.ts`, `messageSequence.test.ts` (incl. audiencia `table_leaders`, contacto-de-emergencia, bandeja + omitir, detalle; **retry/discard, bulkResolveIssues, regenerateQueuedForRetreat, destinatario indirecto inexistente → cancelado en silencio**), `crmService.test.ts`, `messageSequenceSchema.simple.test.ts`.
- `sequenceRecipientsAndSeed.test.ts`: invitador (campos del participante + fallback email→teléfono), **fallback de teléfono celular→casa→trabajo**, tableLeader, responsibility, **briefing de mesa resolviendo `{table.*}` con el roster**, seed de registro.
- `messageVariables.test.ts`: `replaceAllVariables`/`findEmptyVariables` incl. **fallback de apodo→primer nombre** y **contexto `{table.*}`**.
- `emailDevGuard.simple.test.ts`: candado anti-correos-reales (dev/test no envían aunque haya SMTP; prod sí; `ALLOW_REAL_EMAILS=true` libera).
- `seedGlobalRetreatSequences.simple.test.ts`: seed-and-verify del pack global (10 secuencias) de la migración consolidada.
- Plantillas globales de secuencias — Backend: `globalMessageSequence.test.ts` (CRUD, syncSteps, `copyToRetreat` clona inactiva con pasos) + `globalMessageSequenceSchema.simple.test.ts` (contrato Zod: defaults, sin `retreatId`/`segmentId`, rechazos).
- Frontend: `WhatsAppSendQueue.test.ts`; `helpIndex.test.ts`; `globalMessageSequenceStore.test.ts`; `GlobalMessageSequencesView.test.ts`; `messageSequenceStore.test.ts` (despacho/ownership/opt-out + **retry/discard/regenerateQueue/bulkResolveIssues**). Suite web completa verde.
- E2E (Playwright, nivel API en `apps/web/tests/e2e/global-message-sequences.spec.ts`): valida el gating de `/api/global-message-sequences` (anónimo → 401/403; `owner` sin permiso global → 403). Requiere la migración `SeedE2ETestUsers` (corre en CI). El camino anónimo se verificó también vía curl contra el server del worktree.

## Fase 5 — Tablero de seguimiento, hilo de notas e historial por persona

El coordinador llevaba el seguimiento de caminantes en Kommo (un CRM aparte): tablero de etapas,
ficha con el historial y una caja para escribir notas al vuelo. Esta fase trae eso adentro.

### Tablero (`FollowUpView.vue`, reescrita)

Cinco columnas = los cinco estados de `ParticipantFollowUp`. Sin etapas configurables y sin
migrar datos. Ruta y entrada de sidebar sin cambios (`/app/follow-up`).

- Mezcla `crmStore.followUps` con `participantStore.participants`: **quien no tiene fila de
  follow-up cuenta como `pending`**, así que el tablero arranca lleno sin sembrar nada.
- Excluye cancelados y a quien ejerció el **derecho de borrado** (`dataDeletedAt`): una ficha
  anonimizada no tiene teléfono ni correo, no se puede contactar y sólo sería ruido.
- Arrastre HTML5 nativo (no se añadió librería de DnD) + `useTapAssign` para táctil, que es la
  única ruta que funciona en el teléfono. `useDragState` no se usa: guarda un tipo
  `'server' | 'walker'` que aquí no aplica; el id arrastrado se lleva en un `ref` local.
- Movimiento optimista con reversión si el POST falla, buscador, filtro por tipo, filtro por
  cartas y render por tandas de 50 (un retiro grande llena la primera columna).

### Sincronización con la confirmación de asistencia (decisión con efecto colateral)

`upsertFollowUp` es el punto único de cambio de etapa, así que ahí cuelga todo:

- `confirmed` → `retreat_participants.attendanceConfirmation = 'confirmed'`; `declined` →
  `'declined'`. **Sólo avanza**: mover la tarjeta hacia atrás NO revierte la asistencia (reabrir
  el seguimiento de alguien que ya confirmó no significa "ya no viene").
- ⚠️ **Mover una tarjeta a Confirmó apaga recordatorios**: los pasos con
  `condition.attendanceFilter = 'pending'` dejan de enviarse. Es el comportamiento buscado, y la
  UI lo dice con un toast explícito; el efecto queda registrado en el hilo con `attendanceSynced`.
- Todo en una transacción: si la sincronización falla, la etapa no se mueve. Quedar con la
  tarjeta en "Confirmó" y la asistencia en "pendiente" es justo la contradicción a evitar.

### Hilo de notas (`participant_notes`)

`ParticipantFollowUp.note` es **un** campo que se sobrescribe: no dice quién escribió qué ni
cuándo. La tabla nueva es append-only, con `kind`:

- `note` — escrita por una persona. Editable y borrable **sólo por su autor** (validado en el
  servicio; el controller traduce el `null` a 403).
- `stage_change` — escrita por el sistema, **inmutable**. Guarda `{from, to, attendanceSynced}` o
  `{milestone: 'palancas', count, threshold}`.

Los cambios de etapa viven aquí y no en `domain_audit_log` por tres razones: no hay que ampliar el
enum `DomainAuditAction` ni su columna, notas y eventos salen en **una** consulta ya ordenada, y
`attendanceConfirmation` **no tiene columna de fecha** — así que esta tabla es el único registro
de *cuándo* se confirmó.

El par `scope`/`retreatId`/`communityId` espeja `ParticipantCommunication` para que el hilo sirva
a un miembro de comunidad más adelante; hoy sólo se escribe con scope `'retreat'`.

> Registrada en **`PARTICIPANT_REFERENCES`** (`participantMergeService`) con política `repoint`.
> El guard `participantMergeReferences.test.ts` lo exigió: sin eso, fusionar duplicados dejaba las
> notas apuntando a una lápida, en silencio.

### Timeline unificado

`GET /crm/retreat/:retreatId/participants/:participantId/timeline` junta seis fuentes en un array
ordenado: notas y cambios de etapa, `participant_communications`, `scheduled_messages`
(`pending`/`queued`, para ver lo que viene), `crm_tasks`, registro/asistencia/palancas de
`retreat_participants` y `payments`.

- **Los mensajes a los familiares ya salían en esta consulta**: una petición de palanca a la mamá
  se guarda con el `participantId` DEL CAMINANTE y `recipientContactKey='emergencyContact1'`. Lo
  que faltaba era etiquetarlo por interlocutor, no traer más datos.
- Eventos sin fecha (`at: null`) = estado actual, no un punto del pasado; el cliente los pinta
  aparte. `attendanceConfirmation` cae ahí porque no tiene timestamp propio.
- `Payment.amount` es `decimal`: SQLite lo devuelve como **string**, hay que convertir.

### Panel de historial y conversaciones con los familiares

`components/crm/ParticipantTimelinePanel.vue` — panel lateral con marcado propio (no hay `Sheet`
en `@repo/ui`), lo que además esquiva el bug de `pointer-events` de los diálogos de reka-ui.

- Caja de nota siempre a la vista (`Ctrl/Cmd+Enter` para agregar).
- **Barra de contactos** (`components/crm/participantContacts.ts`): caminante, familiar 1,
  familiar 2 e invitador, con parentesco, conteo de mensajes y fecha del último. Resuelve el
  teléfono en el **mismo orden que el motor** (`cellPhone || homePhone || workPhone`) para no
  ofrecer un número distinto del que recibió el mensaje.
- **Abrir WhatsApp** → `buildWhatsAppChatLink` (`utils/phone.ts`): `api.whatsapp.com/send?phone=…`
  **sin `text`**. Sin `text` WhatsApp abre la conversación y se ve el historial real; con `text`
  abre el compositor. Hay un test que fija la ausencia del parámetro.
- Los chips de la barra filtran el hilo por `recipientContactKey` ("¿qué le dijimos a la mamá?").
- Los correos se aplanan con `convertHtmlToWhatsApp` en la vista plegada: si no, se lee
  `<p>Hola…</p>` y parece que el mensaje salió roto.

> **Límite, rotulado en la UI**: el contenido real de la conversación de WhatsApp vive en el
> teléfono del coordinador. El envío es deep-link asistido a propósito (ver la decisión de canal
> arriba), así que **no se puede importar lo que contestaron**. Emaús muestra lo que enviamos más
> las notas, y el botón lleva al hilo real. El rótulo "Lo que enviamos desde Emaús — abre WhatsApp
> para ver las respuestas" evita que se lea como un hilo incompleto por error.

### Hito de cartas (palancas): indicador, no etapa

"Recibió al menos 3 cartas" **no** es una columna del tablero: las cinco etapas son excluyentes y
describen la gestión de contacto, mientras las cartas son ortogonales (se puede tener 4 cartas y
estar en `no_answer`), son un dato derivado de un conteo, y el umbral cambia por retiro.

**El dato estaba roto.** `palancasReceived` es `TEXT` y el formulario invita a mezclar
(`placeholder="Cantidad o descripción…"`), así que había **tres criterios contradictorios**:

| Dónde | Criterio | Con `"tres cartas de su mamá"` |
| --- | --- | --- |
| `EditParticipantForm.vue` | `Number(raw) > 0` | «Pendiente» |
| `RetreatDashboardView.vue` | texto no vacío | «Recibidas» |
| `RetreatDashboardView.vue` | `parseInt`, NaN suma 0 | no la cuenta en el total |

- Migración aditiva `AddPalancasCountAndThreshold`: `retreat_participants.palancasReceivedCount`
  (integer) y `retreat.minPalancasPerWalker` (integer, null ⇒ 3 en código).
- **Backfill sin mutar nada**: rellena el conteo sólo donde el texto es un entero limpio, deja
  `NULL` los demás y **no toca el texto**. Idempotente (`WHERE palancasReceivedCount IS NULL`).
  En la base de septiembre 2026: 405 de 405 con texto quedaron con conteo, **cero** en prosa.
- Criterio único en `@repo/utils`: `parsePalancasCount`, `palancaMilestone`, `resolvePalancas`,
  `effectiveMinPalancas`. Deliberadamente estricto — `"3 de la mamá"` devuelve `null`, no `3`: un
  `parseInt` laxo es exactamente cómo nace un cuarto criterio.
- **Cuatro estados, no tres**: `unknown` (capturado como texto, nadie sabe cuántas) es distinto de
  `none` (no ha recibido). Colapsarlos era el bug de `EditParticipantForm.vue`, ya corregido.
- **Captura**: el campo "Cartas Recibidas" del formulario es numérico y escribe
  `palancasReceivedCount`. El backend mantiene `palancasReceived` **en espejo** (`String(count)`)
  para lo que aún lee el texto — la columna de la lista de palancas, exportaciones. Si sólo llega
  el texto (importaciones, clientes viejos), el conteo se deriva con el criterio único.
- **Los tres sitios ya leen lo mismo**: `EditParticipantForm.palancasStatus` y los contadores de
  `RetreatDashboardView` llaman a `resolvePalancas`. El dashboard suma **sólo conteos conocidos** y
  añade un contador propio, "Cartas sin capturar", para las fichas en prosa: antes desaparecían del
  total y a la vez contaban como "recibidas" en el contador de al lado. Guard:
  `palancasSingleCriterion.test.ts` fija que el formulario y el dashboard coincidan.
- **Un `null` en el conteo NO borra el texto.** El formulario reenvía el participante completo, y
  el listado hidrata `palancasReceivedCount = null` **explícito** en toda ficha cuyo conteo no se
  pudo derivar. Interpretar ese `null` como "poner a null" borraba el texto de palancas en
  cualquier guardado ajeno (corregir un teléfono) — justo lo que el backfill se cuidó de
  conservar. Regla: **sólo un número manda**; "sin capturar" no es una orden de borrado.
  Consecuencia aceptada: vaciar el campo numérico es un no-op (para "no recibió ninguna" se
  captura `0`, que sí es un dato). Guard: `palancasCountWritePath.test.ts`.
- **Hito en el hilo**: `crmService.recordPalancaMilestoneIfCrossed`, llamado desde
  `updateParticipant` cuando el guardado toca el conteo. Escribe **sólo al cruzar el umbral hacia
  arriba** (de 3 a 4 no genera otra entrada), es idempotente (si el conteo baja y vuelve a subir no
  se duplica), va **sin autor** (es el sistema notando un umbral, no algo que alguien dijo) y se
  **omite en importación masiva** para no llenar el hilo de ruido. El estado actual lo da el
  timeline; la entrada del hilo es el registro histórico de *cuándo* se cubrió.
  La comprobación en memoria no cierra la carrera de dos guardados simultáneos: eso lo hace el
  índice único parcial `UQ_participant_notes_palanca_milestone`
  (`ON (participantId, retreatId) WHERE json_extract(metadata,'$.milestone') = 'palancas'`),
  declarado **en la entidad y en la migración** — la DB de test la crea `synchronize` desde las
  entidades, así que sin declararlo ahí el test correría sin la restricción que protege a
  producción. El servicio traga la violación y devuelve `null`: un hito duplicado no justifica
  tumbar el guardado del participante.
- `Participant.palancasReceivedCount` es **virtual, sin `@Column`**: la columna real vive sólo en
  `retreat_participants`. Declararla en la entidad la metería en el `SELECT` de `participants`,
  que no la tiene, y la query fallaría en runtime.

### Vista previa por paso en el editor de secuencias

`POST /message-sequences/preview` con `{retreatId, participantId, templateType, channel,
recipientTarget, recipientResponsibility?}` → `{content, recipientName, recipientContact,
emptyVariables, warning}`. `messageSequenceService.previewStep` reusa `resolveRecipient` y
`resolveContent`, los mismos que usa el motor al enviar.

**Por qué es un endpoint y no un cálculo del cliente**: `resolveRecipient` es async y consulta la
base para `inviter`/`tableLeader`/`responsibility`, y `resolveContent` arma el contexto
`{table.*}` con el roster e inyecta el enlace de alta de servidores. El `previewText` anterior
sólo renderizaba **el primer paso** y pasaba `recipientTarget` como `contactKey` a secas, lo cual
es correcto sólo para los contactos de emergencia y **saludaba a la persona equivocada** en los
otros tres casos.

- `findEmptyVariables` se evalúa sobre la plantilla **cruda** y su contexto, no sobre el texto ya
  resuelto (donde las variables ya no están).
- Avisos accionables: plantilla que no existe en el retiro, destinatario sin el vínculo
  registrado, destinatario sin teléfono o sin correo según el canal.
- Selector de participante de muestra en el editor (antes era `participants[0]` fijo).
- **Fuera de alcance**: el editor de secuencias globales no tiene retiro ni participante, así que
  su preview se queda como estaba.

### Tests de la fase

- Backend: `palancasMilestone.test.ts` (13, el criterio único), `crmService.test.ts` (20 — hilo,
  autoría, inmutabilidad de `stage_change`, sincronización de asistencia en los dos sentidos, hito
  de cartas, timeline), `sequenceRecipientsAndSeed.test.ts` (bloque `previewStep`, incl. el
  invitador).
- Autorización, a nivel de controlador: **`crmNotesAuthz.integration.test.ts`** (11). Separa dos
  cosas que se confunden: acceso al retiro (403) y **autoría** — un compañero CON acceso al retiro
  sigue sin poder editar ni borrar la nota de otro, ni tocar una entrada del sistema. Incluye el
  IDOR cross-retiro en notas y timeline, y que una nota inexistente dé 404 y no 403.
- Migración: **`addPalancasCountAndThreshold.test.ts`** (8). Lo que fija es que el backfill **no
  puede perder información**: rellena los enteros limpios, deja `NULL` la prosa, no toca el texto
  ni las notas, no adivina en `"3 de la mamá"`, y el guard `IS NULL` protege un conteo ya corregido
  a mano.
- Frontend: `FollowUpView.test.ts` (columna por defecto, arrastre, reversión al fallar, filtros,
  exclusión de borrados y cancelados), `ParticipantTimelinePanel.test.ts` (interlocutores, enlace
  sin `text`, filtro por familiar, notas propias), `participantContacts.test.ts`, `phone.test.ts`,
  **`palancasSingleCriterion.test.ts`** (formulario y dashboard coinciden).
- E2E (`crm-notes-timeline.spec.ts`): gating de las rutas nuevas — anónimo y autenticado sin acceso
  al retiro, en notas, timeline y **preview** (que resuelve teléfonos y correos reales del invitador
  y los familiares, así que es superficie de fuga). Los casos con login necesitan la migración
  `SeedE2ETestUsers`, que sólo corre en CI; los anónimos corren en local.
- El mock global de `vue-i18n` devuelve la clave, no la traducción: las aserciones de texto de UI
  van contra la clave.

### Alcance no cubierto

Sólo retiro. `MemberNotesDialog.vue` y `MemberTimelineDialog.vue` (comunidad) siguen con la nota
única y el timeline de asistencias; la entidad ya trae `scope` para enchufarlos sin migración.

