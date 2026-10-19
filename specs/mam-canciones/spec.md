# Spec: ejecutar las canciones del Minuto a Minuto

> SDD spec — versión 1.2 (2026-10-19). Estado: implementado y verificado (M1-M3, 2026-10-19);
> pendiente de commits y fusión. v1.1 cerró D1-D4; v1.0 era el borrador para revisión.

**Branch**: `worktree-mam-canciones` · **Fecha**: 2026-10-19 · **Para**: el próximo retiro.

> Repo público: sin PII. Los links de Spotify de ejemplo no se reproducen en este archivo.

## Problema

Cada item del Minuto a Minuto puede llevar su canción: URL en `musicTrackUrl` y nombre en
`palanquitaNotes` («Música / palanquita»). El dato se captura bien — Buen Despacho trajo 6
charlas con su link de Spotify y el nombre de la canción — pero **ninguna pantalla ofrece
ejecutarla**: la lista del MAM no renderiza la URL, «Mi agenda» muestra el nombre como texto
plano, y el 🎵 ni siquiera se ve en el celular (`hidden sm:inline`). Durante el retiro, quien
pone la música no tiene cómo llegar a la pista desde el teléfono (detalle en `research.md` §3-4).

## Objetivo

Que cualquier persona con el MAM abierto en su teléfono pueda tocar la canción de un item y
que se abra (Spotify/YouTube/navegador), sin abrir el modal de edición ni copiar nada.

## Historias de usuario

1. Como servidor con el MAM en el celular, cuando la charla que estoy acompañando tiene
   música, toco 🎵 en su fila y la canción se abre en Spotify.
2. Como coordinador en desktop, veo de un vistazo qué items del MAM tienen pista asignada
   (el 🎵 con el nombre), y la abro con un click.
3. Como servidor en «Mi agenda», el 🎵 de mis actividades es un link, no texto plano.

## Decisiones de diseño (cerradas con Leonardo, 2026-10-19)

- **D1 — Alcance: MAM interno + «Mi agenda».** Las dos pantallas donde un teléfono consulta
  el programa. La pantalla pública (`/mam/:slug`) queda fuera (es proyector; hoy ni siquiera
  recibe el campo). *Alternativa descartada*: solo el MAM interno — «Mi agenda» es la vista
  natural del servidor durante el retiro y repetir el patrón ahí es trivial.
- **D2 — El control es un ancla nativa siempre visible.** En la línea de metadatos de la fila
  (donde hoy vive el 🎵 oculto y el 📎 de adjuntos): `<a :href="url" target="_blank"
  rel="noopener noreferrer">🎵 {nombre}</a>`, visible en móvil y desktop, tap-target ≥32px
  (padding, mismo criterio WCAG 2.5.5 que ▶/±5), `@click.stop` para no abrir el modal de
  edición. El label es `palanquitaNotes` si existe; si no, «Música». *Alternativa descartada*:
  botón con `window.open` — el ancla nativa es la que mejor abre la app de Spotify/YouTube
  desde el navegador del teléfono.
- **D3 — Solo URLs http(s) renderizan ancla.** Misma regla que `importSongsFromMam`
  (`^https?:\/\//i`). Si `musicTrackUrl` no es una URL (alguien escribió el nombre de la
  canción en el campo equivocado), el item se muestra igual que hoy: 🎵 `palanquitaNotes`
  como texto plano (y en el MAM, oculto en móvil como ahora). Sin anclas rottas y sin
  validar nada más: no hay lista de dominios permitidos.
- **D4 — La lógica de decisión vive en un módulo puro.** `mamMusic.ts` (hermano de
  `mamTime.ts` en `apps/web/src/views/`): recibe `{ musicTrackUrl, palanquitaNotes }` y
  devuelve `{ url, label } | null`. Las dos vistas lo llaman; los tests prueban el criterio
  una sola vez. Sin cambios de API ni de base de datos.

## Requerimientos

- **R1** — `MinuteByMinuteView.vue`: fila con pista válida (D3) → ancla 🎵 en la línea de
  metadatos, visible en móvil y desktop, con `title`/`aria-label` «Abrir {label}», `@click.stop`.
- **R2** — `MyScheduleView.vue`: el span 🎵 texto plano se reemplaza por la misma ancla
  cuando hay pista válida; sin URL válida, se mantiene el texto plano de hoy.
