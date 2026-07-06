// Bloques reutilizables para los videos-demo narrados de emaús.
//
// - loadEnv():        parsea apps/web/e2e/demo/.env (sin dependencia dotenv).
// - genTts():         genera un .wav por línea (Deepgram Aura-2 → fallback macOS `say`),
//                     nivelado con loudnorm, y devuelve su duración.
// - OVERLAY_INIT:     init-script que inyecta la barra de subtítulos + marca de agua.
// - Narrator:         registra caption + offset de cada línea para sincronizar audio↔video.
// - muxVideo():       coloca cada clip de audio en su offset y muxea con el video → MP4.
//
// Todo apunta al ffmpeg/ffprobe de Homebrew (H.264/AAC); el de Playwright NO sirve.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEMO_DIR = __dirname;
export const OUTPUT_DIR = path.join(__dirname, 'output');

// ── .env loader (no pisa lo que ya venga del entorno) ────────────────────────
export function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (existsSync(envPath)) {
    for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
  return {
    deepgramKey: process.env.DEEPGRAM_API_KEY || '',
    deepgramVoice: process.env.DEEPGRAM_VOICE || 'aura-2-celeste-es',
    ffmpeg: process.env.FFMPEG || 'ffmpeg',
    ffprobe: process.env.FFPROBE || 'ffprobe',
    baseUrl: process.env.DEMO_BASE_URL || 'http://localhost:5173',
    email: process.env.DEMO_EMAIL || 'leonardo.bolanos@gmail.com',
    password: process.env.DEMO_PASSWORD || '123456',
    // YouTube (subida de los videos-demo). Ver youtube-auth.mjs / upload-to-youtube.mjs.
    ytClientId: process.env.YT_CLIENT_ID || '',
    ytClientSecret: process.env.YT_CLIENT_SECRET || '',
    ytPrivacy: process.env.YT_PRIVACY || 'unlisted', // public | unlisted | private
    ytCategoryId: process.env.YT_CATEGORY_ID || '27', // 27 = Educación
    // Gemini "nano banana" (generación de imágenes). Key en https://aistudio.google.com/apikey
    geminiKey: process.env.GEMINI_API_KEY || '',
    geminiImageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  };
}

