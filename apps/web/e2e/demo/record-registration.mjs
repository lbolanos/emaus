// Video-demo narrado: "Registro al retiro" (inscribirse como caminante/servidor).
//
// Resuelve la otra mitad de la confusión: este registro PÚBLICO al retiro es distinto
// de crear tu cuenta de usuario de la plataforma.
//
//   cd apps/web && node e2e/demo/record-registration.mjs
//
// No usa storageState (el registro es público). Fuerza español. Llena el paso 1 y avanza
// al paso 2 para mostrar la progresión; NO envía (evita crear un participante real).

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv,
  ensureOutputDir,
  genTts,
  OVERLAY_INIT,
  Narrator,
  muxVideo,
  computeSyncScale,
  audioDuration,
  buildYoutubeChapters,
  writeVideoMeta,
  OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '96f06c40-327a-4513-ae48-fb4c60bbab17'; // Celaya
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0;

const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Registro al Retiro');

const LINES = [
  { id: 'intro', text: 'Este es el registro para inscribirte a un retiro, como caminante o servidor. No es tu cuenta de la plataforma.' },
  { id: 'start', text: 'Tu coordinador te comparte el enlace. Tocas "Regístrate Ahora" para empezar.' },
  { id: 'personal', text: 'Primero, tus datos personales: nombre, apellidos, apodo y fecha de nacimiento.' },
  { id: 'steps', text: 'El registro tiene seis pasos: datos, dirección, servicio y salud, contacto de emergencia y un resumen.' },
  { id: 'privacy', text: 'Agregas un teléfono y tu correo, eliges tu estado civil y aceptas el aviso de privacidad.' },
  { id: 'next', text: 'Avanzas con "Siguiente" y completas cada paso, hasta revisar tu resumen.' },
  { id: 'clarify', text: 'Recuerda: aquí solo te inscribes al retiro. No necesitas crear una cuenta de usuario para esto.' },
  { id: 'outro', text: 'Al terminar, el equipo del retiro recibe tu registro. ¡Y listo, nos vemos!' },
];

const YT_TITLE = 'Cómo inscribirte a un retiro de Emaús (registro de caminante/servidor)';
const YT_DESCRIPTION =
  'Guía del registro público para inscribirte a un retiro de Emaús como caminante o servidor. ' +
  'Explica que este registro es distinto de crear tu cuenta de usuario de la plataforma, y recorre ' +
  'el formulario paso a paso: datos personales, dirección, servicio y salud, contacto de emergencia y resumen.';
const YT_TAGS = ['Emaús', 'retiro', 'registro', 'inscripción', 'caminante', 'servidor', 'tutorial'];
const CHAPTER_LABELS = {
  intro: 'Qué es este registro',
  start: 'Empezar',
  personal: 'Datos personales',
  steps: 'Los seis pasos',
  privacy: 'Teléfono, correo y privacidad',
  next: 'Avanzar paso a paso',
  clarify: 'Registro ≠ cuenta de usuario',
  outro: 'Cierre',
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
    viewport: { width: W, height: H },
    locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // ── Portada del registro ──
    await page.goto(`${cfg.baseUrl}/register/walker/${RETREAT}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Regístrate Ahora/i }).waitFor({ timeout: 12000 });
    await sleep(page, 1200);
    await nar.say(clips.intro);

    // ── Empezar → paso 1 ──
    await nar.say(clips.start);
    await page.getByRole('button', { name: /Regístrate Ahora/i }).click();
    await page.getByText('Información Personal').first().waitFor({ timeout: 8000 });
    await sleep(page, 900);

    // ── Datos personales ──
    await page.fill('#firstName', 'Juan');
    await page.fill('#lastName', 'Pérez');
    await page.fill('#nickname', 'Juan');
    await page.fill('#birthDate', '1995-05-20');
    await sleep(page, 300);
    await nar.say(clips.personal);

    // ── Los seis pasos (resaltar el indicador superior) ──
    await nar.cueAt(640, 152);
    await nar.say(clips.steps);

    // ── Teléfono, correo, estado civil, privacidad ──
    await page.getByText('Selecciona tu estado civil').click();
    await sleep(page, 400);
    await page.getByRole('option').first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 300);
    await page.fill('#cellPhone', '4771234567');
    await page.fill('#email', 'juan.perez@gmail.com');
    await page.fill('#occupation', 'Ingeniero');
    await sleep(page, 300);
    // El "checkbox" de privacidad es un <div> con @click (no un role=checkbox).
    await page.getByText(/Acepto el aviso de privacidad/i).click({ timeout: 5000 }).catch(() => {});
    await sleep(page, 300);
    await nar.say(clips.privacy);

    // ── Avanzar al paso 2 ──
    await page.getByRole('button', { name: /Siguiente/i }).click();
    await page
      .getByText('Información de Dirección')
      .first()
      .waitFor({ timeout: 6000 })
      .catch(() => {});
    await sleep(page, 900);
    await nar.say(clips.next);

    // ── Aclaración clave ──
    await nar.say(clips.clarify);

    // ── outro ──
    await nar.say(clips.outro);
    await sleep(page, 1200);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-registration.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'registration-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
