# Mejoras al sistema de secuencias — spec 2026-09

> Spec versionada escrita ANTES de codear (regla del equipo). Estado: **en implementación**
> en el branch `feat/sequences-improvements`. Anotar las desviaciones al final al cerrar cada
> milestone. Motor y diseño actual del feature: [`crm-messaging.md`](./crm-messaging.md).

## Contexto

2026-09-12: al activar "Confirmación de camisetas (servidores)" en Buen Despacho y ejecutar el
enrolamiento, 50 mensajes quedaron `pending` con fecha futura y **invisibles en toda la UI** (solo
existe el badge "N programados", commit `b4fdcc14` en master). Eso destapó dos familias de
problemas: el tiempo del sistema es invisible (no hay vista de los programados ni de sus fechas)
y no hay control sobre tandas ya materializadas. La exploración adicional encontró bugs reales
del motor (filas atascadas, mocks en envíos reales) y fricción de UI.

Decisión del usuario: programa completo en worktree — los cuatro ejes:
**A** visibilidad del tiempo, **B** control de tandas, **C** fixes del motor, **D** calidad de
vida UI. M0 (fix del script de worktrees) fue commit directo en master (`1e366297`).

## Bases verificadas (no re-derivar)

- Motor: `apps/api/src/services/messageSequenceService.ts` (svc). Claim atómico en
  `processDue` (marca `processing` con update condicional), idempotencia por UQ
  `(stepId, participantId)` de `scheduled_messages`, anti-backfill con `isRetreatClosed`.
- Los mocks de `{community.*}`/`{table.*}` viven en `packages/utils`
  (`replaceCommunityVariables`/`replaceTableVariables` hacen `data = x || getMock()` cuando
  reciben `null`). El fallback a mock es **intencional para el preview de UI**
  (`BaseMessageTemplateModal.vue` pasa `null` a propósito) → los fixes van en el engine
  (pasar `undefined`), NO en `@repo/utils`.
- "Cancelar las pending y re-enrolar" no puede funcionar con `update`: la UQ aplica a TODAS las
  filas. Re-materializar exige **DELETE** de las pending.
- La FK `scheduled_messages.stepId` es `ON DELETE CASCADE` → quitar un paso borra hasta las
  `sent` (pérdida de auditoría) → archivado blando.
- `replaceAllVariables` solo sustituye `{community.*}`/`{table.*}` si el argumento es
  `!== undefined`; el engine hoy pasa `community=null` (svc `resolveContent`).
- La vista ya carga `templateStore.fetchTemplates(retreatId)` → el nombre legible de plantilla
  (M6-D4) no necesita backend.
- Guard de i18n: `apps/web/src/test/unit/i18nKeys.test.ts` — todo key nuevo va en ambos locales.
- `clearTestData` no lista las tablas del feature: se limpian por CASCADE en los tests nuevos.

## Milestones

### M1 — Fixes de correctitud del motor (C1-C3) · backend puro

1. **C1 filas atascadas en `processing`**
   - Rama `maxPerDay`: antes del `continue`, revertir el claim con update condicional
     `WHERE id AND status='processing'` → estado original (`pending`/`failed`).
   - try/catch del cuerpo post-claim: excepción → `status='failed'`, `attempts++`,
     `error=err.message` (mismo formato que el catch de SMTP existente). Los `continue` de
     guardas ya escriben estado y quedan fuera del try.
   - Reaper `reapStaleProcessing`: `processing` con `updatedAt` más vieja que
     `SEQUENCE_PROCESSING_STALE_MINUTES` (default 10, env-configurable) → `pending`. Corre al
     inicio del bloque del cron y de `processDue`. NO incluir `processing` en el WHERE de
     processDue (competiría con corridas concurrentes legítimas).
   - Riesgo aceptado: el reaper puede re-procesar un mensaje cuyo email salió pero que crasheó
     antes del save → doble envío en una ventana minúscula (mismo trade-off que un restart).
