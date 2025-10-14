#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/emaus"
LOG_DIR="/var/log/emaus"
BACKUP_DIR="$APP_DIR/backups"
BUILD_TIMEOUT=1800  # 30 minutes
API_PORT="${API_PORT:-3001}"
MAX_BACKUPS=5

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

# Function to check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Function to create backup
create_backup() {
    print_status "Creating backup of current deployment..."
    
    mkdir -p "$BACKUP_DIR"
    local backup_name="backup-$(date +%Y%m%d-%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    mkdir -p "$backup_path"
    
    # Backup dist directories if they exist
    if [ -d "$APP_DIR/apps/web/dist" ]; then
        cp -r "$APP_DIR/apps/web/dist" "$backup_path/web-dist"
    fi
    
    if [ -d "$APP_DIR/apps/api/dist" ]; then
        cp -r "$APP_DIR/apps/api/dist" "$backup_path/api-dist"
    fi
    
    # Backup ecosystem config if it exists
    if [ -f "$APP_DIR/ecosystem.config.js" ]; then
        cp "$APP_DIR/ecosystem.config.js" "$backup_path/"
    fi
    
    # Save git commit hash
    if [ -d "$APP_DIR/.git" ]; then
        git -C "$APP_DIR" rev-parse HEAD > "$backup_path/git-commit.txt"
    fi
    
    print_success "Backup created: $backup_path"
    echo "$backup_path" > /tmp/emaus-last-backup
    
    # Keep only last N backups
    cd "$BACKUP_DIR"
    ls -t | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -rf
    cd "$APP_DIR"
}

# Function to rollback
rollback() {
    print_warning "Rolling back to previous version..."
    
    if [ -f "/tmp/emaus-last-backup" ]; then
        local backup_path=$(cat /tmp/emaus-last-backup)
        
        if [ -d "$backup_path" ]; then
            # Restore from backup
            if [ -d "$backup_path/web-dist" ]; then
                rm -rf "$APP_DIR/apps/web/dist"
                cp -r "$backup_path/web-dist" "$APP_DIR/apps/web/dist"
            fi
            
            if [ -d "$backup_path/api-dist" ]; then
                rm -rf "$APP_DIR/apps/api/dist"
                cp -r "$backup_path/api-dist" "$APP_DIR/apps/api/dist"
            fi
            
            if [ -f "$backup_path/ecosystem.config.js" ]; then
                cp "$backup_path/ecosystem.config.js" "$APP_DIR/"
            fi
            
            # Restart services
            pm2 restart ecosystem.config.js 2>/dev/null || true
            
            print_success "Rollback completed"
            return 0
        fi
    fi
    
    print_error "No backup found for rollback"
    return 1
}

# Trap errors and handle rollback
handle_error() {
    local line_no=$1
    print_error "Deployment failed at line $line_no!"
    
    read -p "Attempt rollback? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        rollback
    fi
}

trap 'handle_error $LINENO' ERR

# Main script starts here
print_header "═══════════════════════════════════════════════════════════"
print_header "🚀 Deploying Emaus to VPS"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# Check required environment variables
MISSING_VARS=""
if [ -z "$domain_name" ]; then 
    MISSING_VARS="$MISSING_VARS domain_name"
fi

if [ -n "$MISSING_VARS" ]; then
    print_warning "Missing environment variables:$MISSING_VARS"
    echo ""
    echo "Usage:"
    echo "  export domain_name=your-domain.com"
    echo "  export VITE_GOOGLE_MAPS_API_KEY=your-api-key  # optional"
    echo "  $0"
    echo ""
    read -p "Enter domain name: " domain_name
    
    if [ -z "$domain_name" ]; then
        print_error "Domain name is required"
        exit 1
    fi
fi

print_header "Configuration:"
echo "  Domain: $domain_name"
echo "  App Directory: $APP_DIR"
echo "  Log Directory: $LOG_DIR"
echo ""

# Check if we're in the app directory
if [ ! -d "$APP_DIR" ]; then
    print_error "App directory not found: $APP_DIR"
    echo "Please run the setup script first or create the directory."
    exit 1
fi

cd "$APP_DIR"

# Verify git repository
if [ ! -d ".git" ]; then
    print_error "Not a git repository"
    echo "Please initialize with: git init && git remote add origin <repo-url>"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    print_warning "You have uncommitted changes"
    #git status --short
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create backup before deployment
#create_backup

# Check current branch
current_branch=$(git branch --show-current)
print_status "Current branch: $current_branch"

# Pull the latest code from the repository
print_header "🔄 Pulling latest code from git..."
#git fetch origin

