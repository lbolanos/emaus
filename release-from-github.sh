#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 Deploying from GitHub Release${NC}"

# Configuration
APP_DIR="/var/www/emaus"
BACKUP_DIR="/var/www/emaus-backups"
DOWNLOAD_DIR="/tmp/emaus-release-$$"
HEALTH_CHECK_TIMEOUT=30
API_PORT=3000

# Check if repository and tag are provided
if [ -z "$GITHUB_REPO" ] || [ -z "$RELEASE_TAG" ]; then
    echo -e "${RED}❌ Error: Set GITHUB_REPO and RELEASE_TAG environment variables${NC}"
    echo "Example:"
    echo "  export GITHUB_REPO=username/repo"
    echo "  export RELEASE_TAG=v1.0.0"
    echo "  ./release-from-github.sh"
    exit 1
fi

# Check if we're in the app directory
if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}❌ Error: App directory not found at $APP_DIR${NC}"
    echo "Please run setup script first or create the directory."
    exit 1
fi

cd "$APP_DIR"

# Function to check if a command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Function to install package based on package manager
install_package() {
    local package=$1
    echo -e "${YELLOW}📦 Installing $package...${NC}"
    
    if command_exists apt-get; then
        sudo apt-get update && sudo apt-get install -y "$package"
    elif command_exists dnf; then
        sudo dnf install -y "$package"
    elif command_exists yum; then
        sudo yum install -y "$package"
    elif command_exists apk; then
        sudo apk add "$package"
    else
        echo -e "${RED}❌ Error: No supported package manager found${NC}"
        exit 1
    fi
}

# Function to create backup
create_backup() {
    echo -e "${BLUE}💾 Creating backup of current deployment...${NC}"
    
    mkdir -p "$BACKUP_DIR"
    local backup_name="backup-$(date +%Y%m%d-%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    mkdir -p "$backup_path"
    
    # Backup dist directories if they exist
    if [ -d "apps/web/dist" ]; then
        cp -r apps/web/dist "$backup_path/web-dist"
    fi
    
    if [ -d "apps/api/dist" ]; then
        cp -r apps/api/dist "$backup_path/api-dist"
    fi
    
    # Backup ecosystem config if it exists
    if [ -f "ecosystem.config.js" ]; then
        cp ecosystem.config.js "$backup_path/"
    fi
    
    echo "$RELEASE_TAG" > "$backup_path/version.txt"
    
    echo -e "${GREEN}✅ Backup created at: $backup_path${NC}"
    echo "$backup_path" > /tmp/emaus-last-backup
    
    # Keep only last 5 backups
    cd "$BACKUP_DIR"
    ls -t | tail -n +6 | xargs -r rm -rf
    cd "$APP_DIR"
}

# Function to rollback
rollback() {
    echo -e "${YELLOW}⏮️  Rolling back to previous version...${NC}"
    
    if [ -f "/tmp/emaus-last-backup" ]; then
        local backup_path=$(cat /tmp/emaus-last-backup)
        
        if [ -d "$backup_path" ]; then
            # Restore from backup
            if [ -d "$backup_path/web-dist" ]; then
                rm -rf apps/web/dist
                cp -r "$backup_path/web-dist" apps/web/dist
            fi
            
            if [ -d "$backup_path/api-dist" ]; then
                rm -rf apps/api/dist
                cp -r "$backup_path/api-dist" apps/api/dist
            fi
            
            if [ -f "$backup_path/ecosystem.config.js" ]; then
                cp "$backup_path/ecosystem.config.js" .
            fi
            
            # Restart services
            pm2 restart ecosystem.config.js
            
            echo -e "${GREEN}✅ Rollback completed${NC}"
            return 0
        fi
    fi
    
    echo -e "${RED}❌ No backup found for rollback${NC}"
    return 1
}

# Trap errors and rollback
trap 'echo -e "${RED}❌ Deployment failed!${NC}"; rollback; exit 1' ERR

