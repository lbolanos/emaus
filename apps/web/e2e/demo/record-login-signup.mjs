// Video-demo narrado: "Cómo entrar a Emaús" (login, crear cuenta, Google, pedir acceso).
//
// Resuelve la confusión más común: registrarte como USUARIO ≠ inscribirte a un RETIRO,
// y que tras crear tu cuenta hay que PEDIR ACCESO al dueño del retiro (roles).
//
//   cd apps/web && node e2e/demo/record-login-signup.mjs
//
// A diferencia de los otros demos, NO usa storageState: el login/registro ES el contenido,
// así que graba la app sin autenticar. Fuerza el idioma español (localStorage preferred-locale).

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
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0;

// Brand del overlay para este video (reusa el init de demo-lib cambiando el rótulo).
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Acceso y Registro');

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'intro', text: '¿Cómo entras a Emaús? En un minuto: iniciar sesión, crear tu cuenta y pedir acceso a tu retiro.' },
  { id: 'login', text: 'Esta es la pantalla de inicio. Si ya tienes cuenta, escribe tu correo y tu contraseña, y entra.' },
  { id: 'forgot', text: '¿Olvidaste tu contraseña? Toca aquí y te enviamos un enlace para crear una nueva.' },
  { id: 'noaccount', text: 'Pero si te marca error, casi siempre es porque todavía no tienes cuenta. Hay que crearla.' },
  { id: 'google', text: 'Lo más rápido: el botón de Google. Entras con tu cuenta de Google, sin inventar otra contraseña.' },
  { id: 'create', text: '¿No tienes cuenta? Toca "Crear cuenta".' },
  { id: 'register', text: 'Pon tu nombre, tu correo y una contraseña de al menos ocho caracteres. Confírmala y listo.' },
  { id: 'tworeg', text: 'Ojo: crear tu cuenta no es lo mismo que inscribirte a un retiro. Ese registro es otro enlace.' },
  { id: 'access', text: 'Ya con tu cuenta, todavía no verás ningún retiro. Pídele al dueño del retiro que te dé acceso.' },
  { id: 'roles', text: 'Él te asigna un rol: administrador ve todo, coordinador maneja su retiro y lector solo consulta.' },
  { id: 'outro', text: 'En resumen: crea tu cuenta o entra con Google, y pide acceso a tu retiro. ¡Nos vemos adentro!' },
];

const YT_TITLE = 'Cómo entrar a Emaús: iniciar sesión, crear cuenta y pedir acceso | Emaús';
const YT_DESCRIPTION =
  'Guía rápida para acceder a la plataforma Emaús. Explica la diferencia entre crear tu ' +
  'cuenta de usuario e inscribirte a un retiro, cómo iniciar sesión, recuperar tu contraseña, ' +
  'entrar con Google, y que tras registrarte debes pedir acceso al dueño del retiro, que te ' +
  'asigna un rol (administrador, coordinador o lector).';
const YT_TAGS = ['Emaús', 'retiro', 'login', 'iniciar sesión', 'crear cuenta', 'acceso', 'tutorial'];
const CHAPTER_LABELS = {
  intro: 'Cómo entrar',
  login: 'Iniciar sesión',
  forgot: 'Olvidé mi contraseña',
  noaccount: 'Si te da error',
  google: 'Entrar con Google',
  create: 'Crear cuenta',
  register: 'Datos de registro',
  tworeg: 'Cuenta ≠ registro al retiro',
  access: 'Pedir acceso al retiro',
  roles: 'Los roles',
  outro: 'Resumen',
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

  // Contexto SIN storageState (mostramos el flujo sin autenticar). Idioma español.
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
    // ── Pantalla de inicio de sesión (español) ──
    await page.goto(`${cfg.baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.getByText('Iniciar Sesión').first().waitFor({ timeout: 12000 });
    await sleep(page, 1200);

    await nar.say(clips.intro);

    // ── login: escribir correo + contraseña de ejemplo ──
    await page.fill('#email', 'tu.correo@gmail.com');
    await sleep(page, 300);
    await page.fill('#password', 'MiContraseña');
    await sleep(page, 300);
    await nar.say(clips.login);

    // ── forgot: resaltar el enlace (sin navegar; esa pantalla aún está en inglés) ──
    await nar.cueAt(766, 389);
    await nar.say(clips.forgot);
    await nar.say(clips.noaccount);

    // ── google: resaltar el botón ──
    await nar.cueAt(639, 571);
    await nar.say(clips.google);

    // ── create: cambiar a modo registro ──
    await page.locator('button.underline').first().click(); // "Crear cuenta"
    await page.getByText('Crear Cuenta').first().waitFor({ timeout: 8000 });
    await sleep(page, 700);
    await nar.say(clips.create);

    // ── register: llenar los campos (NO enviar: evita crear cuenta real) ──
    await page.fill('#displayName', 'María López');
    await sleep(page, 250);
    await page.fill('#email', 'maria.lopez@gmail.com');
    await sleep(page, 250);
    await page.fill('#password', 'contrasena123');
    await sleep(page, 250);
    await page.fill('#confirmPassword', 'contrasena123');
    await sleep(page, 300);
    await nar.say(clips.register);

    // ── aclaración: cuenta ≠ registro al retiro (sobre el formulario) ──
    await nar.say(clips.tworeg);

    // ── volver a login para el cierre ──
    await page.locator('button.underline').first().click(); // "Iniciar sesión"
    await page.getByText('Iniciar Sesión').first().waitFor({ timeout: 8000 });
    await sleep(page, 700);
    await nar.say(clips.access);
    await nar.say(clips.roles);

    // ── outro ──
    await nar.say(clips.outro);
    await sleep(page, 1200);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-login.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'login-signup-demo.mp4');
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
