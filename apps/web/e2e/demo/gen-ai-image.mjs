// Genera imágenes con Gemini 2.5 Flash Image ("nano banana") vía API, con `fetch` puro.
//
// Texto → imagen:
//   node e2e/demo/gen-ai-image.mjs "prompt…" -o output/arte.png
// Imagen → imagen (editar/restyle una existente, mantiene composición):
//   node e2e/demo/gen-ai-image.mjs "conviértela en óleo…" --edit ~/Desktop/banner.png -o output/banner-ia.png
//
// Requiere GEMINI_API_KEY en apps/web/e2e/demo/.env (https://aistudio.google.com/apikey).
//
// Consejo: para banners/thumbnails con texto EXACTO, genera aquí solo el fondo/escena
// y sobrepone el texto nítido con CSS (ver _gen-final.mjs). Los modelos de imagen aún
// no rotulan texto de forma 100% confiable.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, OUTPUT_DIR, ensureOutputDir } from './demo-lib.mjs';

const cfg = loadEnv();
const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
const prompt = args.find((a) => !a.startsWith('--') && !a.startsWith('-o') && args[args.indexOf(a) - 1] !== '-o' && args[args.indexOf(a) - 1] !== '--edit');
const editImg = flag('--edit');
const outArg = flag('-o') || flag('--out');

if (!prompt) {
  console.error('Uso: node e2e/demo/gen-ai-image.mjs "<prompt>" [--edit <img>] [-o <salida.png>]');
  process.exit(1);
}
if (!cfg.geminiKey) {
  console.error('❌ Falta GEMINI_API_KEY en .env → https://aistudio.google.com/apikey');
  process.exit(1);
}

// Estilo del sitio Emaús, inyectado en todos los prompts para coherencia.
const STYLE = [
  'Style: elegant, reverent, modern-catholic aesthetic matching a retreat brand.',
  'Primary color deep violet #7c3aed (hsl 271 76% 53%), dawn gradient from indigo to warm amber/rose.',
  'Motif: the road to Emmaus — sunrise, gentle hills, a simple cross silhouette on the horizon, soft golden glow.',
  'Clean, uncluttered composition, painterly but tasteful. No text, no watermarks, no letters.',
].join(' ');

ensureOutputDir();
const out = path.resolve(outArg || path.join(OUTPUT_DIR, 'ai-image.png'));

async function main() {
  const parts = [{ text: `${prompt}\n\n${STYLE}` }];
  if (editImg) {
    const p = path.resolve(editImg);
    if (!existsSync(p)) throw new Error(`No existe la imagen a editar: ${p}`);
    const b64 = readFileSync(p).toString('base64');
    const mime = p.toLowerCase().endsWith('.jpg') || p.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
    console.log(`🖼️  Editando ${path.basename(p)}…`);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.geminiImageModel}:generateContent?key=${cfg.geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const outParts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = outParts.find((p) => p.inlineData?.data || p.inline_data?.data);
  if (!imgPart) {
    const txt = outParts.map((p) => p.text).filter(Boolean).join(' ');
    throw new Error(`La respuesta no trajo imagen. ${txt || JSON.stringify(data).slice(0, 300)}`);
  }
  const b64 = imgPart.inlineData?.data || imgPart.inline_data?.data;
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('✅', out);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
