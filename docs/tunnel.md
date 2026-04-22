# SSH Tunnel for Local Development

Expose your local dev servers to the internet via the AWS Lightsail server, replacing ngrok.

## How It Works

```
Phone/Browser                 Lightsail (emaus.cc)             Your Machine (WSL)
─────────────────           ──────────────────────           ──────────────────
http://emaus.cc:8080  ───►  SSH reverse tunnel :8080  ───►  Vite (localhost:5173)
http://emaus.cc:8081  ───►  SSH reverse tunnel :8081  ───►  API  (localhost:3001)
```

An SSH reverse tunnel binds ports on the remote server and forwards traffic back to your local machine through the SSH connection. The Lightsail server acts as a public relay — it doesn't run any app code, it just pipes bytes between the internet and your localhost.

## Quick Start

```bash
# 1. Start your dev servers
pnpm dev

# 2. Start the tunnel
pnpm tunnel

# 3. Access from any device
#    Web:  http://emaus.cc:8080
#    API:  http://emaus.cc:8081

# 4. Stop the tunnel when done
pnpm tunnel:stop
```

## Available Commands

| Command | Script | Description |
|---|---|---|
| `pnpm tunnel` | `scripts/tunnel-start.sh` | Start the tunnel (kills existing first) |
| `pnpm tunnel:stop` | `scripts/tunnel-stop.sh` | Stop all running tunnels |
| `pnpm tunnel:setup` | `scripts/tunnel-setup.sh` | One-time server config (GatewayPorts + UFW) |

Override defaults with env vars: `HOST=other.host USER=ubuntu KEY=~/.ssh/other.pem pnpm tunnel`.

## Prerequisites

- SSH key at `~/.ssh/lightsail-emaus.pem`
- Dev servers running (`pnpm dev`)
- Lightsail instance port rules must allow inbound TCP on ports 8080 and 8081 (see `infra/lightsail.tf`)
- UFW on the server must allow ports 8080 and 8081 (run `pnpm tunnel:setup` once)

## Server Details

- **Host**: `18.116.102.104` (Lightsail static IP — **no usar `emaus.cc`** porque Cloudflare proxy bloquea el puerto 22)
- **User**: `ubuntu`
- **Key**: `~/.ssh/lightsail-emaus.pem`
- **Region**: us-east-2
- **Instance**: `emaus-prod` (bundle `micro_3_0`)

## How the Vite Proxy Handles It

When accessed through the tunnel, the request flow is:

1. Browser at `emaus.cc:8080` makes a request to `/api/auth/login`
2. SSH tunnel forwards it to `localhost:5173` (Vite)
3. Vite proxy rewrites the `Origin` header to `http://localhost:5173` and forwards to `localhost:3001` (API)
4. API sees a localhost origin and accepts it — no CORS issues

This is configured in `apps/web/vite.config.ts` in the proxy section.

## Troubleshooting

### Tunnel starts but pages don't load
Check that `pnpm dev` is running. The tunnel only forwards traffic — it doesn't start the dev servers.

### Connection refused from external device
Run `pnpm tunnel:setup` to ensure GatewayPorts and UFW are configured on the server.

### Auto-reconnect
Install `autossh` for automatic reconnection if the SSH connection drops:
```bash
sudo apt install autossh
```
The tunnel script uses it automatically when available, otherwise falls back to plain SSH with keepalive settings.

### Check if tunnel is running
```bash
pgrep -f "ssh.*18.116.102.104"
```

### Check remote ports
```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 "ss -tlnp | grep -E '808[01]'"
```
