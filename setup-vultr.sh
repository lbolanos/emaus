#!/bin/bash
set -e

echo "🚀 Setting up VPS for Emaus Production"

# Detect OS and set package manager
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    echo "❌ Cannot detect OS"
    exit 1
fi

echo "🖥️ Detected OS: $OS $VERSION"

# Function to install packages based on OS
install_packages() {
    case $OS in
        ubuntu|debian|pop|elementary|linuxmint)
            echo "📦 Using apt (Debian/Ubuntu family)"
            sudo apt update && sudo apt upgrade -y
            sudo apt install -y curl wget git ufw sqlite3 nginx certbot python3-certbot-nginx build-essential
            # Install Node.js 20 for Ubuntu/Debian
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        almalinux|rocky|centos|rhel|ol)
            echo "📦 Using dnf (RHEL family)"
            sudo dnf update -y
            sudo dnf install -y curl wget git firewalld sqlite nginx certbot python3-certbot-nginx
            # Install Node.js 20 for RHEL
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo dnf install -y nodejs
            ;;
        alpine)
            echo "📦 Using apk (Alpine Linux)"
            sudo apk update && sudo apk upgrade
            sudo apk add curl wget git ufw sqlite nginx certbot python3 py3-pip
            # Install Node.js 20 for Alpine
            sudo apk add nodejs npm
            ;;
        freebsd)
            echo "📦 Using pkg (FreeBSD)"
            sudo pkg update && sudo pkg upgrade -y
            sudo pkg install -y curl wget git sqlite3 nginx certbot py39-certbot-nginx
            # Install Node.js 20 for FreeBSD
            sudo pkg install -y node20 npm
            ;;
        openbsd)
            echo "📦 Using pkg_add (OpenBSD)"
            # Note: OpenBSD has limited package availability
            sudo pkg_add curl wget git sqlite3 nginx
            echo "⚠️ OpenBSD detected - some features may be limited"
            ;;
        *)
            echo "❌ Unsupported OS: $OS"
            echo "Supported OS: Ubuntu, Debian, AlmaLinux, Rocky Linux, CentOS, Alpine Linux, FreeBSD, OpenBSD"
            exit 1
            ;;
    esac
}

# Install packages based on OS
install_packages

# Install pnpm
echo "📦 Installing pnpm..."
#curl -fsSL https://get.pnpm.io/install.sh | sh -
npm install -g pnpm
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

# With SQLite, no database setup needed - data will be stored in database.sqlite file
echo "🗄️ Using SQLite - no database setup required"
echo "� Database file will be created at: /var/www/emaus/apps/api/database.sqlite"

# Configure UFW firewall
echo "🔥 Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# Create app directory
echo "📁 Creating application directories..."
sudo mkdir -p /var/www/emaus
sudo chown -R $USER:$USER /var/www/emaus

echo "✅ Basic server setup complete!"
echo "Next steps:"
echo "1. Clone your repository: git clone https://github.com/lbolanos/emaus.git /var/www/emaus"
git clone https://github.com/lbolanos/emaus.git /var/www/emaus
echo "2. Configure environment variables"
echo "3. Run deployment script"
