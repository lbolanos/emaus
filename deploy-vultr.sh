#!/bin/bash
set -e

echo "🚀 Deploying Emaus to Vultr VPS"

# Check if we're in the app directory
if [ ! -d "/var/www/emaus" ]; then
    echo "❌ Error: App directory not found. Please run setup script first."
    exit 1
fi

cd /var/www/emaus

# Install dependencies
echo "📦 Installing dependencies..."
curl -fsSL https://get.pnpm.io/install.sh | sh -
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
pnpm install --frozen-lockfile

# Build API
echo "🔨 Building API..."
pnpm --filter api build

# Build Web
echo "🔨 Building web frontend..."
pnpm --filter web build

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

echo "✅ Deployment completed!"
echo "🌐 Your application should be available at http://$domain_name"
echo "🔒 Run SSL setup next: sudo certbot --nginx -d $domain_name -d www.$domain_name"

# Setup log rotation
cat > /etc/logrotate.d/emaus << EOF
/var/log/emaus*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

echo "🔄 Log rotation configured"
