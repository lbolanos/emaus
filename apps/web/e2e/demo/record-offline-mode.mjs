// Narrated demo: working without signal at the retreat house (specs/offline-mode).
//
// Story, with the browser clock pinned to each moment of the retreat weekend:
//   1. Wednesday at home, with signal: where the connectivity chip lives, and
//      "Preparar para trabajar sin conexión" on the retreat dashboard.
//   2. Friday at the door, no signal: Reception from the saved data, charge and
//      mark the arrival of a walker; the chip counts what waits for signal.
//   3. Saturday morning, still no signal: cancel the walker who never came,
//      health views need connection, a reload keeps everything.
//   4. The signal comes back: the pending list empties by itself.
//
// Needs a PRODUCTION build served by `vite preview` (the service worker serves the
// app offline) and the worktree API on a DISPOSABLE database copy: the sync really
// writes. The script undoes what it wrote (payment, arrival, cancellation) at the
// end; the bed and table a cancellation frees are not given back.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:4179 node e2e/demo/record-offline-mode.mjs
//
// PII: every /api answer goes through the canonical maskRoute. Two things specific
// to this video:
// - route.fetch() IGNORES context.setOffline (Playwright makes the request itself),
//   so while "offline" the mask must abort instead, or the app silently gets live
//   server data and the video lies (it showed real diets "offline" on 2026-10-20).
// - A built-in gate collects the page text at every beat and fails if any real full
//   name, email or phone of the retreat appears. It first proves it can detect them.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, alignChapterTimeline,
  writeVideoMeta, OUTPUT_DIR, maskRoute, detectCaptionChanges, anchorTimelineToCaptions,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const RID = process.env.RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';
const AMOUNT = 3100;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Trabajar sin conexión');

// Scene tag (top right): when this happens in the retreat weekend. Kept in
// sessionStorage so it survives the offline reload.
const SCENE_INIT = `
(() => {
  const paint = () => {
    if (!document.body) return;
    let el = document.getElementById('__demo_scene');
    const text = sessionStorage.getItem('__demo_scene') || '';
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_scene';
      el.style.cssText = 'position:fixed;top:44px;right:18px;z-index:2147483647;pointer-events:none;background:rgba(17,17,27,.86);color:#fff;font:600 15px Inter,system-ui,sans-serif;padding:7px 15px;border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,.25);';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  };
  window.__scene = (t) => { try { sessionStorage.setItem('__demo_scene', t || ''); } catch {} paint(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();
})();
`;

