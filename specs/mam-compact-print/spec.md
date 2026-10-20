# Spec: impresión compacta del Minuto a Minuto (formato Excel)

> SDD spec — versión 1.1 (2026-10-19). Estado: **construido y verificado** (reescrita en modo
> retroactivo; reconciliación criterio → evidencia al final). D1-D5 cerradas con Leonardo
> (D2-D4 en la conversación, D1 y D5 técnicas). Pendiente: commits con OK de Leonardo y fusión.

**Branch**: `worktree-mam-compact-print` · **Fecha**: 2026-10-19 · **Para**: el equipo que hoy
imprime el programa desde Excel.

## Problema

El papel operativo del retiro — la tabla densa Hora | Actividad | Responsables, un día por
página — hoy se produce fuera de la app: alguien arma/mantiene un Excel y de ahí se imprime.
La app tiene el dato completo y actualizado (el MAM), pero su única salida a papel es la vista
del coordinador con badges, música, adjuntos e indicadores: no sirve como hoja de mano. Cada
retiro vuelve a sincronizar el Excel a mano (cf. la alineación por SQL de delvalleii,
2026-10-16).

## Objetivo

Que desde el MAM, con una acción, salga el programa completo del retiro en el formato compacto
de siempre: tabla densa vertical, cada día en exactamente una página, con responsables y
colores por tipo — listo para el diálogo de impresión del navegador (papel o PDF).

## Historias de usuario

1. Como coordinador, antes del retiro imprimo el programa completo en un solo paso y reparto
   una hoja por día, como hoy hago desde Excel pero sin mantener el Excel.
2. Como servidor, la hoja del día me dice a qué hora toca cada cosa y de qué equipo es cada
   actividad, con los nombres de las personas involucradas.
3. Como coordinador, guardo el programa como PDF desde el mismo diálogo para mandarlo por
   WhatsApp.

## Decisiones de diseño

- **D1 — Ventana nueva con HTML dedicado, no un `@media print` de la vista.** El DOM de la
  vista no es una tabla y ya tiene sus reglas de impresión propias (que se conservan intactas);
  una ventana hija da contexto limpio (razón documentada en `usePrintableDocument.ts`). Molde:
  `buildPrintableHtml`/`printMarkdownDocument` simplificado — sin `<base href>` ni espera de
  imágenes (sin recursos externos), con `history.replaceState` a ruta legible (pie de página del
  PDF), auto-print por `<script>` embebido y `afterprint → window.close()`. Popup bloqueado se
  reporta a la vista (toast), no silencio (el fallo silencioso de `ResponsabilitiesView` es el
  antipatrón). *Alternativa descartada*: jsPDF — no hacen falta marcadores ni encabezado
  repetido (regla del skill printable-documents).
