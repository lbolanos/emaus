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

- [ ] `DomainAuditAction.PARTICIPANT_EMAIL_CHANGE` en `packages/types/src/audit.ts` + i18n key
- [ ] `changeParticipantEmail` en `participantService` (colisiones D3, link D4, overlay D5,
      cola D6, auditoría con hashes)
- [ ] `changeParticipantEmailSchema` en `packages/types` + ruta
      `PATCH /participants/:id/email` con `participant:identity:update`
- [ ] Permiso nuevo en la herencia de roles (D2) + tests RBAC (coordinator según D2)
- [ ] Strip de `email` en el PATCH general (`participantController.updateParticipant`)
- [ ] Tests: 409 por caso de colisión con razón correcta; no-op; link condicional; overlay
      limpiado; cola regenerada (`awaitAuditRow`); auditoría sin correo en claro; self-update
      sin email; import/couples no regresionan (`importEmailReuse`, `createParticipantForCouple`)

## M2 — Web: diálogo de corrección

- [ ] `ParticipantEmailChangeDialog.vue` (type-to-confirm D7, resumen y resultado)
- [ ] `EditParticipantForm`: email read-only + botón "Corregir correo" con permiso
- [ ] Servicio en `apps/web/src/services/api` + i18n es
- [ ] Tests Vitest del diálogo (éxito, 409 con mensaje, permiso)

## M3 — Cierre

- [ ] `docs/features/participant-email-change.md`
- [ ] Reconciliación retroactiva del spec + desviaciones por milestone
