// Video-demo narrado: "Responsabilidades, Equipos de Servicio, Documentos, MAM y Mi Agenda".
//
// Usa el retiro REAL San Agustín (datos completos: responsabilidades asignadas, equipos con
// líder/miembros, MAM materializado, agenda del usuario). Solo ENMASCARA los nombres de los
// participantes (PII) de forma determinista. No muta: todo es navegar + ver dialogs (solo lectura).
//
//   cd apps/web && node e2e/demo/record-responsibilities.mjs

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Responsabilidades');
const SA = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead'; // San Agustín (completo)

// ── Enmascarado de nombres (determinista: mismo id/nombre real → mismo nombre falso) ──
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
async function maskRoute(route) {
  const req = route.request();
  if (req.method() !== 'GET') return route.continue();
  try {
    const resp = await route.fetch();
    const data = await resp.json();
    maskNode(data);
    return route.fulfill({ response: resp, body: JSON.stringify(data) });
  } catch { return route.continue(); }
}

const LINES = [
  { id: 'sidebar1', text: 'En el menú, sección Asignaciones, entra a Responsabilidades.' },
  { id: 'intro', text: 'Cada retiro trae sus responsabilidades: charlas, dinámicas y servicios como comedor, música o logística.' },
  { id: 'types', text: 'Se dividen en Charlas y Dinámicas, y Responsabilidades de servicio. A cada una le asignas un responsable.' },
  { id: 'assign', text: 'Asignar es lo más importante: define quién ejecuta cada cosa, y de ahí sale todo lo demás.' },
  { id: 'docsver', text: 'Cada responsabilidad tiene su documentación. En una charla, Ver Documentación abre el guion completo.' },
  { id: 'docsmanage', text: 'Desde el clip gestionas sus documentos: subes un PDF o creas un texto, con vista previa y descripción.' },
  { id: 'docsver2', text: 'Y guardas versiones: el historial te deja volver a una versión anterior cuando quieras.' },
  { id: 'export', text: 'También exportas o imprimes todas las responsabilidades y quién quedó en cada una.' },
  { id: 'teams1', text: 'Junto a esto están los Equipos de Servicio: agrupan a los servidores por área.' },
  { id: 'teams2', text: 'Cada equipo tiene un líder y sus miembros. Arrastras a los servidores sin equipo para acomodarlos.' },
  { id: 'teams3', text: 'Responsabilidad y equipo se conectan: al asignar el responsable de Música, entra al equipo de Música.' },
  { id: 'teams4', text: 'Cada equipo guarda sus instrucciones, para que todos sepan qué hacer y cómo.' },
  { id: 'mam', text: 'Todo esto alimenta el Minuto a Minuto: cada actividad lleva su responsable, sus apoyos y sus documentos.' },
  { id: 'agenda1', text: 'Y en Logística, cada servidor abre Mi Agenda y ve solo lo que a él le toca.' },
  { id: 'agenda2', text: 'Con su horario, sus documentos para descargar, y un aviso diez, cinco y cero minutos antes de cada actividad.' },
  { id: 'outro', text: 'Ese es el flujo: asignas responsabilidades, armas equipos, cargas documentos, y cada quien ve su agenda al día.' },
];

