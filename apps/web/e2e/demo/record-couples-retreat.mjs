// Video-demo narrado: "Retiros de matrimonios: qué cambia".
//
// Recorre las diferencias de un retiro `retreat_type='couples'` frente a uno normal:
// configuración (compartir habitación / misma mesa, costo por pareja), el registro
// público que inscribe a los dos cónyuges de una sola vez, y cómo el vínculo se ve
// después en la lista, en las camas y en las mesas.
//
// Usa el retiro de demo poblado por `couples-fixture.mjs`: parejas FICTICIAS creadas
// por el API (nombres inventados, correos @example.com), así que no hay PII de
// participantes que enmascarar. Solo se enmascara la identidad del usuario admin
// que aparece en el sidebar.
//
//   node apps/web/e2e/demo/couples-fixture.mjs        # 1) datos
//   cd apps/web && node e2e/demo/record-couples-retreat.mjs

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Retiros de matrimonios');

const RID = process.env.DEMO_COUPLES_RETREAT_ID || 'ae34a0b2-d7e0-47aa-9599-f3abb1e5dd99';
const SLUG = process.env.DEMO_COUPLES_SLUG || 'demoparejas';

// Columnas de la vista de caminantes (route.name = 'walkers'). Se siembran en
// localStorage para que la columna Cónyuge —la diferencia que narra el video—
// ya esté visible, en vez de abrir el selector de columnas en vivo.
const WALKER_COLUMNS = [
  'id_on_retreat', 'firstName', 'lastName', 'spouseName', 'email', 'cellPhone', 'paymentRemaining',
];

// ── Identidad del admin en el sidebar ───────────────────────────────────────
// Los participantes ya son ficticios; lo único real en pantalla sería la cuenta
// con la que se graba. `/api/auth/status` es quien la expone (verificado en vivo).
const DEMO_USER = { firstName: 'Ana', lastName: 'Coordinadora', email: 'coordinacion@example.com' };
function maskUser(n) {
  if (Array.isArray(n)) return n.forEach(maskUser);
  if (n && typeof n === 'object') {
    for (const k of Object.keys(n)) {
      if (typeof n[k] === 'string') {
        // Ojo: `name` a secas NO se toca — es el nombre del ROL en este payload
        // y reemplazarlo dejaba el sidebar diciendo "Ana / Ana".
        if (/^email$/i.test(k) && n[k].includes('@')) n[k] = DEMO_USER.email;
        else if (/^(firstName|displayName|fullName)$/i.test(k)) n[k] = DEMO_USER.firstName;
        else if (/^lastName$/i.test(k)) n[k] = DEMO_USER.lastName;
      } else if (typeof n[k] === 'object') maskUser(n[k]);
    }
  }
}
async function maskUserRoute(route) {
  try {
    const resp = await route.fetch();
    const data = await resp.json();
    maskUser(data);
    return route.fulfill({ response: resp, body: JSON.stringify(data) });
  } catch {
    return route.continue();
  }
}

const LINES = [
  { id: 'intro', text: 'Un retiro de matrimonios se organiza distinto: los dos se inscriben juntos y el sistema los trata como pareja.' },
  { id: 'type', text: 'Todo empieza al crear el retiro: eliges el tipo Matrimonios.' },
  { id: 'switches', text: 'Ahí decides dos cosas de cada retiro: si las parejas comparten habitación y si se sientan en la misma mesa.' },
  { id: 'cost', text: 'El costo también cambia de sentido: es por pareja, y el sistema le carga la mitad a cada cónyuge.' },
  { id: 'form', text: 'El enlace público abre un solo formulario para los dos. El primer paso son los datos de él.' },
  { id: 'wife', text: 'El segundo paso es el de ella. Como muchos matrimonios comparten correo, el sistema lo permite y lo propone.' },
  { id: 'shared', text: 'La dirección, los contactos de emergencia y quién los invita se piden una sola vez para los dos.' },
  { id: 'list', text: 'Ya inscritos, cada quien aparece con su cónyuge al lado: siempre sabes con quién viene cada persona.' },
  { id: 'split', text: 'Y el cobro se reparte solo: si el retiro cuesta cuatro mil por pareja, a cada uno le tocan dos mil.' },
  { id: 'beds', text: 'En las camas se nota el vínculo: si el retiro los hospeda juntos, la pareja queda en la misma habitación.' },
  { id: 'tables', text: 'Y en las mesas pasa lo mismo: si elegiste sentarlos juntos, el matrimonio queda en la misma mesa.' },
  { id: 'outro', text: 'Eso es todo lo que cambia: un registro para los dos, y el resto del sistema ya sabe que son pareja.' },
];