# Show what will be pulled
CURRENT_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/$current_branch)

if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
    print_success "Already up to date"
else
    print_status "Changes to be pulled:"
    git log --oneline $CURRENT_COMMIT..$REMOTE_COMMIT | head -5
    echo ""
fi

#git pull origin "$current_branch"
print_success "Code updated successfully"

# Install/update pnpm
print_status "Setting up pnpm..."
#if ! command_exists pnpm; then
#    curl -fsSL https://get.pnpm.io/install.sh | sh -
#fi

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Verify pnpm installation
if ! command_exists pnpm; then
    print_error "pnpm installation failed"
    exit 1
fi

print_success "pnpm ready: $(pnpm --version)"

# Install dependencies
print_header "📦 Installing dependencies..."
print_status "This may take a few minutes..."

#if pnpm install --frozen-lockfile --reporter=append-only; then
#    print_success "Dependencies installed"
#else
#    print_error "Dependency installation failed"
#    exit 1
#fi

# Create production environment files
print_header "📝 Creating production environment files..."

# Web app .env.production
mkdir -p apps/web
cat > apps/web/.env.production << EOF
VITE_API_URL=https://${domain_name}/api
VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY:-}
EOF
print_success "Web app .env.production created"

# API .env.production (if needed)
if [ -f "apps/api/.env.example" ] && [ ! -f "apps/api/.env.production" ]; then
    print_warning "API .env.production not found"
    echo "Create apps/api/.env.production with your production settings"
fi

# Build the application with sufficient memory
print_header "🔨 Building application..."
print_status "This may take several minutes..."

export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=4096"

#if timeout $BUILD_TIMEOUT pnpm build; then
#    print_success "Build completed successfully"
#else
#    EXIT_CODE=$?
#    if [ $EXIT_CODE -eq 124 ]; then
#        print_error "Build timed out after $((BUILD_TIMEOUT / 60)) minutes"
#    else
#        print_error "Build failed with exit code $EXIT_CODE"
#    fi
#    exit 1
#fi

unset NODE_OPTIONS

# Verify build output
print_status "Verifying build output..."

if [ ! -d "apps/api/dist" ] || [ ! -f "apps/api/dist/index.js" ]; then
    print_error "API build failed - dist/index.js not found"
    exit 1
fi

if [ ! -d "apps/web/dist" ] || [ ! -f "apps/web/dist/index.html" ]; then
    print_error "Web build failed - dist/index.html not found"
    exit 1
fi

print_success "Build verification passed"

# Detect Nginx user
print_status "Detecting Nginx configuration..."
if [ -f /etc/redhat-release ] || [ -f /etc/centos-release ]; then
    NGINX_USER="nginx"
    OS_TYPE="rhel"
elif [ -f /etc/debian_version ]; then
    NGINX_USER="www-data"
    OS_TYPE="debian"
else
    NGINX_USER="www-data"
    OS_TYPE="unknown"
    print_warning "Unknown OS, defaulting to www-data"
fi

print_success "OS Type: $OS_TYPE, Nginx User: $NGINX_USER"

# Set correct ownership and permissions
print_header "🔐 Setting file ownership and permissions..."

sudo chown -R $NGINX_USER:$NGINX_USER "$APP_DIR"
sudo find "$APP_DIR" -type d -exec chmod 755 {} \;
sudo find "$APP_DIR" -type f -exec chmod 644 {} \;

# Make scripts executable
sudo find "$APP_DIR" -type f -name "*.sh" -exec chmod 755 {} \;

print_success "Permissions configured"

# Install PM2 globally if not installed
if ! command_exists pm2; then
    print_status "Installing PM2..."
    npm install -g pm2
    print_success "PM2 installed"
fi

# Create log directory
sudo mkdir -p "$LOG_DIR"
sudo chown -R $NGINX_USER:$NGINX_USER "$LOG_DIR"

# Create ecosystem file for PM2
print_status "Creating PM2 ecosystem configuration..."

cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'emaus-api',
    script: 'dist/index.js',
    cwd: '$APP_DIR/apps/api',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: $API_PORT
    },
    error_log: '$LOG_DIR/api-error.log',
    out_log: '$LOG_DIR/api-out.log',
    combine_logs: true,
    time: true,
    max_memory_restart: '500M',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    autorestart: true,
    watch: false
  }]
}
EOF

print_success "PM2 configuration created"

# Configure Nginx
print_header "🌐 Configuring Nginx..."

if [ ! -f "nginx.conf" ]; then
    print_error "nginx.conf not found in project directory"
    exit 1
fi

