// Video-demo narrado de la feature "Preparaciones" (calendario semanal pre-retiro
// con documentos por semana y vista pública).
//
//   cd apps/web && node e2e/demo/record-preparations.mjs
//
// Requiere dev arriba (web 5173 + API 3084) y apps/web/e2e/demo/.env con la key.
// La grabación regenera el calendario del retiro de demo con "Reemplazar todo"
// + documentos por defecto — ese ES el estado limpio, no requiere reset extra.
// La vista pública se muestra con fechas corridas a futuro vía page.route
// (solo display, la BD no se toca).

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
// San Agustín: retiro de demo completo (slug sanagustinpolancoiv, isPublic).
const RETREAT = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead';
const PUBLIC_SLUG = process.env.PUBLIC_SLUG || 'sanagustinpolancoiv';
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0;

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'intro', text: 'Te presento las Preparaciones: las reuniones semanales para preparar al equipo de servidores antes del retiro.' },
  { id: 'sidebar', text: 'La encuentras en el menú del retiro, en la sección Logística: Preparaciones.' },
  { id: 'generar', text: 'Eliges cuántas semanas, el día y la hora. Abajo ves las fechas resultantes antes de crear.' },
  { id: 'generado', text: 'Al crear un retiro esto se hace solo: siete reuniones que terminan justo antes, cada una con su charla.' },
  { id: 'editable', text: 'Cada reunión es editable: cambias el título, la fecha y la hora directamente en la página.' },
  { id: 'docs', text: 'Y cada reunión trae el documento de su charla, con su objetivo, listo para ver o descargar.' },
  { id: 'festivo', text: '¿Una fecha cae en festivo? La saltas con un clic y anotas el motivo.' },
  { id: 'festivoResultado', text: 'El festivo queda marcado, y las reuniones anteriores se adelantan. La fecha del retiro nunca se mueve.' },
  { id: 'enlace', text: 'Con un clic copias el enlace público, listo para compartir por WhatsApp.' },
  { id: 'publica', text: 'Los servidores lo abren sin usuario ni contraseña: ven las fechas y descargan el documento de cada charla.' },
  { id: 'proxima', text: 'La próxima reunión aparece destacada, con su documento a un toque.' },
  { id: 'outro', text: 'Preparaciones: el equipo de servidores llega listo, con cada charla clara y a la mano.' },
];

