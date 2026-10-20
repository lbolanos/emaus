# Spec: corrección del correo de un participante por el administrador del retiro

> SDD spec — versión 1.1 (2026-10-19). Estado: **implementada y reconciliada** contra
> 67205b48 (M1, API) y c6029a66 (M2, web) en `worktree-participant-email-change`.
> La v1.0 fue aprobada por Leonardo el 2026-10-19 (D1-D7); esta versión reescribe las
> decisiones en modo retroactivo — lo que dice es lo que está construido. Los deltas contra
> la v1.0 están en "Reconciliación 2026-10-19", al final.

**Branch**: `worktree-participant-email-change` · **Fecha**: 2026-10-19

> Repo público: sin nombres de personas, teléfonos ni correos reales.

## Problema

A los caminantes los inscribe otra persona (un servidor del equipo, un familiar), y esa persona
pone **su propio correo** en la ficha — o lo teclea mal. El resultado: la ficha queda con un
correo que no pertenece al caminante, y todo el sistema de mensajes del retiro (secuencias,
angelitos, avisos) le escribe a quien no es, o a nadie.

El problema ya está reconocido a medias: el importador de Excel detecta el "correo prestado" y se
niega a sobrescribir la ficha (`importEmailReuse.isImportNameConflict`). Pero una vez que la fila
mala **ya entró** (por import, por registro público o por alta manual), no había vía para
corregirla con lo que conlleva. Y lo que existía era una trampa:

1. **El correo era editable por API.** El update general
   (`participantController.updateParticipant`, permiso `participant:update`) aceptaba `email`,
   lo normalizaba y lo persistía (`participantService.updateParticipant` lo dejaba caer en
   `personalData`). El form de edición no lo ofrecía como campo — `formColumnsToEdit`
   (`ParticipantList`) ya excluía `email` en `nonEditableSystemKeys`, así que la ficha lo
   mostraba como texto read-only, sin input ni botón — pero el DTO viajaba igual por cualquier
   cliente con el permiso.
2. **No validaba ninguna consecuencia.** Un correo que ya usa otra ficha (en este u otro
   retiro) se aceptaba sin aviso — dentro del retiro con el mismo género revienta con el error
   crudo del índice único; fuera del retiro pasa en silencio y **siembra el bug de identidad
   global**: el próximo registro/import con ese correo reutiliza "la ficha más reciente" y
   sobrescribe a una de las dos personas (`findParticipantByEmail`).
3. **No re-vinculaba la cuenta de usuario** ni limpiaba el **overlay de comunidad**
   (`community_member.email` gana sobre el participant: si quedó con el correo malo, la
   comunidad sigue escribiendo al correo viejo aunque la ficha esté corregida).
4. **No renovaba la cola de mensajes**: `scheduledMessage` congela `resolvedContact` (con el
   correo) al encolar. Los pendientes siguen saliendo al correo viejo. El remedio existía pero
   era manual (`regenerate-queue` por retiro).
5. **No dejaba traza**: el update general no emite evento de auditoría de dominio.

## Objetivo

Que el administrador del retiro corrija el correo de un participante **por una vía única y
explícita**, que: valida colisiones contra otras fichas, limpia los overlays de comunidad que
quedaron con el correo viejo, renueva la cola de mensajes pendientes de los retiros activos, y
deja auditoría con hash de los correos. El update general deja de aceptar `email` (se quita de
la vía genérica para que las consecuencias no se salten).

## Historias de usuario

1. Como admin del retiro, abro la ficha de un caminante inscrito con correo prestado, pulso
   "Corregir correo", tecleo el correo propio de la persona y confirmo re-escribiéndolo; el
   sistema me avisa qué más tocó (overlays limpiados, cola renovada, cuenta vinculada).
2. Como admin, si el correo que pongo ya es de otra persona (en este u otro retiro), el sistema
   me lo rechaza diciendo de quién es — nunca sobrescribe ni fusiona en silencio.
3. Como admin, si el correo corregido ya tiene cuenta de usuario y la ficha no tenía vínculo,
   la ficha queda vinculada (mismo criterio que el alta), y el evento queda en auditoría.