export function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ── duración de un audio (segundos) ──────────────────────────────────────────
export async function audioDuration(ffprobe, file) {
  const { stdout } = await execFileP(ffprobe, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    file,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

// ── TTS: Deepgram Aura-2 (voz natural) con fallback a macOS `say` ─────────────
// Genera <id>.wav en OUTPUT_DIR, nivelado a -16 LUFS, y devuelve su duración.
export async function genTts(cfg, id, text) {
  ensureOutputDir();
  const raw = path.join(OUTPUT_DIR, `tts-${id}.raw.wav`);
  const out = path.join(OUTPUT_DIR, `tts-${id}.wav`);

  let generated = false;
  if (cfg.deepgramKey) {
    try {
      const url =
        `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(cfg.deepgramVoice)}` +
        `&encoding=linear16&container=wav&sample_rate=24000`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${cfg.deepgramKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Deepgram ${res.status}: ${await res.text()}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(raw, buf);
      generated = true;
    } catch (err) {
      console.warn(`  ⚠︎ Deepgram falló (${err.message}); uso macOS say.`);
    }
  }

  if (!generated) {
    // Fallback macOS: say → aiff → wav. Voz Paulina (es-MX).
    const aiff = path.join(OUTPUT_DIR, `tts-${id}.aiff`);
    await execFileP('say', ['-v', 'Paulina', '-o', aiff, text]);
    await execFileP(cfg.ffmpeg, ['-y', '-i', aiff, '-ar', '24000', raw]);
  }

  // Nivelar (Deepgram sale bajo) y normalizar a mono 24k.
  await execFileP(cfg.ffmpeg, [
    '-y', '-i', raw,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar', '24000', '-ac', '1',
    out,
  ]);
  return { file: out, duration: await audioDuration(cfg.ffprobe, out) };
}

// ── Overlay: init-script (sobrevive navegaciones) ────────────────────────────
// Inyecta una barra de subtítulos inferior + marca de agua. Expone:
//   window.__caption(text)  → fija el subtítulo (crea el nodo si hace falta)
//   window.__cue(x, y)      → pinta un anillo/click en (x,y) (feedback visual)
export const OVERLAY_INIT = `
(() => {
  const ensure = () => {
    if (document.getElementById('__demo_cap')) return;
    const wrap = document.createElement('div');
    wrap.id = '__demo_overlay';
    wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,system-ui,-apple-system,sans-serif;';
    const brand = document.createElement('div');
    brand.textContent = '✝ Emaús · Tareas Pre-Retiro';
    brand.style.cssText = 'position:absolute;top:14px;left:16px;background:rgba(124,58,237,.92);color:#fff;font-size:13px;font-weight:600;letter-spacing:.3px;padding:6px 12px;border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,.25);';
    const cap = document.createElement('div');
    cap.id = '__demo_cap';
    cap.style.cssText = 'position:absolute;left:50%;bottom:34px;transform:translateX(-50%);max-width:82%;background:rgba(17,17,27,.86);color:#fff;font-size:23px;line-height:1.34;font-weight:500;padding:14px 26px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.35);text-align:center;opacity:0;transition:opacity .28s ease;backdrop-filter:blur(3px);';
    wrap.appendChild(brand);
    wrap.appendChild(cap);
    (document.body || document.documentElement).appendChild(wrap);
  };
  window.__caption = (text) => {
    ensure();
    const cap = document.getElementById('__demo_cap');
    if (!text) { cap.style.opacity = '0'; return; }
    cap.textContent = text;
    cap.style.opacity = '1';
  };
  window.__cue = (x, y) => {
    ensure();
    const ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;left:' + (x-26) + 'px;top:' + (y-26) + 'px;width:52px;height:52px;border:4px solid rgba(124,58,237,.95);border-radius:9999px;box-shadow:0 0 0 4px rgba(124,58,237,.25);animation:__demoPing .7s ease-out forwards;';
    document.getElementById('__demo_overlay').appendChild(ring);
    setTimeout(() => ring.remove(), 720);
  };
  if (!document.getElementById('__demo_kf')) {
    const st = document.createElement('style');
    st.id = '__demo_kf';
    st.textContent = '@keyframes __demoPing{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.25);opacity:0}}';
    (document.head || document.documentElement).appendChild(st);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensure);
  } else { ensure(); }
})();
`;

// ── Narrator: sincroniza caption + audio por offset desde el inicio del video ─
export class Narrator {
  constructor(page, cfg) {
    this.page = page;
    this.cfg = cfg;
    this.timeline = []; // { id, text, offsetMs, duration, file }
    this.t0 = null;
  }
  start() {
    this.t0 = Date.now();
  }
  get elapsedMs() {
    return this.t0 == null ? 0 : Date.now() - this.t0;
  }
  // Fija el subtítulo, registra el offset y ESPERA la duración del audio (holdUntil),
  // para que el video "aguante" mientras se narra. Los clips se generan antes (prebuild).
  async say(clip, { pad = 350 } = {}) {
    await this.page.evaluate((t) => window.__caption(t), clip.text);
    this.timeline.push({
      id: clip.id,
      text: clip.text,
      offsetMs: this.elapsedMs,
      duration: clip.duration,
      file: clip.file,
    });
    await this.page.waitForTimeout(Math.round(clip.duration * 1000) + pad);
  }
  async clear() {
    await this.page.evaluate(() => window.__caption(''));
  }
  async cueAt(x, y) {
    await this.page.evaluate(({ x, y }) => window.__cue(x, y), { x, y });
  }
}

// ── Mux final: video + N clips (cada uno a su offset) → MP4 (H.264 + AAC) ─────
// syncScale: el .webm de Playwright corre ~2-3% más lento que el reloj (Date.now),
// así que los offsets medidos por reloj adelantan el audio en la 2ª mitad. Escalar
// cada offset por webmDuration/wallClock realinea audio↔video (ver computeSyncScale).
export async function muxVideo(cfg, { video, timeline, out, syncOffsetMs = 0, syncScale = 1 }) {
  const clips = timeline.filter((t) => t.file);
  const inputs = ['-y', '-i', video];
  for (const c of clips) inputs.push('-i', c.file);

  // adelay por clip (ms) → amix normalize=0 → mux con el video.
  const parts = [];
  const labels = [];
  clips.forEach((c, i) => {
    const delay = Math.max(0, Math.round(c.offsetMs * syncScale + syncOffsetMs));
    parts.push(`[${i + 1}:a]adelay=${delay}:all=1[a${i}]`);
    labels.push(`[a${i}]`);
  });

  const args = [...inputs];
  if (clips.length) {
    const filter =
      parts.join(';') +
      `;${labels.join('')}amix=inputs=${clips.length}:normalize=0[aout]`;
    args.push(
      '-filter_complex', filter,
      '-map', '0:v', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      out,
    );
  } else {
    args.push('-map', '0:v', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out);
  }
  await execFileP(cfg.ffmpeg, args, { maxBuffer: 1024 * 1024 * 64 });
  return out;
}

// Escala de sincronía audio↔video = duración real del webm / tiempo de reloj.
// El .webm de Playwright suele durar ~2-3% más que el reloj; sin esto el audio se
// adelanta a los subtítulos/acciones en la 2ª mitad. Clamp defensivo [0.9, 1.1].
export function computeSyncScale(webmDurationSec, wallClockMs) {
  if (!webmDurationSec || !wallClockMs) return 1;
  const s = (webmDurationSec * 1000) / wallClockMs;
  return Math.min(1.1, Math.max(0.9, s));
}

// ── Metadata para YouTube ─────────────────────────────────────────────────────
// mm:ss a partir de milisegundos.
function fmtTimestamp(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Capítulos de YouTube a partir del timeline del Narrator.
// YouTube exige: primer capítulo en 0:00, ≥3 capítulos y ≥10s entre uno y otro.
// Tomamos entradas del timeline con separación ≥ minGapSec (greedy) y forzamos el
// primero a 0:00. Devolvemos [] si no llegan a 3 (mejor sin capítulos que inválidos).
export function buildYoutubeChapters(timeline, { minGapSec = 10, labels = {} } = {}) {
  const picked = [];
  let lastSec = -Infinity;
  timeline.forEach((t, i) => {
    const sec = t.offsetMs / 1000;
    if (i === 0 || sec - lastSec >= minGapSec) {
      picked.push(t);
      lastSec = sec;
    }
  });
  if (picked.length < 3) return [];
  return picked.map((t, i) => ({
    t: i === 0 ? '0:00' : fmtTimestamp(t.offsetMs),
    label: labels[t.id] || t.text,
  }));
}

// Ensambla la descripción final (cuerpo + capítulos) y escribe <base>.meta.json
// junto al mp4. El uploader (upload-to-youtube.mjs) lo lee tal cual.
export function writeVideoMeta(mp4Path, { title, description = '', tags = [], chapters = [] }) {
  let full = description.trim();
  if (chapters.length) {
    const lines = chapters.map((c) => `${c.t} ${c.label}`).join('\n');
    full += `\n\nContenido:\n${lines}`;
  }
  const meta = { title, description: full, tags, chapters };
  const metaPath = mp4Path.replace(/\.mp4$/i, '.meta.json');
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return metaPath;
}