2. **C2 mocks a destinatarios reales**
   - `resolveContent`: pasar `undefined` como community (quitar el `null`) y `tableData ??
     undefined`. Mata el camino a mock en todo envío del motor y en `previewStep`.
   - Hidratar comunidad real: si la plantilla usa `{community.` y el retiro tiene `communityId`
     → cargar `Community` y armar data parcial `{ name, parish }` (lazy, como `{table.*}`).
   - Guardas pre-envío (accionables en Problemas): `{community.` sin comunidad vinculada →
     `skipped` "plantilla usa {community.*} sin comunidad vinculada"; `{table.` con
     `buildTableData === null` → `skipped` "sin mesa asignada (briefing de mesa)".
3. **C3 `regenerateQueuedForRetreat`**
   - Hidratar con `hydrateParticipantForTemplateVariables` antes de `resolveContent`; contar los
     saltados → retorno `{ regenerated, skipped }` (campo aditivo).

Tests: maxPerDay sin atascar; excepción → `failed` attempts=1; reaper retoma fila vieja;
`{community.*}` sin comunidad → `skipped` y con comunidad → nombre real sin "Emaús Demo";
briefing `{table.*}` a no-líder → `skipped`; regenerate con `{participant.paymentRemaining}`
→ monto real + `skipped` en retorno.

### M2 — Transiciones de estado y bulk honesto (C4-C5) · backend puro

1. **C4 máquina de transiciones**: `assertTransition(sm, target)` con mapa único:
   `queued→sent` (dispatch), `queued→skipped` (skip), `failed|skipped→pending` (retry),
   `pending|queued|failed|skipped→cancelled` (discard; nunca desde `sent`/`cancelled`),
   `assign` solo con `status='queued'`. Los 5 métodos la llaman; el controller captura la
   excepción → **409** `Transición inválida: …`. `markDispatched` además con update condicional
   `WHERE id AND status='queued'` (`affected===0` → 409, dos coordinadores a la vez).
2. **C5 `bulkResolveIssues`**: reemplazar count-then-update por
   `createQueryBuilder().update()` + `res.affected` como conteo real; `scheduledFor` y
   `updatedAt` con `new Date()` (pasa por el DateTimeTransformer); body `{ action, ids? }`
   con `ids` opcional (cap 500, `In(ids)`), validado a mano en el controller.

Tests: matriz de transiciones (dispatch desde `sent`/`pending` → error; retry desde `queued` →
error; discard desde `sent` → error); bulk con `ids` vs sin `ids`; `affected` coincide.

### M3 — Visibilidad del tiempo (A1-A5) · backend + web

1. **A1** `GET /message-sequences/retreat/:retreatId/scheduled` — server-side:
   `status` (CSV, default `pending`), `sequenceId?`, `participantId?`, `search?` (LIKE sobre
   nombre), `page` 1-based, `limit` default 50 cap 200, `order scheduled|recent`. Respuesta:
   `{ items, total, page, totalPages, timezone }` — **timezone resuelta por el servidor**
   (`resolveTz(retreat)`), el cliente nunca infiere la zona.
2. **A2** pestaña **"Programados"** en `MessageSequencesView.vue`: `activeTab` añade
   `'scheduled'`; tabla paginada con search server-side (debounce 300ms); columnas participante,
   plantilla (nombre legible), paso `#n`, fecha TZ, secuencia. El valor del key existente
   `sequences.tabPending` pasa a "Bandeja WhatsApp" (nombre interno sin cambiar).
3. **A3** `scheduledFor` pintado en la fila de la bandeja y el panel de detalle con
   `formatInRetreatTz` (`Intl.DateTimeFormat('es-MX', { timeZone, …,
   timeZoneName:'short' })`), TZ de la respuesta con fallback al store.
4. **A4** timeline de pasos: `POST /message-sequences/schedule-preview`
   (`{ retreatId, participantId, trigger, steps: [{offsetDays, sendHour}] }` →
   `{ dates, timezone }`) que loopéa `computeScheduledFor` — única fuente de verdad, nada de
   duplicar triggers/TZ en el cliente. El header de cada paso del editor muestra
   "→ 12 sep, 9:00 (CDMX)", recomputado al abrir/cambiar participante/trigger/offset/hour.
   `null` → "sin fecha (falta dato del disparador)".
5. **A5** badges clickeables: `pending` → tab Programados con `sequenceId` filtrado;
   `skipped`/`failed` → tab Problemas con chip de secuencia removible. Contador del tab
   Programados = `total` del endpoint.