4. Como coordinador de comunidad, tras la corrección los mensajes de mi comunidad van al correo
   correcto (el overlay viejo se limpia solo).
5. Como servidor del equipo de mensajes, los pendientes de la cola salen al correo corregido sin
   regenerar a mano.

## Decisiones de diseño (as-built)

- **D1 — Vía única: endpoint dedicado.** `PATCH /api/participants/:id/email`
  (`participantRoutes`, antes del update general) con schema propio
  `changeParticipantEmailSchema` (`packages/types/src/index.ts`): body
  `{ email, contextRetreatId? }` — el `contextRetreatId` opcional es aditivo respecto a la
  v1.0 y alimenta el `retreatId` del evento de auditoría cuando la ficha no tiene uno fijo.
  El update general **stripea** `email` en silencio (`delete body.email` en
  `participantController.updateParticipant`, mismo patrón que `scholarshipAmount` sin
  permiso); el self-update nunca lo incluyó (`SELF_UPDATE_ALLOWED_FIELDS`). El form general
  muestra el correo read-only con dos botones de ícono: **copiar** (sin permiso — la dirección
  ya está a la vista; clipboard + toast) y **corregir** (lápiz, con permiso) que abre el
  diálogo dedicado.
  *Alternativa descartada* (en diseño): validar consecuencias dentro del update general — el
  cliente reenvía el DTO completo por spread y dispararía las validaciones sin intención; y
  mezcla dos contratos.
- **D2 — Quién puede: permiso dedicado `participant:identity:update`, concedido a superadmin y
  admin.** La v1.0 decía "Admin y Coordinator"; **el rol Coordinator no existe en la base** —
  los roles reales son globales (`superadmin`, `region_admin`, `regular`) y por retiro
  (`admin`, `treasurer`, `logistics`, `communications`, `regular_server`). En la operación,
  quien atiende inscripciones es `admin`, así que la concesión es **superadmin + admin**.
  Migración data-only idempotente
  (`20261019120000_AddParticipantIdentityUpdatePermission`), tolerante a roles ausentes. El
  permiso también entró al catálogo del frontend (`apps/web/src/utils/permissions.ts`,
  unión cerrada — sin eso el build falla).
- **D3 — Colisiones: siempre rechazo, nunca fusión.** Orden de evaluación en
  `changeParticipantEmail` (`participantService`):
  1. Igual al correo actual (case-insensitive) → no-op (`changed: false`), sin auditoría.
  2. **Excepción cónyuge primero**: comparten retiro y ambos tienen género set y distinto →
     pasa (el índice `UQ_participants_email_retreat` lo permite), y el retiro queda reportado
     en `spouseShareRetreats`.
  3. Otra ficha con `LOWER(email)` igual y nombre de otra persona (`isImportNameConflict`) →
     409 `EMAIL_OWNED_BY_OTHER` con el texto pedagógico del import: nombra al dueño y aclara
     si está "inscrito en este retiro" o "registrado fuera de este retiro" — el scope es el
     `contextRetreatId` (el retiro desde el que se corrige), no cualquier retiro que las dos
     fichas compartan.
  4. Otra ficha que parece la misma persona → 409 `EMAIL_OWNED_BY_SAME_PERSON` sugiriendo el
     flujo de fusión existente (`participantMergeService`) — dos fichas de la misma persona
     con un correo compartido rompen el reuso global y eso se arregla fusionando, no
     re-correando.
  5. Carrera contra el índice único en el save → 409 `EMAIL_UNIQUE_VIOLATION`, sin efectos
     colaterales.
- **D4 — Cuenta de usuario: link solo si la ficha no tiene.** Si existe user con ese correo
  (mismo criterio que el auto-link del alta: `LOWER(email)`) y `participant.userId` es null →
  vincular, con actualización recíproca de `users.participantId` tras el save. Si ya hay
  vínculo → no se toca (`users.email` es identidad de login, fuera de alcance). Si existe
  user con el correo VIEJO → `userWithOldEmail: true` en la respuesta: esa cuenta quedó con
  un correo que no controla su dueño; la corrección de `users.email` es flujo aparte.
