// Video-demo narrado: arreglos al motor de secuencias (sequence-template-resolution).
//
// Tres fixes sobre el retiro sintético "Demo Secuencias (video)" (cero PII):
//   M3 — el paso de secuencia fija su plantilla por id (select por nombre en el
//        editor; la bandeja muestra la plantilla resuelta) y avisa en ámbar cuando
//        un paso va por tipo habiendo varias del mismo tipo.
//   M2 — la fecha del paso se pinta en ámbar cuando quedaría en el pasado: al
//        activar, ese paso no se programa (fin de los envíos retroactivos).
//   M4 — una plantilla con el hueco {custom_message} ya no se despacha literal:
//        cae a Problemas como omitida, con la razón.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5174 node e2e/demo/record-sequence-fixes.mjs
//
// Requiere el retiro demo sembrado (scripts no versionados en /tmp/emaus-demo/:
// seed-demo.mjs + seed-participants.mjs) sobre el stack del worktree (API 3002,
// web 5174). Vista de ADMIN → login por storageState. NO muta: los cambios del
// editor se CANCELAN y nunca se clican "Ejecutar ahora"/"Encolar ya".
//
// Nota de PII: no se registra maskRoute a propósito — todos los datos visibles
// son sintéticos y maskRoute renombraría a los participantes fake, rompiendo la
// coherencia del guion entre pestañas. Sólo se bloquean los exportes CSV/Excel.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Comunicaciones');

const DEMO_RETREAT_PARISH = 'Demo Secuencias (video)';
const TPL_B = 'Último aviso de prendas (demo B)';
const SEQ_M3 = 'Demo M3 — paso fija plantilla por id';
const SEQ_M4 = 'Demo M4 — plantilla con hueco manual';

const LINES = [
  { id: 'sidebar', text: '¿Dónde vive? En el menú de la izquierda, abre Comunicaciones y entra a Secuencias automáticas.' },
  { id: 'ctx', text: 'Este retiro de prueba tiene dos plantillas de prendas del mismo tipo. Antes, el motor enviaba siempre la más antigua y la nueva nunca salía. Ya no: cada paso recuerda la plantilla exacta que elegiste.' },
  { id: 'm3_select', text: 'Al editar la secuencia, el paso elige su plantilla por nombre, una por una. Este paso quedó fijado en el último aviso, aunque haya más del mismo tipo.' },
  { id: 'm2_amber', text: 'Y si el disparador empuja el envío a una fecha que ya pasó, la fecha del paso se marca en ámbar: al activar, ese paso no se programa. Se acabaron los mensajes retroactivos.' },
  { id: 'queue', text: 'En la bandeja de WhatsApp, el pendiente sale con la plantilla correcta y con su texto: el último aviso de prendas.' },
  { id: 'm4_dup', text: 'Esta otra secuencia va solo por tipo, sin plantilla fija: el aviso ámbar te pide elegir una concreta.' },
  { id: 'm4_issues', text: 'Y si la plantilla trae el hueco de mensaje personalizado, ya no se manda tal cual: el mensaje cae a Problemas, omitido, con la razón para corregirla.' },
  { id: 'outro', text: 'Plantilla fijada por paso, fechas retroactivas avisadas y huecos manuales protegidos. Las secuencias ahora hacen lo que ves.' },
];

const YT_TITLE = 'Secuencias automáticas: plantilla por paso y mensajes protegidos';
const YT_DESCRIPTION =
  'Arreglos al motor de secuencias automáticas de Emaús, mostrados sobre un retiro de ' +
  'prueba con datos ficticios. El paso de secuencia ahora fija su plantilla concreta (con ' +
  'aviso cuando un paso va por tipo y hay varias), la fecha de un paso que caería en el ' +
  'pasado se marca en ámbar y no se programa al activar, y una plantilla con el hueco de ' +
  'mensaje personalizado ya no se envía literal: cae a Problemas con la razón. Los datos ' +
  'del demo son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'secuencias', 'plantillas', 'mensajes', 'WhatsApp', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar: 'Dónde está en el menú', ctx: 'El problema', m3_select: 'Plantilla por paso (fijada)',
  m2_amber: 'Fecha pasada en ámbar', queue: 'Bandeja de WhatsApp', m4_dup: 'Aviso de tipo duplicado',
  m4_issues: 'Hueco manual protegido', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
