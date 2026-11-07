// Video-demo narrado de la feature "Cartas de familias" (specs/letters-email):
// buzones carta.{CODE}@emaus.cc, bandeja de revisión, difusión WhatsApp e
// impresión organizada.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5175 node e2e/demo/record-letters.mjs
//
// Requiere el dev del worktree arriba (web 5175 + API dist 3003) y .env con la
// key de Deepgram. Los datos demo (5 cartas ficticias de remitentes inventados
// + 1 aprobada con foto) se siembran por el webhook ANTES de grabar; los
// nombres reales de participantes se enmascaran en el video (maskNode + paso
// propio para participantName). La revisión se intercepta (no muta la DB) para
// que las tomas sean repetibles; print-mark SÍ muta (marca impresa en DB
// desechable, y la vista la muestra tras recargar).

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
  alignChapterTimeline,
  writeVideoMeta,
  maskNode,
  fakeFor,
  OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead'; // San Agustín (demo completo)
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Cartas de familias');

// Stub de impresión para la toma: printHtmlDocument hace window.open + document.write
// sobre el MISMO documento (el papel queda en la página grabada) y window.print no-op
// (sin diálogo del sistema que bloquearía la sesión).
const PRINT_STUB = `
(() => {
  window.open = function () {
    return { document: window.document, close() {}, focus() {}, };
  };
  window.print = function () {};
})();
`;

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'ruta', text: 'Las cartas de las familias viven en Retiro, Comunicaciones, Cartas de familias. Vamos ahí.' },
  { id: 'bandeja', text: 'Esta es la bandeja: aquí llega todo lo que las familias mandan al correo de cada participante.' },
  { id: 'estados', text: 'Cada carta entra como por revisar. La apruebas para imprimirla, o la ocultas si no procede.' },
  { id: 'detalle', text: 'Al abrir una carta ves el mensaje completo y las fotos que la familia adjuntó.' },
  { id: 'revisar', text: 'Apruebas con un clic, y queda registrado quién la revisó y cuándo.' },
  { id: 'buzones', text: 'En Buzones tienes la dirección única de cada participante, lista para copiar.' },
  { id: 'difundir', text: 'Desde Difundir generas el mensaje con su dirección, listo para mandarlo por WhatsApp a la familia.' },
  { id: 'imprimir', text: 'Y con las aprobadas, Imprimir retiro arma el paquete: una sección por participante, con sus fotos.' },
  { id: 'impresa', text: 'Las cartas impresas quedan marcadas, para que nadie las imprima dos veces.' },
  { id: 'outro', text: 'Cartas de familias: la sorpresa del retiro, organizada de principio a fin.' },
];

