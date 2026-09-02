# Tasks: Editor de volante de retiros

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `specs/flyer-editor/spec.md`
- [x] `specs/flyer-editor/research.md`
- [x] `specs/flyer-editor/plan.md`
- [x] `specs/flyer-editor/tasks.md`

## M1 — Refactor a bloques, layout fijo (sin UI nueva)

- [x] `apps/web/src/composables/useFlyerContent.ts` — extraer los computeds de texto/datos
- [x] `apps/web/src/components/flyer/blockRegistry.ts` — `FLYER_BLOCK_COMPONENTS` + `FLYER_DEFAULT_LAYOUT`
- [x] Ocho bloques en `apps/web/src/components/flyer/blocks/`
- [x] Chrome: `FlyerHeader.vue`, `FlyerBanner.vue`, `FlyerFooter.vue`
- [x] `apps/web/src/components/flyer/RetreatFlyerCanvas.vue` (grid `left`/`right`/`wide`)
- [x] `RetreatFlyerView.vue` reducido a shell + acciones; borrar `calculateContentHeight`
- [x] `RetreatFlyerView.test.ts` verde (ajustar aserciones ligadas a posiciones absolutas)
- [x] Revisión visual con un retiro real por `retreat_type` (valida los cuatro logotipos)
- [x] Verificar imprimir / copiar imagen / PDF

**Done**: el volante se ve equivalente al actual, renderizado desde bloques en grid.

## M2 — Editor: reorden, visibilidad y textos

- [x] Schema v2 en `packages/types/src/index.ts` (`layoutVersion`, `blocks`, `images`)
- [x] `apps/web/src/utils/flyerLayout.ts` — `resolveFlyerLayout` + tests
- [x] `apps/web/src/stores/flyerEditorStore.ts`
- [x] Ruta `retreats/:id/flyer/edit` + `RetreatFlyerEditView.vue`
- [x] `FlyerBlockList.vue` con arrastre HTML5 entre tres celdas + `Switch` de visibilidad
- [x] Pestaña Textos (migrar los inputs `*Override`)
- [x] `RetreatModal.vue`: quitar la pestaña Volante y el editor JSON; **fix del clobber** (spread)
- [x] i18n `retreatFlyerEditor.*` en es/en
- [x] Íconos nuevos al `vi.mock('lucide-vue-next')` de `apps/web/src/test/setup.ts`
- [x] Tests: store, vista del editor, caso v1 legacy en el canvas
- [x] Prueba manual: guardar desde otra pestaña del modal no borra el diseño

**Done**: reordenar/ocultar persiste; los retiros v1 se ven igual.

## M3 — Imágenes

- [x] `imageService.processFlyerAsset` (fit `inside`, 1600px fondos / 512px logo, WebP q85)
- [x] `uploadFlyerAssetSchema` en `packages/types`
- [x] `POST /flyer-assets` (controller + route + montaje) con fallback data-URI sin S3
- [x] `uploadFlyerAsset()` en `apps/web/src/services/api.ts`
- [x] `flyerPresetAssets.ts` + `FlyerImagePicker.vue` (galería + subida)
- [x] Chrome y canvas leyendo `images.*` con fallback a presets
- [x] **Verificar CORS del bucket** — hecho el 2026-09-02 contra el bucket real: `emaus-media`
      responde `Access-Control-Allow-Origin: *` con GET, y un `fetch(..., {mode:'cors'})` desde
      el origen `https://emaus.cc` devuelve 200. Además `html-to-image` inlinea por fetch a data
      URI (no pinta la URL remota), así que el canvas no se contamina. No hubo que cambiar nada.

**Done**: las cuatro imágenes se cambian desde el editor y salen en volante, PDF e imagen copiada.

## M4 — Plantillas

- [x] `apps/api/src/entities/flyerTemplate.entity.ts` + registro en `database/config.ts`
- [x] Migración `CreateFlyerTemplates` (tabla + dos índices, `transaction = false`)
- [x] Schemas `flyerTemplateSchema` / `create` / `update`
- [x] `flyerTemplateService.ts` + controller + routes + montaje
- [x] `flyerTemplateStore.ts` + `FlyerTemplatePanel.vue`
- [x] Tests de autorización: personal, comunidad (admin activo), superadmin, tercero → 403

