# Spec: UX del Minuto a Minuto y de Responsabilidades

> SDD spec — versión 1.0 (2026-10-19). Estado: **aprobada por Leonardo el 2026-10-19**: D1, D2,
> D3 y D6 como están; D5 con sus tres partes; D4 sin objeción. Descartado: un arreglo rápido del
> bug de nombres directo a `master` (lo resuelve D1). Gate de M0 cerrado.

**Branch**: `worktree-ux-mam-responsabilidades` · **Fecha**: 2026-10-19 · **Para**: el próximo
retiro (el de oct-2026 ya terminó; sirve de dato de prueba).

> Repo público: sin nombres de servidores ni teléfonos. Las personas van por rol.

## Problema

Dos pantallas que el equipo usa en el celular durante el retiro se volvieron difíciles de manejar
(evidencia y capturas en `research.md`):

1. **Minuto a Minuto**: un día tiene 45-56 actividades y no se puede ocultar ninguno. En móvil un
   día son ~7 000 px de scroll, y al bajar no queda a la vista en qué día estás.
2. **Responsabilidades**: en el celular el encabezado no cabe. "Crear", "Enviar tareas" y el `⋮`
   **quedan fuera de la pantalla**. En escritorio las tarjetas apilan seis íconos que tapan el
   título.
3. **Enviar tareas**: la lista del popover **no muestra los nombres** (bug en prod desde que se
   añadió "· N documentos"). Además, después de mandarle a un servidor no vuelve a la lista ni
   marca a quién ya se le mandó: 22 servidores son 22 búsquedas.

## Objetivo

- Que en el Minuto a Minuto se pueda trabajar un día a la vez, en el celular.
- Que el encabezado de Responsabilidades quepa en cualquier pantalla, con las acciones raras en
  el `⋮`.
- Que mandar las tareas a todo el equipo sea un recorrido de una sola pantalla: ver la lista,
  mandar, volver con la marca, pasar al siguiente.

## Historias de usuario

1. Como coordinador, el viernes del retiro abro el Minuto a Minuto en el celular y solo veo el día
   de hoy; los otros días están contraídos con su resumen.
2. Como coordinador, salto al día 3 con un toque, sin pasar por las 104 actividades de antes.
3. Como coordinador, en el celular llego a "Crear responsabilidad", "Exportar" e "Imprimir".
4. Como coordinador, la semana antes del retiro abro "Por servidor", veo quién tiene qué y a quién
   ya le mandé sus tareas, y le mando a los que faltan uno tras otro.

## Decisiones de diseño (aprobadas 2026-10-19)

- **D1 — "Enviar tareas" pasa a una pestaña "Por servidor"** (recomendada) en la barra de
  pestañas de la vista, junto a Todos / Charlas / Responsabilidades / Sin asignar.
  Una fila por servidor con sus tareas (responsabilidades, equipos, número de documentos) y el
  estado del envío, más el botón "Enviar". El `MessageDialog` se abre encima de la vista, y al
  cerrarlo la pestaña sigue ahí con la marca puesta: no hace falta encadenar dos diálogos.
  La pestaña sirve también para consultar "quién hace qué".
  *Alternativa*: un `Dialog` con la misma lista. Ocupa menos lugar en la vista, pero para volver
  a la lista después de cada envío hay que cerrar un diálogo y reabrir el otro, y ese es justo el
  patrón de reka-ui que congela la página (`research.md` §4).
- **D2 — Encabezado: búsqueda + `⋮`**. Pasan al `⋮`: "Crear responsabilidad", "Columnas" (2 / 3 /
  4, como opción marcada; solo en escritorio), "Exportar DOCX" e "Imprimir". "Enviar tareas" sale
  del encabezado (D1). En móvil la búsqueda ocupa el ancho y las pestañas bajan a otra línea.
- **D3 — La marca de "ya enviado" sale del historial** (recomendada): un endpoint chico devuelve,
  por servidor, el último envío de la plantilla "Tareas del Servidor" en el retiro (fecha y canal).
  La marca aguanta recargar la página y el trabajo en dos días o de dos coordinadores.
  *Alternativa*: marcar solo en la sesión, sin backend. Al recargar se pierde.
- **D4 — Contraer cada día del Minuto a Minuto.** Un chevron en el encabezado de cada día;
  contraído muestra solo el encabezado con su resumen (completados, solapes y huecos).
  En el `⋮`, sección "Vista", van "Contraer todos" y "Expandir todos".
  El estado se recuerda **por retiro** en el navegador.
  La primera vez: si hoy es un día del retiro, solo ese día se abre; si no, todos abiertos.
  - Buscar, `⏱` y los saltos abren el día de destino.
  - Imprimir siempre sale completo.
  - En la agrupación "por responsabilidad" no hay chevrones.
