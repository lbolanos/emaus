# Tasks: participant-email-change

> SDD tasks — versión 1.0 (2026-10-19). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone.

## M0 — specs SDD

- [x] `specs/participant-email-change/spec.md` (D1-D7 con defaults propuestos)
- [x] `specs/participant-email-change/research.md`
- [x] `specs/participant-email-change/plan.md`
- [x] `specs/participant-email-change/tasks.md`
- [x] **Gate**: Leonardo aprueba D1-D7 tal cual el 2026-10-19, las siete con la opción
      recomendada (D2: permiso `participant:identity:update` con Coordinator incluido)
- [x] Worktree + branch (`worktree-participant-email-change`) — ya creado para el spec

## M1 — API: servicio y endpoint dedicados

- [x] `DomainAuditAction.PARTICIPANT_EMAIL_CHANGE` en `packages/types/src/audit.ts` + i18n key
- [x] `changeParticipantEmail` en `participantService` (colisiones D3, link D4, overlay D5,
      cola D6, auditoría con hashes)
- [x] `changeParticipantEmailSchema` en `packages/types` + ruta
      `PATCH /participants/:id/email` con `participant:identity:update`
- [x] Permiso nuevo en la herencia de roles (D2) + tests RBAC (coordinator según D2)
- [x] Strip de `email` en el PATCH general (`participantController.updateParticipant`)
- [x] Tests: 409 por caso de colisión con razón correcta; no-op; link condicional; overlay
      limpiado; cola regenerada (`awaitAuditRow`); auditoría sin correo en claro; self-update
      sin email; import/couples no regresionan (`importEmailReuse`, `createParticipantForCouple`)

**Done**: 2026-10-19. Tests: servicio 13/13, rutas 4/4, migración 4/4, regresiones
(`couplesNonRegression`, `coupleRegistration`, `importEmailReuse.simple`,
`importEmailReuseWiring.simple`, `participantQuickPhones`) 43/43, locale guard 6/6.
`tsc --noEmit`: 0 errores atribuibles al diff (146 preexistentes fuera de los hunks tocados);
`packages/types` tsc limpio; eslint de los archivos de fuente limpio.

### Desviaciones 2026-10-19

- **D2**: el rol `Coordinator` no existe en la base. Roles reales: globales
  (`superadmin`, `region_admin`, `regular`) y por retiro (`admin`, `treasurer`, `logistics`,
  `communications`, `regular_server`). El permiso `participant:identity:update` se concedió a
  **superadmin + admin** — en la operación, "administrador del retiro" es `admin`. Migración
  data-only idempotente (`20261019120000_AddParticipantIdentityUpdatePermission`), tolerante a
  roles ausentes.
- **Tests de auditoría**: la spec pedía `awaitAuditRow`; los tests unitarios mockean
  `domainAuditService.log` (el log es fire-and-forget y el suite es DB-independiente). Se
  assertan los hashes y que el correo en claro nunca entra al evento.
- **Self-update sin email**: verificado por inspección — `SELF_UPDATE_ALLOWED_FIELDS`
  (`participantController.ts`) nunca incluyó `email`. El strip del PUT genérico sí tiene test
  de ruta.
- **Aditivo**: el schema del body acepta `contextRetreatId` opcional (retiro desde el que se
  corrige, para el `retreatId` del evento de auditoría cuando la ficha no tiene uno fijo).

## M2 — Web: diálogo de corrección

- [x] `ParticipantEmailChangeDialog.vue` (type-to-confirm D7, resumen y resultado)
- [x] `EditParticipantForm`: email read-only + botón "Corregir correo" con permiso
- [x] Servicio en `apps/web/src/services/api` + i18n es
- [x] Tests Vitest del diálogo (éxito, 409 con mensaje, permiso)

**Done**: 2026-10-19. Tests: diálogo 4/4, `EditParticipantForm` 20/20 (3 nuevos
del gate de email), `ParticipantList` 72/72, parity + guards de locales 96/96
(corrida conjunta). `pnpm --filter web build` (vue-tsc + vite) verde; eslint de
los archivos de fuente limpio.

### Desviaciones 2026-10-19

- **El correo no era editable**: `ParticipantList.formColumnsToEdit` ya excluía
  `email` (`nonEditableSystemKeys`) y la rama «Read-only field display» del form
  mostraba el **valor** como texto read-only — no etiqueta huérfana. M2 la
  reemplaza por una rama propia fuera del gate de `columnsToEdit`: `Input`
  disabled + botón «Corregir correo» aunque el campo no sea editable.
