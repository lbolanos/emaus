# Tasks: sequence-template-resolution

Convención: al cerrar cada milestone se marcan los items y se añade una línea `**Done**:` con
fecha. Toda desviación del plan va en una sección `### Desviaciones <fecha>` al pie del
milestone correspondiente.

## M0 — specs SDD + worktree

- [x] Worktree `.claude/worktrees/sequence-template-resolution/` desde HEAD local `3faf76c2`
- [x] `pnpm install` + copia de `apps/api/.env` (los 4 archivos M del main quedan fuera)
- [x] `specs/sequence-template-resolution/`: spec.md, research.md, plan.md, tasks.md
- [x] Commit M0

**Done**: 2026-10-01

## M1 — cirugía de datos en prod

- [x] Migration `20261001120000_FixBuenDespachoShirtConfirmationSequence.ts` (4 pasos
      idempotentes: pausar → purgar 28 queued → borrar plantilla vieja → offsetDays 20→5)
- [x] Test `fixBuenDespachoShirtConfirmationSequence.simple.test.ts` (up ×2 idempotente,
      invariantes) — 5/5 verde
- [x] Prueba en dev (auto-run al arrancar el API sobre copia aislada) + verificación por dato:
      pre 28 queued + 1 sent → post 0 queued + 1 sent; única plantilla del tipo = `62fec9ab`;
      `isActive=0`; `offsetDays=5`; fila en `migrations`
- [ ] Commit + push + deploy (con OK explícito de Leonardo)
- [ ] Verificación por dato en prod (readonly vía SSH)

**Done**: —

## M2 — guard anti-retroactivo

- [x] `isRetroactiveAtEnroll` en `messageSequenceService.ts` (semántica por trigger)
- [x] Supresión en el loop de `enrollSequence` (sin filas skipped) + contador
- [x] `past: boolean[]` en `schedule-preview` (`SequenceSchedulePreview` en packages/types)
- [x] Editor: ámbar junto a `fmtStepDate` + key `sequences.stepDatePast` es+en
- [x] Tests: `messageSequenceRetroactiveEnrollGuard.test.ts` (12/12),
      `messageSequenceSchedulePreviewPast.test.ts` (3/3)
- [x] Build api+web, commit

**Done**: 2026-10-01

### Desviaciones 2026-10-01

- **6 tests existentes de `messageSequence.test.ts` re-fechados, no re-escritos**: con el guard
  M2, los tests de audiencia que usaban el startDate default del factory ("hoy") con offset
  positivo (`table_leaders`, 4 de `community_roster`, R2 de robustez) dejaron de enrolar. El
  intento de esos tests es la audiencia, no la retroactividad, así que se fecharon sus retiros al
  futuro (helper `futureStart`, mediodía UTC). El test "WhatsApp encola" de `community_roster`
  dependía del mensaje ya-vencido al materializar: ahora el retiro es futuro y la fila se vence
  a mano (`scheduledFor` − 1 h) tras el enrol, que ejercita el mismo camino (fecha llegada)
  sin depender del borde exacto de hoy.
