// Video-demo narrado: "Mesas del Retiro" (asignar líderes, co-líderes y caminantes).
//
// Muestra TablesView: anatomía de una mesa (líder, co-líderes, caminantes), los que faltan por
// asignar, cómo asignar tocando a la persona y luego su lugar en la mesa, los colores de
// familia/amigos, la capacidad por mesa, rebalancear y el briefing a líderes.
//
//   cd apps/web && node e2e/demo/record-tables.mjs
//
// Vista de ADMIN → login por storageState. TODO EN SANDBOX: intercepta /tables y /participants
// con datos FICTICIOS (sin PII) y FABRICA las respuestas de asignación → nada toca la BD real.
// No confirma "Rebalancear" ni envía briefing.

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Mesas');
const RID = process.env.RETREAT_ID || '96f06c40-327a-4513-ae48-fb4c60bbab17';

// ── Datos ficticios (sin PII) ──
const SERVERS = [
  ['Roberto', 'Méndez'], ['Fernando', 'Ruiz'], ['Patricia', 'Salas'],
  ['Gerardo', 'Ortiz'], ['Verónica', 'Ríos'], ['Andrés', 'Peña'],
];
const WALKERS = [
  ['María', 'González', '#ef4444'], ['José', 'Ramírez'], ['Lucía', 'Hernández'],
  ['Miguel', 'Torres'], ['Ana', 'Flores', '#ef4444'], ['Carlos', 'Jiménez'],
  ['Sofía', 'Vargas'], ['Diego', 'Castro'],
];
let TMPL = { birthDate: '1990-01-01T00:00:00.000Z' };
const byId = {};
function mkP(base, kind, i, [first, last, color]) {
  const id = `fake-${kind}${i + 1}`;
  const p = {
    ...JSON.parse(JSON.stringify(base)), id, id_on_retreat: i + 1,
    type: kind === 's' ? 'server' : 'walker', firstName: first, lastName: last, nickname: first,
    family_friend_color: color || null, email: `${first}.${last}@correo.com`.toLowerCase(), cellPhone: '5246110000' + i,
    payments: [], debts: [], tags: [], tableId: null, tableMesa: null, retreatBed: null, isCancelled: false,
    homePhone: '', workPhone: '', userId: null,
  };
  byId[id] = p; return p;
}
function buildAll(base) {
  SERVERS.forEach((s, i) => mkP(base, 's', i, s));
  WALKERS.forEach((w, i) => mkP(base, 'w', i, w));
}
let fakeTables = [];
function initTables() {
  const g = (id) => byId[id] || null;
  fakeTables = [
    { id: 't1', name: 'Mesa 1', retreatId: RID, lider: g('fake-s1'), colider1: g('fake-s2'), colider2: null, walkers: [g('fake-w1'), g('fake-w2'), g('fake-w3')] },
    { id: 't2', name: 'Mesa 2', retreatId: RID, lider: g('fake-s3'), colider1: null, colider2: null, walkers: [g('fake-w4'), g('fake-w5')] },
    { id: 't3', name: 'Mesa 3', retreatId: RID, lider: null, colider1: null, colider2: null, walkers: [] },
    { id: 't4', name: 'Mesa 4', retreatId: RID, lider: null, colider1: null, colider2: null, walkers: [] },
  ];
}
async function setupRoutes(page) {
  await page.route('**/participants**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' || !req.url().includes('?')) return route.continue();
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      const arr = Array.isArray(data) ? data : (data.data || data.participants || []);
      TMPL = arr.find((p) => p.type === 'walker') || arr[0] || TMPL;
      buildAll(TMPL); initTables();
      return route.fulfill({ response: resp, body: JSON.stringify(Object.values(byId)) });
    } catch { return route.continue(); }
  });
  await page.route('**/tables/**', async (route) => {
    const req = route.request();
    const url = req.url(); const m = req.method();
    const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (m === 'GET' && /\/tables\/retreat\//.test(url)) { if (!fakeTables.length) { buildAll(TMPL); initTables(); } return j(fakeTables); }
    let mm;
    if (m === 'POST' && (mm = url.match(/\/tables\/([^/]+)\/walkers/))) {
      const t = fakeTables.find((x) => x.id === mm[1]);
      const p = byId[JSON.parse(req.postData() || '{}').participantId];
      if (t && p && !t.walkers.some((w) => w.id === p.id)) t.walkers.push(p);
      return j(t);
    }
    if (m === 'POST' && (mm = url.match(/\/tables\/([^/]+)\/leader\/([^/]+)/))) {
      const t = fakeTables.find((x) => x.id === mm[1]);
      const p = byId[JSON.parse(req.postData() || '{}').participantId];
      if (t && p) t[mm[2]] = p;
      return j(t);
    }
    if (m === 'GET' && (mm = url.match(/\/tables\/([^/?]+)$/))) {
      const t = fakeTables.find((x) => x.id === mm[1]); if (t) return j(t);
    }
    return route.continue();
  });
}

