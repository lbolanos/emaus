# Plan: Editor de flyer de retiros — bloques reordenables, imágenes y plantillas

## Contexto

El flyer de retiro (`/app/retreats/:id/flyer`) es hoy un lienzo de 850px con ~8 tarjetas en
`position:absolute` hardcodeadas en píxeles (`RetreatFlyerView.vue`, 1201 líneas). Personalizarlo
significa editar ~19 overrides de texto en un tab del `RetreatModal` (2014 líneas) sin preview, o
editar JSON crudo. Las imágenes (fondo, header, footer, logo) están fijas en `/public`. Nada se
reutiliza entre retiros.

**Objetivo aprobado por el usuario**: editor de **bloques reordenables** (drag & drop entre celdas
de un grid gestionado, ocultar/mostrar; header/footer fijos), **imágenes cambiables** (galería de
presets + subida propia a S3), **plantillas reutilizables** (personales y por comunidad), alcance
**solo flyer de retiro** (los flyers de reuniones de comunidad quedan intactos). Los retiros
existentes deben seguir viéndose prácticamente igual sin tocar sus datos.

## Decisiones de diseño verificadas

- **`Retreat` NO tiene FK a `Community`** → la plantilla no se deriva del retiro; al guardarla el
  usuario elige scope `personal` o `community` (de las que administra). Precedente exacto:
  `apps/api/src/entities/messageTemplate.entity.ts` (`scope` + `communityId` nullable, autorización
  vía `CommunityAdmin` activo en el controller, no en middleware).
- **El editor vive en ruta propia** `/app/retreats/:id/flyer/edit`, NO dentro de `RetreatModal.vue`.
  El tab "Volante" del modal (L713-882) se elimina y se reemplaza por un botón que abre el editor.
- **`flyer_options` sigue siendo la misma columna simple-json** — sin migración de datos. La
  compatibilidad v1→v2 se resuelve con un normalizador puro en lectura (frontend).
- **Drag & drop con HTML5 nativo** (sin dependencia nueva) — patrón existente:
  `apps/web/src/components/DashboardCustomizePanel.vue` + `dashboardSettingsStore.moveSection`.
- **Imágenes subidas van a S3 `public-assets/flyer-assets/`** vía `s3Service.uploadPublicAsset()`
  (público, sin firma, no expira — los prefijos privados usan presigned de 1h que romperían un
  flyer compartido; y quedarse bajo `public-assets/` evita tocar IAM). Precedente:
  `retreatPreparationService.ts:400-406`.
- Metodología del repo para features grandes: **crear `specs/flyer-editor/{spec,research,plan,tasks}.md`
  y commitearlos antes de codear** (marcar tareas al cerrar cada milestone).

## Modelo de datos

### `flyer_options` v2 — extensión del `flyerOptionsSchema` en `packages/types/src/index.ts` (L66)

No se borra ningún campo v1 (los `*Override`, `showQrCodes*`, `showPickupInfo` quedan). Se añade:

```ts
export const flyerBlockIdSchema = z.enum([
  'intro', 'startTime', 'endTime', 'location',
  'contact', 'payment', 'whatToBring', 'registrationQr',
]);
export const flyerSlotSchema = z.enum(['left', 'right', 'wide']);
export const flyerBlockLayoutSchema = z.object({
  id: flyerBlockIdSchema,
  slot: flyerSlotSchema,
  order: z.number().int().min(0),      // posición dentro de su slot
  visible: z.boolean().default(true),
});
export const flyerImagesSchema = z.object({
  bodyBackground: z.string().optional(),
  headerBackground: z.string().optional(),
  footerBackground: z.string().optional(),
  logo: z.string().optional(),
}).partial();

// dentro de flyerOptionsSchema:
layoutVersion: z.number().int().min(1).max(2).default(1),
blocks: z.array(flyerBlockLayoutSchema).optional(),
images: flyerImagesSchema.optional(),
```

⚠️ Regla del repo: `z.object()` **descarta claves no declaradas** — todo campo nuevo que deba
persistir tiene que declararse aquí o el `PUT /retreats/:id` lo tira en silencio.

### Grid gestionado

Tres celdas: `left`, `right` (columnas ~50/50) y `wide` (fila ancha abajo). Cualquier bloque puede
vivir en cualquier celda; dentro de una celda se apilan por `order`. Header, banner y footer son
chrome fijo no reordenable.

### Normalizador v1→v2 (frontend, sin migración de datos)

`apps/web/src/utils/flyerLayout.ts` — `resolveFlyerLayout(retreatTypeLogo, raw): ResolvedFlyerLayout`:
- Si `raw.layoutVersion !== 2 || !raw.blocks` → parte de `FLYER_DEFAULT_LAYOUT` y traduce
  `showQrCodesRegistration` → `blocks.registrationQr.visible`.
