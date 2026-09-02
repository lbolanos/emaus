# Research: estado actual del volante y piezas reutilizables

Fecha: 2026-09-02. Todo lo de aquí está verificado por lectura de código, no inferido.

## Volante actual

`apps/web/src/views/RetreatFlyerView.vue` — 1201 líneas, ruta `/app/retreats/:id/flyer`.

- Lienzo fijo de 850px (`#printable-area`). Ocho tarjetas en `position:absolute` con coordenadas:

  | Bloque | top, left | Ancho |
  | --- | --- | --- |
  | Intro | -13, 15 | 560 |
  | Inicio | 172, 15 | 360 |
  | Ubicación + QR | 362, 15 | 440 |
  | Fin | 500, 15 | 330 |
  | Costo/pago | 463, 460 | 330 |
  | Contacto | 286, 488 | 300 |
  | Qué llevar | 685, 59 | 677 |
  | QR de registro | 2, right:21 | 220 |

- Chrome: encabezado 154px con `/header_bck.png`; banner de tipo de retiro; cuerpo con
  `/jesus2.png` y altura calculada a mano; pie con `/footer.png`.
- Logotipo por `retreat_type` (L463-490): `/oficial_mejorado.png` (men), `/woman_logo.png` (women),
  `/crossRoseButtT.png` (couples/effeta), `/man_logo.png` (fallback).
- Escala móvil: `ResizeObserver` → `transform: scale(anchoContenedor / 850)`.
- Altura del cuerpo: `calculateContentHeight()` mide los `.absolute` — desaparece al pasar a grid.
- Acciones: imprimir (`window.print()` + `@media print` que escala 0.933 a A4), copiar imagen
  (`html-to-image` `toBlob`, `pixelRatio:2` → `ClipboardItem`), PDF (`toPng` + `jsPDF` con
  troceado vertical multipágina que ya usa la altura real de la imagen).
- ~19 computeds de texto con cascada `flyer_options.*Override` → clave i18n `retreatFlyer.*`.

## Datos

- Columna `flyer_options` `simple-json` en `apps/api/src/entities/retreat.entity.ts:122`
  (migración `20251214170500_AddFlyerOptions.ts`).
- `flyerOptionsSchema` (Zod) en `packages/types/src/index.ts:66-104`: ~16 campos `*Override`,
  `showQrCodes` (legacy), `showQrCodesLocation`, `showQrCodesRegistration`, `showPickupInfo`,
  `cssStyles` (declarado, sin uso). Embebido en `retreatSchema:240`; validado en
  `PUT /retreats/:id` vía `validateRequest(updateRetreatSchema)`
  (`apps/api/src/routes/retreatRoutes.ts:71`).
- `retreatService.update()` hace `Object.assign` + `save` → **reemplaza la columna entera** en cada
  PUT. De ahí el riesgo de clobber descrito abajo.
- **`Retreat` no tiene FK a `Community`** (solo `houseId` → House y `createdBy` → User). Verificado.
  Por eso la plantilla no puede derivar su comunidad del retiro.

## Riesgo verificado: clobber de `flyer_options`

`RetreatModal.vue` L1912-1935 y L1949-1972 reconstruyen `flyer_options` **enumerando campo por
campo**. Hoy funciona porque la enumeración cubre todo el schema v1. En cuanto existan
`blocks`/`images`, guardar el retiro desde cualquier otra pestaña del modal los borraría en
silencio. Fix: spread del objeto existente.

Complemento: `z.object()` de Zod **descarta claves no declaradas**, así que un campo nuevo que no
se declare en `flyerOptionsSchema` se pierde en el PUT sin error (mismo patrón de bug que el repo
ya documenta para write schemas).

## Piezas reutilizables encontradas

| Necesidad | Pieza existente |
| --- | --- |
| Arrastrar para reordenar | `apps/web/src/components/DashboardCustomizePanel.vue` (HTML5 nativo) + `dashboardSettingsStore.moveSection` (splice) |
| Reconciliar orden guardado con claves nuevas | `loadOrderFromStorage` en `apps/web/src/stores/dashboardSettingsStore.ts:83` |
| Subir imagen sin romper la CSP | `resizeImageToDataUrl()` en `apps/web/src/utils/imageResize.ts` (usa `FileReader`, nunca `URL.createObjectURL`; hay test guard) |
| UI de selección de imagen | `apps/web/src/components/community/MemberPhotoDialog.vue` (label nativo + pegar + arrastrar) |
| Procesar imagen en servidor | `imageService.processAvatar` (magic bytes, 2MB, sharp → WebP q85) |
| Guardar asset público sin firma | `s3Service.uploadPublicAsset()` bajo `public-assets/`; precedente `retreatPreparationService.ts:400-406` |
| Entidad con alcance personal/comunidad | `apps/api/src/entities/messageTemplate.entity.ts` + autorización vía `CommunityAdmin` activo en el controller |

## Decisiones derivadas

- **Sin dependencia nueva de drag & drop**: HTML5 nativo, consistente con el repo.
- **Assets subidos van a `public-assets/flyer-assets/`**: los prefijos privados se sirven con URL
  firmada de 1h, que caducaría en un volante abierto o compartido. Además, quedarse bajo un prefijo
  existente evita tocar la política IAM de `EmausMediaRW`.
- **Sin migración de datos de `flyer_options`**: normalizador puro en lectura
  (`resolveFlyerLayout`), testeable y válido para filas creadas por cualquier vía.
- **El editor vive en su propia ruta**, no en el `RetreatModal` (que ya tiene 2014 líneas).

## Pendiente de verificar en obra

- CORS del bucket S3: al traer un fondo desde `public-assets/` (cross-origin), `html-to-image`
  puede fallar con canvas contaminado al copiar imagen o exportar PDF. Hoy todo es same-origin.
- Equivalencia visual del mapeo absolute → grid: el QR de registro hoy se superpone con
  intro/contacto; en grid quedará apilado. Requiere revisión visual con retiros reales.