const LINES = [
  { id: 'sidebar1', text: '¿Dónde está? En el menú de la izquierda abre Asignaciones y entra a Mesas.' },
  { id: 'intro', text: 'Aquí armas las mesas del retiro. Cada mesa tiene un líder, hasta dos co-líderes y un grupo de caminantes.' },
  { id: 'unassigned', text: 'Arriba ves quién falta por acomodar: servidores y caminantes que aún no tienen mesa.' },
  { id: 'assign_leader', text: 'Para poner un líder, tocas a un servidor y luego el lugar de Líder de la mesa. Así de simple.' },
  { id: 'assign_walker', text: 'Con los caminantes es igual: tocas al caminante y luego la zona de caminantes de su mesa.' },
  { id: 'colors', text: 'Los colores marcan a familiares y amigos, para no dejarlos en la misma mesa y que convivan con gente nueva.' },
  { id: 'capacity', text: 'Cada mesa lleva su cuenta de caminantes sobre el máximo, para repartir parejo.' },
  { id: 'santi1', text: 'Hay también una dinámica preciosa: dejar que el Espíritu Santo elija las mesas. En el menú, dentro de Imprimir, están las Tarjetas de los Caminantes.' },
  { id: 'santi2', text: 'Imprimes y recortas una tarjeta por cada caminante y las doblas. Ante el Santísimo, en oración, las vas sacando y agrupando por mesa.' },
  { id: 'santi3', text: 'Al terminar, con la cámara de cada mesa fotografías sus tarjetas y la app las reconoce y asigna sola.' },
  { id: 'rebalance', text: 'Si prefieres, Rebalancear Caminantes los reparte solo entre las mesas.' },
  { id: 'verify', text: 'Y antes de salir del retiro, en Imprimir tienes Verificación de Datos: una hoja para que cada caminante revise y corrija su información.' },
  { id: 'briefing', text: 'Con un clic también le mandas a cada líder el briefing con los datos de su mesa.' },
  { id: 'outro', text: 'Así armas tus mesas: a mano o guiado por el Espíritu Santo, equilibrados y con los datos al día.' },
];

