// Video-demo narrado: "Equipo de Recepción" (gafetes, recepción el día del retiro, bolsas).
//
// Cubre el flujo completo del equipo de recepción de un retiro:
//   1. ANTES — Gafetes (Reportes → Gafetes Caminantes): imprimir doble cara, para bolsa, entregar.
//   2. EL DÍA — Recepción (Personas → Recepción): buscar, ver mesa, verificar pago, cobrar,
//      recibir celulares, marcar llegada.
//   3. AL FINAL — Reporte de Bolsas (Reportes → Reporte de Bolsas): checklist, armar por mesa, marcar.
//
// Usa el retiro REAL San Agustín para Gafetes y Bolsas (solo ENMASCARA nombres, determinista).
// Para Recepción SANDBOX: fabrica una lista de "pendientes de llegar" (San Agustín ya llegó al 100%),
// con estados de pago/beca controlados, e intercepta check-in y cobro para no mutar la DB.
//
//   cd apps/web && node e2e/demo/record-reception.mjs

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Recepción');
const SA = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead'; // San Agustín (completo)

// ── Enmascarado de nombres (determinista) ──────────────────────────────────
const FF = ['María', 'José', 'Lucía', 'Miguel', 'Ana', 'Carlos', 'Sofía', 'Diego', 'Laura', 'Pedro',
  'Elena', 'Jorge', 'Paula', 'Andrés', 'Rosa', 'Luis', 'Marta', 'Pablo', 'Clara', 'Raúl',
  'Silvia', 'Hugo', 'Nadia', 'Iván', 'Gloria', 'Tomás', 'Irene', 'Óscar', 'Beatriz', 'Víctor'];
const FL = ['González', 'Ramírez', 'Hernández', 'Torres', 'Flores', 'Jiménez', 'Vargas', 'Castro', 'López', 'Pérez',
  'Díaz', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Ruiz', 'Mendoza', 'Fuentes', 'Ríos', 'Núñez',
  'Campos', 'Vega', 'Rojas', 'Solís', 'Peña', 'Cabrera', 'Ibarra', 'Salas', 'Duarte', 'Prieto'];
function hstr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
const cache = {};
function fakeFor(key) {
  if (!cache[key]) { const h = hstr(String(key)); cache[key] = { first: FF[h % FF.length], last: FL[(Math.floor(h / 7)) % FL.length] }; }
  return cache[key];
}
function maskNode(n) {
  if (Array.isArray(n)) return n.forEach(maskNode);
  if (n && typeof n === 'object') {
    if (typeof n.firstName === 'string') {
      const key = n.id || n.participantId || (n.firstName + '|' + (n.lastName || ''));
      const f = fakeFor(key);
      n.firstName = f.first;
      if ('lastName' in n) n.lastName = f.last;
      if ('nickname' in n && n.nickname) n.nickname = f.first;
      if ('displayName' in n && n.displayName) n.displayName = `${f.first} ${f.last}`;
      if ('email' in n && typeof n.email === 'string' && n.email.includes('@')) n.email = `${f.first}.${f.last}@correo.com`.toLowerCase();
    } else if (typeof n.displayName === 'string' && n.displayName.trim()) {
      const f = fakeFor(n.id || n.displayName); n.displayName = `${f.first} ${f.last}`;
    }
    for (const k of Object.keys(n)) if (typeof n[k] === 'object') maskNode(n[k]);
  }
}

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
let pendingState = [
  mkP(12, 'Miguel', 'Torres', 'Mesa 3', 1500),
  mkP(23, 'Lucía', 'Ramírez', 'Mesa 5', 0),                    // → botón Cobrar
  mkP(31, 'Andrés', 'Flores', 'Mesa 2', 1500),
  mkP(38, 'Paula', 'Jiménez', 'Mesa 7', 0, { scholarship: true }), // → etiqueta Beca
  mkP(45, 'Diego', 'Castro', 'Mesa 4', 1500),
  mkP(52, 'Elena', 'Vargas', 'Mesa 6', 1500),
];
const arrivedState = [];
for (let i = 0; i < 18; i++) {
  const f = FF[i % FF.length], l = FL[(i * 3) % FL.length];
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

async function participantsRoute(route) {
  const req = route.request();
  const url = req.url();
  // Stats de recepción → payload fabricado
  if (req.method() === 'GET' && url.includes('/participants/reception/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(receptionPayload()) });
  }
  // Check-in → mover de pendientes a llegados
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
  // Listado general (gafetes / bolsas) → enmascarar
  if (req.method() === 'GET') {
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      maskNode(data);
      // Para el Reporte de Bolsas: San Agustín tiene el 100% de bolsas hechas.
      // Dejamos ~40% pendientes para que el marcado suba el avance de forma visible.
      if (Array.isArray(data)) {
        let w = 0;
        for (const p of data) {
          if (p && p.type === 'walker') { p.bagMade = (w % 5) >= 2; w++; }
        }
      }
      return route.fulfill({ response: resp, body: JSON.stringify(data) });
    } catch { return route.continue(); }
  }
  return route.continue();
}

async function paymentsRoute(route) {
  const req = route.request();
  if (req.method() === 'POST') {
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* ignore */ }
    const p = pendingState.find((x) => x.participantId === body.participantId);
    if (p) p.totalPaid = Number(body.amount) || p.totalPaid;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'pay-demo', ...body }) });
  }
  return route.continue();
}

