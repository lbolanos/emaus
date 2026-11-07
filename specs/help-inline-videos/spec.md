# Spec: help-inline-videos

Videos de la ayuda in-app: reproducción **inline en modal** y decisión del usuario de abrirlos
en ventana nueva. Prospectivo — se reconciliará al cerrar (ver "Reconciliación").

Estado: **implementado** — commits `ea81ada3` (M1, feature), `918b96c2` (fix R7) en el branch
`worktree-help-inline-videos` del worktree `.claude/worktrees/help-inline-videos`.
Reconciliado contra el código el 2026-11-07.

## Problema

Los 27 enlaces a tutoriales de YouTube en la ayuda in-app (24 `.md` en `es` + réplica `en`)
navegan fuera de la app **en la misma pestaña**: el usuario pierde su lugar y el estado. Además,
el tercero de los puntos de render (`helpStore.loadTopicContent`) devuelve HTML sin sanitizar.

## Objetivo

Que el clic en un enlace de video de la ayuda **reproduzca el video inline** en un modal de la
app, con un botón explícito **«Abrir en ventana nueva»** para quien prefiera YouTube en su
propia pestaña. Decisión de UX tomada con el usuario (2026-11-07): **modal al hacer clic**
(patrón de `LandingVideos.vue`), no player embebido en el flujo del doc.

## Requerimientos

### R1 — Helper de render `renderHelpMarkdown`

Nuevo módulo `apps/web/src/utils/helpMarkdown.ts` con dos export:

- `renderHelpMarkdown(markdown: string): string` — `marked.parse(md, { async: false })`,
  post-proceso con `DOMParser` y sanitize final con allowlist **default** de DOMPurify:
  - Enlace de YouTube (`youtu.be/<id>`, `youtube.com/watch?v=`, `/embed/`, `/shorts/`) → el
    `<a>` conserva su `href` y gana `class="help-video-link"` + `data-video-id="<id>"`. **Sin
    `target`**: el clic lo intercepta la delegación (R3); el `href` queda para cmd-click /
    middle-click / copiar dirección.
  - Cualquier otro enlace `http(s)` externo → `target="_blank" rel="noopener noreferrer"`.
  - Enlace relativo → intacto (mismo origen o ruta interna).
  - Sanitiza con allowlist **default** + `ADD_ATTR: ['target']` (idéntico al comportamiento
    actual de HelpView/HelpPanel, más el permiso explícito para el `target` que el helper
    inyecta en los enlaces externos no-YouTube). `class`, `rel` y `data-*` ya sobreviven por
    default.
  - `''` o input vacío → `''`. Scripts/`onclick` eliminados (comportamiento DOMPurify estándar).
- `extractYouTubeId(url: string): string | null` — reconoce las 4 formas de URL de YouTube
  (`youtu.be/ID`, `watch?v=ID`, `/embed/ID`, `/shorts/ID`); `null` si no es YouTube o el ID no
  pasa un sanity check (`[A-Za-z0-9_-]{6,}`).

### R2 — Modal `HelpVideoModal`

Nuevo `apps/web/src/components/help/HelpVideoModal.vue`:

- Props: `videoId: string | null` (`null` = cerrado). Emit: `close`.
- Overlay propio con `Teleport` + `Transition` + `role="dialog"` + cierre por backdrop y
  Escape, copiando el patrón de `LandingVideos.vue` (sin `Dialog` de `@repo/ui`: evita el fix
  de reka-ui `useRekaDialogFix` y sus trampas conocidas).
- iframe `youtube-nocookie` con `autoplay=1&rel=0&modestbranding=1`, montado **solo mientras
  `videoId` está abierto** (desmontar corta el audio — CA4).
- Botón **«Abrir en ventana nueva»**: `window.open('https://www.youtube.com/watch?v=<id>',
  '_blank', 'noopener,noreferrer')` + icono `ExternalLink`.
- Botón ✕ (`common.close`), focus trap y `body overflow hidden` mientras está abierto.
- Título genérico i18n `help.video.title` (los `.md` no traen título por video; decisión
  tomada, no hay metadata de título en el enlace).

### R3 — Integración en HelpView y HelpPanel

- Ambos sustituyen `DOMPurify.sanitize(await marked.parse(content.default))` por
  `renderHelpMarkdown(content.default)`; imports de `marked`/`dompurify` eliminados.
- Delegación de clic en el contenedor `v-html`: si el target cae dentro de
  `a[data-video-id]` → `preventDefault()` y abrir el modal con el id. Cualquier otro clic no
  se intercepta.

### R4 — Integración en helpStore

`loadTopicContent` pasa por `renderHelpMarkdown` (una llamada a `marked.parse` por carga para
no romper el test de caché). Bonus de seguridad: ese punto empieza a sanitizar.

### R5 — i18n

Keys nuevas bajo `help.video` en **es y en a la vez**: al menos `title` y `openInNewWindow`.
Reutilizar `common.close` para el ✕.

### R6 — Tests

- `apps/web/src/utils/__tests__/helpMarkdown.test.ts` — ver CA5/CA6 y `extractYouTubeId`
  (4 formas + casos negativos).
- `apps/web/src/components/help/__tests__/HelpVideoModal.test.ts` — iframe con URL correcta,
  botón llama `window.open` con los 3 argumentos, cierre emite y desmonta el iframe.
