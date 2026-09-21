# Research: Editor del flyer de reunión

Estado actual (2026-09-21) y gaps. Todo verificado leyendo el código, no por deducción.

## El sistema que se replica: editor del flyer de retiro

Doc maestra: `docs/features/retreat-flyer-editor.md`. Specs: `specs/flyer-editor/`.

| Pieza | Ruta | Qué aporta / acoplamiento |
|---|---|---|
| Vista editor | `apps/web/src/views/RetreatFlyerEditView.vue` | Grid `lg:grid-cols-[22rem_1fr]`, tabs, toolbar (Deshacer ⌘Z tope 30 / Descartar / Guardar), guards `onBeforeRouteLeave` + `beforeunload`, preview sticky 42vh en móvil |
| Canvas | `apps/web/src/components/flyer/RetreatFlyerCanvas.vue` | 850px, props `editable`/`printable` (solo pone `#printable-area` si true), emite `moveBlock`/`selectBlock`. **Muy acoplado al retiro** (chrome, `useFlyerContent`, toggles QR legacy) |
| Celda de grid | `apps/web/src/components/flyer/FlyerSlotColumn.vue` | Recibe drop; acoplamiento de UNA línea (`FLYER_BLOCK_COMPONENTS[block.id]`) |
| Bloques | `apps/web/src/components/flyer/blocks/` (8) | Componentes "tontos", una prop `content`, CSS vars `--fb-*`, marcas `.fb-lead`/`.fb-row`/`.fb-box`/`.fb-stack` |
| Registro | `apps/web/src/components/flyer/blockRegistry.ts` | `FLYER_BLOCK_COMPONENTS`, `FLYER_DEFAULT_LAYOUT`, `FLYER_BLOCK_STYLE_DEFAULTS` |
| Paneles | `apps/web/src/components/flyer/editor/Flyer{DesignPanel,ImagePicker,TextPanel,StyleFields,PanelSection,TemplatePanel}.vue` | Design/ImagePicker/TextPanel acoplados solo por constantes + prefijo i18n; StyleFields y PanelSection agnósticos |
| Store | `apps/web/src/stores/flyerEditorStore.ts` | Borrador + undo + isDirty + `untouchedOptions` (el PUT reemplaza la columna entera). Acoplado a `useRetreatStore` y `FLYER_TEXT_OVERRIDE_KEYS`; el ~90% es genérico |
| Estilo | `apps/web/src/utils/flyerStyle.ts` | Cascada `DEFAULTS ← theme ← blockStyles[id]` → 4 CSS vars; rgba compuesto (nunca `opacity`); contraste WCAG; `themeForBackground`. Acoplado solo por `FLYER_BLOCK_STYLE_DEFAULTS` |
| Layout | `apps/web/src/utils/flyerLayout.ts` | `resolveFlyerLayout` (reconcilia + rama v1 legacy), `moveBlockInLayout` (índice, sin getBoundingClientRect). Acoplado por `FLYER_DEFAULT_LAYOUT` |
| Contenido | `apps/web/src/composables/useFlyerContent.ts` | 100% retreat (retreat_type, house, teléfonos, qué llevar…) |
| Schema | `packages/types/src/index.ts` L79-320 | `flyerSlotSchema`, `flyerImagesSchema` (4 keys), `flyerBlockStyleSchema`, `flyerThemeSchema`, `FLYER_LAYOUT_VERSION = 2`, `flyerBlockIdSchema` (enum de 8 ids de RETIRO), `flyerOptionsSchema` |
| Imágenes | `POST /flyer-assets` (`apps/api/src/routes/flyerAssetRoutes.ts`, `imageService.processFlyerAsset`) | Magic bytes, 2MB, WebP q85 `fit: inside` → S3 `public-assets/flyer-assets/` (sin firma) o data-URI ≤512KB en dev. **Reutilizable tal cual** |
| Print/export | `RetreatFlyerView.vue` L145-162 | `--flyer-print-scale` truncado 1% holgura; PDF `html-to-image`+jsPDF; copiar `toBlob` PNG |

