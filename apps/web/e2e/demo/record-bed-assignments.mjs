// Video-demo narrado: "Asignación de camas".
//
// Retiro REAL San Agustín (79 camas, 56 asignadas, 23 libres; pisos 1-2; normal + colchón).
// Solo ENMASCARA nombres (determinista). Sandbox CON ESTADO para poder mostrar una asignación
// en vivo sin mutar la BD: el GET de /beds se cachea y enmascara; el PUT de asignar muta ese
// estado (mueve al participante a la cama) y el refetch lo refleja. Las acciones destructivas
// (auto-asignar, borrar todo) NO se ejecutan: se narran sobre el menú ⋮.
//
//   cd apps/web && node e2e/demo/record-bed-assignments.mjs

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Camas');
const SA = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead';

// ── Enmascarado determinista ────────────────────────────────────────────────
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
    }
    for (const k of Object.keys(n)) if (typeof n[k] === 'object') maskNode(n[k]);
  }
}

// ── Sandbox con estado ───────────────────────────────────────────────────────
let bedsState = null;                 // array de camas enmascarado (cacheado)
const participantsById = {};          // id → participante enmascarado

async function bedsRoute(route) {
  const req = route.request();
  if (req.method() !== 'GET') return route.continue();
  if (!bedsState) {
    try {
      const resp = await route.fetch();
      bedsState = await resp.json();
      maskNode(bedsState);
      // San Agustín está 100% asignado (0 sin cama) → liberamos 3 camas para poder
      // demostrar la asignación en vivo (esos participantes vuelven a "sin asignar").
      let freed = 0;
      for (const b of bedsState) {
        if (freed >= 3) break;
        if (b.participant) { b.participant = null; b.participantId = null; freed++; }
      }
    } catch { return route.continue(); }
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bedsState) });
}

async function participantsRoute(route) {
  const req = route.request();
  if (req.method() !== 'GET') return route.continue();
  try {
    const resp = await route.fetch();
    const data = await resp.json();
    maskNode(data);
    const list = Array.isArray(data) ? data : (data.data || []);
    for (const p of list) if (p && p.id) participantsById[p.id] = p;
    return route.fulfill({ response: resp, body: JSON.stringify(data) });
  } catch { return route.continue(); }
}

async function assignRoute(route) {
  const req = route.request();
  if (req.method() !== 'PUT') return route.continue();
  const m = req.url().match(/\/retreat-beds\/([^/]+)\/assign/);
  const bedId = m && m[1];
  let body = {};
  try { body = JSON.parse(req.postData() || '{}'); } catch { /* ignore */ }
  if (bedsState && bedId) {
    const bed = bedsState.find((b) => b.id === bedId);
    if (bed) {
      if (body.participantId) {
        bed.participantId = body.participantId;
        bed.participant = participantsById[body.participantId] || { id: body.participantId, firstName: '—', lastName: '', snores: false };
      } else {
        bed.participantId = null;
        bed.participant = null;
      }
    }
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
}

const okJson = (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });

const LINES = [
  { id: 'sidebar', text: 'En el menú, sección Asignaciones, entra a Asignación de camas.' },
  { id: 'intro', text: 'Conforme cada quien se registra, el sistema le asigna una cama. Aquí revisas el avance y ajustas a mano lo que necesites.' },
  { id: 'snores', text: 'El punto rojo marca a quién ronca y el verde a quién no: la idea es no poner a un roncador con alguien que no ronca en el mismo cuarto.' },
  { id: 'rooms', text: 'Las camas se agrupan por piso y habitación. Cada tarjeta muestra el cuarto, la cama y su tipo.' },
  { id: 'types', text: 'Hay camas normales, literas y colchones. A los más jóvenes les tocan las literas; a los mayores, camas bajas en los primeros pisos.' },
  { id: 'unassigned', text: 'Arriba están los que aún no tienen cama: servidores y caminantes, con buscador y orden por nombre, edad o ronquido.' },
  { id: 'assignSel', text: 'Para mover a alguien de cama, tócalo: se resaltan las camas libres donde puede quedar.' },
  { id: 'assignDrop', text: 'Tocas la cama y queda asignado. El avance se actualiza al instante.' },
  { id: 'filter', text: 'Filtra por caminantes, servidores, quién ronca, o solo las camas libres, para trabajar más rápido.' },
  { id: 'auto', text: 'Y si quieres reacomodar todo de golpe, la Asignación automática lo hace por edad, ronquido y tipo de cama; también exportas o empiezas de cero.' },
  { id: 'outro', text: 'Como las camas se asignan al registrarse, tú solo revisas y ajustas: por cuarto, cuidando que ronquidos y edades queden bien.' },
];