- **D2 — Columna responsables: equipo + nombres.** `<b>Equipo</b>` seguido de los nombres de
  personas (primero el asignado al rol, luego los apoyos del ítem) en 6.5pt gris, misma celda,
  separados por coma. Cerrado con Leonardo. Ítem sin equipo pero **con apoyos** → solo los
  nombres (refinado contra datos reales: 13 ítems de Buen Despacho tienen apoyos sin
  responsabilidad, y la regla original "sin responsabilidad → celda vacía" los habría dejado
  sin personas en el papel). Sin equipo y sin apoyos → celda vacía (menos ruido; igual que el
  Excel). Responsabilidad sin participante asignado → solo el equipo (el ámbar de "sin
  asignar" es señal para el coordinador en vivo, no para el papel).
- **D3 — Todos los días, un día por página.** Un botón, un diálogo de impresión; cada día
  arranca página nueva (`break-before: page` + fallback `page-break-before: always`; el primer
  día no rompe). Cerrado con Leonardo. Días sin ítems no generan página.
- **D4 — Colores suaves por tipo = shade-100 canónico de Tailwind, 1:1 con
  `TYPE_BADGE_COLORS`.** El mapa vive como hexes propios del módulo (en la ventana nueva no hay
  Tailwind); como la paleta del repo es la default, el fondo impreso es literalmente el mismo
  color del badge en pantalla. Tipo desconocido → `otro` (gris), igual que `typeBadgeClass`.
  Cerrado con Leonardo la existencia de colores. **Sin leyenda de colores en v1** (trade-off:
  el papel reproduce el código visual que ya se conoce de la pantalla; si se pide, una línea de
  leyenda de 6pt bajo la franja cabe en el presupuesto de ~30mm).
- **D5 — Hora 24h en la timezone del retiro.** `HH:MM` con `hourCycle: 'h23'` y en-dash
  (`14:05–15:05`), como el Excel — no el 12h+meridiano de la vista. La hora se formatea en
  `retreat.timezone` si existe (wall-clock planificado; si imprime alguien desde otra tz, el
  papel sigue diciendo la verdad del retiro); fallback = timezone del navegador (comportamiento
  de `clockParts` en pantalla).

## Requerimientos

- **R1** — Módulo puro `apps/web/src/views/mamCompactPrint.ts` (patrón `mamTime`/`mamMusic`):
  `buildMamCompactPrintHtml(input)` agrupa por `day` y ordena cada día por `startTime` con
  desempate `orderInDay` (espejo de `itemsByDay`); escapa todo texto user-facing (reusa
  `escapeHtml` de `utils/tablesPrint.ts`); nombres de personas vía `participantLabel`.
- **R2** — `openMamCompactPrint(input, opts?)`: ventana nueva + `document.write`; `false` y
  `onPopupBlocked` si el navegador la bloquea.
- **R3** — Botón `🖨 Imprimir compacto (tipo Excel)` en `MamMoreActions.vue` (acción
  `print-compact`, junto a "🖨 Imprimir"), conectado en las dos instancias del menú dentro de
  `MinuteByMinuteView.vue`.
- **R4** — El print existente (`onPrint` + su `@media print`) queda intacto; sin cambios de
  API, DTO, migraciones ni permisos.

## Criterios de aceptación (end-to-end, contra datos existentes)

Contra Buen Despacho (dev DB: 149 ítems, 3 días, día 2 con 56):

1. El builder pasa su suite unit (agrupación/orden, salto de página, h23, escape, colores con
   fallback, celda responsables completa/vacía, header con fecha larga, `title`, script
   embebido, día de 56 ítems → exactamente 56 filas en `tbody`).
2. Playwright headless contra el dev del worktree: click en el botón → popup → PDF (A4,
   `printBackground`, `preferCSSPageSize`) con **`Pages == 3`** — un día por página.
3. La página del día 2 contiene las 56 filas completas (ninguna fila cortada entre páginas).
4. El PDF muestra fondos de color por tipo y la franja oscura de encabezado en cada página.
5. El print existente (menú ⋮ → "Imprimir") no cambia.
6. Con pop-ups bloqueados, la vista muestra un toast con instrucción y no explota.
7. `pnpm --filter web test` verde con la suite nueva; `vue-tsc --noEmit` limpio.

## Fuera de alcance

- Export a Excel/CSV real (el pedido es el papel/PDF, no el archivo).
- Leyenda de colores, logo/membrete o firma en la hoja (v1; ver D4).
- La pantalla pública `/mam/:slug` y «Mi agenda» (si se pidiera, el módulo puro ya está).
- Filtrar tipos (campana/logística se imprimen como el resto — el Excel también las lista).
- jsPDF con marcadores.

## Reconciliación (2026-10-19)

Los 7 criterios de aceptación, verificados contra Buen Despacho (dev DB del worktree):

| # | Criterio | Evidencia |
| --- | --- | --- |
| 1 | Suite unit del builder verde | **19/19** en `apps/web/src/views/__tests__/mamCompactPrint.test.ts` (18 originales + popup bloqueado), dentro de la suite completa del web: 226 archivos / 3375 tests verde |
| 2 | PDF A4 con `Pages == 3` | `pdfinfo /tmp/mam-compact-bd.pdf` → **Pages: 3**, A4 594.96×841.92pts, a la primera (el ladder de densidad no hizo falta) |
| 3 | Día 2 completo, 56 filas en su página | `pdftotext -f 2 -l 2` → exactamente 56 filas; primera `07:00 Hora de despertarse`, última `22:55 Exponer al Santísimo (overnight)` |
| 4 | Colores por tipo + franja en cada página | renders `pdftoppm -r 100` páginas 1-3 inspeccionados visualmente: franja navy con fecha larga por día, thead oscuro, tintes pastel, bordes finos, sin filas cortadas |
| 5 | Print existente intacto | `git diff` de `MinuteByMinuteView.vue`: solo los 2 bindings, el import y el handler nuevo; `onPrint` y su `@media print` sin cambios |
| 6 | Pop-up bloqueado → toast, no explota | test unit: `window.open → null` ⇒ `openMamCompactPrint` devuelve `false` y dispara `onPopupBlocked` (el toast destructivo vive en el handler de la vista) |
| 7 | Suite completa + `vue-tsc` | 226 archivos / 3375 tests verde; `vue-tsc --noEmit` exit 0 |

**Desviación de método (criterios 2-3)**: el PDF no salió del popup real — en headless el
`<script>` embebido auto-cierra la ventana ~100ms tras abrirla, antes de poder capturarla. Se
generó con `setContent(html sin script)` + `page.pdf(...)` sobre el HTML del builder cargado
con los datos reales; el script removido solo hace `replaceState`/`print`/`close` (cero impacto
de layout). El botón y el menú sí se verificaron en el navegador del dev (smoke M2). Detalle en
`tasks.md` (M2/M3).