Tests: `listScheduled` (filtros/paginación/timezone); `schedule-preview` (UTC exacto, reusar
casos de `computeScheduledFor`); **crear `MessageSequencesView.test.ts`** (no existe): pestaña
renderiza filas con fecha en TZ, click en badge cambia tab, timeline con mock del preview;
extender store test con `fetchScheduled`.

### M4 — Control de tandas: reprogramar y encolar ya (B1-B2) · backend + web

1. **B1** `POST /message-sequences/steps/:stepId/reschedule` — body
   `{ immediate?: boolean, date?: 'YYYY-MM-DD', hour?: 0-23 }`. Fecha **absoluta** interpretada
   en la TZ del retiro (`makeDateInTimezone`, `hour ?? step.sendHour`); update batch
   `WHERE stepId AND status='pending'` → `{ affected, scheduledFor }`. Solo `pending`:
   lo `queued` ya está materializado en la bandeja; lo terminal es historia. Gating:
   step→sequence→`callerHasRetreatAccess(seq.retreatId)` antes de mutar.
   - Fecha absoluta y NO recomputar desde `offsetDays`: la base es por-participante
     (`registrationDate` difiere) y "mover esta tanda al 20-sep" no es expresable con offsets.
2. **B2 "Encolar ya"** = B1 con `immediate: true` (`scheduledFor = new Date()`) + encadenar el
   `runNow` existente para no esperar el cron horario. No merece endpoint propio.
3. **UI**: menú "⋯" por fila/grupo de Programados + botón compacto por paso en el editor;
   diálogo date+hour (defaults = fecha sugerida y `step.sendHour`); toast con `affected`;
   aviso de catch-up si la fecha queda en el pasado (guardas `isRetreatClosed`/`maxOverdueDays`
   siguen aplicando).

Tests: solo `pending` cambia (pending/queued/sent mezclados); 9:00 CDMX → 15:00Z exacto;
`immediate` ≈ now; 404/403 del controller; vista: diálogo con defaults, submit llama API,
"Encolar ya" llama reschedule+run.

### M5 — Cambios de estructura seguros (B3-B4) · 1 migración aditiva

1. **B4 archivado de pasos (antes que B3, que se apoya en él)**
   - Migración: `ALTER TABLE "sequence_steps" ADD COLUMN "isArchived" boolean NOT NULL
     DEFAULT 0` — única migración del programa; reversible con DROP COLUMN (SQLite ≥3.35);
     sin imports de `@repo/types`; escribir completa antes del primer save (auto-run).
   - `syncSteps`: quitar un paso → `isArchived: true` (no `remove`) + **cancelar** (no borrar)
     sus `pending` con `error='paso archivado'`. `sent`/`queued`/historial intactos.
   - `enrollSequence` y listados filtran `isArchived=false`; la vista no revive archivados.
2. **B3 cambio de trigger/audiencia con filas materializadas**
   - En `updateSequence`: si cambió `trigger`/`audience`/`segmentId` → **DELETE** de las
     `pending` de la secuencia + `enrollSequence(seq)` inmediato (re-materializa con la
     semántica nueva). Respuesta del PUT incluye `cancelledPendingCount` (ad-hoc en el JSON
     del controller, no en la entity). Toast en la UI: "N mensajes re-programados".
   - Advertir, no confirmar: el editor ya es un diálogo deliberado.

Tests: syncSteps conserva sent/queued, cancela pending, step queda `isArchived=1`; enroll no
enrola archivados; updateSequence con cambio de trigger recrea pending con fechas nuevas y
devuelve el count; cambio de solo nombre no toca filas.

### M6 — Calidad de vida UI (D1-D7) · web puro

- **D1 duplicar** (local: payload de `create` con `name + ' (copia)'`, `isActive: false`,
  steps sin `id` → stepIds nuevos, no reenvía nada).
- **D2 toggle activa desde la lista** (`updateMessageSequence(id, { isActive })`, patrón del
  store global).
- **D3 refresh de stats** fire-and-forget tras `dispatch`/`skip` (el store recuerda
  `currentRetreatId`).
- **D4 `templateLabel(type)`** — nombre legible en bandeja/problemas/detalle (templates ya
  cargadas).
