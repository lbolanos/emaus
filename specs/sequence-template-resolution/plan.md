# Plan técnico: milestones M0-M4

Orden: **M0 → M1 → M2 → M3 → M4**. M1 va primero y con deploy propio (prod tiene 28 vencidos
en bandeja contra la plantilla vieja); M2-M4 pueden compartir deploy.

Por milestone: jest verde (una sola corrida a la vez), `pnpm build` api+web, i18n es+en
completo, `tasks.md` cerrado con Done/desviaciones.

## M0 — specs SDD + worktree

- `specs/sequence-template-resolution/` con los 4 artefactos (este documento incluido).
- Worktree `.claude/worktrees/sequence-template-resolution/` desde HEAD local `3faf76c2` +
  `pnpm install` + `apps/api/.env` copiado (los archivos M sin commitear del main quedan fuera).
- DB aislada: el script de arranque copia los 3 archivos del main a
  `database.worktree.sqlite` en cada start (skill `worktree-testing`, puertos 3002/5174).

## M1 — cirugía de datos en prod

Migración data-only
`apps/api/src/migrations/sqlite/20261001120000_FixBuenDespachoShirtConfirmationSequence.ts`
(patrón `20260913193000_FixBuenDespachoPalancasSequence.ts`; solo `typeorm` + literales, sin
`@repo/types`; cada paso idempotente para converger tras muerte parcial):

1. **Pausar primero** (que ningún cron re-enrole a mitad):
   `UPDATE message_sequences SET isActive = 0 WHERE id = 'a41ad6fb-5e64-42d7-9b5f-7c5004c9c0b2'`.
2. **Purgar SOLO las 28 queued**:
   `DELETE FROM scheduled_messages WHERE sequenceId = 'a41ad6fb-…' AND status = 'queued'`.
   El sent de Marco queda (decisión cerrada; la UQ lo excluye del re-enrol).
3. **Borrar plantilla vieja**:
   `DELETE FROM message_templates WHERE id = '74d8e87b-8455-4187-8941-0b17f8911545'`.
4. **offsetDays 20→5** del paso `734196da-f22d-4fb3-a3f0-72bbf812dbee` (→ 11 oct).

- `down()` documentado: offsetDays=20, isActive=1; filas purgadas y plantilla no se restauran.
- **Prueba en dev primero**: el auto-run aplica la migración sobre la copia local al guardar →
  verificar por dato → commit+push → deploy → verificar en prod.
- **Verificación por dato** (nunca por `migration:show`): COUNT templates
  `(e9b3…, SERVER_SHIRT_CONFIRMATION)` = 1; COUNT queued de la secuencia = 0; `isActive = 0`;
  `offsetDays = 5`; fila en `migrations`. UI: bandeja del retiro sin ítems de "Ultimo Prendas".
- Test: `apps/api/src/tests/migrations/fixBuenDespachoShirtConfirmationSequence.simple.test.ts`
  (up ×2 idempotente, invariantes: sent sobrevive, plantilla nueva sobrevive).

## M2 — guard anti-retroactivo (en `enrollSequence`, NO en processDue)

- Nuevo `isRetroactiveAtEnroll(trigger, scheduledFor, now, tz)` en `messageSequenceService.ts`:
  - `days_before_retreat` / `days_after_retreat`: suprimir si `scheduledFor < inicio-de-hoy` en
    TZ del retiro. Ancla = retiro → misma fecha para todos; cualquier fecha pasada al
    materializar es backfill masivo (los 2 incidentes). "Hoy" sí materializa.
  - `participant_created`: suprimir solo si `scheduledFor < hoy − 2 días` (catch-up de
    inscripción tardía es legítimo).
  - `birthday`: `false` (`computeScheduledFor` ya elige la próxima ocurrencia).
- En el loop de `enrollSequence`: `continue` + contador `suppressed` + `console.warn`. **Sin
  filas skipped**: la UQ `(stepId, participantId, occurrenceYear)` bloquearía el re-enrol tras
  corregir el offset; la visibilidad la da el editor.
- `processDue` queda intacto: `maxOverdueDays` sigue siendo la red al ENVIAR para filas que
  eran futuras y envejecieron.
