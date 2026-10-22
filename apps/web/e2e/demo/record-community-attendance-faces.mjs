// Video-demo narrado: asistencia de comunidad con foto de grupo, voz, sin señal y álbum público
// (spec community-attendance-faces).
//
// Recorre, en la comunidad "Buen despacho": la página de Miembros con el menú ⋮, el interruptor del
// reconocimiento en la configuración de la comunidad, la toma de asistencia (foto y retiro en cada
// tarjeta, filtros, barra fija, toque sin recarga, marcar sin señal), la revisión al subir la foto de
// la reunión (sugerencias de Gemini, quitar una, resolverla por voz, confirmar) y el álbum público.
//
//   cd apps/web && node e2e/demo/record-community-attendance-faces.mjs
//
// Pensado para el dev de un worktree (DEMO_BASE_URL, p.ej. http://localhost:5175) con:
//  - el reconocimiento encendido en la comunidad y miembros con fotos de perfil de prueba (las fotos
//    de miembros reales viven en S3 y en dev no cargan);
//  - la portada de la reunión ya analizable.
// PII: nombres, correos y teléfonos se enmascaran (maskNode); las FOTOS se conservan a propósito
// porque son el contenido del video, así que solo debe correrse donde las fotos visibles no sean de
// miembros reales. La respuesta de Gemini se graba una vez en output/ y se reproduce en las tomas
// siguientes (no gasta cuota ni depende de que Google esté disponible).
// Muta la base del dev (asistencia y etiquetas de la reunión): la deja en limpio al empezar.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
  maskNode, fakeFor, alignChapterTimeline, hstr, FAKE_LASTS,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Comunidades');
const COMM = process.env.COMMUNITY_ID || 'f1060047-5305-4f75-89c4-a649e449975e'; // "Buen despacho"
const MEETING = process.env.MEETING_ID || 'e83230bd-d3f4-4b81-acf7-58e30df8f1b8'; // "Del Valle"
const GROUP_PHOTO = process.env.GROUP_PHOTO; // ruta a la foto de grupo que se sube en el video
const FACE_FIXTURE = path.join(OUTPUT_DIR, 'face-match-fixture.json');

if (!GROUP_PHOTO || !existsSync(GROUP_PHOTO)) {
  console.error('GROUP_PHOTO=<ruta a la foto de grupo> es obligatorio');
  process.exit(1);
}

// ── Guion (tuteo, frases < 25 palabras) ──────────────────────────────────────
const LINES = [
  { id: 'intro', text: 'Estas son las novedades de Comunidades: asistencia con la foto de la reunión, por voz, sin señal, y un álbum para conocernos.' },
  { id: 'membersNav', text: 'Todo vive en el menú lateral, en Comunidad, Comunidades: abres tu comunidad y entras a Miembros.' },
  { id: 'membersMenu', text: 'La lista quedó más limpia: arriba, Crear miembro, y lo demás en este menú de tres puntos.' },
  { id: 'rowMenu', text: 'En cada fila queda Mensajes. Lo demás vive en su menú, también excluir a alguien del reconocimiento facial.' },
  { id: 'toggle', text: 'El reconocimiento se enciende por comunidad, y solo el dueño puede hacerlo. Las caras se analizan con Google Gemini.' },
  { id: 'attendanceNav', text: 'Para tomar asistencia, entra a Reuniones y abre la reunión.' },
  { id: 'cards', text: 'Cada tarjeta muestra la foto del miembro y el retiro del que viene, para ubicar a la gente.' },
  { id: 'filters', text: 'Filtras por asistencia, retiro, frecuencia o foto. La app recuerda tus filtros para la próxima reunión.' },
  { id: 'sticky', text: 'Al bajar la lista, la búsqueda y los filtros se quedan arriba.' },
  { id: 'tap', text: 'Tocas una tarjeta y queda presente al instante, sin recargar la lista ni volver a bajar las fotos.' },
  { id: 'offline', text: 'Si se va la señal, sigues marcando: la tarjeta queda pendiente en el celular.' },
  { id: 'online', text: 'Cuando vuelve la señal, se guarda sola y el aviso desaparece.' },
  { id: 'upload', text: 'Ahora lo nuevo: subes la foto de grupo de la reunión.' },
  { id: 'review', text: 'Gemini compara cada cara con las fotos de perfil y sugiere a quién corresponde.' },
  { id: 'reviewCheck', text: 'Revisas cada sugerencia: la cara de la foto junto a la foto de perfil. Nada se guarda sin confirmar.' },
  { id: 'removeOne', text: 'Si una no te convence, la quitas, y pasa a las caras sin identificar.' },
  { id: 'voice', text: 'Ahí tocas Decir nombre y dices quién es.' },
  { id: 'candidates', text: 'La app propone las coincidencias con su foto, y tocas la correcta.' },
  { id: 'confirm', text: 'Confirmas y quedan presentes. A quien no tenía foto de perfil se le pone la de esta foto.' },
  { id: 'albumNav', text: 'Con la foto revisada, desde Reuniones publicas el álbum y copias el enlace para el grupo.' },
  { id: 'album', text: 'El enlace abre un álbum público: Conozcamos nuestros nombres.' },
  { id: 'albumFaces', text: 'Tocas un rostro para ver el nombre, muestras los puntos, o buscas a alguien.' },
  { id: 'albumPrivacy', text: 'Solo salen los nombres confirmados, nunca correos ni teléfonos, y el álbum no aparece en los buscadores.' },
  { id: 'outro', text: 'Así, tomar asistencia lleva segundos, y cada reunión nos ayuda a conocernos por nuestro nombre.' },
];

