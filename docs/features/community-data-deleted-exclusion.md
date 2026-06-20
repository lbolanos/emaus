# Exclusión de participantes con datos borrados en la comunidad

## Resumen

Un participante que ejerció su **derecho de borrado de datos** queda
**anonimizado** (no se borra la fila — ver
[`privacy-data-delete.md`](./privacy-data-delete.md)):

- `participant.firstName = '(eliminado)'`, `lastName = ''`
- `participant.email = 'deleted-<id>@local'`
- teléfonos / direcciones / etc. → `''` o `null`
- **`participant.dataDeletedAt != null`** ← discriminador

La fila se conserva por integridad referencial (FKs a pagos, asignaciones,
comunicaciones históricas). Pero ese participante **no debe reaparecer en
NINGÚN listado ni conteo de la comunidad**: ni como miembro, ni como
candidato a agregar, ni en stats, ni como resultado de búsqueda del
asistente. De lo contrario el coordinador ve un fantasma "(eliminado)" en
sus pantallas.

## Regla canónica

> Todo método que cargue miembros de comunidad (o participantes para la
> comunidad) **con su `participant`** debe filtrar `dataDeletedAt IS NULL`.

Esto **NO** es un `community_member.state`. El `state` es seguimiento del
coordinador (ver [`community-state-semantics`](../../.claude/skills/community-state-semantics/SKILL.md));
`dataDeletedAt` es un campo del **Participant global** que aplica por
encima de cualquier state. Un miembro `active_member` cuyo participant
ejerció el borrado se excluye igual.

### Patrón de filtrado

Hay dos formas según cómo se cargan los datos:

```ts
// A) find() con relación participant → filtrar en memoria
const members = (
  await this.memberRepo.find({ where: { communityId }, relations: ['participant'] })
).filter((m) => !m.participant?.dataDeletedAt);

// B) QueryBuilder con join → filtrar en SQL
const rows = await this.memberRepo
  .createQueryBuilder('m')
  .innerJoinAndSelect('m.participant', 'p')
  .where('m.communityId = :cId', { cId })
  .andWhere('p.dataDeletedAt IS NULL')
  .getMany();
```

> ⚠️ `getDashboardStats` cargaba miembros **sin** `relations: ['participant']`
> (solo contaba filas). Para poder filtrar hubo que agregar la relación.
> Si agregas un método que solo cuenta, recuerda: necesitas el participant
> para excluir los borrados.

## Puntos de filtrado (todos los listados/conteos)

| Método | Archivo | Qué alimenta |
|---|---|---|
| `getMembers` / `getMembersForViewer` | `services/communityService.ts` | **Roster principal de la comunidad** (`GET /communities/:id/members`) |
| `getPotentialMembers` | `services/communityService.ts` | Candidatos a agregar desde un retiro |
| `getDashboardStats` | `services/communityService.ts` | `memberCount` + distribución por estado |
| `bulkRecordAttendance` | `services/communityService.ts` | Matching por nombre/teléfono (bot de asistencia) |
| `getPublicAttendanceData` | `services/communityService.ts` | Roster público de pase de lista |
| `getMeetings` (conteo "X de Y") | `services/communityService.ts` | Denominador de asistencia por reunión |
| `notifyMembersOfMeeting` | `services/communityService.ts` | Email de invitación (`p.dataDeletedAt IS NULL`) |
| `findCommunityMember` (tool) | `services/aiChatService.ts` | Búsqueda de miembro del asistente IA |

Lookups puntuales por `id`/`email` (`findOne`, `updateMemberState`,
`getMemberTimeline`, validación de colisión de teléfono, `createCommunityMember`)
**no** requieren el filtro: operan sobre un registro específico ya
conocido, no producen listados donde el "(eliminado)" pueda colarse.

## Historial de incidentes

Esta fuga reapareció método por método porque cada listado nuevo olvidaba
el filtro:

- **commit `92a1d5f` / `e9266bc`** (jun 2026): asistencia pública y conteo
  de reuniones — se agregó el filtro a `getPublicAttendanceData`,
  `getMeetings` y el email de invitación.
- **2026-06-20**: el coordinador reportó ver un "(eliminado)" en el roster
  de comunidad. Causa: `getMembers` (el método principal) nunca había
  filtrado. Se taparon de una vez todas las fugas restantes:
  `getMembers`, `getPotentialMembers`, `getDashboardStats`,
  `bulkRecordAttendance` y `findCommunityMember`.

**Lección**: al agregar un método que liste o cuente miembros, incluir el
filtro `dataDeletedAt` desde el inicio. Los tests de abajo son la red de
seguridad.

## Tests

- `apps/api/src/tests/services/communityService.test.ts`
  → `describe('exclusión de participantes con datos borrados (dataDeletedAt)')`:
  cubre `getMembers`, `getPotentialMembers`, `getDashboardStats`.
  → `describe('getPublicAttendanceData')`: test de exclusión existente.
- `apps/api/src/tests/services/communityService.bulkRecordAttendance.test.ts`
  → "no matchea a un participante con datos borrados" (ni por nombre, ni
  teléfono, ni "(eliminado)").

> El `execute` del tool `findCommunityMember` está embebido inline en la
> llamada a `streamText` y no es invocable de forma aislada sin mockear el
> LLM; su query usa el mismo `andWhere('p.dataDeletedAt IS NULL')` que el
> resto y se valida por inspección.

```bash
pnpm --filter api test -- communityService.test.ts communityService.bulkRecordAttendance
```

## Ver también

- [`privacy-data-delete.md`](./privacy-data-delete.md) — el mecanismo de
  borrado/anonimización que produce el `dataDeletedAt`.
- Skill `community-state-semantics` — por qué `state` ≠ `dataDeletedAt` y
  los filtros de roster/asistencia/notificaciones.
- Skill `community-overlay` — modelo overlay de `CommunityMember`.
