# Spec: UX móvil de la vista de Mesas

**Estado**: implementada y verificada 2026-10-20, pendiente de merge · **Branch**: `worktree-mesas-ux-foto` · **Fecha**: 2026-10-19

## Problema

La vista de Mesas (`apps/web/src/views/TablesView.vue` + `TableCard.vue`) no se puede operar desde
el celular. Cuatro problemas verificados en el código:

1. **El número de mesa no se lee.** El número vive en `table.name` ("Mesa 3"; es texto libre, no
   hay campo numérico) y se pinta con el `CardTitle` de `@repo/ui` a `text-2xl` fijo, con
   `truncate` + `min-w-0`, en la única fila del `CardHeader` (`p-6`). Esa fila también contiene el
   contador "n / 7" y hasta cuatro botones `size="icon"` de 40 px (briefing, caminantes, asignar
   por foto, eliminar), más el lápiz de renombrar dentro del propio título. En una pantalla de
   ~390 px quedan ~70-90 px para el título: el `truncate` corta "Mes…" y el número — que está al
   final del texto — es lo primero que desaparece. `TableCard.vue` no tiene una sola clase
   responsive.
2. **El panel superior se come la pantalla.** El panel sticky (búsqueda + tabs server/walker +
   pastillas de sin asignar con `max-h-24`) ocupa 180-220 px permanentes en un teléfono.
3. **El detalle de caminantes es ilegible.** El dialog de la mesa (`TableCard.vue`, dialog de
   walkers) es una tabla de 8 columnas en un `max-w-4xl`: en celular exige scroll horizontal
   denso para leer un teléfono o una cama.
4. **El tap-to-assign no se deja descubrir.** La única señal de que hay un participante
   seleccionado es un borde verde tenue en la zona destino, y el botón para desasignar es un
   flotante fijo `bottom-6` que tapa contenido.

## Objetivo

Que un coordinador opere la asignación de mesas completo desde el celular: leer el número de cada
mesa, asignar por tap, revisar la lista de caminantes y ejecutar las acciones de cada mesa, sin
scroll horizontal ni contenido tapado. El desktop se mantiene como está.

## Decisiones

| # | Decisión | Alternativa descartada |
| --- | --- | --- |
| D1 | **Título compacto en móvil**: `text-base sm:text-2xl` y `CardHeader` con `p-3 sm:p-6`, `gap-1.5 sm:gap-2`. "Mesa 12" pasa a disponer de ~200 px y cabe entera. Referencia: `BedCard.vue`, que ya resuelve igual el número de cama. | Extraer el número a un badge aparte: el nombre es texto libre ("Mesa de la Virgen") y no hay número garantizado que extraer. |
| D2 | **Acciones en menú "⋮" en móvil**: dual layout por CSS (`hidden sm:flex` / `sm:hidden`, patrón de `BedAssignmentsView.vue`). Desktop conserva los botones actuales (a `h-8 w-8`); móvil los colapsa en un `DropdownMenu`. Los ítems que abren dialog usan `useRekaDialogFix` + `@select="deferOpen(...)"` (bug conocido de reka-ui). **Adenda 2026-10-20**: en desktop el nombre manda — si los botones truncarían el título, también colapsan al "⋮" y vuelven cuando hay espacio (medición por `useDesktopActionsOverflow`). | Solo achicar los botones: cuatro botones de 32 px + contador siguen comiendo ~150 px del título; el problema de fondo es la cantidad de acciones, no su tamaño. |
| D3 | **Panel sticky colapsable**: toggle en la fila de tabs que colapsa el bloque de sin asignar (default expandido — el flujo de tap-assign necesita las pastillas visibles) + paddings reducidos. | Mover el panel a un Sheet/Drawer: `@repo/ui` no tiene ese componente; introducirlo es alcance mayor para esta spec. |
| D4 | **Dialog de caminantes dual**: tabla actual `hidden sm:block`; en móvil, lista de cards con `<dl>` por walker usando las mismas keys `tables.tableCard.*` y los helpers `getBedLocation`/`getPhones` existentes. Máximo 7 walkers ⇒ lista corta sin scroll horizontal. | Achicar u ocultar columnas de la tabla: son datos útiles (teléfonos, cama, parroquia) y 8 columnas no caben en 390 px digan lo que digan los tamaños. |
| D5 | **Banner de tap-to-assign en el panel sticky** ("Toca la mesa de destino…" + Quitar/Cancelar) que reemplaza al botón flotante `Teleport fixed bottom-6`, más `ring-2` en las zonas destino y un hint textual en la zona de walkers. | Conservar el flotante y solo reforzar los rings: el flotante tapa contenido, queda lejos de donde está la pastilla seleccionada y no explica qué hacer. |

