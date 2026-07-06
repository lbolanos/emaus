// Sube un video-demo a YouTube leyendo su .meta.json (título/descripción/tags/privacidad).
//
//   cd apps/web
//   node e2e/demo/upload-to-youtube.mjs output/tareas-pre-retiro-demo.mp4
//   node e2e/demo/upload-to-youtube.mjs output/tareas-pre-retiro-demo.mp4 --privacy public
//
// Busca <video>.meta.json junto al mp4 (lo genera record-*.mjs). Si no existe, usa
// el nombre del archivo como título. Requiere haber corrido youtube-auth.mjs una vez.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from './demo-lib.mjs';
import { getAccessToken, uploadVideo } from './youtube-lib.mjs';

const cfg = loadEnv();
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const privacyFlag = (() => {
  const i = args.indexOf('--privacy');
  return i !== -1 ? args[i + 1] : null;
})();

if (!file) {
  console.error('Uso: node e2e/demo/upload-to-youtube.mjs <video.mp4> [--privacy public|unlisted|private]');
  process.exit(1);
}
const mp4 = path.resolve(file);
if (!existsSync(mp4)) {
  console.error(`❌ No existe el video: ${mp4}`);
  process.exit(1);
}

// Metadata: <video>.meta.json si existe.
const metaPath = mp4.replace(/\.mp4$/i, '.meta.json');
let meta = { title: path.basename(mp4, '.mp4'), description: '', tags: [] };
if (existsSync(metaPath)) {
  meta = { ...meta, ...JSON.parse(readFileSync(metaPath, 'utf8')) };
  console.log(`📝 Metadata: ${path.basename(metaPath)}`);
} else {
  console.log('⚠︎ Sin .meta.json — uso el nombre del archivo como título.');
}

const privacy = privacyFlag || cfg.ytPrivacy;

async function main() {
  if (!cfg.ytClientId || !cfg.ytClientSecret) {
    console.error('❌ Falta YT_CLIENT_ID / YT_CLIENT_SECRET en .env (ver youtube-auth.mjs).');
    process.exit(1);
  }
  console.log('🔑 Obteniendo access_token…');
  const accessToken = await getAccessToken(cfg);

  console.log(`⬆️  Subiendo "${meta.title}" (${privacy})…`);
  const video = await uploadVideo(cfg, accessToken, {
    file: mp4,
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    privacy,
  });

  const url = `https://youtu.be/${video.id}`;
  console.log('\n✅ Listo:');
  console.log(`   ${url}`);
  console.log(`   Studio: https://studio.youtube.com/video/${video.id}/edit`);
  console.log(`\n   Pegá esta URL en apps/web/src/config/helpVideos.ts para el botón de ayuda.`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
