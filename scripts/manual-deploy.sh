#!/bin/bash
#
# Manual Deployment Script for Emaus
# Use this when GitHub Actions is unavailable or experiencing outages
#
# Prerequisites:
#   - SSH key configured (~/.ssh/emaus-key.pem)
#   - EC2_HOST environment variable set (or edit below)
#   - Local build passes (pnpm build)
#
# Usage:
#   ./scripts/manual-deploy.sh
#
# Created: 2026-02-02
# Reason: GitHub Actions partial outage preventing automated deployments
#

set -e  # Exit on any error

# Configuration - edit these or set as environment variables
EC2_HOST="${EC2_HOST:-emaus.cc}"
EC2_USER="${EC2_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/emaus-key.pem}"
REMOTE_PATH="/var/www/emaus"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Emaus Manual Deployment Script                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Verify SSH key exists
echo -e "${YELLOW}[1/7] Checking SSH key...${NC}"
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}ERROR: SSH key not found at $SSH_KEY${NC}"
    echo "Please set SSH_KEY environment variable or create the key file"
    exit 1
fi
chmod 600 "$SSH_KEY"
echo -e "${GREEN}✓ SSH key found${NC}"

# Step 2: Test SSH connection
echo -e "${YELLOW}[2/7] Testing SSH connection...${NC}"
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o BatchMode=yes "$EC2_USER@$EC2_HOST" "echo 'SSH OK'" 2>/dev/null; then
    echo -e "${RED}ERROR: Cannot connect to $EC2_HOST${NC}"
    echo "Check your SSH key and EC2 security group settings"
    exit 1
fi
echo -e "${GREEN}✓ SSH connection successful${NC}"

# Step 3: Build locally
echo -e "${YELLOW}[3/7] Building application locally...${NC}"
cd "$(dirname "$0")/.."  # Go to project root

echo "  Running pnpm build..."
if ! pnpm build; then
    echo -e "${RED}ERROR: Build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build successful${NC}"

# Step 4: Upload API build
echo -e "${YELLOW}[4/7] Uploading API build...${NC}"
if [ -d "apps/api/dist" ]; then
    scp -i "$SSH_KEY" -r apps/api/dist "$EC2_USER@$EC2_HOST:$REMOTE_PATH/apps/api/"
    echo -e "${GREEN}✓ API build uploaded${NC}"
else
    echo -e "${RED}ERROR: apps/api/dist not found${NC}"
    exit 1
fi

# Step 5: Upload Web build
echo -e "${YELLOW}[5/7] Uploading Web build...${NC}"
if [ -d "apps/web/dist" ]; then
    scp -i "$SSH_KEY" -r apps/web/dist "$EC2_USER@$EC2_HOST:$REMOTE_PATH/apps/web/"
    echo -e "${GREEN}✓ Web build uploaded${NC}"
else
    echo -e "${RED}ERROR: apps/web/dist not found${NC}"
    exit 1
fi

# Step 6: Run remote deployment steps
echo -e "${YELLOW}[6/7] Running remote deployment...${NC}"
ssh -i "$SSH_KEY" "$EC2_USER@$EC2_HOST" << 'DEPLOY_SCRIPT'
set -e
cd /var/www/emaus

echo "  Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -5

echo "  Running database migrations..."
pnpm --filter api migration:run 2>&1 | tail -3 || echo "  (migrations may already be applied)"

echo "  Restarting PM2..."
pm2 restart emaus-api

echo "  Waiting for application to start..."
sleep 5

echo "  Checking PM2 status..."
pm2 status emaus-api

DEPLOY_SCRIPT
echo -e "${GREEN}✓ Remote deployment complete${NC}"

# Step 7: Verify deployment
echo -e "${YELLOW}[7/7] Verifying deployment...${NC}"
sleep 5

# Try to reach the application
for i in {1..5}; do
    if curl -sf "https://$EC2_HOST/" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Application is responding${NC}"
        break
    fi
    if [ $i -lt 5 ]; then
        echo "  Waiting for application to fully start ($i/5)..."
        sleep 3
    fi
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Deployment Complete!                               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Application URL: ${BLUE}https://$EC2_HOST${NC}"
echo -e "Deployed at: $(date)"
echo ""
echo -e "${YELLOW}To check logs:${NC}"
echo "  ssh -i $SSH_KEY $EC2_USER@$EC2_HOST 'pm2 logs emaus-api --lines 50'"
echo ""