const CHAPTER_LABELS = {
  intro: 'Novedades',
  membersNav: 'Miembros',
  membersMenu: 'Menú ⋮',
  rowMenu: 'Acciones por fila',
  toggle: 'Encender el reconocimiento',
  attendanceNav: 'Tomar asistencia',
  cards: 'Foto y retiro',
  filters: 'Filtros',
  sticky: 'Barra fija',
  tap: 'Marcar presente',
  offline: 'Sin señal',
  online: 'Vuelve la señal',
  upload: 'Foto de la reunión',
  review: 'Sugerencias de Gemini',
  reviewCheck: 'Revisar',
  removeOne: 'Quitar una sugerencia',
  voice: 'Identificar por voz',
  candidates: 'Elegir candidato',
  confirm: 'Confirmar',
  albumNav: 'Publicar el álbum',
  album: 'Álbum público',
  albumFaces: 'Rostros y búsqueda',
  albumPrivacy: 'Privacidad',
  outro: 'Cierre',
};

const YT_TITLE = 'Comunidades en Emaús: asistencia con foto de grupo, voz y álbum';
const YT_DESCRIPTION =
  'Las novedades de Comunidades en Emaús: la lista de miembros con menú ⋮; el reconocimiento facial que el dueño ' +
  'enciende por comunidad; la toma de asistencia con foto y retiro de origen en cada tarjeta, filtros que se ' +
  'recuerdan y marcar sin señal; la foto de grupo de la reunión que sugiere quién es cada persona, con revisión y ' +
  'voz para las caras que faltan; y el álbum público «Conozcamos nuestros nombres».';
const YT_TAGS = ['Emaús', 'comunidad', 'asistencia', 'reconocimiento facial', 'álbum', 'retiros'];

// ── Enmascarado: nombres, correos y teléfonos; las fotos se conservan ────────
// maskNode reparte nombres por hash: en una comunidad de 111 se repiten («Óscar Morales» dos veces en
// la revisión parecía un error) y no respetan el género. Aquí cada persona recibe un nombre único,
// del género de su ficha; y las 10 caras de la foto de prueba (dataset público), uno que cuadra con
// la cara, por id de miembro.
const PHOTO_KEY = /^(photo|avatar|picture)(Url)?$/i;
const FEMALE = ['María', 'Lucía', 'Ana', 'Sofía', 'Laura', 'Elena', 'Paula', 'Rosa', 'Marta', 'Clara',
  'Silvia', 'Nadia', 'Gloria', 'Irene', 'Beatriz', 'Carmen', 'Teresa', 'Julia', 'Alicia', 'Patricia'];
const MALE = ['José', 'Miguel', 'Carlos', 'Diego', 'Pedro', 'Jorge', 'Andrés', 'Luis', 'Pablo', 'Raúl',
  'Hugo', 'Iván', 'Tomás', 'Óscar', 'Víctor', 'Javier', 'Manuel', 'Ricardo', 'Fernando', 'Arturo'];
