// Video-demo narrado: "Tour general / primeros pasos" (onboarding) — navegación + menú.
//
// Recorre TODO el ciclo del retiro ENTRANDO a cada pantalla y RESALTANDO su ítem exacto en el
// menú lateral (expande la sección y apunta al ítem). Orden cronológico. Arranca con una
// introducción (sin hablar del dashboard). El dashboard aparece a la mitad (chequeo del día, con
// scroll de detalles) y sus recuerdos se muestran en la pestaña del formulario de retiro.
// San Agustín real, con enmascarado TOTAL de PII (catch-all /api/). No muta nada.
//
//   cd apps/web && node e2e/demo/record-tour.mjs

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Guía');
const SA = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead';

// ── Enmascarado TOTAL ────────────────────────────────────────────────────────
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
    } else if (typeof n.displayName === 'string' && n.displayName.trim()) {
      // Objetos tipo usuario (Gestión de Roles): displayName sin firstName.
      const f = fakeFor(n.id || n.displayName);
      n.displayName = `${f.first} ${f.last}`;
      if (typeof n.name === 'string' && n.name.trim() && !n.name.includes('@')) n.name = `${f.first} ${f.last}`;
      if (typeof n.fullName === 'string') n.fullName = `${f.first} ${f.last}`;
    }
    // Emails (siempre PII).
    if (typeof n.email === 'string' && n.email.includes('@')) {
      const f = fakeFor(n.email);
      n.email = `${f.first}.${f.last}@correo.com`.toLowerCase();
    }
    // Fotos/avatares (caras reales) → blanquear.
    if (typeof n.photo === 'string' && n.photo.startsWith('http')) n.photo = '';
    if (typeof n.avatar === 'string' && n.avatar.startsWith('http')) n.avatar = '';
    // Teléfonos (PII) → número ficticio determinista con forma de móvil MX. Match por regex
    // insensible a mayúsculas (los campos reales son cellPhone/phone/whatsapp/celular).
    for (const k of Object.keys(n)) {
      if (/phone|celular|tel[eé]fono|whatsapp/i.test(k) && typeof n[k] === 'string' && n[k].replace(/\D/g, '').length >= 7) {
        n[k] = '55' + String(10000000 + (hstr(n[k]) % 90000000));
      }
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (typeof v === 'object') maskNode(v);
      else if (typeof v === 'string') {
        const m = v.match(/^(.*?Palanquero\s*\d+)\s*\((.+)\)\s*$/i);
        if (m) { const f = fakeFor(v); n[k] = `${m[1]} (${f.first} ${f.last})`; }
      }
    }
  }
}
async function maskRoute(route) {
  if (route.request().method() !== 'GET') return route.continue();
  let resp;
  try { resp = await route.fetch(); } catch { return route.continue().catch(() => {}); }
  const ct = (resp.headers()['content-type'] || '');
  if (!ct.includes('json')) return route.fulfill({ response: resp }).catch(() => {});
  try { const d = await resp.json(); maskNode(d); return route.fulfill({ response: resp, body: JSON.stringify(d) }); }
  catch { return route.fulfill({ response: resp }).catch(() => {}); }
}

const LINES = [
  { id: 'intro', text: 'En este video hacemos un recorrido completo: cómo se organiza un retiro en Emaús de principio a fin, y dónde vive cada cosa en el menú.' },
  { id: 'casas', text: 'Todo empieza en Configuración Global, en Casas: defines la casa del retiro, con sus cuartos y sus camas.' },
  { id: 'retiro', text: 'Con el botón más creas el retiro sobre esa casa: eliges sus fechas, sus cupos y sus datos.' },
  { id: 'roles', text: 'En Administración, Gestión de Roles, invitas a tu equipo y le das su rol: logística, comunicaciones o tesorero.' },
  { id: 'flyer', text: 'Creas el volante para invitar, y con él se abre el registro de caminantes y servidores.' },
  { id: 'preretiro', text: 'En Logística, Tareas Pre-Retiro te marca qué hacer y cuándo, paso a paso.' },
  { id: 'inventory', text: 'Y revisas el inventario que vas a llevar al retiro.' },
  { id: 'palancas', text: 'En Comunicaciones, el equipo de Palancas contacta a los familiares con secuencias, y lleva el seguimiento de cada uno.' },
  { id: 'payments', text: 'Registras y sigues los pagos de caminantes y servidores.' },
  { id: 'resp', text: 'Cuando se acerca, en Asignaciones repartes las responsabilidades: charlas, dinámicas y servicios.' },
  { id: 'tables', text: 'Armas las mesas con sus líderes, y les escribes para que confirmen la asistencia de su mesa.' },
  { id: 'santisimo', text: 'Organizas las guardias de la capilla, el Santísimo, con los servidores.' },
  { id: 'dashmid', text: 'Ya el día del retiro vuelves al panel: aquí revisas cupos, confirmados y cuántos faltan por llegar.' },
  { id: 'dashmid2', text: 'Bajando ves los enlaces de registro, el estado de tus tareas, y las estadísticas de caminantes y servidores.' },
  { id: 'mam', text: 'Durante el retiro sigues el Minuto a Minuto en vivo: cada actividad con su responsable y sus tiempos.' },
  { id: 'reception', text: 'Recibes a los caminantes en Recepción y ves cuántos faltan por llegar.' },
  { id: 'gafetes', text: 'Imprimes los gafetes de todos, caminantes y servidores.' },
  { id: 'rooms', text: 'Y las etiquetas de los cuartos, para pegarlas en cada puerta.' },
  { id: 'bags', text: 'Al terminar, el Reporte de Bolsas, para entregarles todo completo.' },
  { id: 'memories', text: 'Y después del retiro, en la pestaña Recuerdos del retiro, subes las fotos y la música para guardarlo.' },
  { id: 'outro', text: 'Ese es el camino completo de un retiro en Emaús. Y cada sección tiene su propio video para verla a fondo.' },
];

