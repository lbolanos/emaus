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
import { writeFileSync } from 'node:fs';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, alignChapterTimeline,
  writeVideoMeta, OUTPUT_DIR, maskRoute, detectCaptionChanges, anchorTimelineToCaptions, fakeFor, clipOverlaps,
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

// Printing on camera without the OS print dialog (it would block a headed page
// and never shows in the page video): window.print only counts, and the table
// sheets, which the app writes into a window.open() popup, are kept to be shown
// inside the page instead.
const PRINT_INIT = `
(() => {
  window.__printCalls = 0;
  window.print = () => { window.__printCalls += 1; };
  window.open = () => ({
    document: { open() {}, write(html) { window.__printHtml = html; }, close() {} },
    focus() {}, print() {}, close() {},
  });
})();
`;

/** Shows the sheet the app "printed" over the page; returns its text for the PII gate. */
async function showPrintedSheet(page) {
  return page.evaluate(() => {
    const html = (window.__printHtml || '').replace(/<script[\s\S]*?<\/script>/gi, '');
    window.__printHtml = '';
    const wrap = document.createElement('div');
    wrap.id = '__demo_sheet';
    wrap.style.cssText = 'position:fixed;inset:70px 70px 120px 70px;z-index:2147483646;background:#fff;border-radius:10px;box-shadow:0 12px 44px rgba(0,0,0,.45);overflow:hidden;';
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', '');
    frame.style.cssText = 'width:100%;height:100%;border:0;';
    frame.srcdoc = html;
    wrap.appendChild(frame);
    document.body.appendChild(wrap);
    const text = new DOMParser().parseFromString(html, 'text/html').body.innerText || '';
    return text;
  });
}
const hidePrintedSheet = (page) => page.evaluate(() => document.getElementById('__demo_sheet')?.remove()).catch(() => {});

// Toasts sit bottom right, under the centred subtitle: move the subtitle left for
// those beats (still inside the strip detectCaptionChanges reads).
const captionAside = (page, aside) =>
  page.evaluate((a) => {
    const cap = document.getElementById('__demo_cap');
    if (!cap) return;
    cap.style.left = a ? '36%' : '50%';
    cap.style.maxWidth = a ? '52%' : '82%';
  }, aside).catch(() => {});

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
  { id: 'chargeSaved', text: 'El aviso dice que el pago quedó guardado en el teléfono. Se enviará solo cuando vuelva la señal.' },
  { id: 'arrive', text: 'Marca su llegada. Se guarda la hora en que tocaste el botón, no la hora en que se envía.' },
  { id: 'chipPending', text: 'La etiqueta cuenta los cambios que esperan señal.' },
  // ── Saturday morning ──
  { id: 'noShow', text: 'Se espera hasta el viernes en la noche. El sábado en la mañana, a quien no llegó lo cancelas con No llegó.' },
  { id: 'noShowDone', text: 'Confirmas, y se libera su cama y su mesa. También queda guardado en el teléfono.' },
  { id: 'editIntro', text: '¿Hay que corregir un dato? En Personas, Caminantes, abre su ficha.' },
  { id: 'editNotice', text: 'Sin señal te avisa qué se puede guardar: nombre, apodo, teléfonos, parroquia, dirección, talla y si ronca.' },
  { id: 'editSave', text: 'Cambias la parroquia y guardas.' },
  { id: 'editSaved', text: 'Queda guardado en el teléfono. Si alguien más cambió ese mismo dato, tu cambio no lo pisa.' },
  { id: 'sidebarFood', text: 'En Reportes, Alimentos y medicinas necesitan conexión.' },
  { id: 'health', text: 'Las dietas, los medicamentos y los contactos de emergencia nunca se guardan en el teléfono.' },
  { id: 'printIntro', text: 'Sin señal también imprimes. En Reportes, Gafetes Caminantes.' },
  { id: 'printBadges', text: 'Los gafetes salen completos, con su mesa, su cuarto y el logo.' },
  { id: 'printTablesNav', text: 'En Asignaciones, Mesas, el menú Imprimir arma las hojas de cada mesa.' },
  { id: 'printTables', text: 'Sale con roles y teléfonos. Lo de salud dice Solo con conexión, porque no se guarda en el teléfono.' },
  { id: 'printMam', text: 'Y en Logística, el minuto a minuto se imprime desde este menú, listo para pegarlo en la pared.' },
  { id: 'reload', text: 'Aunque recargues la página sin señal, la app abre y tus cambios siguen ahí.' },
  { id: 'panelIntro', text: 'Toca la etiqueta para ver lo que hiciste sin señal, en el orden en que lo hiciste.' },
  { id: 'conflictNote', text: 'Si el servidor rechaza alguno, por ejemplo una cama que ya ocupó otro, queda aquí con el motivo para reintentar o descartar.' },
  // ── Signal back ──
  { id: 'signalBack', text: 'Cuando vuelve la señal, los cambios se envían solos y en orden. No tienes que hacer nada.' },
  { id: 'synced', text: 'La lista queda vacía y la etiqueta vuelve a En línea. Un cobro nunca se registra dos veces.' },
  { id: 'outro', text: 'Así trabajas el fin de semana: preparas el teléfono, trabajas e imprimes sin señal, y todo se envía al volver.' },
];

