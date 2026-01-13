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
REPO_URL="${REPO_URL:-https://github.com/lbolanos/emaus.git}"

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

# Main script starts here
print_header "═══════════════════════════════════════════════════════════"
print_header "🚀 Setting up AWS EC2 for Emaus Production"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# Detect OS
print_status "Detecting operating system..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
    print_success "Detected: $PRETTY_NAME"
else
    print_error "Cannot detect OS"
    exit 1
fi

# Verify we're on Ubuntu 24 or compatible
if [ "$OS" != "ubuntu" ]; then
    print_warning "This script is designed for Ubuntu 24.04 LTS"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Update system
print_header "📦 Updating system packages..."
sudo apt update
sudo apt upgrade -y

print_success "System updated"

# Install dependencies
print_header "📦 Installing dependencies..."
sudo apt install -y \
    curl \
    wget \
    git \
    ufw \
    sqlite3 \
    nginx \
    certbot \
    python3-certbot-nginx \
    build-essential \
    jq

print_success "Dependencies installed"

# Install Node.js 20
print_status "Installing Node.js 20..."
if ! command_exists node; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_success "Node.js $(node --version) installed"
else
    print_success "Node.js $(node --version) already installed"
fi

# Install pnpm
print_status "Installing pnpm..."
if ! command_exists pnpm; then
    sudo npm install -g pnpm
    export PNPM_HOME="$HOME/.local/share/pnpm"
    export PATH="$PNPM_HOME:$PATH"
    print_success "pnpm $(pnpm --version) installed"
else
    print_success "pnpm $(pnpm --version) already installed"
fi

# Install PM2
print_status "Installing PM2..."
if ! command_exists pm2; then
    sudo npm install -g pm2
    print_success "PM2 $(pm2 --version | head -1) installed"
else
    print_success "PM2 already installed"
fi

# Configure firewall
print_header "🔥 Configuring UFW firewall..."
print_status "Allowing SSH..."
sudo ufw allow ssh

print_status "Allowing HTTP..."
sudo ufw allow 80

print_status "Allowing HTTPS..."
sudo ufw allow 443

print_status "Enabling firewall..."
sudo ufw --force enable

print_success "Firewall configured"

# Create app directory
print_header "📁 Creating application directories..."
sudo mkdir -p "$APP_DIR"
sudo chown -R $USER:$USER "$APP_DIR"

print_success "Application directory created: $APP_DIR"

# Clone repository
print_header "📥 Cloning repository..."
if [ -d "$APP_DIR/.git" ]; then
    print_warning "Repository already exists, pulling latest..."
    cd "$APP_DIR"
    git pull
else
    print_status "Cloning from: $REPO_URL"
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

print_success "Repository cloned/updated"

# Create log directory
print_status "Creating log directory..."
sudo mkdir -p /var/log/emaus
sudo chown -R $USER:$USER /var/log/emaus

print_success "Log directory created"

# Display setup summary
echo ""
print_header "═══════════════════════════════════════════════════════════"
print_success "Setup completed successfully!"
print_header "═══════════════════════════════════════════════════════════"
echo ""

print_header "📊 Setup Information:"
echo "  Application Directory: $APP_DIR"
echo "  Log Directory: /var/log/emaus"
echo "  Node.js: $(node --version)"
echo "  pnpm: $(pnpm --version)"
echo "  PM2: $(pm2 --version | head -1)"
echo ""

print_header "📋 Next Steps:"
echo "  1. Configure environment variables:"
echo "     export DOMAIN_NAME=yourdomain.com"
echo "     export VITE_GOOGLE_MAPS_API_KEY=your-api-key  # optional"
echo ""
echo "  2. Run deployment script:"
echo "     cd $APP_DIR/deploy/aws"
echo "     ./deploy-aws.sh"
echo ""
echo "  3. Setup SSL certificate:"
echo "     sudo certbot --nginx -d \$DOMAIN_NAME -d www.\$DOMAIN_NAME"
echo ""

print_header "🔧 Useful Commands:"
echo "  View nginx status: sudo systemctl status nginx"
echo "  View firewall: sudo ufw status"
echo "  View logs: sudo journalctl -u nginx -f"
echo ""

# Save setup info
cat > "$APP_DIR/.setup-info" << EOF
SETUP_AT=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
SETUP_BY=$USER
OS=$PRETTY_NAME
NODE_VERSION=$(node --version)
PNPM_VERSION=$(pnpm --version)
PM2_VERSION=$(pm2 --version | head -1)
REPO_URL=$REPO_URL
EOF

print_success "Setup information saved to: $APP_DIR/.setup-info"
echo ""
print_header "🎉 Server is ready for deployment!"