# Install dependencies
if ! command_exists curl; then
    install_package curl
fi

if ! command_exists wget; then
    install_package wget
fi

# Create temporary download directory
mkdir -p "$DOWNLOAD_DIR"
cd "$DOWNLOAD_DIR"

echo -e "${BLUE}⬇️  Downloading release $RELEASE_TAG from $GITHUB_REPO${NC}"

# Download assets from GitHub release with retry logic
download_with_retry() {
    local url=$1
    local output=$2
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo "Attempt $attempt of $max_attempts..."
        
        if curl -f -L -o "$output" "$url"; then
            echo -e "${GREEN}✅ Downloaded successfully${NC}"
            return 0
        fi
        
        attempt=$((attempt + 1))
        if [ $attempt -le $max_attempts ]; then
            echo -e "${YELLOW}Retrying in 5 seconds...${NC}"
            sleep 5
        fi
    done
    
    echo -e "${RED}❌ Failed to download after $max_attempts attempts${NC}"
    return 1
}

# Download web assets
echo -e "${BLUE}📥 Downloading web assets...${NC}"
download_with_retry \
    "https://github.com/$GITHUB_REPO/releases/download/$RELEASE_TAG/web-dist.tar.gz" \
    "web-dist.tar.gz"

# Download API assets
echo -e "${BLUE}📥 Downloading API assets...${NC}"
download_with_retry \
    "https://github.com/$GITHUB_REPO/releases/download/$RELEASE_TAG/api-dist.tar.gz" \
    "api-dist.tar.gz"

# Verify downloads
echo -e "${BLUE}🔍 Verifying downloads...${NC}"
if [ ! -f "web-dist.tar.gz" ] || [ ! -s "web-dist.tar.gz" ]; then
    echo -e "${RED}❌ Error: web-dist.tar.gz is missing or empty${NC}"
    exit 1
fi

if [ ! -f "api-dist.tar.gz" ] || [ ! -s "api-dist.tar.gz" ]; then
    echo -e "${RED}❌ Error: api-dist.tar.gz is missing or empty${NC}"
    exit 1
fi

# Show file sizes
echo -e "${GREEN}✅ Downloads completed${NC}"
echo "  web-dist.tar.gz: $(du -h web-dist.tar.gz | cut -f1)"
echo "  api-dist.tar.gz: $(du -h api-dist.tar.gz | cut -f1)"

# Return to app directory and create backup
cd "$APP_DIR"
create_backup

# Extract archives
echo -e "${BLUE}📦 Extracting web assets...${NC}"
rm -rf apps/web/dist
mkdir -p apps/web/dist
tar -xzf "$DOWNLOAD_DIR/web-dist.tar.gz" -C apps/web/dist/

echo -e "${BLUE}📦 Extracting API assets...${NC}"
rm -rf apps/api/dist
mkdir -p apps/api/dist
tar -xzf "$DOWNLOAD_DIR/api-dist.tar.gz" -C apps/api/dist/

# Verify extraction
if [ ! -f "apps/api/dist/index.js" ]; then
    echo -e "${RED}❌ Error: API index.js not found after extraction${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Extraction completed${NC}"

# Clean up download directory
rm -rf "$DOWNLOAD_DIR"

# Install/update pnpm
if ! command_exists pnpm; then
    echo -e "${BLUE}📦 Installing pnpm...${NC}"
    curl -fsSL https://get.pnpm.io/install.sh | sh -
fi

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Install production dependencies
echo -e "${BLUE}📦 Installing production dependencies...${NC}"
export NODE_OPTIONS="--max-old-space-size=512"
pnpm install --frozen-lockfile --prod --reporter=append-only

# Install PM2 globally if not installed
if ! command_exists pm2; then
    echo -e "${BLUE}📦 Installing PM2...${NC}"
    npm install -g pm2
fi