const YT_TITLE = 'Trabajar sin conexión en la casa de retiro con Emaús';
const YT_DESCRIPTION =
  'Cómo seguir trabajando cuando en la casa de retiro no hay señal. Antes de salir preparas el teléfono ' +
  'desde el Dashboard del Retiro; sin señal consultas Recepción con los datos guardados, cobras, marcas ' +
  'llegadas, cancelas a quien no llegó, corriges datos de la ficha e imprimes gafetes, hojas de mesas y el ' +
  'minuto a minuto; al volver la señal todo se envía solo, en orden y con la hora real, sin pisar lo que otra ' +
  'persona haya cambiado. Los datos de salud nunca se guardan en el teléfono. Los nombres mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'sin conexión', 'offline', 'recepción', 'imprimir', 'sincronización', 'tutorial'];
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
  editIntro: 'Corregir un dato de la ficha', editNotice: 'Qué se guarda sin señal', editSave: 'Guardar la corrección',
  editSaved: 'Nadie pisa el cambio de otro', printIntro: 'Imprimir sin señal', printBadges: 'Gafetes',
  printTablesNav: 'Hojas de mesas', printTables: 'La hoja de mesas impresa', printMam: 'Minuto a minuto impreso',
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
  // The walker whose record gets corrected: one with a unique masked name (the
  // list on screen is masked, so the search uses the name it shows).
  const everyone = await api.get(`/participants?retreatId=${RID}`);
  const activeWalkers = everyone.filter((p) => p.type === 'walker' && !p.isCancelled);
  const shownName = (p) => `${fakeFor(p.id).first} ${fakeFor(p.id).last}`;
  const corrected = activeWalkers.find(
    (p) =>
      p.id !== unpaid.participantId && p.id !== noShow.participantId && p.parish &&
      activeWalkers.filter((q) => shownName(q) === shownName(p)).length === 1,
  );
  if (!corrected) throw new Error('needs a walker whose record can be corrected');
  const NEW_PARISH = corrected.parish === 'San Judas Tadeo' ? 'Santa Teresita' : 'San Judas Tadeo';
  const ids = await realIdentities(api);
  log(`🛡  gate watches ${ids.names.length} names, ${ids.emails.length} emails, ${ids.phones.length} phones`);

  const ctx = await browser.newContext({
    storageState: state, viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.clock.setSystemTime(times.wednesdayEvening);
  await ctx.addInitScript((rid) => {
    localStorage.setItem('preferred-locale', 'es');
    localStorage.setItem('selectedRetreatId', rid);
  }, RID);
  await ctx.addInitScript(OVERLAY);
  await ctx.addInitScript(SCENE_INIT);
  await ctx.addInitScript(PRINT_INIT);
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
    await ctx.clock.setSystemTime(times.fridayDoor);
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
    // Reception's own toast carries the "saved on the phone" note (queuedToast.ts).
    const savedNote = page.getByText(/Guardado en el teléfono: se enviará/).first();
    await savedNote.waitFor({ timeout: 6000 }).catch(() => log('⚠ no saved-on-the-phone note'));
    await cueBox(nar, savedNote);
    await captionAside(page, true);
    await say('chargeSaved');

    const arrived = rowA.getByRole('button', { name: 'Llegó', exact: true });
    await cueBox(nar, arrived);
    await captionAside(page, false);
    await say('arrive');
    await arrived.click().catch(() => log('⚠ arrival failed'));
    await sleep(page, 1000);
    await cueBox(nar, chip);
    await say('chipPending');

    // ═══════════════ 3. SATURDAY MORNING, STILL NO SIGNAL ═══════════════
    await ctx.clock.setSystemTime(times.saturdayMorning);
    await scene('Sábado 8:30 a. m. · sin señal');
    const cancel = receptionRow(page, noShow.idOnRetreat).getByTestId('reception-cancel-no-show');
    await cueBox(nar, cancel);
    await say('noShow');
    await cancel.click().catch(() => log('⚠ cancel failed'));
    await sleep(page, 1000);
    await nar.clearCue();
    await say('noShowDone');

    // Correct a record without signal (D13).
    await expandSection(page, 'Personas');
    const walkersLink = sidebarLink(page, /^Caminantes/);
    await cueBox(nar, walkersLink);
    await say('editIntro');
    await walkersLink.click().catch(() => {});
    const search = page.locator('input[placeholder="Buscar..."]').first();
    await search.waitFor({ timeout: 15000 }).catch(() => log('⚠ walkers not shown'));
    await search.fill(shownName(corrected)).catch(() => {});
    await sleep(page, 900);
    await page.getByRole('button', { name: 'Editar Participante' }).first().click().catch(() => log('⚠ no edit button'));
    const notice = page.getByTestId('offline-edit-notice');
    await notice.waitFor({ timeout: 10000 }).catch(() => log('⚠ no offline edit notice'));
    await cueBox(nar, notice);
    await say('editNotice');
    const parish = page.locator('#parish');
    await parish.fill(NEW_PARISH).catch(() => log('⚠ no parish field'));
    const save = page.getByRole('button', { name: 'Guardar' }).last();
    await cueBox(nar, save);
    await say('editSave');
    await save.click().catch(() => {});
    const editToast = page.getByText('Guardado en el teléfono').first();
    await editToast.waitFor({ timeout: 6000 }).catch(() => log('⚠ no edit toast'));
    await cueBox(nar, editToast);
    await captionAside(page, true);
    await say('editSaved');
    await nar.clearCue();

    await expandSection(page, 'Reportes');
    const foodLink = sidebarLink(page, /^Alimentos/);
    await cueBox(nar, foodLink);
    await captionAside(page, false);
    await say('sidebarFood');
    await foodLink.click().catch(() => {});
    const healthNote = page.getByTestId('health-needs-connection');
    await healthNote.waitFor({ timeout: 10000 }).catch(() => log('⚠ no health note'));
    await sleep(page, 500);
    await cueBox(nar, healthNote);
    await say('health');

    // Printing without signal: badges, table sheets, minuto a minuto.
    await expandSection(page, 'Reportes');
    const badgesLink = sidebarLink(page, /^Gafetes Caminantes/);
    await cueBox(nar, badgesLink);
    await say('printIntro');
    await badgesLink.click().catch(() => {});
    await page.locator('.badge-item').first().waitFor({ timeout: 15000 }).catch(() => log('⚠ no badges'));
    await sleep(page, 700);
    await page.locator('main button[aria-haspopup="menu"]:visible').last().click().catch(() => {});
    await sleep(page, 500);
    await page.getByRole('menuitem', { name: /^\s*Imprimir Gafetes\s*$/ }).first().click().catch(() => log('⚠ no badge print'));
    await nar.clearCue();
    await page.emulateMedia({ media: 'print' });
    await sleep(page, 600);
    await say('printBadges');
    await page.emulateMedia({ media: 'screen' });

    await expandSection(page, 'Asignaciones');
    const tablesLink = sidebarLink(page, /^Mesas/);
    await cueBox(nar, tablesLink);
    await tablesLink.click().catch(() => {});
    await page.getByText(/Mesa\s+\d/).first().waitFor({ timeout: 15000 }).catch(() => log('⚠ no tables'));
    await sleep(page, 700);
    await page.locator('main button[aria-haspopup="menu"]:visible').last().click().catch(() => {});
    const printSub = page.getByRole('menuitem', { name: /^\s*Imprimir\s*$/ }).first();
    await printSub.focus().catch(() => {});
    await printSub.press('ArrowRight').catch(() => {});
    const sheetItem = page.getByRole('menuitem', { name: 'Imprimir Mesas', exact: true }).first();
    await sheetItem.waitFor({ timeout: 4000 }).catch(() => log('⚠ no table print item'));
    await cueBox(nar, sheetItem);
    await say('printTablesNav');
    await sheetItem.click().catch(() => {});
    await sleep(page, 600);
    await nar.clearCue();
    const sheetText = await showPrintedSheet(page);
    seen.push({ beat: 'printTables-sheet', text: sheetText });
    if (!/Solo con conexión/.test(sheetText)) log('⚠ the sheet does not say "Solo con conexión"');
    await sleep(page, 500);
    await say('printTables');
    await hidePrintedSheet(page);

    await expandSection(page, 'Logística');
    const mamLink = sidebarLink(page, /^Minuto a Minuto/);
    await cueBox(nar, mamLink);
    await mamLink.click().catch(() => {});
    await page.locator('[id^="schedule-item-"]').first().waitFor({ timeout: 15000 }).catch(() => log('⚠ no MAM'));
    await sleep(page, 700);
    // Point at the print action instead of rendering the whole agenda as print:
    // that relayout made the recorder drop ~4 s of frames (2026-10-20).
    await page.locator('main button[aria-haspopup="menu"]:visible').last().click().catch(() => {});
    const mamPrint = page.getByRole('menuitem', { name: /Imprimir/ }).first();
    await mamPrint.waitFor({ timeout: 4000 }).catch(() => log('⚠ no MAM print item'));
    await cueBox(nar, mamPrint);
    await say('printMam');
    await page.keyboard.press('Escape').catch(() => {});
    await nar.clearCue();

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
    await ctx.clock.setSystemTime(times.saturdaySignal);
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
  const correctedAfter = await api.get(`/participants/${corrected.id}?retreatId=${RID}`);
  log(`🗄  server: corrected parish saved=${correctedAfter.parish === NEW_PARISH}`);
  await api.send('put', `/participants/${corrected.id}`, { parish: corrected.parish, contextRetreatId: RID }).catch((e) => log('⚠ cleanup', e.message));
  const parishBack = (await api.get(`/participants/${corrected.id}?retreatId=${RID}`)).parish === corrected.parish;
  log(`🗄  cleanup: parish restored=${parishBack}`);

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
  const overlaps = clipOverlaps(anchored);
  log(`🔊 overlapping voices: ${overlaps.length === 0 ? 'none' : overlaps.map((o) => `${o.id}→${o.next} ${o.overlapMs} ms`).join(', ')}`);
  writeFileSync(path.join(OUTPUT_DIR, 'offline-mode-demo.timeline.json'), JSON.stringify(anchored, null, 1));
  const out = path.join(OUTPUT_DIR, 'offline-mode-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: anchored, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale: 1 });
  const chapters = buildYoutubeChapters(alignChapterTimeline(anchored, { syncScale: 1 }), { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Done:', out);
  for (const t of anchored) log(`  ${(t.offsetMs / 1000).toFixed(2)}s${t.anchored ? '' : ' (not anchored)'}  ${t.id}`);
  if (leaks.length > 0 || !gateWorks) process.exitCode = 2;
}
main().catch((e) => { console.error(e); process.exit(1); });
