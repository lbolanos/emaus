---
name: demo-videos
description: Crear videos instructivos/demos NARRADOS de una feature de emaús conduciendo la app REAL con Playwright (Chromium visible), con carteles/subtítulos, narración por text-to-speech (Deepgram Aura-2 o macOS `say`) y mux con ffmpeg. Usar cuando se pida "crear un video demo", "grabar un instructivo/tutorial", "un walkthrough narrado de una feature", "un video para clientes", o mejorar/regenerar uno existente.
---

# Cómo hacer videos instructivos (demos narrados) en emaús

Graba un recorrido de una feature conduciendo la **app real** (`pnpm dev`/`make dev`)
en un Chromium **visible**, sobre-impone **carteles/subtítulos**, agrega **narración
por TTS** sincronizada y produce un **MP4 con audio** (H.264 + AAC).

Toda la infraestructura vive en **`apps/web/e2e/demo/`** (scripts `.mjs` standalone,
no specs de CI). El video crudo (`.webm`), los clips TTS y el `.mp4` final van a
`apps/web/e2e/demo/output/` (gitignoreado, junto a `.env`).

## Plantillas (copiá y adaptá — no empieces de cero)

| Archivo | Rol |
|--------|-----|
| `demo-lib.mjs` | Bloques reutilizables: loader `.env`, `genTts()`, `OVERLAY_INIT`, `Narrator`, `muxVideo()` (+ `computeSyncScale`), metadata YouTube. **No dupliques esto.** |
| `record-pre-retreat-tasks.mjs` | Referencia (feature con `data-testid`): guion + login por `storageState` + escenas + mux + meta. |
| `record-minuto-a-minuto.mjs` | Referencia (feature SIN `data-testid`, selectores por texto/aria; controles en vivo). |
| `reset-tasks.mjs` / `mam-fixture.mjs` | Dejan el retiro de demo limpio/poblado vía el API (materialize / clear). Base para resetear mutaciones. |
| `run-pre-retreat-tasks.sh` / `run-minuto-a-minuto.sh` | Wrappers: reset/materialize → grabar → reset/clear. |
| `.env.example` | Config committeable; copiá a `.env` (gitignoreado) y completá `DEEPGRAM_API_KEY`. |

## Receta (seguir en orden)

1. **Descubrí los selectores/triggers EN VIVO — no adivines.** Con `pnpm dev` arriba,
   escribí un script de exploración headless que loguee el DOM (conteos de `data-testid`,
   textos, estados) y saque screenshots a `/tmp/chrome`. Leé las imágenes (`Read`) para
   confirmar CADA interacción antes de grabar. La feature de Tareas Pre-Retiro ya expone
   `data-testid` en todo (`import-template`, `new-task`, `filter-*`, `task-<id>`,
   `menu-<id>`, `today-marker`, `export-csv`) — úsalos.
2. **Escribí el guion** (tuteo, frases < 25 palabras; el cartel = lo narrado) y las escenas
   imperativas reutilizando `demo-lib.mjs`.
3. **Corré y verificá POR FRAMES.** Extraé un frame en cada offset del `timeline` con ffmpeg
   y miralo (`Read`) para confirmar que la escena muestra lo que dice el cartel. Ajustá
   pacing/orden y volvé a correr.
4. **Entregá**: copiá el `.mp4` a `~/Desktop/` con nombre claro y resumí qué muestra.
5. **Publicá** (opcional): al terminar de grabar, `record-*.mjs` emite `<video>.meta.json`
   (título, descripción, tags, capítulos). Para subirlo al canal de YouTube, generar arte/
   miniaturas o cablear el botón de ayuda in-app → cargar el skill **`youtube-publishing`**.

## Bloques de construcción (ya resueltos en `demo-lib.mjs`)

- **Headed + slowMo**: `chromium.launch({ headless:false, slowMo:55 })`. Viewport y
  `recordVideo.size` = `1280×800`.