// ── Metadata para YouTube ─────────────────────────────────────────────────────
const YT_TITLE = 'Preparaciones — reuniones del equipo de servidores | Emaús';
const YT_DESCRIPTION = [
  'Recorrido por las Preparaciones de Emaús: las reuniones semanales (7 a 9) para',
  'preparar al equipo de servidores antes del retiro, cada una con su charla y objetivo.',
  'Verás cómo se genera el calendario al crear el retiro, editar fechas y horas, los',
  'documentos de cada charla, saltar un festivo sin mover el retiro, y el enlace público',
  'donde los servidores descargan el material de la próxima reunión.',
].join(' ');
const YT_TAGS = ['Emaús', 'retiro', 'preparaciones', 'servidores', 'charlas', 'tutorial'];
const CHAPTER_LABELS = {
  intro: 'Qué son las Preparaciones',
  sidebar: 'Dónde encontrarlas',
  generar: 'Configurar el calendario',
  generado: 'Calendario automático con documentos',
  editable: 'Editar fechas y horas',
  docs: 'Documentos por semana',
  festivo: 'Saltar un festivo',
  festivoResultado: 'El retiro no se mueve',
  enlace: 'Enlace público',
  publica: 'Vista para servidores',
  proxima: 'Próxima reunión',
  outro: 'Cierre',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

async function cueOn(nar, locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (box) await nar.cueAt(box.x + box.width / 2, box.y + box.height / 2);
}

/** Suma días a un YYYY-MM-DD (aritmética UTC). */
function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  ensureOutputDir();

  log('🎙️  Generando narración TTS…');
  const clips = {};
  for (const l of LINES) {
    clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };
    log(`   · ${l.id} → ${clips[l.id].duration.toFixed(1)}s`);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 55 });

  // Login sin grabar → storageState (el video arranca ya autenticado).
  log('🔐 Login…');
  const auth = await browser.newContext({ viewport: { width: W, height: H } });
  const ap = await auth.newPage();
  let logged = false;
  for (let i = 0; i < 3 && !logged; i++) {
    try {
      await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
      await ap.fill('#email', cfg.email);
      await ap.fill('#password', cfg.password);
      await ap.press('#password', 'Enter');
      await ap.waitForURL(/\/app/, { timeout: 20000 });
      logged = true;
    } catch {
      await ap.waitForTimeout(4000 * (i + 1));
    }
  }
  if (!logged) throw new Error('login falló tras 3 intentos');
  await ap.waitForTimeout(1200);
  const state = await auth.storageState();
  await auth.close();

  // Contexto de grabación (autenticado, forzado a español).
  const ctx = await browser.newContext({
    storageState: state,
    viewport: { width: W, height: H },
    locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await ctx.addInitScript(OVERLAY_INIT);
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // ── Vista admin de Preparaciones (San Agustín) ──
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/preparaciones`, {
      waitUntil: 'networkidle',
    });
    await sleep(page, 1400);

    // intro
    await nar.say(clips.intro);

    // sidebar: la sección Logística auto-expande en su propia página → cue al ítem.
    const sideItem = page.getByRole('link', { name: /^Preparaciones/i }).first();
    await cueOn(nar, sideItem);
    await nar.say(clips.sidebar);

    // ── generar: abrir el diálogo, narrar el formulario, crear con documentos ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    await page.getByRole('button', { name: /Configurar y crear/i }).first().click().catch(() => {});
    await sleep(page, 800);
    await nar.say(clips.generar);
    const genDialog = page.locator('div[role="dialog"]');
    // includeDefaultDocs viene marcado por defecto; clearExisting solo aparece si hay calendario.
    await genDialog.locator('input[type="checkbox"]').last().check().catch(() => {});
    await sleep(page, 400);
    await page.getByRole('button', { name: /Crear calendario/i }).click().catch(() => {});
    await page
      .getByText('1ª preparación — Servicio.docx')
      .first()
      .waitFor({ timeout: 20000 })
      .catch(() => {});
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 800);
    await nar.say(clips.generado);

    // editable: cue sobre la fecha de la semana 1
    const firstDateInput = page.locator('input[type="date"]').first();
    await cueOn(nar, firstDateInput);
    await nar.say(clips.editable);

    // docs: cue sobre el primer chip de documento
    const firstChip = page.locator('li a[target="_blank"]').first();
    await firstChip.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 400);
    await cueOn(nar, firstChip);
    await nar.say(clips.docs);

    // ── festivo: saltar la 3ª semana ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    const skipBtn = page.getByRole('button', { name: /Saltar por festivo/i }).nth(2);
    await skipBtn.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 400);
    await skipBtn.click().catch(() => {});
    await sleep(page, 600);
    const skipDialog = page.locator('div[role="dialog"]');
    await skipDialog.locator('input').first().pressSequentially('Semana Santa', { delay: 70 }).catch(() => {});
    await nar.say(clips.festivo);
    await page.getByRole('button', { name: /^Saltar fecha$/i }).click().catch(() => {});
    // El título del break es un <Input> (valor, no text-node) → esperar el cierre
    // del diálogo y el badge "Festivo", que sí es texto.
    await page.locator('div[role="dialog"]').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.locator('span', { hasText: /^Festivo$/ }).first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 800);
    await nar.say(clips.festivoResultado);

    // ── enlace público ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    const copyBtn = page.getByRole('button', { name: /Copiar enlace público/i }).first();
    await cueOn(nar, copyBtn);
    await copyBtn.click().catch(() => {});
    await sleep(page, 600);
    await nar.say(clips.enlace);

    // ── vista pública (fechas corridas a futuro solo para display) ──
    await page.route('**/api/retreat-preparations/public/**', async (route) => {
      const resp = await route.fetch();
      const data = await resp.json();
      for (const p of data.preparations ?? []) {
        if (p.date) p.date = addDaysYmd(p.date, 12 * 7); // +12 semanas → hay "próxima"
      }
      await route.fulfill({ response: resp, json: data });
    });
    // domcontentloaded + waitFor del hero: networkidle cuelga ~10s por el
    // route.fetch del interceptor (mantiene conexiones abiertas).
    await page.goto(`${cfg.baseUrl}/preparaciones/${PUBLIC_SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Próxima reunión/i).first().waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.publica);

    // hero de próxima preparación
    const heroDl = page.locator('section.border-2 a[download], section.border-2 button').first();
    await cueOn(nar, heroDl);
    await nar.say(clips.proxima);

    // outro
    await nar.say(clips.outro);
    await sleep(page, 1400);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);
  const out = path.join(OUTPUT_DIR, 'preparaciones-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  log('✅ Listo:', out);

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  const metaPath = writeVideoMeta(out, {
    title: YT_TITLE,
    description: YT_DESCRIPTION,
    tags: YT_TAGS,
    chapters,
  });
  log('📝 Metadata:', metaPath, `(${chapters.length} capítulos)`);

  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