const LINES = [
  // ── Gafetes ──
  { id: 'sidebarBadges', text: 'Antes del retiro, en el menú, sección Reportes, entra a Gafetes de Caminantes.' },
  { id: 'badgesIntro', text: 'Aquí están los gafetes de todos: caminantes y servidores, con su nombre, su mesa y su habitación.' },
  { id: 'badgesPrint', text: 'En el menú imprimes a doble cara para doblarlos, o solo los caminantes para meterlos en su bolsa.' },
  { id: 'badgesServers', text: 'Armas los gafetes y le entregas el suyo a cada servidor antes de que empiece el retiro.' },
  // ── Recepción ──
  { id: 'sidebarRecep', text: 'El día del retiro, en el menú, sección Personas, entra a Recepción.' },
  { id: 'recepDash', text: 'Arriba ves cuántos son en total, cuántos han llegado y cuántos faltan, con su barra de avance.' },
  { id: 'recepSearch', text: 'Cuando llega un caminante, búscalo por su nombre o su número.' },
  { id: 'recepMesa', text: 'La etiqueta azul te dice su mesa: con eso encuentras su bolsa y su gafete.' },
  { id: 'recepPay', text: 'Revisa su pago. Si ya pagó, ves el monto en verde; si no, aparece el botón Cobrar.' },
  { id: 'recepCharge', text: 'Cóbrale ahí mismo: escribes el monto, eliges efectivo, transferencia o tarjeta, y registras.' },
  { id: 'recepBeca', text: 'Si el caminante viene becado, en vez del botón verás la etiqueta Beca. A él no se le cobra.' },
  { id: 'recepPhones', text: 'Recibe su celular y su reloj, guárdalos en una bolsa con su nombre, y séllala.' },
  { id: 'recepArrived', text: 'Marca Llegó. El contador baja al instante y todos ven cuántos faltan por llegar.' },
  { id: 'recepBox', text: 'Junta las bolsas de celulares en una caja sellada, que se guarda hasta el final del retiro.' },
  // ── Bolsas ──
  { id: 'sidebarBags', text: 'Al terminar el retiro, en Reportes, entra a Reporte de Bolsas.' },
  { id: 'bagsChecklist', text: 'El checklist te recuerda qué lleva cada bolsa: agua bendita, playera, celular, palancas e invitación.' },
  { id: 'bagsTable', text: 'Y aquí tienes a cada caminante con su mesa y su talla, para armar las bolsas por mesa.' },
  { id: 'bagsMark', text: 'Marca la bolsa cuando quede lista. El avance sube y ves cuántas faltan.' },
  { id: 'bagsMesa', text: 'Busca por mesa para entregarlas ordenadas cuando cada caminante recoja lo suyo.' },
  // ── Cierre ──
  { id: 'outro', text: 'Ese es el trabajo de recepción: gafetes y bolsas antes, recibir y cobrar durante, y entregar todo al final.' },
];

const YT_TITLE = 'Equipo de Recepción en Emaús: gafetes, llegadas y bolsas';
const YT_DESCRIPTION =
  'Tutorial para el equipo de recepción de un retiro en Emaús. Todo el flujo de principio a fin: ' +
  'imprimir y armar los Gafetes (a doble cara para doblar, o solo caminantes para la bolsa) y entregar ' +
  'el suyo a cada servidor. El día del retiro, en Recepción: buscar al caminante por nombre, ver su mesa, ' +
  'verificar el pago y cobrar ahí mismo (efectivo, transferencia o tarjeta), reconocer a los becados, ' +
  'recibir celulares y relojes en una bolsa etiquetada, marcar la llegada y ver en vivo cuántos faltan. ' +
  'Y al terminar, el Reporte de Bolsas: checklist de contenido, armado por mesa y marcado de las bolsas ' +
  'listas. Los nombres mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'recepción', 'gafetes', 'bolsas', 'check-in', 'pagos', 'tutorial'];