# Create ecosystem file for PM2
echo -e "${BLUE}⚙️  Creating PM2 configuration...${NC}"
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'emaus-api',
    script: 'apps/api/dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: $API_PORT
    },
    error_log: '/var/log/emaus-api-error.log',
    out_log: '/var/log/emaus-api-out.log',
    combine_logs: true,
    time: true,
    max_memory_restart: '500M',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
}
EOF

# Configure Nginx
if command_exists nginx; then
    if [ -f "nginx.conf" ]; then
        echo -e "${BLUE}🌐 Configuring Nginx...${NC}"
        sudo cp nginx.conf /etc/nginx/sites-available/emaus
        sudo ln -sf /etc/nginx/sites-available/emaus /etc/nginx/sites-enabled/
        sudo rm -f /etc/nginx/sites-enabled/default
        
        # Test nginx config
        if sudo nginx -t; then
            echo -e "${BLUE}🔄 Reloading Nginx...${NC}"
            sudo systemctl reload nginx
        else
            echo -e "${YELLOW}⚠️  Nginx configuration test failed, skipping reload${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  nginx.conf not found, skipping Nginx configuration${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Nginx not installed, skipping web server configuration${NC}"
fi

# Run database migrations
echo -e "${BLUE}🗄️  Running database migrations...${NC}"
cd apps/api
if pnpm migration:run; then
    echo -e "${GREEN}✅ Migrations completed${NC}"
else
    echo -e "${YELLOW}⚠️  Migration warnings (this might be okay)${NC}"
fi
cd "$APP_DIR"

# Stop existing PM2 processes
echo -e "${BLUE}🛑 Stopping existing processes...${NC}"
pm2 delete emaus-api 2>/dev/null || true

# Start application with PM2
echo -e "${BLUE}▶️  Starting application...${NC}"
pm2 start ecosystem.config.js
pm2 save

# Setup PM2 to start on boot (only once)
if ! pm2 startup | grep -q "already"; then
    pm2 startup systemd -u $USER --hp $HOME
fi

# Health check
echo -e "${BLUE}🏥 Performing health check...${NC}"
sleep 5

health_check() {
    local attempts=0
    local max_attempts=$((HEALTH_CHECK_TIMEOUT / 5))
    
    while [ $attempts -lt $max_attempts ]; do
        if curl -f -s "http://localhost:$API_PORT/health" > /dev/null 2>&1 || \
           curl -f -s "http://localhost:$API_PORT/" > /dev/null 2>&1; then
            return 0
        fi
        
        attempts=$((attempts + 1))
        echo -e "${YELLOW}Waiting for API to be ready... ($attempts/$max_attempts)${NC}"
        sleep 5
    done
    
    return 1
}

if health_check; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "API logs:"
    pm2 logs emaus-api --lines 20 --nostream
    exit 1
fi

# Display deployment summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Deployment from GitHub Release completed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📊 Deployment Information:${NC}"
echo "  Repository: $GITHUB_REPO"
echo "  Version: $RELEASE_TAG"
echo "  Date: $(date)"
echo ""
echo -e "${BLUE}🌐 Application URLs:${NC}"
echo "  Local: http://localhost:$API_PORT"
echo "  Network: http://$(hostname -I | awk '{print $1}')"
echo ""
echo -e "${BLUE}📝 Useful Commands:${NC}"
echo "  View logs: pm2 logs emaus-api"
echo "  View status: pm2 status"
echo "  Restart app: pm2 restart emaus-api"
echo "  Stop app: pm2 stop emaus-api"
echo ""
echo -e "${BLUE}💾 Backup location:${NC}"
if [ -f "/tmp/emaus-last-backup" ]; then
    echo "  $(cat /tmp/emaus-last-backup)"
fi
echo ""

# Save deployment info
cat > "$APP_DIR/.deployment-info" << EOF
RELEASE_TAG=$RELEASE_TAG
GITHUB_REPO=$GITHUB_REPO
DEPLOYMENT_DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
DEPLOYED_BY=$USER
EOF

echo -e "${GREEN}🚀 Deployment complete!${NC}"