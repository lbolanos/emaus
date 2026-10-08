// Narrated video demo: "Edición rápida de teléfonos en Palancas".
//
// REAL Buen Despacho retreat (worktree DB) with PII masked by the canonical maskRoute.
// Does not mutate the DB: the PATCH /participants/:id/phones is intercepted (Mesas
// pattern) and answered with a fabricated narrow canonical shape — the front updates
// row/dialog from the response. The edited numbers are 5500+ (fakes).
//
//   cd apps/web && node e2e/demo/record-quick-phones.mjs

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
  maskRoute, alignChapterTimeline,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Teléfonos de Palancas');
const BD = process.env.RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df'; // Buen Despacho (worktree DB)

const LINES = [
  { id: 'sidebar', text: 'La corrección rápida de teléfonos vive en Comunicaciones, Palancas.' },
  { id: 'problem', text: 'Cuando otra persona inscribe al caminante, la ficha queda con su teléfono. Aquí lo corriges.' },
  { id: 'column', text: 'La columna Celular muestra el número actual. El lápiz abre el editor rápido.' },
  { id: 'fields', text: 'Tres números en un solo lugar: el del caminante y sus dos contactos de emergencia.' },
  { id: 'paste', text: 'Pega el número tal cual, con cincuenta y dos y espacios. Se guarda limpio, a diez dígitos.' },
  { id: 'saved', text: 'Guardas y la fila se actualiza al instante, sin recargar la página.' },
  { id: 'invalid', text: 'Un número inválido se bloquea aquí mismo: nada se envía hasta que es correcto.' },
  { id: 'dialog', text: 'El mismo lápiz vive en el detalle: junto al número del encabezado.' },
  { id: 'emergency', text: 'Cada número dice a quién pertenece: emergencia uno y dos, con su nombre.' },
  { id: 'dialogSaved', text: 'Guardas y la ficha entera se refresca: encabezado y contactos, en caliente.' },
  { id: 'outro', text: 'Así los avisos de WhatsApp y las cartas llegan siempre al número correcto.' },
];

const YT_TITLE = 'Corregir teléfonos en Palancas · Emaús';
const YT_DESCRIPTION =
  'Tutorial de la edición rápida de teléfonos en la vista Palancas de Emaús. Cuando otra persona ' +
  '(por ejemplo la esposa de un caminante) llena el registro, la ficha queda con SU teléfono; aquí ' +
  'se corrige en dos clics: la columna Celular con el lápiz inline, y el mismo editor en el detalle ' +
  'de cada caminante. Un solo mini-editor con el celular del caminante y los dos contactos de ' +
  'emergencia; validación por país (pega el número con +52 y se guarda canonizado a 10 dígitos), ' +
  'números inválidos bloqueados antes de enviar, y la fila o ficha se refresca al instante tras ' +
  'guardar. Los nombres son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'palancas', 'teléfonos', 'contactos de emergencia', 'WhatsApp', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar: 'Dónde está en el menú', problem: 'El problema: quién inscribió dejó su número',
  column: 'Columna Celular y lápiz', fields: 'El editor: 3 números',
  paste: 'Pegar con +52 (canoniza)', saved: 'Guardar: fila al instante',
  invalid: 'Número inválido bloqueado', dialog: 'El lápiz en el detalle',
  emergency: 'Contactos de emergencia', dialogSaved: 'Ficha refrescada en caliente', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
async function cueBox(nar, loc) {
  try { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2); } catch {}
}