- Si es v2 → reconcilia contra `FLYER_DEFAULT_LAYOUT` (patrón `loadOrderFromStorage` de
  `dashboardSettingsStore.ts:83`): añade ids faltantes, descarta desconocidos.
- `images.*` ausentes caen a los presets actuales (`/jesus2.png`, `/header_bck.png`, `/footer.png`,
  logo por `retreat_type`).
- `showQrCodesLocation` y `showPickupInfo` NO son bloques (sub-toggle de Location / formulario de
  registro); se devuelven aparte.

### Entidad de plantillas

`apps/api/src/entities/flyerTemplate.entity.ts` — tabla `flyer_templates`, modelada sobre
`messageTemplate.entity.ts`: `id` uuid, `name`, `scope: 'personal'|'community'`, `communityId?`
(FK CASCADE), `createdBy?` (FK SET NULL), `layout` simple-json (snapshot completo de un
flyer_options v2: blocks + images + overrides), timestamps. `scope`/`communityId` inmutables tras
crear. Registrarla en `apps/api/src/database/config.ts`.

Schemas en `packages/types/src/index.ts`: `flyerTemplateSchema` (con `layout: flyerOptionsSchema`),
`createFlyerTemplateSchema` (omit id/createdBy/timestamps), `updateFlyerTemplateSchema`
(omit además scope/communityId, `.partial()`, con `params`).

Migración `apps/api/src/migrations/sqlite/20260902..._CreateFlyerTemplates.ts`: `CREATE TABLE`
simple + 2 índices (communityId, createdBy). Sin importar `@repo/types` (valores literales).
`transaction = false` en la clase (el guard `sqliteSafePattern` lo exige por el `DROP TABLE` del
`down()`); recordar que el runner lo ignora en runtime — el flag CLI decide.

## API

- `apps/api/src/services/flyerTemplateService.ts` — `listForUser(userId)` (propias ∪ de comunidades
  donde es CommunityAdmin activo; superadmin ve todas), `create` (valida acceso a la comunidad si
  scope community, reusar el helper de `messageTemplateController.ts:20-42`), `update`, `remove`
  (ownership: creador, admin activo de esa comunidad, o superadmin).
- `apps/api/src/controllers/flyerTemplateController.ts` + `apps/api/src/routes/flyerTemplateRoutes.ts`
  (`isAuthenticated` + `requirePermission('retreat:update')` + `validateRequest`; ownership fino en
  el service). Montar `/flyer-templates` en `apps/api/src/routes/index.ts`.
- **Upload de imagen** (stateless, sin tabla): `POST /flyer-assets`
  - `packages/types`: `uploadFlyerAssetSchema` — `{ kind: enum(bodyBackground|headerBackground|footerBackground|logo), dataUrl: regex data-URI base64, max 4MB }` (patrón de `createRetreatMemoryPhotoSchema`).
  - `imageService.ts`: nuevo `processFlyerAsset(buffer, contentType, kind)` — magic bytes + 2MB máx
    como `processAvatar`, pero `fit:'inside'` (no recortar), lado máx 1600px para fondos / 512px
    para logo, salida WebP q85.
  - Controller/route nuevos (`flyerAssetController.ts`, `flyerAssetRoutes.ts`): sube con
    `s3Service.uploadPublicAsset('flyer-assets/<uuid>-<kind>.webp', …)`; fallback a data-URI inline
    cuando no hay S3 (patrón `retreatPreparationService`). Auth igual que plantillas.

## Frontend

### Refactor del flyer (pieza central)

- `apps/web/src/composables/useFlyerContent.ts` — extrae los ~19 computeds de texto/datos de
  `RetreatFlyerView.vue` (L437-810) sin cambiar su lógica.
- `apps/web/src/components/flyer/RetreatFlyerCanvas.vue` — el flyer visual puro (header + banner +
  grid + footer), props `retreat` + layout resuelto, expone `id="printable-area"`. Lo usan la vista
  de lectura Y el editor (preview vivo) → imprimir/copiar/PDF siguen operando sobre el mismo nodo.
- 8 bloques tontos en `apps/web/src/components/flyer/blocks/` (`FlyerBlockIntro.vue`,
  `FlyerBlockStartTime.vue`, `FlyerBlockEndTime.vue`, `FlyerBlockLocation.vue`,
  `FlyerBlockContact.vue`, `FlyerBlockPayment.vue`, `FlyerBlockWhatToBring.vue`,
  `FlyerBlockRegistrationQr.vue`) — el markup actual de cada card, quitando
  `position:absolute/top/left/width/max-height/overflow-hidden`.