const PHOTO_NAMES = {
  '757ebffa-7a33-462b-82d7-5f1e38d1b6b2': ['Lucía', 'Torres'],
  '5f6e7111-30c6-4d65-9101-609019ea5e17': ['Jorge', 'Salas'],
  '61a62201-4d51-4739-b9c3-6ad4ea5c92cc': ['Sofía', 'Vega'],
  'dd0db5bc-053c-4cac-8d18-8c59ce8e9577': ['Diego', 'Ríos'],
  '84608ff6-d725-48c2-9c3c-4b3b8ed1e6af': ['Paula', 'Mendoza'],
  '24d62001-ab93-42f8-bc02-9bd4c621dbba': ['Nadia', 'Castro'],
  'c618a584-7d99-4d13-93a3-64e4b6e14295': ['Luis', 'Hernández'],
  '19c63c73-1545-4ec2-af98-41671c76898d': ['Marta', 'Duarte'],
  '8b72b2c7-22d4-43a9-82fd-5132eb72e543': ['Tomás', 'Díaz'],
  '5d102de9-2976-4004-b28b-61f0a5a5d926': ['Irene', 'Campos'],
};
const fakeByReal = new Map(); // nombre real completo → [nombre, apellido] falsos
const usedFakes = new Set(Object.values(PHOTO_NAMES).map(([f, l]) => `${f} ${l}`));
const albumNames = new Map(); // «nombre + primer apellido» real → nombre falso (el álbum usa ese formato)

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const slugEmail = (f, l) => `${f}.${l}`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() + '@correo.com';

function fakeName(realKey, gender, memberId) {
  if (memberId && PHOTO_NAMES[memberId]) {
    fakeByReal.set(realKey, PHOTO_NAMES[memberId]);
    return PHOTO_NAMES[memberId];
  }
  if (fakeByReal.has(realKey)) return fakeByReal.get(realKey);
  const h = hstr(realKey);
  const pool = gender === 'M' ? MALE : gender === 'F' ? FEMALE : h % 2 ? MALE : FEMALE;
  const combos = pool.length * FAKE_LASTS.length;
  for (let i = 0; i < combos; i++) {
    const c = (h + i) % combos;
    const pick = [pool[c % pool.length], FAKE_LASTS[Math.floor(c / pool.length)]];
    if (!usedFakes.has(pick.join(' '))) {
      usedFakes.add(pick.join(' '));
      fakeByReal.set(realKey, pick);
      return pick;
    }
  }
  return [pool[0], FAKE_LASTS[0]];
}

// Personas: miembros (con `participant` anidado) y participantes sueltos (firstName + lastName).
function collectPeople(n, out) {
  if (Array.isArray(n)) return n.forEach((x) => collectPeople(x, out));
  if (!n || typeof n !== 'object') return;
  const p = n.participant && typeof n.participant === 'object' ? n.participant : null;
  if (p || ('firstName' in n && 'lastName' in n && ('email' in n || 'cellPhone' in n))) {
    const first = str(n.firstName) || str(p?.firstName);
    const last = str(n.lastName) || str(p?.lastName);
    if (first || last) {
      out.push({ node: n, p, first, last, gender: p?.gender ?? n.gender, memberId: p ? n.id : n.memberId });
    }
  }
  for (const k of Object.keys(n)) if (k !== 'participant' && n[k] && typeof n[k] === 'object') collectPeople(n[k], out);
}

function maskKeepingPhotos(data) {
  const kept = [];
  (function collect(n) {
    if (Array.isArray(n)) return n.forEach(collect);
    if (!n || typeof n !== 'object') return;
    for (const k of Object.keys(n)) {
      if (PHOTO_KEY.test(k) && typeof n[k] === 'string') kept.push([n, k, n[k]]);
      else if (n[k] && typeof n[k] === 'object') collect(n[k]);
    }
  })(data);
  const people = [];
  collectPeople(data, people);
  maskNode(data);
  for (const { node, p, first, last, gender, memberId } of people) {
    const [f, l] = fakeName(`${first} ${last}`, gender, memberId);
    albumNames.set(`${first} ${last.split(/\s+/)[0] || ''}`.trim(), `${f} ${l}`);
    for (const target of [node, p]) {
      if (!target) continue;
      if (str(target.firstName) || target === p) target.firstName = f;
      if (str(target.lastName) || target === p) target.lastName = l;
      if (str(target.email)) target.email = slugEmail(f, l);
    }
  }
  for (const [obj, key, value] of kept) obj[key] = value;
}

