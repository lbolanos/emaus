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

- [ ] Schema v2 en `packages/types/src/index.ts` (`layoutVersion`, `blocks`, `images`)
- [ ] `apps/web/src/utils/flyerLayout.ts` — `resolveFlyerLayout` + tests
- [ ] `apps/web/src/stores/flyerEditorStore.ts`
- [ ] Ruta `retreats/:id/flyer/edit` + `RetreatFlyerEditView.vue`
- [ ] `FlyerBlockList.vue` con arrastre HTML5 entre tres celdas + `Switch` de visibilidad
- [ ] Pestaña Textos (migrar los inputs `*Override`)
- [ ] `RetreatModal.vue`: quitar la pestaña Volante y el editor JSON; **fix del clobber** (spread)
- [ ] i18n `retreatFlyerEditor.*` en es/en
- [ ] Íconos nuevos al `vi.mock('lucide-vue-next')` de `apps/web/src/test/setup.ts`
- [ ] Tests: store, vista del editor, caso v1 legacy en el canvas
- [ ] Prueba manual: guardar desde otra pestaña del modal no borra el diseño

**Done**: reordenar/ocultar persiste; los retiros v1 se ven igual.

## M3 — Imágenes

- [ ] `imageService.processFlyerAsset` (fit `inside`, 1600px fondos / 512px logo, WebP q85)
- [ ] `uploadFlyerAssetSchema` en `packages/types`
- [ ] `POST /flyer-assets` (controller + route + montaje) con fallback data-URI sin S3
- [ ] `uploadFlyerAsset()` en `apps/web/src/services/api.ts`
- [ ] `flyerPresetAssets.ts` + `FlyerImagePicker.vue` (galería + subida)
- [ ] Chrome y canvas leyendo `images.*` con fallback a presets
- [ ] **Verificar CORS del bucket** con copiar imagen y exportar PDF usando una imagen subida

**Done**: las cuatro imágenes se cambian desde el editor y salen en volante, PDF e imagen copiada.

## M4 — Plantillas

- [ ] `apps/api/src/entities/flyerTemplate.entity.ts` + registro en `database/config.ts`
- [ ] Migración `CreateFlyerTemplates` (tabla + dos índices, `transaction = false`)
- [ ] Schemas `flyerTemplateSchema` / `create` / `update`
- [ ] `flyerTemplateService.ts` + controller + routes + montaje
- [ ] `flyerTemplateStore.ts` + `FlyerTemplatePanel.vue`
- [ ] Tests de autorización: personal, comunidad (admin activo), superadmin, tercero → 403

**Done**: guardar, listar, aplicar y eliminar plantillas con el alcance correcto.

## Desviaciones respecto al plan

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
