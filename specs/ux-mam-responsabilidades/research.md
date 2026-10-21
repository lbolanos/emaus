# Research: UX del Minuto a Minuto y de Responsabilidades

> Verificado contra `master` en `274f0488` (2026-10-19), en el dev del worktree (copia de la base
> del main) con el retiro de oct-2026: 149 actividades, 37 responsabilidades, 22 servidores con
> tareas. Capturas a 1280×900 y a 390×844 (iPhone). Las anclas van por archivo + función.

## §1 Minuto a Minuto: un día es una pared de 45-56 filas

- El retiro de oct-2026 tiene **48 / 56 / 45** actividades en los días 1 / 2 / 3, y 143 de las 149
  llevan descripción de plantilla (una línea más por fila).
- `MinuteByMinuteView.vue` pinta todos los días seguidos (`groupedItems`, `v-for` por grupo) sin
  forma de ocultar ninguno. El encabezado del día (`Día N · fecha · completados · solapes`) **no es
  sticky**: al bajar por el día 2 no hay nada en pantalla que diga en qué día estás.
- En móvil cada fila mide ~150 px: la fila de la hora (`09:00 a.m. 60m · 10:00 hace 3d`) no deja
  sitio a las acciones `▶ −5 +5`, que bajan a una línea propia. Un día son ~7 000 px de scroll.
- En móvil la barra sticky de búsqueda baja el `⋮` a una segunda línea: el `Input` tiene
  `min-w-[200px]` y junto con `+` y `⏱` no cabe en 390 px.
- En un retiro terminado cada fila dice `hace 3d` (`relativeTime`): ruido sin información.
- El botón `⏱` busca la próxima actividad de **hoy** con la fecha del navegador
  (`nextTodayItemId`), no la del retiro. Fuera de alcance (ver spec), anotado.

### Lo que hay que respetar al colapsar

- **Impresión**: `onPrint` llama a `window.print()` y la hoja de estilos `@media print` del
  componente "expande todos los días". Ctrl/Cmd+P imprime sin pasar por `onPrint`. Por eso un día
  colapsado tiene que seguir en el DOM y ocultarse con una clase que `@media print` anule — con
  `v-if` o `v-show` (estilo inline) el papel saldría sin ese día.
- La misma hoja oculta `.print-mam .sticky` (pensado para la barra de búsqueda). **Cualquier
  elemento sticky nuevo desaparece del papel** salvo que se excluya.
- La búsqueda (`searchMatches`, `onSearchNext`, `scrollToItem`) y `goToNow` hacen scroll a una
  fila por id: si la fila está en un día colapsado, no hay a dónde ir.
- La agrupación vive en `localStorage` (`minuteByMinute.groupBy`); en modo "por responsabilidad"
  los grupos no son días.

### Otra sesión trabaja en el mismo archivo

El worktree `worktree-mam-compact-print` (spec `specs/mam-compact-print/`) añade "Imprimir
compacto" a `MamMoreActions.vue` (acción `print-compact`) y lo conecta en las dos instancias del
menú dentro de `MinuteByMinuteView.vue`. Esta spec toca los mismos dos archivos en otras zonas
(sección "Vista" del menú; encabezado de día). Conflicto esperable y pequeño: se resuelve trayendo
`master` a la rama antes de cerrar.

## §2 Responsabilidades: el encabezado no cabe

`ResponsabilitiesView.vue`, encabezado sticky, en orden:
`Input` de búsqueda (`w-64`) · `Select` de columnas (`w-[140px]`) · botón "Crear Responsabilidad"
· `Popover` "Enviar tareas" · `DropdownMenu` `⋮` (Exportar DOCX, Imprimir).

- **Escritorio (1280)**: el título se parte en dos líneas y el `Select` pinta "3 / Columnas" en dos
  líneas.
- **Móvil (390)**: la fila no envuelve (`flex items-center gap-2`): **"Crear", "Enviar tareas" y el
  `⋮` quedan fuera de la pantalla** y no hay forma de alcanzarlos. Las pestañas de filtro (Todos /
  Charlas / Responsabilidades / Sin asignar) también se salen por la derecha.
- El selector de columnas no hace nada en móvil (la rejilla es de una columna) y en escritorio es
  una preferencia que se toca una vez: se guarda en `localStorage`
  (`responsibilities_column_count`).
- Crear una responsabilidad es raro: las 37 del retiro vienen del template.

### Las tarjetas