const CHAPTER_LABELS = {
  sidebarBadges: 'Dónde están los gafetes', badgesIntro: 'Qué trae cada gafete', badgesPrint: 'Imprimir gafetes',
  badgesServers: 'Armar y entregar', sidebarRecep: 'Dónde está Recepción', recepDash: 'El tablero de llegadas',
  recepSearch: 'Buscar al caminante', recepMesa: 'Su mesa', recepPay: 'Verificar el pago',
  recepCharge: 'Cobrar en recepción', recepBeca: 'Becados', recepPhones: 'Celulares y relojes',
  recepArrived: 'Marcar la llegada', recepBox: 'Caja sellada', sidebarBags: 'Dónde está el reporte de bolsas',
  bagsChecklist: 'Checklist de contenido', bagsTable: 'Armar por mesa', bagsMark: 'Marcar la bolsa',
  bagsMesa: 'Entregar por mesa', outro: 'Resumen',
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
  await page.route('**/participants**', participantsRoute);
  await page.route('**/payments**', paymentsRoute);
  await page.route('**/bag-made**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // ═══════════════ 1. GAFETES ═══════════════
    await page.goto(`${cfg.baseUrl}/app/walker-badges`, { waitUntil: 'networkidle' });
    await page.locator('.badge-item').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1200);

    const reportes = page.locator('button', { hasText: /^\s*Reportes\s*$/i }).first();
    await cueBox(nar, reportes);
    await nar.say(clips.sidebarBadges);
    await reportes.click().catch(() => {});
    await sleep(page, 700);

    await cueBox(nar, page.locator('.badge-item').first());
    await nar.say(clips.badgesIntro);

    // Menú ⋮ con opciones de impresión (NO imprimir — abre diálogo del SO)
    // Acotado a .no-print (el header de gafetes) para no abrir el menú de usuario del sidebar.
    await page.locator('.no-print button[aria-haspopup="menu"]').first().click().catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.getByText(/Imprimir doble cara/i).first());
    await nar.say(clips.badgesPrint);
    await cueBox(nar, page.getByText(/caminantes para bolsa/i).first());
    await nar.say(clips.badgesServers);
    await page.keyboard.press('Escape');
    await sleep(page, 500);

    // ═══════════════ 2. RECEPCIÓN ═══════════════
    await page.goto(`${cfg.baseUrl}/app/retreats/${SA}/reception`, { waitUntil: 'networkidle' });
    await page.getByText('Recepción de Caminantes').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1500);

    const personas = page.locator('button', { hasText: /^\s*Personas\s*$/i }).first();
    await cueBox(nar, personas);
    await nar.say(clips.sidebarRecep);
    await personas.click().catch(() => {});
    await sleep(page, 700);

    await cueBox(nar, page.locator('.grid.grid-cols-3').first());
    await nar.say(clips.recepDash);

    // Buscar a "Lucía" (la que no ha pagado → botón Cobrar)
    const search = page.locator('input[placeholder*="Buscar por nombre"]').first();
    await search.click().catch(() => {});
    await search.fill('Lucía').catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, search);
    await nar.say(clips.recepSearch);

    const luciaRow = page.locator('li', { hasText: 'Ramírez' }).first();
    await cueBox(nar, luciaRow.getByText(/Mesa 5/i).first());
    await nar.say(clips.recepMesa);
    await cueBox(nar, luciaRow.locator('button', { hasText: /Cobrar/i }).first());
    await nar.say(clips.recepPay);

    // Cobrar → diálogo inline
    await luciaRow.locator('button', { hasText: /Cobrar/i }).first().click().catch(() => {});
    await sleep(page, 800);
    await page.locator('input[type="number"]').first().fill('1500').catch(() => {});
    await sleep(page, 500);
    await cueBox(nar, page.getByText(/Registrar pago/i).first());
    await nar.say(clips.recepCharge);
    await page.locator('button', { hasText: /Registrar pago/i }).first().click().catch(() => {});
    await sleep(page, 1200);

    // Beca: buscar a "Paula" (becada → etiqueta Beca)
    await search.fill('').catch(() => {});
    await search.fill('Paula').catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, page.locator('li', { hasText: 'Jiménez' }).getByText(/Beca/i).first());
    await nar.say(clips.recepBeca);

    // Celulares y relojes (paso físico, narrado sobre la lista)
    await search.fill('').catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.locator('ul li').first());
    await nar.say(clips.recepPhones);

    // Marcar Llegó en el primer pendiente → cae el contador
    await page.locator('button', { hasText: /^\s*Llegó\s*$/i }).first().click().catch(() => {});
    await sleep(page, 1200);
    await cueBox(nar, page.getByText(/Faltan/i).first());
    await nar.say(clips.recepArrived);

    await cueBox(nar, page.locator('.grid.grid-cols-3').first());
    await nar.say(clips.recepBox);

    // ═══════════════ 3. REPORTE DE BOLSAS ═══════════════
    await page.goto(`${cfg.baseUrl}/app/bags-report`, { waitUntil: 'networkidle' });
    await page.getByText('Reporte de bolsas').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1500);

    const reportes2 = page.locator('button', { hasText: /^\s*Reportes\s*$/i }).first();
    await cueBox(nar, reportes2);
    await nar.say(clips.sidebarBags);

    await cueBox(nar, page.getByText(/Checklist de contenido/i).first());
    await nar.say(clips.bagsChecklist);

    await cueBox(nar, page.locator('table').first());
    await nar.say(clips.bagsTable);

    // Marcar una bolsa como realizada (intercepta PATCH → no muta)
    await page.locator('button[title="Marcar como realizada"]').first().click().catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, page.getByText(/Progreso general/i).first());
    await nar.say(clips.bagsMark);

    // Buscar por mesa
    const bagSearch = page.locator('input[placeholder*="Buscar por nombre, mesa"]').first();
    await bagSearch.click().catch(() => {});
    await bagSearch.fill('Mesa 1').catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, bagSearch);
    await nar.say(clips.bagsMesa);
    await bagSearch.fill('').catch(() => {});

    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-reception.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'reception-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
