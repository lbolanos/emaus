// Agrega un video a la playlist del canal (orden del ciclo del retiro).
//   node e2e/demo/_playlist-add.mjs <videoId>
import { loadEnv } from './demo-lib.mjs';
import { getAccessToken } from './youtube-lib.mjs';

const cfg = loadEnv();
const videoId = process.argv[2];
if (!videoId) { console.error('uso: _playlist-add.mjs <videoId>'); process.exit(1); }

const token = await getAccessToken(cfg);
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const res = await fetch(
  'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status&mine=true&maxResults=25',
  { headers: H },
);
const data = await res.json();
if (!res.ok) { console.error('playlists.list:', JSON.stringify(data).slice(0, 300)); process.exit(1); }

console.log('playlists del canal:');
for (const p of data.items || []) {
  console.log(`  ${p.id}  [${p.status?.privacyStatus}]  ${p.snippet?.title}`);
}

const target = (data.items || [])[0];
if (!target) { console.error('no hay playlists'); process.exit(1); }

const ins = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    snippet: { playlistId: target.id, resourceId: { kind: 'youtube#video', videoId } },
  }),
});
const insJson = await ins.json();
console.log(
  ins.ok
    ? `✅ agregado a "${target.snippet.title}" (posición ${insJson.snippet?.position})`
    : `❌ ${JSON.stringify(insJson).slice(0, 300)}`,
);
