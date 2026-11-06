// Video-demo narrado: "Foto del comprobante de pago" (Recepción + Pagos).
//
// Muestra la feature de specs/payment-receipt-photo:
//   1. Recepción (Personas → Recepción): Cobrar con "Foto del comprobante (opcional)".
//   2. Pagos (Logística → Pagos): miniatura junto a la referencia, visor ampliable,
//      reemplazar/quitar desde la edición.
//   3. Sin señal: el pago con su foto se encola en el teléfono y sube solo al reconectar.
//
// SANDBOX sin mutar la DB: los pendientes de Recepción y la lista de Pagos son fabricados
// (nombres ficticios), y TODAS las escrituras (POST /payments) se interceptan con respuestas
// fabricadas — el pago offline de la toma jamás toca la base.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5174 node e2e/demo/record-payment-receipt.mjs

import pw from '@playwright/test';
const { chromium } = pw;
import fs from 'node:fs';
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, alignChapterTimeline, buildYoutubeChapters,
  writeVideoMeta, renderEndCard, appendEndCard, OUTPUT_DIR, maskRoute, maskNode,
  FAKE_FIRSTS, FAKE_LASTS,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const SA = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead'; // San Agustín (completo)
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Comprobante de pago');
const RECEIPT_FILE = path.join(OUTPUT_DIR, 'comprobante-ejemplo.png');
const RECEIPT_DATA_URI = `data:image/png;base64,${fs.readFileSync(RECEIPT_FILE).toString('base64')}`;

// ── SANDBOX de Recepción (fabricado, sin PII real) ──────────────────────────
const nowISO = new Date().toISOString();
function mkP(n, first, last, table, paid, opts = {}) {
  return {
    retreatParticipantId: `rp-demo-${n}`, participantId: `p-demo-${n}`,
    idOnRetreat: n, firstName: first, lastName: last, cellPhone: '',
    checkedIn: !!opts.arrived, checkedInAt: opts.arrived ? '2026-01-01T15:32:00.000Z' : null,
    totalPaid: paid, tableName: table, isScholarship: !!opts.scholarship,
  };
}
const pendingState = [
  mkP(12, 'Miguel', 'Torres', 'Mesa 3', 1500),
  mkP(23, 'Lucía', 'Ramírez', 'Mesa 5', 0),   // → Cobrar CON foto (en línea)
  mkP(31, 'Andrés', 'Flores', 'Mesa 2', 1500),
  mkP(45, 'Diego', 'Castro', 'Mesa 4', 1500),
  mkP(52, 'Elena', 'Vargas', 'Mesa 6', 0),    // → Cobrar CON foto (sin señal)
];
const arrivedState = [];
for (let i = 0; i < 18; i++) {
  const f = FAKE_FIRSTS[i % FAKE_FIRSTS.length], l = FAKE_LASTS[(i * 3) % FAKE_LASTS.length];
  arrivedState.push(mkP(100 + i, f, l, `Mesa ${1 + (i % 8)}`, 1500, { arrived: true }));
}
function receptionPayload() {
  return {
    total: arrivedState.length + pendingState.length,
    arrived: arrivedState.length,
    pending: pendingState.length,
    pendingList: pendingState,
    arrivedList: arrivedState,
  };
}

// Pagos fabricados para la pestaña Pagos (uno con comprobante = el de Lucía).
let paySeq = 0;
function demoPayment(participant, amount, method, ref, withReceipt) {
  paySeq += 1;
  return {
    id: `pay-demo-${paySeq}`,
    participantId: participant.participantId,
    retreatId: SA,
    amount,
    paymentDate: '2026-11-05',
    paymentMethod: method,
    referenceNumber: ref,
    notes: '',
    receiptUrl: withReceipt ? RECEIPT_DATA_URI : null,
    receiptS3Key: null,
    participant: { id: participant.participantId, firstName: participant.firstName, lastName: participant.lastName },
    recordedByUser: { displayName: 'Recepción Emaús' },
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}
let paymentsList = [
  demoPayment(pendingState[1], 2500, 'transfer', 'SPEI-884213', true),
  demoPayment(pendingState[0], 1500, 'cash', '', false),
  demoPayment(arrivedState[0], 1500, 'card', 'TER-5521', false),
];
const paymentsPayload = () => paymentsList;
const summaryPayload = () => ({
  retreatId: SA,
  totalPaid: paymentsList.reduce((s, p) => s + p.amount, 0),
  totalPayments: paymentsList.length,
  participantsWithPayments: paymentsList.length,
  totalParticipants: arrivedState.length + pendingState.length,
  totalExpected: 24000,
  totalRemaining: 24000 - paymentsList.reduce((s, p) => s + p.amount, 0),
  pazYSalvoCount: arrivedState.length + pendingState.length - paymentsList.length,
  participantPayments: [],
});

async function receptionRoute(route) {
  const req = route.request();
  const url = req.url();
  if (req.method() === 'GET' && url.includes('/participants/reception/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(receptionPayload()) });
  }
  if (req.method() === 'PUT' && url.includes('/checkin')) {
    const m = url.match(/\/participants\/([^/]+)\/checkin/);
    const pid = m && m[1];
    const idx = pendingState.findIndex((p) => p.participantId === pid);
    if (idx >= 0) {
      const [moved] = pendingState.splice(idx, 1);
      moved.checkedIn = true; moved.checkedInAt = nowISO;
      arrivedState.unshift(moved);
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkedIn: true, checkedInAt: nowISO }) });
  }
  return route.continue();
}