const YT_TITLE = 'Retiros de matrimonios en Emaús: qué cambia';
const YT_DESCRIPTION =
  'Recorrido por las diferencias de un retiro de matrimonios en Emaús frente a un retiro normal. ' +
  'Se muestra la configuración del retiro (tipo Matrimonios, si las parejas comparten habitación y si ' +
  'se sientan en la misma mesa, y el costo por pareja), el registro público que inscribe a los dos ' +
  'cónyuges en un solo formulario —incluido el correo compartido y los datos que se piden una sola vez—, ' +
  'y cómo queda el vínculo después: el cónyuge visible en la lista de participantes, la pareja en la ' +
  'misma habitación y en la misma mesa. Los datos mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'matrimonios', 'parejas', 'registro', 'camas', 'mesas', 'tutorial'];
const CHAPTER_LABELS = {
  intro: 'Qué cambia', type: 'Tipo Matrimonios', switches: 'Habitación y mesa',
  cost: 'Costo por pareja', form: 'Un formulario para los dos', wife: 'Datos de ella y correo compartido',
  shared: 'Lo que se pide una vez', list: 'El cónyuge en la lista', split: 'El cobro se reparte',
  beds: 'Misma habitación',
  tables: 'Misma mesa', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

async function cueBox(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch { /* el beat sigue sin el círculo */ }
}

/** Llena el paso de datos personales del asistente de pareja. */
async function fillSpouse(page, d) {
  await page.locator('#firstName').fill(d.firstName).catch(() => {});
  await page.locator('#lastName').fill(d.lastName).catch(() => {});
  await page.locator('#nickname').fill(d.firstName).catch(() => {});
  await page.locator('#birthDate').fill(d.birthDate).catch(() => {});
  await page.locator('#cellPhone').fill(d.cellPhone).catch(() => {});
  await page.locator('#email').fill(d.email).catch(() => {});
  await page.locator('#occupation').fill(d.occupation).catch(() => {});
}

async function main() {
  ensureOutputDir();
  log('🎙️  TTS…');
  const clips = {};
  for (const l of LINES) clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };

  const browser = await chromium.launch({ headless: false, slowMo: 45 });

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
  await ctx.addInitScript(
    ([cols]) => localStorage.setItem('participant-columns-walkers', JSON.stringify(cols)),
    [WALKER_COLUMNS],
  );
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);

  // Solo la identidad del admin: los participantes del retiro demo ya son ficticios.
  // Prefijo **/api/ obligatorio para no interceptar la navegación del SPA.
  await page.route('**/api/auth/status**', maskUserRoute);

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // ── 1. Configuración del retiro ─────────────────────────────────────────
    // El goto a /app/retreats renderiza en blanco (el SPA necesita el retiro
    // elegido desde la UI): se entra por una vista del retiro y se edita desde
    // el sidebar, que además muestra dónde vive la acción.
    await page.goto(`${cfg.baseUrl}/app/retreats/${RID}/bed-assignments`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /Asignaci[oó]n de camas/i }).first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1500);

    const retreatPicker = page.locator('button', { hasText: /Santa Ana/i }).first();
    await cueBox(nar, retreatPicker);
    await nar.say(clips.intro);

    // Abrir el modal de edición del retiro. El botón del sidebar expone
    // aria-label="Editar" (NO title: verificado en vivo) y responde al click normal.
    const editBtn = page.locator('button[aria-label="Editar"]').first();
    await cueBox(nar, editBtn);
    await editBtn.click().catch(() => {});
    const dlg = page.locator('[role="dialog"]').first();
    await dlg.waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(page, 1200);

    await cueBox(nar, dlg.getByText('Matrimonios').first());
    await nar.say(clips.type);

    // Pestaña Logística: ahí viven los dos interruptores de parejas.
    await dlg.getByRole('tab', { name: /Log[ií]stica/i }).click().catch(() => {});
    await sleep(page, 1200);
    await cueBox(nar, dlg.getByText(/Las parejas comparten habitaci[oó]n/i).first());
    await nar.say(clips.switches);

    // Pestaña Finanzas: el costo es por pareja.
    await dlg.getByRole('tab', { name: /Finanzas/i }).click().catch(() => {});
    await sleep(page, 1200);
    await cueBox(nar, dlg.getByText(/POR PAREJA/i).first());
    await nar.say(clips.cost);
    await page.keyboard.press('Escape');
    await sleep(page, 800);

    // ── 2. Registro público de la pareja ────────────────────────────────────
    await nar.clearCue?.();
    await page.goto(`${cfg.baseUrl}/${SLUG}?test=true`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Datos de él' }).waitFor({ timeout: 12000 }).catch(() => {});
    await sleep(page, 1000);

    await cueBox(nar, page.getByRole('heading', { name: 'Datos de él' }).first());
    await nar.say(clips.form);
    await fillSpouse(page, {
      firstName: 'Martín', lastName: 'Herrera', birthDate: '1979-06-12',
      cellPhone: '5500001234', email: 'herrera@example.com', occupation: 'Arquitecto',
    });
    await page.getByRole('button', { name: /Acepto el aviso de privacidad/i }).click().catch(() => {});
    await sleep(page, 700);
    await page.getByTestId('couple-next').click().catch(() => {});
    await page.getByRole('heading', { name: 'Datos de ella' }).waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(page, 900);

    // El correo del cónyuge viene pre-llenado: es la diferencia que se narra.
    await cueBox(nar, page.locator('#email'));
    await nar.say(clips.wife);
    await fillSpouse(page, {
      firstName: 'Verónica', lastName: 'Herrera', birthDate: '1981-02-08',
      cellPhone: '5500001235', email: 'herrera@example.com', occupation: 'Nutrióloga',
    });
    await page.getByRole('button', { name: /Acepto el aviso de privacidad/i }).click().catch(() => {});
    await sleep(page, 600);
    await page.getByTestId('couple-next').click().catch(() => {});
    await sleep(page, 1100);

    await cueBox(nar, page.getByText(/La direcci[oó]n se registra una sola vez/i).first());
    await nar.say(clips.shared);
    await sleep(page, 600);

    // ── 3. El vínculo dentro de la app ──────────────────────────────────────
    await nar.clearCue?.();
    await page.goto(`${cfg.baseUrl}/app/retreats/${RID}/bed-assignments`, { waitUntil: 'networkidle' });
    await sleep(page, 1000);
    await page.goto(`${cfg.baseUrl}/app/walkers`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await sleep(page, 1600);

    // La columna Cónyuge viene sembrada en localStorage (ver WALKER_COLUMNS).
    const spouseHeader = page.getByRole('columnheader', { name: /C[oó]nyuge/i }).first();
    await cueBox(nar, spouseHeader);
    await nar.say(clips.list);

    // El cobro por pareja se ve en la misma tabla: mitad del costo a cada uno.
    await cueBox(nar, page.getByRole('columnheader', { name: /Falta por pagar/i }).first());
    await nar.say(clips.split);

    // Camas: la pareja en la misma habitación (8-1 y 8-2 en los datos de demo).
    await page.goto(`${cfg.baseUrl}/app/retreats/${RID}/bed-assignments`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /Asignaci[oó]n de camas/i }).first().waitFor({ timeout: 12000 }).catch(() => {});
    await sleep(page, 1800);
    await cueBox(nar, page.getByText('Andrés Rivas').first());
    await nar.say(clips.beds);

    // Mesas: el matrimonio en la misma mesa.
    await page.goto(`${cfg.baseUrl}/app/tables`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await sleep(page, 1600);
    await cueBox(nar, page.getByText(/Caminantes \(4\)/i).first());
    await nar.say(clips.tables);

    await nar.clearCue?.();
    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-couples.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'couples-retreat-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