**Done**: guardar, listar, aplicar y eliminar plantillas con el alcance correcto.

## M5 — Cartel configurable y arrastre sobre el volante

Tras la revisión del usuario: "que no se vea como un sitio web… más artístico".

- [x] Schema `flyerBlockStyleSchema` / `flyerThemeSchema` + `theme` y `blockStyles` en flyer_options
- [x] `apps/web/src/utils/flyerStyle.ts` — cascada, rgba compuesto, scrim, presets (+18 tests)
- [x] Defaults de cartel en `blockRegistry` + lista de excepciones fijas documentada
- [x] Los ocho bloques sin caja, con colores por CSS vars
- [x] `FlyerSlotColumn.vue` — celda con arrastre y selección
- [x] `RetreatFlyerCanvas` editable: emite `moveBlock` / `selectBlock`, pinta el scrim
- [x] Store: `theme`/`blockStyles` de primera clase (dirty, save, applyTemplate) + selección
- [x] `FlyerDesignPanel.vue` + `FlyerStyleFields.vue`; pestaña unificada "Diseño"
- [x] i18n `retreatFlyerEditor.design.*` en es/en
- [x] Tests: estilo, canvas editable, vista, store, schema del API
- [x] Verificación en navegador: arrastre real, presets, override por bloque, PDF de una página

**Done**: el volante se ve como un cartel, los bloques se mueven sobre él y cada uno puede llevar
su propio fondo (incluido ninguno) y color de texto.

## M6 — Pulido tras usarlo

Ronda de mejoras que Leonardo pidió al probar el editor terminado ("¿cómo podemos mejorar?"),
más los dos remates de la vista de plantillas.

- [x] "Qué llevar" reconoce listas escritas con comas; se cae el punto final del último ítem
- [x] Aviso al salir con cambios sin guardar (guard de ruta + `beforeunload`)
- [x] Aviso de contraste pobre: triángulo en la lista y explicación en el panel del bloque
- [x] "Ajustar colores a la imagen": mide el brillo medio del fondo y propone la paleta
- [x] Deshacer paso a paso (⌘Z y botón), pila de 30, vaciada al cargar y al guardar
- [x] Reordenar bloques con las flechas del panel, cruzando de columna en los extremos
- [x] Confirmar aplicar y borrar plantilla con el Dialog de la app, no `window.confirm`
- [x] Vista previa de la plantilla con el canvas de verdad y los datos de este retiro
- [x] Prop `printable` en el canvas: solo el volante de la página es `#printable-area`
- [x] Panel de Diseño en dos secciones plegables: "Todo el volante" y "Bloques"
- [x] Alineación por bloque (izquierda / centro / derecha), con su cascada y su control
- [x] La vista publicada del volante recibe el diseño guardado (bug de M1)

**Done**: el editor perdona los errores (deshacer, aviso al salir), avisa de los que no se ven
hasta imprimir (contraste), y aplicar una plantilla ya no es a ciegas.

## Desviaciones respecto al plan

### M6

- **M6 no estaba en el plan**: sale de usar el editor terminado. Se registra aquí para que las
  desviaciones de abajo tengan dónde vivir.
- **Dejé fuera dos de las mejoras que Leonardo había elegido** —confirmaciones con Dialog y vista
  previa de plantilla— razonando que con deshacer ya no urgían. Él las había marcado
  explícitamente y no había ningún impedimento técnico: era mi criterio sustituyendo al suyo.
  Me lo preguntó ("¿por qué las dejaste fuera?") y las hice en la misma sesión. Lo anoto porque
  el error no fue técnico: recortar el alcance que el usuario ya decidió no es una decisión mía.
- **Las comas solo separan cuando no hay saltos ni viñetas.** Partir siempre por comas rompía a
  los retiros que ya escriben un ítem por línea: entradas como "Chamarra, sudadera" se habrían
  convertido en dos cosas distintas. El bug original —una lista por comas saliendo como una sola
  línea truncada— es el que empezó todo esto y seguía vivo tras M5.
- **El aviso de contraste compara contra un gris medio cuando el bloque no tiene caja.** No
  podemos muestrear la foto justo bajo el bloque, pero el gris basta para cazar los dos errores
  reales: blanco sobre blanco y negro sobre negro.
