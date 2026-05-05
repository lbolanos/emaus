# TODO — Beca / Pagos / Per-retiro

Estado actual y trabajo pendiente derivado de la refactorización beca→retiro
(ver `scholarship-payment-status.md`).

## ✅ Hecho (sesión 2026-05-04)

- [x] **Refactor consolidado**: 15 campos por-retiro movidos a `retreat_participants` en una sola migración
      (`20260504120000_MovePerRetreatFieldsToRetreatParticipants.ts`). Reemplaza las 2 migraciones previas
      (que fueron eliminadas por colisión de timestamp con `AddRetreatShirtTypes`).
- [x] Hidratación (`findAllParticipants`, `findParticipantById`) y escritura (`updateParticipant`,
      `createParticipant`) actualizadas para los 15 campos.
- [x] `RetreatSnapshotFields` extendida con un test de contrato.
- [x] `paymentStatus.test.ts`: 32 tests (de 21 previos), incluyendo overlay de palancas/invitador/logística
      en escenarios de dos retiros distintos.
- [x] `emailLookup.test.ts`: arreglado el mock de `database/config` para incluir `createDatabaseConfig`.
- [x] **2049 tests** pasan en API (1990 + 59 skipped pre-existentes).
- [x] Lint API + Web limpio. Build API + Web exitoso.

## ✅ Hecho (sesiones previas)

- [x] `paymentStatus` distingue `'scholarship'` (🎓 Becado) de `'paid'`.
- [x] Precedencia: `'overpaid'` gana sobre `'scholarship'`.
- [x] Botón **🎓 Marcar como Becado** en el modal de Agregar Pago.
- [x] Página `/app/payments` toma el retiro del sidebar (eliminado el selector local).
- [x] Permiso `participant:viewScholarshipAmount` (admin + treasurer).
- [x] Campo `scholarshipAmount` en UI con gating por permiso.
- [x] Backend filtra `scholarshipAmount` en respuestas y descarta el campo
      del body en `updateParticipant` cuando falta el permiso.
- [x] Migración `20260425120000_AddScholarshipAmount`.
- [x] Migración `20260425130000_MoveScholarshipToRetreatParticipants` con
      backfill automático.
- [x] `isScholarship` y `scholarshipAmount` ahora viven en
      `retreat_participants`, hidratados como campos virtuales en
      `Participant`.
- [x] Tests unitarios (27/27) incluyendo el caso "mismo participante en dos
      retiros con beca distinta".
- [x] Lint API + Web limpio. Build API + Web exitoso.

## 🟧 Falta (alto valor)

### Mover otros campos a `retreat_participants` ✅ (mayoría hecho)

- [x] **Beca** (`isScholarship`, `scholarshipAmount`)
- [x] **Palancas** (`palancasCoordinator`, `palancasRequested`,
      `palancasReceived`, `palancasNotes`)
- [x] **Invitador** (`invitedBy`, `isInvitedByEmausMember`,
      `inviterHomePhone`, `inviterWorkPhone`, `inviterCellPhone`,
      `inviterEmail`)
- [x] **Logística** (`pickupLocation`, `arrivesOnOwn`, `requestsSingleRoom`)
- N/A **Materiales / uniforme** — `tshirtSize`, `needsWhiteShirt`,
      `needsBlueShirt`, `needsJacket` ya son per-retiro vía
      `participant_shirt_size`. Ver `docs/shirt-types.md`. NO requieren
      este refactor.
- [x] **`notes`** — overlay desde `retreat_participants.notes` (la columna
      ya existía en RP). Hidratación + escritura per-retiro.
- [x] **`registrationDate`** — overlay desde `RetreatParticipant.createdAt`.
      `participants.registrationDate` se mantiene como "primera inscripción
      en el sistema"; cada retiro reporta su propia fecha vía createdAt.

### Limpieza de columnas legacy en `participants`

Tras un período de transición y validación de que la hidratación funciona
correctamente:

- [ ] Migración para soltar `participants.isScholarship`.
- [ ] Migración para soltar `participants.scholarshipAmount`.
- [ ] Verificar que `aiChatService.ts:338` (`p.isScholarship`) recibe
      correctamente el valor hidratado.

