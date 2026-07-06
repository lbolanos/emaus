---
name: youtube-publishing
description: Publicar los videos-demo de emaús en el canal de YouTube "Emaús Retiros" y generar el arte del canal (avatar, banner, miniaturas) con IA. Cubre el flujo OAuth (una vez), la subida por API con metadata/capítulos, la generación de imágenes con Gemini "nano banana" + composición de texto con CSS, el branding del canal, el botón de ayuda in-app (HelpVideoButton), y los gotchas ganados a pulso (token que expira, facturación de imágenes, verificación para miniaturas). Usar cuando se pida "subir a YouTube", "publicar el video", "crear/mejorar el logo o banner del canal", "generar miniatura/thumbnail", "generar imagen con IA/nano banana", o "botón de ayuda con video".
---

# Publicar en YouTube + arte del canal (Emaús Retiros)

Toda la infraestructura vive en **`apps/web/e2e/demo/`** (scripts `.mjs` standalone, `fetch`
puro, sin dependencias nuevas; cargan config con `loadEnv()` de `demo-lib.mjs`). Es el mismo
paquete que graba los videos (skill **`demo-videos`**): grabar → generar metadata → subir.

## El canal

- **Nombre**: `Emaús Retiros` · **Handle**: `@emaus-retiros`
- **Channel ID**: `UCHiwG7pIB5Su3iwzSt7kIJA` · público: `https://www.youtube.com/channel/UCHiwG7pIB5Su3iwzSt7kIJA`
- **Cuenta Google**: `emaus.cccc@gmail.com` (Gmail personal, NO Workspace)
- **Videos publicados**: Tareas Pre-Retiro `https://youtu.be/pPguV-Gg7Bs` · Minuto a Minuto `https://youtu.be/YYwjzHcumpA`
- **Estilo de marca**: "Camino a Emaús" — acuarela, amanecer, cruz en la colina, morado
  primario `#7c3aed` (= `hsl(271 76% 53%)`, el `--primary` del sitio), tipografía **serif**
  (el sitio usa Cinzel/Playfair; en la composición usamos Georgia como equivalente de sistema).

## Secretos (`apps/web/e2e/demo/.env`, gitignoreado)