- **La vista previa obligó a que `#printable-area` fuese opcional.** Imprimir, copiar imagen y
  exportar PDF buscan ese id; con el diálogo abierto había dos en la página. Al quitárselo a la
  vista previa se quedó sin las fuentes del volante, así que los estilos del canvas pasaron a
  colgar de `.print-optimized` (su clase raíz) en vez del id; las reglas de `@media print` sí
  siguen ancladas al id, que es justo lo que se quiere.
- **La vista publicada del volante nunca mostró el diseño guardado.** Desde M1,
  `RetreatFlyerView` le pasaba al canvas solo `flyer_options`: ni `layout`, ni `imageOverrides`,
  ni `theme`, ni `blockStyles`. Como el canvas cae a sus valores de fábrica en cada prop que no
  recibe, el resultado no parecía un fallo —parecía un retiro sin personalizar—, y la pantalla que
  se imprime, se copia y se exporta enseñaba el volante de siempre. Salió al comprobar la
  alineación en el navegador, no en los tests: los de la vista pública montaban el volante de
  fábrica y por eso pasaban. Ahora hay tres tests que fallan sin el arreglo (comprobado
  revirtiéndolo). Es el fallo más caro de toda la feature: cuatro milestones de editor que no
  llegaban a la hoja impresa.
- **La alineación no se resuelve con `text-align` a secas.** Los chips de icono, las viñetas y
  las cajas acotadas se colocan con flex y márgenes automáticos: se quedaban a la izquierda
  mientras el texto se movía. Cada bloque marca ahora sus filas (`.fb-lead`, `.fb-row`, `.fb-box`)
  y el estilo resuelve cuatro variables en vez de una. Dos trampas: invertir la fila invierte
  también el eje —`flex-end` pasa a ser el borde izquierdo—, y al apilar solo el hijo que se
  llevaba el ancho sobrante puede ir a `width: 100%`, o el chip del icono se estira entero.
- **Los valores de fábrica de alineación son los del volante original**, que hasta ahora vivían
  como clases clavadas: contacto colgaba de la derecha con `ml-auto`, `justify-end` y `text-right`.
  Convertirlas en datos es lo que permite moverlas; el volante se ve exactamente igual que antes
  mientras nadie las toque.
- **Las secciones plegables se hicieron a mano.** `@repo/ui` no exporta Accordion ni Collapsible
  —ya lo anotaba el plan de M5—, así que `FlyerPanelSection` es un `<button aria-expanded>` con su
  `<div>`. El cuerpo va con `v-show` y no `v-if`: plegar no puede tirar lo que se esté escribiendo.
  Las dos secciones son independientes, no un acordeón de una a la vez; cerrarle una sección al
  usuario porque abrió la otra sorprende más de lo que ahorra.
- **La cabecera plegada tiene que seguir avisando.** El conteo de ocultos y el triángulo de
  contraste suben al resumen de la sección: si no, plegar "Bloques" escondía justo la señal que
  explica por qué al volante le falta algo.
- **Un `data-toggle-visibility` propio para el ojo.** Con tres botones con `aria-label` por fila,
  `li[data-block] button[aria-label]` cogía el de "subir": los tests creían ocultar un bloque
  mientras lo movían.

### M5

- **Los defaults son los colores del volante original, bloque por bloque** (azul en horarios y
  costo, verde en el lugar, texto claro abajo, chips con sus gradientes). Probé antes una paleta
  uniforme de cartel —blanco y dorado para los ocho— porque con bloques móviles ningún color por
  bloque es correcto en todas las posiciones; Leonardo la vio y prefirió los colores de siempre.
  Es su volante: los colores originales le dan identidad, y para el caso de mover un bloque a una
  zona que no le va están el tema, los overrides y el velo.
- **El bloque de costo es el único con caja por defecto** (velo blanco al 65%), como en el
  original: su letra pequeña cae sobre la parte más luminosa del arte y sin nada detrás no se lee.
- **El velo (`scrim`) viene apagado**, también como el original.
- **`background` no es un enum**: "ninguno / velo claro / velo oscuro" son atajos de la UI que
  escriben en `backgroundColor`. Menos ramas en el resolvedor y misma experiencia.