- **Login que sobra en el video**: logueá en un **contexto sin grabar**, guardá
  `storageState`, y creá el contexto de grabación con ese estado → el video arranca ya
  autenticado, directo en la feature.
- **Carteles/subtítulos**: se inyectan con `context.addInitScript(OVERLAY_INIT)` (NO un
  solo `page.evaluate`: cada `page.goto` recarga el documento y borraría el overlay).
  `Narrator.say(clip)` fija el subtítulo, registra el offset y espera la duración del audio.
- **Narración TTS**: `genTts()` usa **Deepgram Aura-2** si hay `DEEPGRAM_API_KEY` (voz
  natural, nivelada con `loudnorm=I=-16` porque sale baja); si no, cae a macOS `say` (voz
  Paulina es-MX). Un `.wav` por línea; su duración se mide con `ffprobe`.
- **Sincronía audio↔video**: `Narrator.t0` se fija al crear la page (inicio del video); cada
  `say()` registra el offset (ms desde `t0`). `muxVideo()` coloca cada clip con `adelay` y
  los mezcla con `amix=normalize=0`, luego muxea con el video. El cartel se hornea en vivo en
  el webm; el audio se pega después por offset. **El webm de Playwright corre ~2-3% más lento
  que el reloj `Date.now`**, así que sin corregir el audio se **adelanta** a los subtítulos en
  la 2ª mitad (drift creciente). Fix: el record script mide `webmDuration` (ffprobe) y el reloj
  total (`nar.elapsedMs`), calcula `computeSyncScale()` y lo pasa como `syncScale` a `muxVideo()`
  (escala cada offset). Ajuste fino extra: `SYNC_OFFSET_MS`.
- **ffmpeg de Homebrew** (`/opt/homebrew/bin/ffmpeg`): tiene H.264/AAC; el de Playwright NO.
  Rutas por `FFMPEG`/`FFPROBE` en `.env`.

## Secretos y configuración (`.env`)

`apps/web/e2e/demo/.env` es **gitignoreado**; hay `.env.example` committeable. Lo carga un
mini-parser en `demo-lib.mjs` (`loadEnv()`), sin dependencia `dotenv` (no está en `web`).

```bash
cp apps/web/e2e/demo/.env.example apps/web/e2e/demo/.env   # completá DEEPGRAM_API_KEY
```

Variables: `DEEPGRAM_API_KEY` (vacío → `say`), `DEEPGRAM_VOICE` (default `aura-2-celeste-es`;
alternativas es-LATAM: `aura-2-selena-es`, `aura-2-estrella-es`, `aura-2-javier-es`),
`FFMPEG`/`FFPROBE`, `DEMO_BASE_URL`, `DEMO_EMAIL`/`DEMO_PASSWORD` (credenciales locales
`leonardo.bolanos@gmail.com` / `123456`). NUNCA escribas la key en el código ni la imprimas.

## Narración: idioma y registro

- Español **de tuteo** ("tú": tocas, eliges, marcas), no voseo.
- Frases cortas (< ~25 palabras) — TTS más limpio y el cartel entra en una o dos líneas.
- El cartel = el texto narrado (funciona de subtítulo). Un beat por acción visible.

## Trampas conocidas de emaús (ganadas a pulso)

- **`@playwright/test` es CommonJS**: `import pw from '@playwright/test'; const { chromium } = pw;`.
  `import { chromium } from '@playwright/test'` falla con *"Named export not found"*.
- **Login robusto vs idioma del botón**: rellená `#email`/`#password` y `press('#password','Enter')`
  (los inputs tienen `@keyup.enter`). El texto del botón ("Iniciar"/"Sign in") cambia con el locale
  y `has-text("Iniciar")` puede timear.
- **reka-ui**: el `Checkbox` renderiza `button[role="checkbox"][data-state="checked|unchecked"]`
  (usa ese selector, no `input`). Los pickers inline (`PreRetreatTaskAssignInline`) disparan en
  `@mousedown.prevent` — el `.click()` de Playwright lo cubre. Para que el picker se vea DURANTE la
  narración: abrir → `nar.say()` → recién entonces elegir la opción.