// Cada paso: url (navega), section+item (expande la sección y resalta el ítem del menú),
// openModal / editModal+tab (abre el form), scroll, closeAfter.
const STEPS = [
  { clip: 'intro', url: `/app/houses`, wait: /Casas|Agregar Casa|Google Maps/i, settle: 2600 },
  { clip: 'casas', section: 'Configuración Global', item: 'Casas' },
  { clip: 'retiro', openModal: 'Agregar Retiro', modalWait: /Parroquia|Casa|Fecha|Cupo/i, cue: /Parroquia|Casa|Fecha/i, closeAfter: true },
  { clip: 'roles', url: `/app/retreats/${SA}/role-management`, section: 'Administración', item: 'Gestión de Roles' },
  { clip: 'flyer', url: `/app/retreats/${SA}/flyer`, settle: 3200 },
  { clip: 'preretiro', url: `/app/retreats/${SA}/tareas-pre-retiro`, section: 'Logística', item: 'Tareas Pre-Retiro' },
  { clip: 'inventory', url: `/app/retreats/${SA}/inventory`, section: 'Logística', item: 'Inventario' },
  { clip: 'palancas', url: `/app/palancas`, section: 'Comunicaciones', item: 'Palancas' },
  { clip: 'payments', url: `/app/payments`, section: 'Logística', item: 'Pagos' },
  { clip: 'resp', url: `/app/retreats/${SA}/responsibilities`, section: 'Asignaciones', item: 'Responsabilidades' },
  { clip: 'tables', url: `/app/tables`, section: 'Asignaciones', item: 'Mesas' },
  { clip: 'santisimo', url: `/app/retreats/${SA}/santisimo`, section: 'Logística', item: 'Guardias de la Capilla' },
  { clip: 'dashmid', url: `/app/retreats/${SA}/dashboard`, wait: /San Agust/i, cue: /San Agust/i },
  { clip: 'dashmid2', scroll: 600, cue: /Estad[íi]sticas|Caminantes|Enlaces/i },
  { clip: 'mam', url: `/app/retreats/${SA}/minuto-a-minuto`, section: 'Logística', item: 'Minuto a Minuto', cue: '[id^="schedule-item-"]' },
  { clip: 'reception', url: `/app/retreats/${SA}/reception`, section: 'Personas', item: 'Recepción' },
  { clip: 'gafetes', url: `/app/walker-badges`, section: 'Reportes', item: 'Gafetes Caminantes' },
  { clip: 'rooms', url: `/app/rooms`, section: 'Reportes', item: 'Etiquetas Cuartos' },
  { clip: 'bags', url: `/app/bags-report`, section: 'Reportes', item: 'Reporte de Bolsas' },
  { clip: 'memories', url: `/app/retreats/${SA}/dashboard`, wait: /San Agust/i, editModal: true, tab: 'Recuerdos', closeAfter: true },
  { clip: 'outro', cue: /San Agust/i },
];

const YT_TITLE = 'Primeros pasos en Emaús: el recorrido completo de un retiro';
const YT_DESCRIPTION =
  'Tour general de Emaús para empezar: el recorrido completo de un retiro, entrando a cada pantalla y ' +
  'mostrando dónde vive en el menú. Crear la casa y el retiro; invitar al equipo y darle roles ' +
  '(logística, comunicaciones, tesorero); el volante y el registro; las tareas pre-retiro y el ' +
  'inventario; el equipo de palancas y su seguimiento; los pagos; al acercarse, las responsabilidades, ' +
  'las mesas con líderes y la confirmación de asistencia, y las guardias de la capilla (Santísimo); ' +
  'el día del retiro el panel de control para ver cupos y faltantes; durante el retiro el minuto a ' +
  'minuto, la recepción, los gafetes y las etiquetas de cuartos; al terminar el reporte de bolsas; y ' +
  'después, las fotos y la música del recuerdo desde la pestaña Recuerdos del retiro. Cada sección ' +
  'tiene su propio video a fondo. Los nombres mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'tutorial', 'primeros pasos', 'onboarding', 'guía', 'tour', 'introducción'];