- **No hay variable de "acento" aparte del heading**: en los bloques reales la segunda mancha de
  color o coincide con el título o es una de las cuatro excepciones fijas.
- **`FlyerBlockList.vue` desaparece**: su lista de visibilidad vive ahora en `FlyerDesignPanel`, y
  el arrastre se mudó al volante. La pestaña "Bloques" se fusionó en "Diseño".
- **`FlyerSlotColumn.vue`** es nuevo (no estaba en el plan): las tres celdas repetían el mismo
  markup y ahora además llevan estilo, arrastre y selección.
- La columna emite `dropAt(slot, index)` y el canvas traduce a `moveBlock` con el id que arrastra:
  el estado del arrastre vive en un solo sitio.

### M4

- **El bloque de schemas de plantilla tuvo que ir después de `flyerOptionsSchema`.** `const` no se
  hoistea, así que declararlo antes dejaba `layout` en `undefined` y `.partial()` reventaba al
  importar el módulo — un fallo que aparece en cualquier test del API, no solo en los nuevos.
- **`authorizationService` vive en `middleware/authorization`**, no en `services/`.
- **La entidad se registró también en `apps/api/src/tests/test-setup.ts`**: su lista de entidades
  es un subconjunto de la de producción y sin esto `getRepository(FlyerTemplate)` falla con
  "No metadata for FlyerTemplate".
- **El panel captura el fallo de carga.** Se monta junto al editor, así que un `GET` fallido
  dejaba una promesa rechazada sin manejar (siete en la suite). Ahora muestra el motivo y el
  panel sigue sirviendo para guardar.
- **Otro mock global arreglado**: el stub de `Button` no propagaba `disabled`, así que un test
  podía "hacer clic" en un botón que el usuario no puede pulsar — se coló guardar una plantilla
  sin nombre. Ahora el stub lo enlaza, y el componente además valida antes de enviar.
- **`update` permite renombrar y sobrescribir el diseño**, pero no re-escopar: cambiar
  `scope`/`communityId` cambiaría quién ve la plantilla, así que son inmutables tras crearla.
- Verificado en el navegador: guardar el diseño de Buen Despacho y aplicarlo a San Agustín copia
  bloques e imágenes y **respeta los datos del retiro destino** (parroquia, fechas, QR).

### M3

- **Las tarjetas de los bloques pasan a tener fondo propio** (blanco translúcido con
  `backdrop-blur`, texto oscuro). No estaba en el plan y resultó obligatorio: con el layout
  absoluto cada tarjeta se apoyaba en una zona conocida del fondo, así que el texto blanco de
  "Fin del retiro" y "Qué llevar" funcionaba. En cuanto los bloques se mueven —y más con un fondo
  que sube el usuario— aparece texto blanco sobre fondo claro, ilegible. Verificado en el
  navegador antes y después. Es un cambio de aspecto visible respecto al volante original.
- **La subida vive en un servicio propio** (`flyerAssetService.storeFlyerAsset`) en vez de en el
  controller: así el fallback sin S3 y la elección de prefijo quedan testeables sin HTTP.
- **`POST /flyer-assets` no está scopeado a un retiro.** Devuelve una URL pública reutilizable, así
  que atarla a un `:retreatId` no aportaba nada; la autorización es `retreat:update`.
- **La escala de la vista previa se mide sobre la columna, no sobre el contenedor del lienzo.** Un
  elemento con `transform: scale()` conserva su caja de 850px, así que el ancho del contenedor
  nunca cambia y el `ResizeObserver` no volvía a dispararse: la vista previa se quedaba con la
  escala de la primera medición (0.79 dentro de un hueco de 850px).
- **El límite inline sin S3 es 512KB.** En dev la imagen acaba dentro de `flyer_options`; el guard
  evita que la fila de un retiro cargue con megas de base64.
- La trampa de `vi.mock` con variables top-level (hoisting) reapareció en el test del selector; se
  resuelve con `vi.hoisted`.

### M2

- **La visibilidad se alterna con un botón de ojo, no con un `Switch`.** En una lista de bloques
  arrastrables el interruptor competía visualmente con el asa de arrastre; el ojo ocupa menos y se
  lee mejor. (El plan pedía `Switch` de `@repo/ui`; queda como nota por si se revisa el criterio.)