- **D5 — Mejoras extra del Minuto a Minuto** (recomendado incluir las tres; son chicas):
  - **(a)** chips `D1 D2 D3` en la barra sticky para saltar a un día: lo abren y lo llevan arriba;
  - **(b)** en móvil, el `⋮` no baja a otra línea, y `▶ −5 +5` van en la fila de la hora;
  - **(c)** en un retiro terminado no se muestra "hace 3d".
  Encabezado de día sticky: **fuera** (choca con la barra sticky y con la regla de impresión
  `.print-mam .sticky`; los chips resuelven el "dónde estoy" de forma más barata).
- **D6 — Tarjetas de Responsabilidades: un `⋮` por tarjeta** con Editar, Agregar al equipo y
  Eliminar. Quedan a la vista solo los íconos de documentos (guía, descarga, adjuntos), y el título
  deja de quedar tapado.

## Requerimientos

### Minuto a Minuto (D4, D5)

- **R1** — Módulo puro `apps/web/src/views/mamCollapse.ts` (patrón `mamTime`/`mamMusic`):
  - el estado inicial por retiro (D4), su lectura y escritura en `localStorage` con `try/catch`;
  - "¿qué día del retiro es hoy?" en la timezone del retiro.
- **R2** — Encabezado de día con botón chevron (`aria-expanded`, `aria-controls`). El resumen sigue
  visible contraído.
- **R3** — Día contraído = clase CSS que oculta sus filas en pantalla y que `@media print` anula. No
  `v-if` ni `v-show` (research §1).
- **R4** — `onSearchNext`, `goToNow` y los chips abren el día del destino antes del `scrollToItem`.
- **R5** — `MamMoreActions.vue`, sección "Vista": "Contraer todos" / "Expandir todos" (eventos
  nuevos, sin tocar las acciones existentes).
- **R6** — Chips de día en la barra sticky. Solo en la agrupación por día.
- **R7** — Móvil: el `Input` de búsqueda puede encogerse; la fila de hora y acciones cabe en 390 px;
  `relativeTime` vacío si el retiro terminó hace más de un día.

### Responsabilidades (D1, D2, D6)

- **R8** — Encabezado: búsqueda + `⋮` (`DropdownMenu`) con Crear, Columnas (`DropdownMenuRadioGroup`,
  oculto bajo `sm`), Exportar DOCX, Imprimir. Crear e Imprimir con `deferOpen` (research §4).
- **R9** — Pestañas de filtro que bajan a otra línea cuando no caben; la pestaña nueva "Por
  servidor (N)" al final.
- **R10** — Componente `ServerAssignmentsTab.vue` (desde la Parte 2, `BriefingSendList.vue`: R14):
  - una fila por servidor activo con tareas (`server` + `partial_server`, la misma lista de hoy);
  - cada fila: nombre completo arriba, debajo "X responsabilidades · Y equipos · Z documentos", la
    marca "Enviado el <fecha> por WhatsApp" o "Sin enviar", y el botón "Enviar" (o "Reenviar");
  - buscador y filtro "Todos / Sin enviar".
- **R11** — "Enviar" reusa `onChooseServer` (hidratación del store, documentos, `forceTemplateType`).
  Al cerrarse el `MessageDialog` se recarga la marca del servidor.
- **R12** — `⋮` por tarjeta con Editar, Agregar al equipo (si aplica) y Eliminar, todos con
  `deferOpen`.

### API (D3)

- **R13** — `GET /participant-communications/retreat/:retreatId/latest-by-template-type?type=…`:
  - responde `{ [participantId]: { sentAt, messageType } }` con el último envío por participante;
  - `requireRetreatAccess('retreatId')`, como su vecino;
  - `type` validado contra el catálogo de tipos de plantilla;
  - solo columnas mínimas: nada de `messageContent` ni relaciones.

### Lo que no cambia

- El mensaje, la plantilla y las variables `{assignments.*}` (spec `assignment-documents`).
- La impresión del Minuto a Minuto y el "Imprimir compacto" de la otra sesión.

## Criterios de aceptación (end-to-end)

Contra el retiro de oct-2026 en el dev del worktree, a 1280×900 y a 390×844.

1. Contraer el día 2 deja su encabezado con "0/56 completados"; recargar la página lo mantiene
   contraído; otro retiro no hereda el estado.
2. Con el día 3 contraído, buscar una actividad del día 3 lo abre y la resalta.
3. Con días contraídos, Imprimir (y Ctrl/Cmd+P) muestra los tres días en la vista previa.
4. El chip `D3` abre el día 3 y lo lleva arriba.
5. A 390 px: la barra de búsqueda del Minuto a Minuto queda en una línea con el `⋮`, y el
   encabezado de Responsabilidades no se sale de la pantalla (`scrollWidth` = ancho de ventana en
   los dos encabezados).
