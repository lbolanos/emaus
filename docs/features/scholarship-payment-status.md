# Estado de pago "Becado" + campos por-retiro

Cómo se distingue a un participante becado en la lista de participantes y en el módulo de pagos, y qué otros campos del participante ahora son **per-retiro** en lugar de globales.

## Problema

Antes, cuando un participante tenía `isScholarship = true`, el getter
`paymentStatus` devolvía `'paid'`. En la UI aparecía idéntico a alguien que
había pagado completo (`✅ Pagado`), perdiéndose la información de que su
costo estaba cubierto por una beca.

## Comportamiento actual

`paymentStatus` puede ahora devolver uno de cinco valores:

| Valor          | Cuándo                                            | UI            |
|----------------|---------------------------------------------------|---------------|
| `overpaid`     | `totalPaid > costo` (incluso si es becado)        | 💰 Sobrepagado|
| `scholarship`  | `isScholarship == true` y NO sobre-pagado         | 🎓 Becado     |
| `paid`         | `totalPaid == costo` y NO becado                  | ✅ Pagado     |
| `partial`      | `0 < totalPaid < costo` y NO becado               | ⚠️ Parcial    |
| `unpaid`       | `totalPaid == 0` y NO becado                      | ❌ No pagado  |

### Precedencia

1. **`overpaid` gana sobre todo** (incluso `scholarship`). Si un becado
   terminó pagando más del costo del retiro, esa información tiene que ser
   visible para que el coordinador la concilie.
2. **`scholarship` gana sobre `paid`/`partial`/`unpaid`.** Un becado que
   pagó parcialmente o nada sigue siendo `scholarship`; la columna
   `totalPaid` muestra su monto real, así que la beca y los pagos no se
   pierden visualmente.
3. Para los demás participantes, se compara `totalPaid` contra el costo del
   retiro como antes.

`paymentRemaining` devuelve `0` para becados.

## Marcar como becado desde Gestión de Pagos

En `/app/payments` el modal "Agregar Pago" incluye un botón
**🎓 Marcar como Becado** (sólo al crear, no al editar). Flujo:

1. El usuario selecciona un participante en el modal.
2. Hace clic en **🎓 Marcar como Becado** (habilitado tras seleccionar).
3. Confirma en el `window.confirm`.
4. El frontend llama a `participantStore.updateParticipant(id, { isScholarship: true })`.
5. **No se registra ningún pago.** El modal se cierra y la lista de
   participantes se refresca.

Esto evita que un coordinador registre un "pago parcial" simbólico para
representar una beca.

## Campo "Monto Becado" (`scholarshipAmount`)

Campo financiero sensible que registra el **monto** que cubre la beca de un
participante en un retiro específico. Visible y editable solo para roles con
permiso explícito.

### Dónde viven los datos (per-retiro)

15 campos viven ahora en `retreat_participants`, NO en `participants`. Razón:
una persona puede asistir a varios retiros con condiciones distintas (becada
en uno, paga completa en otro; invitada por persona X en uno y por Y en el
siguiente; etc.). Los pagos ya estaban modelados per-retiro
(`payment.participantId` + `payment.retreatId`); los campos asociados ahora
también lo están.

**Campos movidos a `retreat_participants`** (ver migración
`20260504120000_MovePerRetreatFieldsToRetreatParticipants`):

| Grupo | Campos |
|---|---|
| Beca | `isScholarship`, `scholarshipAmount` |
| Palancas | `palancasCoordinator`, `palancasRequested`, `palancasReceived`, `palancasNotes` |
| Invitador | `invitedBy`, `isInvitedByEmausMember`, `inviterHomePhone`, `inviterWorkPhone`, `inviterCellPhone`, `inviterEmail` |
| Logística | `pickupLocation`, `arrivesOnOwn`, `requestsSingleRoom` |

**Excluidos del scope** (manejados por otros sistemas):
- `tshirtSize`, `needsWhiteShirt`, `needsBlueShirt`, `needsJacket` — ya son
  per-retiro vía `participant_shirt_size` (entidad nueva). Ver
  `docs/shirt-types.md`.

Cómo funciona:
- **Tabla canónica**: `retreat_participants` (junction).
- **Hidratación** (`participantService.findAllParticipants` y
  `findParticipantById`): overlay desde `retreat_participants` al objeto
  `Participant` cuando hay `retreatId` activo. Mismo patrón que `type`,
  `isCancelled`, `bagMade`, `idOnRetreat`, `familyFriendColor`.
- **Escritura via update** (`updateParticipant`): separa los 15 campos
  retreat-scoped y los envía a `syncRetreatFields(participantId, retreatId,
  { ... })`.
- **Escritura via create** (`createParticipant`): copia los 15 campos del
  payload de registro al `RetreatParticipant` row recién creado.
- **`isScholarship` y `scholarshipAmount`**: virtuales en `Participant`
  (sin `@Column`) — `participants` NO mantiene copia.
- **Otros 13 campos**: tienen `@Column` legacy en `Participant` por
  compatibilidad hacia atrás con código que aún lee `participants.X`. La
  fuente de verdad sigue siendo `retreat_participants` vía overlay.

