# Equipos de servicio faltantes: Sacerdotes, Compras y Examen de Conciencia

Tres equipos de servicio (`ServiceTeam`) que no existían en el template por
defecto y que faltaban en los retiros ya creados (entre ellos San Agustín):

| Equipo | `teamType` | Sincroniza con responsabilidad |
|---|---|---|
| **Sacerdotes** | `sacerdotes` (nuevo) | `Sacerdotes` |
| **Compras** | `compras` (ya existía en el enum) | `Compras` |
| **Examen de Conciencia / Quema de Pecados** | `dinamica` | — (dinámica, no sincroniza) |

El caso disparador: en la vista de Equipos de Servicio de San Agustín no
aparecía **Sacerdotes**. La responsabilidad `Sacerdotes` sí se crea por
defecto (`createDefaultResponsibilitiesForRetreat`) y en varios retiros ya
tenía un participante asignado, pero **no existía un equipo pareja**, así que
el líder del equipo nunca se sincronizaba.

> Nota: `Continua` también es una responsabilidad sin equipo, pero por
> decisión del dominio **no necesita equipo de servicio** y se dejó fuera.

## Sincronización líder ↔ responsabilidad

El líder de un equipo de servicio y el participante de la responsabilidad
homónima se mantienen en sync de forma **bidireccional** vía
`apps/api/src/services/leaderSyncService.ts`, que mapea por `teamType`:

- `RESPONSIBILITY_TEAM_TYPE_MAP`: nombre de responsabilidad → `ServiceTeamType`
- `TEAM_TYPE_RESPONSIBILITY_MAP`: `ServiceTeamType` → nombre de responsabilidad

Para que un equipo sincronice debe tener un `teamType` **único** (la búsqueda
es por `retreatId + teamType`). Por eso **Sacerdotes recibió su propio valor de
enum** `SACERDOTES = 'sacerdotes'` en vez de reusar `otro` o `liturgia` (que ya
agrupan varios equipos y harían ambigua la búsqueda). `Compras` ya estaba
mapeado (`Compras → COMPRAS`); solo faltaba sembrar el equipo.

El flujo (ya genérico, no hubo que tocarlo más allá de agregar el par):

- Asignar líder en el equipo → `syncTeamToResponsibility` setea
  `retreat_responsibilities.participantId`.
- Asignar participante a la responsabilidad → `syncResponsibilityToTeam` setea
  `service_teams.leaderId` y crea un `ServiceTeamMember` con `role = 'líder'`.
- Un flag `_syncing` evita el loop infinito entre ambas direcciones.

## Capas que se tocaron al agregar el tipo

Agregar un nuevo `ServiceTeamType` que sincroniza requiere tocar estas capas a
la vez:

| Capa | Archivo |
|---|---|
| Enum compartido | `packages/types/src/serviceTeam.ts` (`ServiceTeamType.SACERDOTES`) |
| Mapas de sync | `apps/api/src/services/leaderSyncService.ts` (ambos mapas) |
| Template de equipos por defecto | `apps/api/src/data/dynamicsTemplates.ts` (`defaultServiceTeams`) |
| Backfill a retiros existentes | `apps/api/src/migrations/sqlite/20260603120000_AddMissingServiceTeams.ts` |
| Etiqueta de UI | `apps/web/src/views/ServiceTeamCard.vue` (`teamTypeLabels`) |

`createDefaultServiceTeamsForRetreat` (`apps/api/src/services/serviceTeamService.ts`)
itera `defaultServiceTeams`, así que los **retiros nuevos** reciben los 3
equipos automáticamente. No hubo cambios de schema: `service_teams.teamType`
es `varchar` libre (sin CHECK constraint), por lo que insertar `'sacerdotes'`
**no** requiere recrear la tabla ni `transaction = false`.

## Migration de backfill (retiros existentes)

`20260603120000_AddMissingServiceTeams.ts` aplica a **todos los retiros**:

1. Importa `defaultServiceTeams` y filtra los 3 equipos por nombre (DRY: usa el
   mismo contenido/instrucciones que el template, no lo duplica).
2. Por cada retiro × equipo: inserta solo si no existe `(retreatId, name)`
   → **idempotente**, no duplica al correr de nuevo.
3. Para Sacerdotes/Compras: si la responsabilidad pareja ya tiene
   `participantId`, lo copia al `leaderId` del equipo y crea el
   `ServiceTeamMember` líder (reproduce `syncResponsibilityToTeam` sobre el
   estado ya existente). El Examen de Conciencia no sincroniza.

Resultado verificado: los 6 retiros convergen a **27 equipos**; en San Agustín
`Sacerdotes` quedó con el líder heredado de su responsabilidad; en San Judas
Tadeo `Sacerdotes` y `Compras` con sus líderes respectivos.

> ⚠️ El `down()` borra los equipos por nombre globalmente (incluiría un
> `Examen de Conciencia` que ya existiera en otros retiros antes de la
> migration). Como `migration:revert` no es confiable en este repo, para
> iterar se prefiere **restaurar el backup** de la base, no revertir.

## Tests

- `apps/api/src/tests/services/leaderSyncService.test.ts` — bloques
  `Sacerdotes mapping` (ambas direcciones + creación de miembro líder +
  unassign) y `Compras mapping`.
- `apps/api/src/tests/services/serviceTeamData.simple.test.ts` — el template
  tiene 27 equipos, prioridades 1–27, nombres y `teamType` de los 3 nuevos.
- `apps/api/src/tests/services/serviceTeamSchemas.simple.test.ts` — el enum
  `ServiceTeamType` tiene 19 valores.
