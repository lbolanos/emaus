# Research: estado actual del sistema frente a retiros de parejas

> Investigación del 2026-08-22 sobre `master` (ca088c5). Ver [spec.md](spec.md) para el qué,
> [plan.md](plan.md) para el cómo.

## Lo que ya existe (reutilizable)

- **`retreat_type`** (`apps/api/src/entities/retreat.entity.ts`, varchar opcional; enum Zod
  `'men'|'women'|'couples'|'effeta'` en `packages/types/src/index.ts`). **Puramente cosmético**:
  solo elige logo/colores/etiquetas en `RetreatModal.vue`, `RoomsView.vue`, `BadgesView.vue`,
  `RetreatFlyerView.vue`, `RetreatMemoryCard.vue`, `CommunityTemplateImportModal.vue`. Ningún
  servicio del API lo lee. i18n ya trae "Matrimonios"/"Couples".
- **`Participant.maritalStatus`** (`'S'|'C'|'D'|'V'|'O'`) ya se captura en el paso 1 del
  registro (`Step1PersonalInfo.vue`).
- **Patrón overlay per-retiro**: `retreat_participants` (`retreatParticipant.entity.ts`) guarda
  `type`, `tableId`, `familyFriendColor`, `isCancelled`, beca, invitador, etc. — es el patrón
  establecido para datos de una persona que varían por retiro.
- **Mecanismos "keep apart"** (a invertir/reusar): `family_friend_color` agrupa por
  invitador/teléfono/apellido para separar en mesas (bloqueo **solo client-side** en
  `TableCard.vue`); `checkTableTagConflict` (tags) es el único enforced server-side.
- **Wizard de registro** de 6 pasos con componentes Step reutilizables
  (`apps/web/src/components/registration/Step*.vue`) y validación de teléfonos por país de la
  casa del retiro.

## Gaps estructurales

1. **No existe primitivo "pareja"**: ningún FK/agrupador entre dos `Participant` — ni en
   `RetreatParticipant`, `RetreatBed`, `TableMesa` ni `CommunityMember`.
2. **No existe campo de género** en ninguna entidad. Los retiros de un solo género funcionan
   por convención organizativa, no por dato (verificado con grep exhaustivo:
   gender/sexo/género no aparecen en lógica de negocio).
3. **El registro público es individual**: un submit = un `Participant`
   (`ParticipantRegistrationView.vue`, 1331 líneas; `type` decidido por la URL). Draft en
   localStorage `registration-draft:{type}:{retreatId|slug}`.
4. **Email único por retiro**: índice `(LOWER(email), retreatId)` sobre `participants`
   (migración `20260408130000_AddUniqueEmailRetreatToParticipants.ts`) + guard
   `assertNotDoubleRegisteredInRetreat`. Además, el lookup por email de `createParticipant`
   (`participantService.ts` ~1619) **fusionaría al cónyuge B sobre el A** si comparten correo —
   el pitfall más importante detectado.
5. **Capacidad por individuo**: `max_walkers`/`max_servers`; el exceso degrada a `waiting` por
   persona (`participantService.ts` ~1975-2016). Sin admisión atómica.
6. **Camas**: scoring individual en `participantService.ts` (`scoreBedForParticipant`,
   `autoAssignBedsForRetreat`): sigmoide de edad → preferencia de tipo de cama, penalización de
   piso por edad, estado de ronquidos por habitación (`buildRoomSnoreStatusMap`, soft ±25/30),
   filtro **duro** por `defaultUsage` caminante/servidor. La asignación manual
   (`assignParticipantToBed`, `retreatBedController.ts`) casi no valida nada. Camas 1:1 con
   participante; la "habitación" solo existe agrupando por (floor, roomNumber).
7. **Mesas**: `assignTableToWalker` (registro) y `rebalanceTablesForRetreat`
   (`tableMesaService.ts`, `MAX_WALKERS_PER_TABLE=7`) solo tienen lógica de **exclusión**
   (`invitedBy`, tags). No existe ningún "mantener juntos" en todo el codebase.
8. **Plantillas**: scopes `{participant.*}`, `{retreat.*}`, `{community.*}`, `{table.*}`,
   `{preparations.*}` en `packages/utils/src/index.ts`. No hay `{spouse.*}`; todo mensaje asume
   destinatario individual.
9. **UI admin**: `ParticipantList.vue` (~50 columnas) y `ExportParticipantsModal.vue` sin
   columna/filtro/indicador de cónyuge; vistas de camas/mesas sin señal de pareja.
10. **Bug cosmético existente**: `PublicRetreatFlyerModal.vue` (~línea 241) no maneja
    `couples` y cae al logo de hombres.
11. **Tarifas**: `retreatFeeForType()` (`apps/api/src/utils/retreatCharges.ts:30`) solo
    conoce walker/server/partial_server.

## Datos verificados que condicionan el diseño

- Nombres reales de tablas: `retreat` (singular), `participants`, `retreat_participants`.
- Las columnas post-launch de `retreat_participants` se agregaron con `ADD COLUMN` plano, sin
  FK física (precedente: `attendanceConfirmation`, `checkedInAt`) → el vínculo de pareja puede
  seguir el mismo patrón sin recreate-table.
- SQLite ya usa índices de expresión aquí (`LOWER(email)`) → `COALESCE(gender,'')` es viable.
- `Participant.type` es virtual (fuente de verdad: `retreat_participants.type`).