async function apiRoute(route) {
  const req = route.request();
  const url = req.url();
  // Gemini: primera toma real (y se guarda), las siguientes se reproducen.
  if (req.method() === 'POST' && /\/face-match$/.test(url)) {
    if (existsSync(FACE_FIXTURE)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(FACE_FIXTURE, 'utf8') });
    }
    const resp = await route.fetch({ timeout: 90000 });
    const body = await resp.text();
    try { if (!JSON.parse(body).degraded) writeFileSync(FACE_FIXTURE, body); } catch {}
    return route.fulfill({ response: resp, body });
  }
  if (req.method() !== 'GET') return route.continue();
  let resp;
  try { resp = await route.fetch(); } catch { return route.continue().catch(() => {}); }
  const ct = resp.headers()['content-type'] || '';
  if (/text\/csv|ms-excel|spreadsheetml/i.test(ct)) return route.fulfill({ status: 204, body: '' }).catch(() => {});
  if (!ct.includes('json')) return route.fulfill({ response: resp }).catch(() => {});
  try {
    const d = await resp.json();
    if (/\/public\/album\//.test(url) && Array.isArray(d.tags)) {
      // Ruta propia: los nombres del álbum van en una clave plana `name` que maskNode no toca.
      d.tags = d.tags.map((t) => {
        const fake = albumNames.get(t.name) || `${fakeFor(t.name).first} ${fakeFor(t.name).last}`;
        return { ...t, name: fake };
      });
    } else {
      maskKeepingPhotos(d);
    }
    return route.fulfill({ response: resp, body: JSON.stringify(d) });
  } catch { return route.fulfill({ response: resp }).catch(() => {}); }
}

// Las portadas de reuniones de prod (S3 sin firmar en dev) salen rotas: un gris neutro.
const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#e5e7eb"/></svg>';

// Reconocimiento de voz simulado: "escucha" lo que la escena deja en window.__fakeSpeech.
const FAKE_SPEECH_INIT = `
(() => {
  class FakeRecognition extends EventTarget {
    constructor() { super(); this.lang = ''; this.continuous = false; this.interimResults = false; this.onresult = null; this.onerror = null; this.onend = null; }
    start() {
      const text = window.__fakeSpeech || '';
      setTimeout(() => {
        const result = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true });
        this.onresult && this.onresult({ resultIndex: 0, results: [result] });
      }, 900);
    }
    stop() { setTimeout(() => this.onend && this.onend(), 50); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
})();
`;

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

