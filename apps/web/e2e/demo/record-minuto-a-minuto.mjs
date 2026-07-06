// Video-demo narrado de la feature "Minuto a Minuto" (agenda del retiro en tiempo real).
//
// Conduce la app REAL (Chromium visible) sobre el retiro de demo (Celaya, con agenda
// materializada con baseDate=hoy → aparece la línea "AHORA"), con subtítulos + narración
// TTS (Deepgram Aura-2 → fallback macOS `say`) y produce un MP4 (H.264 + AAC) + metadata
// para YouTube.
//
//   cd apps/web && node e2e/demo/record-minuto-a-minuto.mjs
//
// Requiere dev arriba (web 5173 + API 3084) y .env con la key. La agenda de demo se crea
// y se borra con el wrapper run-minuto-a-minuto.sh (mam-fixture.mjs), por el API.

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
const RETREAT = process.env.RETREAT_ID || '96f06c40-327a-4513-ae48-fb4c60bbab17'; // Celaya (agenda de demo)
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0;
// Overlay con el brand de esta feature (reusa el init de demo-lib cambiando el rótulo).
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Minuto a Minuto');

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'intro', text: 'Este es el Minuto a Minuto: la agenda completa del retiro, coordinada al segundo.' },
  { id: 'realtime', text: 'Corre en tiempo real por WebSocket: cuando algo cambia, todos los coordinadores lo ven al instante.' },
  { id: 'ahora', text: 'La línea de AHORA marca dónde va el retiro: arriba lo que ya pasó, abajo lo que sigue.' },
  { id: 'structure', text: 'Todo se organiza por día, con la hora exacta, la duración y cuánto falta para cada actividad.' },
  { id: 'types', text: 'Cada actividad lleva su tipo por color: charla, misa, comida, dinámica u oración.' },
  { id: 'responsables', text: 'Y su responsable con su equipo; si falta alguien, lo marca como sin asignar.' },
  { id: 'live', text: 'Durante el retiro inicias y completas cada actividad, o la mueves cinco minutos si algo se atrasa.' },
  { id: 'gaps', text: 'El sistema avisa de huecos y solapes entre actividades, y los cierra con un clic.' },
  { id: 'search', text: 'Buscas cualquier actividad, hora o responsable al instante.' },
  { id: 'edit', text: 'Tocas una actividad para editar su hora, su duración o su responsable.' },
  { id: 'group', text: 'O cambias la vista para verla por equipo responsable, no solo por hora.' },
  { id: 'more', text: 'Desde aquí tocas la campana, imprimes la agenda o la proyectas en pantalla grande para el salón.' },
  { id: 'import', text: 'Todo nace de un template por país; lo importas y se calcula desde la fecha del retiro.' },
  { id: 'template', text: 'Y desde Configuración editas ese template maestro que reutilizan todos los retiros.' },
  { id: 'outro', text: 'Minuto a Minuto: el retiro entero sincronizado, y cada servidor sabe justo cuándo le toca.' },
];