6. El `⋮` de Responsabilidades crea una responsabilidad, cambia columnas, exporta e imprime sin
   congelar la página; la prueba `dropdownMenuFreezeGuard` sigue verde.
7. "Por servidor" lista los 22 servidores **con su nombre**; mandar a uno (el botón abre `wa.me`, no
   envía nada) lo marca "Enviado el …", y la marca sigue ahí tras recargar.
8. Un coordinador sin acceso al retiro recibe 403 del endpoint de R13.
9. El título de ninguna tarjeta queda tapado por los íconos en la rejilla de 3 columnas.

Los datos existen en la copia de la base del dev (research, encabezado). El 7 necesita un envío
desde el dev, que se hace en la verificación.

## Parte 2 — Mesas (pedida y aprobada el 2026-10-19)

Leonardo, tras probar Responsabilidades: «en mesas también hay un botón para enviar mensajes, haz
lo mismo». Evidencia en `research.md` §5.

**Problema.** El briefing de mesa (`TABLE_LEADER_BRIEFING`) sale desde dos popovers: uno en el
encabezado con todos los líderes, y uno en cada tarjeta. Ninguno dice a quién ya se le mandó, y
después de cada envío hay que reabrir el popover. Además el encabezado de cada tarjeta lleva
cuatro botones que **recortan el nombre de la mesa a «M»** en la rejilla de 3 columnas, y a «Mes…»
en el celular. Y el selector de columnas se ve en el celular, donde no hace nada.

- **D7 — «Enviar info a líderes» en el `⋮` de Mesas, que abre un diálogo** (cambiada por
  Leonardo el mismo día, al ver la primera versión con pestañas «Mesas · Por líder»: «en las
  mesas hazlo como opción que lanza diálogo»). El diálogo lista a cada líder y colíder con su
  mesa, su rol y sus caminantes, la marca de envío del historial (D3 con
  `type = TABLE_LEADER_BRIEFING`, mismo endpoint) y Enviar / Reenviar, con búsqueda propia y el
  filtro «Sin enviar». Enviar cierra la lista y abre el mensaje; al cerrar el mensaje la lista
  vuelve sola, con su búsqueda y su filtro (dos `Dialog` de reka-ui a la vez congelan la
  página, research §4).
- **D8 — Encabezado de Mesas: búsqueda + `⋮`**, como D2. El selector de columnas pasa al `⋮`
  (solo en escritorio). El popover de líderes del encabezado desaparece: lo reemplaza la opción
  de D7.
- **D9 — `⋮` por tarjeta de mesa**: «Enviar info a <rol> · <nombre>» (uno por líder o colíder),
  «Ver caminantes», «Asignar por foto» y «Eliminar mesa» (deshabilitado si tiene caminantes,
  como hoy). Quedan a la vista el nombre completo, el lápiz para renombrar y el conteo «4 / 7».

**Requerimientos.**

- **R14** — La lista de «Por servidor» se vuelve un componente genérico
  (`BriefingSendList.vue`): filas con persona y líneas de detalle, marca, filtro «Sin enviar» y
  botón. Lo usan Responsabilidades y Mesas. Sus textos van en `briefingList.*` de i18n.
- **R15** — `TablesView.vue`: opción del `⋮` (con `deferOpen`) y diálogo con la lista, ida y
  vuelta lista → mensaje → lista, marcas cargadas con el retiro y recargadas al cerrar el
  `MessageDialog`, encabezado con `⋮` (columnas incluidas). `BriefingSendList` admite
  `v-model:filter` para que el filtro sobreviva al ida y vuelta.
- **R16** — `TableCard.vue`: `⋮` por tarjeta con `deferOpen` en cada opción (abren diálogos).

**Criterios.**

10. El diálogo «Enviar info a líderes» lista los líderes y colíderes con nombre, mesa y rol. Los
    que ya tienen envío en el historial (23 en la base del dev) salen marcados; un envío nuevo
    vuelve a la lista con la marca puesta y la búsqueda intacta, sin congelar la página.
11. Con la rejilla de 3 columnas a 1280 px, el nombre de ninguna mesa queda recortado. El `⋮` de
    la tarjeta abre el mensaje al líder, la lista de caminantes y la asignación por foto sin
    congelar la página.
12. A 390 px el encabezado de Mesas no se sale de la pantalla y el selector de columnas no se ve.

## Fuera de alcance

- Encabezado de día sticky (D5).
- `⏱` con la fecha del navegador en vez de la del retiro (research §1): anotado, sin tocar.
- La vista pública del Minuto a Minuto (`PublicMinuteByMinuteView.vue`).
- Mandar a varios servidores de un solo clic: cada envío sigue revisándose uno por uno (decisión
  del briefing original).
