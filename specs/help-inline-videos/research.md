# Research: help-inline-videos

Anclas verificadas contra `2b170c84` (master al abrir el worktree
`.claude/worktrees/help-inline-videos`). Las líneas son andamio de verificación; el
identificador estable es el símbolo. Rutas relativas a la raíz del repo.

## Dónde viven hoy los enlaces de video de la ayuda in-app

- Los tutoriales son 24 archivos en `apps/web/src/docs/es/` con réplica exacta en
  `apps/web/src/docs/en/` (mismos IDs de video). 27 enlaces en formato
  `[texto](https://youtu.be/ID)`, casi todos como `📺 **[Ver video tutorial](...)**` en las
  primeras líneas del doc. Ejemplos: `getting-started.md` (línea 3, `AHhyWbUv_Is`),
  `palancas.md` (líneas 3-4, dos videos), `crm.md` (líneas 3/5/7, tres videos).
- Verificado por grep sobre `docs/es` y `docs/en`: **no hay ningún enlace externo que no sea
  YouTube** y **no hay enlaces internos relativos** en los `.md` (grep `](\.\./` y `](/` sin
  resultados). Consecuencia: hoy, "todo enlace http(s) de la ayuda" ≡ "los 27 enlaces de video".

## Los 3 puntos que renderizan esos `.md`

Todos hacen `marked.parse()` (marked ^17, global) + `DOMPurify.sanitize()` **sin config** y
`v-html`, así que los `<a href="https://youtu.be/...">` salen sin `target` y navegan en la
misma pestaña:

| Archivo | Símbolo | Nota |
| --- | --- | --- |
| `apps/web/src/views/HelpView.vue` | `loadContent` (línea ~47-58; sanitize en 51) | Página `/help` y `/help/:section` |
| `apps/web/src/components/HelpPanel.vue` | `loadContent` (línea ~41-52; sanitize en 45) | Panel deslizante contextual |
| `apps/web/src/stores/helpStore.ts` | `loadTopicContent` (línea ~38-54; parse en 47) | Con caché `Map`; hoy **sin sanitizar** (devuelve HTML crudo); solo lo consumen sus tests |

`marked.parse` síncrono con `{ async: false }`: patrón existente en
`apps/web/src/composables/useMarkdown.ts` (`renderMarkdown`).

## Comportamiento de DOMPurify (3.3.0, node_modules instalado)

- El atributo `target` **NO** está en la allowlist HTML default → `DOMPurify.sanitize()` sin
  config lo elimina (`purify.es.mjs:200`; solo existen `targetx`/`targety` de SVG).