const YT_TITLE = 'Responsabilidades, equipos y Mi Agenda en Emaús';
const YT_DESCRIPTION =
  'Tutorial del corazón organizativo de un retiro en Emaús. Cómo funcionan las Responsabilidades ' +
  '(charlas, dinámicas y servicios), asignar un responsable a cada una, ver y gestionar sus ' +
  'documentos (guiones en PDF o texto con vista previa, versiones e historial), exportar. Los Equipos ' +
  'de Servicio (líder, miembros, instrucciones) y cómo se conectan con las responsabilidades. Y cómo ' +
  'todo alimenta el Minuto a Minuto y la vista Mi Agenda, donde cada servidor ve solo lo suyo con sus ' +
  'documentos y avisos 10/5/0 minutos antes. Los nombres mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'responsabilidades', 'equipos de servicio', 'documentos', 'mi agenda', 'minuto a minuto', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar1: 'Dónde está en el menú', intro: 'Qué son las responsabilidades', types: 'Charlas y servicios',
  assign: 'Asignar el responsable', docsver: 'Ver el guion', docsmanage: 'Gestionar documentos',
  docsver2: 'Versiones e historial', export: 'Exportar', teams1: 'Equipos de servicio',
  teams2: 'Líder y miembros', teams3: 'Relación responsabilidad↔equipo', teams4: 'Instrucciones del equipo',
  mam: 'Alimenta el Minuto a Minuto', agenda1: 'Mi Agenda', agenda2: 'Documentos y avisos', outro: 'Resumen',
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
  // 🔒 Enmascarar nombres en todos los endpoints que traen participantes.
  for (const pat of ['**/responsibilities**', '**/service-teams**', '**/schedule/retreats/**', '**/participants**']) {
    await page.route(pat, maskRoute);
  }

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // ── RESPONSABILIDADES ──
    await page.goto(`${cfg.baseUrl}/app/retreats/${SA}/responsibilities`, { waitUntil: 'networkidle' });
    await page.getByText('Responsabilidades del Retiro').first().waitFor({ timeout: 15000 });
    await sleep(page, 1500);

    const asign = page.locator('button', { hasText: /^\s*Asignaciones\s*$/i }).first();
    await cueBox(nar, asign);
    await nar.say(clips.sidebar1);
    await asign.click().catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.getByText('Responsabilidades', { exact: true }).first());

    await cueBox(nar, page.getByText(/Total:/i).first());
    await nar.say(clips.intro);

    // Tipos: tab Charlas / Dinámicas
    await page.getByRole('button', { name: /Charlas\s*\/\s*Din/i }).first().click().catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, page.getByRole('button', { name: /Charlas\s*\/\s*Din/i }).first());
    await nar.say(clips.types);

    // Asignar (señalar un asignado / botón)
    await cueBox(nar, page.locator('button[title="Desasignar"], button:has-text("Asignar")').first());
    await nar.say(clips.assign);

    // Ver Documentación (guion)
    await page.locator('button[title="Ver Documentación"]').first().click().catch(() => {});
    await page.getByText(/Ver Documentaci/i).first().waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 1200);
    await nar.say(clips.docsver);
    await page.getByRole('button', { name: /Cerrar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 600);

    // Gestionar documentos (paperclip)
    await page.locator('button[title="Documentos de la responsabilidad"]').first().click().catch(() => {});
    await sleep(page, 1200);
    await cueBox(nar, page.getByText(/Subir|Documento|Markdown|texto/i).first());
    await nar.say(clips.docsmanage);
    await cueBox(nar, page.getByText(/[Vv]ersion|[Hh]istorial/).first());
    await nar.say(clips.docsver2);
    await page.getByRole('button', { name: /Cerrar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 600);

    // Exportar (menú ⋮)
    await page.locator('button:has(svg.lucide-ellipsis-vertical-icon)').first().click().catch(() => {});
    await sleep(page, 500);
    await cueBox(nar, page.getByText(/Exportar|Imprimir/i).first());
    await nar.say(clips.export);
    await page.keyboard.press('Escape');
    await sleep(page, 500);

    // ── EQUIPOS DE SERVICIO ──
    await page.goto(`${cfg.baseUrl}/app/service-teams`, { waitUntil: 'networkidle' });
    await page.getByText('Equipos de Servicio').first().waitFor({ timeout: 15000 });
    await sleep(page, 1200);
    await nar.say(clips.teams1);
    await cueBox(nar, page.getByText(/Líder/i).first());
    await nar.say(clips.teams2);
    await cueBox(nar, page.getByText(/Servidores con equipo/i).first());
    await nar.say(clips.teams3);
    await cueBox(nar, page.locator('button:has(svg.lucide-file-text-icon)').first());
    await nar.say(clips.teams4);

    // ── MINUTO A MINUTO ──
    await page.goto(`${cfg.baseUrl}/app/retreats/${SA}/minuto-a-minuto`, { waitUntil: 'networkidle' });
    await sleep(page, 2500);
    await cueBox(nar, page.locator('[id^="schedule-item-"]').first());
    await nar.say(clips.mam);

    // ── MI AGENDA ──
    await page.goto(`${cfg.baseUrl}/app/my-schedule`, { waitUntil: 'networkidle' });
    await page.getByText('Mi agenda').first().waitFor({ timeout: 15000 });
    await sleep(page, 1500);
    await cueBox(nar, page.getByText(/Pasadas|Próximas/i).first());
    await nar.say(clips.agenda1);
    await cueBox(nar, page.getByText(/Guion|\.md/i).first());
    await nar.say(clips.agenda2);

    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-resp.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'responsibilities-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
