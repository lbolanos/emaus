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
   imperativas reutilizando `demo-lib.mjs`. **Para features de `/app`: mostrá dónde vive en el
   sidebar** (resaltá el ítem del menú con `nar.cueAt(...)`/hover y narrá la ruta, p.ej. "Logística →
   Tareas Pre-Retiro") ANTES de entrar a la vista — no entres solo por `page.goto(url)`. Los usuarios
   necesitan saber dónde hacer clic. (No aplica a vistas públicas sin sidebar: login, registro.)
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

## Lecciones aprendidas grabando vistas de `/app` (sesión 2026-07-06)

- **`page.setDefaultTimeout(6000)` SIEMPRE en videos con interacciones opcionales.** Un `.click()`
  a un selector ausente espera 30 s por defecto → un solo fallo mete un **hueco de 30 s** de silencio.
  Con muchos `.catch(()=>{})`, varios fallos apilan minutos muertos (un video salió de 6 min). Con
  default 6 s, cualquier fallo es un blip. Poné timeouts explícitos solo en los waits legítimos largos
  (carga de vista, apertura de modal).
- **La voz "demora en iniciar" = inicio muerto.** El webm graba la carga/login/navegación antes de
  la 1ª narración. `muxVideo` ahora **auto-recorta** ese inicio (`leadKeepMs`, arranca ~0.7 s antes de
  la 1ª voz). Consecuencia: la 1ª narración es el ancla del recorte; **los clics que quieras conservar
  deben ir DESPUÉS de la 1ª `say`** (lo anterior se recorta). Verificá offsets del video = `timeline − recorte`.
- **Muchas vistas de `/app` renderizan EN BLANCO con `page.goto` directo** (el SPA necesita el retiro
  seleccionado por la UI). Renderizan bien por goto: `role-management`, y las de config global
  (`/app/houses`, `requiresRetreat:false`). Para las demás: navegá dentro del SPA o usá una que sí renderice.
- **Idioma**: forzá español con `ctx.addInitScript(() => localStorage.setItem('preferred-locale','es'))`
  + `newContext({ locale:'es-MX' })`. Varias vistas (recuperar contraseña, roles) tenían inglés hardcoded.
- **Sidebar colapsable**: para revelar un ítem de una sección, clic en el `<button>` del encabezado de
  `SidebarSection` (no el `<span>` de texto — Playwright lo cree "visible" pero no togglea). La sección
  activa auto-expande en su propia página; en otras hay que expandirla. Señalá con `boundingBox` dinámico.
- **Menús ⋮ del mapa de camas por índice** (mapealos con una exploración: 1=acciones globales, 2=piso,
  3=habitación, 4=cama). Las mutaciones (agregar cama/hab) **corren los índices posteriores** → reusá solo
  índices estables (el ⋮ global) o hacé las mutaciones al final.
- **PII en el fondo**: si la pantalla (o el fondo de un modal) muestra datos reales (correos/nombres de
  usuarios), **enmascaralos interceptando el endpoint** con `page.route('**/…', route => { …reescribir JSON… })`
  antes de grabar público. Patrón en `record-role-management.mjs` / `record-create-retreat.mjs`.
- **No mutar**: mostrá formularios y **Cancelá** (no envíes); los cambios locales del mapa/lote se ven sin
  guardar. Señalá "Guardar" sin clicarlo.
- **Google Places (crear casa) no se automatiza** (web component, shadow DOM: las sugerencias aparecen
  pero no se clican fiable, y el modal no cierra con Escape). Para mostrar el formulario de casa usá
  **"Editar"** (mismo modal, dirección ya válida) → así hasta se puede pasar de paso con "Siguiente".
- **Features gated**: p.ej. "Agregar Camas en Lote" solo aparece en casa **vacía**; el paso 2 del modal
  ("Capacidad y Camas") solo avanza si la dirección es válida (usá una casa con dirección real). Planeá
  el estado/registro antes de grabar.
- **Confirmá antes de subir** cada video (ver skill `youtube-publishing`) y **mostrá la ubicación en el
  sidebar** de la feature al inicio.

## Lecciones aprendidas (sesión 2026-07-08): datos reales + carga + rutas

- **Preferí un retiro REAL COMPLETO + enmascarar nombres, sobre fabricar datos.** El retiro
  **San Agustín** (`RETREAT_ID=4c8173c9-a068-4efe-a936-e3618523bead`) tiene TODO poblado
  (responsabilidades asignadas, equipos con líder/miembros, MAM materializado con apoyos, Mi
  Agenda del admin, palancas solicitadas/recibidas). **Celaya** (`96f06c40-…`) está casi vacío
  (equipos sin miembros, MAM con 0 items, agenda vacía) → obliga a fabricar. Para un video
  creíble, usá San Agustín y enmascará PII.
- **Enmascarado de nombres (`maskNode` recursivo + `fakeFor` determinista por id):** interceptá
  con `page.route` los GET que traen participantes (`**/responsibilities**`, `**/participants**`,
  `**/service-teams**`, `**/schedule/retreats/**`, `**/sequences**`), parseá JSON, reemplazá
  `firstName/lastName/nickname/displayName/email` por fakes estables (mismo id → mismo nombre).
  ⚠️ **Nombres embebidos en strings `label`** ("Palanquero 1 (Nombre Real)" de
  `/responsibilities/palanquero-options`) NO se cubren con firstName/lastName → agregá un handler
  regex `/^(Palanquero \d+)\s*\((.+)\)$/`. **Verificá por frames que NO filtra PII antes de subir.**
- **Cuando el dato está vacío → sandbox por interceptación**: GET devuelve fakes y se FABRICA la
  respuesta de las escrituras (POST) echando el objeto actualizado (patrón del video de Mesas:
  `assign walker/leader` → devolver la mesa con el participante agregado; el front actualiza su
  estado desde la respuesta, sin tocar la BD).
- **La carga del sistema arruina la grabación headed (CRÍTICO).** Con la sesión larga, **iTerm
  llega a ~60% CPU** (re-render del scrollback) y hambrea el renderer del navegador → el
  `page.evaluate` de la narración se **cuelga 1-3 min** → tramos muertos enormes (el video de
  Mesas tardó 8 intentos). Fix: grabar con el equipo tranquilo (`uptime` load ≲ 4), minimizar tu
  propio output (no leer imágenes/logs de más), y NO correr monitores/probes en paralelo a la
  grabación. Con load bajo el 1er intento sale limpio.
- **`page.setDefaultNavigationTimeout(30000)` aparte de `setDefaultTimeout(6000)`**: si dejás que
  `goto`/`networkidle` herede los 6s de acciones, la navegación timea bajo carga y aborta.
- **Blindá TODO `waitFor`/`click` con `.catch(() => {})`.** Un `waitFor` sin catch (ruta
  equivocada → texto que no aparece) lanza y **aborta la grabación entera**, perdés todos los
  beats siguientes (incidente palancas: usé `/app/message-sequences` en vez de
  `/app/settings/message-sequences`).
- **Rutas de `/app`**: `/app/<name>` para `walkers`, `palancas`, `service-teams`, `my-schedule`;
  `/app/retreats/:id/<name>` para `responsibilities`, `minuto-a-minuto`; y
  `/app/settings/message-templates|message-sequences`. Navegar a un `/app/retreats/:id/…`
  **selecciona ese retiro** para las rutas sin `:id` (así fijás San Agustín).
- **reka-ui submenú (`DropdownMenuSub`)**: abrir por `hover` es poco fiable en headed + `hasTouch`,
  y `click` en el subtrigger a veces no es accionable. Preferí beats que NO dependan del submenú
  (señalar el trigger y narrar dónde vive), o abrí con reintento y verificá por frames.
- **`button[aria-haspopup="menu"]` colisiona con el menú de usuario del sidebar (video Recepción).**
  El dropdown de cuenta del sidebar Y cualquier `DropdownMenu` de la página renderizan ambos
  `aria-haspopup="menu"`; `.first()` agarra el del sidebar (aparece antes en el DOM) → abrís el
  menú equivocado y el cartel narra sobre algo que no se ve. Fix: **acotá el selector al contenido
  de la página**, p.ej. `.no-print button[aria-haspopup="menu"]` (el header de Gafetes) o el
  contenedor de la sección. **Verificá por frame que abrió el menú correcto.**
- **Un retiro 100%-completo NO puede demostrar progreso parcial → floja el estado en el interceptor.**
  San Agustín tiene recepción al 100% de llegadas y 38/38 bolsas hechas: no hay "pendiente" que
  buscar/cobrar/marcar. Para el video de Recepción: (1) **fabricá el payload de stats**
  (`GET /participants/reception/:id`) con una lista de pendientes de pago/beca controlados; (2) en
  el mismo handler de enmascarado del `GET /participants`, **voltéa `bagMade=false` en ~40%** de los
  caminantes para que marcar una bolsa suba el avance visiblemente. Interceptá las escrituras
  (`PUT …/checkin`, `POST /payments`, `PATCH …/bag-made`) para no mutar la BD; hacé el interceptor
  **con estado** (mover de pendientes→llegados, fijar `totalPaid`) para que el `fetchStats` posterior
  refleje el cambio. Referencia: `record-reception.mjs`.
- **Los patrones de `page.route` de API DEBEN prefijarse con `**/api/` (video Camas, CRÍTICO).** Un
  patrón "a secas" como `**/retreats/*/bed-assignments` **también matchea la URL de la PÁGINA SPA**
  (`/app/retreats/:id/bed-assignments`) → interceptás la **navegación del documento** y la respondés
  con tu JSON mock (`{"ok":true}`) → **página en blanco** (y todos los `waitFor` timean 6s → huecos
  enormes). El síntoma en frames es la página vacía mostrando tu propio body de mock. Fix: prefijá
  **todas** las rutas de API con `**/api/…` (las llamadas del front van por `/api/…`; las navegaciones
  por `/app/…`). Ojo: reception usó `**/participants**` sin `/api/` y funcionó solo porque ninguna
  página SPA contiene "participants" — no te confíes.
- **`button[aria-haspopup="menu"]` se duplica por responsive.** Muchas vistas renderizan el MISMO ⋮
  dos veces (header desktop `hidden sm:block` + barra móvil `md:hidden`); a 1280px el móvil está
  OCULTO pero sigue en el DOM, así que `.last()` lo agarra y el click no abre nada. Sumado al menú
  de usuario del sidebar (también `aria-haspopup="menu"`), usá **`button[aria-haspopup="menu"]:visible`**
  y `.last()`, y **verificá por frame** que el menú abrió (referencia: `record-bed-assignments.mjs`).

## Tour de onboarding: resaltar el ítem exacto del menú + editar el mp4 (sesión 2026-07-08, `record-tour.mjs`)

- **Sync desincronizado AL INICIO = narrás sobre una pantalla a medio cargar.** `domcontentloaded`
  dispara ANTES de que se pinte el contenido servido por fetch (enmascarado). Fix: tras `goto`,
  `await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(()=>{})` **antes** del primer
  `say` de esa pantalla. (El `computeSyncScale` global NO corrige un beat que arrancó sobre un loader.)
- **Resaltar el ÍTEM exacto del sidebar (no solo la sección).** El sidebar es **acordeón anidado**:
  grupo `RETIRO` → sub-secciones (`Logística`, `Personas`, `Asignaciones`, `Comunicaciones`,
  `Reportes`, `Administración`) → ítems; y grupo `Configuración Global` con ítems directos (`Casas`…).
  Tras navegar, las **sub-secciones vienen COLAPSADAS** (el `<a>` del ítem existe en el DOM pero está
  clipeado → `boundingBox` da una posición fuera de vista → el cue no se ve). Receta: **expandí la
  cadena de ancestros** (`['Retiro', subSección]` o `['Configuración Global']`) con un helper que
  clica el header **solo si `aria-expanded !== 'true'`** (todos los headers exponen `aria-expanded`;
  clicar uno ya abierto lo cierra). Luego cue al ítem exacto: `getByRole('link', { name: /^Ítem/i })`
  **anclado al inicio** para no confundir `Inventario` con `Artículos de Inventario` ni `Minuto a
  Minuto` con `Template Minuto a Minuto`.
- **NUNCA clic en el encabezado de GRUPO `Retiro` para llegar a un botón (p.ej. el "+").** Clicarlo
  **colapsa TODO el grupo RETIRO** y queda así el resto del video → todos los ítems de retiro
  desaparecen y sus resaltados se rompen. Verificá por frames que RETIRO sigue expandido en beats tardíos.
- **Abrí los modales con `el.click()` vía DOM, no con `.click()` de puntero.** Expandir
  `Configuración Global` deja su contenedor scrollable **interceptando el clic** del "+"/"Editar" del
  grupo RETIRO — y esa expansión **persiste en localStorage aun tras recargar** (`goto` no la resetea),
  así que ni recargar ni `force:true` abren el modal. `await locator.evaluate(el => el.click())`
  dispara el handler Vue ignorando la intercepción de puntero. (Confirmá con `[role="dialog"]` count.)
- **Enmascarar PII más allá de nombres/correos/fotos: TELÉFONOS.** El campo real es `cellPhone`
  (camelCase) — una lista de claves en minúsculas NO lo atrapa. Matcheá las claves por regex
  case-insensitive (`/phone|celular|tel[eé]fono|whatsapp/i`) y reemplazá por un número ficticio
  determinista. Encontrado en Recepción, donde el nombre estaba fake pero el teléfono era real.
- **Editar el mp4 final (recortar tramos) con ffmpeg — video+audio JUNTOS o se descuadra el sync.**
  El audio está horneado por offset; cortá ambos streams en los mismos puntos:
  `trim`/`atrim` + `concat=n=2:v=1:a=1` (un solo re-encode libx264/aac). **Cortá solo en el silencio
  entre beats** (`volumedetect` del tramo debe dar ~-91 dB) para no partir una frase; verificá los
  frames de ambos bordes de la costura. **Tras cortar, regenerá los capítulos**: los offsets de las
  narraciones posteriores al corte se corren por la duración eliminada. La posición REAL en el mp4 =
  `offsetReloj * syncScale - leadTrim` (los capítulos del `.meta.json` usan offset de reloj crudo →
  van ~`leadTrim` adelantados incluso sin cortar); restale la duración del corte a los beats que caen
  después, y reescribí `<video>.meta.json` con `buildYoutubeChapters` + `writeVideoMeta`.

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
