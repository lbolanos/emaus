# Tasks: mam-compact-print

> SDD tasks — versión 1.0 (2026-10-19). La compuerta de cada milestone que espera a Leonardo
> es el OK de commit (regla del repo: commits solo con autorización explícita por commit).

## M0 — Worktree + specs

- [x] Worktree `worktree-mam-compact-print` creado y renombrado a la convención
- [x] Setup: `.env`, DB (3 archivos), `packages/ui/dist`, `pnpm install`
- [x] `specs/mam-compact-print/{research,spec,plan,tasks}.md` con criterios contra datos
      existentes (Buen Despacho)

**Done**: 2026-10-19 — setup verificado (dist de ui copiado, install 6.8s).

## M1 — Módulo puro + tests

- [x] `apps/web/src/views/mamCompactPrint.ts`: tipos estructurales de entrada,
      `formatHHMM` (h23, timeZone explícito), `dayDateFromStart` (espejo UTC de
      `dayDateLabel`), `MAM_COMPACT_TYPE_COLORS` (shade-100 1:1 con `TYPE_BADGE_COLORS`),
      `buildMamCompactPrintHtml` (agrupación por `day`, orden startTime/orderInDay, escape,
      secciones con `break-before`, script embebido replaceState+print+close),
      `openMamCompactPrint` (popup bloqueado → `false` + callback)
- [x] `apps/web/src/views/__tests__/mamCompactPrint.test.ts`: las 9 familias de asserts del
      criterio 1 del spec
- [x] `pnpm --filter web test src/views/__tests__/mamCompactPrint.test.ts` verde
      (18/18) + `vue-tsc --noEmit` limpio

**Done**: 2026-10-19.

### Desviaciones

- **D2 refinada contra datos reales** (corregida en spec.md en el mismo cambio): 13 ítems de
  Buen Despacho tienen apoyos sin equipo; "sin responsabilidad → celda vacía" los habría
  dejado sin personas en el papel. La celda muestra los nombres solos; vacía solo cuando no
  hay equipo ni apoyos.
- Fecha larga sin coma tras el weekday: CLDR emite "sábado, 17…" y tras el `—` del header
  quedaban dos puntuaciones seguidas; se normaliza a "sábado 17 de octubre de 2026".

## M2 — Wiring UI

- [x] `MamMoreActions.vue`: botón «🖨 Imprimir compacto (tipo Excel)» + `'print-compact'` en
      el union `MoreAction`
- [x] `MinuteByMinuteView.vue`: `onPrintCompact()` (retreatLabel = parish + versión,
      startDateIso, timeZone; toast si popup bloqueado) conectado en **ambas** instancias del
      menú
- [x] Smoke manual en el dev del worktree: el popup abre con el contenido correcto

**Done**: 2026-10-19.

### Desviaciones

- **Smoke por builder directo, no por el popup.** En headless el `<script>` embebido
  auto-cierra el popup ~100ms tras abrir (`print → afterprint → close`): la ventana es
  invisible para `browser_tabs` y un hook de `window.open` se colgó 120s. En su lugar, desde
  la página autenticada del dev (fetch API + `import()` dinámico de Vite) se invocó
  `buildMamCompactPrintHtml` con los datos reales de Buen Despacho y se verificó el HTML:
  title "Minuto a Minuto — Buen Despacho — Del Valle II", días [1,2,3] con filas {48, 56, 45},
  día 2 de 07:00 a 22:55, 12 tipos con color, `<b>Logistica</b> <span class="names">Oskar</span>`
  (apodo significativo). El botón se demostró abierto en el menú ⋮ (screenshot).

## M3 — Densidad medible

- [x] Playwright headless: login → MAM de Buen Despacho → ⋮ → «Imprimir compacto» con
      `waitForEvent('popup')` → `popup.pdf({ format:'A4', printBackground:true,
      preferCSSPageSize:true })`
- [x] `pdfinfo` → **Pages == 3**; día 2 (56 ítems) completo en su página
- [x] `pdftoppm -r 100` → inspección visual: franja, bordes, colores, horas 24h, sin cortes
- [x] Si no cabe: ladder del plan (margen → fuente/padding → line-height); truncar apoyos
      solo con OK de Leonardo → **no hizo falta** (cupo a la primera)

**Done**: 2026-10-19 — `pdfinfo` Pages: 3 (A4 594.96×841.92pts) a la primera.

### Desviaciones

- **PDF vía `setContent` + `page.pdf()`, no `popup.pdf()`.** Mismo motivo que M2: el popup se
  auto-cierra antes de poder capturarlo. El HTML del builder se cargó con
  `context.newPage()` + `setContent(html sin el <script>)` y se imprimió con
  `page.pdf({ format:'A4', printBackground:true, preferCSSPageSize:true })`. El script
  removido solo hace `replaceState`/`print`/`close` — cero impacto de layout; el HTML
  renderizado es idéntico al que imprime el navegador real.
- Verificación del día 2 doble: `pdftotext -f 2 -l 2` → exactamente **56 filas** de hora
  (primera `07:00 Hora de despertarse`, última `22:55 Exponer al Santísimo (overnight)`), más
  inspección visual de los renders 100dpi (páginas 1-3): franja navy de encabezado con fecha
  larga correcta por día, thead oscuro, colores pastel por tipo, bordes finos, horas 24h,
  última fila de cada página completa.

## M4 — Docs + help + cierre

- [x] `docs/features/minuto-a-minuto.md`: ítem del menú + subsección «Impresión compacta»
- [x] Help in-app: `MamHelpDialog.vue` + aserción en `MamHelpDialog.test.ts`; bullet en
      `apps/web/src/docs/es/minute-by-minute.md` y `en/minute-by-minute.md`
- [x] `pnpm --filter web test` completa verde + `pnpm --filter web exec vue-tsc --noEmit`
- [x] Print existente verificado intacto (criterio 5)
- [x] Reconcile de la spec (tabla criterio → evidencia) y rewrite a modo retroactivo
- [ ] Commit(s) con OK explícito de Leonardo por commit

**Done**: pendiente solo el OK de commit (compuerta). Todo lo demás cerrado 2026-10-19.

### Desviaciones

- Añadido un 19º test unit (popup bloqueado → `false` + `onPopupBlocked`) para que el
  criterio 6 tenga evidencia real y no solo «está implementado».
