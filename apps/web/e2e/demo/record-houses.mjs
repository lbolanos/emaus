// Video-demo narrado: "Casas y camas".
//
// Cubre: dónde está (Configuración Global → Casas), CREAR una casa (formulario + búsqueda de
// dirección con Google, narrado sin enviar), el MAPA DE CAMAS con sus secciones (piso →
// habitación → cama), TODAS las formas de agregar camas (lote, agregar cama, agregar habitación,
// duplicar), tipo/uso, y OPERACIONES MASIVAS (seleccionar varias → cambiar tipo / eliminar).
// NO guarda ni envía (no muta datos).
//
//   cd apps/web && node e2e/demo/record-houses.mjs

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Casas y Camas');

const LINES = [
  { id: 'sidebar', text: 'Las casas del retiro viven en el menú, en Configuración Global, en Casas.' },
  { id: 'form', text: 'Con Agregar Casa creas una, o Editar para cambiarla: capturas el nombre y la dirección con Google, que trae la ciudad, el país y la zona horaria.' },
  { id: 'personalize', text: 'En el siguiente paso, Capacidad y Camas, personalizas el nombre de cada piso: Planta Baja, Planta Alta, la Azotea.' },
  { id: 'masivas', text: 'Con Operaciones Masivas generas muchas camas de golpe: defines una plantilla de camas por habitación y la aplicas a los pisos.' },
  { id: 'addstruct', text: 'O las agregas a mano con Nuevo Piso, Nueva Habitación y Nueva Cama, y a cada cama le pones su tipo y su uso.' },
  { id: 'openmap', text: 'Y en el Mapa de Camas ves toda la casa visual, por piso y habitación, con un color por tipo y por uso.' },
  { id: 'save', text: 'Cualquier cambio queda marcado y lo guardas con Guardar.' },
];

const YT_TITLE = 'Casas y camas en Emaús: crear casa y armar el mapa de camas';
const YT_DESCRIPTION =
  'Cómo administrar las casas de retiro en Emaús: dónde están en el menú (Configuración Global → ' +
  'Casas), cómo crear una casa (nombre y dirección con Google), y el mapa de camas por piso, ' +
  'habitación y cama. Verás todas las formas de agregar camas —Agregar Camas en Lote, agregar cama, ' +
  'agregar habitación, duplicar habitación—, el tipo (normal, litera, colchón) y el uso (caminante o ' +
  'servidor), y las operaciones masivas: seleccionar varias camas para cambiarles el tipo o eliminarlas.';
const YT_TAGS = ['Emaús', 'retiro', 'casas', 'camas', 'mapa de camas', 'habitaciones', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar: 'Dónde están las casas', form: 'Crear / editar casa', personalize: 'Nombres de piso',
  masivas: 'Operaciones masivas', addstruct: 'Piso, habitación y cama', openmap: 'Mapa de camas',
  save: 'Guardar',
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
  page.setDefaultTimeout(6000); // ningún clic fallido debe generar huecos de 30s
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const cueBox = async (loc) => {
    const bx = await loc.boundingBox().catch(() => null);
    if (bx) await nar.cueAt(bx.x + bx.width / 2, bx.y + bx.height / 2);
  };
  const openMenu = async (i) => {
    await page.locator('button[aria-haspopup="menu"]').nth(i).click().catch(() => {});
    await sleep(page, 500);
  };

  try {
    await page.goto(`${cfg.baseUrl}/app/houses`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Agregar Casa/i }).waitFor({ timeout: 15000 });
    await sleep(page, 1200);

    // ── Ubicación en el menú: Configuración Global → Casas ──
    const cfgSection = page.locator('button', { hasText: /Configuración Global/i }).first();
    await cfgSection.scrollIntoViewIfNeeded().catch(() => {});
    await cueBox(cfgSection);
    await nar.say(clips.sidebar); // 1ª voz (recorte) → clics quedan después
    await cfgSection.click().catch(() => {});
    await sleep(page, 800);

    // ── Crear/editar casa: abrir el formulario vía Editar (mismo modal, sin Google) ──
    await cueBox(page.getByRole('button', { name: /Agregar Casa/i }));
    await sleep(page, 500);
    await page
      .getByRole('row', { name: /Casa de Retiro Ema/i })
      .getByRole('button', { name: /Editar/i })
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.getByText(/Editar Casa/i).first().waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);
    await nar.say(clips.form); // paso 1: datos de la casa

    // ── Siguiente → paso 2 (Capacidad y Camas) ──
    await page.getByRole('button', { name: /Siguiente/i }).click({ timeout: 5000 }).catch(() => {});
    await page.getByText(/Capacidad y Camas/i).first().waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);

    // ── Personalizar nombres de piso (Planta Baja / Planta Alta) ──
    await cueBox(page.getByText(/Nombres de pisos/i).first());
    await nar.say(clips.personalize);

    // ── Operaciones Masivas: plantilla de camas por habitación ──
    await page.getByRole('button', { name: /Operaciones Masivas/i }).click({ timeout: 5000 }).catch(() => {});
    await page.getByText(/Plantilla de Camas/i).first().waitFor({ timeout: 5000 }).catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.masivas);
    await page.keyboard.press('Escape'); // cerrar el generador (diálogo anidado)
    await sleep(page, 600);

    // ── Agregar a mano: Nuevo Piso / Nueva Habitación / Nueva Cama ──
    await page.getByRole('button', { name: /Nueva Cama/i }).first().scrollIntoViewIfNeeded().catch(() => {});
    await cueBox(page.getByRole('button', { name: /Nuevo Piso/i }).first());
    await nar.say(clips.addstruct);
    await sleep(page, 400);
    // cerrar el modal de casa sin guardar
    await page.getByRole('button', { name: /Cancelar/i }).first().click({ timeout: 4000 }).catch(() => page.keyboard.press('Escape'));
    await page.getByText(/Editar Casa/i).waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
    await sleep(page, 600);

    // ── Mapa de camas (visual) ──
    await page.getByRole('button', { name: /Mapa/i }).first().click().catch(() => {});
    await page.getByText(/Mapa de Camas/i).first().waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(page, 1000);
    await nar.say(clips.openmap);

    // ── Guardar: un cambio (agregar cama) hace aparecer Guardar; lo señalo (sin guardar) ──
    await page.getByRole('button', { name: /Agregar Cama/i }).first().click({ timeout: 4000 }).catch(() => {});
    await sleep(page, 700);
    await cueBox(page.getByRole('button', { name: /^Guardar/i }).first());
    await nar.say(clips.save);

    await sleep(page, 1200);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-houses.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'houses-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
