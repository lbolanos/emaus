// Video-demo narrado: "Registro de SERVIDOR" (diferencias vs. caminante).
//
// Muestra lo propio del servidor: búsqueda por correo (servidor recurrente = solo correo),
// y el paso 5 con angelito + disponibilidad/horarios, tallas de camiseta por tipo y comida.
//
//   cd apps/web && node e2e/demo/record-registration-server.mjs
//
// Público (sin auth), español forzado. Recorre como servidor NUEVO hasta el paso 5. NO envía.

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Registro de Servidor');

const LINES = [
  { id: 'intro', text: 'El registro de servidor se parece al de caminante, pero tiene pasos extra. Te muestro las diferencias.' },
  { id: 'lookup', text: 'Si ya serviste antes, escribe tu correo y toca "Buscar": recuperamos tu registro y solo confirmas.' },
  { id: 'new', text: '¿Es tu primera vez? Toca "Registrarme como nuevo".' },
  { id: 'base', text: 'Llenas tus datos, dirección, salud y contacto de emergencia, igual que un caminante.' },
  { id: 'angelito', text: 'En el último paso, lo propio del servidor. Si sirves como angelito, lo marcas y registras tu disponibilidad.' },
  { id: 'extras', text: 'Eliges tu talla para cada tipo de camiseta y, si el retiro cobra comidas, indicas las que tomarás.' },
  { id: 'outro', text: 'Revisas tu resumen, envías, y el equipo recibe tu registro con todo lo de servidor. ¡Gracias por servir!' },
];

const YT_TITLE = 'Registro de servidor en Emaús: angelito, horarios y camisetas';
const YT_DESCRIPTION =
  'Cómo inscribirte como SERVIDOR a un retiro de Emaús y en qué se diferencia del registro de ' +
  'caminante: la búsqueda por correo para quienes ya sirvieron (solo confirmas), y el paso final ' +
  'con la opción de angelito y su disponibilidad de horarios, la talla por cada tipo de camiseta ' +
  'y la comida. Los primeros pasos (datos, dirección, salud, contacto) son iguales.';
const YT_TAGS = ['Emaús', 'retiro', 'servidor', 'registro', 'angelito', 'camisetas', 'tutorial'];
const CHAPTER_LABELS = {
  intro: 'Diferencias del servidor', lookup: 'Ya serviste antes: solo tu correo',
  new: 'Registrarme como nuevo', base: 'Pasos base (como caminante)',
  angelito: 'Angelito y horarios', extras: 'Camisetas y comida', outro: 'Enviar',
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
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const clickNext = async () => {
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await sleep(page, 900);
  };

  try {
    // ── Portada de servidor ──
    await page.goto(`${cfg.baseUrl}/register/server/${RETREAT}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Regístrate Ahora/i }).waitFor({ timeout: 12000 });
    await sleep(page, 1200);
    await nar.say(clips.intro);

    // ── Búsqueda por correo (servidor recurrente) ──
    await page.getByRole('button', { name: /Regístrate Ahora/i }).click();
    await page.locator('#email-lookup').waitFor({ timeout: 8000 });
    await sleep(page, 700);
    await page.fill('#email-lookup', 'servidor@gmail.com');
    await sleep(page, 300);
    await nar.say(clips.lookup);

    // ── Registrarme como nuevo → paso 1 ──
    await nar.say(clips.new);
    await page.getByRole('button', { name: /Registrarme como nuevo/i }).click();
    await page.getByText('Información Personal').first().waitFor({ timeout: 8000 });
    await sleep(page, 700);

    // ── base: paso 1 ──
    await nar.say(clips.base);
    await page.fill('#firstName', 'Carlos');
    await page.fill('#lastName', 'Ramírez');
    await page.fill('#nickname', 'Charly');
    await page.fill('#birthDate', '1990-03-12');
    await page.getByText('Selecciona tu estado civil').click();
    await sleep(page, 300);
    await page.getByRole('option').first().click().catch(() => page.keyboard.press('Escape'));
    await page.fill('#cellPhone', '4779876543');
    await page.fill('#email', 'carlos.ramirez@gmail.com');
    await page.fill('#occupation', 'Contador');
    await page.getByText(/Acepto el aviso de privacidad/i).click({ timeout: 5000 }).catch(() => {});
    await sleep(page, 300);
    await clickNext();

    // ── paso 2: dirección (país/estado/ciudad ya traen default) ──
    await page.fill('#street', 'Av. Juárez');
    await page.fill('#houseNumber', '123');
    await page.fill('#postalCode', '38000');
    await page.fill('#neighborhood', 'Centro');
    await sleep(page, 300);
    await clickNext();

    // ── paso 3: salud (No a ronca / medicación / dieta) ──
    const noBtns = page.getByRole('button', { name: 'No', exact: true });
    const n = await noBtns.count();
    for (let i = 0; i < Math.min(n, 3); i++) await noBtns.nth(i).click().catch(() => {});
    await sleep(page, 400);
    await clickNext();

    // ── paso 4: contacto de emergencia (opcional para servidor) ──
    await clickNext();

    // ── paso 5: información de servidor ──
    await page.getByText('Registrar como angelito').first().waitFor({ timeout: 8000 });
    await sleep(page, 700);
    // angelito → aparece la disponibilidad
    await page.getByText('Registrar como angelito').first().click().catch(() => {});
    await sleep(page, 900);
    await nar.say(clips.angelito);

    // scroll para mostrar camisetas / comida
    await page.mouse.move(640, 420);
    await page.mouse.wheel(0, 520);
    await sleep(page, 700);
    await nar.say(clips.extras);

    await nar.say(clips.outro);
    await sleep(page, 1200);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-server.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'registration-server-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
