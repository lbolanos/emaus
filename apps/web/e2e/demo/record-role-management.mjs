// Video-demo narrado: "Dar acceso y roles" (perspectiva del dueño del retiro).
//
// Contraparte de "pide acceso al dueño" (video de login). Muestra Gestión de Roles:
// solicitudes de acceso, quién tiene acceso, e invitar por correo con un rol.
//
//   cd apps/web && node e2e/demo/record-role-management.mjs
//
// Vista de ADMIN → login por storageState. PRIVACIDAD: intercepta el endpoint de usuarios
// y reemplaza nombres/correos reales por ficticios (para publicar público sin exponer a nadie).

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '96f06c40-327a-4513-ae48-fb4c60bbab17'; // Celaya
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Acceso y Roles');

// Datos ficticios para enmascarar PII.
const FAKES = [
  { displayName: 'María López', email: 'maria.lopez@correo.com', firstName: 'María', lastName: 'López' },
  { displayName: 'Juan Pérez', email: 'juan.perez@correo.com', firstName: 'Juan', lastName: 'Pérez' },
  { displayName: 'Ana Torres', email: 'ana.torres@correo.com', firstName: 'Ana', lastName: 'Torres' },
  { displayName: 'Pedro Gómez', email: 'pedro.gomez@correo.com', firstName: 'Pedro', lastName: 'Gómez' },
  { displayName: 'Lucía Díaz', email: 'lucia.diaz@correo.com', firstName: 'Lucía', lastName: 'Díaz' },
  { displayName: 'Diego Cruz', email: 'diego.cruz@correo.com', firstName: 'Diego', lastName: 'Cruz' },
];
function maskPII(node, ctr) {
  if (Array.isArray(node)) return node.forEach((n) => maskPII(n, ctr));
  if (node && typeof node === 'object') {
    if (typeof node.email === 'string' && node.email.includes('@')) {
      const f = FAKES[ctr.i++ % FAKES.length];
      node.email = f.email;
      if ('displayName' in node) node.displayName = f.displayName;
      if ('firstName' in node) node.firstName = f.firstName;
      if ('lastName' in node) node.lastName = f.lastName;
      if ('photo' in node) node.photo = null;
    } else if (typeof node.displayName === 'string') {
      node.displayName = 'Coordinación'; // p.ej. inviter sin email
    }
    for (const k of Object.keys(node)) maskPII(node[k], ctr);
  }
}

const LINES = [
  { id: 'sidebar1', text: 'Primero, ¿dónde está? En el menú de la izquierda, abre la sección Administración.' },
  { id: 'sidebar2', text: 'Y ahí aparece Gestión de Roles. Ese es el que buscamos.' },
  { id: 'intro', text: 'Cuando alguien crea su cuenta, todavía no ve tu retiro. Tú le das acceso desde aquí.' },
  { id: 'requests', text: 'En "Solicitudes de Rol" apruebas o rechazas a quien pide acceso a tu retiro.' },
  { id: 'users', text: 'Abajo ves a todos los que ya tienen acceso, con su rol y su estado.' },
  { id: 'invite', text: 'Para dar acceso, tocas "Invitar Usuario", escribes su correo y eliges su rol.' },
  { id: 'roles1', text: 'Cada rol da un acceso distinto. El administrador gestiona todo el retiro, hasta los usuarios y sus roles.' },
  { id: 'roles2', text: 'El tesorero ve los pagos; logística, inventario y mesas; comunicaciones, los mensajes; y el servidor solo consulta.' },
  { id: 'quick', text: '¿La persona ya usa Emaús? Con "Asignación Rápida" la buscas por nombre y le das el rol al instante, sin correo.' },
  { id: 'outro', text: 'Así decides quién entra a tu retiro y qué puede hacer cada quien.' },
];

