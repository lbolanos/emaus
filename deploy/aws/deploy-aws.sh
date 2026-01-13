#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 Deploying Emaus from GitHub Release${NC}"

# Configuration
APP_DIR="/var/www/emaus"
BACKUP_DIR="/var/www/emaus-backups"
DOWNLOAD_DIR="/tmp/emaus-release-$$"
HEALTH_CHECK_TIMEOUT=30
API_PORT=3001

# Default repository
GITHUB_REPO="${GITHUB_REPO:-lbolanos/emaus}"

# Check if repository and tag are provided
if [ -z "$RELEASE_TAG" ]; then
    echo -e "${RED}❌ Error: RELEASE_TAG environment variable is required${NC}"
    echo ""
    echo "Usage:"
    echo "  export GITHUB_REPO=owner/repo       # Default: lbolanos/emaus"
    echo "  export RELEASE_TAG=v1.0.0"
    echo "  export DOMAIN_NAME=yourdomain.com   # Optional"
    echo "  $0"
    echo ""
    echo "Example:"
    echo "  export RELEASE_TAG=v1.0.0"
    echo "  export DOMAIN_NAME=emaus.cc"
    echo "  ./deploy-aws.sh"
    echo ""
    read -p "Enter release tag (e.g., v1.0.0): " RELEASE_TAG

    if [ -z "$RELEASE_TAG" ]; then
        print_error "Release tag is required"
        exit 1
    fi
fi

# Check if we're in the app directory
if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}❌ Error: App directory not found at $APP_DIR${NC}"
    echo "Please run setup script first: ./setup-aws.sh"
    exit 1
fi

cd "$APP_DIR"

# Function to print colored output
print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_header() {
    echo -e "${MAGENTA}$1${NC}"
}

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
    else
        echo -e "${RED}❌ Error: No supported package manager found${NC}"
        exit 1
    fi
}

# Function to create backup
create_backup() {
    echo -e "${BLUE}💾 Creating backup of current deployment...${NC}"

    sudo mkdir -p "$BACKUP_DIR"
    sudo chown $USER:$USER "$BACKUP_DIR"
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

    # Backup database if it exists
    if [ -f "apps/api/database.sqlite" ]; then
        cp "apps/api/database.sqlite" "$backup_path/"
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

            # Restore database if backup exists
            if [ -f "$backup_path/database.sqlite" ]; then
                cp "$backup_path/database.sqlite" "apps/api/database.sqlite"
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

echo ""
print_header "═══════════════════════════════════════════════════════════"
print_header "📥 Downloading Release $RELEASE_TAG from $GITHUB_REPO"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# Function to download with retry
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
echo ""

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

# Ensure API .env.production exists
echo -e "${BLUE}🔧 Setting up API environment configuration...${NC}"

if [ ! -f "apps/api/.env.production" ]; then
    if [ -f "apps/api/.env.example" ]; then
        print_status "Creating .env.production from .env.example"
        cp apps/api/.env.example apps/api/.env.production
        print_warning "Please edit apps/api/.env.production with your production credentials"
    else
        print_warning "Creating minimal .env.production"
        cat > apps/api/.env.production << EOF
# Database Configuration
DB_TYPE=sqlite
DB_PATH=./database.sqlite

# Server Configuration
PORT=3001
NODE_ENV=production

# Frontend Configuration
FRONTEND_URL=https://emaus.cc

# JWT Configuration
JWT_SECRET=change-this-to-a-random-string
JWT_EXPIRES_IN=7d

# Google OAuth (required for authentication)
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback

# Email Configuration (optional)
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=
# SMTP_PASSWORD=
# EMAIL_FROM=

# Application URL
BASE_URL=https://emaus.cc
EOF
        print_warning "Please edit apps/api/.env.production with your production credentials"
    fi
fi

# Deploy runtime configuration
echo -e "${BLUE}🔧 Setting up runtime configuration...${NC}"

# Load environment variables
VITE_API_URL=${VITE_API_URL:-https://emaus.cc/api}
VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY:-}

if [ -n "$DOMAIN_NAME" ]; then
    VITE_API_URL="https://$DOMAIN_NAME/api"
fi

if [ -f "apps/web/.env.production" ]; then
    export $(grep -v '^#' apps/web/.env.production | grep -v '^$' | xargs)
fi

# Get API URL based on environment
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

# Create runtime config
cat > apps/web/dist/runtime-config.js << EOF
/**
 * Runtime Configuration for Emaus Frontend - Production Deployment
 */

function detectEnvironment() {
    const hostname = window.location.hostname;
    const port = window.location.port;

    const isLocalhost = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        (port && ['5173', '8080', '3000', '8787'].includes(port));

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

const environment = detectEnvironment();
const isDevelopment = environment === 'development';
const isStaging = environment === 'staging';
const isProduction = environment === 'production';

window.EMAUS_RUNTIME_CONFIG = {
    apiUrl: getApiUrl(environment),
    googleMapsApiKey: '$VITE_GOOGLE_MAPS_API_KEY',
    environment,
    isDevelopment,
    isStaging,
    isProduction,
};

console.log('[CONFIG] Production runtime configuration loaded:', window.EMAUS_RUNTIME_CONFIG);

window.updateEmausConfig = function(newConfig) {
    window.EMAUS_RUNTIME_CONFIG = {
        ...window.EMAUS_RUNTIME_CONFIG,
        ...newConfig
    };
    console.log('[CONFIG] Runtime configuration updated:', window.EMAUS_RUNTIME_CONFIG);

    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('emaus-config-updated', {
            detail: window.EMAUS_RUNTIME_CONFIG
        }));
    }
};

