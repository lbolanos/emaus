# Plan: Importar miembros desde un retiro, sin sorpresas

## API

### Autorización (D4)

`requireRetreatAccessOrCreator(param, source = 'params')` acepta también `'body'` y `'query'`,
igual que `requireRetreatAccess`. Los llamadores actuales no cambian (default `'params'`).

```ts
router.get('/:id/members/potential', requireCommunityAccess(),
  requireRetreatAccessOrCreator('retreatId', 'query'), …);
router.post('/:id/members/import', requireCommunityAccess(),
  requireRetreatAccessOrCreator('retreatId', 'body'), validateRequest(importMembersSchema), …);
```

El orden importa: primero la comunidad (403 si no la administra), luego el retiro.

### Normalización compartida

`phoneKey(phone)` privado en `CommunityService`: dígitos, últimos 10, `null` si quedan menos de 7.
`findPhoneCollision` y el listado lo usan, para que el aviso previo (D1) y el salto del import
nunca discrepen.

### Listado (D1)

`getPotentialMembers` y el import comparten `loadMemberPhoneIndex`: una consulta con solo las
columnas de teléfono y nombre de cada miembro, que arma el conjunto de miembros y
`Map<phoneKey, nombre del miembro>` con `resolveMemberProfile` (el teléfono efectivo es overlay ??
participant, como en el trigger). Cada candidato que no es miembro lleva `phoneConflictWith` si su
`phoneKey` está en el mapa.

### Import (D3, D5)

```text
ids    = participantIds sin repetidos
roster = retreat_participants(retreatId) ∩ participants sin dataDeletedAt   -- una consulta
index  = loadMemberPhoneIndex(communityId)                                  -- una consulta
por cada id:
  no está en roster       → skipped not_in_retreat
  ya es miembro           → imported (como hoy)
  teléfono en index       → skipped phone_duplicate_in_community (+ conflictWith)
  tras addMember          → se suma al index (choca con los siguientes del lote)
  addMember
    RAISE del trigger     → skipped phone_duplicate_in_community
    otro error            → skipped error + console.error con participantId
```

`ImportMembersSkip.reason` en `@repo/types` suma `'not_in_retreat' | 'error'`.

El controlador envuelve la llamada: si el servicio lanza (falla global, p. ej. la consulta del
roster), responde 500 con mensaje en español (D7).

## Web

`ImportMembersModal.vue`:

- Fila con `participant.phoneConflictWith`: casilla deshabilitada, texto «Su teléfono ya es de X»
  bajo el correo, fila sin cursor de clic. `toggleParticipant` ignora esas filas y
  `toggleAllFiltered` las excluye (`selectable` = filtrados sin conflicto). Los computed de «todo
  seleccionado» y «algunos» se calculan sobre `selectable`.
- Resultado (D2): `importResult = { imported, skipped }`. Sin saltados: toast + cerrar (como hoy).
  Con saltados: el modal sigue abierto, recarga la lista (`handleRetreatChange`) y muestra un panel
  «Se importaron N. No entraron:» con nombre y motivo legible por `reason`. El panel se limpia al
  cambiar de retiro o cerrar.
- Error: `apiErrorMessage(error, 'No se pudieron importar los participantes')`.

## Tests (D6)

- `setupTestDatabase`: tras `initialize`, `new UniquePhonePerCommunity20260521170000().up(queryRunner)`.
  La migración solo importa `typeorm`, así que se puede cargar desde el setup.
- Factory: teléfono por defecto único por llamada (contador + base de tiempo), en vez de
  `'1234567890'`. Los tests que asertan el número lo pasan explícito.
- `communityService.test.ts`: quitar `CM_PHONE_UNIQ_TRIGGER_SQL` (el setup ya lo instala) si los
  tests siguen pasando sin él.
- Nuevos: roster ajeno (servicio), `phoneConflictWith` (servicio), fila con error (servicio, spy en
  `addMember`), 403 en las dos rutas (rutas, con el mismo patrón que los tests de rutas existentes),
  modal (fila deshabilitada, select-all la salta, panel de resultado, mensaje del servidor).
- Validación final: suite completa del API (`--shard` si muere por memoria) y del web.

## Riesgos

- **La suite completa con el trigger**: cualquier test que cree dos miembros con el mismo teléfono
  explícito se pondrá rojo. Es lo que se busca; si aparece, se corrige el dato del test, no se
  quita el trigger.
- **Admins de comunidad sin acceso al retiro**: hoy podían importar de cualquier retiro. Tras D4 el
  modal solo lista retiros accesibles, así que el flujo normal no cambia; el 403 solo aparece con
  un `retreatId` manipulado.