const CHAPTER_LABELS = {
  intro: 'Intro', realtime: 'Tiempo real', ahora: 'Línea AHORA', structure: 'Agenda por día',
  types: 'Tipos por color', responsables: 'Responsables', live: 'Iniciar y completar',
  gaps: 'Huecos y solapes', search: 'Búsqueda', edit: 'Editar actividad', group: 'Vista por equipo',
  more: 'Más acciones', import: 'Importar template', template: 'Template global', outro: 'Cierre',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
const MAM = (id) => `${cfg.baseUrl}/app/retreats/${RETREAT}/minuto-a-minuto`;

async function main() {
  ensureOutputDir();

  log('🎙️  Generando narración TTS…');
  const clips = {};
  for (const l of LINES) {
    clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };
    log(`   · ${l.id} → ${clips[l.id].duration.toFixed(1)}s`);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 55 });

  log('🔐 Login…');
  let state;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const auth = await browser.newContext({ viewport: { width: W, height: H } });
    const ap = await auth.newPage();
    try {
      await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
      await ap.fill('#email', cfg.email);
      await ap.fill('#password', cfg.password);
      await ap.press('#password', 'Enter'); // robusto vs idioma del botón
      await ap.waitForURL(/\/app/, { timeout: 15000 });
      await ap.waitForTimeout(1500);
      state = await auth.storageState();
      await auth.close();
      break;
    } catch (e) {
      await auth.close();
      if (attempt === 3) throw e;
      log(`   login reintento ${attempt}…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const ctx = await browser.newContext({
    storageState: state,
    viewport: { width: W, height: H },
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const openMore = async () => {
    await page.locator('button[aria-haspopup="menu"]').last().click();
    await sleep(page, 500);
  };
  const clickMenuItem = async (text) =>
    page.locator(`[role="menuitem"]:has-text("${text}")`).first().click();

  try {
    await page.goto(MAM(), { waitUntil: 'networkidle' });
    await page.waitForSelector('[id^="schedule-item-"]', { timeout: 15000 });
    await sleep(page, 1400);

    // ── intro ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await nar.say(clips.intro);

    // ── realtime (indicador WS) ──
    await nar.cueAt(300, 96);
    await nar.say(clips.realtime);

    // ── ahora (línea "AHORA") ──
    await page.locator('text=AHORA').first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 600);
    await nar.say(clips.ahora);

    // ── structure (día + horas) ──
    await page.evaluate(() => window.scrollBy(0, 120));
    await nar.say(clips.structure);

    // ── types (badges de color) ──
    await page.evaluate(() => window.scrollBy(0, 300));
    await sleep(page, 400);
    await nar.say(clips.types);

    // ── responsables ──
    await page.evaluate(() => window.scrollBy(0, 300));
    await sleep(page, 400);
    await nar.say(clips.responsables);

    // ── live (iniciar → completar una actividad) ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 400);
    const firstRow = page.locator('[id^="schedule-item-"]').first();
    await firstRow.scrollIntoViewIfNeeded();
    await firstRow.hover();
    await sleep(page, 500);
    const startBtn = firstRow.locator('button[title*="Iniciar"]');
    if (await startBtn.count()) {
      await startBtn.click();
      await sleep(page, 1200);
    }
    await nar.say(clips.live); // en estado "active" los controles quedan visibles
    const completeBtn = firstRow.locator('button[title="Completar"]');
    if (await completeBtn.count()) {
      await completeBtn.click();
      await sleep(page, 1200);
    }

    // ── gaps (hueco / solape) ──
    const gap = page.locator('text=/Hueco de|Se encima/').first();
    if (await gap.count()) {
      await gap.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(page, 500);
    }
    await nar.say(clips.gaps);

    // ── search ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    const search = page.locator('input[placeholder*="Buscar por hora"]');
    await search.click();
    await search.pressSequentially('misa', { delay: 90 });
    await sleep(page, 1100);
    await nar.say(clips.search);
    await search.fill('');
    await sleep(page, 400);

    // ── edit (abrir modal → cancelar) ──
    const editRow = page.locator('[id^="schedule-item-"]').nth(3);
    await editRow.scrollIntoViewIfNeeded();
    await sleep(page, 300);
    await editRow.locator('span.font-medium').first().click();
    await sleep(page, 900);
    await nar.say(clips.edit);
    await page.locator('button:has-text("Cancelar")').first().click().catch(() => {});
    await sleep(page, 500);

    // ── group (vista por responsabilidad → restaurar por día) ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await openMore();
    await clickMenuItem('Agrupar por responsabilidad');
    await sleep(page, 1000);
    await nar.say(clips.group);
    await openMore();
    await clickMenuItem('Agrupar por día');
    await sleep(page, 600);

    // ── more (menú de acciones abierto) ──
    await openMore();
    await nar.say(clips.more);
    await page.locator('h1').first().click().catch(() => {}); // cerrar el menú (click fuera)
    await sleep(page, 400);

    // ── import (dialog → cancelar) ──
    await openMore();
    await clickMenuItem('Importar desde template');
    await sleep(page, 900);
    await nar.say(clips.import);
    await page.locator('button:has-text("Cancelar")').first().click().catch(() => {});
    await sleep(page, 500);

    // ── template global (Configuración) ──
    await page.goto(`${cfg.baseUrl}/app/settings/schedule-template`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2600);
    await nar.say(clips.template);

    // ── outro ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await nar.say(clips.outro);
    await sleep(page, 1400);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-mam.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs; // reloj total (para la escala de sincronía)
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  // El webm corre ~2-3% más lento que el reloj → escalar offsets para realinear.
  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'minuto-a-minuto-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  // Metadata para YouTube (título, descripción, capítulos).
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, {
    title: 'Minuto a Minuto — la agenda del retiro en tiempo real | Emaús',
    description:
      'Recorrido por el Minuto a Minuto de Emaús: la agenda del retiro coordinada al segundo. ' +
      'Línea AHORA en tiempo real, actividades por día con su tipo y responsable, controles en vivo ' +
      '(iniciar, completar, mover), detección de huecos y solapes, búsqueda, vista por equipo, e ' +
      'importación desde un template maestro reutilizable por país.',
    tags: ['Emaús', 'retiro', 'minuto a minuto', 'agenda', 'logística', 'coordinación'],
    chapters,
  });
  log('✅ Listo:', out);

  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