async function cueBox(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch {}
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
      await ap.waitForURL(/\/app/, { timeout: 20000 });
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
    storageState: state, viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });

  // Retiro demo por nombre (re-siembras cambian el id, no el nombre).
  const retreatsResp = await ctx.request.get(cfg.baseUrl + '/api/retreats');
  if (!retreatsResp.ok()) throw new Error(`GET /api/retreats → ${retreatsResp.status()}`);
  const retreats = await retreatsResp.json();
  const demo = (Array.isArray(retreats) ? retreats : retreats.data || [])
    .find((r) => r.parish === DEMO_RETREAT_PARISH);
  if (!demo) throw new Error(`No encontré el retiro "${DEMO_RETREAT_PARISH}" — siembra el demo primero (/tmp/emaus-demo/seed-demo.mjs + seed-participants.mjs)`);
  log(`🎯 Retiro demo: ${demo.id}`);
  await ctx.addInitScript((rid) => {
    localStorage.setItem('preferred-locale', 'es');
    localStorage.setItem('selectedRetreatId', rid);
  }, demo.id);
  await ctx.addInitScript(OVERLAY);

  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);

  // Red de seguridad mínima: los exportes con datos nunca llegan al video.
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.continue();
    let resp;
    try { resp = await route.fetch(); } catch { return route.continue().catch(() => {}); }
    const ct = resp.headers()['content-type'] || '';
    if (/text\/csv|ms-excel|spreadsheetml/i.test(ct)) {
      return route.fulfill({ status: 204, body: '' }).catch(() => {});
    }
    return route.fulfill({ response: resp }).catch(() => {});
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const rowOf = (name) => page.locator('div.p-3', { hasText: name }).first();
  const editBtnOf = (name) => rowOf(name).getByRole('button', { name: 'Editar', exact: true });
  const tplSelect = page.locator('select').filter({ has: page.locator('option', { hasText: TPL_B }) }).first();
  const triggerSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Días antes del retiro' }) }).first();
  // El input de días del PASO va por su label "Días" (regex anclada, dentro del
  // dialog): el primer input number del modal es maxOverdueDays de la secuencia
  // ("No enviar si venció hace (días)") y en la 1ª toma se llevó el fill.
  const offsetInput = page
    .getByRole('dialog')
    .locator('label.text-xs.text-gray-500', { hasText: /^Días$/ })
    .locator('xpath=following-sibling::input')
    .first();

  try {
    // ── Sidebar ──
    await page.goto(`${cfg.baseUrl}/app`, { waitUntil: 'networkidle' });
    await sleep(page, 1200);
    const comm = page.locator('button', { hasText: /^\s*Comunicaciones\s*$/i }).first();
    await cueBox(nar, comm);
    const item = page.getByRole('link', { name: 'Secuencias automáticas' }).first();
    await item.click({ timeout: 4000 }).catch(async () => {
      await comm.click().catch(() => {});
      await sleep(page, 700);
      await item.click().catch(() => {});
    });
    await page.waitForURL(/message-sequences/, { timeout: 15000 });
    await page.getByText('Secuencias automáticas', { exact: true }).first().waitFor({ timeout: 15000 });
    await sleep(page, 1200);
    await nar.say(clips.sidebar);

    // ── El problema + fila M3 ──
    await cueBox(nar, rowOf(SEQ_M3));
    await nar.say(clips.ctx);

    // ── M3: editor, select por id ──
    await editBtnOf(SEQ_M3).click();
    await page.getByText('Editar secuencia').first().waitFor({ timeout: 6000 });
    await sleep(page, 900);
    await cueBox(nar, tplSelect);
    await tplSelect.click(); // dropdown nativo abierto durante la narración
    await sleep(page, 600);
    await nar.say(clips.m3_select);
    await page.keyboard.press('ArrowDown');
    await sleep(page, 500);
    await page.keyboard.press('ArrowUp');
    await sleep(page, 400);
    await page.keyboard.press('Enter');
    await sleep(page, 400);
    // Sanidad: la B sigue seleccionada; si el teclado no clavó, fijarla en silencio.
    const picked = await tplSelect.evaluate((el) => el.selectedOptions[0]?.textContent || '');
    if (!picked.includes('demo B')) await tplSelect.selectOption({ label: TPL_B });

    // ── M2: trigger días-antes + desfase que cruza el inicio → fecha en ámbar ──
    await triggerSelect.selectOption({ label: 'Días antes del retiro' });
    await sleep(page, 700);
    await offsetInput.fill('25'); // retiro a ~20 días → paso el 26 sep (pasado)
    await sleep(page, 1800); // debounce 400ms + fetch + render
    // Sanidad del beat: el ámbar debe existir ANTES de narrarlo (si no, la
    // narración promete algo que la pantalla no muestra — le pasó a la 1ª toma).
    await page
      .getByText('la fecha ya pasó')
      .first()
      .waitFor({ timeout: 8000 })
      .then(() => log('   ✓ M2: fecha del paso en ámbar'))
      .catch(() => log('   ⚠ M2: el ámbar NO apareció — revisar esta toma'));
    await cueBox(nar, page.getByText('la fecha ya pasó').first());
    await nar.say(clips.m2_amber);
    await page.getByRole('button', { name: 'Cancelar' }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);

    // ── M3 en la bandeja ──
    await page.getByRole('tab', { name: 'Bandeja WhatsApp' }).click();
    await sleep(page, 900);
    await cueBox(nar, page.getByText(TPL_B).first());
    await nar.say(clips.queue);

    // ── M3 bis: warning de tipo duplicado en el editor de la M4 ──
    await page.getByRole('tab', { name: 'Secuencias', exact: true }).click();
    await sleep(page, 600);
    await editBtnOf(SEQ_M4).click();
    await page.getByText('Editar secuencia').first().waitFor({ timeout: 6000 });
    await sleep(page, 900);
    await cueBox(nar, page.getByText('varias del mismo tipo').first());
    await nar.say(clips.m4_dup);
    await page.getByRole('button', { name: 'Cancelar' }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);

    // ── M4: Problemas con el error accionable ──
    await page.getByRole('tab', { name: 'Problemas' }).click();
    await sleep(page, 900);
    await cueBox(nar, page.locator('.text-red-600').first());
    await nar.say(clips.m4_issues);

    await nar.clearCue();
    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-sequence-fixes.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'sequence-fixes-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