- **Catálogo de permisos del web**: `participant:identity:update` no existía en
  `apps/web/src/utils/permissions.ts` (unión cerrada, el build fallaba). Añadido
  a `RESOURCES.participant` y a `OperationType`, mismo patrón que `health`.
- La validación cliente reusa `changeParticipantEmailSchema.shape.body` (zod
  compartido con el server) en vez de una regex propia.
- El diálogo se monta desde el arranque (regla MessageDialog) y no usa íconos
  lucide (el mock global del setup es un allowlist fijo).
- `onParticipantPatched` (ParticipantList) se ensanchó: cada flujo manda solo
  sus campos (`email` para este, teléfonos para el quick editor).

## M3 — Cierre

- [x] `docs/features/participant-email-change.md`
- [x] Reconciliación retroactiva del spec + desviaciones por milestone

**Done**: 2026-10-19. Doc de feature en el formato de `docs/features/` (propósito, dónde
vive, contrato, permisos, riesgo cerrado, tests). Spec reescrito en modo retroactivo →
**v1.1** (regla de la skill `especificaciones`): estado "implementada y reconciliada"
contra 67205b48/c6029a66, D1-D7 en as-built, sección "Reconciliación 2026-10-19" con los
seis deltas contra la v1.0.

### Desviaciones 2026-10-19

- Ninguna nueva: los deltas de la reconciliación ya estaban registrados como desviaciones de
  M1/M2. El spec v1.1 los absorbe (D2 sin Coordinator, `contextRetreatId` aditivo, orden de
  D3 con la raza del índice, gate TZ-aware de D6, zod compartido de D7, email fuera del gate
  de `columnsToEdit`).

## Cierre — review de código 2026-10-19

Hallazgos del review (`cierre` pasos 3-4) sobre el diff de la feature; los arreglos van en
un commit aparte.

**Arreglados en código** (`participantService.changeParticipantEmail` + tests):

- El 409 `EMAIL_OWNED_BY_OTHER` decía «inscrito en este retiro» por cualquier retiro
  compartido → scope fijado al `contextRetreatId` (el retiro desde el que se corrige).
- D6 solo miraba retiros no cerrados → también regenera retiros **cerrados** donde el
  participant tenga filas sin despachar (`pending`/`processing`/`queued`): las secuencias
  `days_after_retreat` siguen 30 días después del fin y la bandeja WhatsApp vive en `queued`.
- Las participaciones se cargan una sola vez (antes de la rama de colisión) en vez de una
  query por cada ficha en colisión.
- `spouseShareRetreats` queda deduplicado por retiro (antes repetía con dos fichas del otro
  género en el mismo retiro).

Tests del servicio: 13 → 18 (scope del «este retiro», cónyuges deduplicados, regeneración de
retiro cerrado con filas vivas); 18/18 verdes.

**Corregidos en docs**: la afirmación «el form pintaba la etiqueta sin campo» era falsa (la
rama read-only ya mostraba el valor como texto) — corregida en `docs/features/`, `spec.md`
(Problema + Reconciliación) y aquí; añadido el aviso de que ocultar la columna Correo del
listado esconde el campo —y el botón— del form (`formColumnsToShow`).

**Descartados** (con motivo): `requireRetreatAccess` en la ruta del email — diseño aprobado
en D2, el permiso es global por naturaleza del correo y el PUT genérico tampoco lo lleva; la
regeneración por retiro completo en vez de solo el participant — aceptado explícitamente en
D6; el gate de cónyuges vs el índice único pueden discrepar en géneros no seteados — caso de
borde que termina en 409 seguro, no en corrupción; `ChangeParticipantEmailBody` exportado sin
consumidor — convención del paquete.

## Post-cierre — feedback de UI del demo (2026-10-19)

En la prueba con el dev server (worktree, 5174) el campo de correo con el botón «Corregir
correo» con texto apretaba la dirección. Cambio a dos botones de ícono `ghost`:

- **Copiar** (`Copy`), sin permiso: `navigator.clipboard.writeText` + toast; el fallo del
  clipboard también avisa (el clic fue explícito).
- **Corregir** (`Pencil`), con el mismo gate `participant:identity:update`; `aria-label`
  reusa `emailChange.openButton`.

Tests del form: describe de email 3 → 4 (copiar al clipboard + toast; el gate del lápiz por
`aria-label`, no por texto). Spec: punto 8 de la Reconciliación.
