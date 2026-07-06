# Videos-demo narrados

Sistema para grabar **videos instructivos narrados** de una feature conduciendo la
**app real** con Playwright (Chromium visible), sobre-imponiendo subtítulos, agregando
**narración por text-to-speech** sincronizada, y produciendo un **MP4** (H.264 + AAC)
listo para compartir o subir a YouTube.

Todo vive en **`apps/web/e2e/demo/`** — scripts `.mjs` **standalone** (no son specs de
Playwright ni corren en CI). Los artefactos (`.webm` crudo, clips `.wav`, `.mp4` final,
`.meta.json`) van a `apps/web/e2e/demo/output/` (gitignoreado).

> Guía profunda para agentes/automatización: skill **`demo-videos`**. Publicación en
> YouTube y arte del canal: skill **`youtube-publishing`**.

## Quickstart

```bash
# 1. Configurar (una vez): copiar el ejemplo y completar la key de TTS
cp apps/web/e2e/demo/.env.example apps/web/e2e/demo/.env   # → DEEPGRAM_API_KEY

# 2. Levantar dev (web 5173 + API 3084)
pnpm dev            # o make dev

# 3. Grabar (materializa datos de demo → graba → limpia; deja la DB intacta)
bash apps/web/e2e/demo/run-pre-retreat-tasks.sh
bash apps/web/e2e/demo/run-minuto-a-minuto.sh
# → apps/web/e2e/demo/output/<feature>-demo.mp4  (+ .meta.json)
```

Requisitos: **ffmpeg de Homebrew** (`brew install ffmpeg` — el de Playwright no tiene
encoder H.264/AAC) y una `DEEPGRAM_API_KEY` (sin ella cae a la voz `say` de macOS).

## Mapa de archivos

| Archivo | Rol |
| --- | --- |
| `demo-lib.mjs` | Núcleo reutilizable: `loadEnv`, `genTts`, `OVERLAY_INIT`, `Narrator`, `muxVideo`, `computeSyncScale`, `buildYoutubeChapters`, `writeVideoMeta`. |
| `record-pre-retreat-tasks.mjs` | Graba el video de **Tareas Pre-Retiro** (feature con `data-testid`). |
| `record-minuto-a-minuto.mjs` | Graba el video de **Minuto a Minuto** (feature sin `data-testid` → selectores por texto/aria). |
| `reset-tasks.mjs` · `mam-fixture.mjs` | Fixtures del retiro de demo **por el API** (materializar/limpiar). |
| `run-*.sh` | Wrappers: preparar datos → grabar → revertir. |
| `youtube-lib.mjs` · `youtube-auth.mjs` · `upload-to-youtube.mjs` | Subida al canal por la YouTube Data API (ver skill `youtube-publishing`). |
| `gen-ai-image.mjs` | Genera imágenes con Gemini (arte del canal/miniaturas). |
| `demo-lib.test.mjs` | Tests de los helpers puros (`node --test`). |
| `.env` / `.env.example` | Secretos y config (el `.env` real es gitignoreado). |

## Cómo funciona

1. **Login que sobra en el video**: se loguea en un contexto **sin grabar**, se guarda el
   `storageState`, y el contexto de grabación arranca ya autenticado, directo en la feature.
2. **Subtítulos**: `OVERLAY_INIT` se inyecta con `context.addInitScript` (sobrevive las
   navegaciones). `Narrator.say(clip)` fija el cartel, registra el offset y espera la
   duración del audio para que el video "aguante" mientras se narra.
3. **Narración TTS**: `genTts` genera un `.wav` por línea con **Deepgram Aura-2** (voz
   natural, nivelada a −16 LUFS), o cae a macOS `say`. La duración se mide con `ffprobe`.
4. **Mux**: `muxVideo` coloca cada clip en su offset (`adelay`), los mezcla (`amix`) y los
   funde con el `.webm` → `.mp4`.
5. **Metadata**: `buildYoutubeChapters` + `writeVideoMeta` emiten `<video>.meta.json`
   (título, descripción, tags, capítulos) que consume el uploader.

### Sincronía audio↔video (importante)

El `.webm` de Playwright corre **~2-3 % más lento** que el reloj (`Date.now`), así que sin
corregir el audio se **adelanta** a los subtítulos en la segunda mitad. Los record scripts
miden la duración real del `.webm` (ffprobe) contra el reloj total y calculan
`computeSyncScale()`, que se pasa como `syncScale` a `muxVideo()` para escalar los offsets.

## Datos de demo: NUNCA tocar sqlite directo

La grabación **muta la DB** (marcar tareas, iniciar actividades, asignar responsables).
Para dejar la base intacta se prepara/revierte **por el API** (endpoints de
materialize/clear), nunca con `sqlite3` contra la base viva en WAL: hacerlo provocó una
divergencia de inodos y pérdida de datos (incidente 2026-07-03). Detalle en el skill
`db-production-resilience` y en la memoria del proyecto.

- **Tareas Pre-Retiro** (retiro Celaya): `reset-tasks.mjs` re-materializa antes y después.
- **Minuto a Minuto** (retiro Celaya): `mam-fixture.mjs` materializa una agenda fresca con
  `baseDate=hoy` (para que aparezca la línea "AHORA") y la **borra** al terminar.

## Tests

Los helpers puros de `demo-lib` (escala de sincronía, capítulos, metadata) tienen tests con
el runner nativo de Node (no Vitest — estos scripts viven fuera de `src/`, que es lo único
que Vitest escanea):

```bash
pnpm --filter web test:demo         # node --test e2e/demo/*.test.mjs
```

## Videos existentes

- `output/tareas-pre-retiro-demo.mp4` — checklist "Qué Hacer y Cuándo" antes del retiro.
- `output/minuto-a-minuto-demo.mp4` — agenda del retiro en tiempo real.
