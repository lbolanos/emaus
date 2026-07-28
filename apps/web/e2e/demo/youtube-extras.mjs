// Post-subida de YouTube (scope youtube.force-ssl): pone miniatura y/o agrega a una playlist.
//   node e2e/demo/youtube-extras.mjs <videoId> [--thumb <png>] [--playlist <playlistId>]
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from './demo-lib.mjs';
import { getAccessToken } from './youtube-lib.mjs';

const args = process.argv.slice(2);
const videoId = args.find((a) => !a.startsWith('--'));
const opt = (name) => { const i = args.indexOf(name); return i !== -1 ? args[i + 1] : null; };
const thumb = opt('--thumb');
const playlistId = opt('--playlist');

if (!videoId) { console.error('Uso: youtube-extras.mjs <videoId> [--thumb png] [--playlist id]'); process.exit(1); }

const cfg = loadEnv();

async function setThumbnail(token, file) {
  const p = path.resolve(file);
  if (!existsSync(p)) { console.error(`❌ Miniatura no existe: ${p}`); return; }
  const body = readFileSync(p);
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
    body,
  });
  const j = await r.json();
  if (!r.ok) { console.error('❌ thumbnail:', r.status, JSON.stringify(j.error?.errors || j.error || j)); return; }
  console.log('🖼  Miniatura puesta.');
}

async function addToPlaylist(token, plId) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { playlistId: plId, resourceId: { kind: 'youtube#video', videoId } } }),
  });
  const j = await r.json();
  if (!r.ok) { console.error('❌ playlist:', r.status, JSON.stringify(j.error?.errors || j.error || j)); return; }
  console.log(`▶️  Agregado a la playlist ${plId} (posición ${j.snippet?.position ?? '?'}).`);
}

async function main() {
  const token = await getAccessToken(cfg);
  if (thumb) await setThumbnail(token, thumb);
  if (playlistId) await addToPlaylist(token, playlistId);
  console.log('✅ Listo.');
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