- Chrome fijo: `FlyerHeader.vue`, `FlyerBanner.vue`, `FlyerFooter.vue` — reciben `images.*` como
  props en vez de rutas hardcodeadas.
- `apps/web/src/components/flyer/blockRegistry.ts` — `FLYER_BLOCK_COMPONENTS` +
  `FLYER_DEFAULT_LAYOUT` (mapeo del layout actual: left = intro, startTime, location, endTime;
  right = registrationQr, contact, payment; wide = whatToBring).
- `RetreatFlyerView.vue` queda: shell + menú de acciones + `<RetreatFlyerCanvas>`. Se borra
  `calculateContentHeight`/ResizeObserver de altura (el grid fluye solo). El `scaleFactor` móvil
  (contenedor/850) se conserva.
- No será pixel-perfect (el QR de registro hoy se superpone por posicionamiento libre); revisión
  visual manual contra 2-3 retiros reales, uno por `retreat_type` (valida los 4 logos).

### Editor

- Ruta nueva en `apps/web/src/router/index.ts` (junto a `retreat-flyer`, L336):
  `retreats/:id/flyer/edit` → `RetreatFlyerEditView.vue`, `meta: { requiresRetreat: true }`.
- `apps/web/src/views/RetreatFlyerEditView.vue` — dos paneles: preview vivo (Canvas con el borrador)
  + panel lateral con `Tabs` de `@repo/ui`: **Bloques / Imágenes / Textos / Plantillas**.
- `apps/web/src/stores/flyerEditorStore.ts` (Pinia): `loadFromRetreat`, `moveBlock(blockId, toSlot,
  toIndex)` (reindexa `order` con splice), `toggleVisibility`, `setImage`, `setTextOverride`,
  `applyTemplate`, `save()` (arma flyer_options **completo** con `layoutVersion:2` y llama
  `retreatStore.updateRetreat`), `isDirty`.
- `apps/web/src/components/flyer/editor/FlyerBlockList.vue` — drag & drop HTML5 nativo entre las 3
  celdas (guarda `{blockId, fromSlot}` en dragstart; drop llama `moveBlock`). Toggle de visibilidad
  con `Switch` de `@repo/ui` — **`model-value`/`@update:model-value`, nunca `:checked`**.
- `apps/web/src/components/flyer/editor/FlyerImagePicker.vue` (reusado 4×) — galería de presets
  (`apps/web/src/components/flyer/flyerPresetAssets.ts`: jesus2, header_bck, footer, poster,
  oficial_mejorado, woman_logo, crossRoseButtT, man_logo) + subida propia: `resizeImageToDataUrl()`
  de `apps/web/src/utils/imageResize.ts` (**FileReader — jamás `URL.createObjectURL`, la CSP de
  nginx bloquea `blob:`**; hay test guard) → `uploadFlyerAsset()` nuevo en
  `apps/web/src/services/api.ts`. UI de referencia: `MemberPhotoDialog.vue` (label nativo para el
  input file + pegar + drag&drop).
- Tab Textos: migra los inputs `*Override` que hoy viven en el modal, ahora con preview vivo.
- Plantillas: `apps/web/src/stores/flyerTemplateStore.ts` (patrón
  `communityMessageTemplateStore.ts`) + `FlyerTemplatePanel.vue` — guardar como nueva (nombre +
  scope Personal/Comunidad, comunidades vía `GET /communities/my`), aplicar (con confirmación),
  eliminar.

### `RetreatModal.vue`

- Eliminar el `<TabsContent value="flyer">` (L713-882) y `flyerOptionsJsonString`/
  `parseFlyerOptionsJson` (~L1150-1180). Reemplazo: botón "Abrir editor de volante" →
  `router.push({name:'retreat-flyer-edit'})` (deshabilitado en modo add).
- **Fix obligatorio del clobber** (verificado en L1912-1935 y L1949-1972: reconstruye
  `flyer_options` campo por campo): cambiar a spread completo del objeto existente
  (`{...(props.retreat as any).flyer_options, showPickupInfo: … ?? true}`). Sin esto, guardar el
  retiro desde cualquier otra tab del modal borraría `blocks`/`images` en silencio.

## i18n

Namespace nuevo `retreatFlyerEditor.*` en `apps/web/src/locales/es.json` y `en.json` (title, tabs,
nombres de los 8 bloques, slots, images, templates, save/dirty). En `retreatModal.flyer.*` añadir
`openEditor`/`editorHint`; no borrar claves viejas (huérfanas inofensivas). UI en español; código e
identificadores en inglés.

## Tests

