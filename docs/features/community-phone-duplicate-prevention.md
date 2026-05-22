# Comunidad — Prevención de teléfono duplicado

Validación en dos capas (código + BD) para garantizar que no haya dos miembros con el mismo `cellPhone` en la misma comunidad.

## Por qué

Incidente real (mayo 2026): la comunidad "Buen despacho" tenía 2 perfiles `Jose Fernando Marin Soto` y `Jose Fernando Marin soto` con el mismo tel `5524219733` (emails distintos: `imgfmarin@` vs `ingfmarin@`). El bot Jessy, al matchear asistencia por teléfono, encontraba 2 candidatos ambiguos. Resultado: fricción en el flujo automático + sospecha de bug.

Análisis: la validación de **email** ya existía (`EMAIL_DUPLICATE_IN_COMMUNITY`) pero la equivalente para **teléfono** no. Cualquier capture vía UI, bulk add, o foto podía crear duplicados.

## Solución — dos capas

### 1. Validación en código (capa principal)

`CommunityService.findPhoneCollision(communityId, cellPhone, excludeMemberId?)` (`apps/api/src/services/communityService.ts`):

- Toma todos los miembros de la comunidad con su `participant`.
- Calcula el `cellPhone` **efectivo** = `COALESCE(overlay, participant.cellPhone)`.
- Normaliza a últimos 10 dígitos (ignora espacios, guiones, +52).
- Compara contra el query; devuelve el primer miembro que colisione (o `null`).

Llamada desde 3 puntos:

| Método | Comportamiento |
|---|---|
| `createCommunityMember` | `throw 'PHONE_DUPLICATE_IN_COMMUNITY'` antes de crear el `Participant` |
| `bulkAddMembers` | Marca la entrada como `skipped: 'phone_duplicate_in_community'` y sigue con las demás |
| `updateMemberProfile` | `throw 'PHONE_DUPLICATE_IN_COMMUNITY'` solo si el tel **cambia** respecto al efectivo actual |

El controlador (`communityController.ts`) traduce ambos errores a HTTP **409** con `code: 'PHONE_DUPLICATE_IN_COMMUNITY'` y mensaje en español.

### 2. Trigger SQLite (safety net)

Migration `20260521170000_UniquePhonePerCommunity.ts`. Schema-only (no toca data, no requiere `transaction = false`):

**a) UNIQUE INDEX parcial** sobre `community_member.cellPhone` (overlay), normalizado a últimos 10 dígitos. Solo aplica cuando overlay ≠ NULL — cubre duplicados de overlay-vs-overlay.

**b) Triggers BEFORE INSERT/UPDATE** que validan el `cellPhone` efectivo (`COALESCE(overlay, participant.cellPhone)`) contra otros miembros de la misma comunidad. Si colisiona:

```sql
SELECT RAISE(ABORT, 'PHONE_DUPLICATE_IN_COMMUNITY')
```

Mismo nombre de error que en código, así el controlador lo traduce igual al 409 si llega por esa vía.

#### Por qué tanto INDEX como TRIGGER

- El INDEX UNIQUE solo cubre `community_member.cellPhone` (overlay). NO detecta el caso real reportado donde ambos duplicados tienen overlay NULL y el tel está en `participants.cellPhone`.
- Los triggers cubren ambos casos (overlay-vs-overlay, overlay-vs-participant, participant-vs-participant) porque calculan el efectivo.
- El INDEX se queda como redundancia: si por algún motivo el trigger se desactiva o se omite (migration recreate-table futura sin re-crearlo), el INDEX aún protege overlay duplicates.

#### Limpieza de duplicados pre-existentes

Los triggers solo aplican a INSERT/UPDATE **futuros**, no fallan al instalarse. Si en producción quedan duplicados (como Fernando Marin), seguirán existiendo hasta que el coordinador los mergee desde la UI o se les cambie el teléfono. Una vez resueltos:

```sql
-- Detectar duplicados restantes por (community, last10):
WITH effective AS (
  SELECT cm.id, cm.communityId,
    COALESCE(NULLIF(cm.cellPhone,''), p.cellPhone) AS cellPhone
  FROM community_member cm
  LEFT JOIN participants p ON p.id = cm.participantId
)
SELECT c.name AS community,
  substr(REPLACE(REPLACE(REPLACE(REPLACE(e.cellPhone,' ',''),'-',''),'(',''),')',''), -10) AS last10,
  COUNT(*) AS dupes
FROM effective e
JOIN community c ON c.id = e.communityId
WHERE length(REPLACE(REPLACE(REPLACE(REPLACE(e.cellPhone,' ',''),'-',''),'(',''),')','')) >= 7
GROUP BY e.communityId, last10
HAVING COUNT(*) > 1;
```

## Tests

`apps/api/src/tests/services/communityService.test.ts` — 4 casos nuevos agrupados con los de email:

1. **Colisión overlay vs overlay con formato distinto** (+52, espacios, paréntesis) → bloquea por normalización.
2. **Colisión overlay vs `participant.cellPhone` heredado** — el caso real de Fernando Marin → bloquea.
3. **Mismo tel en comunidades distintas** → permitido (las comunidades son aisladas).
4. **Re-set del mismo tel en el mismo miembro** → no-op, no error.

Total tests `communityService.test.ts`: 125 ✓.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `apps/api/src/services/communityService.ts` | Helper `findPhoneCollision`. Uso en `createCommunityMember`, `bulkAddMembers`, `updateMemberProfile` |
| `apps/api/src/controllers/communityController.ts` | Mapea `PHONE_DUPLICATE_IN_COMMUNITY` a HTTP 409 |
| `apps/api/src/migrations/sqlite/20260521170000_UniquePhonePerCommunity.ts` | INDEX parcial + 2 triggers |
| `apps/api/src/tests/services/communityService.test.ts` | 4 casos nuevos |

## Cómo aplicar

```bash
# 1. Backup obligatorio:
cp apps/api/database.sqlite apps/api/database.sqlite.backup-pre-phone-uniq-$(date +%Y%m%d-%H%M)

# 2. Resolver duplicados pre-existentes (manualmente desde UI o SQL):
#    - Mergear miembros duplicados, o
#    - Cambiar el tel de uno de los dos

# 3. Aplicar migration:
pnpm --filter api migration:run

# 4. (Opcional) verificar que no quedan duplicados con la query SQL de arriba.
```
