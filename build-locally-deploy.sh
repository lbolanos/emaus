#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/var/www/emaus"
DEPLOY_SUBDIR="deploy"
MAX_DEPLOY_KEEP=3
SSH_PORT="${VPS_SSH_PORT:-22}"
VPS_USER="${VPS_USER:root}"
RSYNC_OPTS="-avz --delete --progress"
BUILD_TIMEOUT=1800  # 30 minutes
API_PORT="${API_PORT:-3001}"

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

# Function to cleanup on exit
cleanup() {
    if [ -n "$DEPLOY_DIR" ] && [ -d "$DEPLOY_DIR" ]; then
        print_status "Cleaning up temporary files..."
        rm -rf "$DEPLOY_DIR"
    fi
}

trap cleanup EXIT

# Function to check SSH connection
check_ssh_connection() {
    local host=$1
    local user=$2
    local port=$3
    
    print_status "Testing SSH connection to $user@$host:$port..."
    
    if ssh -p "$port" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$user@$host" "exit" &>/dev/null; then
        print_success "SSH connection successful"
        return 0
    else
        print_error "Cannot connect to $user@$host:$port"
        echo ""
        echo "Troubleshooting steps:"
        echo "  1. Verify the hostname/IP: ping $host"
        echo "  2. Check SSH port (default: 22): telnet $host $port"
        echo "  3. Verify SSH key is set up: ssh-copy-id -p $port $user@$host"
        echo "  4. Try manual connection: ssh -p $port $user@$host"
        return 1
    fi
}

# Function to check VPS prerequisites
check_vps_prerequisites() {
    local host=$1
    local user=$2
    local port=$3
    
    print_status "Checking VPS prerequisites..."
    
    ssh -p "$port" -o StrictHostKeyChecking=no "$user@$host" bash << 'PREREQ_EOF'
        set -e
        
        # Check if app directory exists
        if [ ! -d "/var/www/emaus" ]; then
            echo "ERROR: Application directory /var/www/emaus not found"
            echo "Please run the initial setup script first"
            exit 1
        fi
        
        # Check for required commands
        MISSING=""
        for cmd in node pnpm pm2; do
            if ! command -v $cmd &> /dev/null; then
                MISSING="$MISSING $cmd"
            fi
        done
        
        if [ -n "$MISSING" ]; then
            echo "ERROR: Missing required commands:$MISSING"
            echo "Please install them first"
            exit 1
        fi
        
        # Check disk space (need at least 1GB free)
        FREE_SPACE=$(df /var/www | tail -1 | awk '{print $4}')
        if [ "$FREE_SPACE" -lt 1048576 ]; then
            echo "WARNING: Low disk space (less than 1GB free)"
        fi
        
        echo "Prerequisites OK"
PREREQ_EOF
    
    if [ $? -eq 0 ]; then
        print_success "VPS prerequisites verified"
        return 0
    else
        print_error "VPS prerequisites check failed"
        return 1
    fi
}

# Function to get project info
get_project_info() {
    if [ -f "package.json" ]; then
        local name=$(node -p "require('./package.json').name" 2>/dev/null || echo "emaus")
        local version=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
        echo "$name@$version"
    else
        echo "unknown"
    fi
}

# Function to estimate build time
estimate_build_time() {
    print_status "Estimating build time based on project size..."
    
    local total_size=$(du -sh . 2>/dev/null | cut -f1)
    local node_modules_size=$(du -sh node_modules 2>/dev/null | cut -f1 || echo "0")
    
    echo "  Project size: $total_size"
    echo "  Node modules: $node_modules_size"
    echo "  Estimated time: 3-10 minutes (depending on system)"
}

# Main script starts here
print_header "═══════════════════════════════════════════════════════════"
print_header "🏠 Local Build & VPS Deployment Script"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    print_error "Run this script from the project root directory"
    echo "Current directory: $(pwd)"
    exit 1
fi

PROJECT_INFO=$(get_project_info)
print_success "Project: $PROJECT_INFO"
echo ""

