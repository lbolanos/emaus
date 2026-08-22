# Plan técnico: retiros "Emaús de parejas"

> El cómo. Requiere haber leído [spec.md](spec.md) y [research.md](research.md).
> Desglose ejecutable en [tasks.md](tasks.md).

## Modelo de datos (una sola migración, todo aditivo — sin recreate-table)

- **`participants.gender`** — varchar nullable `'M'|'F'`. Atributo global de la persona; solo
  lo llena el registro de parejas (esposo→M, esposa→F). En Zod:
  `z.preprocess(''→undefined, z.enum(['M','F']).optional())`.
- **`retreat_participants.spouseParticipantId`** — uuid nullable, columna plana **sin FK
  física** (mismo patrón que `invitedBy`/`tableId`). Apunta al `Participant.id` del otro
  cónyuge. **Simétrico**: ambos lados se escriben siempre en la misma transacción. Índice único
  parcial `(retreatId, spouseParticipantId) WHERE spouseParticipantId IS NOT NULL`.
- **`retreat.couplesShareRoom`** / **`retreat.couplesShareTable`** — boolean `NOT NULL DEFAULT 1`.
  Solo se consultan cuando `retreat_type === 'couples'`.
- **Índice de email relajado** — reemplazar `UQ_participants_email_retreat` por
  `(LOWER(email), retreatId, COALESCE(gender, ''))` con el mismo `WHERE email != ''`:
  - No-parejas tienen `gender NULL` → `''` → comportamiento idéntico al actual.
  - Esposo (M) y esposa (F) pueden compartir email en el mismo retiro.
  - El doble submit de la misma pareja sigue chocando (backstop a nivel DB, por slot de género).

Migración `apps/api/src/migrations/sqlite/<TS>_AddCouplesRetreatSupport.ts`: solo `ALTER TABLE
ADD COLUMN` + `DROP/CREATE INDEX`, valores literales (sin `@repo/types`), `down` reversible que
restaura el índice original.

## API

### Registro de pareja

- **`createCoupleParticipants(retreatId, type, spouseA, spouseB)`** en
  `apps/api/src/services/participantService.ts`, transaccional
  (`AppDataSource.transaction`). **No** reutiliza `createParticipant` dos veces: su lookup por
  email fusionaría a los cónyuges cuando comparten correo. El lookup nuevo es por
  **email + gender**. Responsabilidades:
  - `assertRetreatAcceptsRegistrations` + normalización/validación de teléfonos de ambos.
  - **Capacidad atómica**: si `count + 2 > cap` → ambos con type `waiting` (D8/FR-4).
  - Mismo `family_friend_color` para ambos (reutiliza `COLOR_POOL` — agrupación visual gratis).
  - `spouseParticipantId` simétrico + `idOnRetreat` secuencial.
  - Mesa según config (delegado a `assignTableToCouple`, ver abajo; en M1 puede quedar sin mesa).
- **Ruta** `POST /participants/couple/new` en `participantRoutes.ts`: rate limit público,
  reCAPTCHA, `dryRun`, calcada del `createParticipant` de `participantController.ts:209`.
- **Schema** `createCoupleParticipantSchema` en `packages/types/src/index.ts`:
  `{retreatId, type: z.enum(['walker','server']), spouseA, spouseB, acceptedPrivacyNotice}`
  con spouses basados en `participantSchema.omit({...campos read-only y gender})`.
- Ambos cónyuges reciben el mismo `type` según la URL usada (D1); angelito en pareja solo por
  reclasificación admin (fuera de alcance del formulario público).

### Tarifa (D7/FR-7)

`retreatFeeForType()` (`apps/api/src/utils/retreatCharges.ts`) recibe `retreat_type` y divide
entre 2 el fee (walker: `cost`; server: `serverFeeAmount ?? cost`) cuando es `couples`. Cada
cónyuge lleva su mitad en el ledger de pagos individual existente — cero cambios a esa
maquinaria. JSDoc explícito sobre la semántica.

### Mesas (D3/FR-6)

- Nuevo `assignTableToCouple(spouseA, spouseB, retreat)` en `tableMesaService.ts`:
  - `couplesShareTable=true`: una mesa con ≥2 lugares libres, respetando `invitedBy` y
    `checkTableTagConflict` para ambos; se sientan juntos.
  - `false`: asignación individual con exclusión mutua de mesa (mismo mecanismo que `invitedBy`;
    `assignTableToWalker` gana opción `excludeTableIds`).
- `rebalanceTablesForRetreat`: procesa parejas primero como unidades (juntas) o agrega la mesa
  del cónyuge a la exclusión (separadas), antes del loop individual existente.
- Endpoints manuales (`assignWalkerToTable`/`assignLeaderToTable`): devuelven `warning` suave
  cuando la asignación contradice la config (consistente con el patrón actual: tags bloquean,
  familia/amigos avisa). `TableCard.vue` muestra el aviso (extiende el check client-side de
  `family_friend_color`).

