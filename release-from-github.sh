#!/bin/bash
set -e

echo "📦 Deploying from GitHub Release"

# Check if repository and tag are provided
if [ -z "$GITHUB_REPO" ] || [ -z "$RELEASE_TAG" ]; then
    echo "❌ Error: Set GITHUB_REPO and RELEASE_TAG environment variables"
    echo "Example: export GITHUB_REPO=lbolanos/emaus RELEASE_TAG=v1.0.0"
    exit 1
fi

# Check if we're in the app directory
if [ ! -d "/var/www/emaus" ]; then
    echo "❌ Error: App directory not found. Please run setup script first."
    exit 1
fi

cd /var/www/emaus

echo "⬇️ Downloading release $RELEASE_TAG from $GITHUB_REPO"

# Install curl if not available
if ! command -v curl &> /dev/null; then
    echo "📦 Installing curl..."
    # Try different package managers
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y curl
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y curl
    elif command -v apk &> /dev/null; then
        sudo apk add curl
    fi
fi

# Download assets from GitHub release
echo "📥 Downloading web assets..."
curl -L -o web-dist.tar.gz \
    "https://github.com/$GITHUB_REPO/releases/download/$RELEASE_TAG/web-dist.tar.gz"

echo "📥 Downloading API assets..."
curl -L -o api-dist.tar.gz \
    "https://github.com/$GITHUB_REPO/releases/download/$RELEASE_TAG/api-dist.tar.gz"

# Verify downloads
if [ ! -f "web-dist.tar.gz" ] || [ ! -f "api-dist.tar.gz" ]; then
    echo "❌ Error: Failed to download release assets"
    exit 1
fi

echo "✅ Downloads completed"

# Extract archives
echo "📦 Extracting web assets..."
mkdir -p apps/web/dist
tar -xzf web-dist.tar.gz -C apps/web/dist/

echo "📦 Extracting API assets..."
mkdir -p apps/api/dist
tar -xzf api-dist.tar.gz -C apps/api/dist/

# Clean up
rm web-dist.tar.gz api-dist.tar.gz

echo "📦 Installing production dependencies..."
export NODE_OPTIONS="--max-old-space-size=256"
# Install pnpm if not available
if ! command -v pnpm &> /dev/null; then
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PNPM_HOME="$HOME/.local/share/pnpm"
    export PATH="$PNPM_HOME:$PATH"
fi

# Install only production dependencies
pnpm install --frozen-lockfile --prod --reporter=append-only

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Create ecosystem file for PM2
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'emaus-api',
    script: 'apps/api/dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production'
    },
    error_log: '/var/log/emaus-api-error.log',
    out_log: '/var/log/emaus-api-out.log',
    log_log: '/var/log/emaus-api-combined.log',
    time: true
  }]
}
EOF

# Stop existing PM2 processes
echo "🛑 Stopping existing processes..."
pm2 stop ecosystem.config.js || true
pm2 delete ecosystem.config.js || true

# Copy nginx config
echo "🌐 Configuring Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/emaus
sudo ln -sf /etc/nginx/sites-available/emaus /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
sudo nginx -t

# Reload nginx
echo "🔄 Reloading Nginx..."
sudo systemctl reload nginx

# Run database migrations
echo "🗄️ Running database migrations..."
cd apps/api
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
pnpm migration:run

# Start application with PM2
echo "▶️ Starting application..."
cd /var/www/emaus
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "✅ Deployment from GitHub Release completed!"
echo "🌐 Your application should be available at http://$(hostname -I | awk '{print $1}')"
echo "Install version: $RELEASE_TAG"
