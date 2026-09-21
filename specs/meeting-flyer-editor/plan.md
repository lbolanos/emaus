# Plan: Editor del flyer de reunión

Diseño técnico. Las decisiones de producto viven en `spec.md`; el estado del código en
`research.md`.

## Diseño del flyer "Personalizado"

**Canvas de 850px como el retiro** — reutiliza el maquinario completo: escala móvil con
`ResizeObserver` (ref en la caja contenedora **sin padding** + `overflow-x-hidden` + altura
reservada `canvasHeight * scale`), prop `printable` para el id `#printable-area` (el preview del
editor no lo reclama), print shrink-to-fit con `--flyer-print-scale` (truncado, 1% holgura), y el
copiar-imagen `domToBlob` existente en la vista.

**Chrome fijo** (paralelo a `FlyerHeader/Banner/Footer` del retiro):

- `MeetingFlyerHeader.vue` — fondo `headerBackground` + logo (`images.logo` o `/man_logo.png`);
  "EMAÚS" solo si la comunidad no empieza con Emaús (`/^ema[úu]s\b/i`); `communityName`
  (`titleCaseForDisplay`); kicker "Reunión de Comunidad" + `meeting.title` con los 3 escalones de
  tamaño de `DefaultFlyer` (L128-133). **El título vive en el chrome**, como el banner del retiro:
  overridable/ocultable por texto, no arrastrable — un flyer sin título prominente se lee roto.
- `MeetingFlyerFooter.vue` — fondo `footerBackground` + "¡Te esperamos!" (`footerTextOverride`).

**5 bloques** (componentes "tontos", una prop `content`, colores en `var(--fb-text)` /
`var(--fb-heading)`, marcas `.fb-lead`/`.fb-row`):

| id | default | contenido |
|---|---|---|
| `dateTime` | left 0 | `formatMeetingDateOnly` + `formatMeetingTimeOnly` + "hrs." + `formatDuration` si `!isAnnouncement` |
| `description` | left 1 | `replaceFlyerVariables(meeting.flyerTemplate)`, `whitespace-pre-line` |
| `location` | right 0 | `communityName` + `formatCommunityAddress` |
| `locationQr` | right 1 | QR a `community.googleMapsUrl` (QrcodeVue canvas) + caption; **plato blanco fijo que ignora el tema** (scannability, como los QR del retiro) |
| `community` | wide 0 | branding "Comunidad {nombre}" + línea "EMAÚS" (regex) — reubicable/ocultable |

**Defaults de estilo** (`MEETING_FLYER_BLOCK_STYLE_DEFAULTS`): cajas blancas translúcidas
(`backgroundColor '#ffffff'`, `backgroundOpacity 85`, texto oscuro) salvo `locationQr` sin caja —
replican las tarjetas del `DefaultFlyer` actual, de modo que el default visible coincide con lo
que el panel Diseño muestra (lección documentada del retiro: si el panel dice "Fondo: Ninguno"
mientras el volante enseña una caja, el editor se lee como roto).

**Textos (8 overrides + `hiddenTexts`)**: `kickerOverride`, `titleOverride`,
`dateLabelOverride`, `durationLabelOverride`, `descriptionLabelOverride`,
`locationLabelOverride`, `qrCaptionOverride`, `footerTextOverride`. Override vacío = default
(placeholder dinámico: el de `titleOverride` es `meeting.title`).

**Imágenes**: mismas 4 keys que el retiro (`FlyerImages`). `MEETING_FLYER_PRESET_IMAGES =
{ bodyBackground: '/poster.png', headerBackground: '/header_bck.png', footerBackground:
'/footer.png', logo: '/man_logo.png' }`; galería de `bodyBackground` = `FLYER_BACKGROUND_PRESETS`.

**Semilla del fondo**: al abrir el editor sin diseño guardado, `images.bodyBackground =
community.flyerBackgroundUrl || '/poster.png'` — el diseño parte de la identidad actual, sin
migración ni datos derivados.

## Estrategia: generalización quirúrgica por capas

Gate: la suite del retiro queda verde **sin editar un solo test**. Todos los parámetros nuevos
llevan defaults que preservan el comportamiento actual.

