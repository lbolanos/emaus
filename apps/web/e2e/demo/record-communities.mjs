// Video-demo narrado: "Comunidades (CRM)" — acompañamiento, miembros, reuniones y asistencia.
//
// Recorre la feature de Comunidades ENTRANDO a cada pantalla, con enfoque PASTORAL (acompañar
// para que nadie se aleje del camino, NO controlar):
//   qué es y dónde vive (sección Comunidad) · registro público mostrando la RUTA real (landing →
//   mapa "Encuentra tu Comunidad" → botón "Registra tu comunidad" → formulario) · dashboard ·
//   miembros (buscar/filtrar, crear/importar de un retiro, estado = a quién acompañar, "Editar
//   datos" = overlay per-community) · reuniones · las VARIAS formas de registrar asistencia:
//   manual por reunión y por miembro, enlace público que cada quien abre en su CELULAR, y el
//   asistente (bot) que registra conversando o leyendo una FOTO de la lista escrita a mano ·
//   analítica · Mis Comunidades (vista del miembro) · administradores.
// Comunidad real "Buen despacho" con enmascarado TOTAL de PII de personas. NO muta nada.
//
//   cd apps/web && node e2e/demo/record-communities.mjs
//
// Reglas (skills community-*): state = SEGUIMIENTO/acompañamiento, no permiso ni control; el
// perfil del miembro es un OVERLAY per-community sobre el Participant global.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
  renderEndCard, appendEndCard,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Comunidades');
const COMM = process.env.COMMUNITY_ID || 'f1060047-5305-4f75-89c4-a649e449975e'; // "Buen despacho" (81 miembros, 4 reuniones)
const MEETING = process.env.MEETING_ID || '6ebac2b1-15fe-47f1-8f9e-c06e90ee746a'; // "Del Valle" (pasada)