- **El editor no tiene pestaña de imágenes todavía**: la pestaña existe con su texto de ayuda, pero
  el selector llega en M3. Las props `imageOverrides` ya viajan del store al canvas.
- **`moveBlockInLayout` vive en `flyerLayout.ts`, no en el store.** Es lógica pura de reordenado y
  así se prueba sin Pinia; el store solo la invoca. Tenía un fallo que el test cazó: al mezclar los
  bloques movidos con el resto, `normalizeOrder` los reordenaba por su `order` viejo y deshacía el
  movimiento. Ahora se sella la posición nueva antes de normalizar.
- **El store conserva lo que no edita** (`untouchedOptions`): como el PUT reemplaza la columna
  entera, guardar el volante habría borrado `showPickupInfo` y los flags legacy. Hay test.
- **Dos mocks globales estaban rotos y los arreglé** en `apps/web/src/test/setup.ts`:
  - `Button` declaraba `onClick` entre sus props, lo que convierte `@click` en prop y hace que el
    stub se coma **todos** los clics. Ningún test del repo podía verificar el clic de un `Button`.
  - Faltaban `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Textarea` y `Switch` en el mock de
    `@repo/ui`. Los stubs de pestañas renderizan todos los paneles a la vez a propósito, para que
    los tests alcancen el contenido de las pestañas inactivas.
- **Verificado en navegador** (worktree, puertos 3002/5174): ocultar y arrastrar se reflejan en la
  vista previa al instante, el guardado persiste `layoutVersion: 2` con los bloques, y editar el
  retiro desde la pestaña Notas del modal **no** borra el diseño — el riesgo 1 del plan, cerrado.

### M1

- **El schema v2 se añadió ya en M1**, no en M2. Los tipos `FlyerBlockId`/`FlyerSlot`/
  `FlyerBlockLayout`/`FlyerImages` viven en `packages/types` desde el principio para que el canvas
  y el registry los consuman sin duplicar definiciones. Es aditivo: ningún campo v1 cambió.
- **Impresión y PDF pasan a escalar para caber en una página.** No estaba en el plan y resultó
  obligatorio: en flujo normal el cuerpo mide 1236px contra los 1202px de A4, así que el troceado
  vertical del PDF habría partido el volante en dos páginas cortando una tarjeta por la mitad. Ahora
  la vista calcula `--flyer-print-scale` desde la altura real (truncando, con 1% de holgura) y el
  PDF encaja la imagen por la dimensión que limite. Esto cierra el riesgo 3 del plan y es lo que
  hace viable el editor: al ocultar o mover bloques la altura cambia en cada configuración.
- **`RetreatFlyerCanvas` ya acepta `layout` e `imageOverrides` como props opcionales**, con caída a
  `FLYER_DEFAULT_LAYOUT` y a los presets. M2 y M3 solo tienen que pasarlos; el canvas no cambia.
- **El canvas honra `showQrCodesRegistration`/`showQrCodes` de v1** al derivar el layout por
  defecto. Sin esto habría sido una regresión silenciosa: el test que debía cubrirlo era vacuo
  (`stubs: { QrcodeVue }` reemplaza al componente, así que `findAllComponents({ name })` siempre
  devolvía 0). El test ahora cuenta `<canvas>` y se añadió el caso de ocultar solo el QR de registro.
- **Se compactaron los rellenos** (bloques `p-5`→`p-4`, contacto y qué llevar `p-3`→`p-2.5`, cuerpo
  `p-5`→`p-4`) y se acotó el ancho de contacto (320px) y costo (360px), que al pasar a columna se
  estiraban a media página.
- **Dos mejoras de contenido** que el layout absoluto impedía: los ítems de "qué llevar" ya no
  llevan `truncate` (se ajustan en varias líneas en vez de cortarse con "…"), y el bloque de
  contacto no se dibuja si el retiro no tiene teléfonos ni correos.
- **Cinco íconos añadidos al mock global** de `lucide-vue-next` en `apps/web/src/test/setup.ts`
  (`MapPin`, `Phone`, `Info`, `Backpack`, `EllipsisVertical`): la allowlist es fija y sin ellos el
  `mount()` de cualquier test del canvas revienta.