- Editor: `schedule-preview` agrega `past: boolean[]` resuelto server-side
  (`SequenceSchedulePreview` en `packages/types`); `MessageSequencesView` pinta ámbar junto a
  `fmtStepDate`; key `sequences.stepDatePast` en `es.json` Y `en.json`.
- Tests: `services/messageSequenceRetroactiveEnrollGuard.test.ts`,
  `services/messageSequenceSchedulePreviewPast.test.ts`.

## M3 — templateId estructural

- Migración `20261002120000_SequenceStepTemplateId.ts` (ADD COLUMN simple, sin recreate):
  `ALTER TABLE sequence_steps ADD COLUMN templateId varchar(36)` NULL + backfill determinista:

  ```sql
  UPDATE sequence_steps AS ss SET templateId = (
    SELECT mt.id FROM message_templates mt
    JOIN message_sequences ms ON ms.id = ss.sequenceId
    WHERE mt.retreatId = ms.retreatId AND mt.type = ss.templateType
    ORDER BY mt.createdAt ASC, mt.rowid ASC LIMIT 1)
  WHERE ss.templateId IS NULL AND ss.isArchived = 0
  ```

  Sin plantilla en el retiro → NULL (el fallback por type sigue; processDue ya reporta "sin
  plantilla"). `down()`: DROP COLUMN. Guard de `PRAGMA table_info` antes del ADD COLUMN.
- **NO** `scheduled_messages.templateId`: todo consumidor tiene `sm.step`, y
  `sm.templateType` queda como fallback desnormalizado.
- Entities: `SequenceStep.templateId` (varchar(36) nullable, sin relación);
  `MessageTemplate.type` tipado con `z.infer<typeof messageTemplateTypes>` (elimina `as any`).
- Helper `resolveTemplateForStep(retreatId, step)`: busca por id **validando retreatId**,
  fallback `findOne({retreatId, type})` con `orderBy createdAt ASC`. Aplicarlo en los 5 sitios:
  batch de `processDue` (851-857; map adicional por `${retreatId}:${id}`, `step.templateId`
  gana), `recordWhatsappCommunication` (1244), `previewStep` (1719, input acepta `templateId`
  opcional), `getQueueItemDetail` (1863), `regenerateQueuedForRetreat` (2166).
- Globales: `global_sequence_steps` siguen por `templateType` (sin retiro no hay id local);
  `copyToRetreat` (`globalMessageSequenceService.ts:131-160`) resuelve la plantilla local por
  tipo y setea `templateId`; `templateType` se conserva para filtros de audiencia.
- `packages/types/src/sequence.ts`: `templateId` nullish en `stepInputSchema`/
  `sequenceStepSchema`/`StepWriteData`; `syncSteps`/`stepPayloadChanged` lo propagan.
- Editor (`MessageSequencesView.vue:2085`): select con `:value="tpl.id"` +
  `v-model="step.templateId"`; `StepDraft` gana `templateId` y al cambiar sincroniza
  `templateType` desde el objeto plantilla; `templatesForStepAudience` incluye
  `tpl.id === step.templateId`; warning ámbar para pasos con `templateId` null y >1 plantillas
  del mismo type (`sequences.duplicateTemplateType`, es+en).
- **Duplicados de type PERMITIDOS**: `BaseMessageTemplateModal` muestra aviso informativo
  cuando el type ya existe en el retiro — sin excluir el type ni 409 en el POST (bloquear
  rompería crear una 2ª plantilla del mismo tipo, que es el caso de uso que motiva esto).
- Bandeja/detalle: `getScheduled`/`getQueue`/`getQueueItemDetail` devuelven `templateName`
  resuelto server-side; el web prefiere `templateName` con fallback `templateLabel(type)`.
- `pnpm --filter api build` tras tocar entities (regla ESM del bundle).
- Tests: `services/messageSequenceTemplateResolution.test.ts` (id gana; id de otro retiro →
  fallback; fallback determinista; batch), `migrations/sequenceStepTemplateIdBackfill.simple.test.ts`;
  web: aviso del modal + `sequenceEditorShared.templateId.test.ts`.

## M4 — `{custom_message}` accionable

- Migración `20261003120000_CleanCustomMessagePlaceholder.ts` (data-only; no editar seeds ya
  aplicadas):
  `UPDATE message_templates SET message = replace(message, '{custom_message}', '<frase neutral>') WHERE type = 'GENERAL' AND message LIKE '%{custom_message}%'`;
  `down()` con replace inverso. La frase exacta la fija el cierre de M4 (el flujo manual edita
  el texto final en `MessageDialog` de cualquier forma).
- `processDue`, justo tras resolver plantilla: si `template.message` (crudo, no
  resolvedContent) incluye `{custom_message}` → `skipped` con error accionable ("plantilla con
  {custom_message} (mensaje manual): edítala antes de usarla en secuencias") — cae en
  Problemas, descartable/bulk. `regenerateQueuedForRetreat`: `skipped++` conservando snapshot.
  `previewStep`: warning en el mismo canal del de plantilla faltante.
- Tests: `services/messageSequenceCustomMessageGuard.test.ts`,
  `migrations/cleanCustomMessagePlaceholder.simple.test.ts`.

## M5 — pasos vencidos: preguntar en *Ejecutar* (2026-10-02, rama `sequence-past-steps`)

- `enrollSequenceDetailed(seq, now, sendNowStepIds)`; `enrollSequence` delega y sigue devolviendo
  `number` (el cron no cambia). En el loop, el `seen` se evalúa ANTES del guard: el conteo de
  vencidos solo incluye a quien aún no tiene la fila (p. ej. no a Marco con su `sent`).
- `runForRetreat(retreatId, { sendNowStepIds })` → `SequenceRunResult { enrolled, processed,
  pastSteps }` (tipos y `runSequencesSchema` en `packages/types/src/sequence.ts`). Los ids de
  otro retiro no matchean: el loop solo recorre las secuencias del retiro de la ruta.
- Web: `runNow(sendNowStepIds?)`; diálogo `useModalA11y` con checkbox nativo por paso;
  `pausedHiddenCount` + estados vacíos diferenciados en la bandeja. Keys es+en.
- Ayuda in-app `docs/es/crm.md`: "Registros tardíos" estaba desactualizado desde M2.
- Tests: 5 de integración en `messageSequenceRetroactiveEnrollGuard.test.ts`, 5 de vista en
  `MessageSequencesView.test.ts`.

## M6 — plantilla predeterminada por tipo (2026-10-02, rama `sequence-past-steps`)

- Migración `20261004120000_MessageTemplateDefaultAndPinSteps.ts`: ADD COLUMN `isDefault`
  (guard PRAGMA) + backfill de `sequence_steps.templateId` NULL con `isDefault DESC, createdAt
  ASC, rowid ASC` (lo que el motor ya resolvía). Escrita entera de una vez: el API dev la aplica
  al guardar.
- `messageTemplateService`: `DEFAULT_TEMPLATE_ORDER`, `findDefaultTemplateForType`,
  `clearOtherDefaults` en create/createForRetreat/update (solo scope retiro).
- Motor: fallback de `resolveTemplateForStep`, `buildTemplateNameMaps` y el lote de `processDue`
  con el orden nuevo; la siembra fija `templateId`; `copyToRetreat` usa el helper.
- Web: helper puro `utils/templateDefault.ts` (mismo orden) para el modal, la tabla y
  `MessageDialog`; casilla en el modal; "★ Predeterminada" / "☆" en la tabla; aviso reescrito
  ("y N más" en vez de "…"). Ayuda `docs/{es,en}/message-templates.md`.

## Demo manual en dev al cierre (post-M4)

Re-enrolar "Ultimo Prendas" → única plantilla `SERVER_SHIRT_CONFIRMATION` alcanzable, bandeja
muestra "Reconfirmar Prendas", paso vencido no materializa (M2), preview muestra nombre
resuelto.

## Post-deploy M1

Verificación por dato en prod (`sqlite3 -readonly`, vía SSH `ubuntu@18.116.102.104` con
`~/.ssh/lightsail-emaus.pem`).