- **D5 `window.confirm` + toast al omitir** (mismo mecanismo que `bulkIssues`).
- **D6 bulk sobre lo filtrado** — `ids` de lo visible vía endpoint M2-C5; el confirm cuenta lo
  filtrado (hoy cuenta `issues.length`).
- **D7 `description`** truncada a 1 línea bajo el nombre en la lista.

## Orden y dependencias

```
M1 (motor) ──► M2 (estados/bulk) ──► M4 (reprogramar) ──► cierre
   │                                      ▲
   └──► M3 (visibilidad) ─────────────────┘   (M4 vive en la pestaña Programados)
M5 tras M2 (toca updateSequence/syncSteps); paralelo con M3/M4
M6 en paralelo con todo, desde el día 1
```

## Verificación

- Jest del API por milestone (`pnpm --filter api test -- messageSequence`; UNA corrida a la vez).
- Vitest del web para store y la vista nueva (`MessageSequencesView.test.ts`).
- Ambos locales actualizados (guard `i18nKeys.test.ts`).
- E2E manual en el worktree (web `http://localhost:5175`, API `http://localhost:3003/api`):
  Buen Despacho → Configuración → Secuencias → pestaña Programados con los 50 reales
  (25-sep / 9-oct, 9:00 CDMX), reprogramar, "Encolar ya" → bandeja. Comprobar que ESE
  servidor sirve el código antes de dar por entregada una feature de UI.

## Desviaciones (llenar al cerrar cada milestone)

- M0: sin desviaciones (commit `1e366297` en master; verificado levantando este worktree en
  3003/5175 con env overrides, `--port` respetado, DB con `-wal`/`-shm` y `.env` copiados).
- M1 (cerrado 2026-09-12): implementado como especificado, con tres matices:
  1. El reaper corre al INICIO de `processDue()` (no como paso separado del cron). Cubre las tres
     vías de `processDue` (cron horario, runNow manual, disparo del alta) sin tocar el scheduler;
     la spec lo describía como "al inicio del ciclo del cron", que es exactamente este punto.
     NO se agregó `processing` al WHERE de candidatas: competiría con corridas concurrentes
     legítimas por el claim condicional.
  2. Claim y reaper escriben `updatedAt: new Date()` EXPLÍCITO: `repo.update()`/`qb.update()` NO
     pisan `@UpdateDateColumn` solos (verificado con TypeORM 0.3.27 + better-sqlite3) — sin esto el
     reaper robaría claims en curso. Además, el UPDATE del reaper va SIN alias: SQLite rechaza
     alias en UPDATE ("no such column: sm.status"); lo pilló la suite, no el tsc.
  3. `{community.*}` con comunidad vinculada ahora resuelve el nombre REAL de la comunidad
     (`loadCommunityData`), no solo evita el mock — el test de la spec pedía "sin 'Emaús Demo'"
     y se exigió además el nombre real de la comunidad sembrada.
  Tests: 55/55 en `messageSequence.test.ts` (47 base + 8 nuevos: maxPerDay sin atascar,
  excepción→failed attempts=1, reaper retoma fila vieja, reaper no roba claim fresco,
  {community.*} sin/ con comunidad, {table.*} a no-líder, regenerate con paymentRemaining +
  skipped). Aislamiento: `clearTestData()` no limpia tablas de secuencias → los tests nuevos no
  assert el retorno de `processDue()` y el spy de la excepción es participant-scoped.
- M2 (cerrado 2026-09-12): implementado como especificado, con tres matices:
  1. `markDispatched` discrimina 404 de 409 con un re-fetch tras el `affected=0`
     del update condicional (no alcanza con el update para saber si la fila no
     existe o si perdió la carrera). El 409 re-fetch-ea el estado REAL de la fila.
  2. El catch del controller usa un helper `replyConflictIfTransitionError` en
     vez de repetir `instanceof` en los 5 handlers — misma semántica, menos copia.
  3. Consecuencia esperada de la máquina de estados: dos tests previos
     despachaban/asignaban desde `pending` (estado que la nueva máquina rechaza) —
     se actualizaron para sembrar `queued`, que es el estado real de la bandeja.
  Tests: 70/70 en `messageSequence.test.ts` (64 = 55 + 9 nuevos de M2: matriz
  dispatch/skip/retry/discard/assign, carrera de dispatch, ids inexistentes →
  null, bulk con/sin ids con affected real) + 4/4 en
  `messageSequenceAssign.integration.test.ts` (seed actualizado a queued).