async function paymentsReadRoute(route) {
  const req = route.request();
  const url = req.url();
  if (req.method() === 'GET' && /\/payments\/retreat\/[^/]+\/summary/.test(url)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summaryPayload()) });
  }
  if (req.method() === 'GET' && /\/payments(\?|$)/.test(url)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paymentsPayload()) });
  }
  return route.continue();
}

async function paymentsApiRoute(route) {
  const req = route.request();
  const url = req.url();
  if (req.method() === 'GET' && /\/payments\/retreat\/[^/]+\/summary/.test(url)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summaryPayload()) });
  }
  if (req.method() === 'GET' && /\/payments(\?|$)/.test(url)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paymentsPayload()) });
  }
  if (req.method() === 'POST' && /\/payments(\?|$)/.test(url)) {
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* ignore */ }
    const p = pendingState.find((x) => x.participantId === body.participantId);
    if (p) p.totalPaid += Number(body.amount) || 0;
    const created = demoPayment(
      p || { participantId: body.participantId, firstName: '', lastName: '' },
      Number(body.amount) || 0,
      body.paymentMethod || 'cash',
      body.referenceNumber || '',
      Boolean(body.receiptPhoto),
    );
    if (body.receiptPhoto) created.receiptUrl = body.receiptPhoto;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
  }
  return maskRoute(route);
}

// ── Guion ───────────────────────────────────────────────────────────────────
const LINES = [
  { id: 'sidebarRecep', text: 'Cuando un caminante llega a pagar, en el menú, sección Personas, entra a Recepción.' },
  { id: 'recepPay', text: 'Cada pendiente muestra su pago: en verde si ya pagó, o el botón Cobrar si aún debe.' },
  { id: 'chargeOpen', text: 'Cobras ahí mismo: escribes el monto y eliges si fue efectivo, transferencia o tarjeta.' },
  { id: 'receiptField', text: 'Si pagó con transferencia, aquí mismo adjuntas la foto de su comprobante.' },
  { id: 'receiptPreview', text: 'Eliges la captura, o tomas la foto, y la ves antes de registrarla.' },
  { id: 'receiptSaved', text: 'Registras el pago, y el comprobante queda guardado con él.' },
  { id: 'sidebarPagos', text: 'Para consultarlos después, en el menú, sección Logística, entra a Pagos.' },
  { id: 'paymentsThumb', text: 'En la pestaña Pagos, cada pago con comprobante muestra su miniatura junto a la referencia.' },
  { id: 'receiptViewer', text: 'La amplias con un clic para revisarla bien.' },
  { id: 'receiptManage', text: 'En la edición del pago puedes reemplazarla o quitarla; el cambio aplica al guardar.' },
  { id: 'offlineQueue', text: '¿La señal falla en la puerta? El pago con su foto se guarda en tu teléfono.' },
  { id: 'onlineSync', text: 'Y al reconectar, se envía solo, con la misma foto.' },
  { id: 'outro', text: 'Así cada pago deja su evidencia: la foto del comprobante, desde Recepción y desde Pagos.' },
];

const YT_TITLE = 'Foto del comprobante de pago en Emaús (Recepción y Pagos)';
const YT_DESCRIPTION =
  'Tutorial de Emaús: adjunta la foto del comprobante al registrar un pago. En Recepción, el botón Cobrar ' +
  'acepta una foto opcional —la captura de la transferencia o el recibo— que viaja junto con el pago aunque ' +
  'no haya señal: se guarda en el teléfono y sube sola al reconectar. En la pantalla de Pagos ves la miniatura ' +
  'del comprobante junto a cada pago, la amplias con un clic, y desde la edición puedes reemplazarla o quitarla. ' +
  'Los nombres y datos mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'pagos', 'comprobante', 'recepción', 'check-in', 'tutorial'];
