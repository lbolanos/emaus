// Video-demo narrado: "Caminantes — lista, editar, columnas y mensajes".
//
// Recorre WalkersView (ParticipantList): dónde vive en el menú, la lista y sus filtros,
// editar la ficha de un caminante, agregar columnas (que se vuelven campos editables),
// y enviar mensajes individuales y masivos.
//
//   cd apps/web && node e2e/demo/record-walkers.mjs
//
// Vista de ADMIN → login por storageState. PRIVACIDAD: NO usa datos reales. Intercepta el
// endpoint de participantes y devuelve una lista de CAMINANTES FICTICIOS (sin PII). NO muta:
// editar/mensajes se cancelan; la selección de columnas es solo del contexto efímero (localStorage).

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Caminantes');

// ── Caminantes ficticios (sin PII). Se inyectan clonando la forma real del participante. ──
const FAKES = [
  { firstName: 'María', lastName: 'González', email: 'maria.gonzalez@correo.com', cellPhone: '524611000001', parish: 'La Asunción', city: 'Celaya', occupation: 'Maestra', maritalStatus: 'S', paymentRemaining: 0, paymentStatus: 'paid', attendanceConfirmation: 'confirmed' },
  { firstName: 'José', lastName: 'Ramírez', email: 'jose.ramirez@correo.com', cellPhone: '524611000002', parish: 'San Judas Tadeo', city: 'Celaya', occupation: 'Ingeniero', maritalStatus: 'C', paymentRemaining: 1200, paymentStatus: 'partial', attendanceConfirmation: 'pending' },
  { firstName: 'Lucía', lastName: 'Hernández', email: 'lucia.hernandez@correo.com', cellPhone: '524611000003', parish: 'Sagrado Corazón', city: 'Celaya', occupation: 'Contadora', maritalStatus: 'S', paymentRemaining: 2500, paymentStatus: 'unpaid', attendanceConfirmation: 'confirmed' },
  { firstName: 'Miguel', lastName: 'Torres', email: 'miguel.torres@correo.com', cellPhone: '524611000004', parish: 'Cristo Rey', city: 'Salamanca', occupation: 'Comerciante', maritalStatus: 'C', paymentRemaining: 0, paymentStatus: 'paid', attendanceConfirmation: 'confirmed' },
  { firstName: 'Ana', lastName: 'Flores', email: 'ana.flores@correo.com', cellPhone: '524611000005', parish: 'La Asunción', city: 'Celaya', occupation: 'Enfermera', maritalStatus: 'S', paymentRemaining: 800, paymentStatus: 'partial', attendanceConfirmation: 'pending' },
  { firstName: 'Carlos', lastName: 'Jiménez', email: 'carlos.jimenez@correo.com', cellPhone: '524611000006', parish: 'San José', city: 'Celaya', occupation: 'Abogado', maritalStatus: 'C', paymentRemaining: 0, paymentStatus: 'paid', attendanceConfirmation: 'confirmed' },
  { firstName: 'Sofía', lastName: 'Vargas', email: 'sofia.vargas@correo.com', cellPhone: '524611000007', parish: 'Guadalupe', city: 'Celaya', occupation: 'Estudiante', maritalStatus: 'S', paymentRemaining: 2500, paymentStatus: 'unpaid', attendanceConfirmation: 'pending' },
];
let TMPL = { birthDate: '1990-01-01T00:00:00.000Z' };
function buildWalkers() {
  return FAKES.map((f, i) => ({
    ...JSON.parse(JSON.stringify(TMPL)),
    id: `fake-${i}`, id_on_retreat: i + 1, type: 'walker', nickname: f.firstName,
    payments: [], debts: [], tags: [], messageCount: 0, tableId: null, tableMesa: null,
    totalPaid: 2500 - f.paymentRemaining, totalDebt: 0, hasPayments: f.paymentRemaining < 2500,
    homePhone: '', workPhone: '', userId: null, retreatBed: null, isCancelled: false,
    ...f,
  }));
}