async function cueLoc(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch {}
}
async function expandSection(page, name) {
  const header = page.locator('[aria-expanded]', { hasText: new RegExp(`^\\s*${name}\\s*$`, 'i') }).first();
  if ((await header.getAttribute('aria-expanded').catch(() => null)) === 'false') {
    await header.click().catch(() => {});
    await sleep(page, 400);
  }
}
async function unstick(page) {
  await page.evaluate(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }).catch(() => {});
}
async function gotoApp(page, url, wait) {
  await page.goto(`${cfg.baseUrl}${url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  if (wait) await page.getByText(wait).first().waitFor({ timeout: 10000 }).catch(() => {});
  await sleep(page, 700);
}

async function resetMeeting(page) {
  // Deja la reunión sin presentes: la toma muestra el antes y el después.
  await page.evaluate(async ({ comm, meeting }) => {
    const api = await import('/src/services/api.ts');
    const rows = await api.getCommunityAttendance(comm, meeting);
    for (const r of rows.filter((x) => x.attended)) {
      await api.recordSingleCommunityAttendance(comm, meeting, r.memberId, false);
    }
  }, { comm: COMM, meeting: MEETING });
}

async function main() {
  ensureOutputDir();
  log('🎙️  TTS…');
  const clips = {};
  for (const l of LINES) clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, `caf-${l.id}`, l.text)) };

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
      await ap.waitForTimeout(1500);
      await resetMeeting(ap);
      state = await auth.storageState(); await auth.close(); break;
    } catch (e) { await auth.close(); if (attempt === 3) throw e; await new Promise((r) => setTimeout(r, 2500)); }
  }

  const ctx = await browser.newContext({
    storageState: state, viewport: { width: W, height: H }, locale: 'es-MX',
    permissions: ['clipboard-read', 'clipboard-write'],
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  await ctx.addInitScript(FAKE_SPEECH_INIT);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  await page.route('**/api/**', apiRoute);
  await page.route(/emaus-media\.s3\.[^/]+\.amazonaws\.com\/community-meetings\//, async (r) => {
    const resp = await r.fetch().catch(() => null);
    if (resp && resp.ok()) return r.fulfill({ response: resp });
    return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: PLACEHOLDER_SVG });
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // ── Miembros ────────────────────────────────────────────────────────────
    await gotoApp(page, `/app/communities/${COMM}/members`, /Crear miembro/);
    await nar.clearCue();
    await nar.say(clips.intro);
    await expandSection(page, 'Comunidad');
    await cueLoc(nar, page.locator('[id^="section-"]').getByRole('link', { name: /^\s*Comunidades\s*$/ }).first());
    await nar.say(clips.membersNav);

    await nar.clearCue();
    const moreMenus = page.locator('button[aria-label="Más acciones"]:visible');
    const headerMenu = moreMenus.nth(0);
    await cueLoc(nar, headerMenu);
    await headerMenu.click().catch(() => {});
    await sleep(page, 500);
    await nar.say(clips.membersMenu);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 400);

    await nar.clearCue();
    const rowMenu = moreMenus.nth(1);
    await cueLoc(nar, rowMenu);
    await rowMenu.click().catch(() => {});
    await sleep(page, 500);
    await nar.say(clips.rowMenu);
    await page.keyboard.press('Escape').catch(() => {});
    await unstick(page);

    // ── Configuración: interruptor ──────────────────────────────────────────
    await nar.clearCue();
    await gotoApp(page, '/app/communities', /Agregar Comunidad/);
    const cardTitle = page.locator('a', { hasText: 'Buen despacho' }).first().locator('xpath=..');
    await cardTitle.locator('button').first().click().catch(() => {});
    await sleep(page, 500);
    await page.getByRole('menuitem', { name: /Editar/ }).first().click().catch(() => {});
    const section = page.getByText('Reconocimiento facial en la asistencia').first();
    await section.waitFor({ timeout: 6000 }).catch(() => {});
    await section.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 500);
    await cueLoc(nar, page.locator('#face-recognition-switch'));
    await nar.say(clips.toggle);
    await page.getByRole('button', { name: 'Cancelar' }).first().click().catch(() => {});
    await unstick(page);

    // ── Toma de asistencia ──────────────────────────────────────────────────
    await nar.clearCue();
    await gotoApp(page, `/app/communities/${COMM}/meetings?filter=past`, /Del Valle/);
    await cueLoc(nar, page.locator(`a[href$="/attendance/${MEETING}"]`).first());
    await nar.say(clips.attendanceNav);
    await page.locator(`a[href$="/attendance/${MEETING}"]`).first().click().catch(() => {});
    await page.locator('.member-card').first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(page, 1200);

    await nar.clearCue();
    const withPhoto = page.locator('.member-card:has(img)').first();
    await cueLoc(nar, withPhoto);
    await nar.say(clips.cards);

    await nar.clearCue();
    await cueLoc(nar, page.getByRole('combobox', { name: /Filtrar por retiro/ }).first());
    await nar.say(clips.filters);

    await nar.clearCue();
    await page.evaluate(() => document.querySelector('main')?.scrollBy({ top: 900, behavior: 'smooth' }));
    await sleep(page, 900);
    await cueLoc(nar, page.getByPlaceholder(/Buscar/).first());
    await nar.say(clips.sticky);

    await nar.clearCue();
    const unmarked = page.locator('.member-card:not(.bg-green-50)');
    const tapCard = unmarked.nth(0);
    await cueLoc(nar, tapCard);
    await tapCard.click().catch(() => {});
    await nar.say(clips.tap);

    await nar.clearCue();
    await ctx.setOffline(true);
    await sleep(page, 800);
    const offCard = page.locator('.member-card:not(.bg-green-50)').nth(1);
    await cueLoc(nar, offCard);
    await offCard.click().catch(() => {});
    await page.getByTestId('pending-badge').first().waitFor({ timeout: 6000 }).catch(() => {});
    await nar.say(clips.offline);

    await ctx.setOffline(false);
    await nar.say(clips.online);
    await page.getByTestId('pending-badge').first().waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});

    // ── Foto de la reunión y revisión ───────────────────────────────────────
    await nar.clearCue();
    await page.evaluate(() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(page, 700);
    const uploadBtn = page.getByRole('button', { name: /Subir foto de la reuni/ }).first();
    await cueLoc(nar, uploadBtn);
    await nar.say(clips.upload);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null),
      uploadBtn.click().catch(() => {}),
    ]);
    if (chooser) await chooser.setFiles(GROUP_PHOTO);
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-testid="suggestion"]').first().waitFor({ timeout: 90000 }).catch(() => {});
    await sleep(page, 800);

    await nar.clearCue();
    await cueLoc(nar, dialog.locator('[data-testid="suggestion"]').first());
    await nar.say(clips.review);
    await nar.say(clips.reviewCheck);

    // Quitar una sugerencia (la 3.ª) y resolverla por voz.
    await nar.clearCue();
    const target = dialog.locator('[data-testid="suggestion"]').nth(2);
    // El nombre sale del aria-label del botón Quitar (el avatar también lleva .font-medium).
    const spokenName = ((await target.getByRole('button', { name: /^Quitar a/ }).getAttribute('aria-label').catch(() => '')) || '')
      .replace(/^Quitar a\s+/, '').trim();
    log('🗣️ ', spokenName || '(vacío)');
    const cropSrc = await target.locator('img').first().getAttribute('src').catch(() => null);
    const removeBtn = target.getByRole('button', { name: /^Quitar a/ });
    await cueLoc(nar, removeBtn);
    await nar.say(clips.removeOne);
    await removeBtn.click().catch(() => {});
    await sleep(page, 700);

    await nar.clearCue();
    await page.evaluate((t) => { window.__fakeSpeech = t; }, spokenName);
    // La cara quitada pasa a «sin identificar»: se ubica por su recorte (data URL, no cabe en un selector).
    const unidentified = dialog.locator('[data-testid="unidentified"]');
    const idx = await unidentified
      .evaluateAll((els, src) => els.findIndex((e) => e.querySelector('img')?.getAttribute('src') === src), cropSrc)
      .catch(() => -1);
    const faceCard = idx >= 0 ? unidentified.nth(idx) : unidentified.first();
    const mic = faceCard.getByRole('button', { name: /Decir nombre/ }).first();
    await cueLoc(nar, mic);
    await nar.say(clips.voice);
    await mic.click().catch(() => {});
    const candidates = faceCard.locator('[data-testid="voice-candidates"]').first();
    await candidates.waitFor({ timeout: 6000 }).catch(() => {});
    await cueLoc(nar, candidates.getByRole('button').first());
    await nar.say(clips.candidates);
    await candidates.getByRole('button').first().click().catch(() => {});
    await sleep(page, 700);

    await nar.clearCue();
    const confirmBtn = dialog.getByTestId('confirm');
    await cueLoc(nar, confirmBtn);
    await nar.say(clips.confirm);
    await confirmBtn.click().catch(() => {});
    await dialog.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await sleep(page, 1200);

    // ── Álbum ───────────────────────────────────────────────────────────────
    await nar.clearCue();
    await gotoApp(page, `/app/communities/${COMM}/meetings?filter=past`, /Del Valle/);
    const publish = page.getByRole('button', { name: /Publicar álbum/ }).first();
    const copy = page.getByRole('button', { name: /Copiar enlace del álbum/ }).first();
    if (!(await copy.isVisible().catch(() => false))) await publish.click().catch(() => {});
    await cueLoc(nar, copy);
    await nar.say(clips.albumNav);
    await copy.click().catch(() => {});
    await sleep(page, 600);
    const link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');

    await nar.clearCue();
    await page.goto(link || `${cfg.baseUrl}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.getByText('Conozcamos nuestros nombres').first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(page, 900);
    await nar.say(clips.album);

    const dots = page.getByRole('button', { name: /Mostrar puntos/ }).first();
    await dots.click().catch(() => {});
    const face = page.getByRole('button', { name: /^Identificar / }).nth(2);
    await cueLoc(nar, face);
    await face.click().catch(() => {});
    await nar.say(clips.albumFaces);
    await nar.clearCue();
    const search = page.getByPlaceholder(/Buscar por nombre/).first();
    const someName = ((await face.getAttribute('aria-label').catch(() => '')) || '').replace(/^Identificar\s+/, '');
    await search.fill(someName.split(' ')[0] || '').catch(() => {});
    await search.press('Enter').catch(() => {});
    await sleep(page, 600);
    await nar.say(clips.albumPrivacy);
    await search.fill('').catch(() => {});
    await page.getByRole('button', { name: /Foto completa/ }).first().click().catch(() => {});
    await sleep(page, 500);
    await nar.say(clips.outro);
    await sleep(page, 800);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-community-attendance-faces.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'community-attendance-faces.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncScale });
  const chapters = buildYoutubeChapters(alignChapterTimeline(nar.timeline, { syncScale }), { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