- **Backend**: `flyerTemplateService.test.ts` (CRUD + autorización personal/community/superadmin,
  modelado sobre `messageTemplateService.test.ts`); test de rutas 401/403; `processFlyerAsset`
  (magic bytes, 2MB, no recorta, salida webp). La migración nueva la cubre el guard
  `sqliteSafePattern.simple.test.ts`. Correr jest por partes (la suite completa muere con SIGABRT);
  una sola corrida a la vez.
- **Types**: tests de `flyerOptionsSchema` extendido (v1 sigue parseando; `blocks`/`images`
  opcionales; `flyerTemplateSchema` rechaza scope inválido).
- **Frontend**: `flyerLayout.test.ts` (v1→default, reconciliación, defaults de imágenes); actualizar
  `RetreatFlyerView.test.ts` (los computeds se mueven a composable — las aserciones de contenido
  deben seguir pasando; quitar las que dependan de posiciones absolute; añadir caso v1 legacy);
  nuevos tests de `flyerEditorStore`, `flyerTemplateStore` y `RetreatFlyerEditView` (mover bloque,
  ocultar, aplicar plantilla, save manda flyer_options completo).
- ⚠️ `apps/web/src/test/setup.ts`: agregar al `vi.mock('lucide-vue-next')` (allowlist fija) todo
  ícono nuevo del editor (Eye, EyeOff, ImagePlus, LayoutGrid, Bookmark…) o el mount revienta.
- Prueba manual clave post-M2: editar otra tab del modal (p.ej. Cierre) y guardar NO debe borrar un
  layout custom guardado.

## Fases de entrega (cada una mergeable)

**M0 — Specs SDD**: crear y commitear `specs/flyer-editor/{spec,research,plan,tasks}.md`.

**M1 — Refactor a bloques, layout fijo (sin UI nueva visible)**
Composable + 8 bloques + chrome + Canvas con `FLYER_DEFAULT_LAYOUT` fijo. Done: el flyer se ve
visualmente equivalente; Imprimir/Copiar/PDF funcionan sin tocar su lógica; suite de
`RetreatFlyerView.test.ts` verde; `RetreatModal` intacto.

**M2 — Editor: reorden + visibilidad + textos**
Schema v2, `resolveFlyerLayout`, store, ruta `/flyer/edit`, drag&drop, toggles, tab Textos, botón
Guardar. `RetreatModal`: quitar tab Flyer + fix del clobber. Done: reordenar/ocultar persiste en
`flyer_options`; retiros v1 se ven igual; tests verdes.

**M3 — Imágenes**
`processFlyerAsset`, `POST /flyer-assets`, `FlyerImagePicker` (galería + subida), chrome leyendo
`images.*`. Done: cambiar las 4 imágenes desde el editor y verlas en el flyer publicado; **CORS del
bucket S3 verificado** para que `html-to-image` no falle con canvas tainted al copiar/exportar.

**M4 — Plantillas**
Entidad + migración + API + store + `FlyerTemplatePanel`. Done: guardar/aplicar/eliminar plantillas
personal y de comunidad; tests de autorización verdes.

## Riesgos

1. **Clobber de `flyer_options` desde RetreatModal** — el más serio; fix obligatorio en M2 (spread).
2. **CORS S3 + html-to-image** — imágenes de `public-assets/` son cross-origin; verificar
   `Access-Control-Allow-Origin` del bucket antes de cerrar M3 (hoy todo es same-origin en /public).
3. **PDF multi-página con altura variable** — el slicing de `handleDownloadPdf` ya usa altura real;
   probar manualmente con 8/8, 4/8 y 1/8 bloques visibles.
4. **Escala móvil** — mismo mecanismo (850px × scale), prueba visual tras M1.
5. **Campos legacy `showQrCodes*`** — quedan de solo-lectura para v1; documentarlo en el schema.
6. **`PublicRetreatFlyerModal`** no lee `flyer_options` (verificado) — sin riesgo, no tocar.

## Verificación end-to-end

1. `pnpm --filter web test src/utils/__tests__/flyerLayout.test.ts` y suites de flyer.
2. Jest del API por partes (services / resto); una corrida a la vez.
3. `pnpm --filter api migration:run` en local (backup `sqlite3 .backup` antes; jamás
   `migration:revert` — restaurar backup para deshacer).
4. Levantar `pnpm dev`, abrir `/app/retreats/<id>/flyer` con un retiro v1 (p.ej. Buen Despacho) y
   confirmar equivalencia visual; luego `/flyer/edit`: reordenar, ocultar, cambiar imagen, guardar,
   recargar, imprimir, copiar imagen y exportar PDF.
5. Editar el retiro desde otra tab del modal y verificar que el layout custom sobrevive.
6. Si se toca cualquier ruta/path en apps/api: arrancar `dist/index.js` una vez o
   `grep __dirname dist/index.js` (regla del bundle ESM).