- `class`, `rel`, `href` **SÍ** están en la allowlist HTML default (`purify.es.mjs:200`).
- `ALLOW_DATA_ATTR` es **true por default** (`purify.es.mjs:437,566` — comentario "Default
  true") → un atributo `data-video-id` sobrevive al sanitize sin config.
- Consecuencia de diseño: para que el enlace de video lleve `data-video-id` + `class` basta el
  allowlist default (idéntico al que se usa hoy); solo si se quisiera `target` haría falta
  `ADD_ATTR`.
- `apps/web/src/utils/sanitize.ts`: `sanitizeHtml` trae `ALLOWED_ATTR` con `target` y el hook
  `configureDOMPurify` que añade `rel` (líneas ~148-155), pero su `ALLOWED_TAGS` **restringido**
  recortaría tags que hoy pasan por el allowlist default en la ayuda. **No reutilizar** para los
  docs; el hook global sí queda registrado en cuanto ese módulo se importa en el bundle.

## Patrón de modal a replicar: `LandingVideos.vue`

`apps/web/src/components/landing/LandingVideos.vue` (sección "Player modal"):

- `Teleport to="body"` + `Transition` de opacidad; overlay `fixed inset-0 z-[2000] bg-black/80`
  con `role="dialog" aria-modal="true"` y cierre por `@click.self`.
- `v-if="activeVideo"`: **el iframe solo está montado mientras el video está abierto** → al
  cerrar se corta el audio.
- iframe `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&rel=0&modestbranding=1`
  (líneas ~81-88) con `allow="accelerometer; autoplay; clipboard-write; encrypted-media;
  gyroscope; picture-in-picture; web-share"` y `allowfullscreen`.
- Escape por listener de document (`onKeyDown`), focus trap propio (`onTrapKey` +
  `FOCUSABLE_SELECTOR`), `body.style.overflow = 'hidden'` mientras está abierto, restore del
  foco previo al cerrar.
- Íconos usados: `X`, `Play`, `ChevronRight` de `lucide-vue-next`.

## Convención de apertura en ventana nueva

`window.open(url, '_blank', 'noopener,noreferrer')` — usada en `apps/web/src/utils/openLocation.ts`
(`openLocation`, línea ~31), `RetreatModal.vue`, `MinuteByMinuteView.vue`,
`RetreatDashboardView.vue`. En template: `target="_blank" rel="noopener noreferrer"` (p.ej.
`LandingView.vue` footer, `CommunityDetailModal.vue`).

## Otros lugares con enlaces de video — verificados, NO requieren cambio

- Landing (`/`): el único video es **embed en modal** (`LandingVideos.vue` desde
  `apps/web/src/config/landingVideos.ts`), no un enlace; la regla de no enlazar el canal desde
  la landing la protegen `apps/web/src/views/__tests__/LandingView.test.ts` y
  `apps/web/src/components/landing/__tests__/LandingVideos.test.ts`.
- `apps/web/src/components/social/RetreatMemoryCard.vue`: enlaces de canciones ya traen
  `target="_blank" rel="noopener noreferrer"`.
- El botón `HelpVideoButton`/`helpVideos.ts` fue **descartado el 2026-07-06**
  (`.ruler/skills/youtube-publishing/SKILL.md`); no existe en el árbol.

## Entorno de tests

- `apps/web/src/test/setup.ts` mockea `lucide-vue-next` con allowlist fija: `X` (línea 472),
  `ExternalLink` (509) y `Play` (568) **ya están** — no hace falta tocar el mock para este
  feature. El mock de `@repo/ui` acepta cualquier prop.
- `apps/web/src/stores/__tests__/helpStore.test.ts` mockea `marked` con un stub que devuelve
  `<p>Parsed: …</p>` (sin enlaces) y mockea los imports dinámicos de los `.md`. Sus assertions
  (`toContain('<p>Parsed:')`, cache por conteo de `marked.parse`) siguen válidas si
  `loadTopicContent` pasa por el nuevo helper, siempre que el helper llame `marked.parse` una
  sola vez por carga.
- No existen tests de `HelpView.vue` ni `HelpPanel.vue` (verificado en
  `apps/web/src/views/__tests__/` y `apps/web/src/components/__tests__/`).

## i18n

- El namespace `help` **top-level** existe en ambos locales (`es.json` ~2850, `en.json` ~2740)
  con keys `title`, `search`, `button`, `panel`, `sections`. **No existe `help.video`** — se
  agrega en es y en a la vez (regla del repo: una key faltante pinta la key cruda).
- `common.close` existe en ambos ("Cerrar"/"Close").
- Regla de key faltante: `t()` devuelve la key y lanza warning (`.claude/rules/frontend.md`).

## Otros consumidores de `marked` — fuera de alcance

`marked` se usa en ~20 archivos (chat AI, preparaciones, cartas del sacerdote, instrucciones
dinámicas, notes…). En particular `renderMarkdown` de `useMarkdown.ts` lo consumen
`AiChatWidget`, `RetreatPreparationsView`, `PublicPreparationsView`, `PriestLetterDialog`,
`DynamicInstructionsModal`, `ResponsabilitiesView`. Cambiarlo globalmente afectaría renders
ajenos a la ayuda → el fix va en un helper dedicado a la ayuda.

## Quirks del harness de tests (verificados el 2026-11-07, vitest + happy-dom 14.12.3 + DOMPurify 3.3.0)

Solo afectan a los tests unitarios, **no** a producción (navegadores reales):

1. `DOMParser.parseFromString` de happy-dom **evalúa** los `<script>` inline (sin `type` o con
   MIME de JS) al parsear. En un payload de test usar `type="application/json"` para que el
   script llegue al sanitizer sin explotar el harness.
2. Tras un `<script>` eliminado por DOMPurify, los **atributos peligrosos de los nodos
   siguientes sobreviven** el sanitize (`href="javascript:…"`, `onclick=…`) — solo en
   happy-dom; verificado con matriz piecewise (`anchor-only` sanitiza bien; `script-then-anchor`
   se lo salta). En los tests, no mezclar `<script>` y atributos peligrosos en el mismo payload.
   Los sanitize mínimos se comportan perfecto, así que DOMPurify en sí está bien.

Consecuencia de diseño: `renderHelpMarkdown` sigue sanitizando con DOMPurify default (el
comportamiento de producción es correcto); los tests de sanitización van en payloads separados.