// ── Enmascarado TOTAL de PII de personas (idéntico al del tour) ──────────────
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
      const f = fakeFor(n.id || n.displayName);
      n.displayName = `${f.first} ${f.last}`;
      if (typeof n.name === 'string' && n.name.trim() && !n.name.includes('@')) n.name = `${f.first} ${f.last}`;
      if (typeof n.fullName === 'string') n.fullName = `${f.first} ${f.last}`;
    }
    if (typeof n.fullName === 'string' && n.fullName.trim() && !('firstName' in n) && !('displayName' in n)) {
      const f = fakeFor(n.id || n.fullName); n.fullName = `${f.first} ${f.last}`;
    }
    if (typeof n.email === 'string' && n.email.includes('@')) {
      const f = fakeFor(n.email);
      n.email = `${f.first}.${f.last}@correo.com`.toLowerCase();
    }
    if (typeof n.photo === 'string' && n.photo.startsWith('http')) n.photo = '';
    if (typeof n.avatar === 'string' && n.avatar.startsWith('http')) n.avatar = '';
    for (const k of Object.keys(n)) {
      if (/phone|celular|tel[eé]fono|whatsapp/i.test(k) && typeof n[k] === 'string' && n[k].replace(/\D/g, '').length >= 7) {
        n[k] = '55' + String(10000000 + (hstr(n[k]) % 90000000));
      }
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (typeof v === 'object') maskNode(v);
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

// ── Guion (tuteo, frases < 25 palabras; tono pastoral: acompañar, no controlar) ──
const LINES = [
  { id: 'intro', text: 'Cuando el retiro termina, lo que importa es que nadie se quede solo. En la sección Comunidad del menú acompañas a quienes ya lo vivieron.' },
  { id: 'registroMapa', text: 'En la página de inicio, cualquiera encuentra comunidades cercanas en este mapa, sin necesidad de entrar.' },
  { id: 'registroForm', text: 'Y con Registra tu comunidad propone la suya. Un administrador la revisa y la aprueba antes de publicarla.' },
  { id: 'dashboard', text: 'Al abrir una comunidad, su panel te resume todo: cuántos miembros tiene, sus reuniones y qué tan seguido asisten.' },
  { id: 'miembros', text: 'En Miembros está la lista completa. Buscas por nombre, correo o teléfono, y filtras por estado con un clic.' },
  { id: 'crearImportar', text: 'Sumas gente de dos formas: la creas a mano, o la importas directo de un retiro que ya terminó.' },
  { id: 'estados', text: 'El estado de cada miembro te dice a quién acompañar: a quién llamar o escribir para que no se aleje. Es seguimiento, nunca control.' },
  { id: 'editar', text: 'Con Editar datos, la comunidad guarda su propio nombre y contacto de la persona, sin cambiar su ficha global.' },
  { id: 'reuniones', text: 'En Reuniones llevas las juntas de la comunidad, agrupadas en próximas, pasadas y todas.' },
  { id: 'asistReunion', text: 'La asistencia se registra de varias maneras. La más directa: desde una reunión, marcas quién vino.' },
  { id: 'asistMiembro', text: 'O desde un miembro, marcas de una vez todas las reuniones a las que asistió.' },
  { id: 'enlacePublico', text: 'Desde cada reunión también compartes un enlace público. Lo mandas al grupo con un clic.' },
  { id: 'publicView', text: 'Y cada quien lo abre en su celular, busca su nombre y marca su propia asistencia. Sin instalar nada.' },
  { id: 'bot', text: 'O deja que el asistente lo haga: registra asistencia conversando, o lee una foto de la lista escrita a mano.' },
  { id: 'analitica', text: 'Con esos datos, el panel calcula la asistencia promedio y cómo se reparten los estados de tus miembros.' },
  { id: 'misComunidades', text: 'Cada miembro tiene su propia vista, Mis Comunidades, donde ve sus próximas reuniones y confirma si va a ir.' },
  { id: 'admins', text: 'Y puedes invitar a otros administradores para llevar la comunidad en equipo.' },
  { id: 'outro', text: 'Así, en Emaús, el retiro no termina el domingo. La comunidad camina contigo para que nadie se pierda.' },
];

const STEPS = [
  { clip: 'intro', url: `/app/communities`, wait: /Comunidades|Agregar Comunidad/i, group: 'Comunidad', item: 'Comunidades', settle: 1800 },
  { clip: 'registroMapa', url: `/`, wait: /Encuentra tu Comunidad/i, scrollToText: /Encuentra tu Comunidad/i, cueText: /Encuentra tu Comunidad/i, settle: 2600 },
  { clip: 'registroForm', cueRole: { role: 'link', name: /Registra tu comunidad/i }, clickAfter: { role: 'link', name: /Registra tu comunidad/i, wait: /Comparte tu comunidad/i, holdMs: 2600 } },
  { clip: 'dashboard', url: `/app/communities/${COMM}`, wait: /Total de Miembros/i, cueText: /Total de Miembros/i, settle: 1800 },
  { clip: 'miembros', url: `/app/communities/${COMM}/members`, wait: /Miembros/i, cueSel: 'input[placeholder*="Buscar por nombre"]', settle: 1600 },
  { clip: 'crearImportar', cueRole: { role: 'button', name: /Crear miembro/i }, act: 'import', holdMs: 1500 },
  { clip: 'estados', act: 'stateDropdown', holdMs: 1800 },
  { clip: 'editar', act: 'editDatos', holdMs: 1800 },
  { clip: 'reuniones', url: `/app/communities/${COMM}/meetings`, wait: /Reuniones/i, tab: /Todas/, cueText: /Del Valle/i, settle: 1400 },
  { clip: 'asistReunion', url: `/app/communities/${COMM}/attendance/${MEETING}`, wait: /Registrar Asistencia/i, cueText: /Presentes|Total/i, settle: 1800 },
  { clip: 'asistMiembro', url: `/app/communities/${COMM}/members`, wait: /Miembros/i, act: 'clipboard', holdMs: 1800 },
  { clip: 'enlacePublico', url: `/app/communities/${COMM}/meetings`, wait: /Reuniones/i, tab: /Todas/, cueSel: 'button:has(svg.lucide-share-icon)', clickAfter: { sel: 'button:has(svg.lucide-share-icon)', holdMs: 2600 } },
  { clip: 'publicView', url: `/public/attendance/${COMM}/${MEETING}`, wait: /Presentes|Total|Buscar miembros/i, cueText: /Presentes/i, settle: 2200 },
  { clip: 'bot', url: `/app/communities/${COMM}/members`, wait: /Miembros/i, act: 'bot', holdMs: 2400 },
  { clip: 'analitica', url: `/app/communities/${COMM}`, wait: /Total de Miembros/i, scrollToText: /Distribuci[oó]n de Estado/i, cueText: /Distribuci[oó]n de Estado/i, settle: 1600 },
  { clip: 'misComunidades', url: `/app/my-communities`, wait: /Mis Comunidades/i, group: 'Comunidad', item: 'Mis Comunidades', cueText: /CONFIRMAR|Próximas Reuniones/i, settle: 1600 },
  { clip: 'admins', url: `/app/communities/${COMM}/admins`, wait: /Administradores/i, cueRole: { role: 'button', name: /Invitar Administrador/i }, settle: 1400 },
  { clip: 'outro', url: `/app/communities/${COMM}`, wait: /Total de Miembros/i, cueText: /Buen despacho|Total de Miembros/i, settle: 1400 },
];

const YT_TITLE = 'Comunidades en Emaús: acompañar, reuniones y asistencia';
const YT_DESCRIPTION =
  'Cómo usar Comunidades en Emaús para que, cuando el retiro termine, nadie se quede solo. La comunidad sirve para ' +
  'acompañar —saber a quién llamar o escribir para que no se aleje del camino—, no para controlar. El recorrido: ' +
  'dónde vive en el menú; el registro público desde la página de inicio (mapa "Encuentra tu Comunidad" → botón ' +
  '"Registra tu comunidad" → formulario que un administrador aprueba); el panel de la comunidad; la lista de ' +
  'miembros con búsqueda y filtros; sumar gente a mano o importándola de un retiro; el estado de cada miembro como ' +
  'marca de acompañamiento (a quién llamar/escribir), no de permiso; "Editar datos", que guarda el nombre y contacto ' +
  'propios de esa comunidad sin tocar la ficha global; las reuniones; y las varias formas de registrar asistencia: ' +
  'manual por reunión y por miembro, un enlace público que cada quien abre en su celular para marcarse, y el ' +
  'asistente que registra conversando o leyendo una foto de la lista escrita a mano; la analítica; "Mis ' +
  'Comunidades", la vista de cada miembro; y la invitación de administradores. Los nombres, correos y teléfonos ' +
  'mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'comunidad', 'comunidades', 'CRM', 'acompañamiento', 'miembros', 'reuniones', 'asistencia', 'tutorial'];
// Sin numeración: buildYoutubeChapters omite capítulos a <10s del anterior (pacing de beats cortos).
const CHAPTER_LABELS = {
  intro: 'Qué es y dónde vive', registroMapa: 'Encuentra tu comunidad', registroForm: 'Registro público',
  dashboard: 'Panel de la comunidad', miembros: 'Miembros: buscar y filtrar', crearImportar: 'Crear e importar miembros',
  estados: 'Estado: a quién acompañar', editar: 'Editar datos por comunidad', reuniones: 'Reuniones',
  asistReunion: 'Asistencia por reunión', asistMiembro: 'Asistencia por miembro', enlacePublico: 'Enlace público',
  publicView: 'Marcar desde el celular', bot: 'Asistente y foto de la lista', analitica: 'Analítica',
  misComunidades: 'Mis Comunidades', admins: 'Administradores', outro: 'Cierre',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

async function unstick(page) {
  await page.evaluate(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }).catch(() => {});
}
async function cueLoc(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch {}
}
function sectionBtn(page, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('button', { hasText: new RegExp(`^\\s*${esc}\\s*$`, 'i') }).first();
}
async function ensureExpanded(page, label) {
  const hdr = sectionBtn(page, label);
  if ((await hdr.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await hdr.scrollIntoViewIfNeeded().catch(() => {});
    await hdr.click().catch(() => {});
    await page.waitForTimeout(450);
  }
}

// Abre una interacción y devuelve una función para cerrarla (o null).
async function openAct(page, act) {
  const firstRow = page.locator('tbody tr').first();
  if (act === 'import') {
    await page.getByRole('button', { name: /Importar Miembros/i }).first().click().catch(() => {});
    await page.getByText(/Seleccionar Retiro/i).first().waitFor({ timeout: 4000 }).catch(() => {});
  } else if (act === 'stateDropdown') {
    await firstRow.locator('[role="combobox"]').first().click().catch(() => {});
    await page.locator('[role="option"]').first().waitFor({ timeout: 4000 }).catch(() => {});
  } else if (act === 'editDatos') {
    await firstRow.locator('button[aria-haspopup="menu"]').last().click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('[role="menuitem"]', { hasText: /Editar datos/i }).first().click().catch(() => {});
    await page.locator('[role="dialog"]').first().waitFor({ timeout: 4000 }).catch(() => {});
  } else if (act === 'clipboard') {
    await firstRow.locator('button:has(svg.lucide-clipboard-check-icon)').first().click().catch(() => {});
    await page.locator('[role="dialog"]').first().waitFor({ timeout: 4000 }).catch(() => {});
  } else if (act === 'bot') {
    await page.locator('button.bg-blue-600.rounded-full').last().click().catch(() => {});
    await page.waitForTimeout(700);
    await page.locator('button[title="¿Qué puedo hacer?"]').first().click().catch(() => {});
    await page.getByText(/Foto de lista de asistencia/i).first().waitFor({ timeout: 4000 }).catch(() => {});
    await page.getByText(/Foto de lista de asistencia/i).first().scrollIntoViewIfNeeded().catch(() => {});
    // el cue se pinta sobre la capacidad de foto (más abajo, en cueText del step no aplica aquí)
    return async () => { await unstick(page); }; // el siguiente goto resetea el widget
  }
  await page.waitForTimeout(700);
  return async () => { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(500); await unstick(page); };
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
    permissions: ['clipboard-read', 'clipboard-write'],
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
    await page.goto(`${cfg.baseUrl}/app/communities`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await sleep(page, 800);

    for (const step of STEPS) {
      await nar.clearCue().catch(() => {});
      if (step.url) {
        await page.goto(`${cfg.baseUrl}${step.url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        if (step.wait) await page.getByText(step.wait).first().waitFor({ timeout: 8000 }).catch(() => {});
        await sleep(page, step.settle || 900);
      }
      if (step.scrollToText) {
        await page.getByText(step.scrollToText).first().scrollIntoViewIfNeeded().catch(() => {});
        await sleep(page, 800);
      }
      if (step.group) {
        await ensureExpanded(page, step.group);
        if (step.item) await cueLoc(nar, page.getByRole('link', { name: step.item, exact: true }).first());
      }
      if (step.tab) {
        await page.getByRole('tab', { name: step.tab }).first().click().catch(() => {});
        await sleep(page, 1000);
      }
      let closeAct = null;
      if (step.act) closeAct = await openAct(page, step.act);
      // Para el bot, el cue apunta a la capacidad de "Foto de lista de asistencia".
      if (step.act === 'bot') await cueLoc(nar, page.getByText(/Foto de lista de asistencia/i).first());
      if (step.cueRole) await cueLoc(nar, page.getByRole(step.cueRole.role, { name: step.cueRole.name }).first());
      if (step.cueSel) await cueLoc(nar, page.locator(step.cueSel).first());
      if (step.cueText && !step.group) await cueLoc(nar, page.getByText(step.cueText).first());
      await nar.say(clips[step.clip]);
      // Clic tras narrar (revela contenido: p.ej. el formulario de registro, o el toast del enlace).
      if (step.clickAfter) {
        const loc = step.clickAfter.role
          ? page.getByRole(step.clickAfter.role, { name: step.clickAfter.name }).first()
          : page.locator(step.clickAfter.sel).first();
        await loc.evaluate((el) => el.click()).catch(() => loc.click().catch(() => {}));
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        if (step.clickAfter.wait) await page.getByText(step.clickAfter.wait).first().waitFor({ timeout: 6000 }).catch(() => {});
        await sleep(page, step.clickAfter.holdMs || 1200);
      }
      if (step.holdMs) await sleep(page, step.holdMs);
      if (closeAct) await closeAct();
    }
    await sleep(page, 800);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-communities.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  const endcardPng = path.join(OUTPUT_DIR, 'endcard-communities.png');
  await renderEndCard(browser, {
    title: 'Mantén viva<br>la comunidad',
    subtitle: 'Cada tema del retiro tiene su propio video tutorial.',
    bgPath: path.join(OUTPUT_DIR, 'thumb-communities-bg.png'),
    out: endcardPng,
  }).catch((e) => console.warn('⚠️ endcard render:', e.message));
  await browser.close();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'communities-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  if (existsSync(endcardPng)) {
    await appendEndCard(cfg, { video: out, card: endcardPng, out, seconds: 14 }).catch((e) => console.warn('⚠️ appendEndCard:', e.message));
    log('🎬 tarjeta final agregada (14s)');
  }

  const LEAD_KEEP_MS = 700;
  const scaled = nar.timeline.map((t) => t.offsetMs * syncScale + SYNC_OFFSET_MS);
  const leadTrimMs = scaled.length ? Math.max(0, Math.min(...scaled) - LEAD_KEEP_MS) : 0;
  const chapterTimeline = nar.timeline.map((t) => ({ ...t, offsetMs: Math.max(0, Math.round(t.offsetMs * syncScale + SYNC_OFFSET_MS - leadTrimMs)) }));
  const chapters = buildYoutubeChapters(chapterTimeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
