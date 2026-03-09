#!/usr/bin/env bash
# Start SSH reverse tunnel: expose local dev servers via EC2
#   local:5173 → remote:8080 (web)
#   local:3001 → remote:8081 (API)
set -euo pipefail

HOST="3.138.49.105"
USER="ubuntu"
KEY="$HOME/.ssh/emaus-key.pem"
REMOTE_WEB_PORT=8080
REMOTE_API_PORT=8081
LOCAL_WEB_PORT=5173
LOCAL_API_PORT=3001

# Kill existing tunnels first
"$(dirname "$0")/tunnel-stop.sh" 2>/dev/null || true

SSH_OPTS="-i $KEY -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes"
TUNNEL_ARGS="-N -R 0.0.0.0:${REMOTE_WEB_PORT}:localhost:${LOCAL_WEB_PORT} -R 0.0.0.0:${REMOTE_API_PORT}:localhost:${LOCAL_API_PORT} ${USER}@${HOST}"

if command -v autossh &>/dev/null; then
  echo "Using autossh for auto-reconnect..."
  AUTOSSH_PIDFILE="/tmp/emaus-tunnel.pid"
  export AUTOSSH_PIDFILE
  # shellcheck disable=SC2086
  autossh -f -M 0 $SSH_OPTS $TUNNEL_ARGS
else
  echo "Using plain SSH (install autossh for auto-reconnect)..."
  # shellcheck disable=SC2086
  ssh -f $SSH_OPTS $TUNNEL_ARGS
fi

sleep 1

# Verify tunnel is running
if pgrep -f "ssh.*${REMOTE_WEB_PORT}:localhost:${LOCAL_WEB_PORT}" > /dev/null; then
  echo ""
  echo "Tunnel is running!"
  echo "  Web:  http://${HOST}:${REMOTE_WEB_PORT}"
  echo "  API:  http://${HOST}:${REMOTE_API_PORT}"
  echo ""
  echo "Stop with: ./scripts/tunnel-stop.sh"
else
  echo "ERROR: Tunnel failed to start. Check SSH key and server connectivity."
  exit 1
fi