- **El test "catch-up legítimo" (línea ~176) se reescribió a la expectativa opuesta** ("retiro
  futuro con paso vencido NO enrola"): documenta el cambio deliberado de semántica de R2 — para
  triggers anclados al retiro no existe catch-up legítimo porque la fecha es idéntica para toda
  la audiencia (incidentes palancas 2026-09-13 y prendas 2026-10-01). Verifica además que tras
  corregir el offset el re-enrol materializa (la UQ quedó limpia).
- Suite verificada en conjunto: las 6 suites del motor juntas dan 125/125
  (`messageSequence`, `RetroactiveEnrollGuard`, `SchedulePreviewPast`,
  `shirtConfirmationSequence`, `messageSequenceProcessScope`, `sequenceRecipientsAndSeed`).

## M3 — templateId estructural

- [x] Migration `20261002120000_SequenceStepTemplateId.ts` (ADD COLUMN + backfill
      determinista + guard PRAGMA)
- [x] Entities: `SequenceStep.templateId`, `MessageTemplate.type` tipado (sin `as any`)
- [x] Helper `resolveTemplateForStep` aplicado en los 5 sitios del motor
- [x] `copyToRetreat` resuelve `templateId` local
- [x] `packages/types/src/sequence.ts`: templateId en schemas + `syncSteps`/`stepPayloadChanged`
- [x] Editor: select por id, `StepDraft.templateId`, warning duplicado (`duplicateTemplateType`
      es+en)
- [x] `BaseMessageTemplateModal`: aviso informativo de type duplicado (sin 409)
- [x] `templateName` server-side en bandeja/detalle (getQueue/getScheduled/getQueueItemDetail)
- [x] Tests: `messageSequenceTemplateResolution.test.ts` (6/6),
      `sequenceStepTemplateIdBackfill.simple.test.ts` (7/7), web modal (4/4) + editor shared (7/7)
- [x] `pnpm --filter api build`, build web, commit

**Done** (2026-10-01):
- Resolution semantics fijadas por tests: id del paso gana; id de otro retiro → fallback
  `(retreatId, type)` con `createdAt ASC` (mismo criterio del backfill); batch de `processDue`
  resuelve todo en memoria (spy de `findOne` en 0); `previewStep` acepta `templateId`.
- Suites en verde: motor 134/134 (baseline + M1/M2 intactas), `messageVariables` 36/36,
  `MessageSequencesView` 26/26, `BaseMessageTemplateModal.editorMode` 6/6. Builds api+ui+web ✓.

**Desviaciones** (2026-10-01):
- El modal lee `messageTemplateStore.templates` directo dentro del computed en vez de
  `storeToRefs`: misma reactividad con el store real de pinia, y los mocks planos de tests
  siguen funcionando (storeToRefs sobre objeto no-store no produce la ref y el mount revienta).
- La aserción original del test de fallback legacy en `sequenceEditorShared.templateId.test.ts`
  esperaba SOLO la plantilla del tipo; el comportamiento implementado (y correcto) lista todas
  las de la audiencia del destinatario MÁS la fijada por tipo/id — corregida la aserción, no el
  código.
- El mock de `@repo/ui` del test nuevo del modal exporta `useToast` (lo usa `retreatStore`
  real); el de `editorMode.test.ts` ganó `templates: []`/`fetchTemplates` en su mock plano.

## M4 — `{custom_message}` accionable

- [x] Migration `20261003120000_CleanCustomMessagePlaceholder.ts` (frase neutral:
      `«Escribe aquí tu mensaje personalizado»`)
- [x] Guard en `processDue` (skipped accionable) + `regenerateQueuedForRetreat` (skipped++) +
      warning en `previewStep`
- [x] Tests: `messageSequenceCustomMessageGuard.test.ts` (4/4),
      `cleanCustomMessagePlaceholder.simple.test.ts` (4/4)
- [x] Build api, commit

**Done** (2026-10-01):
- Datos verificados antes de codear (copia readonly de dev): 8 plantillas con el placeholder, todas
  `GENERAL` "Mensaje General" (7 retreat + 2 community), ninguna de otro type HOY.
- Suites en verde: motor completo 191/191 en 13 suites (M1-M4 juntas). Build api ✓.

**Desviaciones** (2026-10-01):
- La migración limpia TODAS las plantillas con el placeholder, sin el `WHERE type = 'GENERAL'`
  del plan: el incidente mismo fue una `SERVER_SHIRT_CONFIRMATION` con el hueco; filtrar por
  type dejaría el caso del incidente sin cubrir. (Fijado en spec.md R6.)
- El guard detecta el placeholder crudo Y la frase neutral: sin esto, una plantilla migrada pero
  nunca personalizada usada en una secuencia despacharía la frase neutral literal — mismo
  síntoma, texto más bonito. (Fijado en spec.md R6/CA6.)

## Cierre

- [x] E2E del área (ver abajo)
- [x] Demo manual en dev (ver abajo: retiro sintético, cero PII para el video)
- [ ] Deploy M2-M4 + verificación en prod
- [ ] Merge a master

**Done**: —

### E2E (2026-10-01)

Corridos sobre el stack del worktree (API 3002 + web 5174, DB copiada del main con M1-M4
auto-aplicadas):

- `sequences-inbox.spec.ts` — 2/2 ✓ (login real en navegador, cumple la regla del skill de que
  al menos un spec monte el frontend)
- `template-preview-newlines.spec.ts` — 6/6 ✓ (creds locales por fallback `E2E_LOCAL_*`)
- `sequence-targeting.spec.ts` — 5/5 ✓ y `global-message-sequences.spec.ts` — 5/5 ✓: specs de
  autorización que exigen el fixture `@test.local`. Sembrado a mano en la DB del worktree con el
  API detenida (SQL fiel a `20260516200000_SeedE2ETestUsers`: 4 usuarios + 2 comunidades + 3
  links + member) y API arrancada MANUAL — el script de arranque re-copia la DB y se lleva la
  siembra (limitación conocida del skill worktree-testing).

No se corrió la suite e2e completa (40 specs): los restantes no tocan secuencias/plantillas y
varios dependen de fixtures de casa/retiros e2e (`E2E_HOUSE_ID`) ausentes en la DB copiada del
main. La cobertura funcional de M1-M4 quedó en las suites de integración (191 tests del motor) +
los 18 e2e del área.

Nota operativa: `sqlite3 -readonly <archivo>` falla con CANTOPEN sobre una DB WAL cuyo `-shm`
no existe (checkpoint limpio); abrir en modo normal crea el shm y lee sin problema.

### Demo (2026-10-01)

Sembrado un retiro **sintético** ("Demo Secuencias (video)", `6f2cd1d0`, inicio +20 d) sobre el
stack del worktree (API 3002 + web 5174) para grabar el video **sin PII real**: 3 participantes
fake (2 caminantes + 1 servidor), 3 plantillas `SERVER_SHIRT_CONFIRMATION`/`GENERAL` del retiro
(incluida una 2ª del MISMO tipo, el escenario del incidente). Scripts en `/tmp/emaus-demo/`
(no versionados: llevan credenciales locales por default).

Alternativa al plan original (re-enrolar "Ultimo Prendas" real de Buen Despacho): ese retiro
tiene participantes reales y sus snapshots de bandeja expondrían teléfonos en el video. El
retiro sintético ejercita exactamente los mismos caminos.

Verificado por dato Y visualmente en el navegador (`/app/settings/message-sequences`):

- **M3**: secuencia "Demo M3" con el paso fijando por `templateId` la plantilla "Último aviso de
  prendas (demo B)" — 2ª de su tipo; hay 4 `SERVER_SHIRT_CONFIRMATION` en el retiro (la global
  copiada "Confirmación de prendas" ganaba siempre antes del fix). Bandeja muestra
  "Servidor Demo · Último aviso de prendas (demo B) · 1 oct, 9:00 a.m. GMT-6" y el snapshot usa
  el texto de la B ("última llamada"). Editor: el select del paso lista las 4 por nombre con la
  B seleccionada (captura `demo-m3-editor-select.png`).
- **M4**: secuencia "Demo M4" (GENERAL sin fijar → fallback "Mensaje General" con la frase
  neutral post-migración): los 2 caminantes caen en Problemas como "Omitido" con el error
  accionable "plantilla con {custom_message} (mensaje manual): edítala antes de usarla en
  secuencias" — el guard atrapó la frase NEUTRAL (plantilla migrada nunca personalizada), no
  sólo el marcador crudo. `previewStep` devuelve content vacío + warning del hueco.
- **M2**: el editor muestra la fecha del paso sin ámbar (retiro futuro, offset 0 = hoy); para
  el video, subir `offsetDays` a un valor que cruce `startDate` y el preview pinta la fecha en
  ámbar con la key `sequences.stepDatePast`.

Alta de participantes: `POST /participants/new` exige `isPublic` en el retiro (se activó por
PUT tras crearlo con false) y el schema completo (`acceptedPrivacyNotice`, dirección,
sacramentos, contacto de emergencia en caminantes).
