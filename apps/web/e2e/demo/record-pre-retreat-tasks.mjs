// Video-demo narrado de la feature "Tareas Pre-Retiro".
//
// Conduce la app REAL (Chromium visible) sobre el retiro de demo, con subtítulos
// sobre-impuestos + narración TTS (Deepgram Aura-2 → fallback macOS `say`) y produce
// un MP4 (H.264 + AAC).
//
//   cd apps/web && node e2e/demo/record-pre-retreat-tasks.mjs
//
// Requiere dev arriba (web 5173 + API 3084) y apps/web/e2e/demo/.env con la key.
// Las interacciones que mutan (marcar tareas, asignar) se RESTAURAN por el wrapper
// run-pre-retreat-tasks.sh (backup/restore de la tabla). Este script solo graba.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv,
  ensureOutputDir,
  genTts,
  OVERLAY_INIT,
  Narrator,
  muxVideo,
  computeSyncScale,
  audioDuration,
  buildYoutubeChapters,
  writeVideoMeta,
  OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '96f06c40-327a-4513-ae48-fb4c60bbab17'; // Celaya
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0; // ajustar tras verificar frames si audio↔video se desfasa

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'intro', text: 'Te presento las Tareas Pre-Retiro: el checklist de qué hacer y cuándo antes de cada retiro.' },
  { id: 'grouped', text: 'Todo lo que hay que preparar aparece agrupado por cuánto falta: desde cuatro meses antes hasta dos días antes.' },
  { id: 'counters', text: 'Arriba llevas el pulso del retiro: cuántas van listas, cuántas están vencidas y cuántas siguen sin asignar.' },
  { id: 'semaphore', text: 'Cada tarea trae su semáforo: roja si venció, ámbar si es esta semana y verde cuando la terminas.' },
  { id: 'hoy', text: 'Esta línea marca el día de hoy. Arriba lo que ya venció; abajo, lo que viene.' },
  { id: 'subtasks', text: 'Una tarea puede tener sub-tareas, y cada una lleva su propio avance.' },
  { id: 'cascade', text: 'Al marcar la última sub-tarea, la tarea principal se completa sola. Todo queda en sincronía.' },
  { id: 'assign', text: '¿Sin asignar? Tocas el nombre y eliges al servidor responsable en un instante.' },
  { id: 'filters', text: 'Filtras por pendientes, vencidas o listas para enfocarte en lo urgente.' },
  { id: 'search', text: 'Y buscas cualquier tarea, responsable o nota al instante.' },
  { id: 'export', text: 'Con un clic exportas todo a Excel para compartirlo con tu equipo.' },
  { id: 'import', text: 'Todo nace de un template: lo importas y las fechas se calculan solas desde la fecha del retiro.' },
  { id: 'template', text: 'Y desde Configuración editas ese template maestro que usarán todos los retiros futuros.' },
  { id: 'outro', text: 'Tareas Pre-Retiro: nada se te olvida y todo el equipo sabe qué toca y cuándo.' },
];

