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

- [ ] `ParticipantEmailChangeDialog.vue` (type-to-confirm D7, resumen y resultado)
- [ ] `EditParticipantForm`: email read-only + botón "Corregir correo" con permiso
- [ ] Servicio en `apps/web/src/services/api` + i18n es
- [ ] Tests Vitest del diálogo (éxito, 409 con mensaje, permiso)

## M3 — Cierre

- [ ] `docs/features/participant-email-change.md`
- [ ] Reconciliación retroactiva del spec + desviaciones por milestone