| Pieza | Acoplamiento (verificado) | Cambio |
|---|---|---|
| `apps/web/src/utils/flyerStyle.ts` | Solo `FLYER_BLOCK_STYLE_DEFAULTS` en `resolveBlockStyle` (L73-106) y `checkBlockContrast` (L159-181) | 4º parámetro `defaults = FLYER_BLOCK_STYLE_DEFAULTS`; `blockId` ampliado a `string` |
| `apps/web/src/utils/flyerLayout.ts` | `FLYER_DEFAULT_LAYOUT` (deriva `KNOWN_BLOCK_IDS`) + rama v1 legacy | Extraer núcleo genérico `reconcileStoredBlocks<T>(stored, defaultLayout)`; `moveBlockInLayout` genérico sobre `{id, slot, order}`. `resolveFlyerLayout` mantiene firma (delega + rama v1). Nuevo `resolveMeetingFlyerLayout` **sin rama v1** (columna nueva, sin legacy) |
| `apps/web/src/stores/flyerEditorStore.ts` | `useRetreatStore` (load/save) + `FLYER_TEXT_OVERRIDE_KEYS`; ~90% genérico | **Factory** `createFlyerEditorStore(config)`; `useFlyerEditorStore = createFlyerEditorStore(configRetreat)` con la MISMA superficie. El test existente mock-ea `@/stores/retreatStore` a nivel de módulo y sigue funcionando (verificado). Nuevo `meetingFlyerEditorStore.ts` |
| `apps/web/src/components/flyer/FlyerSlotColumn.vue` | Una línea: `FLYER_BLOCK_COMPONENTS[block.id]` | Prop `components` con `withDefaults` a `FLYER_BLOCK_COMPONENTS` |
| `apps/web/src/components/flyer/editor/FlyerDesignPanel.vue` | Prefijo i18n `retreatFlyerEditor` en ~15 `t()` + `checkBlockContrast` | Props `tPrefix = 'retreatFlyerEditor'` y `styleDefaults = FLYER_BLOCK_STYLE_DEFAULTS` |
| `apps/web/src/components/flyer/editor/FlyerTextPanel.vue` | `FLYER_TEXT_OVERRIDE_KEYS` + `MULTILINE_KEYS` + `DEFAULT_KEYS` | Prop `config` con default retreat + `placeholderOverrides` (titleOverride dinámico) |
| `apps/web/src/components/flyer/editor/FlyerImagePicker.vue` | `FLYER_PRESET_ASSETS[imageKey]` + prefijo i18n | Props `presets` (default retreat) y `tPrefix` |
| `FlyerStyleFields.vue` / `FlyerPanelSection.vue` | Ninguno | Reutilizar sin tocar |
| `apps/web/src/components/flyer/RetreatFlyerCanvas.vue` | Profundo (chrome, contenido, QR legacy) | **NO generalizar**. Nuevo `MeetingFlyerCanvas.vue` reutilizando `FlyerSlotColumn` y `resolveScrim`; duplica el bloque `.print-optimized` (reglas idempotentes por clase — mismo patrón que Default/Poster/WhatsApp) |
| `apps/web/src/composables/useFlyerContent.ts` | 100% retreat | Nuevo `useMeetingFlyerContent.ts` |
| `FlyerTemplatePanel.vue` | Plantillas | No tocar, no replicar |

**Por qué no duplicar todo**: el costo de duplicar son las lecciones ya pagadas (undo con
`restoring`, snapshot de isDirty, reconciliación, ojo-que-oculta-sin-borrar) — cada fix futuro se
aplicaría dos veces. **Por qué no generalizar el canvas**: chrome y contenido son por definición
distintos; parametrizarlos arriesga la superficie DOM de 30+ tests del retiro.

## packages/types — extracción necesaria

`index.ts` hace `export * from './community'` (L1009) → `community.ts` no puede importar de
`'./index'` (ciclo). Pero `communitySchema` ganará `flyerOptions` y necesita los schemas base que
hoy viven en index.ts (L79-185).

Solución: extraer a **`packages/types/src/flyer.ts`** (nuevo): `flyerSlotSchema`,
`flyerImagesSchema`, `flyerBlockStyleSchema`, `flyerThemeSchema`, `flyerBlockLayoutSchema`
(genérico en el id) y `FLYER_LAYOUT_VERSION`. `index.ts` importa de `'./flyer'` y añade
`export * from './flyer'` — los consumidores de `@repo/types` no cambian. `flyerOptionsSchema`
del retiro se queda en index.ts importando de `'./flyer'`; `community.ts` importa de `'./flyer'`
para armar los schemas de reunión.

Schemas de reunión (en `community.ts`, junto a `FLYER_BACKGROUND_PRESETS` L321):

- `meetingFlyerBlockIdSchema` = enum(dateTime, description, location, locationQr, community)
- `meetingFlyerBlockLayoutSchema` — id/slot/order/visible
- `meetingFlyerTextKeySchema` — enum de las 8 keys de override
- `meetingFlyerOptionsSchema` — `layoutVersion ≤ FLYER_LAYOUT_VERSION`, `blocks` máx 16,
  `images: flyerImagesSchema`, `theme: flyerThemeSchema`,
  `blockStyles: z.record(meetingFlyerBlockIdSchema, flyerBlockStyleSchema)`, `hiddenTexts`
  máx 20, 8 overrides máx 2000