- **R3** — El ancla no dispara el modal de edición del item ni el drag-reorder de la fila,
  ni en touch ni en mouse.
- **R4** — Sin cambios de API, DTO, migración ni permisos: todo lo necesario ya viaja en
  `RetreatScheduleItemDTO`.

## Criterios de aceptación (end-to-end)

1. MAM de Buen Despacho en un viewport de teléfono: la fila de «Charla: Las Máscaras»
   muestra 🎵 Huracán y al tocarla se abre el link de Spotify (pestaña nueva / app).
2. El mismo MAM en desktop: las 6 charlas con pista muestran el ancla; los 143 items sin
   pista no muestran nada nuevo.
3. Tocar el ancla **no** abre el modal de edición (la fila sigue abriéndolo al tocar
   fuera del ancla).
4. Item con `musicTrackUrl` que no es URL (p. ej. «Pretorio» sin http) → sin ancla; si tiene
   `palanquitaNotes`, se ve igual que hoy.
5. Item con URL pero sin `palanquitaNotes` → ancla con label «Música».
6. «Mi agenda» de un servidor con la charla asignada → el 🎵 es link y abre la pista.
7. `pnpm --filter web test` verde, incluida la suite nueva de `mamMusic`.

## Fuera de alcance

- Reproductor embebido (iframe/Spotify embed) o auto-play: se abre el link, punto.
- La pantalla pública `/mam/:slug`: no recibe `musicTrackUrl` y es para proyector.
- Editar la URL desde la fila: el modal de edición sigue siendo el único camino de captura.
- Recuerdos / «Importar música del MAM»: sigue como está (post-retiro, ya funciona).
- El botón de campana/notificaciones y demás controles de la fila: intocables.

## Reconcile (cierre 2026-10-19)

Cada criterio verificado contra lo implementado, con el dev del worktree (Buen Despacho,
DB desechable) y la suite de web:

| # | Criterio | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | MAM en teléfono: tocar 🎵 abre Spotify | ✓ | Viewport 390×844 (click) e iPhone 13 emulado (touch, `tap()`): popup a la pista correcta |
| 2 | Desktop: 6 anclas, resto sin nada nuevo | ✓ | DOM: exactamente 6 anclas sobre 149 filas; los 22 🎵 planos pre-existentes renderizan idéntico |
| 3 | El ancla no abre el modal; la fila sí | ✓ | iPhone emulado: tras `tap()` en el ancla no hay `[role="dialog"]`; `tap()` en la fila sí lo abre |
| 4 | No-URL → sin ancla, igual que hoy | ✓\* | Sin filas con ese caso en Buen Despacho; cubierto por `mamMusic.test.ts` (devuelve `null`) y la rama `v-else-if` intacta |
| 5 | URL sin nombre → «Música» | ✓\* | Sin filas con ese caso; cubierto por `mamMusic.test.ts` (fallback del label) |
| 6 | «Mi agenda»: el 🎵 es link y abre la pista | ✓ | Leonardo como apoyo de la charla (mutación en la DB desechable): ancla visible, el clic abre la pista |
| 7 | Suite web verde | ✓ | 221 archivos / 3320 passed / 2 skipped (skips pre-existentes); `mamMusic` 7/7, `MyScheduleView` 8/8 |

Requerimientos: R1/R2 implementados tal cual (D2/D3); R3 verificado en el MAM (modal) y sin
reorder observable en ningún tap sobre el ancla — en «Mi agenda» la fila no es clicable, así
que no necesita `@click.stop`; R4 cumplido: cero cambios de API/DTO/migración/permisos. D1
respetado: `PublicMinuteByMinuteView` intacta.

Detalle de implementación que la spec no preveía: «Mi agenda» renderiza sus filas con `h()`
(sin template), por lo que el ancla vive en el helper `musicNode(item)` de
`MyScheduleView.vue`, no en el markup. Mismo criterio D2/D3, mismas clases.

Lo descartado / no construido: nada del diseño quedó fuera. Los criterios 4 y 5 no pudieron
verificarse con datos reales (los 6 items con URL de Buen Despacho son válidos y con nombre);
la regla vive en `mamMusic.ts` y está cubierta por tests unitarios (misma nota que en las
desviaciones de M1). La ayuda del MAM no se tocó: ninguna sección del `MamHelpDialog`
describe la línea de metadatos de la fila, y el plan condicionaba el cambio a eso.