⚠️ **`index.ts` hace `export * from './community'` (L1009)** → `community.ts` no puede importar
de `'./index'` (ciclo). Los schemas compartidos hay que extraerlos a un archivo propio.

## El sistema que recibe la feature: flyer de reunión

| Pieza | Ruta | Estado |
|---|---|---|
| Vista única | `apps/web/src/views/CommunityMeetingFlyerView.vue` | Selector 3 estilos (localStorage vía `apps/web/src/utils/flyerStorage.ts`), popover Fondo (galería `FLYER_BACKGROUND_PRESETS` + upload + slider transparencia `#flyer-card-opacity`), Imprimir/Copiar imagen (`modern-screenshot` `domToBlob`), modal editar reunión. Print CSS global anclado a `#printable-area` (210mm) |
| Estilos | `apps/web/src/components/flyers/{Default,Poster,WhatsApp}Flyer.vue` | Jerarquía: título de reunión leading, comunidad subtítulo, "EMAÚS" solo si la comunidad no empieza con Emaús (`/^(ema)ús\b/i`). Props `backgroundUrl`/`cardOpacity` (`--card-a`) |
| Datos | `apps/web/src/utils/meetingFlyer.ts` | `formatMeetingDateOnly`, `formatMeetingTimeOnly`, `formatDuration`, `formatCommunityAddress`, `titleCaseForDisplay`, `replaceFlyerVariables` (para `meeting.flyerTemplate` con `{scope.var}`). **Reutilizable tal cual** |
| Identidad | `community.flyerBackgroundUrl` / `flyerCardOpacity` | `PUT/DELETE /api/communities/:id/flyer-background` y `PUT /flyer-card-opacity`; migraciones `20260920200000_*` y `20260921120000_*` (patrón ADD COLUMN idempotente) |
| Router | `apps/web/src/router/index.ts` L562-567 | `community-meeting-flyer` con `meta: { requiresRetreat: false }`. **No existe ruta `/edit`** |

## Gaps

1. No existe columna `flyer_options` en `community` ni endpoints de diseño.
2. No existe `meetingFlyerOptionsSchema`; `flyerBlockIdSchema` (enum de retiro) rechazaría los
   ids de reunión en `blockStyles`.
3. No hay canvas de bloques para reunión, ni chrome, ni registry, ni composable de contenido.
4. `FlyerDesignPanel`/`FlyerTextPanel`/`FlyerImagePicker`/`FlyerSlotColumn` están cableados a
   constantes/prefijo i18n del retiro — necesitan parámetros con defaults que preserven el
   comportamiento actual.
5. `flyerEditorStore` carga/guarda contra `retreatStore` — necesita factory.
6. No hay ruta editor ni vista; `flyerStorage` no conoce `'custom'`.
7. Print de la vista de reunión está calibrado para 210mm flujo normal; el canvas custom de 850px
   necesita su propia regla con escala.
8. Sin i18n (`meetingFlyerEditor.*`), sin ayuda in-app, sin doc de feature.

## Decisiones de reutilización (ver plan.md para el detalle)

- **Generalizar** (defaults preservan el comportamiento del retiro): `flyerStyle.ts`,
  `flyerLayout.ts` (núcleo), `flyerEditorStore.ts` (factory), `FlyerSlotColumn.vue` (prop),
  los 3 paneles (props).
- **Duplicar** (acoplamiento de contenido, generalizar arriesga 30+ tests): canvas
  (`MeetingFlyerCanvas.vue` nuevo), composable (`useMeetingFlyerContent.ts` nuevo), bloques
  (5 nuevos en `apps/web/src/components/flyers/blocks/`).
- **Reutilizar tal cual**: `POST /flyer-assets`, `resizeImageToDataUrl`, formatters de
  `meetingFlyer.ts`, `FlyerStyleFields.vue`, `FlyerPanelSection.vue`, `pickFile`,
  `imageLuminance.ts`, flujo `domToBlob` de la vista.