> ⚠️ No hacer hasta confirmar que ningún backend o reporte lee directamente
> de `participants.isScholarship`.

### UX

- [ ] El botón "Marcar como Becado" debería permitir capturar el monto
      becado en el mismo paso (no sólo activar el flag).
- [x] Cuando se desactiva `isScholarship`, limpiar `scholarshipAmount`
      (`participantService.updateParticipant`).
- [x] Validación: `scholarshipAmount` no excede `retreat.cost`. Implementado
      en `participantService.updateParticipant` — lanza error con código
      `SCHOLARSHIP_EXCEEDS_COST` (HTTP 400). El controller traduce el error
      para el cliente.
- [ ] Filtro chip "Becado" en `ParticipantList` (ya existe la opción del
      filtro, pero un chip rápido sería útil).
- [ ] En `PaymentManagement` mostrar resumen: "X becados, monto total
      becado: $Y".
- [ ] Mostrar `paymentRemaining` (lo que falta por pagar) en la lista para
      no-becados.

## 🟨 Falta (medio valor)

### Constraints e integridad

- [ ] Unique constraint en `retreat_participants(participantId, retreatId)`
      para evitar duplicados de inscripción al mismo retiro (verificar si
      ya existe; si no, agregar).
- [ ] Validación en `updateParticipant`: si llega `scholarshipAmount > 0`
      pero `isScholarship` es `false`, decidir política (rechazar / forzar
      `isScholarship=true` / ignorar).

### Tests

- [ ] Test de integración con BD que cree dos `RetreatParticipant` rows
      para el mismo participante con valores distintos y verifique end-to-end
      que `findAllParticipants(retreatA)` y `findAllParticipants(retreatB)`
      retornan estados de beca distintos. (Bloqueado por el setup de DB
      tests mencionado en CLAUDE.md — pendiente desbloqueo.)
- [ ] Test del controller que verifique el filtrado de `scholarshipAmount`
      cuando el usuario carece del permiso.
- [ ] Test del flujo "Marcar como Becado" en el frontend (Vitest +
      mocking del store).

### Permisos / RBAC

- [ ] Documentar `participant:viewScholarshipAmount` en el seed de roles
      (`apps/api/src/migrations/sqlite/20250910163337_CreateSchema.ts` o un
      doc dedicado a permisos).
- [ ] Considerar si conviene un permiso paraguas
      `participant:readFinancial` que englobe `totalPaid`, `paymentStatus`
      y `scholarshipAmount` — actualmente `totalPaid` no está protegido.
- [ ] `payment:read` actualmente lo tienen también `logistics` y
      `communications`. Validar con product owner si está OK.

## 🟦 Falta (bajo valor / nice to have)

- [ ] Auditoría: registrar en `audit_log` cada cambio de `isScholarship` y
      `scholarshipAmount` (entidad sensible).
- [ ] Reporte financiero por retiro (export Excel) que incluya
      becados/montos.
- [ ] Internacionalización del tooltip del botón 🎓 (actualmente texto
      directo en español).
- [ ] Decidir destino de los campos borderline (`snores`, `hasMedication`,
      `medicationDetails`, `medicationSchedule`, `hasDietaryRestrictions`,
      `dietaryRestrictionsDetails`, `disabilitySupport`, `maritalStatus`,
      `occupation`, `sacraments`): mantener globales, snapshottear, o
      ambos.

## Referencias

- `docs/features/scholarship-payment-status.md` — diseño actual.
- `apps/api/src/entities/participant.entity.ts` — entidad global con
  campos virtuales.
- `apps/api/src/entities/retreatParticipant.entity.ts` — junction tabla
  con campos retreat-scoped.
- `apps/api/src/services/participantService.ts:553-587` — patrón de
  hidratación a copiar para los próximos campos.
- `apps/api/src/services/retreatParticipantService.ts:374` —
  `syncRetreatFields` para escritura.
- `apps/api/src/migrations/sqlite/20260425130000_MoveScholarshipToRetreatParticipants.ts`
  — migración modelo a replicar (ALTER + backfill por correlated subquery).
