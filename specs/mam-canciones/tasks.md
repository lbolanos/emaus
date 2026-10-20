# Tasks: mam-canciones

> SDD tasks — versión 1.0 (2026-10-19). Al cerrar cada milestone se marcan los items y se
> añade una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>`
> al pie del milestone.

## M0 — specs SDD

- [x] `specs/mam-canciones/research.md`
- [x] `specs/mam-canciones/spec.md` (D1-D4 con defaults propuestos)
- [x] `specs/mam-canciones/plan.md`
- [x] `specs/mam-canciones/tasks.md`
- [x] Worktree + branch `worktree-mam-canciones` + setup (env, DB, ui/dist, install)
- [x] **Gate**: Leonardo revisa D1-D4 antes de codear M1 — cerrado 2026-10-19
      (D1 = MAM + Mi agenda; D2 = 🎵 + nombre, siempre visible; D3 y D4 como propuestas)

## M1 — Módulo puro + ancla en el MAM

- [x] `apps/web/src/views/mamMusic.ts`: `musicLink({ musicTrackUrl, palanquitaNotes })`
      → `{ url, label } | null` (regla D3: solo http(s); label = palanquitaNotes || «Música»)
- [x] Tests de `mamMusic` (URL válida con/sin nombre, no-URL con nombre, vacíos)
- [x] `MinuteByMinuteView.vue`: ancla 🎵 en la línea de metadatos (R1), `@click.stop`,
      tap-target móvil ≥32px, `title`/`aria-label`, truncado del label
- [x] El span 🎵 oculto en móvil se reemplaza por el ancla cuando hay URL válida (D2);
      sin URL válida queda como hoy
- [x] Verificación manual en dev del worktree (criterios 1-5)

**Done**: 2026-10-19. `mamMusic.test.ts` 7/7 verde; `vue-tsc --noEmit` limpio. En el dev del
worktree (Buen Despacho): criterio 1 — a 390×844 la fila «Charla: Las Máscaras» muestra el ancla
🎵 Huracan y al tocarla abre Spotify en pestaña nueva; criterio 2 — DOM: exactamente 6 anclas
sobre 149 filas y 22 spans 🎵 planos sin cambio (desktop); criterio 3 — el ancla no abre el modal
de edición y la fila sigue abriéndolo. Screenshot `mam-canciones-movil-huracan.png` (raíz del
worktree, sin commitear).

### Desviaciones 2026-10-19

- Criterios 4 y 5 sin filas de datos correspondientes en Buen Despacho (los 6 items con URL
  son válidos y con nombre). Cubiertos por los tests unitarios de `mamMusic` (no-URL → null;
  sin nombre → «Música»), que es donde vive la regla D3/D4. El render de esos casos es la rama
  `v-else-if` que dejó la fila exactamente como estaba.

## M2 — «Mi agenda»

- [x] `MyScheduleView.vue`: reemplazar el span 🎵 texto plano por la misma ancla (R2)
- [x] Extender `MyScheduleView.test.ts` con el caso con URL (y el sin-URL que queda igual)
- [x] Verificación manual (criterio 6)

**Done**: 2026-10-19. La vista renderiza filas con `h()`, así que el ancla vive en
`musicNode(item)` (helper del script, mismo criterio D2/D3 que el MAM; sin `@click.stop`
porque la fila de Mi agenda no es clicable — no hay modal ni drag). Tests: 8/8 en
`MyScheduleView.test.ts` (6 existentes + 2 nuevos: ancla con URL válida / span plano con
no-URL); `vue-tsc --noEmit` limpio. Verificación manual: añadí a Leonardo como apoyo de
«Charla: Las Máscaras» vía el modal de edición del MAM (mutación solo en la DB desechable
del worktree) y en `/app/my-schedule` la fila muestra `link "Abrir Huracan"` → clic abre
la pista de Spotify en pestaña nueva. Screenshot `mam-canciones-mi-agenda-movil.png`
(390×844, raíz del worktree, sin commitear).

## M3 — Cierre

- [x] Playwright con iPhone emulado sobre el dev del worktree (criterio 1: tocar 🎵 abre
      el link; criterio 3: no abre el modal)
- [x] `pnpm --filter web test` completa en verde
- [x] Ayuda del MAM (`MamHelpDialog`) + `apps/web/src/docs/es/*.md`: una línea sobre 🎵
      (solo si la ayuda actual menciona la línea de metadatos; si no, no se toca)
- [ ] Commits por milestone
- [x] Reconcile en `spec.md` + reescritura retroactiva si hubo desviaciones

**Parcial 2026-10-19** (solo falta el OK de Leonardo para los commits):

- iPhone 13 emulado (contexto propio con touch, `tap()` real): el ancla abre la pista de
  Spotify en pestaña nueva (criterio 1) y no abre el modal — mientras que el tap sobre la
  fila sí lo abre (criterio 3 + control).
- Suite web completa: 221 archivos / 3320 passed / 2 skipped (skips pre-existentes), exit 0.
- Ayuda: ni el `MamHelpDialog` (8 secciones) ni `apps/web/src/docs/es/*.md` describen la
  línea de metadatos de la fila → no se toca, como condicionaba el task.
- Reconcile escrito en `spec.md` v1.2 (tabla por criterio + lo descartado).