## Historias

1. Como coordinador con el celular, veo "Mesa 12" completa en el título de cada card y distingo
   las mesas de un vistazo.
2. Como coordinador con el celular, ejecuto todas las acciones de una mesa (briefing, ver
   caminantes, asignar por foto, eliminar) desde el menú "⋮" sin que la página se congele.
3. Como coordinador con el celular, colapso el panel de sin asignar y recupero pantalla para ver
   las mesas.
4. Como coordinador con el celular, abro el detalle de caminantes y leo teléfono, cama y parroquia
   de cada uno sin scroll horizontal.
5. Como coordinador con el celular, toco una pastilla del panel y el banner me dice qué hacer; las
   zonas destino se marcan con un anillo evidente.

## Requerimientos

- **R1** En viewport ~390 px el nombre de mesa se muestra completo para los nombres reales
  ("Mesa 1"…"Mesa 12"); el truncate solo entra para nombres anormalmente largos (D1).
- **R2** El conjunto contador + acciones ocupa en móvil un solo botón "⋮" + el contador; el lápiz
  de renombrar queda único y compartido entre móvil y desktop, con sus testids intactos (D2).
- **R3** El panel sticky queda en ~92 px colapsado / ~150 px expandido; el bloque de sin asignar
  se colapsa por toggle y el estado default es expandido (D3).
- **R4** El dialog de caminantes renderiza lista de cards en `<640 px` y tabla de 8 columnas a
  partir de `sm`; misma información en ambos (D4).
- **R5** Con un participante seleccionado por tap: banner visible en el panel sticky con su nombre
  y acciones Quitar/Cancelar, `ring-2` en zonas destino, y el botón flotante de desasignar
  eliminado (D5).
- **R6** Desktop (`≥ sm`) se comporta y ve igual que hoy, salvo el tamaño del padding/título que
  pasa a estar explícito (`sm:` conserva los valores actuales) (D1, D2) — **y desde la adenda
  2026-10-20**: si los botones directos truncarían el título, colapsan al "⋮" y el nombre se ve
  completo (el título nunca pierde contra las acciones).

## Criterios de aceptación

- Tests existentes `TableCardRename.test.ts` y `TableCardBriefing.test.ts` pasan **sin cambios de
  assertions** (solo se ensancha el mock de `@repo/ui` con `DropdownMenu*`): garantiza que los
  testids y los flujos sobrevivieron al redisño del header.
- Tests existentes `TablesViewSearch.test.ts` y `TablesViewServerAttendance.test.ts` pasan tras
  tocar `TablesView.vue`.
- Verificación manual en el worktree (DevTools, viewport 390×844 touch, retiro demo San Agustín
  que tiene mesas con walkers asignados):
  - "Mesa N" se lee completa en cada card.
  - El menú "⋮" abre y cada ítem funciona; "Asignar por foto" abre su dialog sin congelar la
    página (valida `deferOpen`).
  - Renombrar una mesa desde el móvil (el editor inline preselecciona el número).
  - El toggle colapsa/expande el panel de sin asignar.
  - El dialog de caminantes no tiene scroll horizontal.
  - Tap en pastilla → banner con nombre + rings en zonas; asignación por tap funciona.

## Fuera de alcance

- La asignación por drag & drop en desktop y su lógica de conflictos (tags, familia/amigos) no se
  tocan.
- `PhotoAssignmentDialog` (asignación de walkers por foto con análisis) no se modifica; solo
  cambia desde dónde se abre.
- No se añade Sheet/Drawer a `@repo/ui`.
- Otras vistas (camas, participantes) aunque compartan patrones.

## Reconcile (cierre)