const YT_TITLE = 'Asignación de camas en Emaús';
const YT_DESCRIPTION =
  'Tutorial de la asignación de camas de un retiro en Emaús. Cómo acomodar a cada participante en su ' +
  'cama cuidando los criterios que importan: el ronquido (indicador rojo/verde para no juntar roncadores), ' +
  'la edad y el tipo de cama (normal, litera o colchón), y el piso. Las camas se agrupan por piso y ' +
  'habitación; a la izquierda está la lista de quienes aún no tienen cama (con buscador y orden por ' +
  'nombre, edad o ronquido). Se muestra cómo asignar a mano —tocar a la persona y luego la cama libre— y ' +
  'se explican la Asignación automática (por edad, ronquido y tipo de cama), exportar y borrar todo. ' +
  'Los nombres mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'camas', 'habitaciones', 'asignación', 'ronquidos', 'logística', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar: 'Dónde está en el menú', intro: 'El tablero de camas', snores: 'Ronquidos (rojo/verde)',
  rooms: 'Piso y habitación', types: 'Tipos de cama y edad', unassigned: 'Sin cama todavía',
  assignSel: 'Seleccionar a la persona', assignDrop: 'Asignar la cama', filter: 'Filtros',
  auto: 'Automática, exportar, borrar', outro: 'Resumen',
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
  // Rutas: prefijadas con **/api/ para NO chocar con la URL de la página SPA
  // (`/app/retreats/:id/bed-assignments` matchearía `**/retreats/*/bed-assignments`
  //  → interceptaría la navegación del documento y dejaría la página en blanco).
  await page.route('**/api/participants**', participantsRoute);
  await page.route('**/api/retreats/*/beds', bedsRoute);
  await page.route('**/api/retreat-beds/*/assign', assignRoute);
  await page.route('**/api/retreat-beds/*/toggle-active', okJson);
  await page.route('**/api/retreats/*/auto-assign-beds', okJson);
  await page.route('**/api/retreats/*/bed-assignments', okJson);

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    await page.goto(`${cfg.baseUrl}/app/retreats/${SA}/bed-assignments`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /Asignaci[oó]n de camas/i }).first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1800);

    // Ubicación en el menú
    const asign = page.locator('button', { hasText: /^\s*Asignaciones\s*$/i }).first();
    await cueBox(nar, asign);
    await nar.say(clips.sidebar);
    await asign.click().catch(() => {});
    await sleep(page, 700);

    // Intro: avance
    await cueBox(nar, page.getByText(/camas\b/i).first());
    await nar.say(clips.intro);

    // Ronquidos (leyenda rojo/verde)
    await cueBox(nar, page.getByText(/Ronca/i).first());
    await nar.say(clips.snores);

    // Cuartos / pisos
    await cueBox(nar, page.getByRole('heading', { level: 2 }).first());
    await nar.say(clips.rooms);

    // Tipos de cama (señalar una tarjeta de cama)
    await cueBox(nar, page.locator('.rounded-lg.border-2').first());
    await nar.say(clips.types);

    // Sin asignar (panel superior)
    await cueBox(nar, page.getByText(/Caminantes \(/i).first());
    await nar.say(clips.unassigned);

    // Asignar: seleccionar un participante sin cama (caminante verde o servidor azul)
    const walkerPill = page.locator('span.cursor-pointer.bg-green-100, span.cursor-pointer.bg-blue-100').first();
    await cueBox(nar, walkerPill);
    await nar.say(clips.assignSel);
    await walkerPill.click().catch(() => {});
    await sleep(page, 900);

    // Tocar una cama libre resaltada (pulsa) → asigna
    const freeBed = page.locator('.animate-pulse').first();
    await cueBox(nar, freeBed);
    await freeBed.click().catch(() => {});
    await sleep(page, 1400);
    await cueBox(nar, page.getByText(/camas\b/i).first());
    await nar.say(clips.assignDrop);

    // Filtros de participantes
    await cueBox(nar, page.locator('select').first());
    await nar.say(clips.filter);

    // Menú ⋮: auto-asignar / exportar / borrar (narrar, NO ejecutar).
    // :visible + .last() → el ⋮ visible del header (evita el ⋮ móvil oculto y el menú de usuario del sidebar).
    await page.locator('button[aria-haspopup="menu"]:visible').last().click().catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.getByText(/autom[aá]tic/i).first());
    await nar.say(clips.auto);
    await page.keyboard.press('Escape');
    await sleep(page, 500);

    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-beds.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'bed-assignments-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