Cada tarjeta lleva hasta **seis** botones de ícono arriba a la derecha (ver guía, descargar,
adjuntos con contador, agregar al equipo, editar, eliminar). En la rejilla de 3 columnas tapan el
título: "Oración de Intercesión" queda debajo de los íconos. Tres de los seis son "documento"
(guía, descarga, adjuntos) y no se distinguen a simple vista.

## §3 "Enviar tareas": el popover

- `Popover` de `w-80` (320 px) con buscador y una fila por servidor (`assignmentsCandidates`).
- **Bug en prod**: la fila es `nombre (truncate) · conteos (shrink-0, whitespace-nowrap)`. Con
  "· N documentos" (añadido el 2026-10-19, spec `assignment-documents`) los conteos ocupan todo el
  ancho y **el nombre se recorta a cero**: la lista muestra 22 filas de números sin saber de quién
  son. Se ve en la captura a 1280.
- Flujo: elegir → se cierra el popover → `nextTick` → `MessageDialog` (patrón de
  `onChooseServer`). Al cerrar el diálogo **no vuelve a la lista**: para el siguiente servidor hay
  que reabrir el popover y buscar de nuevo. Con 22 servidores son 22 vueltas, sin marca de a quién
  ya se le mandó.

### ¿Se puede saber a quién ya se le mandó?

Sí, con datos que ya existen. `MessageDialog` registra cada envío en `participant_communications`
con `templateId` (`participantCommunicationStore.createCommunication`), y la plantilla del retiro
tiene `type = 'SERVER_ASSIGNMENTS_BRIEFING'`. Lo que falta es una consulta barata:
`GET /participant-communications/retreat/:retreatId` existe pero trae el mensaje entero y las
relaciones, paginado a 50, y no filtra por tipo de plantilla.

En el dev hay 327 envíos registrados para el retiro (23 `TABLE_LEADER_BRIEFING`, ninguno
`SERVER_ASSIGNMENTS_BRIEFING`): el criterio de "ya enviado" se ejercita mandando uno desde el dev
(el botón solo abre `wa.me`, no envía nada solo).

`MessageDialog` solo emite `update:open`; no avisa que se envió.

## §4 Menús que abren diálogos o imprimen

Desde `e732045a` (`apps/web/src/test/dropdownMenuFreezeGuard.test.ts`) una prueba recorre todos
los `.vue` y falla si un `DropdownMenuItem` que abre un overlay o imprime no pasa por `deferOpen`
(`useRekaDialogFix`). Toda opción nueva de un `⋮` que abra un `Dialog` (crear, editar, eliminar,
agregar al equipo) o imprima va con `@select="deferOpen(...)"`.

## §5 Mesas (Parte 2)

Mismo retiro y mismo dev, a 1280×900 y 390×844.

- **Encabezado** (`TablesView.vue`): búsqueda · `Select` de columnas · popover «Enviar briefing a
  líderes» (✈, lista de todas las mesas: mesa, rol, nombre) · `⋮` con rebalancear, limpiar,
  crear, borrar vacías, asistencia, imprimir y ayuda. El `Select` lleva
  `class="hidden sm:inline-flex"`, pero el componente no la aplica: **a 390 px se ve** («3»), y
  ahí la rejilla es de una columna.
- **Tarjeta** (`TableCard.vue`): nombre (`truncate`) · lápiz · conteo «4 / 7» · popover ✈ con los
  líderes de esa mesa · ver caminantes · asignar por foto · eliminar. **A 1280 px en 3 columnas el
  nombre queda en «M»**; a 390 px en «Mes…». El conteo se parte en dos líneas.
- **Flujo de envío**: elegir en el popover → se cierra → `nextTick` → `MessageDialog` con
  `TABLE_LEADER_BRIEFING` y `tableData` (`buildTableData`, `onChooseLeader` /
  `sendBriefingToLeader`). Igual que el popover de Responsabilidades: sin marca de envío y sin
  volver a la lista.
- **Datos para la marca**: en la base del dev hay 23 envíos `TABLE_LEADER_BRIEFING` del retiro de
  oct-2026 (research §3). El endpoint de D3 ya filtra por cualquier tipo: no hace falta backend.
- **Pruebas que montan estas vistas.** `TableCardBriefing.test.ts` y `TableCardRename.test.ts`
  enumeran a mano los componentes de `@repo/ui`: el `DropdownMenu` de la tarjeta tiene que entrar
  ahí. `TablesViewSearch.test.ts` y `TablesViewServerAttendance.test.ts` usan un `Proxy` que acepta
  cualquier componente, pero su mock de `@/services/api` no tendrá la función de las marcas.