const CHAPTER_LABELS = {
  intro: 'Introducción', casas: '1. Crear la casa', retiro: '2. Crear el retiro', roles: '3. Invitar al equipo y roles',
  flyer: '4. Volante y registro', preretiro: '5. Tareas pre-retiro', inventory: '6. Inventario',
  palancas: '7. Palancas y seguimiento', payments: '8. Pagos', resp: '9. Responsabilidades',
  tables: '10. Mesas y confirmación', santisimo: '11. Guardias de la capilla', dashmid: '12. Panel del día del retiro',
  dashmid2: 'Detalles del panel', mam: '13. Minuto a minuto', reception: '14. Recepción', gafetes: '15. Gafetes',
  rooms: '16. Etiquetas de cuartos', bags: '17. Reporte de bolsas', memories: '18. Fotos y música', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
async function cueLoc(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch {}
}
async function cue(nar, page, sel) {
  const loc = (sel instanceof RegExp) ? page.getByText(sel).first() : page.locator(sel).first();
  await cueLoc(nar, loc);
}
// Encabezado de sección del sidebar (botón acordeón). Mismo patrón que los videos ya publicados
// (record-reception / record-bed-assignments): apuntar al encabezado → narrar → hacer clic para
// desplegar. El ítem exacto lo nombra la narración; no se resalta el sub-ítem (peleaba con el acordeón).
function sectionBtn(page, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('button', { hasText: new RegExp(`^\\s*${esc}\\s*$`, 'i') }).first();
}
// Garantiza que un encabezado (grupo o sub-sección) quede expandido. Todos exponen aria-expanded,
// así que solo hacemos clic si está colapsado (no togglear-cerrar uno ya abierto).
async function ensureExpanded(page, label) {
  const hdr = sectionBtn(page, label);
  if ((await hdr.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await hdr.scrollIntoViewIfNeeded().catch(() => {});
    await hdr.click().catch(() => {});
    await page.waitForTimeout(450);
  }
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
  await page.route('**/api/**', maskRoute);

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // Selecciona San Agustín en silencio (sin narrar / sin dashboard al inicio).
    await page.goto(`${cfg.baseUrl}/app/retreats/${SA}/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.getByText(/San Agust/i).first().waitFor({ timeout: 12000 }).catch(() => {});
    await sleep(page, 1000);

    for (const step of STEPS) {
      if (step.url) {
        await page.goto(`${cfg.baseUrl}${step.url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        // Espera a que las fetches (ya enmascaradas) terminen: domcontentloaded dispara ANTES de
        // que el contenido se pinte, y narrar sobre una pantalla a medio cargar desincroniza el inicio.
        await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
        if (step.wait) await page.getByText(step.wait).first().waitFor({ timeout: 6000 }).catch(() => {});
        await sleep(page, step.settle || 900);
      }
      if (step.openModal) {
        // Clic del "+" (Agregar Retiro) vía DOM (el.click()): el paso "casas" deja "Configuración
        // Global" expandido (persiste en localStorage aun tras recargar), y su contenedor scrollable
        // intercepta un clic de puntero normal. el.click() dispara el handler ignorando la intercepción.
        const plus = page.locator(`button[title="${step.openModal}"]`).first();
        await plus.evaluate((el) => el.click()).catch(() => {});
        await sleep(page, 900);
        if (step.modalWait) await page.getByText(step.modalWait).first().waitFor({ timeout: 6000 }).catch(() => {});
      }
      if (step.editModal) {
        const edit = page.locator('button[title="Editar"]').first();
        await edit.evaluate((el) => el.click()).catch(() => {});
        await sleep(page, 900);
        if (step.tab) { await page.getByRole('tab', { name: step.tab }).click().catch(() => page.getByText(step.tab, { exact: true }).first().click().catch(() => {})); await sleep(page, 700); }
      }
      // Ubicación en el menú: las sub-secciones (Logística, Personas, Config Global…) vienen
      // COLAPSADas tras navegar; hay que expandirlas para que aparezca su ítem. Se expande solo si
      // está colapsada (aria-expanded), para no togglear-cerrar. Luego se apunta al ítem exacto,
      // anclando el nombre al inicio (no confundir "Inventario" con "Artículos de Inventario").
      if (step.section) {
        // Expandir la cadena de ancestros: el grupo RETIRO y luego la sub-sección (o solo el grupo
        // "Configuración Global", que lleva sus ítems directos). Se auto-corrige si un paso previo
        // dejó el acordeón en otro estado.
        const chain = step.section === 'Configuración Global' ? ['Configuración Global'] : ['Retiro', step.section];
        for (const label of chain) await ensureExpanded(page, label);
        const esc = step.item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const link = page.getByRole('link', { name: new RegExp('^\\s*' + esc, 'i') }).first();
        await cueLoc(nar, link);
      }
      if (step.scroll) { await page.getByText(/Estad[íi]sticas principales|# Caminantes/i).first().scrollIntoViewIfNeeded().catch(() => {}); await sleep(page, 600); }
      if (step.cue && !step.section) await cue(nar, page, step.cue);
      await nar.say(clips[step.clip]);
      if (step.closeAfter) { await page.keyboard.press('Escape').catch(() => {}); await sleep(page, 700); }
    }
    await sleep(page, 800);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-tour.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'tour-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