- `helpStore.test.ts` queda **sin cambios** (debe seguir en verde).
- `LandingView.test.ts` / `LandingVideos.test.ts` quedan **sin cambios** y en verde.

### R7 — (descubierto al verificar) desbloqueo de `/app/help`: bucle de recarga pre-existente

Durante el smoke (CA1) se descubrió que en master, `/app/help` en sesión fresca entra en un
**bucle infinito de recarga**: los items de menú `letters` y `server-briefing` tienen rutas con
`:id` (`retreats/:id/letters`, `retreats/:id/servidores-minuto`) pero no estaban en la lista
`routesRequiringId` de `getRouteWithParams` (`Sidebar.vue`), así que `router.resolve({name:'letters'})`
lanza `Missing required param "id"` en el setup del RouterLink y el `app.config.errorHandler` de
`main.ts` (recuperación de boot) recarga la página — con la flag `__EMAUS_BOOT_RECOVERED` por
documento, el ciclo se repite infinito. Verificado contra base `2b170c84` (mismo error y bucle sin
el código de este feature).

**R7**: agregar `letters` y `server-briefing` a `routesRequiringId`, siguiendo el patrón de la
lista. Es lo mínimo para que `/app/help` sea usable en sesión fresca y los CA1-CA2 sean
verificables. En producción esto golpea a quien abre `/app/help` sin un retiro ya seleccionado.

## Criterios de aceptación

Los CA se ejercitan contra los `.md` reales (ya traen los 27 enlaces); no hay datos de DB
involucrados. Verificación: unit tests + smoke manual en el dev del worktree.

- **CA1** — En `/help`, clic en «Ver video tutorial» abre el modal y reproduce inline; no hay
  navegación ni cambio de pestaña.
- **CA2** — Desde el HelpPanel (sidebar y móvil), mismo comportamiento.
- **CA3** — El botón «Abrir en ventana nueva» abre `https://www.youtube.com/watch?v=<id>` con
  `noopener,noreferrer`.
- **CA4** — Cerrar el modal (✕, backdrop o Escape) desmonta el iframe → el audio se corta.
- **CA5** — `renderHelpMarkdown`: YouTube → `data-video-id` sin `target`; externo no-YouTube →
  `target="_blank" rel="noopener noreferrer"`; relativo intacto; `''` → `''`.
- **CA6** — El HTML resultante no contiene `<script>` ni `onclick` (sanitizado), incluido el
  camino de `helpStore`.
- **CA7** — `/app/help` en sesión fresca carga estable (sin bucle de recarga): ver R7.

## Decisiones tomadas

- **Modal, no player embebido en el doc**: decisión del usuario (2026-11-07); el doc no se
  recarga ni se pesa con iframes, y el "abrir en ventana nueva" vive dentro del modal.
- **Título genérico del modal** (`help.video.title`): los enlaces no traen metadata de título;
  añadir títulos por video implicaría tocar 48 `.md` (fuera de alcance).
- **Allowlist default de DOMPurify** (no `sanitizeHtml` de `utils/sanitize.ts`): su
  `ALLOWED_TAGS` restringido recortaría tags que hoy pasan en la ayuda (research, sección
  DOMPurify).

## Fuera de alcance

- Landing y su modal (`LandingVideos.vue`): no se toca ni se extrae a componente compartido
  (refactor futuro posible; se anota, no se hace).
- Los 48 `.md` de docs: intocables.
- `renderMarkdown` de `useMarkdown.ts` y demás consumidores de `marked` (chat AI,
  preparaciones, cartas): intocables.
- `RetreatMemoryCard.vue`: ya correcto.
- Backend/API/migraciones: no aplica (todo frontend).

## Reconciliación (al cerrar)

Repasada la spec entera contra el código final el 2026-11-07. Correcciones y notas:

- **R7 agregada al descubrirse** (bucle de recarga pre-existente de master en `/app/help`);
  fix en `918b96c2` junto a la corrección de esta spec. Detalle de evidencia en `research.md`.
- **Ayuda in-app sin sección contextual en `/app/help`**: `getHelpByRoute('help')` no matchea
  (no hay `routeContext` para esa ruta) — el panel deslizante solo muestra docs contextuales en
  otras vistas; CA2 se verificó en `/app/walkers` (walkers.md trae video).
- **Ruta real**: la ayuda vive en `/app/help` y `/app/help/:section` (names `help` /
  `help-section`), no `/help` — `/help` cae en la ruta pública `/:slug` de registro.
- **Locale del smoke**: corrió en `en` (locale del perfil); los textos del modal están en es y en
  (keys validadas en ambos JSON), CA1-CA4 verificados en `en`.
- **Descartes**: no se convirtió el smoke en spec e2e de Playwright (`tests/e2e/`): la
  verificación quedó cubierta por los 21 tests unitarios nuevos + smoke manual documentado aquí;
  el e2e de navegación con login sumaría fragilidad de CI (rate limit de login, carrera de boot
  de deep links) para cubrir lo que los unit tests ya fijan.
- **Criterios verificados**: CA1-CA7 en verde el 2026-11-07 (smoke por navegación SPA en el dev
  del worktree, puertos 3004/5176 — 3002/5174 y 3003/5175 estaban ocupados por otras sesiones).