const YT_TITLE = 'Mesas del retiro en Emaús: asignar caminantes y la dinámica del Santísimo';
const YT_DESCRIPTION =
  'Tutorial de las Mesas del retiro en Emaús. Cómo se compone una mesa (líder, co-líderes y ' +
  'caminantes), cómo asignar tocando a la persona y luego su lugar en la mesa, y los colores que ' +
  'marcan familiares y amigos para no juntarlos. También la dinámica opcional del Santísimo: ' +
  'imprimir las tarjetas de los caminantes, sortear las mesas en oración ante el Santísimo para que ' +
  'el Espíritu Santo guíe la asignación, y fotografiar las tarjetas de cada mesa para que la app las ' +
  'asigne. Además: rebalanceo automático, impresión de verificación de datos antes de salir del ' +
  'retiro, y el briefing a los líderes. Los datos son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'mesas', 'asignaciones', 'líderes', 'caminantes', 'Santísimo', 'Espíritu Santo', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar1: 'Dónde está en el menú', intro: 'Anatomía de una mesa', unassigned: 'Sin asignar',
  assign_leader: 'Asignar un líder', assign_walker: 'Asignar un caminante', colors: 'Familiares y amigos',
  capacity: 'Capacidad por mesa', santi1: 'Dinámica del Santísimo', santi2: 'Sortear en oración',
  santi3: 'Foto → asignación por IA', rebalance: 'Rebalancear', verify: 'Verificación de datos',
  briefing: 'Briefing a líderes', outro: 'Resumen',
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
async function tapPill(page, loc) {
  const b = await loc.boundingBox();
  if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
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
    storageState: state, viewport: { width: W, height: H }, locale: 'es-MX', hasTouch: true,
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  await setupRoutes(page);

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    await page.goto(`${cfg.baseUrl}/app/tables`, { waitUntil: 'networkidle' });
    await page.getByText('Mesas del Retiro').first().waitFor({ timeout: 15000 });
    await sleep(page, 1500);

    // 1. Ubicación en el sidebar
    const asign = page.locator('button', { hasText: /^\s*Asignaciones\s*$/i }).first();
    await cueBox(nar, asign);
    await nar.say(clips.sidebar1);
    await asign.click().catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.getByText('Mesas', { exact: true }).first());
    await sleep(page, 400);

    const mesa1 = page.locator('[class*="rounded"]').filter({ hasText: 'Mesa 1' }).first();
    const mesa3 = page.locator('[class*="rounded"]').filter({ hasText: 'Mesa 3' }).first();

    // 2. Anatomía de una mesa
    await cueBox(nar, mesa1.getByText('Líder', { exact: true }).first());
    await nar.say(clips.intro);

    // 3. Sin asignar
    await cueBox(nar, page.getByText('Servidores Sin Asignar').first());
    await nar.say(clips.unassigned);

    // 4. Asignar líder: tap servidor (Gerardo) → clic zona Líder de Mesa 3
    const gerardo = page.getByText(/Gerardo/).first();
    await cueBox(nar, gerardo);
    await tapPill(page, gerardo);
    await sleep(page, 500);
    await mesa3.scrollIntoViewIfNeeded().catch(() => {});
    await cueBox(nar, mesa3.getByText('Líder', { exact: true }).first());
    await nar.say(clips.assign_leader);
    await mesa3.getByText('Líder', { exact: true }).first().click().catch(() => {});
    await sleep(page, 900);

    // 5. Asignar caminante: tap Carlos → clic zona Caminantes de Mesa 3
    const carlos = page.getByText(/Carlos J\./).first();
    await cueBox(nar, carlos);
    await tapPill(page, carlos);
    await sleep(page, 500);
    await cueBox(nar, mesa3.getByText(/^Caminantes \(/).first());
    await nar.say(clips.assign_walker);
    await mesa3.getByText(/^Caminantes \(/).first().click().catch(() => {});
    await sleep(page, 900);

    // 6. Colores familia/amigos (María G. en Mesa 1, borde rojo)
    await cueBox(nar, mesa1.getByText(/María/).first());
    await nar.say(clips.colors);

    // 7. Capacidad
    await cueBox(nar, mesa1.getByText(/\/\s*7/).first());
    await nar.say(clips.capacity);

    // 8. Dinámica del Santísimo: Tarjetas de los Caminantes
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    const imprimirSub = () => page.getByRole('menuitem').filter({ hasText: /^Imprimir$/i }).first();
    await page.locator('button:has(svg.lucide-ellipsis-vertical-icon)').first().click().catch(() => {});
    await sleep(page, 500);
    await cueBox(nar, imprimirSub());          // señalar "Imprimir" (ahí viven Tarjetas y Verificación)
    await nar.say(clips.santi1);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 400);
    await cueBox(nar, mesa1);                   // narrar la dinámica de oración sobre el tablero
    await nar.say(clips.santi2);
    await cueBox(nar, mesa1.locator('button:has(svg.lucide-camera-icon)').first());
    await nar.say(clips.santi3);               // foto → IA

    // 9. Rebalancear + Verificación de datos (mismo menú, sin ejecutar)
    await page.locator('button:has(svg.lucide-ellipsis-vertical-icon)').first().click().catch(() => {});
    await sleep(page, 500);
    await cueBox(nar, page.getByRole('menuitem').filter({ hasText: /Rebalancear/i }).first());
    await nar.say(clips.rebalance);
    await cueBox(nar, imprimirSub());          // Verificación de Datos vive dentro de "Imprimir"
    await nar.say(clips.verify);
    await page.keyboard.press('Escape');
    await sleep(page, 500);

    // 10. Briefing a líderes (abrir popover, NO enviar)
    const briefingBtn = page.locator('button[title*="briefing" i]').first();
    await cueBox(nar, briefingBtn);
    await briefingBtn.click().catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.briefing);
    await page.keyboard.press('Escape');
    await sleep(page, 500);

    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-tables.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'tables-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