```
YT_CLIENT_ID=…          # OAuth 2.0 "App de escritorio" (Google Cloud)
YT_CLIENT_SECRET=…
YT_PRIVACY=public       # public | unlisted | private (default de subida)
YT_CATEGORY_ID=27       # 27 = Educación
GEMINI_API_KEY=…        # nano banana: https://aistudio.google.com/apikey (requiere facturación, ver abajo)
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

`youtube-token.json` (guarda el `refresh_token`) también es gitignoreado — **tratar como secreto**.

## Flujo de subida

1. **Autorizar (una sola vez)**: `node e2e/demo/youtube-auth.mjs` — levanta un servidor
   loopback, abre el navegador, canjea el code por `refresh_token` y lo guarda.
2. **Subir**: `node e2e/demo/upload-to-youtube.mjs output/<video>.mp4 [--privacy unlisted]`.
   Lee `<video>.meta.json` (título, descripción, tags, capítulos) si existe; si no, usa el
   nombre del archivo como título. Imprime la URL final.
3. La **metadata** la emite `record-*.mjs` al terminar de grabar (`writeVideoMeta()` en
   `demo-lib.mjs`), incluyendo **capítulos** derivados del timeline de narración
   (`buildYoutubeChapters()`: primer capítulo en 0:00, ≥3, separación ≥10s; si no llegan a 3,
   los omite en vez de generar capítulos inválidos).

### Piezas

| Archivo | Rol |
|---|---|
| `youtube-lib.mjs` | OAuth (`getAccessToken` refresh, `exchangeCode`) + subida resumable (`uploadVideo`). |
| `youtube-auth.mjs` | Flujo OAuth loopback (una vez) → `youtube-token.json`. |
| `upload-to-youtube.mjs` | CLI de subida; lee `<video>.meta.json`. |
| `demo-lib.mjs` | `writeVideoMeta()` / `buildYoutubeChapters()` + `loadEnv()` con la config YT/Gemini. |

## Arte del canal con IA (nano banana) + composición

`gen-ai-image.mjs` llama a **Gemini 2.5 Flash Image** ("nano banana"). El estilo del sitio
(morado, amanecer, camino a Emaús, "sin texto") va **inyectado** en cada prompt (constante
`STYLE`), así que basta describir la escena.

```bash
# Texto → imagen (escena/fondo, SIN texto):
node e2e/demo/gen-ai-image.mjs "wide watercolor, sunrise over hills, path to a distant cross" -o output/bg.png
# Imagen → imagen (restyle de una existente, mantiene composición):
node e2e/demo/gen-ai-image.mjs "convert to soft oil painting, same layout" --edit ~/Desktop/banner.png -o output/bg2.png
```

**Regla de oro — híbrido IA + CSS**: los modelos de imagen **no rotulan texto de forma
confiable**. Genera con nano banana solo el **fondo/escena**, y sobrepón el texto exacto
(`Emaús Retiros`, títulos de miniatura) **con CSS renderizado por Playwright** (screenshot a
tamaño exacto). Patrón de composición (fondos embebidos como data-URI base64 para que carguen
en `setContent`; scrim oscuro para legibilidad; `omitBackground:true` para PNG con transparencia):
ver el script `_compose.mjs` que se usó para banner/miniaturas (efímero — recrear si hace falta).

Dimensiones objetivo:
- **Avatar**: 800×800+ (YouTube lo recorta a **círculo** → centra el foco, evita texto en bordes).
- **Banner**: 2048×1152, contenido en la **zona segura central 1235×338** (visible en TV/PC/móvil).
- **Marca de agua**: 150×150, esquinas transparentes.
- **Miniatura**: 1280×720 (título grande a un lado + `✝ Emaús Retiros`).

## Botón de ayuda in-app (video por feature)

- `apps/web/src/config/helpVideos.ts`: mapa `feature → { url, title }`. **URL vacía → sin botón.**
- `apps/web/src/components/HelpVideoButton.vue`: `<HelpVideoButton feature="pre-retreat-tasks" />`
  abre el video en pestaña nueva; **se oculta solo** si la feature no tiene URL. Usa el ícono
  `Play` (está en el allowlist del mock de lucide — si usas otro ícono, agrégalo a
  `apps/web/src/test/setup.ts`).
- Al subir el video de una feature, pega su URL en `helpVideos.ts` y agrega el botón a la vista.
- El panel de Ayuda (`HelpPanel.vue`) renderiza markdown con `marked` + `DOMPurify`, que **quita
  iframes** → no se puede incrustar el player; usar enlace/botón, no `<iframe>`.

## Gotchas (ganados a pulso, 2026-07)

- **OAuth "External" en modo Testing → el `refresh_token` expira a los 7 días.** Para que no
  caduque: en Google Auth Platform → **Audience → "Publish app"** (sale aviso de "app no
  verificada"; se ignora porque es de uso propio). *Internal* (sin caducidad ni verificación)
  **solo existe si el proyecto está en Workspace** — este canal es Gmail personal, así que es External.
- **`Error 403: access_denied` al autorizar** = la cuenta no está en **Test users**. Agregarla en
  Audience → Test users (o publicar la app).
- **La generación de imágenes NO está en el free tier de Gemini** (`429`, `limit: 0`). Requiere
  **facturación activada** en el proyecto de la API key (~$0.04 USD/imagen). El error es de cuota,
  no de auth — reintentar no ayuda hasta activar billing.
- **El scope `youtube.upload` NO permite leer datos del canal** (`channels.list?mine=true` → 403).
  Para verificar el canal, abrir la **página pública** con Playwright y sacar screenshot
  (WebFetch solo trae el footer: YouTube es SPA con JS).
- **Miniaturas personalizadas requieren teléfono verificado** en el canal ([youtube.com/verify](https://youtube.com/verify)).
- **Nombre del canal ≠ banner**: el "Name" en Studio → Personalización → Información básica es
  independiente del texto del banner; hay que fijarlo aparte (`Emaús Retiros`, con acento).

## Verificación

```bash
# Screenshot del canal público (el scope de upload no permite leerlo por API):
# navegar con Playwright a la URL del canal, aceptar cookies, screenshot a /tmp/chrome.
```
