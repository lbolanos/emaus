// Autoriza UNA vez la subida a YouTube y guarda el refresh_token en youtube-token.json.
//
//   cd apps/web && node e2e/demo/youtube-auth.mjs
//
// Prerrequisitos (en Google Cloud Console, cuenta del canal):
//   1. Crear un proyecto y habilitar "YouTube Data API v3".
//   2. Pantalla de consentimiento OAuth → agregar tu cuenta como "usuario de prueba".
//   3. Credenciales → OAuth 2.0 → tipo "App de escritorio" (Desktop app).
//   4. Copiar el Client ID / Client Secret a apps/web/e2e/demo/.env (YT_CLIENT_ID / YT_CLIENT_SECRET).
//
// Este flujo levanta un servidor local (loopback), abre el navegador para que
// autorices, captura el `code` del redirect y lo canjea por el refresh_token.

import http from 'node:http';
import { execFile } from 'node:child_process';
import { loadEnv } from './demo-lib.mjs';
import { exchangeCode, saveToken, loadToken, YT_SCOPE } from './youtube-lib.mjs';

const cfg = loadEnv();

if (!cfg.ytClientId || !cfg.ytClientSecret) {
  console.error('❌ Falta YT_CLIENT_ID / YT_CLIENT_SECRET en apps/web/e2e/demo/.env');
  console.error('   Ver el encabezado de este archivo para el setup en Google Cloud.');
  process.exit(1);
}

const existing = loadToken();
if (existing?.refresh_token) {
  console.log('✅ Ya hay un refresh_token guardado (youtube-token.json).');
  console.log('   Borralo si querés reautorizar con otra cuenta.');
  process.exit(0);
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [url], () => {});
}

// Servidor loopback en un puerto efímero (0 → el SO asigna uno libre).
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1`);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (!code && !err) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const { port } = server.address();
  const redirectUri = `http://127.0.0.1:${port}`;
  try {
    if (err) throw new Error(err);
    const token = await exchangeCode(cfg, code, redirectUri);
    if (!token.refresh_token) {
      throw new Error(
        'Google no devolvió refresh_token. Revocá el acceso previo en ' +
          'https://myaccount.google.com/permissions y reintentá (usamos prompt=consent).',
      );
    }
    saveToken(token);
    res.end('<h2>✅ Autorización lista. Ya podés cerrar esta pestaña.</h2>');
    console.log('✅ refresh_token guardado en youtube-token.json');
  } catch (e) {
    res.end(`<h2>❌ Error: ${e.message}</h2>`);
    console.error('❌', e.message);
  } finally {
    server.close();
    setTimeout(() => process.exit(0), 300);
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const redirectUri = `http://127.0.0.1:${port}`;
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: cfg.ytClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: YT_SCOPE,
      access_type: 'offline',
      prompt: 'consent', // fuerza que devuelva refresh_token
    }).toString();
  console.log('🌐 Abriendo el navegador para autorizar…');
  console.log('   Si no abre solo, pegá esta URL:\n   ' + authUrl + '\n');
  openBrowser(authUrl);
});
