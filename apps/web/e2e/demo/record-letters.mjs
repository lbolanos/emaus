// Video-demo narrado de la feature "Cartas de familias" (specs/letters-email):
// buzones carta.{CODE}@emaus.cc, bandeja con ⋮, visor de fotos, documentos,
// registro del comprobante de pago desde el visor, impresión (solo lo que
// falta / marca manual) y carpetas por caminante con filtro de palanquero.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5176 node e2e/demo/record-letters.mjs
//
// Requiere el dev del worktree arriba (web 5176 + API 3004) y .env con la key
// de Deepgram. Los datos demo (5 cartas de remitentes ficticios, una con 2
// fotos y otra con PDF+Word) se siembran por el webhook ANTES de grabar
// (fixture aparte); el retiro Santa Clara usa caminantes dummy, así que no hay
// PII real que enmascarar — el maskRoute queda por defensiva. La revisión y el
// pago SÍ mutan la DB (desechable). PRINT_STUB evita el diálogo del sistema.

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
  OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || 'ac694780-1a2a-41ea-ba25-1646d22a1dd5'; // Santa Clara (caminantes dummy)
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Cartas de familias');

// print() del preview no abre el diálogo del sistema (bloquearía la sesión).
const PRINT_STUB = `
(() => {
  window.print = function () {};
})();
`;

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'ruta', text: 'Las cartas de las familias viven en Retiro, Comunicaciones, Cartas de familias.' },
  { id: 'bandeja', text: 'Cada caminante tiene un buzón propio: lo que su familia manda por correo llega aquí.' },
  { id: 'estados', text: 'Con los filtros separas por estado, mesa o caminante; y puedes trabajar solo con los de tu palanquero.' },
  { id: 'visor', text: 'Un clic en la foto la abre en grande, y con las flechas pasas entre todas las fotos del correo.' },
  { id: 'documentos', text: 'Si traen PDF o Word, se abren o descargan aparte: el papel solo lleva el texto y las fotos.' },
  { id: 'comprobante', text: 'Esta segunda foto es el comprobante de su pago.' },
  { id: 'registrar', text: 'Y desde el visor, Registrar esta foto como comprobante.' },
  { id: 'pago', text: 'El formulario de pago abre con la foto ya cargada. Escribe el monto y guarda.' },
  { id: 'comprobantes', text: 'El pago quedó enlazado a la carta, y aparece en Pagos, Comprobantes, como aplicado.' },
  { id: 'revisar', text: 'Para que una carta vaya al papel, se aprueba en el menú de tres puntos de su fila.' },
  { id: 'imprimir', text: 'Desde aquí arriba imprimes el retiro, una mesa o solo lo que falta. La vista previa trae una carta por hoja.' },
  { id: 'impresa', text: 'Al confirmar que salió bien, las cartas quedan marcadas como impresas.' },
  { id: 'marcar', text: '¿Se perdió una hoja o imprimiste por otro lado? Quitas la marca, o la pones a mano.' },
  { id: 'carpetas', text: 'En Carpetas, cada caminante es un folder: qué falta por imprimir y cuántos documentos van aparte.' },
  { id: 'palanquero', text: 'Y con el filtro de palanquero, cada quien imprime solo las carpetas de sus caminantes.' },
  { id: 'difundir', text: 'Desde Difundir mandas a cada familia la dirección de su buzón, lista para WhatsApp.' },
  { id: 'outro', text: 'Cartas de familias: la sorpresa del retiro, organizada de principio a fin.' },
];

const CHAPTER_LABELS = {
  ruta: 'Dónde vive', bandeja: 'La bandeja', estados: 'Filtros y palanquero', visor: 'Fotos en grande',
  documentos: 'PDF y Word', comprobante: 'Carta con comprobante', registrar: 'Registrar el comprobante',
  pago: 'El pago', comprobantes: 'Pagos → Comprobantes', revisar: 'Aprobar', imprimir: 'Imprimir',
  impresa: 'Marca de impresa', marcar: 'Marcar a mano', carpetas: 'Carpetas', palanquero: 'Filtro de palanquero',
  difundir: 'Difundir dirección', outro: 'Cierre',
};