### Camas (D2/FR-5)

- **`couplesShareRoom=false`** → filtro **duro** por género: nuevo
  `buildRoomGenderStatusMap(retreatBedRepository, retreatId)` (análogo a
  `buildRoomSnoreStatusMap`; el primer ocupante fija el género de la habitación) y exclusión de
  habitaciones en conflicto en la query de `assignBedToParticipant` — hard como `defaultUsage`,
  no soft como ronquidos, porque mezclar géneros en dormitorio no es "subóptimo", es inválido.
- **`couplesShareRoom=true`** → `assignBedsToCouple(spouseA, spouseB, ...)`: elige la
  habitación (agrupada por floor+roomNumber, con `defaultUsage` compatible) con ≥2 camas libres
  que **maximice la suma** de `scoreBedForParticipant` de ambos; asigna atómico.
  `autoAssignBedsForRetreat` procesa parejas primero y deja a los sueltos (y a cónyuges sin
  espacio par) en el loop individual existente.
- Manual (`assignParticipantToBed`): rechazo claro si viola género (config `false`); warning
  suave si separa a la pareja (config `true`).
- UI: indicador de pareja en `BedCard.vue`/`CompactBedCard.vue`/`RoomCard.vue` (análogo al
  borde `family_friend_color`) + dimming de camas incompatibles por género en
  `bedAssignmentUtils.ts` (`computeIncompatibleBedIds`) consumido por `useTapAssign.ts`.

## Web

- **Dispatcher** `apps/web/src/views/RegistrationEntryView.vue` en las 3 rutas de registro
  (`/register/:type/:retreatId`, `/:slug`, `/:slug/server`): resuelve el retiro; con
  `retreat_type==='couples'` monta `CoupleRegistrationView.vue`, si no monta
  `ParticipantRegistrationView.vue` **sin tocarlo** (FR-10: cero riesgo de regresión).
- **`CoupleRegistrationView.vue`** (nuevo): pasos compartidos una vez (dirección
  `Step2AddressInfo`, invitador, pickup), pasos por cónyuge reutilizando `Step1PersonalInfo`,
  `Step3ServiceInfo`, playera (gender implícito por slot esposo/esposa, no picker); contacto de
  emergencia compartido con toggle "usar contactos diferentes" (`Step4EmergencyContact` ×2);
  resumen lado a lado. Draft `registration-draft:couple:{type}:{retreatId|slug}`.
- **`RetreatModal.vue`**: switches `couplesShareRoom`/`couplesShareTable` con
  `v-if="formData.retreat_type === 'couples'"`.
- **Admin**: `findAllParticipants` agrega `spouseName`/`spouseParticipantId` (LEFT JOIN, mismo
  mecanismo que `messageCount`); columna + filtro "con pareja vinculada" en
  `ParticipantList.vue`; `ExportParticipantsModal.vue` lo hereda. Campo gender en el modal de
  edición para retiros `couples`. Badge en admin cuando un cónyuge está cancelado y el otro no.
- **Flyer**: logo propio de parejas en `PublicRetreatFlyerModal.vue` (hoy cae al de hombres).

## Plantillas (FR-8)

Scope `{spouse.*}` en `packages/utils/src/index.ts`: `SpouseData` (subset de `ParticipantData`),
`buildSpouseReplacements`, argumento opcional en `replaceAllVariables` (backward compatible).
Picker: nueva categoría en `BaseMessageTemplateModal.vue`. Seguir la receta del skill
`template-variables` (type → builder → mock → picker).

## Reglas de integridad

| Caso | Manejo |
| --- | --- |
| Un cónyuge cancela | Solo su `isCancelled`; vínculo conservado; badge en admin (FR-2) |
| Promoción de waiting | Atómica en el cambio de type: se espeja al cónyuge en la misma transacción, o se rechaza (FR-4) |
| Doble submit de pareja | Índice email+retiro+gender bloquea; lookup email+gender reutiliza en vez de duplicar (FR-3) |
| Pareja mixta walker/server | Solo por override manual admin; camas/mesas best-effort con warning |
| Borrado de datos (`dataDeleteToken`) | Nullear `spouseParticipantId` de toda fila que apunte al borrado |
| Cónyuges en la misma comunidad | Riesgo futuro con el guard de celular único por comunidad — documentado |

## Verificación end-to-end

1. Backup local (`sqlite3 .backup`) → `pnpm --filter api migration:run`.
2. Dev del worktree (`bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh`,
   API :3002 / web :5174, DB aislada): crear retiro `couples`, registrar pareja con email
   compartido → dos participantes vinculados, mismo color; llenar el cupo → la siguiente pareja
   cae completa a `waiting`.
3. Auto-asignar camas y mesas con ambas configs y verificar en la UI (incluyendo warnings
   manuales).
4. `pnpm build` (regla del bundle ESM del api) + suites Jest/Vitest afectadas (una corrida de
   jest a la vez).