- `communitySchema` += `flyerOptions: meetingFlyerOptionsSchema.optional().nullable()`
- `setCommunityFlyerOptionsSchema` (params uuid + body `flyerOptions`) — patrón
  `setCommunityFlyerCardOpacitySchema` (L365-372); el DELETE valida params como flyer-background
- NOTA en el schema: Zod descarta keys no declaradas en silencio

Tras editar `packages/types` → `touch apps/api/src/index.ts` (nodemon no mira `packages/*`).

## API

- Migración `apps/api/src/migrations/sqlite/20260921200000_AddCommunityFlyerOptions.ts` —
  `ALTER TABLE "community" ADD COLUMN "flyer_options" text` con guarda idempotente
  `PRAGMA table_info("community")` (patrón de las dos anteriores); `down` con DROP COLUMN.
  ADD COLUMN puro: sin recreate, sin `transaction = false`.
- `community.entity.ts` — `@Column({ type: 'simple-json', nullable: true }) flyerOptions`.
- Rutas `PUT` + `DELETE '/:id/flyer-options'` con `requireCommunityAccess()` +
  `validateRequest(...)` + `.catch(next)` (patrón flyer-card-opacity).
- `communityService.setFlyerOptions` / `clearFlyerOptions`; `communityController` handlers.
- Web: `api.ts` `setCommunityFlyerOptions`/`deleteCommunityFlyerOptions`; `communityStore`
  actions que actualizan `currentCommunity` si coincide.

## Rutas y vistas

- Router (tras `community-meeting-flyer` L567): `communities/:id/meetings/:meetingId/flyer/edit`,
  name `community-meeting-flyer-edit`, `meta: { requiresRetreat: false }` (el de las hermanas).
- `CommunityMeetingFlyerEditView.vue` — copia estructural de `RetreatFlyerEditView.vue` con
  **3 tabs (sin Plantillas)**; toolbar Deshacer (⌘Z)/Descartar/Guardar/**Restaurar diseño**
  (DELETE con confirmación); guards `onBeforeRouteLeave` + `beforeunload`. Carga community + la
  reunión de `route.params.meetingId` (el preview necesita SUS datos; el diseño es de comunidad).
- `CommunityMeetingFlyerView.vue` — 4º botón "Personalizado" (icono `Palette`); caso `'custom'`
  renderiza `MeetingFlyerCanvas` con TODAS las props:
  `savedMeetingLayout = resolveMeetingFlyerLayout(community?.flyerOptions ?? null)` →
  `:layout="savedMeetingLayout.blocks" :image-overrides="savedMeetingLayout.images"
  :theme="community?.flyerOptions?.theme" :block-styles="community?.flyerOptions?.blockStyles"`.
  **Lección "Saved design"**: una prop olvidada no se ve como fallo sino como "sin personalizar".
- `flyerStorage.ts` — `VALID_STYLES` += `'custom'`.
- Popover "Fondo": `v-if` excluye también `'custom'` (custom gestiona el fondo en el editor).
- Botón "Editar diseño" siempre visible (junto a Editar reunión).
- Print custom: `--flyer-print-scale` desde la altura real (patrón `RetreatFlyerView` L145-162) +
  regla `@media print { #printable-area[data-custom-canvas] { width: 850px; transform:
  scale(var(--flyer-print-scale)); … } }` que gana a la regla 210mm genérica por especificidad.
  Los otros 3 estilos no cambian.
- Escala móvil del canvas custom con ResizeObserver, solo cuando custom.

## Riesgos

1. **Regresión del retiro** por las generalizaciones → defaults preservan comportamiento; gate:
   suite del retiro verde sin editar tests.
2. **Print CSS coexistente** (210mm genérica vs 850px+scale del custom) → regla específica por
   atributo; verificar impresión real de los 4 estilos.
3. **Prop olvidada en la vista publicada** (ya mordió en el retiro, M1→M6) → test "Saved design"
   obligatorio antes de cerrar M3.
4. **El e2e escribe en `community.flyer_options` de una comunidad real** → afterAll con DELETE
   incondicional.
5. **packages/types** → touch `apps/api/src/index.ts` tras editar.
6. **Ícono nuevo sin allowlist** → `apps/web/src/test/setup.ts` (mock fijo de lucide).
7. Zod descarta keys no declaradas → todo campo futuro de flyerOptions se declara en el schema.
8. Textos default sin palancas/cartas, dinámicas internas, becas ni montos (contenido público).