const LINES = [
  // ── Wednesday at home ──
  { id: 'intro', text: 'En muchas casas de retiro casi no hay señal. Emaús sigue funcionando sin conexión y envía tus cambios cuando vuelve.' },
  { id: 'chipOnline', text: 'En el menú, bajo tu nombre, ves si hay conexión con el servidor. Ahora dice En línea.' },
  { id: 'sidebarDashboard', text: 'Antes de salir, con buena señal, entra al Dashboard del Retiro, en la sección Principal.' },
  { id: 'prepareCard', text: 'Desde una semana antes aparece la tarjeta Trabajar sin conexión. Este teléfono todavía no tiene el retiro.' },
  { id: 'prepareClick', text: 'Toca Preparar. Se descargan caminantes, servidores, recepción, camas, mesas y el minuto a minuto.' },
  { id: 'prepareDone', text: 'Listo: te dice cuándo se descargó y cuánto ocupa. Los datos de salud nunca se guardan en el teléfono.' },
  { id: 'prepareAuto', text: 'Durante el retiro se actualiza solo cada vez que hay señal, y se borra cuando el retiro termina.' },
  { id: 'iphone', text: 'En iPhone, agrega la app a tu pantalla de inicio desde Safari.' },
  // ── Friday at the door ──
  { id: 'signalGone', text: 'Viernes en la casa de retiro, y no hay señal. Igual entras a Recepción, en la sección Personas.' },
  { id: 'offlineChip', text: 'La etiqueta del menú cambia a Sin conexión.' },
  { id: 'offlineBanner', text: 'Y arriba ves de hace cuánto son los datos guardados en el teléfono.' },
  { id: 'chargeIntro', text: 'Llega una caminante que no ha pagado. Toca Cobrar.' },
  { id: 'chargeForm', text: 'Escribes el monto, eliges la forma de pago y registras, igual que con señal.' },
  { id: 'chargeSaved', text: 'El cobro ya aparece en su renglón, guardado en el teléfono. Se enviará solo cuando vuelva la señal.' },
  { id: 'arrive', text: 'Marca su llegada. Se guarda la hora en que tocaste el botón, no la hora en que se envía.' },
  { id: 'chipPending', text: 'La etiqueta cuenta los cambios que esperan señal.' },
  // ── Saturday morning ──
  { id: 'noShow', text: 'Se espera hasta el viernes en la noche. El sábado en la mañana, a quien no llegó lo cancelas con No llegó.' },
  { id: 'noShowDone', text: 'Confirmas, y se libera su cama y su mesa. También queda guardado en el teléfono.' },
  { id: 'sidebarFood', text: 'En Reportes, Alimentos y medicinas necesitan conexión.' },
  { id: 'health', text: 'Las dietas, los medicamentos y los contactos de emergencia nunca se guardan en el teléfono.' },
  { id: 'reload', text: 'Aunque recargues la página sin señal, la app abre y tus cambios siguen ahí.' },
  { id: 'panelIntro', text: 'Toca la etiqueta para ver lo que hiciste sin señal, en el orden en que lo hiciste.' },
  { id: 'conflictNote', text: 'Si el servidor rechaza alguno, por ejemplo una cama que ya ocupó otro, queda aquí con el motivo para reintentar o descartar.' },
  // ── Signal back ──
  { id: 'signalBack', text: 'Cuando vuelve la señal, los cambios se envían solos y en orden. No tienes que hacer nada.' },
  { id: 'synced', text: 'La lista queda vacía y la etiqueta vuelve a En línea. Un cobro nunca se registra dos veces.' },
  { id: 'outro', text: 'Así trabajas el fin de semana: preparas el teléfono antes, trabajas sin señal y todo se envía al volver.' },
];

const YT_TITLE = 'Trabajar sin conexión en la casa de retiro con Emaús';
const YT_DESCRIPTION =
  'Cómo seguir trabajando cuando en la casa de retiro no hay señal. Antes de salir preparas el teléfono ' +
  'desde el Dashboard del Retiro; sin señal consultas Recepción con los datos guardados, cobras, marcas ' +
  'llegadas y cancelas a quien no llegó; al volver la señal todo se envía solo, en orden y con la hora real. ' +
  'Los datos de salud nunca se guardan en el teléfono. Los nombres mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'sin conexión', 'offline', 'recepción', 'sincronización', 'tutorial'];