const YT_TITLE = 'Dar acceso y roles en Emaús (invitar usuarios a tu retiro)';
const YT_DESCRIPTION =
  'Para administradores: cómo dar acceso a tu retiro en Emaús. Aprobar o rechazar solicitudes de ' +
  'acceso, ver quién tiene acceso y con qué rol, e invitar usuarios por correo asignándoles un rol ' +
  '(administrador, coordinador, observador, tesorero, logística, comunicaciones). Complementa el video ' +
  '"Cómo entrar a Emaús".';
const YT_TAGS = ['Emaús', 'retiro', 'roles', 'acceso', 'permisos', 'administrador', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar1: 'Dónde está en el menú', sidebar2: 'Gestión de Roles en el menú', intro: 'Gestión de Roles', requests: 'Solicitudes de acceso', users: 'Quién tiene acceso',
  invite: 'Invitar por correo', roles1: 'Qué puede cada rol', roles2: 'Tesorero, logística y más',
  quick: 'Asignación Rápida', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

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

  // 🔒 Enmascarar PII del endpoint de usuarios del retiro.
  await page.route('**/retreat-roles/retreat/*/users', async (route) => {
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      maskPII(data, { i: 0 });
      await route.fulfill({ response: resp, body: JSON.stringify(data) });
    } catch {
      await route.continue();
    }
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/role-management`, { waitUntil: 'networkidle' });
    await page.getByText('Gestión de Roles del Retiro').first().waitFor({ timeout: 15000 });
    await sleep(page, 1500);

    // ── Ubicación en el sidebar: clic real en "Administración" → aparece "Gestión de Roles" ──
    const admBtn = page.locator('button', { hasText: /Administraci/i }).first();
    await admBtn.scrollIntoViewIfNeeded().catch(() => {});
    const abox = await admBtn.boundingBox().catch(() => null);
    if (abox) await nar.cueAt(abox.x + abox.width / 2, abox.y + abox.height / 2); // señalar la sección (colapsada)
    await nar.say(clips.sidebar1); // 1ª voz (define el recorte) → el clic queda DESPUÉS y se conserva
    // clic real que expande la sección y revela los ítems
    await admBtn.click().catch(() => {});
    await sleep(page, 1000);
    const sideItem = page.getByText('Gestión de Roles', { exact: true }).first();
    await sideItem.hover({ timeout: 4000 }).catch(() => {});
    const ibox = await sideItem.boundingBox().catch(() => null);
    if (ibox) await nar.cueAt(ibox.x + ibox.width / 2, ibox.y + ibox.height / 2); // señalar el ítem ya visible
    await nar.say(clips.sidebar2);

    await nar.say(clips.intro);

    // ── Solicitudes de Rol ──
    await page.getByText('Solicitudes de Rol').first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 500);
    await nar.say(clips.requests);

    // ── Usuarios en el retiro (enmascarados) ──
    await page.getByText('Usuarios en el Retiro').first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 600);
    await nar.say(clips.users);

    // ── Invitar usuario ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    await page.getByRole('button', { name: /Invitar Usuario/i }).click();
    await sleep(page, 900);
    await page.locator('#emails').fill('nuevo.coordinador@correo.com').catch(() => {});
    await sleep(page, 400);
    // abrir el select de rol (dentro del diálogo) para mostrar los roles
    const roleTrigger = page.getByRole('dialog').getByRole('combobox').first();
    await roleTrigger.click().catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.invite);
    // Roles en español (dropdown abierto con descripciones).
    await nar.say(clips.roles1);
    await nar.say(clips.roles2);
    // Cerrar dropdown y modal.
    await page.keyboard.press('Escape');
    await sleep(page, 400);
    await page.keyboard.press('Escape');
    await sleep(page, 700);

    // ── Asignación Rápida (usuario que ya existe) ──
    await page.getByRole('button', { name: /Asignación Rápida/i }).click().catch(() => {});
    await page.getByText('Asignación Rápida de Rol').first().waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);
    await nar.say(clips.quick);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 500);

    await nar.say(clips.outro);
    await sleep(page, 1200);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-roles.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'role-management-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