const CHAPTER_LABELS = {
  sidebarRecep: 'Dónde está Recepción', recepPay: 'Verificar el pago', chargeOpen: 'Cobrar en la puerta',
  receiptField: 'Foto del comprobante', receiptPreview: 'Elegir la foto', receiptSaved: 'Pago registrado',
  sidebarPagos: 'Dónde está Pagos', paymentsThumb: 'Miniatura del comprobante', receiptViewer: 'Ampliar el comprobante',
  receiptManage: 'Reemplazar o quitar', offlineQueue: 'Funciona sin señal', onlineSync: 'Se envía al reconectar',
  outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
async function cueBox(nar, loc) {
  try { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2); } catch {}
}
const chip = (page) => page.locator('[data-testid="connectivity-chip"]');

async function attachReceipt(page) {
  const btn = page.locator('button', { hasText: /Adjuntar foto/i }).first();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    btn.click().catch(() => {}),
  ]);
  await chooser.setFiles(RECEIPT_FILE);
  // La preview (img h-14) aparece cuando el resize del cliente termina.
  await page.locator('img.h-14').first().waitFor({ timeout: 8000 }).catch(() => {});
}

async function main() {
  ensureOutputDir();
  log('🎙️  TTS…');
  const clips = {};
  for (const l of LINES) { clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) }; }

  const browser = await chromium.launch({ headless: false, slowMo: 45 });
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

  // Un SOLO handler para **/api/** que despacha (patrón de record-offline-mode):
  // mientras `offline` está activo ABORTA con internetdisconnected — route.fulfill
  // ignora ctx.setOffline, así que sin el abort la app "pagaría" sin señal y nunca
  // encolaría. En línea: reception/payments fabrican; TODO lo demás sale enmascarado.
  let offline = false;
  const setSignal = async (on) => {
    offline = !on;
    await ctx.setOffline(!on);
  };
  const apiDispatch = async (route) => {
    if (offline) return route.abort('internetdisconnected');
    const req = route.request();
    const url = req.url();
    if (/\/api\/participants\/.+/.test(url)) return receptionRoute(route);
    if (/\/api\/payments(\/|\?|$)/.test(url)) return paymentsApiRoute(route);
    return maskRoute(route);
  };
  await page.route('**/api/**', apiDispatch);

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // ═══════════ 1. RECEPCIÓN: cobrar con foto ═══════════
    await page.goto(`${cfg.baseUrl}/app/retreats/${SA}/reception`, { waitUntil: 'networkidle' });
    await page.getByText('Recepción de Caminantes').first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    await sleep(page, 1200);

    const personas = page.locator('button', { hasText: /^\s*Personas\s*$/i }).first();
    // Expandir la sección si está colapsada (clicar una abierta la cierra) y
    // mostrar el link Recepción — el usuario necesita ver DÓNDE clicar.
    if ((await personas.getAttribute('aria-expanded').catch(() => null)) === 'false') {
      await personas.click().catch(() => {});
      await sleep(page, 600);
    }
    const recepLink = page.getByRole('link', { name: /^Recepción/i }).first();
    await cueBox(nar, personas);
    await nar.say(clips.sidebarRecep);
    await cueBox(nar, recepLink);
    await sleep(page, 400);

    const luciaRow = page.locator('li', { hasText: 'Ramírez' }).first();
    await cueBox(nar, luciaRow.getByText(/\$0/).first());
    await nar.say(clips.recepPay);

    await luciaRow.locator('button', { hasText: /Cobrar/i }).first().click().catch(() => {});
    await sleep(page, 800);
    await page.locator('input[type="number"]').first().fill('2500').catch(() => {});
    // OJO: .first() agarra el select oculto del selector de retiro del sidebar
    // (aria-hidden, value=uuid) — acota por las opciones del método.
    const methodSel = page.locator('select').filter({ hasText: /Efectivo/i }).first();
    await methodSel.waitFor({ timeout: 4000 }).catch(() => {});
    await methodSel.selectOption('transfer').catch((e) => log('⚠ método:', e.message));
    const mv = await methodSel.inputValue().catch(() => null);
    if (mv !== 'transfer') log('⚠ método quedó en:', mv);
    await sleep(page, 500);
    await cueBox(nar, page.locator('button', { hasText: /Adjuntar foto/i }).first());
    await nar.say(clips.chargeOpen);
    await nar.clearCue();
    await nar.say(clips.receiptField);

    await attachReceipt(page);
    await sleep(page, 500);
    await cueBox(nar, page.locator('img.h-14').first());
    await nar.say(clips.receiptPreview);
    await nar.clearCue();

    await page.locator('button', { hasText: /Registrar pago/i }).first().click().catch(() => {});
    await sleep(page, 1400);
    await cueBox(nar, page.locator('li', { hasText: 'Ramírez' }).getByText(/2,500/).first());
    await nar.say(clips.receiptSaved);
    await nar.clearCue();

    // ═══════════ 2. PAGOS: miniatura + visor + edición ═══════════
    // SPA: expandir la sección Logística del sidebar SOLO si está colapsada
    // (clicar una sección abierta la cierra) y clicar el link Pagos.
    const logistica = page.locator('button', { hasText: /^\s*Logística\s*$/i }).first();
    if (await logistica.count()) {
      const expanded = await logistica.getAttribute('aria-expanded').catch(() => null);
      if (expanded === 'false') await logistica.click().catch(() => {});
      await sleep(page, 500);
    }
    const pagosLink = page.getByRole('link', { name: /^Pagos/i }).first();
    await cueBox(nar, pagosLink);
    await nar.say(clips.sidebarPagos);
    await pagosLink.click().catch(() => {});
    await page.getByRole('tab', { name: /Pagos/ }).first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.getByRole('tab', { name: /Pagos/ }).first().click().catch(() => {});
    await sleep(page, 1200);

    const visibleThumb = page.locator('img[src^="data:image"].h-10:visible').first();
    await cueBox(nar, visibleThumb);
    await nar.say(clips.paymentsThumb);
    await visibleThumb.click().catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, page.getByText(/^Comprobante$/i).first());
    await nar.say(clips.receiptViewer);
    await page.keyboard.press('Escape');
    await sleep(page, 600);

    // Editar el pago (botón lápiz visible en la fila del pago con comprobante)
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('tbody tr')]
        .filter((tr) => tr.innerText.includes('$2,500.00') && tr.offsetParent !== null)[0];
      if (row) row.querySelectorAll('button')[0].click();
    });
    await sleep(page, 900);
    await cueBox(nar, page.getByText(/Reemplazar/i).first());
    await nar.say(clips.receiptManage);
    await page.locator('button', { hasText: /Cancelar/i }).first().click().catch(() => {});
    await sleep(page, 600);

    // ═══════════ 3. SIN SEÑAL: encolado y replay ═══════════
    await page.goto(`${cfg.baseUrl}/app/retreats/${SA}/reception`, { waitUntil: 'networkidle' });
    await page.getByText('Recepción de Caminantes').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1000);

    await setSignal(false);
    await page.waitForTimeout(1200);
    // El chip debe reflejar Sin conexión antes de narrar.
    await chip(page).getAttribute('data-state').then((s) => log('chip:', s)).catch(() => {});

    const elenaRow = page.locator('li', { hasText: 'Vargas' }).first();
    await elenaRow.locator('button', { hasText: /Cobrar/i }).first().click().catch(() => {});
    await sleep(page, 700);
    await page.locator('input[type="number"]').first().fill('2500').catch(() => {});
    await attachReceipt(page);
    await sleep(page, 400);
    await page.locator('button', { hasText: /Registrar pago/i }).first().click().catch(() => {});
    // Espera el encolado: el chip muestra data-pending="1".
    await chip(page).getAttribute('data-pending', { timeout: 15000 }).catch(() => {});
    await cueBox(nar, chip(page));
    await nar.say(clips.offlineQueue);
    await nar.clearCue();

    await setSignal(true);
    // Espera el flush del outbox: pending vuelve a 0.
    await chip(page).getAttribute('data-pending', { timeout: 20000 }).catch(() => {});
    await sleep(page, 800);
    await cueBox(nar, chip(page));
    await nar.say(clips.onlineSync);
    await nar.clearCue();

    await sleep(page, 800);
    await nar.say(clips.outro);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-payment-receipt.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'payment-receipt-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  // Tarjeta final de marca (para las end screens de YouTube), integrada al mux.
  // Se renderiza ANTES de cerrar el browser (necesita uno vivo).
  const card = path.join(OUTPUT_DIR, 'payment-receipt-endcard.png');
  await renderEndCard(browser, {
    title: 'Foto del comprobante de pago',
    subtitle: 'Recepción y Pagos · Emaús',
    out: card,
  }).catch((e) => log('⚠ end card render:', e.message));
  const finalOut = path.join(OUTPUT_DIR, 'payment-receipt-demo-final.mp4');
  await appendEndCard(cfg, { video: out, card, out: finalOut, seconds: 6 }).catch((e) => log('⚠ end card:', e.message));
  await browser.close();

  const chapters = buildYoutubeChapters(alignChapterTimeline(nar.timeline, { syncScale }), { labels: CHAPTER_LABELS });
  writeVideoMeta(finalOut, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', finalOut);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