const CHAPTER_LABELS = {
  intro: 'Sin señal en la casa de retiro', chipOnline: 'Dónde ves la conexión', sidebarDashboard: 'Preparar el teléfono',
  prepareCard: 'La tarjeta Trabajar sin conexión', prepareClick: 'Descargar el retiro', prepareDone: 'Qué se descarga',
  prepareAuto: 'Se actualiza y se borra solo', iphone: 'En iPhone', signalGone: 'Recepción sin señal',
  offlineChip: 'La etiqueta sin conexión', offlineBanner: 'De cuándo son los datos', chargeIntro: 'Cobrar sin señal',
  chargeForm: 'El cobro', chargeSaved: 'Cobro guardado en el teléfono', arrive: 'Marcar la llegada',
  chipPending: 'Cambios que esperan señal', noShow: 'Cancelar a quien no llegó', noShowDone: 'Se libera cama y mesa',
  sidebarFood: 'Los datos de salud', health: 'Salud solo con conexión', reload: 'Recargar sin señal',
  panelIntro: 'Los cambios sin enviar', conflictNote: 'Si el servidor rechaza un cambio', signalBack: 'Cuando vuelve la señal',
  synced: 'Todo enviado', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

// The retreat's own days, in Mexico City time (UTC-6 all year since 2022).
function weekend(startDate) {
  const localMidnight = Date.parse(startDate) + 6 * 3600 * 1000; // start day 00:00 CDMX
  const at = (hoursFromStart) => new Date(localMidnight + hoursFromStart * 3600 * 1000);
  return {
    // Wednesday, not Thursday: the day before the retreat already counts as live
    // (RETREAT_GRACE_DAYS_BEFORE) and the phone would have downloaded it by itself.
    wednesdayEvening: at(-28), // Wednesday 20:00
    fridayDoor: at(18.5), // Friday 18:30
    saturdayMorning: at(32.5), // Saturday 08:30
    saturdaySignal: at(33.25), // Saturday 09:15
  };
}

async function cueBox(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch {}
}

// Sidebar sections are an accordion; clicking an open header closes it.
async function expandSection(page, name) {
  const header = page.locator('aside button[aria-expanded]', { hasText: new RegExp(`^\\s*${name}\\s*$`, 'i') }).first();
  if ((await header.getAttribute('aria-expanded').catch(() => null)) !== 'true') await header.click().catch(() => {});
  await sleep(page, 450);
}
const sidebarLink = (page, name) => page.locator('aside').getByRole('link', { name }).first();
const receptionRow = (page, idOnRetreat) =>
  page.locator('li').filter({ hasText: new RegExp(`^\\s*${idOnRetreat}(?!\\d)`) }).first();

async function loginState(browser) {
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
      const state = await auth.storageState();
      await auth.close();
      return state;
    } catch (e) {
      await auth.close();
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// API calls with the session, outside any page route (never masked, never recorded).
function serverApi(context) {
  const req = context.request;
  const url = (p) => `${cfg.baseUrl}/api${p}`;
  const csrf = async () => (await (await req.get(url('/csrf-token'))).json()).csrfToken;
  return {
    get: async (p) => (await req.get(url(p))).json(),
    send: async (method, p, data) => {
      const res = await req.fetch(url(p), { method, data, headers: { 'x-csrf-token': await csrf() } });
      if (!res.ok()) throw new Error(`${method} ${p} → ${res.status()}`);
    },
  };
}

// Real identities that must never be on screen: full names, emails, phones.
async function realIdentities(api) {
  const people = await api.get(`/participants?retreatId=${RID}`);
  const me = await api.get('/auth/status');
  const names = new Set();
  const emails = new Set();
  const phones = new Set();
  const add = (p) => {
    const full = `${(p.firstName || '').trim()} ${(p.lastName || '').trim()}`.trim();
    if (full.length > 8 && (p.lastName || '').trim().length > 3) names.add(full);
    if (p.email && p.email.includes('@')) emails.add(p.email.trim().toLowerCase());
    for (const k of ['cellPhone', 'homePhone', 'workPhone']) {
      const digits = String(p[k] || '').replace(/\D/g, '');
      if (digits.length >= 10) phones.add(digits.slice(-10));
    }
  };
  (Array.isArray(people) ? people : people.data || []).forEach(add);
  const user = me.user || me;
  if (user?.displayName && user.displayName.length > 8) names.add(user.displayName.trim());
  if (user?.email) emails.add(user.email.toLowerCase());
  return { names: [...names], emails: [...emails], phones: [...phones] };
}

function findLeaks(texts, ids) {
  const leaks = new Set();
  for (const { beat, text } of texts) {
    const lower = text.toLowerCase();
    const digits = text.replace(/\D/g, '');
    for (const n of ids.names) if (text.includes(n)) leaks.add(`${beat}: name`);
    for (const e of ids.emails) if (lower.includes(e)) leaks.add(`${beat}: email`);
    for (const p of ids.phones) if (digits.includes(p)) leaks.add(`${beat}: phone`);
  }
  return [...leaks];
}

async function main() {
  ensureOutputDir();
  log('🎙️  TTS…');
  const clips = {};
  for (const l of LINES) clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };

  const browser = await chromium.launch({ headless: false, slowMo: 45 });
  log('🔐 Login…');
  const state = await loginState(browser);

  // Facts from the server before recording (ids only; names are never logged).
  const setup = await browser.newContext({ storageState: state });
  const api = serverApi(setup);
  const retreat = await api.get(`/retreats/${RID}`);
  const times = weekend(retreat.startDate);
  const reception = await api.get(`/participants/reception/${RID}`);
  const unpaid = reception.pendingList.find((w) => !Number(w.totalPaid));
  const noShow = reception.pendingList.find((w) => w !== unpaid);
  if (!unpaid || !noShow) throw new Error('needs two pending walkers, one with nothing paid');
  const paymentsBefore = new Set(((await api.get(`/payments/participant/${unpaid.participantId}`)) || []).map((p) => p.id));
  const ids = await realIdentities(api);
  log(`🛡  gate watches ${ids.names.length} names, ${ids.emails.length} emails, ${ids.phones.length} phones`);

  const ctx = await browser.newContext({
    storageState: state, viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.clock.setFixedTime(times.wednesdayEvening);
  await ctx.addInitScript((rid) => {
    localStorage.setItem('preferred-locale', 'es');
    localStorage.setItem('selectedRetreatId', rid);
  }, RID);
  await ctx.addInitScript(OVERLAY);
  await ctx.addInitScript(SCENE_INIT);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  page.on('dialog', (d) => void d.accept().catch(() => {}));

  let offline = false;
  await page.route('**/api/**', (route) => (offline ? route.abort('internetdisconnected') : maskRoute(route)));
  const setSignal = async (on) => {
    offline = !on;
    await ctx.setOffline(!on);
  };
  const scene = (text) => page.evaluate((t) => window.__scene?.(t), text).catch(() => {});

  // PII gate: page text at every beat.
  const seen = [];
  const capture = async (beat) => {
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    seen.push({ beat, text });
  };

  const video = page.video();
  const nar = new Narrator(page, cfg);
  const say = async (id) => {
    await nar.say(clips[id]);
    await capture(id);
  };
  nar.start();
  const chip = page.getByTestId('connectivity-chip');

  try {
    // Dead lead (trimmed by muxVideo): first load, service worker takes control.
    await page.goto(`${cfg.baseUrl}/app/walkers`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 60000 })
      .catch(() => log('⚠ no service worker controller'));
    await sleep(page, 1200);

    // ═══════════════ 1. WEDNESDAY AT HOME ═══════════════
    await scene('Miércoles en casa · con señal');
    await say('intro');
    await cueBox(nar, chip);
    await say('chipOnline');

    await expandSection(page, 'Principal');
    const dashLink = sidebarLink(page, /^Dashboard del Retiro/);
    await cueBox(nar, dashLink);
    await say('sidebarDashboard');
    await dashLink.click().catch(() => {});
    await page.getByTestId('offline-prepare-card').waitFor({ timeout: 15000 }).catch(() => log('⚠ no prepare card'));
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await nar.clearCue();

    const status = page.getByTestId('offline-prepare-status');
    await cueBox(nar, status);
    await say('prepareCard');
    const prepare = page.getByTestId('offline-prepare-button');
    await cueBox(nar, prepare);
    await sleep(page, 500);
    await prepare.click().catch(() => {});
    await say('prepareClick');
    await page.waitForFunction(
      () => /Descargado/.test(document.querySelector('[data-testid=offline-prepare-status]')?.textContent || ''),
      null, { timeout: 60000 },
    ).catch(() => log('⚠ prepare did not finish'));
    await cueBox(nar, status);
    await say('prepareDone');
    await say('prepareAuto');
    await nar.clearCue();
    await say('iphone');

    // ═══════════════ 2. FRIDAY AT THE DOOR, NO SIGNAL ═══════════════
    await setSignal(false);
    await ctx.clock.setFixedTime(times.fridayDoor);
    await scene('Viernes 6:30 p. m. · sin señal');
    await expandSection(page, 'Personas');
    const recepLink = sidebarLink(page, /^Recepción/);
    await cueBox(nar, recepLink);
    await say('signalGone');
    await recepLink.click().catch(() => {});
    await page.getByText('Recepción de Caminantes').first().waitFor({ timeout: 15000 }).catch(() => log('⚠ reception not shown'));
    await page.getByTestId('offline-banner').waitFor({ timeout: 10000 }).catch(() => log('⚠ no offline banner'));
    await sleep(page, 700);

    await cueBox(nar, chip);
    await say('offlineChip');
    await cueBox(nar, page.getByTestId('offline-banner'));
    await say('offlineBanner');

    const rowA = receptionRow(page, unpaid.idOnRetreat);
    const charge = rowA.getByRole('button', { name: /Cobrar/ });
    await cueBox(nar, charge);
    await say('chargeIntro');
    await charge.click().catch(() => log('⚠ no charge button'));
    await sleep(page, 700);
    await page.locator('input[type="number"]').first().fill(String(AMOUNT)).catch(() => {});
    await sleep(page, 400);
    const register = page.getByRole('button', { name: 'Registrar pago' });
    await cueBox(nar, register);
    await say('chargeForm');
    await register.click().catch(() => log('⚠ register failed'));
    // Reception's own success toast replaces the "Guardado en el teléfono" one
    // (TOAST_LIMIT = 1), so the beat points at what the screen really shows.
    const paid = rowA.getByText(`$${AMOUNT.toLocaleString('en-US')}.00`).first();
    await paid.waitFor({ timeout: 6000 }).catch(() => log('⚠ payment not painted'));
    await cueBox(nar, paid);
    await say('chargeSaved');

    const arrived = rowA.getByRole('button', { name: 'Llegó', exact: true });
    await cueBox(nar, arrived);
    await say('arrive');
    await arrived.click().catch(() => log('⚠ arrival failed'));
    await sleep(page, 1000);
    await cueBox(nar, chip);
    await say('chipPending');

    // ═══════════════ 3. SATURDAY MORNING, STILL NO SIGNAL ═══════════════
    await ctx.clock.setFixedTime(times.saturdayMorning);
    await scene('Sábado 8:30 a. m. · sin señal');
    const cancel = receptionRow(page, noShow.idOnRetreat).getByTestId('reception-cancel-no-show');
    await cueBox(nar, cancel);
    await say('noShow');
    await cancel.click().catch(() => log('⚠ cancel failed'));
    await sleep(page, 1000);
    await nar.clearCue();
    await say('noShowDone');

    await expandSection(page, 'Reportes');
    const foodLink = sidebarLink(page, /^Alimentos/);
    await cueBox(nar, foodLink);
    await say('sidebarFood');
    await foodLink.click().catch(() => {});
    const healthNote = page.getByTestId('health-needs-connection');
    await healthNote.waitFor({ timeout: 10000 }).catch(() => log('⚠ no health note'));
    await sleep(page, 500);
    await cueBox(nar, healthNote);
    await say('health');

    await expandSection(page, 'Personas');
    await sidebarLink(page, /^Recepción/).click().catch(() => {});
    await page.getByText('Recepción de Caminantes').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 600);
    await nar.clearCue();
    await page.reload().catch(() => log('⚠ offline reload failed'));
    await page.getByText('Recepción de Caminantes').first().waitFor({ timeout: 20000 }).catch(() => log('⚠ no app after reload'));
    await sleep(page, 1200);
    await say('reload');

    await cueBox(nar, chip);
    await say('panelIntro');
    await chip.click().catch(() => {});
    await page.getByRole('dialog').getByText('Cambios sin enviar').first().waitFor({ timeout: 5000 }).catch(() => log('⚠ no pending panel'));
    await sleep(page, 600);
    await nar.clearCue();
    await say('conflictNote');

    // ═══════════════ 4. THE SIGNAL COMES BACK ═══════════════
    await ctx.clock.setFixedTime(times.saturdaySignal);
    await scene('Sábado 9:15 a. m. · volvió la señal');
    await setSignal(true);
    await say('signalBack');
    await page.waitForFunction(
      () => document.querySelector('[data-testid=connectivity-chip]')?.getAttribute('data-pending') === '0',
      null, { timeout: 60000 },
    ).catch(() => log('⚠ queue did not empty'));
    await sleep(page, 800);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 500);
    await cueBox(nar, chip);
    await say('synced');
    await nar.clearCue();
    await say('outro');
    await sleep(page, 800);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-offline-mode.png') }).catch(() => {});
  }

  const finalPending = await chip.getAttribute('data-pending').catch(() => '?');
  const finalConflicts = await chip.getAttribute('data-conflicts').catch(() => '?');
  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();

  // What the server received, then leave the disposable DB as it was.
  const after = await api.get(`/participants/reception/${RID}`);
  const arrivedOnServer = after.arrivedList.find((e) => e.participantId === unpaid.participantId);
  const cancelledOnServer = ![...after.pendingList, ...after.arrivedList].some((e) => e.participantId === noShow.participantId);
  const newPayments = ((await api.get(`/payments/participant/${unpaid.participantId}`)) || []).filter((p) => !paymentsBefore.has(p.id));
  log(`🗄  server: arrival at ${arrivedOnServer?.checkedInAt ?? 'missing'} (device ${times.fridayDoor.toISOString()}), ` +
    `cancelled=${cancelledOnServer}, new payments=${newPayments.length}, chip pending=${finalPending} conflicts=${finalConflicts}`);
  for (const p of newPayments) await api.send('delete', `/payments/${p.id}`).catch((e) => log('⚠ cleanup', e.message));
  await api.send('put', `/participants/${unpaid.participantId}/checkin`, { retreatId: RID, checkedIn: false }).catch((e) => log('⚠ cleanup', e.message));
  await api.send('put', `/participants/${noShow.participantId}`, { isCancelled: false, contextRetreatId: RID }).catch((e) => log('⚠ cleanup', e.message));

  // The gate must be able to fail: an unmasked page of the same retreat has to trip it.
  const probePage = await setup.newPage();
  await probePage.goto(`${cfg.baseUrl}/app/retreats/${RID}/reception`, { waitUntil: 'networkidle' }).catch(() => {});
  await probePage.getByText('Recepción de Caminantes').first().waitFor({ timeout: 15000 }).catch(() => {});
  const unmasked = await probePage.evaluate(() => document.body.innerText).catch(() => '');
  const gateWorks = findLeaks([{ beat: 'unmasked-probe', text: unmasked }], ids).length > 0;
  await setup.close();
  await browser.close();

  const leaks = findLeaks(seen, ids);
  log(`🛡  PII gate: ${leaks.length === 0 ? 'clean' : 'LEAKS'} over ${seen.length} beats; detects unmasked data: ${gateWorks}`);
  for (const l of leaks) log('   ✗', l);

  log('🎬', videoPath);
  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s clock ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  // The drift is uneven here (on time until offline, then ~10% long): one global
  // scale misplaces the voice, so every clip starts where its subtitle appears.
  const anchored = anchorTimelineToCaptions(nar.timeline, await detectCaptionChanges(cfg, videoPath), { fallbackScale: syncScale });
  log(`🎯 clips anchored to their subtitle: ${anchored.filter((t) => t.anchored).length}/${anchored.length}`);
  const out = path.join(OUTPUT_DIR, 'offline-mode-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: anchored, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale: 1 });
  const chapters = buildYoutubeChapters(alignChapterTimeline(anchored, { syncScale: 1 }), { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Done:', out);
  for (const t of anchored) log(`  ${(t.offsetMs / 1000).toFixed(2)}s${t.anchored ? '' : ' (not anchored)'}  ${t.id}`);
  if (leaks.length > 0 || !gateWorks) process.exitCode = 2;
}
main().catch((e) => { console.error(e); process.exit(1); });
