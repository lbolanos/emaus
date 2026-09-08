# Estadísticas de asistencia por tipo de reunión

_Septiembre 2026._

El coordinador decide **quién va de líder de mesa** y quería apoyarse en un dato objetivo: quién
asiste de verdad a las **reuniones de preparación**, que son la formación del equipo servidor antes
del retiro. Esta feature hace consultable ese dato y lo pone donde se toma la decisión.

## El punto de partida

Tres huecos y un bug:

1. **`community_meeting` no tenía tipo.** Su única clasificación era `isAnnouncement`. En *Buen
   despacho* el coordinador ya distinguía los tipos **por el título** — 5 reuniones "Del Valle" y
   5 "Preparacion Retiro", cada grupo como su propia serie recurrente. El dato existía y no se podía
   consultar.
2. **La tasa de asistencia era global.** `getMembers` mezclaba todas las reuniones de la comunidad,
   así que la asistencia a las preparaciones quedaba diluida entre las generales.
3. **`retreat` no tenía vínculo con `community`.** Nada conectaba al equipo servidor de un retiro
   con el padrón donde se le pasa lista.
4. **Bug del denominador.** La variable de `getMembers` se llamaba `pastMeetings` pero no filtraba
   por fecha ni excluía anuncios: las reuniones **futuras** —a las que nadie ha podido asistir—
   entraban en el denominador de todos y hundían cada porcentaje. `getDashboardStats` sí lo hacía
   bien, de ahí que el badge de la lista de miembros y el promedio del dashboard no cuadraran.

## Modelo

### `community_meeting.meetingType`

Catálogo cerrado: `general` · `preparation` · `formation` · `service` · `fellowship` · `other`.
Default `general`. Etiquetas en `community.meetingTypes.*` (es/en).

Cerrado a propósito: los porcentajes tienen que ser comparables entre comunidades y traducibles.
Una etiqueta libre se ensucia sola con variantes ("Preparacion" / "Preparación") y el filtro deja
de ser fiable.

`isAnnouncement` sigue siendo una dimensión aparte: un anuncio no pasa lista, así que el selector
de tipo se oculta y el formulario manda siempre `general`.

**La columna no lleva `CHECK`.** SQLite no permite añadir uno por `ALTER`, y hacerlo exigiría
recreate-table sobre una tabla con FK entrante desde `community_attendance` — la operación que ya
borró datos en este repo (ver skill `sqlite-migrations`). El catálogo se valida con Zod en el borde
del API.

### `retreat.communityId` — opcional por diseño

Un retiro **puede** pertenecer a una comunidad. `NULL` es válido y es el default; la mayoría de los
retiros existentes se quedan así y no se backfilleó ninguno (no hay forma fiable de inferir qué
comunidad organizó un retiro pasado, y adivinar mal vincularía el padrón de una comunidad al retiro
de otra).

Sin FK física, siguiendo la convención del repo para columnas de vínculo añadidas por `ALTER`
(`retreat_participants.spouseParticipantId` es lo mismo). La consecuencia hay que asumirla
explícitamente: **`communityService.deleteCommunity` pone a `NULL` el `communityId` de los retiros
que apunten a la comunidad borrada**, porque ningún `ON DELETE SET NULL` va a hacerlo.

**Guard de escritura**: poner un `communityId` exige ser `CommunityAdmin` activo de esa comunidad
(o superadmin) — `assertCanLinkCommunity` en `retreatController`. Desvincular (`null`) no exige
nada: soltar el vínculo no da acceso a nada. Sin el guard, cualquiera con `retreat:update` podría
colgar su retiro de una comunidad ajena; la lectura seguiría protegida, pero el vínculo falso
ensucia el modelo. El campo está en `RETREAT_AUDIT_FIELDS`.

## La regla del denominador, en un solo sitio

`apps/api/src/services/communityAttendanceStats.ts` es el dueño único de "qué reuniones cuentan".
`getMembers` y el reporte pasan los dos por ahí, así que el badge de la lista y el ranking del
reporte **no pueden discrepar**.