const LINES = [
  { id: 'sidebar1', text: 'Primero, ¿dónde vive? En el menú de la izquierda abre la sección Personas.' },
  { id: 'sidebar2', text: 'Ahí está Caminantes: la lista de todos los que van al retiro como caminantes.' },
  { id: 'intro', text: 'Esta es tu lista. Arriba buscas por nombre, correo o parroquia, y filtras por confirmación de asistencia.' },
  { id: 'columns', text: 'Cada columna es un dato: nombre, correo, celular, parroquia y cuánto le falta por pagar.' },
  { id: 'confirm', text: 'A la derecha, con un clic cambias su asistencia: por contactar, confirmado o no asiste.' },
  { id: 'edit1', text: 'Para ver o corregir sus datos, tocas el lápiz de esa fila.' },
  { id: 'edit2', text: 'Se abre su ficha: cambias nombre, celular o parroquia y guardas. El correo queda fijo, no se edita aquí.' },
  { id: 'cols1', text: '¿Quieres otro dato a la vista? En el menú de opciones entra a Columnas.' },
  { id: 'cols2', text: 'Pasas a la derecha el dato que quieras, por ejemplo Ocupación, y aparece como una columna más.' },
  { id: 'cols3', text: 'Y lo mejor: esa columna se vuelve editable en la ficha. Lo que muestras en la tabla es lo que puedes editar.' },
  { id: 'msg1', text: 'Para escribirle a un caminante, tocas el ícono de mensaje.' },
  { id: 'msg2', text: 'Eliges WhatsApp o correo, escoges una plantilla y envías. Todo queda en su historial.' },
  { id: 'bulk', text: '¿Varios a la vez? Los marcas con los cuadros y, en la barra azul, les mandas un mensaje a todos o los editas juntos.' },
  { id: 'outro', text: 'Así gestionas a tus caminantes: sus datos, las columnas que ves y editas, y los mensajes que les envías.' },
];

