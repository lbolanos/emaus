# Testing from the Internet with ngrok

This guide explains how to expose your local development environment to the internet using ngrok.

## Prerequisites

- ngrok installed in WSL: `~/bin/ngrok`
- ngrok account configured: `~/bin/ngrok config add-authtoken YOUR_TOKEN`
- Dev servers running: `pnpm dev`

## Quick Start

1. **Start the dev servers**
   ```bash
   pnpm dev
   ```

2. **Start the ngrok tunnel** (in a separate terminal)
   ```bash
   ~/bin/ngrok http 5173
   ```
   Or use the shortcut:
   ```bash
   pnpm --filter web tunnel
   ```

3. **Copy the public URL** from the ngrok output (e.g. `https://abc123.ngrok-free.dev`)

4. **Open the URL** in any browser, from any device

## How It Works

```
Internet Browser
    │
    ▼
ngrok (public URL)
    │
    ▼
Vite Dev Server (:5173)
    │
    ├── Serves frontend (Vue app)
    │
    └── Proxies /api/* ──▶ Express API (:3001)
```

Only one ngrok tunnel is needed. The Vite dev server proxies all `/api` requests to the local API on port 3001. The proxy forwards the original host header (`x-forwarded-host`) so the API knows the request came from ngrok.

## What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Frontend | OK | Fully functional |
| API (email/password login) | OK | reCAPTCHA bypassed in dev mode |
| CORS | OK | ngrok origins allowed in dev mode |
| Google OAuth | Partial | Requires Google Console setup (see below) |

## Google OAuth (Optional)

Google OAuth requires registering the ngrok domain in your Google Cloud Console:

1. Go to [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Add to **Authorized JavaScript origins**:
   ```
   https://YOUR-SUBDOMAIN.ngrok-free.dev
   ```
4. Add to **Authorized redirect URIs**:
   ```
   https://YOUR-SUBDOMAIN.ngrok-free.dev/api/auth/google/callback
   ```

> **Note:** The free ngrok tier generates a random subdomain each restart. A paid plan provides a fixed subdomain, which avoids updating Google Console every time.

## ngrok Free Tier Limitations

- **Interstitial page**: First-time visitors see a warning page. Click "Visit Site" to continue.
- **Random subdomain**: Changes every time ngrok restarts.
- **Rate limits**: Limited connections per minute.
- **Single tunnel**: Only one tunnel at a time (sufficient for this setup since Vite proxies the API).

## Security Notes

All tunnel-related changes are gated behind development mode:

- **CORS**: ngrok origins are only accepted when `isDevelopment` is true
- **reCAPTCHA**: Bypassed only when `NODE_ENV !== 'production'`
- **OAuth redirect**: Validated against an allowlist (localhost, ngrok domains, configured `FRONTEND_URL`)
- **Vite `allowedHosts`**: Only affects the dev server, not production builds

**None of these changes affect production behavior.**

## Troubleshooting

### "Blocked request" error
The Vite dev server is blocking the ngrok hostname. Ensure `allowedHosts: true` is set in `vite.config.js` and restart the dev server.

### CORS errors in console
The API is rejecting the ngrok origin. Verify:
- The API is running (`curl http://localhost:3001/api/auth/status`)
- `isDevelopment` is `true` in the API (check that `FRONTEND_URL` in `.env` contains `localhost`)

### API returns 502 through ngrok
The dev server hasn't started yet. Wait a few seconds and retry.

### Login fails with reCAPTCHA error
Ensure `NODE_ENV` is not set to `production` in your API `.env` file.

### Google OAuth redirects to localhost
The API needs the `x-forwarded-host` header from the Vite proxy. Restart the dev server to pick up the proxy configuration changes.