```
reunionesConsideradas = reuniones de la comunidad
                        − canceladas (exceptionType='cancelled')
                        − anuncios   (isAnnouncement=true)
                        ∩ (startDate <= ahora  ∪  tiene algún registro de asistencia)
                        [∩ meetingType / seriesId / rango de fechas]

porMiembro: validas = consideradas ∩ (startDate >= member.joinedAt ∪ attended=true)
            rate    = attended / validas.length
```

Dos mitades que parecen redundantes y no lo son:

- **`startDate <= ahora ∪ tiene asistencia`**: deja fuera la reunión agendada para la semana que
  viene, pero cuenta la reunión cuya asistencia se capturó unos minutos antes de empezar.
- **`>= joinedAt ∪ attended`**: no penaliza a nadie por reuniones anteriores a su ingreso, pero sí
  cuenta la reunión durante la cual se le dio de alta y se le marcó presente. Es el fix del "0%
  falso" que documenta `community-attendance-rate-and-joined-date.md`.

**Efecto visible del arreglo**: los porcentajes de la lista de miembros **subieron** al salir del
denominador las reuniones futuras y los anuncios. No es un cambio de fórmula, es que antes contaba
mal.

También se alineó el denominador por reunión de `getDashboardStats` al **roster canónico**
(`active_member` + `pending_verification`, lista positiva — skill `community-state-semantics`). Antes
usaba sólo `active_member` y dejaba fuera a los que están por contactar, que sí van a las reuniones.

## El reporte

`GET /communities/:id/attendance-stats?meetingType=&seriesId=&from=&to=` →
`requireCommunityAccess()`.

Devuelve `meetings[]` (fecha, título, asistentes/elegibles, %), `members[]` (ranking con
asistidas/total, % y semáforo), `totals` y `availableTypes[]` — sólo los tipos que la comunidad usa
de verdad, para no ofrecer opciones vacías en el filtro.

Detalles que importan:

- **Con SQL agregado**, no con el `count()` por reunión de `getDashboardStats` (que es N+1 sobre
  todo el historial).
- `from`/`to` son date-only y se interpretan **en la timezone de la comunidad** con
  `makeDateInTimezone`; `to` es inclusivo (el corte real es medianoche del día siguiente). Un
  `2026-09-01T05:00Z` es el 31 de agosto en CDMX, y un filtro por día tiene que verlo así.
- `members[]` lista **todo el padrón**, declinaciones incluidas, y lleva el `state` en cada fila: la
  vista los oculta por defecto con un checkbox para volverlos a mostrar. Filtrar en el backend a
  `active_member` es el error que en 2026-05-17 dejó 11 de 62 miembros fuera de la lista de
  asistencia.
- Los nombres salen por `resolveMemberProfile` (overlay per-community, skill `community-overlay`) y
  se excluyen los participantes con `dataDeletedAt`.

Vista: `apps/web/src/views/CommunityAttendanceStatsView.vue`, ruta
`/app/communities/:id/attendance-stats`. Filtros persistidos en la URL para deep-link. KPIs, gráfica
de línea con `vue-chartjs`, tabla por reunión y ranking (tabla en escritorio, tarjetas en móvil,
paginación de 25). Export a Excel (`exceljs`) y a PDF (`jspdf` + `jspdf-autotable`), los dos por
`import()` dinámico para no engordar el bundle principal.

> La gráfica de línea necesita registrar `LineElement`, `PointElement` y `LinearScale`. El dashboard
> sólo registraba los del `Pie`; sin esos tres la gráfica **no dibuja nada y no avisa**.

## En la pantalla de mesas

`GET /communities/:id/server-attendance/:retreatId` → `requireCommunityAccess()`.

**Mide las preparaciones DE ESE RETIRO**, no todas las que la comunidad haya tenido: la pregunta de
esta pantalla es "¿quién viene a preparar *este* retiro?", y una comunidad acumula preparaciones de
todos los que ha servido. Por eso el endpoint no lleva filtros —el conjunto ya lo delimita el
calendario del retiro— y la barra de mesas perdió su selector de tipo.