Migración consolidada:
- `20260504120000_MovePerRetreatFieldsToRetreatParticipants.ts` — agrega 15
  columnas en `retreat_participants`, backfillea desde `participants`, crea
  el permiso `participant:viewScholarshipAmount` y lo concede a `admin` y
  `treasurer`. Idempotente (chequea columnas/permisos antes de crear).

### Permiso

`participant:viewScholarshipAmount` — concedido por la migración
`20260425120000_AddScholarshipAmount` a los roles **`admin`** y
**`treasurer`** únicamente. (En esta base de roles, "coordinador" se modela
como el `admin` retreat-scoped.) Los roles `logistics` y `communications`
**no** ven este campo.

### Quién ve `totalPaid` (estado actual)

Para contraste con el nuevo campo: `totalPaid` se serializa siempre que el
participante se devuelve por la API. El acceso al endpoint requiere
`participant:list`, que tienen casi todos los roles (admin, treasurer,
logistics, communications, regular_server). En la práctica, **`totalPaid`
es visible para todos los que pueden ver la lista de participantes**.
`scholarshipAmount` es el campo que está estrictamente restringido.

### Filtrado en el backend

`apps/api/src/controllers/participantController.ts`:

- Helper `canViewScholarshipAmount(req)` consulta
  `authorizationService.hasPermission(userId, 'participant:viewScholarshipAmount')`.
- `stripScholarshipAmount(data)` elimina la propiedad de un objeto o array
  (recursivo). Llama a `toJSON()` si la entrada es una entity instance.
- Aplicado en `getAllParticipants`, `getParticipantById` y
  `updateParticipant`.
- En `updateParticipant`, si el cliente envía `scholarshipAmount` sin tener
  el permiso, el campo se **descarta silenciosamente** del body antes de
  llamar al servicio (no se devuelve 403 para no filtrar la existencia del
  campo).

### Frontend

- `ParticipantList.vue`: `allColumns` ahora es un `computed` que filtra
  `scholarshipAmount` cuando `useAuthPermissions().hasPerm('participant:viewScholarshipAmount')`
  es falso. La columna se formatea como moneda (`Intl.NumberFormat` MXN).
- `EditParticipantForm.vue`: `scholarshipAmount` está en el grupo
  `financial`. Como el formulario sólo renderiza columnas que están en
  `columnsToShow` (derivado de `allColumns`), el campo queda oculto para
  usuarios sin permiso. Tipo de input: `number` con `step="0.01"` y
  `min="0"`.
- Etiquetas i18n: `participants.fields.scholarshipAmount` (es: "Monto
  Becado", en: "Scholarship Amount").

### Esquema (Zod)

`packages/types/src/index.ts` — el campo es opcional, nullable y se
preprocesa de `''`/`null`/`undefined` → `null`, luego `Number(val)`.

## Filtros y selección de retiro

- El filtro `paymentStatus` en `FilterDialog.vue` incluye la opción "Becado".
- La página `/app/payments` ya no tiene un selector de retiro propio: toma
  `retreatStore.selectedRetreatId` del sidebar y se actualiza cuando éste
  cambia (watcher en el componente).

## Archivos

### Backend
- `apps/api/src/entities/participant.entity.ts` — getter `paymentStatus`
  (línea ~313): retorna `'scholarship'` cuando `isScholarship` es `true`.

### Frontend
- `apps/web/src/components/ParticipantList.vue` — `statusMap` y template del
  indicador (color azul `text-blue-600`, emoji 🎓).
- `apps/web/src/components/FilterDialog.vue` — opción de filtro.
- `apps/web/src/components/PaymentManagement.vue` — botón "Marcar como
  Becado" + uso de `retreatStore.selectedRetreatId`.
- `apps/web/src/locales/{es,en}.json` — traducciones
  `participants.filters.options.paymentStatus.scholarship`.

## Tests

`apps/api/src/tests/services/paymentStatus.test.ts` (32 casos):

- `paymentStatus` retorna `'scholarship'` cuando `isScholarship = true`,
  con o sin pagos.
- Casos `paid`, `partial`, `unpaid`, `overpaid` con varios montos y
  combinaciones.
- Parseo de `retreat.cost` con símbolos de moneda (`$1,500.00`).
- `paymentRemaining` para becados (siempre 0) y no negativo en sobrepago.
- `toJSON()` propaga `'scholarship'` correctamente.

Ejecutar:

```bash
pnpm --filter api exec jest src/tests/services/paymentStatus.test.ts
```

## Verificación manual

1. `pnpm dev`.
2. Abrir un retiro en el sidebar y entrar a `/app/payments`.
3. Confirmar que ya no aparece el selector de "Retiro" en los filtros.
4. Cambiar el retiro en el sidebar y verificar que la tabla de pagos y el
   resumen se actualizan automáticamente.
5. Clic en "Agregar Pago" → seleccionar un participante → "🎓 Marcar como
   Becado" → confirmar.
6. Ir a la lista de participantes: el participante ahora muestra `$0.00` (o
   su monto real) seguido de 🎓 azul, y al filtrar por estado "Becado"
   aparece en el resultado.