**Implementada y verificada el 2026-10-20** en `worktree-mesas-ux-foto` (commits 9e26b977 A1,
489909ef A2, 2c6c4910 A3+A4). Verificación manual en Playwright, viewport 390×844 con emulación
táctil real (`hasTouch`), contra el retiro demo **Buen Despacho** (`e9b3c568`, 10 mesas "Mesa
1"…"Mesa 10" con walkers) — no San Agustín como decían los criterios: Buen Despacho tenía mejor
cobertura (mesas de dos dígitos, zonas libres y ocupadas). Tests: Rename + Briefing verdes, builds
api/web verdes.

Verificado por dato (no a ojo):

- **R1**: 10/10 títulos sin truncar (`scrollWidth <= clientWidth`), 0 scroll horizontal en la
  página. Los de dos dígitos ("Mesa 10") caben enteros.
- **R2**: 10 menús "⋮" renderizados; testids de rename intactos; lápiz único. Ítems del menú:
  briefing por líder, Ver Caminantes, Asignar por Foto, Foto del recuerdo (spec hermana),
  Eliminar Mesa (disabled con walkers).
- **R3**: ver desviación 1.
- **R4**: dialog de walkers renderiza 4 `<dl>` (uno por caminante de Mesa 1), tabla desktop
  oculta en móvil, `dialogScrollX: false`, `pageScrollX: false`.
- **R5**: banner `tap-assign-banner` con nombre + Quitar/Cancelar; **asignación real por tap**
  (Oscar → Co-Líder 2 de Mesa 1, confirmada contra el API y el estado del store) y
  **desasignación** vía "Quitar de mesa" (estado restaurado). Zonas destino con ring azul;
  flotante `Teleport` eliminado.

Desviaciones:

1. **R3 — cifras**: el sticky (header + búsqueda + tabs) quedó en **149 px fijos**; el bloque de
   sin-asignar es colapsable pero vive **fuera** del sticky y suma aparte cuando está expandido.
   El estado "~92 px colapsado" no existe: colapsar oculta las pastillas, no encoge el sticky.
   El objetivo de fondo (recuperar pantalla) se cumple; la deuda es que el sticky propio nunca
   baja de 149 px. **Deuda adicional (review de cierre, 2026-10-20)**: el banner de tap-to-assign
   vive en ese bloque no-sticky, así que con la página scrolleada y un caminante seleccionado los
   botones Quitar/Cancelar quedan fuera de pantalla — el flotante eliminado sí era visible ahí.
   Candidato para el segundo ciclo (sticky compacto con el banner integrado), no corregido aquí.
2. **Ensanche de mocks mayor al previsto**: además de los stubs `DropdownMenu*` en el mock local
   de `@repo/ui`, Rename/Briefing necesitaron `ImagePlus` en el mock local de lucide y stub de
   `TableMemoryPhotoDialog.vue` — el menú ⋮ es compartido con la spec `table-memory-photo`.
   Assertions intactas (el criterio se cumple en lo que importa).
3. **Pastillas touch-only**: `useTapAssign` solo registra `touchstart/touchend` y hace
   `preventDefault` del click sintético, así que un click de mouse no las activa (por diseño).
   Verificarlas exigió un contexto Playwright con `hasTouch: true` y `touchscreen.tap`. Nota
   para reproducir la verificación, no un bug.
4. **"Asignar por foto" no se abrió en browser**: comparte el mismo `deferOpen` que los otros
   ítems del menú; sí se abrieron y validaron (sin congelar, `pointerEvents: auto`) los dialogs
   de walkers y de foto del recuerdo.

Lo descartado se mantiene descartado (D1–D5): sin badge de número extraído, sin Sheet/Drawer en
`@repo/ui`, sin achicar la tabla de caminantes, sin conservar el flotante.

### Adenda 2026-10-20 (mismo worktree, pre-merge): el nombre manda también en desktop

Pedido del usuario tras la revisión: en desktop el nombre de mesa debe verse **siempre**; si no
hay espacio, las acciones van al "⋮". Implementado con `useDesktopActionsOverflow`
(`apps/web/src/composables/useDesktopActionsOverflow.ts`):

- Colapsa cuando el título truncaría con los botones visibles (`scrollWidth > clientWidth`).
- Re-expande cuando el hueco real entre título y bloque derecho (`rightBlock.left -
  titleBlock.right`) cabe la diferencia acciones−"⋮". Medir ese hueco —y no el ancho del span,
  que con `justify-between` no crece al colapsar— fue la corrección clave: la primera versión
  medía sobre el span y quedaba pegada en colapsado.
- Reacciona a resize (window + ResizeObserver del título/header) y al rename / alta-baja de
  líderes (watch). Histéresis de 2 px y re-chequeo post-toggle acotado (≤4 rAF) contra
  oscilación en el borde.

Verificado por dato (Playwright, Buen Despacho): a 1280×900 con cards de 299 px los 10 cards
colapsan al "⋮" y los títulos se ven enteros (antes "Mesa 1" quedaba en ~50 px: "Mes…"); a
1920×1080 (cards de 512 px) los 10 muestran botones; rename a nombre largo (331 px) colapsa en
el acto sin truncar; rename de vuelta a corto re-expande sin cambiar el viewport; móvil 390×844
sin regresión (⋮, título entero). Tests: `useDesktopActionsOverflow.test.ts` (7, decisión pura)
+ Rename/Briefing/TablesView 29/29, vue-tsc limpio. Screenshots:
`.playwright-mcp/mesas-desktop-{1280-colapsado,1920-expandido}.png`.