const CHAPTER_LABELS = {
  ruta: 'Dónde vive', bandeja: 'La bandeja', estados: 'Por revisar / aprobadas', detalle: 'Leer una carta',
  revisar: 'Aprobar', buzones: 'Buzones', difundir: 'Difundir por WhatsApp', imprimir: 'Imprimir',
  impresa: 'Marca de impresa', outro: 'Cierre',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
const LETTERS_URL = () => `${cfg.baseUrl}/app/retreats/${RETREAT}/letters`;

// Paso propio sobre maskNode: `participantName` lleva el nombre completo en una
// sola clave (misma lección del 2026-09-08 con recipientName) y el detalle trae
// {name, cellPhone} sin firstName al lado.
function maskLetterNames(n) {
  if (Array.isArray(n)) return n.forEach(maskLetterNames);
  if (!n || typeof n !== 'object') return;
  if (typeof n.participantName === 'string' && n.participantName.trim()) {
    const f = fakeFor(n.participantName);
    n.participantName = `${f.first} ${f.last}`;
  }
  if (typeof n.name === 'string' && n.name.trim() && !n.name.includes('@') && typeof n.cellPhone === 'string') {
    const f = fakeFor(n.name);
    n.name = `${f.first} ${f.last}`;
  }
  for (const k of Object.keys(n)) if (n[k] && typeof n[k] === 'object') maskLetterNames(n[k]);
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

  log('🔐 Login…');
  let state;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const auth = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-MX' });
    const ap = await auth.newPage();
    try {
      await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
      await ap.fill('#email', cfg.email);
      await ap.fill('#password', cfg.password);
      await ap.press('#password', 'Enter');
      await ap.waitForURL(/\/app/, { timeout: 15000 });
      // Fijar el retiro del demo (San Agustín): el login autoselecciona otro.
      await ap.goto(LETTERS_URL(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await ap.waitForTimeout(1800);
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
    locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  await ctx.addInitScript(PRINT_STUB);

  // Enmascarado de TODO el API (nombres/correos/teléfonos/fotos) + participantName.
  await ctx.route('**/api/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.continue();
    const resp = await route.fetch();
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json')) return route.fulfill({ response: resp });
    let data;
    try {
      data = await resp.json();
    } catch {
      return route.fulfill({ response: resp });
    }
    maskNode(data);
    maskLetterNames(data);
    return route.fulfill({ response: resp, json: data });
  });

  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const expandSidebar = async (label) => {
    const btn = page.locator(`aside button:visible`, { hasText: label }).first();
    if ((await btn.getAttribute('aria-expanded')) !== 'true') {
      await btn.click().catch(() => {});
      await sleep(page, 600);
    }
  };

  try {
    // ── ruta (sidebar: Retiro → Comunicaciones → Cartas de familias) ──
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('aside', { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    await expandSidebar('Retiro');
    await expandSidebar('Comunicaciones');
    const lettersLink = page.getByRole('link', { name: /^Cartas de familias/ }).first();
    await lettersLink.waitFor({ timeout: 8000 });
    const box = await lettersLink.boundingBox();
    if (box) await nar.cueAt(box.x + box.width / 2, box.y + box.height / 2);
    await nar.say(clips.ruta);
    await nar.clearCue();
    await lettersLink.click();
    await page.waitForSelector('text=Cartas de familias', { timeout: 12000 });
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    await sleep(page, 900);

    // ── bandeja ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await nar.say(clips.bandeja);

    // ── estados (chips de conteo) ──
    const chip = page.locator('button', { hasText: 'Por revisar' }).first();
    const chipBox = await chip.boundingBox().catch(() => null);
    if (chipBox) await nar.cueAt(chipBox.x + 60, chipBox.y + chipBox.height / 2);
    await nar.say(clips.estados);
    await nar.clearCue();

    // ── detalle (la aprobada con foto: María) ──
    const approvedRow = page
      .locator('button')
      .filter({ hasText: 'Aprobadas' })
      .filter({ hasText: 'María' })
      .first();
    await approvedRow.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 400);
    // Clic vía DOM (lección del tour: el click de puntero puede ser tragado por
    // un contenedor scrollable y la carta nunca se abre en cámara).
    await approvedRow.evaluate((el) => el.click());
    await page.waitForSelector('figure img', { timeout: 8000 });
    // Anclar la cámara EN el cuerpo de la carta (el detalle abre debajo del resumen).
    await page.getByText('Te queremos mucho').scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 1200);
    await nar.say(clips.detalle);

    // ── revisar (aprobar una pendiente real; la DB del worktree es desechable) ──
    const pendingRow = page
      .locator('button')
      .filter({ hasText: 'Por revisar' })
      .filter({ hasText: 'Los abuelos' })
      .first();
    await pendingRow.scrollIntoViewIfNeeded().catch(() => {});
    await pendingRow.click();
    await sleep(page, 500);
    const approveBtn = page.locator('button', { hasText: 'Aprobar' }).first();
    await approveBtn.click();
    await sleep(page, 900);
    await nar.say(clips.revisar);

    // ── buzones (dialog) ──
    await page.evaluate(() => window.scrollTo(0, 0));
    // Texto EXACTO: hasText suelto matchea "Activar buzones" primero (toma 1).
    const buzonesBtn = page.getByRole('button', { name: 'Buzones', exact: true });
    await buzonesBtn.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await sleep(page, 900);
    await nar.say(clips.buzones);
    // cue al primer botón de copiar dirección dentro del dialog
    const copyBtn = page.locator('[role="dialog"] button[title*="Copiar"]').first();
    const copyBox = await copyBtn.boundingBox().catch(() => null);
    if (copyBox) await nar.cueAt(copyBox.x + copyBox.width / 2, copyBox.y + copyBox.height / 2);
    await sleep(page, 900);
    await nar.clearCue();
    await page.keyboard.press('Escape');
    await sleep(page, 600);

    // ── difundir (dialog) ──
    const difundirBtn = page.locator('button', { hasText: 'Difundir' }).first();
    await difundirBtn.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await sleep(page, 900);
    await nar.say(clips.difundir);
    await page.keyboard.press('Escape');
    await sleep(page, 600);

    // ── imprimir (papel en la misma página vía PRINT_STUB) ──
    const printBtn = page.locator('button', { hasText: 'Imprimir retiro' }).first();
    await printBtn.scrollIntoViewIfNeeded().catch(() => {});
    await nar.clear();
    await sleep(page, 400);
    await printBtn.click();
    // buildPrintableHtml espera las imágenes antes de autoPrint (stub no-op)
    await page.waitForSelector('.letter-participant', { timeout: 12000 });
    await sleep(page, 1600);
    await nar.say(clips.imprimir);
    await sleep(page, 600);

    // ── impresa (vuelta a la bandeja: badge Impresa) ──
    await page.goto(LETTERS_URL(), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Cartas de familias', { timeout: 12000 });
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    const impresaBadge = page.locator('text=Impresa').first();
    await impresaBadge.waitFor({ timeout: 8000 }).catch(() => {});
    await nar.say(clips.impresa);

    // ── outro ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await nar.say(clips.outro);
    await sleep(page, 1200);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-letters.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'cartas-de-familias-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(alignChapterTimeline(nar.timeline, { syncScale, syncOffsetMs: SYNC_OFFSET_MS }), {
    labels: CHAPTER_LABELS,
  });
  writeVideoMeta(out, {
    title: 'Cartas de familias — buzones, revisión e impresión | Emaús',
    description:
      'Las cartas que las familias envían por email al retiro, organizadas de principio a fin: ' +
      'una dirección única por participante, difusión por WhatsApp a cada familia, bandeja de revisión ' +
      '(aprobar/ocultar) e impresión por mesa o retiro con las fotos incluidas.',
    tags: ['Emaús', 'retiro', 'cartas', 'palancas', 'familias', 'impresión', 'organización'],
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