# Create Nginx config with domain substitution
sed "s/\$domain_name/$domain_name/g" nginx.conf > /tmp/emaus-nginx.conf

# Backup existing nginx config if it exists
if [ -f "/etc/nginx/sites-available/emaus" ]; then
    sudo cp /etc/nginx/sites-available/emaus /etc/nginx/sites-available/emaus.backup.$(date +%Y%m%d-%H%M%S)
fi

sudo cp /tmp/emaus-nginx.conf /etc/nginx/sites-available/emaus
sudo ln -sf /etc/nginx/sites-available/emaus /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
rm /tmp/emaus-nginx.conf

# Test nginx config
print_status "Testing Nginx configuration..."
if sudo nginx -t; then
    print_success "Nginx configuration is valid"
else
    print_error "Nginx configuration test failed"
    exit 1
fi

# Reload nginx
print_status "Reloading Nginx..."
sudo systemctl reload nginx
print_success "Nginx reloaded"

# Stop existing PM2 processes
print_header "🔄 Managing PM2 processes..."
pm2 delete emaus-api 2>/dev/null || true

# Start application with PM2
print_status "Starting application with PM2..."
pm2 start ecosystem.config.js
pm2 save

# Setup PM2 to start on boot
if ! systemctl is-enabled pm2-$USER &>/dev/null; then
    print_status "Setting up PM2 startup..."
    pm2 startup systemd -u $USER --hp $HOME
fi

print_success "Application started"

# Wait for application to be ready
print_status "Waiting for application to start..."
sleep 5

# Health check
print_status "Performing health check..."
HEALTH_CHECK_PASSED=false

for i in {1..10}; do
    if curl -f -s "http://localhost:$API_PORT/health" > /dev/null 2>&1 || \
       curl -f -s "http://localhost:$API_PORT/" > /dev/null 2>&1; then
        HEALTH_CHECK_PASSED=true
        break
    fi
    sleep 2
done

if [ "$HEALTH_CHECK_PASSED" = true ]; then
    print_success "Health check passed"
else
    print_warning "Health check failed - application may not be responding"
    echo "Check logs with: pm2 logs emaus-api"
fi

# Setup log rotation
print_header "🔄 Configuring log rotation..."

sudo tee /etc/logrotate.d/emaus > /dev/null << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $NGINX_USER $NGINX_USER
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

print_success "Log rotation configured"

# Display deployment summary
echo ""
print_header "═══════════════════════════════════════════════════════════"
print_success "Deployment completed successfully!"
print_header "═══════════════════════════════════════════════════════════"
echo ""

print_header "📊 Deployment Information:"
echo "  Domain: $domain_name"
echo "  Application Directory: $APP_DIR"
echo "  Log Directory: $LOG_DIR"
echo "  Git Commit: $(git rev-parse --short HEAD)"
echo "  Deployed: $(date)"
echo ""

print_header "🌐 Access URLs:"
echo "  Application: https://$domain_name"
echo "  API (direct): http://localhost:$API_PORT"
echo ""

print_header "🔒 SSL Certificate Setup:"
if command_exists certbot; then
    if [ -d "/etc/letsencrypt/live/$domain_name" ]; then
        print_success "SSL certificate already exists"
        sudo certbot renew --dry-run
    else
        print_warning "SSL certificate not configured"
        echo "Run: sudo certbot --nginx -d $domain_name -d www.$domain_name"
    fi
else
    print_warning "Certbot not installed"
    echo "Install: sudo apt install certbot python3-certbot-nginx  # Debian/Ubuntu"
    echo "         sudo dnf install certbot python3-certbot-nginx  # RHEL/AlmaLinux"
fi
echo ""

print_header "📝 Useful Commands:"
echo "  View status:     pm2 status"
echo "  View logs:       pm2 logs emaus-api"
echo "  Restart:         pm2 restart emaus-api"
echo "  Stop:            pm2 stop emaus-api"
echo "  Nginx logs:      sudo tail -f /var/log/nginx/error.log"
echo "  App logs:        sudo tail -f $LOG_DIR/api-error.log"
echo ""

# Save deployment info
cat > "$APP_DIR/.deployment-info" << EOF
DEPLOYED_AT=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
DEPLOYED_BY=$USER
GIT_COMMIT=$(git rev-parse HEAD)
GIT_BRANCH=$(git branch --show-current)
DOMAIN=$domain_name
NODE_VERSION=$(node --version)
PNPM_VERSION=$(pnpm --version)
EOF

print_success "Deployment information saved to .deployment-info"
echo ""
print_header "🎉 Your application is now live!"