# Check for required environment variables
MISSING_VARS=""
if [ -z "$VPS_HOST" ]; then MISSING_VARS="$MISSING_VARS VPS_HOST"; fi
if [ -z "$VPS_USER" ]; then MISSING_VARS="$MISSING_VARS VPS_USER"; fi

if [ -n "$MISSING_VARS" ]; then
    print_error "Missing required environment variables:$MISSING_VARS"
    echo ""
    echo "Usage:"
    echo "  export VPS_HOST=your-server-ip"
    echo "  export VPS_USER=root"
    echo "  export VPS_SSH_PORT=22  # optional, defaults to 22"
    echo "  $0"
    echo ""
    echo "Or in one line:"
    echo "  VPS_HOST=1.2.3.4 VPS_USER=root $0"
    exit 1
fi

print_header "Configuration:"
echo "  VPS Host: $VPS_HOST"
echo "  VPS User: $VPS_USER"
echo "  SSH Port: $SSH_PORT"
echo "  App Directory: $APP_DIR"
echo ""

# Check for required local tools
print_status "Checking local prerequisites..."

MISSING_TOOLS=""
for tool in node pnpm rsync ssh; do
    if ! command_exists "$tool"; then
        MISSING_TOOLS="$MISSING_TOOLS $tool"
    fi
done

if [ -n "$MISSING_TOOLS" ]; then
    print_error "Missing required tools:$MISSING_TOOLS"
    echo ""
    echo "Install missing tools:"
    if [[ "$MISSING_TOOLS" =~ "pnpm" ]]; then
        echo "  npm install -g pnpm"
    fi
    if [[ "$MISSING_TOOLS" =~ "rsync" ]]; then
        echo "  sudo apt install rsync  # Ubuntu/Debian"
        echo "  brew install rsync      # macOS"
    fi
    exit 1
fi

print_success "Local prerequisites OK"

# Test SSH connection
if ! check_ssh_connection "$VPS_HOST" "$VPS_USER" "$SSH_PORT"; then
    exit 1
fi

# Check VPS prerequisites
if ! check_vps_prerequisites "$VPS_HOST" "$VPS_USER" "$SSH_PORT"; then
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Show project info and estimate
estimate_build_time
echo ""

# Confirm deployment
read -p "Proceed with build and deployment? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    print_warning "Deployment cancelled"
    exit 0
fi

# Create deployment directory
DEPLOY_DIR="deploy_$(date +%Y%m%d_%H%M%S)"
print_status "Creating deployment directory: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    pnpm install --frozen-lockfile
fi

# Build the project
print_header "🔨 Building project locally..."
echo "This may take several minutes..."
echo ""

# Set build environment
export NODE_ENV=production
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

# Build with timeout and progress
print_status "Running: pnpm build"
if timeout $BUILD_TIMEOUT pnpm build; then
    print_success "Build completed successfully"
else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ]; then
        print_error "Build timed out after $((BUILD_TIMEOUT / 60)) minutes"
    else
        print_error "Build failed with exit code $EXIT_CODE"
    fi
    exit 1
fi

# Verify build output
print_status "Verifying build output..."

if [ ! -d "apps/api/dist" ]; then
    print_error "API build output not found: apps/api/dist"
    exit 1
fi

if [ ! -d "apps/web/dist" ]; then
    print_error "Web build output not found: apps/web/dist"
    exit 1
fi

if [ ! -f "apps/api/dist/index.js" ]; then
    print_error "API entry point not found: apps/api/dist/index.js"
    exit 1
fi

print_success "Build verification passed"

# Create deployment package
print_header "📦 Creating deployment package..."

# Copy built assets
print_status "Copying API build..."
cp -r apps/api/dist "$DEPLOY_DIR/api-dist"

print_status "Copying Web build..."
cp -r apps/web/dist "$DEPLOY_DIR/web-dist"

