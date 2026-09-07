# Tasks: retiros "Emaús de parejas"

> Desglose ejecutable del [plan.md](plan.md). Convención: `[P]` = paralelizable con las tareas
> de su mismo bloque; sin marca = depende de la anterior. Cada milestone es mergeable por
> separado y no rompe los retiros existentes (FR-10).

## M1 — Modelo de datos + registro

**Criterio de cierre**: una pareja se registra end-to-end por el link público (email
compartido, capacidad atómica) y los retiros existentes no cambian. Camas/mesas siguen con
lógica individual (el admin corrige a mano hasta M2).

- [x] **T1. Migración `AddCouplesRetreatSupport`** —
  `apps/api/src/migrations/sqlite/<TS>_AddCouplesRetreatSupport.ts`: `participants.gender`,
  `retreat_participants.spouseParticipantId` + índice único parcial,
  `retreat.couplesShareRoom`/`couplesShareTable`, reemplazo del índice
  `UQ_participants_email_retreat` por la versión con `COALESCE(gender,'')`. Down reversible.
  Cargar skill `sqlite-migrations` antes de escribirla.
- [x] **T2. Entidades** [P con T3] — `gender` en `participant.entity.ts`,
  `spouseParticipantId` en `retreatParticipant.entity.ts` (columna plana),
  `couplesShareRoom`/`couplesShareTable` en `retreat.entity.ts`.
- [x] **T3. Zod en `packages/types`** [P con T2] — `gender` con preprocess en
  `participantSchema`; flags en `retreatSchema`; nuevo `createCoupleParticipantSchema`.
  Tras editar types: `touch apps/api/src/index.ts` para que el API dev recargue.
- [x] **T4. Test de índice relajado** — jest: duplicado individual sigue bloqueado; pareja M/F
  con mismo email pasa; tercer M con mismo email bloqueado.
- [x] **T5. `createCoupleParticipants`** en `participantService.ts` — transaccional, lookup
  email+gender, capacidad atómica, color compartido, vínculo simétrico, `idOnRetreat`.
- [x] **T6. Controller + ruta** — `createCoupleParticipant` en `participantController.ts`
  (reCAPTCHA, teléfonos ×2, dryRun) + `POST /participants/couple/new` en `participantRoutes.ts`.
- [x] **T7. Tests de servicio** — jest: happy path, atómico a waiting (ambos), simetría,
  reuso email+gender en segundo retiro, cancelación de un solo lado no toca al otro.
- [x] **T8. Tarifa por pareja** [P con T5–T7] — `retreatFeeForType()` con `retreat_type` +
  test jest de la partición walker/server.
- [x] **T9. Dispatcher `RegistrationEntryView.vue`** — reemplaza el component de las 3 rutas en
  `router/index.ts`; `ParticipantRegistrationView.vue` queda intacto. Test vitest de despacho.
- [x] **T10. `CoupleRegistrationView.vue`** — wizard de pareja reutilizando los Step existentes
  (compartidos: dirección/invitador/pickup; por cónyuge: personal/servicio/playera; emergencia
  con toggle; resumen lado a lado). Draft `registration-draft:couple:{type}:{retreatId|slug}`.
  Store: `createCoupleParticipant` en `participantStore.ts`. Tests vitest (navegación,
  propagación de compartidos, draft).
- [x] **T11. Switches en `RetreatModal.vue`** [P con T9–T10] — `couplesShareRoom`/
  `couplesShareTable` visibles solo con type `couples`; wire a formData y payload.
- [x] **T12. i18n M1** — claves es/en del wizard de pareja y los switches. Íconos lucide
  nuevos → allowlist del mock en `apps/web/src/test/setup.ts`.
- [x] **T13. Verificación M1** — migración sobre copia local con backup; e2e manual en el dev
  del worktree (registro de pareja, email compartido, cupo atómico); `pnpm build`;
  `landingPublicContent.test.ts` verde.

## M2 — Asignaciones

**Criterio de cierre**: camas y mesas respetan la config del retiro en auto, rebalance y
manual; la promoción de lista de espera es atómica.

- [x] **T14. `buildRoomGenderStatusMap` + filtro duro** — en `participantService.ts`, activo
  cuando `couplesShareRoom=false`; también en `assignParticipantToBed` manual (rechazo). Tests.
