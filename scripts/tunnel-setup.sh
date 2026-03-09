#!/usr/bin/env bash
# One-time server setup for SSH reverse tunnel
# Ensures GatewayPorts is enabled and ports are accessible
set -euo pipefail

HOST="3.138.49.105"
USER="ubuntu"
KEY="$HOME/.ssh/emaus-key.pem"

echo "==> Configuring SSH tunnel on $HOST..."

ssh -i "$KEY" "$USER@$HOST" bash -s <<'REMOTE'
set -euo pipefail

SSHD_CONFIG="/etc/ssh/sshd_config"

# Enable GatewayPorts if not already set
if grep -q "^GatewayPorts yes" "$SSHD_CONFIG"; then
  echo "GatewayPorts already enabled."
else
  echo "Enabling GatewayPorts..."
  sudo sed -i '/^#\?GatewayPorts/d' "$SSHD_CONFIG"
  echo "GatewayPorts yes" | sudo tee -a "$SSHD_CONFIG" > /dev/null
  echo "Restarting sshd..."
  sudo systemctl restart sshd
  echo "sshd restarted."
fi

# Open ports in UFW if active
echo ""
echo "==> Firewall check:"
if sudo ufw status | grep -q "Status: active"; then
  for PORT in 8080 8081; do
    if sudo ufw status | grep -q "$PORT/tcp.*ALLOW"; then
      echo "  Port $PORT: already allowed in UFW"
    else
      echo "  Opening port $PORT in UFW..."
      sudo ufw allow "$PORT/tcp"
    fi
  done
else
  echo "  UFW not active, skipping."
fi

echo ""
echo "Done! Make sure AWS Security Group also allows inbound TCP on ports 8080 and 8081."
REMOTE