Consecuencia asumida: la métrica depende de que las preparaciones estén sincronizadas. Con
`retreatLinkedMeetingCount = 0` la barra dice *"Sincroniza las preparaciones de este retiro para ver
la asistencia"* en lugar de dejar las pastillas sin badge, que parecería un fallo. Es el mismo patrón
que el estado vacío del informe: nunca un cero silencioso, siempre la causa y la salida.

**El `communityId` va en la ruta y no se deduce del retiro, a propósito.** La asistencia es dato de
la comunidad: leerla exige ser admin activo de **esa** comunidad, no basta con coordinar el retiro.
Resolverla desde el `retreatId` dejaría el recurso protegido validando el objeto menos específico de
la ruta — el IDOR latente que documenta `feedback_authorization_resource_specific`. El servicio
comprueba además que `retreat.communityId` sea esa comunidad.

La proyección es `retreat_participants (type IN ('server','partial_server'), isCancelled=0)` →
`participantId` → `community_member (communityId, participantId)` → asistencia a las reuniones
vinculadas por `retreat_preparation.communityMeetingId`.

**Un servidor que no está en el padrón NO aparece en `entries`.** Devolverlo como 0% se leería como
"no viene nunca" cuando la verdad es "no está en esta lista", y eso es una afirmación falsa sobre una
persona. La UI no le pinta badge y la leyenda dice cuántos hicieron match ("18 de 24 servidores están
en el padrón de Buen despacho").

En `TablesView`:

- **Se enciende desde el menú "⋮"**, no desde un botón en la barra: la barra superior ya carga
  búsqueda, columnas y el menú, y la métrica es una consulta ocasional, no una acción de cada día.
  Apagada, la pantalla queda exactamente como antes.
- Si el retiro **no** está vinculado, la opción del menú queda **deshabilitada** con el motivo en su
  `title`, en vez de desaparecer: así se ve que existe y qué falta para usarla.
- Si lo está: la métrica es **opt-in** (un botón), con selector de tipo de reunión —default
  *Preparación de retiro*— persistido en `localStorage` por retiro.
- Badge del % en la pastilla del servidor (pool de no asignados, escritorio y móvil, y las tres
  zonas de líder), con el **mismo semáforo que la comunidad** para que el color signifique lo mismo
  en todo el sistema. Fila de asistencia en `ParticipantInfoPopover`.
- Ordenar el pool por % desc, que es literalmente la pregunta "¿quién está más preparado para
  mesa?". **Los sin dato van al final**, no ordenados como 0%.

El composable `useServerAttendance` se **desestructura** en la vista para que las bindings queden
como refs de primer nivel: así el template las usa sin `.value` y los tests pueden tocarlas por
`wrapper.vm`.

## Archivos clave

| Capa | Archivo |
| --- | --- |
| Types | `packages/types/src/community.ts` (`MeetingTypeEnum`, schemas del reporte), `packages/types/src/index.ts` (`retreatSchema.communityId`) |
| Entities | `apps/api/src/entities/communityMeeting.entity.ts`, `retreat.entity.ts` |
| Migración | `apps/api/src/migrations/sqlite/20260907180000_AddMeetingTypeAndRetreatCommunity.ts` |
| Servicio | `apps/api/src/services/communityAttendanceStats.ts` (**nuevo**, dueño de la regla del denominador) |
| Servicio | `apps/api/src/services/preparationCommunitySync.ts` (**nuevo**, puente calendario ↔ reuniones) |
| Convocatoria | `apps/api/src/services/messageSequenceService.ts` → audiencia `community_roster` |
| Enlace de alta | `packages/utils/src/index.ts` → `buildServerRegistrationLink` |
| Migración 2 | `apps/api/src/migrations/sqlite/20260907200000_PreparationSyncAndConvocation.ts` |
| Servicio | `apps/api/src/services/communityService.ts` (`getMembers`, `pickPropagableFields`, `getDashboardStats`, `deleteCommunity`) |
| Guard del vínculo | `apps/api/src/controllers/retreatController.ts` (`assertCanLinkCommunity`) |
| Rutas | `apps/api/src/routes/communityRoutes.ts` |
| Vista del reporte | `apps/web/src/views/CommunityAttendanceStatsView.vue` |
| Mesas | `apps/web/src/composables/useServerAttendance.ts`, `TablesView.vue`, `TableCard.vue`, `ServerDropZone.vue`, `ParticipantInfoPopover.vue` |
| Captura del tipo | `apps/web/src/components/community/MeetingFormModal.vue`, `apps/web/src/constants/meetingTypes.ts` |
| Vínculo (UI) | `apps/web/src/components/RetreatModal.vue` |
| Preparaciones (UI) | `apps/web/src/views/RetreatPreparationsView.vue` |
| Dashboard + convocatoria | `apps/web/src/views/CommunityDashboardView.vue` |
| Tests API | `apps/api/src/tests/services/communityAttendanceStats.test.ts`, `preparationCommunitySync.test.ts`, `messageSequence.test.ts` (audiencia `community_roster`), `tests/migrations/preparationSyncAndConvocation.test.ts`, `tests/migrations/addMeetingTypeAndRetreatCommunity.test.ts`, `tests/controllers/retreatCommunityLink.test.ts` |
| Tests web | `apps/web/src/views/__tests__/CommunityAttendanceStatsView.test.ts`, `TablesViewServerAttendance.test.ts`, `components/community/__tests__/MeetingFormModalType.test.ts`, `components/__tests__/RetreatModalCommunity.test.ts` |
| Tests web 2 | `views/__tests__/RetreatPreparationsSync.test.ts`, `views/__tests__/CommunityDashboardRetreats.test.ts` |
| Guard de `@repo/ui` | `apps/web/src/test/repoUiProgressApi.test.ts` |
| E2E | `apps/web/tests/e2e/community-attendance-stats.spec.ts` |

## Gotchas

- **El backfill del tipo es heurístico y sólo toca filas en el default.** Clasifica como
  `preparation` las reuniones cuyo título dice "preparacion"/"preparación". Es idempotente: no pisa
  un tipo elegido a mano.
- **`meetingType` se propaga en `pickPropagableFields`**, así que editar una serie con
  `scope=all`/`all_future` arrastra el tipo a las instancias materializadas. `startDate` sigue
  deliberadamente fuera.
- **La query manda `''` cuando el cliente limpia un filtro** y un enum lo rechazaría con 400. El
  controlador lo normaliza a `undefined` (`normalizeFilterQuery`) y `retreatSchema.communityId`
  lleva su `preprocess` de `''` → `null`, por el mismo bug recurrente que ya documentan `slug` y
  `externalRegistrationUrl`.
- **Los repos de `communityAttendanceStats` se resuelven por llamada**, no en campos: el harness de
  Jest reemplaza `AppDataSource` después del import y capturar la referencia al importar da
  *"Class constructor cannot be invoked without 'new'"*.
- **`timezoneOf` está duplicado** a propósito en `communityAttendanceStats` en vez de importar
  `getCommunityTimezone` de `communityService`: cerraría un ciclo de imports alrededor de clases de
  entidad de TypeORM, que rompe en tiempo de carga del módulo y no en el type check.
- **`Progress` de `@repo/ui` sólo entiende `model-value`.** Un `:value` se descarta en silencio y la
  barra sale gris, sin relleno. Es la misma familia de bug que `:checked` en Checkbox/Switch. Se
  cazó mirando la pantalla, no con un test: el mock global acepta cualquier prop. Guard nuevo en
  `apps/web/src/test/repoUiProgressApi.test.ts`.
  - **Deuda encontrada de paso**: `TelemetryDashboardView` (7 sitios) y `RetreatDashboardView`
    (9 sitios) usan `:value`, así que **sus barras están vacías hoy**. Están en la allowlist del
    guard para no romper la suite; arreglarlas es un cambio aparte porque toca pantallas ajenas a
    esta feature.
- **El icono nuevo hay que añadirlo al mock de `apps/web/src/test/setup.ts`** — es una allowlist fija
  y un ícono ausente rompe el `mount()`. Se agregaron `TrendingUp` y `Percent`.

## Verificación end-to-end

Con `bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh` y login
`leonardo.bolanos@gmail.com` / `123456`:

1. Comunidad **Buen despacho** → Reuniones: las 5 "Preparacion Retiro" salen con badge *Preparación
   de retiro* (backfill); las "Del Valle" sin badge (son `general`, y el badge del default sería
   ruido).
2. Estadísticas de asistencia, tipo *Preparación de retiro*: **3 reuniones consideradas** de las 5 —
   las dos futuras no cuentan. Asistentes 12, 15 y 12.
3. Tipo *Reunión general* → 5 reuniones (12, 8, 10, 10, 13).
4. Exportar a Excel y a PDF; comprobar acentos en los dos.
5. Mesas del retiro sin vincular → nota de "vincula este retiro a una comunidad", sin badges.
6. Editar el retiro → General → elegir *Buen despacho* → guardar. Volver a Mesas, encender la
   métrica: los servidores del padrón muestran su %, la leyenda dice cuántos hicieron match, y
   ordenar por % pone arriba a los de 100%.
7. Volver a "Sin comunidad": la métrica desaparece y el retiro sigue igual. El vínculo es reversible.

```bash
pnpm --filter api test -- --testPathPattern="(community|retreat|migrations)"
pnpm --filter web test -- --run
pnpm --filter api lint && pnpm --filter web lint
pnpm --filter api build && pnpm --filter web build

# E2E (contra el stack de dev que ya esté levantado)
cd apps/web && npx playwright test tests/e2e/community-attendance-stats.spec.ts \
  --project=chromium --reporter=list
```

> **La suite E2E entera martillea el API y dispara su rate limiter global**
> (`API_RATE_LIMIT_EXCEEDED`, 429 en todo, incluido el login). Si aparecen fallos masivos con
> respuestas de ~20 ms, es eso y no el código: esperar a que la ventana expire antes de volver a
> correr. Verificar con `curl -s -o /dev/null -w '%{http_code}' localhost:PORT/api/communities/public`.
>
> El E2E necesita los usuarios y comunidades que siembran las migraciones
> `20260516200000_SeedE2ETestUsers` y `20260721130000`. En una base traída de prod (`make db-pull`)
> esos seeds **no están**: la migración quedó registrada como corrida pero su contenido se omitió
> por el guard de `NODE_ENV=production`. Para poder correr el E2E sobre esa copia hay que reejecutar
> el `up()` de las dos migraciones a mano; los `test.skip` de los specs cubren el caso de no
> hacerlo.

> `pnpm --filter api exec tsc --noEmit` **no** es una puerta útil aquí: el API arrastra ~150 errores
> de tipos previos a este cambio. Las puertas reales son `lint` (type-aware) y `build`.

## Lo que se abrió al saber la comunidad del retiro

Cinco añadidos que sólo son posibles con `retreat.communityId` puesto.

### Las preparaciones del retiro se materializan como reuniones de la comunidad

`POST /retreat-preparations/retreats/:retreatId/sync-community-meetings` →
`retreatPreparation:manage` + `requireRetreatAccess` **+ administrar la comunidad vinculada**. La
tercera comprobación no es redundante: la operación ESCRIBE en la comunidad, así que el recurso a
validar es el más específico de lo que se hace, no el de la ruta.

Cada sesión del calendario pasa a ser una `community_meeting` de tipo `preparation`, y
`retreat_preparation.communityMeetingId` recuerda cuál. Eso junta las dos mitades: el calendario
tiene los documentos, la reunión pasa lista. El listado admin devuelve la asistencia junto a cada
semana ("65% · 13/20"); la vista **pública no** — es para los servidores, y ahí sólo van el
calendario y sus documentos.

Tres decisiones que se ganaron a pulso contra los datos reales:

- **Adopta en vez de duplicar.** Si ya hay una reunión de tipo `preparation` el mismo día
  calendario, se vincula a ella. Sin esto, un coordinador que ya venía creando sus "Preparacion
  Retiro" a mano se encontraba la serie duplicada y su asistencia colgando de las reuniones
  viejas. Medido en la base real: de 8 sesiones, **4 adoptadas, 3 creadas, 1 saltada** (el festivo).
- **Adopta también las instancias de una serie recurrente.** El primer intento las excluía por
  llevar `isRecurrenceTemplate`; en los datos reales la bandera está puesta **también en las
  instancias**, así que el guard dejaba fuera la serie entera y duplicaba las 5 reuniones que ya
  tenían asistencia. Con varias el mismo día gana la instancia materializada sobre la plantilla raíz.
- **No reescribe nada existente.** Ni el título (puede ser el que el coordinador eligió) ni la
  fecha (mover una reunión con asistencia capturada falsea el registro — el mismo motivo por el que
  `pickPropagableFields` deja `startDate` fuera). Si el calendario se movió, sale en `mismatched` y
  decide el coordinador. La primera versión sí renombraba, y en la segunda pasada se llevó por
  delante los nombres de las 4 reuniones adoptadas.

Es idempotente: la segunda pasada devuelve todo en cero.

**Dos botones, dos momentos.** El de la cabecera ("Sincronizar con la comunidad") es para el alta
inicial del calendario completo. Pero cuando el coordinador añade **una** semana suelta después
—o salta un festivo y aparece una fecha nueva—, sincronizar todo por una sola es ruido: la fila de
esa semana lleva su propio botón **"Crear reunión"**, que sale sólo si le falta.
`POST /retreat-preparations/:id/community-meeting` comparte el corazón con la sincronización
completa (`syncSession`), así que adopta igual y es igual de idempotente. Un festivo o una sesión
sin fecha lo rechazan con un motivo explícito: no pueden ser una reunión.

**Y si el retiro no tiene comunidad**, la fila avisa (*"Sin comunidad vinculada"*) en vez de ofrecer
un botón que fallaría: el arreglo está en Editar retiro → General, no en esta pantalla.

Una sesión sincronizada pero **aún no celebrada** se marca `pending` y la UI dice "Sin celebrar",
no "0%" — que se leería como "no fue nadie". Es el mismo error que metía las reuniones futuras en
el denominador del reporte.

### El informe se puede acotar a un retiro

`?retreatId=<uuid>` en el reporte, expuesto como el selector **"Retiro"**. Hace dos cosas a la vez,
que es como se usa:

- **Recorta las reuniones a las preparaciones de ESE retiro** — las vinculadas por
  `retreat_preparation.communityMeetingId`. Hace falta porque una comunidad acumula preparaciones de
  todos los retiros que ha servido: *Buen despacho* ya tiene dos retiros, y sin el filtro se mezclan.
  De paso deja fuera las reuniones de tipo `preparation` que nadie enganchó a un calendario (en los
  datos reales hay una que generó el cron sola).
- **Recorta el ranking al equipo servidor del retiro** — 84 miembros del padrón contra 11 del equipo.

Lo que **no** recorta es el denominador de cada reunión: `eligible` sigue siendo el padrón, porque el
% de una reunión se mide contra quién podía ir, no contra el equipo de un retiro. Verificado: con el
filtro, `members` baja a 2 y `meetings[].eligible` sigue en 21.

**Un retiro sin preparaciones sincronizadas no es "no fue nadie".** La respuesta trae
`retreatLinkedMeetingCount`, y con 0 la vista muestra un estado vacío distinto —"Este retiro no tiene
preparaciones sincronizadas"— con el botón que lleva al calendario a sincronizarlas. Sin esa
distinción el coordinador se queda ante un informe en blanco sin saber por qué.

### Convocatoria de servidores: una secuencia de WhatsApp, no un correo masivo

Los servidores salen del padrón de la comunidad, así que la convocatoria tiene que alcanzar a gente
que **todavía no se ha inscrito** — justo la que no está en `retreat_participants`.

La primera versión de esto era un endpoint que mandaba un correo a los 71 del padrón. Se descartó:
el canal de WhatsApp de este sistema es **deep-link asistido**, nunca desatendido (decisión
documentada en `crm-messaging.md` — Baileys sobre una cuenta personal va contra los ToS y ni
siquiera puede iniciar chats nuevos de forma fiable). Lo automático se materializa como **bandeja de
pendientes** que el coordinador despacha a un toque desde su propio teléfono.

Así que la convocatoria monta sobre el motor de secuencias que ya existía, con una pieza nueva:

**Audiencia `community_roster`.** Es la única que NO sale de `retreat_participants`: resuelve el
padrón de `retreat.communityId`. Sin vínculo devuelve vacío y la secuencia no enrola a nadie.
Excluye `EMAIL_SILENT_STATES` (pausa, contacto roto, no-contactar) y a quien ejerció su derecho de
borrado.

**Plantilla `SERVER_CONVOCATION`** con `{retreat.serverRegistrationLink}` — variable nueva, resuelta
por `buildServerRegistrationLink` en `@repo/utils` para que el cliente y el motor construyan
exactamente la misma URL. Apunta al alta de **servidores** (`/{slug}/server`), deliberadamente NO a
`externalRegistrationUrl`, que es el registro de caminantes de la parroquia.

**Secuencia global importable** "Convocatoria de servidores (WhatsApp)", `days_before_retreat` a 45
días. Llega **inactiva** como el resto del pack: el coordinador la revisa antes de que enrole.

Salvaguardas que se heredan del motor y no hubo que inventar: el guard anti-backfill
(`isRetreatClosed`) impide que activarla dispare mensajes de retiros terminados —el incidente de los
164 correos retroactivos—, el opt-out `doNotContact` se respeta, y editar la secuencia no reenvía a
quien ya recibió.

Verificado contra la base real: **71 enrolados, 71 encolados, 0 enviados**, con el mensaje resuelto
("Hola René, ¿te late servir…", fechas 16–18 de octubre y el enlace `/delvalleii/server`).

En el dashboard de la comunidad, el botón "Convocar servidores" **lleva al motor de secuencias**; no
hay ningún camino que mande nada desde ahí.

> **Un servidor sin reuniones que le cuenten ya no sale como 0%.** La proyección a las mesas omitía
> la entrada sólo cuando la persona no estaba en el padrón, pero un miembro con `total = 0` (porque
> se unió después de todas las reuniones consideradas) llegaba con `ratePercent: 0` y la pastilla
> pintaba "0%". Misma mentira, otro camino: ahora la entrada se omite si `total === 0`.

> **El `CHECK` de `global_message_templates.type` bloqueaba el tipo nuevo.** Es una lista fija y
> `SERVER_CONVOCATION` no estaba, así que el INSERT fallaba con `SQLITE_CONSTRAINT_CHECK`. Y la fila
> global hace falta, no sólo las por-retiro: `createRetreat` llama a
> `copyAllActiveTemplatesToRetreat`, así que un retiro creado después se quedaría sin plantilla y el
> paso se omitiría con "sin plantilla" — el fallo silencioso que ya tuvo la invitación de clausura.
> SQLite no permite tocar un CHECK por `ALTER`, así que la migración hace **recreate-table**. Es
> seguro aquí porque la tabla **no tiene FKs entrantes** (verificado contra `sqlite_master`), que es
> el escenario del incidente de 2026-05-07. Se sigue el patrón del skill al pie —
> `transaction = false`, `PRAGMA foreign_keys` OFF/ON, columnas explícitas, `foreign_key_check`— y
> el test trae el **seed-and-verify** obligatorio: ninguna de las 35 filas se pierde.

### Retiros servidos por miembro

`retreatsServed` en cada fila del ranking, ordenable y en el export. Cuenta **sólo retiros de esta
comunidad**: sin el vínculo el número sería "retiros en el movimiento", que es otra cosa. Mide el
compromiso en retiros, no sólo en reuniones — un veterano puede faltar a una preparación y seguir
siendo la apuesta segura para una mesa.

### Retiros de la comunidad en su dashboard

`getDashboardStats` devuelve `retreatCount` y `upcomingRetreats` (los 3 próximos). El corte es por
**`endDate`**: un retiro que empezó ayer y acaba mañana sigue siendo "el próximo" para el
coordinador, no historia. Desde la tarjeta salen los dos accesos que importan: "Asistencia del
equipo" (el reporte ya filtrado a *preparación* + ese retiro) y "Convocar servidores", que lleva al
motor de secuencias.

> **Off-by-one, otra vez.** `retreat.startDate`/`endDate` son columnas date-only y llegan como
> medianoche UTC. Formatearlas en la zona de la comunidad las corría al día anterior: la tarjeta
> mostraba **15 oct** para un retiro que empieza el **16**, y el correo lo habría anunciado igual.
> Fix: `timeZone: 'UTC'` (Regla N°3 del skill `timezone-handling`). El guard está en
> `communityService.test.ts`, con **dos zonas de signo opuesto** (CDMX y Tokio) para que la
> regresión salte desde cualquier runner — verificado por mutación: reintroducir el bug rompe el
> caso de CDMX y no el de Tokio.

## Cobertura real del padrón (medido, 2026-09-07)

La proyección a las mesas une por `participantId`, y en los datos actuales el solape es bajo:

| Retiro | Servidores | En el padrón de Buen despacho |
| --- | --- | --- |
| San Agustín Polanco IV | 21 | 4 |
| Buen Despacho Del Valle II | 11 | 2 |
| La Esperanza de María XII | 20 | 2 |
| San Judas Tadeo Interlomas III | 28 | 1 |
| San Miguel Arcángel XXIII | 57 | 1 |
| Celaya V | 18 | 0 |

No es un bug del join (verificado con SQL a pelo): el padrón tiene 85 miembros y, además de los 6
que sí comparten `Participant` con un servidor, hay **3 personas con el mismo nombre y un
`participantId` distinto** — `Participant` duplicados, porque el miembro de comunidad se creó
aparte del participante del retiro. Hasta que esos duplicados se fusionen, la columna de mesas
mostrará badge para pocos servidores. La leyenda de cobertura existe justo para que eso se vea en
lugar de engañar.

## Lo que NO se hizo (decisiones explícitas)

- **Una tabla de asistencia propia en `retreat_preparation`.** El calendario no lleva asistencia
  suya: se materializa como reunión de comunidad y la asistencia vive en `community_attendance`, que
  ya funciona. Duplicar el sistema habría dado dos números que discrepan.
- **Fusionar los `Participant` duplicados.** Era el cuello de botella real de la columna de mesas y
  **ya está hecho**: ver `docs/features/participant-duplicate-merge.md`. Sobre la base real llevó la
  cobertura de 2 a 5 de 11 servidores.
- **Filtrar el selector global de retiros por comunidad.** Filtrarlo esconde los retiros sin
  comunidad de quien los coordina. Agruparlos por comunidad sería seguro, pero no se hizo.
- **Heredar la timezone de la comunidad al retiro.** Hoy el retiro la hereda de la casa, y cambiarlo
  movería horarios ya materializados.
- **Índice único en `community_attendance (meetingId, memberId)`.** Hoy la unicidad la garantiza
  sólo el código (`recordSingleAttendance` hace findOne+save). Es deuda real, pero añadirlo exige
  recreate-table sobre una tabla con FK.
