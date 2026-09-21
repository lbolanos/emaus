# Tasks: Editor del flyer de reunión

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Specs

- [x] `specs/meeting-flyer-editor/spec.md`
- [x] `specs/meeting-flyer-editor/research.md`
- [x] `specs/meeting-flyer-editor/plan.md`
- [x] `specs/meeting-flyer-editor/tasks.md`

## M1 — Fundación: schema + entidad + migración + API

- [ ] `packages/types/src/flyer.ts` — extraer schemas flyer compartidos de `index.ts`
      (`flyerSlotSchema`, `flyerImagesSchema`, `flyerBlockStyleSchema`, `flyerThemeSchema`,
      `flyerBlockLayoutSchema`, `FLYER_LAYOUT_VERSION`); `index.ts` importa y re-exporta `[P]`
- [ ] `packages/types/src/community.ts` — `meetingFlyerBlockIdSchema`,
      `meetingFlyerBlockLayoutSchema`, `meetingFlyerTextKeySchema`, `meetingFlyerOptionsSchema`,
      `communitySchema` += `flyerOptions`, `setCommunityFlyerOptionsSchema`
- [ ] `touch apps/api/src/index.ts` tras editar packages/types
- [ ] Migración `20260921200000_AddCommunityFlyerOptions.ts` (ADD COLUMN con guarda
      `PRAGMA table_info`, `down` DROP COLUMN)
- [ ] `community.entity.ts` — `flyerOptions` simple-json nullable
- [ ] Rutas `PUT`/`DELETE /:id/flyer-options` + controller + service (patrón flyer-card-opacity)
- [ ] `api.ts` + `communityStore` — `setCommunityFlyerOptions`/`deleteCommunityFlyerOptions`
- [ ] Test API `communityFlyerOptionsSchema.simple.test.ts`
- [ ] Verificar: `pnpm --filter api build`; migración aplicada **por el dato** (copia DB a /tmp +
      `PRAGMA table_info` + PUT roundtrip); jest; PUT sin sesión → 401, admin ajeno → 403

**Done**: el diseño de una comunidad se guarda y se lee por API, sin tocar nada del retiro.

## M2 — Motor del editor

- [ ] Generalizaciones con defaults (gate: suite retiro verde sin editar tests):
  - [ ] `flyerStyle.ts` — parámetro `defaults` en `resolveBlockStyle`/`checkBlockContrast` `[P]`
  - [ ] `flyerLayout.ts` — `reconcileStoredBlocks<T>` + `moveBlockInLayout` genérico `[P]`
  - [ ] `flyerEditorStore.ts` → factory `createFlyerEditorStore(config)`
  - [ ] `FlyerSlotColumn.vue` — prop `components` `[P]`
  - [ ] `FlyerDesignPanel.vue` — props `tPrefix`/`styleDefaults` `[P]`
  - [ ] `FlyerTextPanel.vue` — prop `config` + `placeholderOverrides` `[P]`
  - [ ] `FlyerImagePicker.vue` — props `presets`/`tPrefix` `[P]`
- [ ] `meetingBlockRegistry.ts` (COMPONENTS, DEFAULT_LAYOUT, STYLE_DEFAULTS, PRESET_IMAGES)
- [ ] 5 bloques en `apps/web/src/components/flyers/blocks/MeetingFlyerBlock*.vue` `[P]`
- [ ] `MeetingFlyerHeader.vue` + `MeetingFlyerFooter.vue` + `MeetingFlyerCanvas.vue` `[P]`
- [ ] `useMeetingFlyerContent.ts` (formatters de `meetingFlyer.ts`, timezone de comunidad)
- [ ] `meetingFlyerLayout.ts` — `resolveMeetingFlyerLayout` (sin rama v1)
- [ ] `meetingFlyerEditorStore.ts` (factory config comunidad + semilla bodyBackground)
- [ ] `CommunityMeetingFlyerEditView.vue` — 3 tabs, Deshacer/Descartar/Guardar/Restaurar,
      guards de salida
- [ ] Ruta `community-meeting-flyer-edit` en el router
- [ ] i18n `meetingFlyerEditor.*` + `meetingFlyer.*` en es **Y** en
- [ ] `apps/web/src/test/setup.ts` — allowlist lucide += íconos nuevos (`Palette`…)
- [ ] Verificar: suite del retiro verde sin editar un test; suite web completa; flujo manual en
      dev (mover, tema, guardar, recargar)

**Done**: el editor funciona completo en su ruta, guardando en `community.flyerOptions`.

## M3 — Vista publicada: 4º estilo "Personalizado"

- [ ] `flyerStorage.ts` — `VALID_STYLES` += `'custom'`
- [ ] Selector: 4º botón "Personalizado" (icono `Palette`)
- [ ] Caso `'custom'` renderiza `MeetingFlyerCanvas` con TODAS las props (layout + imágenes +
      theme + blockStyles resueltos) — lección "Saved design"
- [ ] Popover "Fondo" excluye `'custom'`; botón "Editar diseño" siempre visible
- [ ] Print custom: `--flyer-print-scale` + regla `#printable-area[data-custom-canvas]` que gana
      a la 210mm genérica
- [ ] Escala móvil del canvas custom (ResizeObserver, patrón retreat)
- [ ] Verificar: impresión de los 4 estilos en una página; copiar imagen con QR; Poster/WhatsApp
      siguen respetando `flyerBackgroundUrl`/`flyerCardOpacity`; test "Saved design" antes de
      cerrar

**Done**: el coordinador elige "Personalizado", ve el diseño de su comunidad y puede entrar al
editor desde ahí; los otros 3 estilos no cambian.

## M4 — Tests + docs + ayuda in-app

- [ ] Unit: `meetingFlyerEditorStore.test.ts` (semilla, dirty, undo, save)
- [ ] Unit: `meetingFlyerLayout.test.ts` (ids inventados, faltantes, mover)
- [ ] Unit: `MeetingFlyerCanvas.test.ts` (slots, draggable, css vars, printable; mock qrcode.vue)
- [ ] Unit: `CommunityMeetingFlyerEditView.test.ts` (tabs, flechas, guardar, salir)
- [ ] Unit: `CommunityMeetingFlyerView.test.ts` — **"Saved design"** + legacy intactos
- [ ] Unit: casos con config de reunión en `FlyerDesignPanel`/`FlyerTextPanel` tests
- [ ] E2E `community-meeting-flyer-editor.spec.ts` (locale es-MX, reunión desechable,
      afterAll restaura `flyer-options` SIEMPRE)
- [ ] Ayuda in-app `apps/web/src/docs/{es,en}/meeting-flyer-editor.md` + `helpIndex.ts`
- [ ] Doc maestra `docs/features/community-meeting-flyer-editor.md` con tabla de cobertura;
      actualizar la referencia en `retreat-flyer-editor.md`
- [ ] Verificar: playwright chromium verde + comunidad restaurada (GET → flyerOptions null);
      helpIndex test verde

**Done**: feature cubierta y documentada; nada rojo.

## Desviaciones respecto al plan

(ninguna todavía)
