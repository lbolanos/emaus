#!/bin/bash
# Cloud-init user data script for Emaus AWS EC2 instance
# This script runs automatically on first boot

# Output all logs to console for debugging
exec > >(tee /var/log/user-data.log|tee /var/log/user-data-error.log) 2>&1

echo "=========================================="
echo "Emaus EC2 User Data Script Starting"
echo "Date: $(date)"
echo "=========================================="

# Update system
apt-get update
apt-get upgrade -y

# Install dependencies
apt-get install -y \
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

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install pnpm and PM2
npm install -g pnpm pm2

# Configure firewall
ufw allow ssh
ufw allow 80
ufw allow 443
ufw --force enable

# Create application directory
mkdir -p /var/www/emaus
chown -R ubuntu:ubuntu /var/www/emaus

# Clone repository
cd /var/www
sudo -u ubuntu git clone https://github.com/lbolanos/emaus.git emaus

# Create log directory
mkdir -p /var/log/emaus
chown -R ubuntu:ubuntu /var/log/emaus

# Create setup completion marker
touch /var/log/emaus/user-data-complete

echo "=========================================="
echo "Emaus EC2 User Data Script Completed"
echo "Date: $(date)"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. SSH into the instance"
echo "2. Set environment variables:"
echo "   export DOMAIN_NAME=yourdomain.com"
echo "3. Run deployment:"
echo "   cd /var/www/emaus/deploy/aws"
echo "   ./deploy-aws.sh"
