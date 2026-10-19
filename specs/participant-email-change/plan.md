# Plan: corrección del correo de un participante

> SDD plan — versión 1.0 (2026-10-19). Orden de milestones; cada uno deja el sistema verde.

## M0 — specs SDD (este documento) + gate

Los cuatro archivos en `specs/participant-email-change/`. **Gate**: Leonardo resuelve D1-D7
(cada una con default propuesto) antes de codear M1.

## M1 — API: servicio y endpoint dedicados

1. Acción de auditoría `PARTICIPANT_EMAIL_CHANGE: 'participant.email_change'` en
   `packages/types/src/audit.ts` + key i18n `audit.actions.participant_email_change` en web.
2. Servicio `changeParticipantEmail(participantId, newEmail, actor)` en `participantService`
   — la única puerta (ver Puntos de extensión del spec):
   - normaliza (`normalizeEmail`), no-op si es el mismo correo;
   - colisiones D3 (retiro+género, global con `isImportNameConflict`, sugerir merge);
   - link de cuenta D4 (solo si `userId` null) + detección de user con correo viejo (aviso);
   - limpieza de overlays D5 (`community_member.email = null` donde == correo viejo);
   - regeneración de cola D6 (retiros activos, `regenerateQueuedForRetreat`);
   - evento de auditoría con `oldEmailHash`/`newEmailHash`, `overlaysCleared`,
     `queueRegenerated`, `userLinked`, `userWithOldEmail`.
3. Ruta `PATCH /participants/:id/email` con schema propio
   (`changeParticipantEmailSchema` en `packages/types`) y
   `requirePermission('participant:identity:update')`; permiso nuevo registrado en la herencia
   de roles según D2.
4. Strip de `email` en el PATCH general (controller, mismo patrón que `scholarshipAmount`) —
   el correo ya no entra por la vía genérica.
5. Tests API: colisiones (409 con razón correcta por caso), no-op, link condicional, overlay
   limpiado, cola regenerada (mock/`awaitAuditRow`), auditoría sin correo en claro, RBAC
   (coordinator sí/no según D2), self-update sigue sin email.

## M2 — Web: diálogo de corrección

1. Dialog `ParticipantEmailChangeDialog.vue`: type-to-confirm (D7), resumen previo y resultado
   posterior (chips: overlays limpiados, cola renovada, cuenta vinculada, avisos).
2. `EditParticipantForm`: campo email read-only + botón "Corregir correo" (visible con el
   permiso de M1) que abre el diálogo. Al cerrar, refresca la ficha.
3. Servicio API centralizado (`apps/web/src/services/api`) + i18n es.
4. Tests Vitest del diálogo (mock del servicio, casos de error 409 con mensaje).

## M3 — Cierre

1. `docs/features/participant-email-change.md` (receta operativa para quien atiende
   inscripciones).
2. Reconciliación: reescribir spec en modo retroactivo si algo se desvió (regla del skill
   `especificaciones`), marcar tasks, notas de desviación por milestone.

## Dependencias y paralelismo

- M1 → M2 (el diálogo consume el endpoint). M3 al final.
- Dentro de M1, el punto 1 (audit action) y el 4 (strip) son independientes del resto.
- Estimación de tandas: M1 en una, M2 en otra (puede ser otro worktree/session si hace falta).
