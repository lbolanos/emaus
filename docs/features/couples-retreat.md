# Retiros "Emaús de parejas" (retreat_type = 'couples')

> Estado: **implementado** en el branch `feature/couples-retreat` (2026-08-22).
> Diseño y proceso SDD en `specs/couples-retreat/` (spec / research / plan / tasks).

Matrimonios que se inscriben, asisten y sirven juntos. Antes de esta feature,
`retreat_type='couples'` era una etiqueta cosmética (logos/colores); ahora activa
comportamiento real en registro, capacidad, camas, mesas y plantillas.

## Modelo de datos

- `participants.gender` (`'M'|'F'`, nullable): solo lo llena el registro de parejas
  (esposo→M, esposa→F). En los demás retiros queda NULL.
- `retreat_participants.spouseParticipantId` (uuid nullable, sin FK física): vínculo
  **simétrico** al `Participant.id` del otro cónyuge en ese retiro. Ambos lados se escriben
  en la misma transacción. Índice único parcial `(retreatId, spouseParticipantId)`.
- `retreat.couplesShareRoom` / `retreat.couplesShareTable` (boolean, default true):
  configuración por retiro, editable en `RetreatModal` (solo visible con type couples).
- Índice de email relajado: `UQ_participants_email_retreat` es
  `(LOWER(email), retreatId, COALESCE(gender,''))` — un matrimonio puede compartir email
  en el mismo retiro; cualquier otro duplicado sigue bloqueado (los no-parejas tienen
  gender NULL → comportamiento idéntico al histórico).
- Migración: `apps/api/src/migrations/sqlite/20260822130000_AddCouplesRetreatSupport.ts`
  (aditiva, reversible).

## Registro público de pareja

- Las 3 rutas públicas de registro pasan por `RegistrationEntryView.vue` (dispatcher):
  con `retreat_type='couples'` montan `CoupleRegistrationView.vue`; si no, el
  `ParticipantRegistrationView.vue` de siempre (intacto).
- Wizard de 8 pasos reutilizando los Steps del registro individual: datos personales y
  salud **por cónyuge**; dirección, contactos de emergencia (con toggle para separarlos)
  e invitador **compartidos**; tallas él/ella; resumen lado a lado. Draft en localStorage
  (`registration-draft:couple:{type}:{retreatId|slug}`), dryRun con `?test=true`.
- API: `POST /participants/couple/new` (reCAPTCHA, teléfonos por país del retiro para
  ambos, dryRun) → `createCoupleParticipants`:
  - **No** reutiliza el lookup por email del alta individual (fusionaría a los cónyuges
    con email compartido); el reuso es por **email+gender**, con fallback a la fila
    histórica sin gender solo si coincide el nombre.
  - **Capacidad atómica**: la pareja necesita 2 lugares; si no caben, AMBOS quedan en
    `waiting`. La promoción/regreso a waiting también se espeja al cónyuge
    (`updateParticipant`); cambios de rol que no tocan waiting no se espejan.
  - Mismo `family_friend_color` para ambos, mesa según config, angelito en pareja solo
    por reclasificación admin.

## Asignaciones

- **Camas** (`participantService`): con `couplesShareRoom=true`, `assignBedsToCouple`
  coloca a la pareja como unidad en la habitación con 2 camas libres que maximiza la suma
  de scores; `autoAssignBedsForRetreat` procesa parejas primero. Con `false`, filtro
  **duro** por género (`buildRoomGenderStatusMap`, análogo al de ronquidos pero hard como
  `defaultUsage`): ninguna habitación mezcla géneros — también en la asignación manual
  (422) y con dimming en tap-to-assign (`computeGenderIncompatibleBedIds`).
- **Mesas** (`tableMesaService`): el registro asigna mesa según config
  (`pickTablesForCouple`); `rebalanceTablesForRetreat` sienta parejas primero (juntas) o
  excluye la mesa del cónyuge (separadas, mismo mecanismo que `invitedBy`). La asignación
  manual que contradice la config devuelve `warning` (toast en la UI, sin bloquear).

## Tarifas

`retreatFeeForType()`: en retiros couples, `cost` y `serverFeeAmount` son el monto
**por pareja** → cada cónyuge carga la mitad en su ledger individual. Un pago contra un
cónyuge abona solo a su mitad. Hint en el campo Costo del `RetreatModal`.

## Plantillas

Scope `{spouse.*}` (`firstName`, `lastName`, `fullName`, `nickname`, `email`,
`cellPhone`) en `packages/utils` — categoría "Cónyuge" en el picker. Resuelve en
`MessageDialog` cuando el destinatario tiene pareja vinculada (busca al cónyuge en el
participantStore); en otros contextos queda literal, igual que `community.*`/`table.*`.

## Admin

- `ParticipantList`: columnas `gender` y `spouseName` (export incluido) + filtro por
  género; campo gender editable en el form de edición.
- El borrado de datos (LFPDPPP) desvincula `spouseParticipantId` de toda fila que apunte
  al participante anonimizado.
- Flyer público: logo neutro (cruz) para couples en `PublicRetreatFlyerModal` (antes caía
  al de hombres).

## Casos borde

| Caso | Comportamiento |
| --- | --- |
| Un cónyuge cancela | Solo su `isCancelled`; el vínculo se conserva |
| Doble submit de la pareja | 409 (guard + índice email+retiro+gender) |
| Pareja mixta walker/server | Solo por override manual admin; asignaciones best-effort |
| Cónyuges luego en la misma comunidad | Riesgo con el guard de celular único por comunidad si comparten teléfono (pendiente en el módulo de comunidad) |

## Tests

- Jest: `addCouplesRetreatSupport.test.ts` (migración/índices),
  `coupleRegistration.test.ts` (servicio, dry-run, tarifa, anonimización),
  `coupleAssignments.test.ts` (camas, mesas, promoción atómica).
- Vitest: `RegistrationEntryView.test.ts`, `CoupleRegistrationView.test.ts`,
  `spouseVariables.test.ts`.
