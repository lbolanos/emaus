# Agregar servidores al equipo desde Responsabilidades

Desde la vista **Responsabilidades** (`ResponsabilitiesView.vue`, menú *Asignaciones → Responsabilidades*) se puede, en cada responsabilidad que tiene un **equipo de servicio relacionado**, abrir un diálogo para **agregar servidores activos como miembros de ese equipo existente**.

> No se crean equipos nuevos: el botón solo agrega miembros al equipo que ya existe. El **responsable** de la responsabilidad es el **líder** del equipo (relación pre-existente, ver [`leaderSyncService`](#sincronización-existente)).

## Comportamiento

- El botón (icono `UserPlus`, índigo) aparece **solo** en responsabilidades cuyo nombre está en el **mapeo canónico** `RESPONSIBILITY_TEAM_TYPE_MAP` **y** cuyo equipo de ese tipo ya existe en el retiro.
- **Charlas, textos y responsabilidades sin equipo** (Inventario, Tesorero, Mantelitos, Santísimo, …) **no muestran botón**.
- Requiere permiso `retreat:update` (gate `canManage.retreat.value`).
- Al hacer clic se abre un diálogo de solo-agregar:
  - **Equipo** y **líder (responsable)**: solo lectura.
  - **Miembros actuales**: solo lectura (chips).
  - **Servidores a agregar**: lista de servidores activos (`type === 'server' && !isCancelled`) que **aún no están** en el equipo, con buscador y selección múltiple.
  - **Agregar** → agrega los seleccionados como miembros del equipo existente.

## Vínculo responsabilidad ↔ equipo (mapeo canónico)

La relación es por **tipo de equipo**, no por nombre. Vive en una sola fuente:

`packages/types/src/serviceTeam.ts` → `RESPONSIBILITY_TEAM_TYPE_MAP: Record<string, ServiceTeamType>`

| Responsabilidad | `teamType` | Equipo por defecto (nombre suele diferir) |
|---|---|---|
| Música | `musica` | Música y Alabanza |
| Comedor | `cocina` | Cocina / Comedor |
| Oración de Intercesión | `oracion` | Intercesión / Oración |
| Palanquero 1 / 2 / 3 | `palancas` | Palancas |
| Logistica | `logistica` | Logística |
| Sacerdotes, Snacks, Compras, Transporte, Salón, Cuartos, Continua | (homónimo) | (homónimo) |

Por eso el vínculo se resuelve por `teamType` y no por coincidencia de nombre: "Música" (responsabilidad) corresponde al equipo "Música y Alabanza".

Esta constante es **fuente única** usada por:
- **Backend**: `apps/api/src/services/leaderSyncService.ts` (sincronización líder↔responsable).
- **Frontend**: `apps/web/src/utils/serviceTeamLink.ts` (`findRelatedTeam`) y la vista.

## Resolución del equipo (frontend)

`apps/web/src/utils/serviceTeamLink.ts`:

```ts
export function findRelatedTeam(responsibilityName: string, teams: ServiceTeam[]): ServiceTeam | null {
  const teamType = RESPONSIBILITY_TEAM_TYPE_MAP[responsibilityName];
  if (!teamType) return null;                    // charlas / sin mapeo → sin botón
  return teams.find((t) => t.teamType === teamType) ?? null;  // equipo aún no existe → sin botón
}
```

En `ResponsabilitiesView.vue`:

```ts
const relatedTeam = (resp) => findRelatedTeam(resp.name, serviceTeamStore.teams);
// El botón se muestra con:  v-if="canManage.retreat.value && relatedTeam(resp)"
```

La vista carga `serviceTeamStore.fetchTeams()` en el watcher de `selectedRetreatId` para conocer los equipos del retiro.

## Agregar miembros (store)

`apps/web/src/stores/serviceTeamStore.ts` → `addMembersToTeam(teamId, participantIds)`:

- Llama `addServiceTeamMember(teamId, pid)` (endpoint existente `POST /service-teams/:id/members`) por cada servidor seleccionado.
- Actualiza el estado local con el equipo final (más completo) vía `updateTeamInState`.
- Muestra un toast de éxito; en error muestra toast `destructive` y no lanza.

El diálogo excluye de la lista "a agregar" a quienes ya son líder o miembro (`teamMemberIds`), y muestra los miembros actuales (`teamCurrentMembers`, sin el líder) de solo lectura.

## Sincronización existente

La relación **responsable = líder** la mantiene `leaderSyncService.ts` (sin cambios de comportamiento): al asignar/desasignar el responsable de una responsabilidad mapeada, se sincroniza el `leaderId` del equipo correspondiente, y viceversa. Esta feature no toca al líder; solo agrega miembros.

## Archivos

| Archivo | Rol |
|---|---|
| `packages/types/src/serviceTeam.ts` | `RESPONSIBILITY_TEAM_TYPE_MAP` (fuente única del vínculo) |
| `apps/api/src/services/leaderSyncService.ts` | Importa el mapeo desde `@repo/types` (antes lo duplicaba) |
| `apps/web/src/utils/serviceTeamLink.ts` | `findRelatedTeam` (resolución pura, testeable) |
| `apps/web/src/stores/serviceTeamStore.ts` | `addMembersToTeam` |
| `apps/web/src/views/ResponsabilitiesView.vue` | Botón condicional + diálogo "agregar miembros" |
| `apps/web/src/locales/{es,en}.json` | Claves `responsibilities.addToTeam`, `teamLabel`, `currentMembersLabel`, `serversToAddLabel`, `addMembersConfirm`, `noServersToAdd`, … |

## Tests

- `apps/web/src/utils/__tests__/serviceTeamLink.test.ts` — resolución del vínculo: nombres con tipo distinto (Música→musica), los 3 palanqueros → palancas, charlas y no-mapeadas → `null`, mapeo presente pero sin equipo cargado → `null`.
- `apps/web/src/stores/__tests__/serviceTeamStore.test.ts` — `addMembersToTeam`: agrega cada servidor, actualiza estado con el equipo final, no-op con lista vacía, toast `destructive` en error.
- `apps/api/src/tests/services/responsibilityTeamMap.simple.test.ts` — **contrato del mapeo canónico** `RESPONSIBILITY_TEAM_TYPE_MAP` (fuente única): vínculos esperados, palanqueros→palancas, charlas/no-mapeadas ausentes, valores válidos de `ServiceTeamType`.
- `apps/api/src/tests/services/leaderSyncService.test.ts` — sincronización líder↔responsable con el mapeo (ahora compartido).

## Verificación manual (E2E)

1. Levantar el dev (en worktree: `bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh`), login `leonardo.bolanos@gmail.com` / `123456`.
2. Ir a **Responsabilidades**. Verificar:
   - Botón `UserPlus` presente en Música, Comedor, Palanquero 1/2/3, Logística, Sacerdotes, Snacks, Compras, Transporte, Salón, Cuartos, Oración de Intercesión.
   - **Sin botón** en charlas (De la Rosa, …) ni en Inventario/Tesorero/Mantelitos.
3. Clic en el botón de **Música** → el diálogo muestra **Equipo: Música y Alabanza**, líder de solo lectura, miembros actuales y la lista de servidores a agregar.
4. Seleccionar servidores → **Agregar**. En **Equipos de Servicio**, el equipo **existente** recibió los miembros (no se creó ninguno nuevo).
5. Reabrir el diálogo: los recién agregados aparecen en "Miembros actuales" y ya no en la lista de "a agregar".
