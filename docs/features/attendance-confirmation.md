# Estado de confirmación de asistencia (caminante)

Cierra el ciclo del flujo de briefing/confirmación: el líder/coordinador llama al caminante
antes del retiro y marca si **confirmó / está por contactar / no asiste**. Distinto de
`checkedIn` (registro de llegada en recepción).

## Modelo

Columna `attendanceConfirmation` en `retreat_participants` (per-retiro), valores
`'pending' | 'confirmed' | 'declined'`, default `'pending'`.

- **Entidad:** `apps/api/src/entities/retreatParticipant.entity.ts` (+ campo virtual en
  `participant.entity.ts`, poblado en el flatten).
- **Migración:** `apps/api/src/migrations/sqlite/20260609120000_AddAttendanceConfirmationToRetreatParticipant.ts`
  — `ALTER TABLE ... ADD COLUMN` (seguro, sin recreate; el DEFAULT rellena filas existentes).
  `down()` usa `DROP COLUMN`.
- **Flatten:** `participantService.findAllParticipants` agrega `attendanceConfirmation` al
  `select` y al overlay → llega al frontend vía `/participants` (participantStore).

## API

`PATCH /participants/:id/attendance-confirmation` (body `{ retreatId, attendanceConfirmation }`).
- Auth: `requirePermission('participant:update')` + `requireRetreatAccess('retreatId', 'body')`.
- Service `setAttendanceConfirmation` valida el valor, persiste en `retreat_participants` y
  registra auditoría (`DomainAuditAction.PARTICIPANT_ATTENDANCE_CONFIRMATION`).
- Cliente: `setAttendanceConfirmation(participantId, retreatId, status)` en `api.ts`;
  `participantStore.setAttendanceConfirmation` (optimista, revierte si la API falla).

## UI (`ParticipantList.vue`, solo caminantes)

- **Control por fila** en la celda de acciones: pastilla de color que **cicla** al hacer clic
  (Por contactar → Confirmado → No asiste → …). Gris / verde / rojo.
- **Filtro** en la barra de herramientas: `<select>` Confirmación: Todos / Por contactar /
  Confirmado / No asiste.

## Tests

- `apps/api/src/tests/migrations/addAttendanceConfirmation.test.ts` — columna + default 'pending',
  acepta confirmed/declined, down/up.
- `apps/web/src/components/__tests__/ParticipantList.test.ts` — filtro por estado + `cycleAttendance`.

## Verificación e2e (Chrome)

Marcar a un caminante → "✓ Confirmado", **persiste tras recargar** (backend + flatten), y los
filtros Confirmado/Por contactar/No asiste devuelven los conteos correctos.
