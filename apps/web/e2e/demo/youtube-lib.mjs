// Cliente mínimo de la YouTube Data API v3 con `fetch` puro (sin `googleapis`).
//
// - loadToken()/saveToken(): persisten el refresh_token en youtube-token.json (gitignoreado).
// - getAccessToken(cfg):     canjea el refresh_token por un access_token efímero.
// - uploadVideo(...):        subida resumable de un .mp4 con snippet + status.
//
// El refresh_token se obtiene UNA sola vez con `node e2e/demo/youtube-auth.mjs`.
// Requiere Node 18+ (fetch global). Los videos-demo son chicos (~5 MB) → se sube
// el archivo completo en un PUT (para archivos grandes habría que trocear).

import { readFileSync, existsSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { DEMO_DIR } from './demo-lib.mjs';

const TOKEN_PATH = path.join(DEMO_DIR, 'youtube-token.json');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// upload = subir videos; force-ssl = gestionar el canal (playlists, miniaturas, borrar).
export const YT_SCOPE =
  'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl';

export function loadToken() {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function saveToken(token) {
  writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  return TOKEN_PATH;
}

// Canjea un authorization code (flujo inicial) por tokens. redirectUri debe coincidir
// exactamente con el usado al pedir el code.
export async function exchangeCode(cfg, code, redirectUri) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.ytClientId,
      client_secret: cfg.ytClientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange ${res.status}: ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_in, ... }
}

// refresh_token → access_token efímero.
export async function getAccessToken(cfg) {
  const token = loadToken();
  if (!token?.refresh_token) {
    throw new Error(
      'No hay refresh_token. Corré primero:  node e2e/demo/youtube-auth.mjs',
    );
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.ytClientId,
      client_secret: cfg.ytClientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Refresh token ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// Subida resumable: 1) inicia la sesión con el snippet/status, 2) sube los bytes.
// Devuelve el objeto video de YouTube ({ id, snippet, status, ... }).
export async function uploadVideo(cfg, accessToken, { file, title, description, tags = [], privacy, categoryId }) {
  if (!existsSync(file)) throw new Error(`No existe el video: ${file}`);
  const size = statSync(file).size;

  const metadata = {
    snippet: {
      title,
      description,
      tags,
      categoryId: categoryId || cfg.ytCategoryId,
      defaultLanguage: 'es',
      defaultAudioLanguage: 'es',
    },
    status: {
      privacyStatus: privacy || cfg.ytPrivacy,
      selfDeclaredMadeForKids: false,
    },
  };

  // 1) Iniciar sesión resumable.
  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!init.ok) throw new Error(`Init upload ${init.status}: ${await init.text()}`);
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube no devolvió la URL de subida (Location).');

  // 2) Subir los bytes (archivo completo; demos ~5 MB). fetch necesita duplex para stream.
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
    body: createReadStream(file),
    duplex: 'half',
  });
  if (!put.ok) throw new Error(`Upload ${put.status}: ${await put.text()}`);
  return put.json();
}