- ~~La misma marca de "ya enviado" en el briefing de líderes de mesa~~: entró como Parte 2.
- Los demás menús de Mesas (rebalancear, limpiar, imprimir…) quedan como están.

## Reconcile

Construido el 2026-10-19 en `worktree-ux-mam-responsabilidades`. Lo que se construyó distinto
del plan, con su motivo, está en `tasks.md` bajo cada milestone. Lo que cambia esta spec:

- **D4**: el default no se guarda hasta que el coordinador toca algo (si no, se congelaría en el
  día de la primera visita).
- **R6**: los chips dicen "Día N".
- **R10**: cada fila lleva también los nombres de sus responsabilidades. La pestaña usa el
  buscador del encabezado, que filtra también por responsabilidad.
- **R11**: documentos y marcas se cargan con el retiro, no al abrir la pestaña (si no, el
  contador saltaba de 19 a 22).
- **R12**: no bastaba con el `⋮`. Título e íconos pasaron a la misma fila.
- **R9**: las pestañas envuelven en vez de desplazarse. Con scroll horizontal, "Por servidor"
  quedaba escondida por debajo de ~900 px y Leonardo no la encontró en su primera prueba.

### Criterio → evidencia

Dev del worktree (API 3005, web 5177, copia de la base del main), retiro de oct-2026.

| # | Resultado |
|---|---|
| 1 | Día 2 contraído muestra su resumen (completados y solapes); tras recargar sigue contraído (`localStorage` = `[2]`). La clave es por retiro (`mamCollapse.test.ts`) |
| 2 | Con el día 3 contraído, buscar "Misa de Cierre del Retiro" lo abrió y dejó la fila resaltada a la vista. También en `MinuteByMinuteCollapse.test.ts` |
| 3 | Con `media: print` y el día 2 contraído, los tres contenedores de filas quedan `display: block`; chevron y chips no salen en papel |
| 4 | El chip "Día 3" abrió el día y dejó su encabezado en y=144, bajo la barra sticky (y=124) |
| 5 | A 390 px: barra del Minuto a Minuto en una línea (sin búsqueda activa) y filas de ~150 a 115 px. Responsabilidades: ningún elemento del encabezado fuera de la pantalla, `⋮` visible, `scrollWidth` = ancho en las dos vistas |
| 6 | `⋮` del encabezado: Crear abre el diálogo y al cancelar `body` queda con `pointer-events: auto`; Columnas 2 cambia la rejilla y se guarda. `⋮` de tarjeta: Editar abre con el nombre cargado. `dropdownMenuFreezeGuard` verde. **No ejercitados en el navegador**: Exportar (sin cambios) e Imprimir del menú (abre el diálogo nativo) |
| 7 | La pestaña lista 22 servidores con nombre. Un envío desde el dev (abre `wa.me`, no envía) marcó "✓ Enviado el 19 oct, 06:54 p.m. por WhatsApp" y "1 de 22"; tras recargar, la marca sigue |
| 8 | 403 sin acceso al retiro: `participantCommunicationLatestByType.test.ts` (prueba del handler con base real, no por HTTP) |
| 9 | 0 de 37 tarjetas con el título tapado en 3 columnas. La comprobación discrimina: con los íconos flotando, como antes, da 27 |

### Parte 2 (Mesas) → evidencia

| # | Resultado |
|---|---|
| 10 | Primera versión (pestaña): 22 líderes, todos marcados con los envíos del 15 de octubre; un reenvío marcó «19 oct, 07:37 p.m.». Versión final (diálogo): con la búsqueda «mesa 2», reenviar a su líder cerró la lista, abrió el mensaje y, al cerrarlo, la lista volvió sola con «mesa 2» y la marca «19 oct, 07:56 p.m.»; `body` quedó con `pointer-events: auto`. Cancelar el mensaje también vuelve a la lista; cerrar la lista a mano limpia la búsqueda |
| 11 | A 1280 px en 3 columnas, 0 de 10 nombres recortados (la comprobación sí detecta un recorte forzado). Desde el `⋮` de la tarjeta, «Enviar info a Líder», «Ver Caminantes» y «Asignar por Foto» abren su diálogo y al cerrarlo `body` queda con `pointer-events: auto`. «Eliminar» sale deshabilitado con caminantes |
| 12 | A 390 px: nada del encabezado fuera de la pantalla, sin selector de columnas, «Mesa 1» completo. El diálogo de líderes se usa entero en esa pantalla |

### Notas de cierre

- El bug de los nombres invisibles sigue en prod hasta que esto se despliegue (se decidió no
  sacar un arreglo aparte).
- La otra sesión (`mam-compact-print`) no había fusionado al cerrar; quien fusione segundo
  resuelve el choque en `MamMoreActions.vue` (los dos agregan acciones al menú, en secciones
  distintas).
