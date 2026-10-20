# Briefing de mesa para líderes

Permite, una vez armadas las mesas, enviar por WhatsApp a cada **líder/colíder** un
mensaje con el roster de caminantes de su mesa (teléfonos propios + ambos contactos de
emergencia) y el **guion** que debe usar para contactar a cada caminante.

## Disparadores

Desde 2026-10-19 (`specs/ux-mam-responsabilidades`, Parte 2: D7 y D9) hay dos, en la vista
**Mesas** (`TablesView.vue`). Antes eran dos popovers (uno en el encabezado, uno por tarjeta),
sin marca de envío; el de la tarjeta, junto con sus otros tres botones, recortaba el nombre de
la mesa a «M».

1. **«Enviar info a líderes» en el `⋮` del encabezado**, que abre un diálogo con
   `BriefingSendList.vue` (la misma lista que «Por servidor» en Responsabilidades): cada líder
   y colíder con su mesa, su rol y sus caminantes, la marca **«Enviado el … por
   WhatsApp/correo»** y Enviar / Reenviar, con búsqueda propia (persona o mesa) y el filtro
   «Sin enviar».
   - **Ida y vuelta**: Enviar cierra la lista y abre el `MessageDialog` diferido
     (`deferOpen`); al cerrarse el mensaje, la lista vuelve sola, también diferida. Dos `Dialog`
     de reka-ui abiertos a la vez dejan `pointer-events: none` en `<body>`. Búsqueda y filtro
     viven en la vista (`v-model:filter`) y sobreviven al ida y vuelta; se limpian solo cuando
     el usuario cierra la lista (`update:open`, que el cierre programático no emite).
   - La marca sale del historial: `GET /api/participant-communications/retreat/:retreatId/latest-by-template-type?type=TABLE_LEADER_BRIEFING`
     (ver `server-assignments-briefing.md`), cargada con el retiro y recargada al cerrar el
     `MessageDialog`. Es por persona: quien lidera dos mesas queda marcado en las dos filas.
   - Primero fue una pestaña «Mesas · Por líder»; Leonardo la cambió por esta opción el mismo
     día (`specs/ux-mam-responsabilidades`, D7).
2. **`⋮` de cada tarjeta** (`TableCard.vue`): una opción «Enviar info a <rol> · <nombre>» por
   cada líder presente, junto a Ver caminantes, Asignar por foto y Eliminar. Todas pasan por
   `deferOpen` (`useRekaDialogFix`): abren diálogos desde un menú de reka-ui.

Los dos abren el `MessageDialog` con:

- el líder elegido como destinatario (su ficha del store, con teléfono),
- la plantilla **"Briefing de Mesa para Líderes"** preseleccionada,
- las variables `{table.*}` resueltas con los datos de esa mesa.

## Scope de variables `table.*`

Definido en `packages/utils/src/index.ts` (`TableData`, `buildTableReplacements`,
`replaceTableVariables`, `getMockTable`) e integrado en `replaceAllVariables` /
`findEmptyVariables` como último parámetro opcional `table`.

| Variable | Contenido |
| --- | --- |
| `{table.name}` | Nombre de la mesa |
| `{table.liderName}` / `{table.colider1Name}` / `{table.colider2Name}` | Nombres de líderes |
| `{table.walkersCount}` | Cantidad de caminantes |
| `{table.walkersNames}` | Lista de nombres separados por coma |
| `{table.walkersRoster}` | Bloque pre-formateado (líneas con `<br>`): por caminante, nombre + teléfonos propios + contacto de emergencia 1 y 2 (nombre, relación, teléfonos). Solo imprime teléfonos con dígitos. |

El roster se arma **client-side** en `TableCard.buildTableData()` enriqueciendo cada
walker desde `participantStore` por `id` (el payload de mesas no trae los contactos de
emergencia completos). **No requiere cambios de backend en runtime.**

## Plantillas

Se siembran **dos** tipos nuevos (`packages/types/src/message-template.ts`), ambos
editables por retiro:

