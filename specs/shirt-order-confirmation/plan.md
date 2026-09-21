# Plan: Confirmación del pedido de camisetas

Worktree `.claude/worktrees/shirt-order-confirmation`, branch desde HEAD local. Milestones
M0-M3; el detalle operativo vive en `tasks.md`.

## Datos

`retreat_participants.shirtOrderConfirmedAt` (datetime nullable). Una migración:

- `apps/api/src/migrations/sqlite/20260921220000_AddShirtOrderConfirmedAtToRetreatParticipants.ts`
  — guarda `PRAGMA table_info`, `ADD COLUMN` si falta, `down()` con `DROP COLUMN`. Solo
  `typeorm`. Entidad: columna junto a `bagMade` con comentario que la ligue al flujo
  `SERVER_SHIRT_CONFIRMATION`.

## API

1. `shirtReportService.getShirtOrdersForRetreat`: SELECT += `rp.shirtOrderConfirmedAt`,
   `p.cellPhone`, `p.country`; `Row`/`ShirtReportParticipant` += los tres como
   `string | null`. El `shirtReportController` no cambia (serializa lo que devuelve el
   service).
2. `RetreatSnapshotFields` += `shirtOrderConfirmedAt?: Date | null` para que
   `syncRetreatFields` lo acepte.
3. Controller `updateShirtOrderConfirmationController` (molde `updateBagMadeController`):
   `{ confirmed: boolean }` → 400 si no es booleano; `syncRetreatFields(participantId,
   retreatId, { shirtOrderConfirmedAt: confirmed ? new Date() : null })`; `{ ok: true }`.
   Sin `emitReception*` (no-goal realtime).
4. Ruta PATCH `/history/retreat/:retreatId/participant/:participantId/shirt-order-confirmation`
   con `isAuthenticated` + `participant:update` + `requireRetreatAccess('retreatId')`.

## packages/types

`src/index.ts`: `shirtReportParticipantSchema` += `shirtOrderConfirmedAt`/`cellPhone`/
`country` (`z.string().nullable()`); nuevo `setShirtOrderConfirmationSchema` + type inferida.
Tras editar: `touch apps/api/src/index.ts` (nodemon no mira `packages/*`).

## Web

1. `api.ts`: `updateShirtOrderConfirmation(retreatId, participantId, confirmed)` junto a
   `updateBagMade`.
2. `ShirtsReportView.vue` (misma ruta, sin router/sidebar):
   - Stat card "Confirmados" (`PackageCheck`): `confirmedCount/total`.
   - Columna "Confirmado" (`no-print`) entre Valor y ✓: badge-botón verde "✓ Confirmado" /
     gris "● Sin confirmar" + link WhatsApp (`MessageSquare` verde,
     `buildWhatsAppChatLink(p.cellPhone, p.country)`, oculto si null) en la misma celda.
   - `toggleConfirmation` optimista con rollback + `useToast` + `savingStates` (patrón
     attendance). Sin refetch.
   - Filtro "Solo sin confirmar" como Button junto a la búsqueda (AND con `searchQuery`).
   - Columna ✓ print-only con estado real; colspan "Sin resultados" 3→4.
3. Tests: extender el spec existente (mocks locales += íconos y la función nueva; fixtures
   += campos; casos de toggle/rollback/doble-tap/filtro/wa.me/print). Actualizar asserts de
   headers y cuadrito en el MISMO commit.

## Riesgos

Ver `research.md` § Gotchas — el más fino es el datetime-como-string de la query cruda y los
asserts exactos del spec existente.