const sleep = (page, ms) => page.waitForTimeout(ms);
const log = (...a) => console.log(...a);
const LETTERS_URL = () => `${cfg.baseUrl}/app/retreats/${RETREAT}/letters`;

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
      // Fijar el retiro del demo (Santa Clara): el login autoselecciona otro.
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

  // Defensiva (los datos ya son ficticios): enmascarar TODO el API por si
  // cualquier dato real se cuela por otro endpoint.
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
    return route.fulfill({ response: resp, json: data });
  });

  // SANDBOX del filtro de palanquero y del formulario: los caminantes demo no
  // tienen palanquero asignado, así que fabricamos las opciones y el filtrado
  // (patrón del video de Mesas). Las rutas específicas se registran DESPUÉS de
  // **/api/** y ganan; llaman maskNode ellas mismas (lección 2026-09-08).
  await ctx.route('**/api/responsibilities/palanquero-options*', (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { value: 'Palanquero 1', label: 'Palanquero 1' },
        { value: 'Palanquero 2', label: 'Palanquero 2' },
      ]),
    });
  });
  await ctx.route('**/api/letters/retreats/*/letters/folders*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.continue();
    const url = new URL(req.url());
    const wanted = url.searchParams.get('palanquero');
    url.searchParams.delete('palanquero');
    const resp = await route.fetch({ url: url.toString() });
    let data;
    try {
      data = await resp.json();
    } catch {
      return route.fulfill({ response: resp });
    }
    for (const f of data.folders ?? []) {
      if (/Caminante 01\b/.test(f.participantName ?? '')) f.palancasCoordinator = 'Palanquero 1';
      if (/Caminante 11\b/.test(f.participantName ?? '')) f.palancasCoordinator = 'Palanquero 1';
      if (/Caminante 02\b/.test(f.participantName ?? '')) f.palancasCoordinator = 'Palanquero 2';
      if (/Caminante 12\b/.test(f.participantName ?? '')) f.palancasCoordinator = 'Palanquero 2';
    }
    if (wanted) data.folders = (data.folders ?? []).filter((f) => f.palancasCoordinator === wanted);
    maskNode(data);
    return route.fulfill({ response: resp, json: data });
  });
  // Los nombres de caminantes son dummy: el select del formulario debe decir
  // «Caminante 01 (provisional)», no el fake que genera maskNode.
  await ctx.route('**/api/participants**', async (route) => {
    const resp = await route.fetch();
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json')) return route.fulfill({ response: resp });
    return route.fulfill({ response: resp });
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
  // Cue persistente al centro de un locator (anillo morado que se queda).
  const cueTo = async (loc) => {
    const box = await loc.boundingBox().catch(() => null);
    if (box) await nar.cueAt(box.x + box.width / 2, box.y + box.height / 2);
  };
  // El ⋮ VISIBLE de una fila (el botón móvil oculto también matchea "Acciones").
  const rowMenu = (row) => row.locator('button[aria-haspopup="menu"]:visible').last();

  try {
    // ── ruta (sidebar: Retiro → Comunicaciones → Cartas de familias) ──
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('aside', { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    await expandSidebar('Retiro');
    await expandSidebar('Comunicaciones');
    const lettersLink = page.getByRole('link', { name: /^Cartas de familias/ }).first();
    await lettersLink.waitFor({ timeout: 8000 });
    await cueTo(lettersLink);
    await nar.say(clips.ruta);
    await nar.clearCue();
    await lettersLink.click();
    await page.waitForSelector('text=Cartas de familias', { timeout: 12000 });
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    await sleep(page, 900);

    // ── bandeja ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await nar.say(clips.bandeja);

    // ── estados / filtros / palanquero ──
    const chip = page.locator('button', { hasText: 'Por revisar' }).first();
    await cueTo(chip);
    const palanqueroSel = page.locator('[data-testid="palanquero-filter"]');
    await cueTo(palanqueroSel);
    await nar.say(clips.estados);
    await nar.clearCue();

    // ── documentos (Lupe: PDF + Word en el detalle) ──
    const lupeRow = page.locator('.cursor-pointer', { hasText: 'Lupe López' }).first();
    await lupeRow.evaluate((el) => el.click());
    const firstDoc = page.locator('[data-testid="detail-document"]').first();
    await firstDoc.waitFor({ timeout: 8000 });
    await firstDoc.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.documentos);
    const docBadge = page.locator('text=adjunto(s) para abrir aparte').first();
    await cueTo(docBadge);
    await sleep(page, 800);
    await nar.clearCue();

    // ── visor (Familia Ramírez: 2 fotos; la miniatura abre la foto 1) ──
    const ramirezRow = page.locator('.cursor-pointer', { hasText: 'Familia Ramírez' }).first();
    await ramirezRow.scrollIntoViewIfNeeded().catch(() => {});
    const ramirezThumb = ramirezRow.locator('[data-testid="row-thumbnail"]').first();
    await ramirezThumb.evaluate((el) => el.click());
    await page.locator('[data-testid="photo-viewer"]').waitFor({ timeout: 8000 });
    await sleep(page, 500);
    await nar.say(clips.visor);
    // Flechas: la foto 2 es el comprobante del banco.
    await page.locator('[data-testid="photo-next"]').click();
    await page.waitForTimeout(500);
    await nar.say(clips.comprobante);

    // ── registrar (desde el visor: la foto que se está viendo) ──
    const regBtn = page.locator('[data-testid="viewer-register-receipt"]');
    await cueTo(regBtn);
    await nar.say(clips.registrar);
    await nar.clearCue();
    await regBtn.evaluate((el) => el.click());
    await page.locator('[role="dialog"]').last().waitFor({ timeout: 12000 });
    await sleep(page, 900);
    await nar.say(clips.pago);
    // Monto: el input numérico del formulario embebido.
    const dlg = page.locator('[role="dialog"]').last();
    const numeric = dlg.locator('input[type="number"]');
    const target = (await numeric.count()) ? numeric.first() : dlg.locator('input').nth(1);
    await target.fill('1500');
    await sleep(page, 400);
    await cueTo(dlg.getByRole('button', { name: /Guardar/ }).last());
    await sleep(page, 600);
    // Click vía DOM (lección del tour): el dialog es más alto que el viewport
    // y el click de puntero a veces se niega con "outside of the viewport".
    await dlg
      .getByRole('button', { name: /Guardar|Registrar/ })
      .last()
      .evaluate((el) => el.click());
    await page.getByText(/Comprobante registrado/).first().waitFor({ timeout: 12000 });
    await nar.clearCue();
    await sleep(page, 500);

    // ── comprobantes (Pagos → pestaña Comprobantes: el pago Aplicado) ──
    await expandSidebar('Logística');
    const pagosLink = page.getByRole('link', { name: /^Pagos/ }).first();
    await pagosLink.waitFor({ timeout: 8000 });
    await pagosLink.click();
    await page.waitForSelector('text=Comprobantes', { timeout: 12000 });
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    const tabComprobantes = page.locator('button', { hasText: 'Comprobantes' }).first();
    await tabComprobantes.click();
    await sleep(page, 900);
    const aplicado = page.locator('text=Carta de Familia Ramírez').first();
    await aplicado.waitFor({ timeout: 10000 }).catch(() => {});
    await cueTo(aplicado);
    await nar.say(clips.comprobantes);
    await nar.clearCue();

    // ── revisar (aprobar desde el ⋮ de la fila; de vuelta a Cartas) ──
    await page.goto(LETTERS_URL(), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Cartas de familias', { timeout: 12000 });
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    const carlosRow = page.locator('.cursor-pointer', { hasText: 'Carlos Herrera' }).first();
    await carlosRow.scrollIntoViewIfNeeded().catch(() => {});
    await rowMenu(carlosRow).click();
    const approveItem = page.getByRole('menuitem', { name: 'Aprobar' }).first();
    await approveItem.waitFor({ timeout: 6000 });
    await cueTo(approveItem);
    await nar.say(clips.revisar);
    await nar.clearCue();
    await approveItem.click();
    await sleep(page, 700);
    // Lupe también se aprueba (silencioso) para que la impresión avise sus 2 documentos.
    const lupeRow2 = page.locator('.cursor-pointer', { hasText: 'Lupe López' }).first();
    await lupeRow2.scrollIntoViewIfNeeded().catch(() => {});
    await rowMenu(lupeRow2).click();
    await page.getByRole('menuitem', { name: 'Aprobar' }).first().click();
    await sleep(page, 700);

    // ── imprimir (⋮ de arriba → vista previa → confirmar) ──
    await page.getByRole('button', { name: 'Acciones de buzones' }).click();
    await page.getByRole('menuitem', { name: 'Imprimir retiro' }).click();
    await page.locator('[data-testid="print-documents"]').waitFor({ timeout: 12000 });
    await sleep(page, 700);
    await nar.say(clips.imprimir);
    const previewFooter = page.locator('[role="dialog"]').last();
    await cueTo(previewFooter.getByRole('button', { name: 'Imprimir ahora' }));
    await sleep(page, 500);
    // Clic vía DOM: el toast «Carta aprobada» flota abajo y intercepta el puntero.
    await previewFooter.getByRole('button', { name: 'Imprimir ahora' }).evaluate((el) => el.click());
    await sleep(page, 500);
    await previewFooter.getByRole('button', { name: /Sí, marcar/ }).evaluate((el) => el.click());
    await sleep(page, 900);

    // ── impresa (badge en la fila) ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await nar.say(clips.impresa);
    await sleep(page, 500);

    // ── marcar a mano (⋮ de una fila impresa; reload limpia toast y overlay) ──
    await page.goto(LETTERS_URL(), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Cartas de familias', { timeout: 12000 });
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    const carlosRow2 = page.locator('.cursor-pointer', { hasText: 'Carlos Herrera' }).first();
    await carlosRow2.getByRole('button', { name: 'Acciones' }).click();
    const unmark = page.getByRole('menuitem', { name: 'Quitar marca de impresa' }).first();
    await unmark.waitFor({ timeout: 6000 });
    await cueTo(unmark);
    await nar.say(clips.marcar);
    await nar.clearCue();
    await unmark.click();
    await sleep(page, 700);

    // ── carpetas ──
    await page.locator('[data-testid="view-folders"]').click();
    await page.locator('[data-testid="folder-row"]').first().waitFor({ timeout: 10000 });
    await sleep(page, 600);
    await nar.say(clips.carpetas);
    const docsBadge = page.locator('[data-testid="folder-documents"]').first();
    await cueTo(docsBadge);
    await sleep(page, 800);
    await nar.clearCue();

    // ── palanquero ──
    const sel = page.locator('[data-testid="palanquero-filter"]');
    await sel.selectOption({ index: 1 }).catch(() => {});
    await sleep(page, 800);
    await cueTo(sel);
    await nar.say(clips.palanquero);
    await nar.clearCue();
    await sel.selectOption({ label: 'Todos los palanqueros' }).catch(() => {});
    await sleep(page, 500);

    // ── difundir ──
    await page.getByRole('button', { name: 'Acciones de buzones' }).click();
    await page.getByRole('menuitem', { name: 'Difundir' }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await sleep(page, 800);
    await nar.say(clips.difundir);
    await page.keyboard.press('Escape');
    await sleep(page, 600);

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

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'cartas-de-familias-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  // End card para las pantallas finales de YouTube (con el browser vivo).
  try {
    const { renderEndCard, appendEndCard } = await import('./demo-lib.mjs');
    const card = path.join(OUTPUT_DIR, 'letters-end-card.png');
    await renderEndCard(browser, { title: 'Cartas de familias', subtitle: 'Buzones, revisión, comprobantes e impresión', out: card });
    await appendEndCard(cfg, { video: out, card, out, seconds: 12 });
    log('🎬 End card agregado');
  } catch (e) {
    log('⚠️ End card falló (el video base queda intacto):', e.message);
  }
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const chapters = buildYoutubeChapters(alignChapterTimeline(nar.timeline, { syncScale, syncOffsetMs: SYNC_OFFSET_MS }), {
    labels: CHAPTER_LABELS,
  });
  writeVideoMeta(out, {
    title: 'Cartas de familias — buzones, comprobantes e impresión | Emaús',
    description:
      'Las cartas que las familias envían por email al retiro, de principio a fin: ' +
      'un buzón por caminante, revisión con filtros y palanquero, fotos en grande, ' +
      'PDF y Word aparte, registro del comprobante de pago desde la carta (queda en ' +
      'Pagos → Comprobantes), impresión con vista previa limpia, marca de impresas ' +
      'y carpetas por caminante.',
    tags: ['Emaús', 'retiro', 'cartas', 'comprobantes', 'pagos', 'impresión', 'palanquero'],
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
