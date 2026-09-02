# Tasks: Editor de volante de retiros

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `specs/flyer-editor/spec.md`
- [x] `specs/flyer-editor/research.md`
- [x] `specs/flyer-editor/plan.md`
- [x] `specs/flyer-editor/tasks.md`

## M1 — Refactor a bloques, layout fijo (sin UI nueva)

- [ ] `apps/web/src/composables/useFlyerContent.ts` — extraer los computeds de texto/datos
- [ ] `apps/web/src/components/flyer/blockRegistry.ts` — `FLYER_BLOCK_COMPONENTS` + `FLYER_DEFAULT_LAYOUT`
- [ ] Ocho bloques en `apps/web/src/components/flyer/blocks/`
- [ ] Chrome: `FlyerHeader.vue`, `FlyerBanner.vue`, `FlyerFooter.vue`
- [ ] `apps/web/src/components/flyer/RetreatFlyerCanvas.vue` (grid `left`/`right`/`wide`)
- [ ] `RetreatFlyerView.vue` reducido a shell + acciones; borrar `calculateContentHeight`
- [ ] `RetreatFlyerView.test.ts` verde (ajustar aserciones ligadas a posiciones absolutas)
- [ ] Revisión visual con un retiro real por `retreat_type` (valida los cuatro logotipos)
- [ ] Verificar imprimir / copiar imagen / PDF

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

_(anotar aquí lo que cambie durante la implementación)_