window.getEmausConfig = function() {
    return window.EMAUS_RUNTIME_CONFIG;
};

console.log('[CONFIG] Runtime configuration functions ready');
EOF

echo -e "${GREEN}✅ Runtime configuration created${NC}"

# Verify extraction
if [ ! -f "apps/api/dist/index.js" ]; then
    echo -e "${RED}❌ Error: API index.js not found after extraction${NC}"
    exit 1
fi

if [ ! -f "apps/web/dist/index.html" ]; then
    echo -e "${RED}❌ Error: Web index.html not found after extraction${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Extraction completed${NC}"

# Clean up download directory
rm -rf "$DOWNLOAD_DIR"

# Create ecosystem file for PM2 BEFORE installing dependencies
# This ensures rollback can work even if dependency install fails
echo -e "${BLUE}⚙️  Creating PM2 configuration...${NC}"

# Detect Nginx user
NGINX_USER="www-data"
if [ -f /etc/redhat-release ] || [ -f /etc/centos-release ]; then
    NGINX_USER="nginx"
fi

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
    error_log: '/var/log/emaus/api-error.log',
    out_log: '/var/log/emaus/api-out.log',
    combine_logs: true,
    time: true,
    max_memory_restart: '500M',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
}
EOF

# Set up pnpm
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

if ! command_exists pnpm; then
    echo -e "${BLUE}📦 Installing pnpm...${NC}"
    sudo npm install -g pnpm
fi

# Install PM2 if not present
if ! command_exists pm2; then
    echo -e "${BLUE}📦 Installing PM2...${NC}"
    sudo npm install -g pm2
fi

# Install production dependencies
echo -e "${BLUE}📦 Installing production dependencies...${NC}"
export NODE_OPTIONS="--max-old-space-size=512"
# Ignore prepare scripts to avoid husky issues in production
pnpm install --frozen-lockfile --prod --ignore-scripts --reporter=append-only