# Copy required runtime files
print_status "Copying configuration files..."
cp package.json "$DEPLOY_DIR/"
cp pnpm-lock.yaml "$DEPLOY_DIR/" 2>/dev/null || print_warning "pnpm-lock.yaml not found"
cp pnpm-workspace.yaml "$DEPLOY_DIR/" 2>/dev/null || true

# Copy fix-imports script if it exists
if [ -f "apps/api/fix-imports.cjs" ]; then
    cp apps/api/fix-imports.cjs "$DEPLOY_DIR/"
    print_success "Copied fix-imports script"
fi

# Copy package.json files
if [ -f "apps/api/package.json" ]; then
    cp apps/api/package.json "$DEPLOY_DIR/api-package.json"
fi

if [ -f "apps/web/package.json" ]; then
    cp apps/web/package.json "$DEPLOY_DIR/web-package.json"
fi

# Copy environment files if they exist
if [ -f "apps/api/.env.production" ]; then
    cp apps/api/.env.production "$DEPLOY_DIR/"
    print_success "Copied .env.api.production"
fi

if [ -f "apps/web/.env.production" ]; then
    cp apps/web/.env.production "$DEPLOY_DIR/"
    print_success "Copied .env.web.production"
fi

# Copy migration files if they exist
if [ -d "apps/api/prisma" ]; then
    mkdir -p "$DEPLOY_DIR/prisma"
    cp -r apps/api/prisma/* "$DEPLOY_DIR/prisma/"
    print_success "Copied Prisma files"
fi

# Create deployment metadata
cat > "$DEPLOY_DIR/deployment-info.json" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "project": "$PROJECT_INFO",
  "built_by": "$USER@$(hostname)",
  "node_version": "$(node --version)",
  "pnpm_version": "$(pnpm --version)",
  "target_host": "$VPS_HOST"
}
EOF

# Calculate package size
PACKAGE_SIZE=$(du -sh "$DEPLOY_DIR" | cut -f1)
print_success "Deployment package created: $PACKAGE_SIZE"

# Show package contents
echo ""
print_header "📋 Package contents:"
tree -L 2 "$DEPLOY_DIR" 2>/dev/null || ls -lh "$DEPLOY_DIR"
echo ""

# Deploy to VPS
print_header "🚀 Deploying to VPS: $VPS_USER@$VPS_HOST"
echo ""

# Create remote directory if it doesn't exist
ssh -p "$SSH_PORT" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" \
    "mkdir -p $APP_DIR/$DEPLOY_SUBDIR"

# Sync files to VPS
print_status "Syncing files to VPS..."
if rsync $RSYNC_OPTS -e "ssh -p $SSH_PORT -o StrictHostKeyChecking=no" \
    "$DEPLOY_DIR/" \
    "$VPS_USER@$VPS_HOST:$APP_DIR/$DEPLOY_SUBDIR/"; then
    print_success "Files synced successfully"
else
    print_error "File sync failed"
    exit 1
fi

# Run deployment script on VPS
print_header "⚙️  Running deployment on VPS..."
echo ""

ssh -p "$SSH_PORT" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" bash << 'VPS_EOF'
set -e

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}📦 Setting up deployment on VPS...${NC}"

cd /var/www/emaus

# Backup current deployment
if [ -d "apps/api/dist" ]; then
    BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "backups/$BACKUP_DIR"
    echo -e "${BLUE}💾 Creating backup: $BACKUP_DIR${NC}"
    cp -r apps/api/dist "backups/$BACKUP_DIR/api-dist" 2>/dev/null || true
    cp -r apps/web/dist "backups/$BACKUP_DIR/web-dist" 2>/dev/null || true
    
    # Keep only last 3 backups
    cd backups
    ls -t | tail -n +4 | xargs -r rm -rf
    cd ..
fi

# Deploy API
echo -e "${BLUE}🔨 Deploying API...${NC}"
rm -rf apps/api/dist
mkdir -p apps/api
cp -r deploy/api-dist apps/api/dist

if [ -f "deploy/api-package.json" ]; then
    cp deploy/api-package.json apps/api/package.json
fi

# Deploy Web
echo -e "${BLUE}🔨 Deploying Web app...${NC}"
rm -rf apps/web/dist
mkdir -p apps/web
cp -r deploy/web-dist apps/web/dist

if [ -f "deploy/web-package.json" ]; then
    cp deploy/web-package.json apps/web/package.json
fi

# Copy Prisma files if they exist
if [ -d "deploy/prisma" ]; then
    echo -e "${BLUE}📋 Copying Prisma files...${NC}"
    mkdir -p apps/api/prisma
    cp -r deploy/prisma/* apps/api/prisma/
fi

# Copy environment files
if [ -f "deploy/.env.api.production" ]; then
    cp deploy/.env.api.production apps/api/.env
fi
if [ -f "deploy/.env.web.production" ]; then
    cp deploy/.env.web.production apps/web/.env
fi


# Install production dependencies
echo -e "${BLUE}📦 Installing production dependencies...${NC}"
export NODE_OPTIONS="--max-old-space-size=512"
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

pnpm install --frozen-lockfile --prod --reporter=append-only

# Fix import paths for ES modules
if [ -f "deploy/fix-imports.cjs" ]; then
    echo -e "${BLUE}🔧 Fixing ES module import paths...${NC}"
    cp deploy/fix-imports.cjs apps/api/
    cd apps/api
    node fix-imports.cjs
    rm fix-imports.cjs
    cd ../..
    echo -e "${GREEN}✅ Import paths fixed${NC}"
fi

# Run database migrations
if [ -d "apps/api/prisma" ]; then
    echo -e "${BLUE}🗄️  Running database migrations...${NC}"
    cd apps/api
    pnpm prisma migrate deploy || echo -e "${YELLOW}⚠️  No migrations to run${NC}"
    cd ../..
fi

# Restart PM2 process
echo -e "${BLUE}🔄 Restarting application...${NC}"
if pm2 describe emaus-api &>/dev/null; then
    pm2 restart emaus-api
    pm2 save
else
    echo -e "${YELLOW}⚠️  PM2 process not found. Starting new instance...${NC}"
    pm2 start apps/api/dist/index.js --name emaus-api
    pm2 save
fi

# Wait for app to be ready
echo -e "${BLUE}⏳ Waiting for application to start...${NC}"
sleep 5

# Health check
if curl -f -s http://localhost:3001/health > /dev/null 2>&1 || \
   curl -f -s http://localhost:3001/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Application is running${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify application status${NC}"
    echo "Check logs with: pm2 logs emaus-api"
fi

# Show PM2 status
pm2 list

echo -e "${GREEN}✅ Deployment completed on VPS${NC}"
VPS_EOF

if [ $? -eq 0 ]; then
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    print_success "Deployment completed successfully!"
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    print_header "🌐 Access your application:"
    echo "  http://$VPS_HOST"
    echo "  http://$VPS_HOST:$API_PORT  (API directly)"
    echo ""
    print_header "📊 Check application status:"
    echo "  ssh -p $SSH_PORT $VPS_USER@$VPS_HOST 'pm2 status'"
    echo "  ssh -p $SSH_PORT $VPS_USER@$VPS_HOST 'pm2 logs emaus-api'"
    echo ""
    print_header "🔄 Manage application:"
    echo "  Restart: ssh -p $SSH_PORT $VPS_USER@$VPS_HOST 'pm2 restart emaus-api'"
    echo "  Stop:    ssh -p $SSH_PORT $VPS_USER@$VPS_HOST 'pm2 stop emaus-api'"
    echo "  Logs:    ssh -p $SSH_PORT $VPS_USER@$VPS_HOST 'pm2 logs emaus-api --lines 50'"
    echo ""
else
    print_error "Deployment failed on VPS"
    echo ""
    echo "Check VPS logs:"
    echo "  ssh -p $SSH_PORT $VPS_USER@$VPS_HOST 'pm2 logs emaus-api --lines 50'"
    exit 1
fi