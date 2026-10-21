# Research: impresión compacta del MAM (formato Excel)

> SDD research — versión 1.0 (2026-10-19). Todo lo afirmado abajo se verificó contra master
> (worktree recién creado desde master) y contra una copia read-only de la DB de dev del mismo
> día. La feature nace de un pedido directo de Leonardo con foto de referencia: el sábado de
> Buen Despacho impreso desde el Excel que el equipo usa hoy.

## 1. El pedido

«Quiero una nueva opción para imprimir el MAM compacto así como se imprime con el Excel […]
este ejemplo es el sábado de Buen Despacho. Cada día en una sola página.» La foto de referencia
muestra: página vertical, franja de encabezado oscura arriba, tabla **Hora | Actividad |
Responsables**, filas densas con fondos suaves por tipo de actividad, bordes finos en todas las
celdas, ~40 filas visibles por página.

Decisiones cerradas con Leonardo en la conversación (2026-10-19):

1. Columna responsables = **responsabilidad/equipo + nombres de las personas asignadas**.
2. **Todos los días en un solo diálogo** de impresión; cada día arranca página nueva.
3. **Colores suaves de fondo por tipo**, derivados de los que la app ya usa.

## 2. Lo que ya existe (verificado en código)

### El print actual del MAM no es esto

`MinuteByMinuteView.vue` imprime la vista misma (`onPrint` → `window.print()` con
`setTimeout(…, 50)`, y un `@media print` con namespace `.print-mam` al final del componente).
Esa salida **ya** rompe página por día (`page-break-before: always` en cada `h2` de día), pero
imprime la vista completa del coordinador: badges de tipo, música, adjuntos, descripciones,
indicadores de hueco/solape. El pedido es otro papel: una tabla densa operativa. El DOM de la
vista no es una tabla (filas flex), así que el formato compacto **no** sale de un stylesheet
alternativo sobre esa vista — necesita HTML propio.

### Tres corrientes de impresión en el repo

| Patrón | Dónde | Popup bloqueado | Pie de página | Robustez |
| --- | --- | --- | --- | --- |
| `@media print` de la vista | MAM, ShirtsReport, ~20 vistas | n/a | URL de la app | la que es |
| Ventana nueva + HTML escrito | `usePrintableDocument.printMarkdownDocument` (docs markdown) | **callback `onPopupBlocked`** | `history.replaceState` a ruta legible | la mejor |
| Ventana nueva + HTML escrito | `TablesView.handlePrintTables`, `ResponsabilitiesView.handlePrintDoc` | toast en TablesView; **silencioso** en ResponsabilitiesView | sin arreglar (`about:blank`) | media |

`buildPrintableHtml` (packages/utils) además cierra la ventana con `afterprint → window.close()`
y espera las `<img>` antes de imprimir. Para el compacto se copia ese molde simplificado: sin
`<base href>` ni espera de imágenes (el documento compacto no tiene recursos externos).

### Los datos ya viajan en el listado

- `GET /schedule/retreats/:retreatId/items` (`retreatScheduleService.listForRetreat`) carga
  relations `['responsability', 'responsables', 'responsables.participant']`. El DTO
  (`api.ts`, `RetreatScheduleItemDTO`) trae `responsables[]` con
  `participant: { firstName, lastName, nickname }`.
- El catálogo de responsabilidades (nombre del equipo + participante asignado al rol) vive en
  `responsabilityStore` (`GET /responsibilities?retreatId=`); la vista lo expone en el computed
  `responsibilities` y resuelve nombres con `responsabilityName(id)` /
  `responsableParticipantName(id)` (usa `participantLabel` de `apps/web/src/utils/participant.ts`,
  que ya embebe la regla de apodos significativos).
- La vista agrupa por `item.day` y ordena por `startTime` con desempate `orderInDay` (getter
  `itemsByDay` de `scheduleStore`). El `day` es la fuente de verdad del agrupado; las horas
  < 06:00 son madrugada que pertenece a ese mismo día (`AFTER_MIDNIGHT_HOUR` en
  `packages/types/src/scheduleTime.ts`).
- La identidad del retiro para el papel: `retreat.parish` (+ `retreat_number_version` si
  existe — el schema no tiene `name`). `retreat.timezone` existe y es el wall-clock planificado.
- Colores por tipo: `TYPE_BADGE_COLORS` en la vista usa clases Tailwind shade-100/700. Tailwind
  3.4 con paleta default (sin overrides en `tailwind.config.js`), así que el shade-100 canónico
  en hex es literalmente el mismo fondo del badge en pantalla.

## 3. Datos para dimensionar (Buen Despacho, dev DB, 2026-10-19)

- Día 1: 48 ítems (00:30→23:50) · **día 2: 56 ítems (peor caso, 00:25→23:55)** · día 3: 45.
- 12 tipos: logistica 43, campana 22, oracion 17, refrigerio 14, dinamica 14, charla 10,
  descanso 9, comida 7, traslado 4, testimonio 3, santisimo 3, misa 3.
- 131/149 ítems con `responsabilityId`; 40 apoyos con nombre (18 personas distintas) — la
  columna de responsables casi nunca envuelve.
- Presupuesto A4 (margen 10mm → 277mm útiles): franja de día ~7mm + thead ~5mm + 56 filas de
  una línea a 7.5pt/1.12 con padding 0.6mm ≈ 4.2mm c/u = 235mm → **sobra ~30mm** (tolera ~9
  filas que envuelvan a dos líneas). El criterio «día 2 de Buen Despacho en exactamente una
  página» es medible con `pdfinfo`.

## 4. Terreno de tests

- La convención de módulos puros de la vista (`mamTime.ts`, `mamMusic.ts`) con tests en
  `apps/web/src/views/__tests__/` aplica directo: toda la lógica decidable (agrupación, orden,
  formato de hora, colores, escape, celda de responsables) vive en el módulo nuevo y se prueba
  sin montar nada. `MinuteByMinuteView` no tiene test de mounting (decisión documentada en
  `specs/mam-canciones/plan.md`) y no se fuerza uno.
- `MamMoreActions` no tiene test propio; el help (`MamHelpDialog.test.ts`) sí guarda que el
  diálogo mencione los ítems del menú ⋮ — al añadir el botón se añade la aserción.
- Verificación de densidad: Playwright headless intercepta el popup (`waitForEvent('popup')`)
  y usa `popup.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })`;
  `pdfinfo | grep Pages` y `pdftoppm` para inspección visual (skill printable-documents:
  un render a baja resolución miente; usar `-r 100`).