- **`TABLE_LEADER_BRIEFING`** — el briefing al líder. Usa el scope `{table.*}` y el
  guion embebido lleva los datos del retiro (`{retreat.parish}`,
  `{retreat.walkerArrivalTime}`, `{retreat.thingsToBringNotes}`). El nombre del
  caminante va como **texto literal** `[nombre del caminante]` (no
  `{participant.firstName}`, que resolvería al líder). El picker muestra la categoría
  **"Mesa"** (`BaseMessageTemplateModal.vue`).
- **`WALKER_CONFIRMATION`** — el mensaje de confirmación de asistencia que se envía
  **directamente a cada caminante** (desde su popover "Mandar mensaje", flujo
  `ParticipantInfoPopover` → `MessageDialog`). Usa `{participant.firstName}` (resuelve
  al caminante) + los datos del retiro, así que se llena solo al enviarlo. **Sí**
  aparece en el selector manual de plantillas.

### El briefing NO es seleccionable manualmente

`TABLE_LEADER_BRIEFING` se **oculta del selector de plantillas** del `MessageDialog`
(`MANUAL_HIDDEN_TEMPLATE_TYPES`), porque sus variables `{table.*}` solo se llenan vía
los disparadores de arriba (que pasan el `tableData`). Solo se muestra/selecciona cuando el
diálogo se abre con `forceTemplateType='TABLE_LEADER_BRIEFING'`. Así se evita que un
usuario la elija en un envío normal y mande `{table.*}` vacías.

Además, `findEmptyVariables` (en `@repo/utils`) **no marca** `{table.*}` como "variables
sin datos" cuando no hay contexto de mesa: el consejo de "revisa los datos del
caminante/retiro" no aplica a ese scope (solo se llena vía el flujo de briefing).

## Migración

`apps/api/src/migrations/sqlite/20260608120000_AddTableLeaderBriefingTemplate.ts`:

- Recrea el CHECK de `global_message_templates` para aceptar los tipos nuevos
  (`TABLE_LEADER_BRIEFING` y `WALKER_CONFIRMATION`; la tabla `message_templates` ya no
  tiene CHECK sobre `type`).
- Siembra ambas plantillas globales y las copia a cada retiro existente. Retiros nuevos
  las reciben vía `copyAllActiveTemplatesToRetreat`.
- `transaction = false` + recreate-table seguro. Idempotente y reversible.

## Archivos clave

- `packages/utils/src/index.ts` — scope `table.*`.
- `packages/types/src/message-template.ts` — tipo `TABLE_LEADER_BRIEFING`.
- `apps/api/src/migrations/sqlite/20260608120000_AddTableLeaderBriefingTemplate.ts`.
- `apps/web/src/composables/useParticipantMessageDialog.ts` — singleton con `tableData` + `templateType`.
- `apps/web/src/components/MessageDialog.vue` — props `tableData` + `forceTemplateType`.
- `apps/web/src/views/TableCard.vue` — `⋮` de la tarjeta + `buildTableData()`.
- `apps/web/src/views/TablesView.vue` — opción y diálogo «Enviar info a líderes», marcas, y enlaza
  `tableData`/`forceTemplateType`.
- `apps/web/src/components/BriefingSendList.vue` — la lista con la marca de envío.
- `apps/web/src/components/BaseMessageTemplateModal.vue` — categoría "Mesa".

## Tests

- `apps/web/src/utils/__tests__/tableVariables.test.ts` — roster, contactos de emergencia, filtro de teléfonos, mock.
- `apps/web/src/views/__tests__/TableCardBriefing.test.ts` — opciones del `⋮`, Eliminar
  deshabilitado con caminantes, enriquecimiento, apertura del dialog.
- `apps/web/src/views/__tests__/TablesViewLeaders.test.ts` — opción del `⋮`, filas, búsqueda,
  ida y vuelta lista → mensaje → lista, limpieza al cerrar, marcas (carga, recarga, fallo).
- `apps/web/src/components/__tests__/BriefingSendList.test.ts` — la lista.
- `apps/api/src/tests/migrations/addTableLeaderBriefingTemplate.test.ts` — seed global + copia a retiros + idempotencia + down.