- **D5 — Overlay de comunidad: limpiar los que apuntan al correo viejo.** Todas las filas de
  `community_member` del participant cuyo `email` overlay sea (lowercase) el correo viejo
  quedan en `null`, para que el fallback de `resolveMemberProfile` caiga al correo corregido.
  Va en el mismo cambio y se reporta en la respuesta y la auditoría (`overlaysCleared`).
- **D6 — Cola de mensajes: regenerar los retiros con cola viva.** Tras el cambio, corre
  `regenerateQueuedForRetreat` (remedio existente, ya auditado como
  `MESSAGE_SEQUENCE_REGENERATE_QUEUE`) por cada retiro del participant que **no** esté
  cerrado según `messageSequenceService.isRetreatClosed` (TZ-aware — no un simple
  `endDate >= hoy`), **y además** por cualquier retiro —cerrado o no— donde el participant
  tenga mensajes aún sin despachar (`pending`/`processing`/`queued`): las secuencias
  `days_after_retreat` siguen saliendo `AFTER_RETREAT_GRACE_DAYS` (30) después del fin y la
  bandeja WhatsApp vive en `queued`, así que esas filas congeladas tampoco deben salir al
  correo viejo. Las fallas de la regeneración se toleran (log + reporte `skipped`): la
  corrección no revienta por la cola. *Alternativa descartada* (en diseño): regeneración
  selectiva por participante — código nuevo para lo que el por-retiro ya resuelve.
- **D7 — Confirmación en UI: type-to-confirm.** `ParticipantEmailChangeDialog.vue` pide
  teclear el correo nuevo dos veces, muestra un resumen de consecuencias antes de aceptar y
  el resultado detallado después (una línea por efecto, o "nada más tocó"). La validación
  cliente reusa `changeParticipantEmailSchema.shape.body` (zod compartido con el server), así
  el botón habilita exactamente lo que el API acepta; el 409 se muestra inline con el
  mensaje del server. Montado desde el arranque y reseteado por watch de `open` (regla
  `MessageDialog`); sin íconos lucide.

## Contrato de la respuesta

`{ participant: { id, email }, changed, effects }` con `effects = { userLinked,
userWithOldEmail, overlaysCleared, queueRegenerated: [{ retreatId, regenerated, skipped }],
spouseShareRetreats }`. El evento de auditoría
(`DomainAuditAction.PARTICIPANT_EMAIL_CHANGE`) lleva `oldEmailHash`/`newEmailHash`
(SHA-256 truncado a 12) — nunca el correo en claro, mismo criterio que
`communityService.updateMemberProfile` — más los efectos.

## Fuera de alcance

- `users.email` y el login (corregir la cuenta de un servidor es otro flujo; D4 solo avisa).
- Fusión de fichas duplicadas (existe `participantMergeService`; D3 solo sugiere usarlo).
- El registro público y el import ya tienen sus propias mitigaciones de correo prestado.
- Correos de contacto de emergencia e invitador (`emergencyContact*Email`, `inviterEmail`):
  campos descriptivos, no identidad; se editan por el form general.
- Cambios al índice `UQ_participants_email_retreat` (los matrimonios que comparten correo
  siguen funcionando igual).

## Riesgos y mitigaciones

- **Account takeover por correo malicioso** (documentado en el skill `community-overlay`):
  quien puede poner `participants.email` puede lograr que una cuenta nueva se auto-vincule a
  la ficha (`authService.linkParticipantToExistingUser` busca por `LOWER(participant.email)`).
  El vector existía vía el update general; D1 lo cierra (strip). Quedan como mitigaciones el
  permiso dedicado (D2), la auditoría con hash y la confirmación explícita (D7).
- **PII en logs**: el evento de auditoría lleva hashes truncados, nunca el correo en claro
  (testeado explícitamente).
- **Regeneración de cola ruidosa**: `regenerateQueuedForRetreat` toca todos los pendientes del
  retiro, no solo los del participante. Aceptado (D6): renueva snapshots contra plantilla
  vigente; el evento agregado ya existe.