const YT_TITLE = 'Caminantes en Emaús: editar datos, columnas y enviar mensajes';
const YT_DESCRIPTION =
  'Tutorial de la lista de Caminantes en Emaús. Cómo encontrarla en el menú, buscar y filtrar por ' +
  'confirmación de asistencia, editar la ficha de un caminante, agregar columnas a la tabla (que se ' +
  'vuelven campos editables en la ficha), y enviar mensajes por WhatsApp o correo, uno por uno o de ' +
  'forma masiva con plantillas. Los datos mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'caminantes', 'participantes', 'mensajes', 'WhatsApp', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar1: 'Dónde está en el menú', sidebar2: 'La lista de Caminantes', intro: 'Buscar y filtrar',
  columns: 'Las columnas', confirm: 'Confirmación de asistencia', edit1: 'Editar un caminante',
  edit2: 'Su ficha', cols1: 'Agregar columnas', cols2: 'Columna nueva en la tabla',
  cols3: 'Columnas = campos editables', msg1: 'Enviar mensaje', msg2: 'WhatsApp, correo y plantillas',
  bulk: 'Mensaje masivo', outro: 'Resumen',
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

  // Login (sin grabar) → storageState.
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
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();

  // 🔒 Inyectar caminantes ficticios (lista) + responder el GET por id de un fake.
  await page.route('**/participants**', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && /\/participants\/fake-/.test(url)) {
      const idx = Number((url.match(/fake-(\d+)/) || [])[1]) || 0;
      const w = buildWalkers()[idx] || buildWalkers()[0];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(w) });
    }
    if (req.method() !== 'GET' || !url.includes('?')) return route.continue();
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      const arr = Array.isArray(data) ? data : (data.data || data.participants || []);
      TMPL = arr.find((p) => p.type === 'walker') || arr[0] || TMPL;
      return route.fulfill({ response: resp, body: JSON.stringify(buildWalkers()) });
    } catch {
      return route.continue();
    }
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const rows = () => page.locator('tr.participant-row');
  const rowActions = (i) => rows().nth(i).locator('td:last-child button');

  try {
    await page.goto(`${cfg.baseUrl}/app/walkers`, { waitUntil: 'networkidle' });
    await rows().first().waitFor({ timeout: 15000 });
    await sleep(page, 1200);

    // ── 1. Ubicación en el sidebar ──
    const personas = page.locator('button', { hasText: /^\s*Personas\s*$/i }).first();
    await cueBox(nar, personas);
    await nar.say(clips.sidebar1);
    await personas.click().catch(() => {});
    await sleep(page, 900);
    const camItem = page.getByText('Caminantes', { exact: true }).first();
    await cueBox(nar, camItem);
    await nar.say(clips.sidebar2);

    // ── 2. Lista, búsqueda y filtro ──
    await cueBox(nar, page.getByPlaceholder(/Buscar/i).first());
    await nar.say(clips.intro);
    await cueBox(nar, page.locator('thead th').nth(3)); // EMAIL / columnas
    await nar.say(clips.columns);

    // ── 3. Confirmación de asistencia (solo señalar, no clicar) ──
    await cueBox(nar, rows().first().locator('td:last-child button').first());
    await nar.say(clips.confirm);

    // ── 4. Editar ──
    const editBtn0 = rows().first().locator('button:has(svg.lucide-square-pen-icon)').first();
    await cueBox(nar, editBtn0);
    await nar.say(clips.edit1);
    await editBtn0.click().catch(() => {});
    await page.getByRole('dialog').waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);
    await nar.say(clips.edit2);
    await page.getByRole('button', { name: /Cancelar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);

    // ── 5. Agregar columnas → editable ──
    await page.locator('button:has(svg.lucide-ellipsis-vertical-icon)').first().click().catch(() => {});
    await sleep(page, 500);
    await nar.say(clips.cols1);
    await page.getByRole('menuitem').filter({ hasText: /Columnas/i }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const occLi = page.locator('li', { hasText: /^Ocupación$/ }).first();
    await occLi.click().catch(() => {});
    await sleep(page, 400);
    await page.locator('button:has(svg.lucide-chevron-right-icon)').first().click().catch(() => {});
    await sleep(page, 500);
    await nar.say(clips.cols2);
    await page.getByRole('button', { name: /Cerrar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 800);
    // señalar la nueva columna en la tabla
    const occHead = page.locator('thead th', { hasText: /Ocupaci/i }).first();
    await cueBox(nar, occHead);
    // reabrir la ficha para mostrar el campo ahora editable
    await rows().first().locator('button:has(svg.lucide-square-pen-icon)').first().click().catch(() => {});
    await page.getByRole('dialog').waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);
    const occField = page.getByRole('dialog').getByText(/Ocupaci/i).first();
    await cueBox(nar, occField);
    await nar.say(clips.cols3);
    await page.getByRole('button', { name: /Cancelar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);

    // ── 6. Mensaje individual ──
    const msgBtn0 = rows().first().locator('button:has(svg.lucide-message-square-icon)').first();
    await cueBox(nar, msgBtn0);
    await nar.say(clips.msg1);
    await msgBtn0.click().catch(() => {});
    await page.getByRole('dialog').waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, page.getByRole('dialog').getByText(/Historial/i).first());
    await nar.say(clips.msg2);
    await page.keyboard.press('Escape');
    await sleep(page, 700);

    // ── 7. Mensaje masivo ──
    await rows().nth(0).locator('td:first-child input[type=checkbox]').check().catch(() => {});
    await rows().nth(1).locator('td:first-child input[type=checkbox]').check().catch(() => {});
    await rows().nth(2).locator('td:first-child input[type=checkbox]').check().catch(() => {});
    await sleep(page, 600);
    await cueBox(nar, page.locator('.bg-blue-50').first());
    await nar.say(clips.bulk);
    // abrir el compositor masivo brevemente (sin enviar)
    await page.locator('.bg-blue-50 button:has(svg.lucide-message-square-icon)').first().click().catch(() => {});
    await sleep(page, 2000);
    // cerrar el modal de correo masivo (es custom, Escape no lo cierra → clic en el backdrop / X)
    await page.locator('button:has(svg.lucide-x-icon)').last().click({ timeout: 2000 }).catch(() => {});
    await sleep(page, 400);
    await page.mouse.click(30, 400).catch(() => {}); // backdrop, por si sigue abierto
    await sleep(page, 400);
    // limpiar selección → outro en la lista limpia
    await page.locator('.bg-blue-50 button:has(svg.lucide-x-icon)').first().click({ timeout: 1500 }).catch(() => {});
    await sleep(page, 500);

    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-walkers.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'walkers-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
