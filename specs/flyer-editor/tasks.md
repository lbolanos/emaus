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
- [ ] **Verificar CORS del bucket** con copiar imagen y exportar PDF usando una imagen subida
      — pendiente de verdad: en dev no hay S3, la imagen subida queda como data URI y no
      ejercita el caso cross-origin. Hay que probarlo contra el bucket real.

**Done**: las cuatro imágenes se cambian desde el editor y salen en volante, PDF e imagen copiada.

## M4 — Plantillas

- [x] `apps/api/src/entities/flyerTemplate.entity.ts` + registro en `database/config.ts`
- [x] Migración `CreateFlyerTemplates` (tabla + dos índices, `transaction = false`)
- [x] Schemas `flyerTemplateSchema` / `create` / `update`
- [x] `flyerTemplateService.ts` + controller + routes + montaje
- [x] `flyerTemplateStore.ts` + `FlyerTemplatePanel.vue`
- [x] Tests de autorización: personal, comunidad (admin activo), superadmin, tercero → 403

**Done**: guardar, listar, aplicar y eliminar plantillas con el alcance correcto.

## Desviaciones respecto al plan

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
