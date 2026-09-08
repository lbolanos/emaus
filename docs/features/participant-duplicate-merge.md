# Fusión de participantes duplicados

_Septiembre 2026._

## Context

La misma persona puede existir dos veces en la base: **inscrita en un retiro** y **dada de alta
aparte en el padrón de una comunidad**. Son dos `Participant` distintos, y todo lo que une los dos
mundos —la asistencia del equipo servidor, los retiros servidos— une por `participantId`.

Medido en la base real: de los **11 servidores** del retiro *Del Valle II*, sólo **2** compartían
identidad con su miembro del padrón. De los 9 restantes, **4 eran duplicados** (la misma persona con
otro id) y 5 simplemente no estaban en el padrón. Por eso el badge de asistencia en la pantalla de
mesas aparecía en 2 de 11.

Tras fusionar los 4 pares: **de 2 a 6 de 11**. Los 5 restantes no son duplicados — simplemente no
están en el padrón, y se resuelven con "Miembros → Importar desde retiro".

## Nada se fusiona solo

Es cirugía de identidad: toca **23 columnas de 19 tablas** y afecta a retiros de otras comunidades.
El flujo tiene tres pasos y ninguno adivina:

1. **Detección** (`GET /communities/:id/duplicates`) — sólo PROPONE.
2. **Preview** (`.../duplicates/preview?keepId=&mergeId=`) — enumera lo que se movería, lo que se
   descartaría y lo que **bloquea**. No escribe nada.
3. **Fusión** (`POST .../duplicates/merge`) — se **niega** si hay bloqueos.

La UI no habilita "Fusionar" hasta que se ha visto el preview, y **cambiar de superviviente invalida
el preview anterior**: sin eso se fusionaría en la dirección contraria con la confirmación de la
otra, perdiendo los datos de la ficha equivocada.

**Autorización: `requireCommunityOwner`**, no el acceso normal a la comunidad. Es el permiso más
alto que se puede exigir en este ámbito, y la operación sale del ámbito de la comunidad.

## La lista de referencias es el corazón del asunto

`PARTICIPANT_REFERENCES` en `participantMergeService.ts` enumera las 23 columnas: 17 con FK
declarada (obtenidas de `PRAGMA foreign_key_list` sobre cada tabla) y 6 que apuntan **sin FK**.

**Una referencia olvidada deja datos huérfanos en silencio**, apuntando a una ficha que ya es una
lápida. De ahí el guard `participantMergeReferences.test.ts`, que compara la lista contra el esquema
real y falla si aparece una FK nueva que no esté registrada. Cazó su primer caso al escribirlo:
`service_teams.leaderId` no acaba en "participantId" y un barrido por nombre de columna no la veía.

### Política por referencia

| Política | Qué hace | Dónde |
| --- | --- | --- |
| `repoint` | UPDATE directo; no hay unicidad que romper | 15 columnas |
| `dedupe` | Hay índice único: si el superviviente ya tiene fila con esa clave, la del absorbido se descarta | `participant_shirt_size`, `participant_followups`, `retreat_bed`, `retreat_participants.spouseParticipantId` |
| `merge-member` | `community_member` además mueve la asistencia | `community_member` |
| `retreat-overlap` | Gana la inscripción activa; sólo bloquea si las dos lo están | `retreat_participants` |
| `block-on-overlap` | No se puede resolver sin decidir qué se pierde | `users` |

### El solape de retiro casi nunca es un conflicto

"Las dos fichas están en el mismo retiro" empezó siendo un bloqueo seco. Mirando el caso real
—"Marín"— las dos filas diferían en **dos campos**: `idOnRetreat`, y una tenía `isCancelled = 1`.

Una fila cancelada no es una participación: es la **baja de un registro duplicado**, y conservarla
dejaría a la persona apareciendo a la vez inscrita y dada de baja en el mismo retiro. Así que la
regla es:

| Situación en el retiro compartido | Qué hace |
| --- | --- |
| Las dos **activas** | **Bloquea**, nombrando el retiro. Hay dos participaciones reales con su tipo, mesa, cama y pagos: elegir cuál se conserva es una decisión con pérdida. |
| Una activa, otra cancelada | **Gana la activa**, esté del lado que esté. Se descarta la cancelada. |
| Las dos canceladas | Se descarta la absorbida; da igual cuál quede. |