## Puntos de extensión

- Añadir consecuencias nuevas al cambio de correo → servicio dedicado
  (`changeParticipantEmail`), una sola puerta: validación de colisión, link de cuenta,
  overlay, cola, auditoría.
- Otros campos de identidad (teléfono ya tiene su mini-editor `ParticipantQuickPhoneEditor`):
  si algún día se les exigen consecuencias, mismo patrón de endpoint dedicado + strip del
  general.

## Reconciliación 2026-10-19 (v1.0 → v1.1)

Verificado leyendo el código de 67205b48 (API) y c6029a66 (web); anclas por archivo y
función. Lo que cambió respecto de la spec aprobada:

1. **D2 — Coordinator no existe.** La v1.0 concedía el permiso a "Admin y Coordinator"; el
   rol Coordinator no está en la base de datos. Concesión real: superadmin + admin
   (migración data-only). No se creó el rol: "administrador del retiro" ya es `admin`.
2. **D1 — el schema ganó `contextRetreatId` opcional**, y el descubrimiento de que **el campo
   nunca fue editable en el form**: `formColumnsToEdit` ya lo excluía
   (`nonEditableSystemKeys`) y la rama «Read-only field display» pintaba el **valor** como
   texto read-only — la v1.0 describía un campo editable en la pestaña Contacto que no
   existía. M2 reemplaza ese texto por un `Input` disabled + botón «Corregir correo» en una
   rama propia, fuera del gate de `columnsToEdit`, para que la dirección siga visible aunque
   el campo no sea editable. El vector de takeover era por API, no por UI. En el demo del
   mismo día el botón con texto apretaba el correo: quedó como dos botones de ícono
   (copiar, siempre; lápiz para corregir, con permiso).
3. **D3 — el orden de evaluación se fijó**: la excepción cónyuge se evalúa **primero** (la
   v1.0 la mencionaba dentro del índice pero sin orden), y se añadió el manejo de la carrera
   contra el índice único (409 `EMAIL_UNIQUE_VIOLATION` sin efectos colaterales).
4. **D6 — el gate de "retiro activo" es `isRetreatClosed` (TZ-aware)**, no el
   `endDate >= hoy` que la v1.0 esbozaba; y las fallas de regeneración se toleran en vez de
   abortar la corrección.
5. **D7 — la validación cliente reusa el schema zod del server** (en vez de una regex
   propia), y el diálogo sigue las reglas de `MessageDialog` (montado desde arranque, sin
   íconos lucide por el mock global de tests).
6. **Nada de lo descartado en diseño se construyó** — correcto: la regeneración selectiva
   por participante y la validación dentro del update general siguen descartadas por las
   mismas razones.
7. **Cierre (review de la misma fecha) — tres ajustes al as-built de D3/D6**: el scope del
   «inscrito en este retiro» del 409 se fijó al `contextRetreatId` (no a cualquier retiro
   compartido); D6 se amplió a regenerar también retiros cerrados con filas aún sin
   despachar del participant (`pending`/`processing`/`queued`); y `spouseShareRetreats`
   quedó deduplicado por retiro. Las participaciones se cargan una sola vez, antes de la
   rama de colisión.
8. **Feedback de UI del demo (mismo día)**: el botón «Corregir correo» con texto apretaba el
   campo y el correo se veía mal. El bloque pasó a dos botones de ícono `ghost` (patrón del
   lápiz de `ParticipantList`): **copiar** sin gate de permiso (clipboard + toast de
   confirmación, tolerancia al fallo del clipboard como `WhatsAppSendQueue` pero avisando,
   porque el clic fue explícito) y **corregir** (`Pencil`) con `aria-label` y el mismo gate
   `canCorrectEmail`. Keys nuevas `emailChange.copy/copied/copyFailed` en es/en.

Desviaciones menores registradas por milestone en `tasks.md` (tests de auditoría con el
mock del service en vez de `awaitAuditRow`; self-update verificado por inspección;
`onParticipantPatched` ensanchado en `ParticipantList`).