- M3 (cerrado 2026-09-12): implementado como especificado, con cinco matices:
  1. **Paginación con `.offset()/.limit()`** en `listScheduled`, no `skip/take`: el DISTINCT-ID
     subquery de TypeORM 0.3.27 no puede ORDER BY columnas joined en SQLite (SqliteError
     `distinciAlias`). Seguro aquí porque los joins son many-to-one (1 fila por mensaje).
  2. **`leftJoinAndSelect`** (no `leftJoin`) para hidratar participante/paso/secuencia en
     `getMany()` — el join plano no hidrata en 0.3.27 y `participantName` salía vacío.
  3. El contador del tab "Programados" NO usa `scheduledTotal` (que sigue los filtros activos y
     mentiría al filtrar): suma los `pending` por secuencia de `stats` — mismo número que el
     badge de la secuencia, siempre del retiro completo.
  4. `formatInRetreatTz` interpreta sus opts como opt-OUT (`withTime !== false`): la bandeja y
     Programados pintan fecha+hora+TZ por defecto; `fmtScheduled`/`fmtStepDate` solo traducen
     el null al texto i18n.
  5. Tests de la vista: el setup global de vitest mockea `vue-i18n` con `t = clave`; este
     archivo lo restaura con `vi.mock('vue-i18n', importOriginal)` para afirmar sobre textos
     reales del locale es ('Pendiente', 'Programados'). Y el mock de `'@/services/api'` debe
     ser un objeto plano con los named exports enumerados — un Proxy como factory de `vi.mock`
     no sobrevive la síntesis de namespace de vite-node.
  Backend: 75/75 en `messageSequence.test.ts` (70 + 5 nuevos: listScheduled filtros/paginación/
  timezone/DTO sin PII, schedule-preview fechas UTC exactas) + 4/4 integration. Web: 10/10 store
  (fetchScheduled guarda página/total/timezone) + 6/6 vista nueva `MessageSequencesView.test.ts`
  (fila con fecha TZ + hint de zona, bandeja pinta scheduledFor, contador desde stats, badge →
  tab filtrada con chip removible, timeline del editor con fecha del servidor, paso sin fecha).
  Guard i18n 67/67 (es/en en paridad).
- M4 (cerrado 2026-09-12): implementado como especificado, con cuatro matices:
  1. La spec pedía "menú ⋯ por fila/grupo en Programados"; se implementaron botones compactos
     inline por fila ("Reprogramar" / "Encolar ya", sólo en filas `pending`) — consistente con el
     resto de la bandeja, que no usa menús desplegables. El alcance por-lote lo aclara el hint del
     diálogo ("se moverán TODOS los pendientes del paso").
  2. El aviso de catch-up compara PARED contra PARED (`wallPartsInTz` del `scheduledFor` vs
     reloj actual en TZ del retiro), no instantes: el cliente jamás convierte TZ→UTC — el server
     (`makeDateInTimezone`) es la única fuente de verdad de la conversión. Matiz técnico:
     `Intl.formatToParts` NO parsea strings ISO (RangeError "Invalid time value") — normaliza a
     `new Date()` primero.
  3. `immediate` devuelve `processed` además de `affected` (cuántos cayeron a la bandeja tras el
     `processDue` encadenado del retiro); el toast de "Encolar ya" prefiere `processed`.
  4. El botón por paso en el editor sólo aparece para pasos ya guardados (`step.id`): un paso
     recién añadido en el draft no tiene filas materializadas que mover.
  Tests: backend 79/79 en `messageSequence.test.ts` (75 + 4 nuevos: sólo pending se mueve con
  fecha UTC exacta 15:00Z, hour omitido conserva sendHour, immediate ≈ now, affected 0 +
  findStepWithSequence null). Web: 11/11 store (rescheduleStep manda el stepId al endpoint y
  refresca bandeja+stats) + 8/8 vista (diálogo con defaults de pared de la fila, payload exacto,
  aviso de pasado, refetch; "Encolar ya" manda immediate). Guard i18n 67/67 (11 llaves nuevas
  es/en).
- M5: _pendiente_
- M6: _pendiente_
