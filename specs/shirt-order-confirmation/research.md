# Research: Confirmación del pedido de camisetas

Estado actual (2026-09-21) y gaps. Todo verificado leyendo el código, no por deducción.

## El sistema de playeras (ya existente)

Doc maestra: `docs/shirt-types.md`; doc de la vista: `docs/features/shirts-report.md`.

| Pieza | Ruta | Qué aporta |
|---|---|---|
| Tipos por retiro | `retreat_shirt_type` (+ `retreat_shirt_type_size_price`) | Nombre, color, `availableSizes` simple-json, precio base y overrides por talla |
| Pedido por participante | `participant_shirt_size` | Única por (participant, shirtType); lo que pidió al registrarse |
| Reporte | `apps/api/src/services/shirtReportService.ts` → `getShirtOrdersForRetreat` | Query cruda que joinea `participants` + `retreat_participants` (server/partial_server, no cancelados) + `participant_shirt_size` + tipos del retiro + override de precio. **No devuelve flag de confirmación ni teléfono** |
| Tipos del reporte | `packages/types/src/index.ts` L654-697 | `shirtReportShirtSchema`, `shirtReportParticipantSchema`, etc. |
| Vista | `apps/web/src/views/ShirtsReportView.vue` (ruta `shirts-report`, `router/index.ts:310`) | 4 stat cards, tabla con columna por tipo, búsqueda, columna ✓ **print-only** (cuadrito vacío para palomear a mano). Español literal, sin i18n. Llama `getShirtReport` directo, sin store |
| Test de la vista | `apps/web/src/views/__tests__/ShirtsReportView.test.ts` (423 líneas) | Exhaustivo. **Define mocks locales** de lucide/`@/services/api`/`@repo/ui` que pisan los globales de `setup.ts`. Asserts de headers exactos (~L219) y del cuadrito vacío (~L277-287); búsquedas usan `w.find('input')` (el PRIMER input — un input nuevo antes del buscador los rompe) |
| Mensaje de confirmación | Migración `20260910120000_ServerShirtPricingAndConfirmation` | Secuencia "Confirmación de camisetas (servidores)": aviso 21 días antes, recordatorio 7 días antes, cola de WhatsApp del coordinador. **Confirma el pedido (tallas+cargo), no la entrega — es exactamente el flujo cuyo resultado este spec registra** |

## Patrones a reutilizar (flag per-retiro + toggle)

| Patrón | Ruta | Detalle |
|---|---|---|
| Columna flag per-retiro | `retreat_participants.bagMade` (bool), `checkedIn`+`checkedInAt`, `attendanceConfirmation` | La fuente de verdad per-retiro es `retreat_participants`; `Participant` hidrata esos campos como virtuales en query time |
| Endpoint PATCH flag | `apps/api/src/routes/retreatParticipant.routes.ts:113` — `PATCH /history/retreat/:retreatId/participant/:participantId/bag-made` | `isAuthenticated` + `requirePermission('participant:update')` + `requireRetreatAccess('retreatId')` (path param). Controller `updateBagMadeController` (`retreatParticipantController.ts:331`): valida booleano → 400, llama `syncRetreatFields` (`retreatParticipantService.ts:398`, whitelist `RetreatSnapshotFields` L29), emite `emitReceptionBagMade`, `{ ok: true }` |
| Migración ADD COLUMN | `20260422130000_AddBagMadeToRetreatParticipants.ts`, `20260914140000_AddHealthDataPurgedAt.ts` | Guarda `PRAGMA table_info` + `ALTER TABLE ADD COLUMN`; `down()` con `DROP COLUMN` (soportado, better-sqlite3 ≥ 3.35). Auto-descubiertas por `readdirSync` en `database/base-migration-manager.ts:339` |
| Toggle optimista UI | `apps/web/src/views/CommunityAttendanceView.vue` `toggleAttendance` (L257-298) | Guard `savingStates[id]`, flip local inmediato, await API, catch → rollback + toast, finally limpia guard. Sin refetch |
| Link wa.me | `apps/web/src/utils/phone.ts` → `buildWhatsAppChatLink(raw, country)` | Sin `text` abre la conversación real (donde viven las respuestas). `country` resuelve lada (ISO o texto libre; sin país → MX). **Devuelve null sin dígitos: el botón se oculta, no se rende un link muerto** |

## Gotchas verificados

1. **Query cruda → datetime es string**: `getShirtOrdersForRetreat` usa `AppDataSource.query`;
   SQLite devuelve `'2026-09-21 12:00:00.000'` como string. Tipar `string | null` y
   `z.string().nullable()` — `z.coerce.date()` mentiría sobre lo que llega.
2. **`syncRetreatFields` no 404**: `repo.update` con par inexistente afecta 0 filas y responde
   ok (comportamiento heredado de bag-made). La UI solo ofrece toggles sobre filas del reporte
   (el par existe), así que se documenta y no se "arregla".
3. **Mocks locales del spec pisan los globales**: íconos nuevos van en el mock local de lucide
   del spec Y en la allowlist de `apps/web/src/test/setup.ts`.
4. **`w.find('input')`**: 6 tests de búsqueda agarran el primer input; el filtro de pendientes
   debe ser Button/chip, nunca un input/checkbox delante del buscador.
5. **Headers y colspan exactos**: el spec asserta `['#','Nombre',…,'Valor','✓']` (~L219) y el
   "Sin resultados" usa `3 + shirtTypes.length` (~L233) — ambos cambian con la columna nueva.
6. **`@repo/ui` Checkbox/Switch solo `model-value`** (regla `.claude/rules/frontend.md`); el
   badge-toggle es un `<button>`, así que no aplica, pero si se usa Switch sí.
7. **Timestamp de migración** > `20260921200000` (AddCommunityFlyerOptions) para correr después.
8. **`origin/master` estaba 21 commits atrás de HEAD** al crear el branch — el worktree se creó
   desde HEAD local (`a16e4536`), manualmente con `git worktree add` (EnterWorktree default
   usaría origin).

## Gaps

1. No existe columna de confirmación del pedido en `retreat_participants`.
2. El reporte no devuelve teléfono/país — sin ellos no hay link de WhatsApp.
3. La vista no tiene columna de estado clicable, contador de confirmados, ni filtro.
4. La columna ✓ print-only es un cuadrito vacío estático.