async function main() {
  ensureOutputDir();
  log('🎙️  TTS…');
  const clips = {};
  for (const l of LINES) clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };

  const browser = await chromium.launch({ headless: false, slowMo: 55 });
  log('🔐 Login…');
  let state;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const auth = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-MX' });
    const ap = await auth.newPage();
    try {
      await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
      await ap.fill('#email', cfg.email); await ap.fill('#password', cfg.password);
      await ap.press('#password', 'Enter'); await ap.waitForURL(/\/app/, { timeout: 20000 });
      await ap.waitForTimeout(1500); state = await auth.storageState(); await auth.close(); break;
    } catch (e) { await auth.close(); if (attempt === 3) throw e; await new Promise((r) => setTimeout(r, 2000)); }
  }

  const ctx = await browser.newContext({
    storageState: state, viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  await page.route('**/api/**', maskRoute);

  // Anti-mutation (Mesas pattern): intercept ONLY the phones PATCH, registered
  // AFTER the network (the last registered route wins). Answer with the
  // fabricated narrow canonical shape; the front updates row/dialog from the
  // response. The worktree DB stays untouched across takes.
  const FIELDS = ['cellPhone', 'emergencyContact1CellPhone', 'emergencyContact2CellPhone'];
  const canon = (v) => v.replace(/\D/g, '').replace(/^(52|044|045)/, '');
  const phonesState = { cellPhone: '5500661804', emergencyContact1CellPhone: '5500836454', emergencyContact2CellPhone: '5500723755' };
  await page.route('**/api/participants/*/phones', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch {}
    for (const f of FIELDS) if (typeof body[f] === 'string') phonesState[f] = body[f] === '' ? null : canon(body[f]);
    const id = (route.request().url().match(/participants\/([^/]+)\/phones/) || [])[1] || '';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, ...phonesState }) });
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const rows = () => page.locator('tr.participant-row');
  const popSave = () => page.getByRole('button', { name: /^Guardar$/ }).first();

  try {
    // 1. Retreat + sidebar (Comunicaciones → Palancas) — show where it lives BEFORE entering
    await page.goto(`${cfg.baseUrl}/app/retreats/${BD}/responsibilities`, { waitUntil: 'networkidle' });
    await page.getByText('Responsabilidades del Retiro').first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    await sleep(page, 1200);
    const comm = page.locator('button', { hasText: /^\s*Comunicaciones\s*$/i }).first();
    if ((await comm.getAttribute('aria-expanded').catch(() => null)) !== 'true') await comm.click().catch(() => {});
    await sleep(page, 700);
    const palancasLink = page.getByText('Palancas', { exact: true }).first();
    await cueBox(nar, palancasLink);
    await nar.say(clips.sidebar); // 1st voice = anchor of the start trim
    await palancasLink.click().catch(() => {});

    // 2-3. Palancas view: problem + Celular column
    await page.waitForURL(/\/app\/palancas/, { timeout: 15000 }).catch(() => {});
    await rows().first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    await sleep(page, 1200);
    await nar.say(clips.problem);
    const firstRow = rows().first();
    await cueBox(nar, firstRow.locator('button[title="Editar teléfonos"]').first());
    await nar.say(clips.column);

    // 4-6. Inline popover: 3 fields → paste +52 → save → row instantly
    await firstRow.locator('button[title="Editar teléfonos"]').first().click().catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.locator('#qp-cellPhone'));
    await nar.say(clips.fields);
    await page.locator('#qp-cellPhone').fill('+52 5500 123 456').catch(() => {});
    await sleep(page, 400);
    await nar.say(clips.paste);
    await popSave().click().catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, firstRow.locator('button[title="Editar teléfonos"]').first());
    await nar.say(clips.saved);

    // 7. Invalid: reopen, 123 → Save → inline error, no request
    await firstRow.locator('button[title="Editar teléfonos"]').first().click().catch(() => {});
    await sleep(page, 700);
    await page.locator('#qp-cellPhone').fill('123').catch(() => {});
    await sleep(page, 300);
    await popSave().click().catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.invalid);
    // @keydown.esc lives on the inputs: re-focus before Escape (after the click the focus sat on Save)
    await page.locator('#qp-cellPhone').focus().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 600);

    // 8-10. Dialog: header ✏ → EC2 → save → card refreshes live
    await firstRow.locator('button:has(svg.lucide-square-pen-icon)').first().click().catch(() => {});
    await page.getByRole('dialog').waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(page, 1200);
    const dlg = page.getByRole('dialog');
    // open the emergency-contacts collapsible if closed: the EC values (5500…)
    // are only visible when open — the dialogSaved beat needs to see them refresh
    if ((await dlg.getByText(/5500836454|5500723755/).count().catch(() => 0)) === 0) {
      await dlg.locator('button', { hasText: /datos de contacto y emergencia/i }).first().click().catch(() => {});
      await sleep(page, 600);
    }
    await cueBox(nar, dlg.locator('button[title="Editar teléfonos"]').first());
    await nar.say(clips.dialog);
    await dlg.locator('button[title="Editar teléfonos"]').first().click().catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.locator('#qp-emergencyContact2CellPhone'));
    await nar.say(clips.emergency);
    await page.locator('#qp-emergencyContact2CellPhone').fill('5500998877').catch(() => {});
    await sleep(page, 400);
    await popSave().click().catch(() => {}); // .first() = the popover's button (DOM order), not the dialog's
    await sleep(page, 900);
    await nar.say(clips.dialogSaved);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 500);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 600);

    // 11. Outro
    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-quick-phones.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬', videoPath);
  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);
  const out = path.join(OUTPUT_DIR, 'quick-phones-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  const chapters = buildYoutubeChapters(
    alignChapterTimeline(nar.timeline, { syncScale, syncOffsetMs: SYNC_OFFSET_MS }),
    { labels: CHAPTER_LABELS },
  );
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