- [x] **T15. `assignBedsToCouple` + parejas primero en `autoAssignBedsForRetreat`** — habitación
  con ≥2 camas libres maximizando la suma de scores; fallback al loop individual. Tests.
- [x] **T16. Mesas: `assignTableToCouple` + `excludeTableIds` en `assignTableToWalker`** — en
  `tableMesaService.ts`/`participantService.ts`. Tests de juntos/separados.
- [x] **T17. Rebalance couple-aware** — `rebalanceTablesForRetreat` procesa parejas primero
  (juntas) o con exclusión mutua (separadas). Tests.
- [x] **T18. Warnings manuales** [P con T19] — `warning` en responses de
  `assignWalkerToTable`/`assignParticipantToBed` cuando contradicen la config; toast en
  `TableCard.vue` (extiende el check de `family_friend_color`).
- [x] **T19. UI de camas** [P con T18] — indicador de pareja en `BedCard.vue`/
  `CompactBedCard.vue`/`RoomCard.vue`; dimming por género en `bedAssignmentUtils.ts` +
  `useTapAssign.ts`. Tests vitest.
- [x] **T20. Promoción atómica de waiting** — el cambio de type espeja al cónyuge en la misma
  transacción (o rechaza si no hay 2 lugares). Tests.

## M3 — Plantillas + pulido

- [x] **T21. Scope `{spouse.*}`** — `buildSpouseReplacements` + arg opcional en
  `replaceAllVariables` (`packages/utils`); categoría en el picker de
  `BaseMessageTemplateModal.vue`; seguir la receta del skill `template-variables`. Tests.
- [x] **T22. Logo de parejas en flyer** [P] — asset nuevo + branch `couples` en
  `PublicRetreatFlyerModal.vue` (hoy cae al logo de hombres).
- [x] **T23. Columna/filtro/export de cónyuge** [P] — JOIN en `findAllParticipants`, columna y
  filtro en `ParticipantList.vue`, export heredado; badge de cónyuge cancelado. Tests.
- [x] **T24. Campo gender en modal admin** [P] — para corrección/alta manual en retiros
  `couples`.
- [x] **T25. Limpieza en borrado de datos** [P] — `deleteParticipantByDeleteToken` nullea
  `spouseParticipantId` de filas que apunten al borrado. Test.
- [x] **T26. i18n M3 + etiqueta "por pareja"** — donde se muestre el costo a admins y en el
  flyer del retiro; **nunca montos en la landing pública** (guard
  `landingPublicContent.test.ts`).
- [x] **T27. Doc de feature** — reescribir `docs/features/couples-retreat.md` como doc de la
  feature implementada (el stub actual apunta a esta spec).

## Desviaciones respecto al plan (implementación real)

- **T16**: no se exportó un `assignTableToCouple` genérico; el registro usa
  `pickTablesForCouple` (participantService) y el rebalance lleva su propia lógica de
  parejas-primero/exclusión — cubren los mismos casos con menos superficie.
- **T19**: el "indicador de pareja" en camas/mesas lo da el `family_friend_color`
  compartido que ya reciben ambos cónyuges al registrarse (sin UI nueva); lo nuevo es el
  dimming por género.
- **T20**: el espejo de promoción es best-effort dentro del mismo request (updateParticipant
  no es transaccional de punta a punta hoy); solo transiciones que tocan `waiting`.
- **T23**: el filtro implementado es por `gender` (M/F); el vínculo se ve/exporta con la
  columna `spouseName`. No se agregó filtro booleano "con pareja vinculada".
- **T24**: `gender` se edita como campo del form genérico (texto M/F), consistente con cómo
  ese form edita `maritalStatus`.
- **T22**: se reutilizó el asset existente `/crossRoseButtT.png` (mismo que RoomsView usa
  para couples); no se creó asset nuevo.

## Dependencias entre milestones

- M1 es prerequisito de M2 y M3 (modelo de datos + vínculo).
- M2 y M3 son independientes entre sí — pueden ir en paralelo tras M1.
- Dentro de M1: T1→T2/T3→T4→T5→T6→T7; T8 en paralelo desde T3; T9→T10; T11–T12 en paralelo.