# Configure Nginx
if command_exists nginx; then
    echo -e "${BLUE}🌐 Configuring Nginx...${NC}"

    if [ -n "$DOMAIN_NAME" ]; then
        # With domain - use nginx.conf (includes SSL)
        if [ -f "nginx.conf" ]; then
            print_status "Configuring Nginx with SSL support for $DOMAIN_NAME"
            sed "s/\$DOMAIN_NAME/$DOMAIN_NAME/g" nginx.conf > /tmp/emaus-nginx.conf
            sudo cp /tmp/emaus-nginx.conf /etc/nginx/sites-available/emaus
            rm /tmp/emaus-nginx.conf

            sudo ln -sf /etc/nginx/sites-available/emaus /etc/nginx/sites-enabled/
            sudo rm -f /etc/nginx/sites-enabled/default

            # Set file ownership
            sudo chown -R $NGINX_USER:$NGINX_USER "$APP_DIR"

            if sudo nginx -t; then
                echo -e "${BLUE}🔄 Reloading Nginx...${NC}"
                sudo systemctl reload nginx
                print_success "Nginx configured with SSL support"

                # Setup SSL certificate
                echo ""
                print_status "Setting up SSL certificate with Let's Encrypt..."
                if sudo certbot certificates 2>/dev/null | grep -q "$DOMAIN_NAME"; then
                    print_success "SSL certificate already exists for $DOMAIN_NAME"
                else
                    print_status "Obtaining new SSL certificate..."
                    if sudo certbot --nginx -d "$DOMAIN_NAME" -d "www.$DOMAIN_NAME" --email "admin@$DOMAIN_NAME" --agree-tos --non-interactive; then
                        print_success "SSL certificate obtained successfully"
                    else
                        print_warning "Failed to obtain SSL certificate - HTTP will still work"
                    fi
                fi
            else
                print_error "Nginx configuration test failed"
                exit 1
            fi
        else
            print_warning "nginx.conf not found, creating basic configuration"
            create_basic_nginx_config "$DOMAIN_NAME"
        fi
    else
        # Without domain - create HTTP-only config
        print_status "No DOMAIN_NAME set - creating HTTP-only configuration"
        create_basic_nginx_config "_"
    fi
fi

# Function to create basic Nginx configuration
create_basic_nginx_config() {
    local server_name=$1
    sudo tee /etc/nginx/sites-available/emaus > /dev/null << EOF
# HTTP-only configuration for $server_name
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $server_name;

    # Vue app serving
    root /var/www/emaus/apps/web/dist;
    index index.html;

    client_max_body_size 100M;

    access_log /var/log/nginx/emaus-access.log;
    error_log /var/log/nginx/emaus-error.log;

    # Vue SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API reverse proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript;
}
EOF

    sudo ln -sf /etc/nginx/sites-available/emaus /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default

    # Set file ownership
    sudo chown -R $NGINX_USER:$NGINX_USER "$APP_DIR"

    if sudo nginx -t; then
        print_success "Nginx configured (HTTP-only)"
        sudo systemctl reload nginx
    else
        print_error "Nginx configuration test failed"
        exit 1
    fi
}

# Run database migrations
echo -e "${BLUE}🗄️  Running database migrations...${NC}"
cd apps/api
if [ -f "dist/cli/migration-cli.js" ]; then
    if pnpm migration:run:prod 2>/dev/null; then
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

# Setup PM2 to start on boot
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

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
print_header "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
print_header "═══════════════════════════════════════════════════════════"
echo ""

print_header "📊 Deployment Information:"
echo "  Repository: $GITHUB_REPO"
echo "  Version: $RELEASE_TAG"
echo "  Date: $(date)"
if [ -n "$DOMAIN_NAME" ]; then
    echo "  Domain: $DOMAIN_NAME"
fi
echo ""

print_header "🌐 Application URLs:"
echo "  Local: http://localhost:$API_PORT"
if [ -n "$DOMAIN_NAME" ]; then
    echo "  Domain: https://$DOMAIN_NAME"
fi
echo ""

print_header "📝 Useful Commands:"
echo "  View logs: pm2 logs emaus-api"
echo "  View status: pm2 status"
echo "  Restart app: pm2 restart emaus-api"
echo "  Stop app: pm2 stop emaus-api"
echo ""

print_header "💾 Backup location:"
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
DOMAIN=${DOMAIN_NAME:-}
EOF

echo -e "${GREEN}🚀 Deployment complete!${NC}"