Con eso los 4 duplicados reales fusionaron y la cobertura pasó de **2 a 6 de 11**.

El otro bloqueo se queda como bloqueo:

- **Las dos con cuenta de usuario.** Dos cuentas para la misma persona es otro problema; decidir
  cuál sobrevive no le toca a esta operación.

## Detalles que costaron

**La comparación de nombres tiene que doblar acentos.** `lower()` de SQLite no lo hace, y mi primer
recuento dijo 3 duplicados donde había 4: "Nicolás Méndez" no coincidía con "Nicolas Mendez". Vive
en `@repo/utils` → `normalizePersonName`, para que nadie lo vuelva a improvisar.

> Efecto lateral asumido: al descomponer, la `ñ` pierde su tilde. "Muñoz"/"Munoz" quedan iguales
> —lo que se busca— pero también "Peña"/"Pena", que son apellidos distintos. Aceptable **porque
> sólo propone**. En la corrida real salió una pareja de dos personas distintas que comparten
> teléfono; el aviso de la UI lo dice explícitamente.

**El teléfono se compara por sus últimos 10 dígitos** (`phoneFingerprint`), para que `+52 55…`,
`044 55…` y `55…` sean la misma persona.

**`community_attendance` no tiene UNIQUE en la base** (la unicidad la garantiza el código). Al
fusionar dos miembros de la misma comunidad hay que mover la asistencia **saltando** las reuniones
que el superviviente ya tenga registradas, o la persona contaría dos veces en el denominador.

**El absorbido no se borra.** Queda con `mergedIntoParticipantId` apuntando a quien lo absorbió, y
con `retreatId` a NULL para que salga de los listados que filtran por esa columna heredada
(`getPotentialMembers`, por ejemplo). Así la fusión es auditable y deshacible a mano. La detección
excluye las lápidas.

**Todo va en una transacción.** Una fusión a medias deja al absorbido con parte de sus datos movidos
y parte no, que es peor que no haberla intentado.

## Archivos clave

| Capa | Archivo |
| --- | --- |
| Servicio | `apps/api/src/services/participantMergeService.ts` |
| Normalizador | `packages/utils/src/index.ts` → `normalizePersonName`, `phoneFingerprint` |
| Migración | `apps/api/src/migrations/sqlite/20260908020000_AddParticipantMergeTombstone.ts` |
| Rutas | `apps/api/src/routes/communityRoutes.ts` (`/:id/duplicates*`, owner-only) |
| UI | `apps/web/src/components/community/DuplicateMembersDialog.vue`, botón en `CommunityMembersView` |
| Guard de referencias | `apps/api/src/tests/services/participantMergeReferences.test.ts` |
| Tests | `apps/api/src/tests/services/participantMerge.test.ts` (14), `components/community/__tests__/DuplicateMembersDialog.test.ts` (6) |

## Verificación

```bash
pnpm --filter api test -- --testPathPattern="participantMerge"
pnpm --filter web test src/components/community/__tests__/DuplicateMembersDialog.test.ts
```

Contra la base real, tras fusionar 3 pares: `PRAGMA foreign_key_check` vacío (cero huérfanos) y
ninguna de las 23 columnas apuntando al absorbido.

> Respaldá antes de fusionar en una base con datos que importen:
> `sqlite3 apps/api/database.sqlite ".backup 'apps/api/database.sqlite.bak-pre-merge'"`. La lápida
> permite deshacer a mano, pero reapuntar 23 columnas de vuelta es trabajo.

## Fuera de alcance

- **Deshacer una fusión desde la UI.** La lápida guarda la dirección, pero revertir requiere saber
  qué filas se movieron; hoy se hace a mano desde el backup.
- **Fusión en lote.** Se fusiona par por par a propósito: cada uno necesita mirar el preview.
- **Detección fuera del ámbito de una comunidad.** La búsqueda es padrón + retiros vinculados, que
  es donde aparece el caso y donde la lista es revisable a mano.