// ── Metadata para YouTube (upload-to-youtube.mjs la lee del .meta.json) ───────
const YT_TITLE = 'Tareas Pre-Retiro — checklist de qué hacer y cuándo | Emaús';
const YT_DESCRIPTION = [
  'Recorrido por las Tareas Pre-Retiro de Emaús: el checklist de logística que',
  'reemplaza la hoja en papel. Verás cómo se agrupan por cuánto falta, el semáforo',
  'de vencimiento, asignar responsables, sub-tareas en cascada, filtros, búsqueda,',
  'exportar a Excel e importar desde el template maestro.',
].join(' ');
const YT_TAGS = ['Emaús', 'retiro', 'tareas pre-retiro', 'checklist', 'logística', 'tutorial'];
// Etiquetas cortas de capítulo por id de línea (el timeline decide cuáles entran).
const CHAPTER_LABELS = {
  intro: 'Qué son las Tareas Pre-Retiro',
  grouped: 'Agrupadas por cuánto falta',
  counters: 'Contadores del retiro',
  semaphore: 'Semáforo de vencimiento',
  hoy: 'La línea de hoy',
  subtasks: 'Sub-tareas',
  cascade: 'Completado en cascada',
  assign: 'Asignar responsable',
  filters: 'Filtros',
  search: 'Búsqueda',
  export: 'Exportar a Excel',
  import: 'Importar desde template',
  template: 'Editar el template maestro',
  outro: 'Cierre',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

async function main() {
  ensureOutputDir();

  // 1) Pre-generar TTS (para conocer duraciones y sincronizar en la grabación).
  log('🎙️  Generando narración TTS…');
  const clips = {};
  for (const l of LINES) {
    clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };
    log(`   · ${l.id} → ${clips[l.id].duration.toFixed(1)}s`);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 55 });

  // 2) Login sin grabar → storageState (así el video arranca ya autenticado).
  log('🔐 Login…');
  const auth = await browser.newContext({ viewport: { width: W, height: H } });
  const ap = await auth.newPage();
  await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
  await ap.fill('#email', cfg.email);
  await ap.fill('#password', cfg.password);
  await ap.locator('button:has-text("Iniciar")').first().click();
  await ap.waitForURL(/\/app/, { timeout: 20000 });
  await ap.waitForTimeout(1500);
  const state = await auth.storageState();
  await auth.close();

  // 3) Contexto de grabación (autenticado).
  const ctx = await browser.newContext({
    storageState: state,
    viewport: { width: W, height: H },
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(OVERLAY_INIT);
  const page = await ctx.newPage();
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start(); // t0 = inicio del video (referencia para los offsets de audio)

  try {
    // Cargar la vista de Tareas Pre-Retiro.
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/tareas-pre-retiro`, {
      waitUntil: 'networkidle',
    });
    await page.waitForSelector('[data-testid^="task-"]', { timeout: 15000 });
    await sleep(page, 1400);

    // ── intro / grouped ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await nar.say(clips.intro);
    await nar.say(clips.grouped);

    // ── counters ──
    await nar.cueAt(675, 70);
    await nar.say(clips.counters);

    // ── semaphore (badge de la 2ª tarjeta: "Vencida") ──
    await nar.cueAt(618, 379);
    await nar.say(clips.semaphore);

    // ── hoy (marcador) ──
    await page.locator('[data-testid="today-marker"]').scrollIntoViewIfNeeded();
    await sleep(page, 700);
    await nar.say(clips.hoy);

    // ── subtasks (expandir un padre con hijos) ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 500);
    const expand = page.locator('button[aria-label="Expandir"]').first();
    await expand.scrollIntoViewIfNeeded();
    await sleep(page, 400);
    await expand.click();
    await sleep(page, 900);
    await nar.say(clips.subtasks);

    // ── cascade (marcar la sub-tarea pendiente → el padre se completa) ──
    const childBox = page.locator('.pl-10 button[role="checkbox"][data-state="unchecked"]').first();
    if (await childBox.count()) {
      await childBox.scrollIntoViewIfNeeded();
      await sleep(page, 400);
      await childBox.click();
      await sleep(page, 1100);
    }
    await nar.say(clips.cascade);

    // Colapsar el padre para que el picker caiga sobre una tarea limpia.
    const collapse = page.locator('button[aria-label="Colapsar"]').first();
    if (await collapse.count()) {
      await collapse.click();
      await sleep(page, 500);
    }
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 400);

    // ── assign (chip "Sin asignar" → picker VISIBLE durante la narración) ──
    const chip = page.getByRole('button', { name: /Sin asignar/ }).first();
    if (await chip.count()) {
      await chip.scrollIntoViewIfNeeded();
      await sleep(page, 400);
      await chip.click();
      await sleep(page, 700);
      await nar.say(clips.assign); // el picker queda abierto mientras se narra
      const panel = page.locator('div:has(> input[placeholder="Buscar servidor…"])').first();
      const opt = panel.locator('div button').first(); // primer servidor de la lista
      if (await opt.count()) {
        await opt.click();
        await sleep(page, 1000);
      } else {
        await page.keyboard.press('Escape');
      }
    } else {
      await nar.say(clips.assign);
    }

    // ── filters ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 400);
    await page.locator('[data-testid="filter-overdue"]').click();
    await sleep(page, 1000);
    await nar.say(clips.filters);
    await page.locator('[data-testid="filter-all"]').click();
    await sleep(page, 500);

    // ── search ──
    const search = page.getByPlaceholder('Buscar tarea, responsable o nota…');
    await search.click();
    await search.pressSequentially('flores', { delay: 90 });
    await sleep(page, 1000);
    await nar.say(clips.search);
    await search.fill('');
    await sleep(page, 400);

    // ── export (cue sin click, para no abrir la barra de descargas) ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    await nar.cueAt(884, 34);
    await nar.say(clips.export);

    // ── import (abrir dialog, narrar, cancelar) ──
    await page.locator('[data-testid="import-template"]').click();
    await sleep(page, 900);
    await nar.say(clips.import);
    await page.locator('button:has-text("Cancelar")').first().click();
    await sleep(page, 600);

    // ── template global (Configuración) ──
    await page.goto(`${cfg.baseUrl}/app/settings/pre-retreat-task-template`, {
      waitUntil: 'networkidle',
    });
    // Esperar a que el template cargue (evita el estado "Updating permissions…").
    await page
      .getByText('Buscar parroquia')
      .first()
      .waitFor({ timeout: 12000 })
      .catch(() => {});
    await page.waitForTimeout(1400);
    await nar.say(clips.template);

    // ── outro ──
    await nar.say(clips.outro);
    await sleep(page, 1400);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error.png') }).catch(() => {});
  }

  // 4) Cerrar contexto → finaliza el .webm.
  const wallMs = nar.elapsedMs; // reloj total (para la escala de sincronía)
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  // 5) Mux: video + clips a sus offsets → MP4. El webm corre ~2-3% más lento que
  //    el reloj → escalar offsets para realinear audio↔video.
  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);
  const out = path.join(OUTPUT_DIR, 'tareas-pre-retiro-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  log('✅ Listo:', out);

  // 6) Metadata para YouTube (título, descripción, tags y capítulos del timeline).
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  const metaPath = writeVideoMeta(out, {
    title: YT_TITLE,
    description: YT_DESCRIPTION,
    tags: YT_TAGS,
    chapters,
  });
  log('📝 Metadata:', metaPath, `(${chapters.length} capítulos)`);
  log('   Subir:  node e2e/demo/upload-to-youtube.mjs', path.relative(process.cwd(), out));

  // Timeline para depurar sincronía (offsets en seg).
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