- **Escenas con navegación** (`page.goto`): narrá DESPUÉS del goto (el reload borra el cartel) y
  **esperá a que el contenido cargue** (p.ej. `getByText('Buscar parroquia').waitFor()`), no solo
  un `waitForTimeout` fijo — si narras sobre "Updating permissions…" la escena sale vacía.
- **El botón de ayuda/chat** vive abajo a la derecha; el cartel va centrado abajo → no chocan a 1280px.
- **Login flakea tras muchas corridas** (reCAPTCHA / rate-limit): logueá con **reintentos**
  (`loginRobust`, 3 intentos con backoff). Si sigue fallando, **esperá el cooldown** — NO
  martilles el login (riesgo de bloquear la cuenta). Cada script que loguea debe reintentar.
- **Vistas sin `data-testid`** (p.ej. Minuto a Minuto): usá selectores por texto/`aria`/`id`
  (`input[placeholder*="…"]`, `button[aria-haspopup="menu"]`, `[id^="schedule-item-"]`,
  `[role="menuitem"]:has-text("…")`). Los controles hover-only (▶ ✓ −5 +5) aparecen al
  `hover()` o cuando el item está `active`.
- **Re-mux del video**: si re-muxeas un `.webm` ya grabado, elegí el archivo por **mtime
  (el más nuevo)**, NO por orden alfabético (los nombres son hex aleatorios → `.sort().pop()`
  puede agarrar el webm de OTRA feature y pegarle el audio equivocado).

## ⚠️ Datos de la demo: NUNCA backup/restore de sqlite por CLI (CRITICAL)

La grabación **muta la DB** (marca una tarea, asigna un responsable). Es tentador
"respaldar y restaurar" la tabla con `sqlite3` alrededor de la toma. **NO lo hagas.**

Incidente 2026-07-03: un wrapper hizo `sqlite3 DB ".mode insert" "SELECT …"` (el CLI **ignora
el 2º argumento** → backup con 0 INSERTs) y luego un `.read` con `DELETE FROM …`. Peor: operar
`sqlite3` (checkpoint/DELETE) contra la **DB viva en WAL** mientras el API la tiene abierta
provoca **divergencia de inodos** (el API queda con un archivo des-enlazado; el CLI ve otro) y
se perdieron las 72 tareas de Celaya en dev. Recuperación: liberar el inodo divergente
reiniciando el API (`make dev`) y **re-materializar** desde el template.

**Regla**: para dejar la DB intacta, resetear **por el API** (endpoint materialize "Reemplazar
todo", determinista desde `retreat.startDate`), no por sqlite. Patrón del wrapper:
`reset-tasks.mjs` (poblar limpio) → grabar → `reset-tasks.mjs` (revertir la toma). Ver también
el skill **`db-production-resilience`** (WAL, locks, `.backup` vs `cp`).

## Verificación (obligatoria antes de entregar)

```bash
FF=/opt/homebrew/bin/ffmpeg; V=apps/web/e2e/demo/output/<archivo>.mp4
"$FF" -i "$V" 2>&1 | grep -E "Duration|Stream"                       # duración + streams
"$FF" -ss <seg> -i "$V" -frames:v 1 /tmp/chrome/frame.png -y         # frame en un offset (leé la imagen)
"$FF" -i "$V" -af volumedetect -f null /dev/null 2>&1 | grep mean    # voz ~ -16/-18 dB, no silencio
```

## Tests de los helpers puros

Los helpers deterministas de `demo-lib.mjs` (`computeSyncScale`, `buildYoutubeChapters`,
`writeVideoMeta`) tienen tests con el runner nativo de Node en `demo-lib.test.mjs`. NO son
Vitest (estos scripts viven fuera de `src/`, lo único que Vitest escanea):

```bash
pnpm --filter web test:demo      # node --test e2e/demo/*.test.mjs
```

Si tocas esos helpers, corré el test. Doc humano de la feature: `docs/features/demo-videos.md`.
