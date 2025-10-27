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
API_PORT=3001

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

# Deploy runtime configuration for environment flexibility
echo -e "${BLUE}🔧 Setting up runtime configuration...${NC}"
echo -e "${YELLOW}⚠️  Note: API keys should be provided via environment variables:${NC}"
echo -e "${YELLOW}   VITE_API_URL and VITE_GOOGLE_MAPS_API_KEY${NC}"

# Load environment variables from .env files if they exist
VITE_API_URL=${VITE_API_URL:-https://emaus.cc/api
VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY:-}
if [ -f "apps/web/.env.production" ]; then
    # Export variables from .env.production, ignoring comments and empty lines
    export $(grep -v '^#' apps/web/.env.production | grep -v '^$' | xargs)
fi

# Determine API URL based on environment
get_api_url() {
    local env=$1
    case $env in
        "development")
            echo "http://localhost:3001/api"
            ;;
        "staging")
            echo "https://staging.emaus.cc/api"
            ;;
        "production"|*)
            echo "${VITE_API_URL:-https://emaus.cc/api}"
            ;;
    esac
}

# Create comprehensive runtime config for production deployment
cat > apps/web/dist/runtime-config.js << EOF
/**
 * Runtime Configuration for Emaus Frontend - Production Deployment
 *
 * This file enables dynamic environment switching at runtime
 * without requiring application rebuilds.
 *
 * IMPORTANT: API keys and sensitive values should be provided via environment variables
 * at deployment time, not hardcoded in this file.
 */

// Configuration defaults based on environment detection
function detectEnvironment() {
    const hostname = window.location.hostname;
    const port = window.location.port;

    // Localhost detection
    const isLocalhost = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        (port && ['5173', '8080', '3000', '8787'].includes(port));

    // Staging detection
    const isStaging = hostname.includes('staging') || hostname.includes('stg') ||
        hostname.includes('staging.') || hostname.includes('-stg.') ||
        (port && ['3001', '3002', '8081'].includes(port));

    if (isStaging) return 'staging';
    if (isLocalhost) return 'development';
    return 'production';
}

function getApiUrl(environment) {
    switch (environment) {
        case 'development':
            return 'http://localhost:3001/api';
        case 'staging':
            return 'https://staging.emaus.cc/api';
        case 'production':
        default:
            return '$(get_api_url production)';
    }
}

// Initialize configuration
const environment = detectEnvironment();
const isDevelopment = environment === 'development';
const isStaging = environment === 'staging';
const isProduction = environment === 'production';

// Set up global configuration
window.EMAUS_RUNTIME_CONFIG = {
    apiUrl: getApiUrl(environment),
    googleMapsApiKey: '$VITE_GOOGLE_MAPS_API_KEY',
    environment,
    isDevelopment,
    isStaging,
    isProduction,
};

console.log('[CONFIG] Production runtime configuration loaded:', window.EMAUS_RUNTIME_CONFIG);

/**
 * Update configuration at runtime (useful for testing)
 */
window.updateEmausConfig = function(newConfig) {
    window.EMAUS_RUNTIME_CONFIG = {
        ...window.EMAUS_RUNTIME_CONFIG,
        ...newConfig
    };
    console.log('[CONFIG] Runtime configuration updated:', window.EMAUS_RUNTIME_CONFIG);

    // Trigger custom event for app updates
    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('emaus-config-updated', {
            detail: window.EMAUS_RUNTIME_CONFIG
        }));
    }
};

/**
 * Get current configuration
 */
window.getEmausConfig = function() {
    return window.EMAUS_RUNTIME_CONFIG;
};

console.log('[CONFIG] Runtime configuration functions ready');
EOF

echo -e "${GREEN}✅ Production runtime configuration created${NC}"
echo -e "${BLUE}💡 You can now modify configuration by editing apps/web/dist/runtime-config.js${NC}"
echo -e "${BLUE}🔧 Use updateEmausConfig() to change settings at runtime${NC}"
echo -e ""
echo -e "${YELLOW}📋 Environment Variable Setup:${NC}"
echo -e "   export VITE_API_URL=https://your-api-domain.com/api"
echo -e "   export VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key"
echo -e "   ./release-from-github.sh"
echo -e ""
echo -e "${BLUE}📄 Or create apps/web/.env.production with your values${NC}"
echo -e "   See apps/web/.env.production.example for template"

# Verify and fix environment configuration
echo -e "${BLUE}🔧 Verifying environment configuration...${NC}"

# Ensure frontend environment files exist and have correct API URL
if [ -f "apps/web/.env.production" ]; then
    echo -e "${GREEN}✅ Frontend .env.production found${NC}"
    # Copy production env to development env for runtime
    cp apps/web/.env.production apps/web/.env
    echo -e "${BLUE}📝 Updated frontend .env with production values${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: No frontend .env.production found${NC}"
fi

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
    script: 'apps/api/env-wrapper.sh',
    args: ['node', 'dist/index.js'],
    cwd: '$APP_DIR',
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

        # Check for domain name and create appropriate config
        if [ -n "$DOMAIN_NAME" ]; then
            # Create Nginx config with domain substitution
            sed "s/\$DOMAIN_NAME/$DOMAIN_NAME/g" nginx.conf > /tmp/emaus-nginx.conf
            sudo cp /tmp/emaus-nginx.conf /etc/nginx/sites-available/emaus
            rm /tmp/emaus-nginx.conf
        else
            # Copy config without SSL certificate paths for development
            echo -e "${YELLOW}⚠️  DOMAIN_NAME not set, creating development config${NC}"
            sudo cp nginx.conf /etc/nginx/sites-available/emaus
        fi

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
if [ -f "dist/cli/migration-cli.js" ]; then
    if pnpm migration:run:prod; then
        echo -e "${GREEN}✅ Migrations completed${NC}"
    else
        echo -e "${YELLOW}⚠️  Migration warnings (this might be okay)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Migration CLI not found in dist, skipping migrations${NC}"
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
