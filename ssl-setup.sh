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
NGINX_CONF="/etc/nginx/sites-available/emaus"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
CERT_RENEWAL_CRON="0 0,12 * * * certbot renew --quiet --deploy-hook 'systemctl reload nginx'"

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

# Function to detect OS and install certbot
install_certbot() {
    print_status "Installing Certbot..."
    
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        print_status "Detected Debian/Ubuntu system"
        sudo apt-get update
        sudo apt-get install -y certbot python3-certbot-nginx
        
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS/AlmaLinux/Rocky
        print_status "Detected RHEL-based system"
        
        # Enable EPEL if needed
        if ! rpm -q epel-release &>/dev/null; then
            sudo dnf install -y epel-release
        fi
        
        sudo dnf install -y certbot python3-certbot-nginx
        
    else
        print_error "Unsupported operating system"
        echo "Please install certbot manually:"
        echo "  https://certbot.eff.org/instructions"
        exit 1
    fi
    
    if command_exists certbot; then
        print_success "Certbot installed successfully"
    else
        print_error "Certbot installation failed"
        exit 1
    fi
}

# Function to validate domain name
validate_domain() {
    local domain=$1
    
    # Basic domain name validation
    if [[ ! $domain =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$ ]]; then
        print_error "Invalid domain name format: $domain"
        return 1
    fi
    
    return 0
}

# Function to check DNS configuration
check_dns() {
    local domain=$1
    local server_ip=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "unknown")
    
    print_status "Checking DNS configuration for $domain..."
    echo "  Server IP: $server_ip"
    
    # Check A record
    local dns_ip=$(dig +short "$domain" | tail -n1)
    
    if [ -z "$dns_ip" ]; then
        print_warning "No DNS record found for $domain"
        echo "  Please ensure:"
        echo "  1. Domain DNS is configured"
        echo "  2. A record points to: $server_ip"
        echo "  3. DNS has propagated (may take up to 48 hours)"
        return 1
    fi
    
    echo "  Domain resolves to: $dns_ip"
    
    if [ "$dns_ip" = "$server_ip" ]; then
        print_success "DNS is correctly configured"
        return 0
    else
        print_warning "DNS mismatch!"
        echo "  Expected: $server_ip"
        echo "  Got: $dns_ip"
        echo ""
        echo "  This may cause SSL certificate verification to fail."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return 1
        fi
    fi
    
    return 0
}

# Function to check if certificate already exists
check_existing_cert() {
    local domain=$1
    
    if [ -d "/etc/letsencrypt/live/$domain" ]; then
        print_warning "SSL certificate already exists for $domain"
        
        # Show certificate info
        sudo certbot certificates -d "$domain" 2>/dev/null || true
        
        echo ""
        read -p "Renew existing certificate? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            return 1  # Proceed with renewal
        else
            return 0  # Skip
        fi
    fi
    
    return 1  # No existing cert, proceed
}

# Function to verify port 80 and 443 are open
check_ports() {
    print_status "Checking required ports..."
    
    # Check if port 80 is listening
    if sudo netstat -tuln 2>/dev/null | grep -q ":80 " || \
       sudo ss -tuln 2>/dev/null | grep -q ":80 "; then
        print_success "Port 80 is open"
    else
        print_warning "Port 80 is not listening"
        echo "  Nginx may need to be started"
    fi
    
    # Check if port 443 is listening
    if sudo netstat -tuln 2>/dev/null | grep -q ":443 " || \
       sudo ss -tuln 2>/dev/null | grep -q ":443 "; then
        print_success "Port 443 is open"
    else
        print_warning "Port 443 is not listening (will be opened after SSL setup)"
    fi
    
    # Check firewall
    if command_exists ufw && sudo ufw status | grep -q "Status: active"; then
        print_status "Checking UFW firewall..."
        if ! sudo ufw status | grep -q "80.*ALLOW"; then
            print_warning "Port 80 not allowed in UFW"
            read -p "Allow port 80 and 443 in firewall? (Y/n): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                sudo ufw allow 80/tcp
                sudo ufw allow 443/tcp
                print_success "Firewall rules updated"
            fi
        fi
    elif command_exists firewall-cmd && sudo firewall-cmd --state &>/dev/null; then
        print_status "Checking firewalld..."
        if ! sudo firewall-cmd --list-ports | grep -q "80/tcp"; then
            print_warning "Port 80 not allowed in firewalld"
            read -p "Allow port 80 and 443 in firewall? (Y/n): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                sudo firewall-cmd --permanent --add-service=http
                sudo firewall-cmd --permanent --add-service=https
                sudo firewall-cmd --reload
                print_success "Firewall rules updated"
            fi
        fi
    fi
}

# Function to backup nginx config
backup_nginx_config() {
    if [ -f "$NGINX_CONF" ]; then
        local backup_file="${NGINX_CONF}.backup.$(date +%Y%m%d-%H%M%S)"
        sudo cp "$NGINX_CONF" "$backup_file"
        print_success "Nginx config backed up to: $backup_file"
    fi
}

# Function to setup SSL with nginx plugin
setup_ssl_nginx_plugin() {
    local domain=$1
    local www_domain="www.$domain"
    
    print_status "Using Certbot Nginx plugin (recommended)..."
    
    local certbot_cmd="sudo certbot --nginx"
    certbot_cmd="$certbot_cmd -d $domain -d $www_domain"
    
    if [ -n "$CERTBOT_EMAIL" ]; then
        certbot_cmd="$certbot_cmd --email $CERTBOT_EMAIL"
    fi
    
    certbot_cmd="$certbot_cmd --agree-tos --redirect --non-interactive"
    
    print_status "Running: $certbot_cmd"
    
    if eval "$certbot_cmd"; then
        print_success "SSL certificate obtained and configured"
        return 0
    else
        print_error "Certbot nginx plugin failed"
        return 1
    fi
}

# Function to setup SSL with standalone mode
setup_ssl_standalone() {
    local domain=$1
    local www_domain="www.$domain"
    
    print_warning "Using standalone mode (requires stopping Nginx temporarily)"
    
    # Check if nginx is running
    if sudo systemctl is-active --quiet nginx; then
        print_status "Stopping Nginx temporarily..."
        sudo systemctl stop nginx
        NGINX_WAS_RUNNING=true
    else
        NGINX_WAS_RUNNING=false
    fi
    
    # Get certificate
    local certbot_cmd="sudo certbot certonly --standalone"
    certbot_cmd="$certbot_cmd -d $domain -d $www_domain"
    
    if [ -n "$CERTBOT_EMAIL" ]; then
        certbot_cmd="$certbot_cmd --email $CERTBOT_EMAIL"
    fi
    
    certbot_cmd="$certbot_cmd --agree-tos --non-interactive"
    
    print_status "Running: $certbot_cmd"
    
    if eval "$certbot_cmd"; then
        print_success "SSL certificate obtained"
        
        # Update nginx config to use SSL
        if [ -f "$NGINX_CONF" ]; then
            print_status "Updating Nginx configuration for SSL..."
            
            # Check if SSL is already configured
            if ! sudo grep -q "ssl_certificate" "$NGINX_CONF"; then
                print_warning "Manual SSL configuration needed in: $NGINX_CONF"
                echo "Add these lines to your server block:"
                echo "  listen 443 ssl http2;"
                echo "  listen [::]:443 ssl http2;"
                echo "  ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;"
                echo "  ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;"
                echo "  ssl_protocols TLSv1.2 TLSv1.3;"
                echo "  ssl_ciphers HIGH:!aNULL:!MD5;"
            fi
        fi
        
        # Start nginx
        if [ "$NGINX_WAS_RUNNING" = true ]; then
            print_status "Starting Nginx..."
            sudo systemctl start nginx
        fi
        
        return 0
    else
        print_error "Certificate acquisition failed"
        
        # Restore nginx if it was running
        if [ "$NGINX_WAS_RUNNING" = true ]; then
            sudo systemctl start nginx
        fi
        
        return 1
    fi
}

# Function to setup auto-renewal
setup_auto_renewal() {
    print_header "🔄 Setting up automatic SSL renewal..."
    
    # Create renewal hook directory
    sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    
    # Create renewal hook script
    cat << 'EOF' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh > /dev/null
#!/bin/bash
systemctl reload nginx
logger "SSL certificate renewed and Nginx reloaded"
EOF
    
    sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh
    print_success "Renewal hook created"
    
    # Setup systemd timer (preferred) or cron
    if systemctl list-timers certbot.timer &>/dev/null | grep -q certbot.timer; then
        print_status "Certbot systemd timer already configured"
        sudo systemctl enable certbot.timer
        sudo systemctl start certbot.timer
        print_success "Certbot timer enabled"
    else
        # Setup cron job
        print_status "Setting up cron job for renewal..."
        
        if ! sudo crontab -l 2>/dev/null | grep -q "certbot renew"; then
            (sudo crontab -l 2>/dev/null; echo "$CERT_RENEWAL_CRON") | sudo crontab -
            print_success "Cron job added for automatic renewal"
        else
            print_success "Cron job already exists"
        fi
    fi
    
    # Test renewal
    print_status "Testing renewal process..."
    if sudo certbot renew --dry-run; then
        print_success "Renewal test passed"
    else
        print_warning "Renewal test failed - check configuration"
    fi
}

# Function to verify SSL installation
verify_ssl() {
    local domain=$1
    
    print_header "🔍 Verifying SSL installation..."
    
    # Wait for nginx to fully reload
    sleep 2
    
    # Test HTTPS connection
    if curl -I -s -f -o /dev/null "https://$domain"; then
        print_success "HTTPS is working"
    else
        print_warning "Could not verify HTTPS connection"
        echo "  This may be normal if DNS hasn't propagated yet"
    fi
    
    # Check SSL certificate with openssl
    if command_exists openssl; then
        print_status "Checking certificate details..."
        echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | \
            openssl x509 -noout -dates 2>/dev/null || \
            print_warning "Could not retrieve certificate details"
    fi
}

# Main script starts here
print_header "═══════════════════════════════════════════════════════════"
print_header "🔒 SSL Setup with Let's Encrypt"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# Check domain parameter
if [ -z "$domain_name" ]; then
    print_error "Domain name not provided"
    echo ""
    echo "Usage:"
    echo "  export domain_name=yourdomain.com"
    echo "  export CERTBOT_EMAIL=your@email.com  # optional but recommended"
    echo "  $0"
    echo ""
    echo "Or:"
    echo "  domain_name=yourdomain.com CERTBOT_EMAIL=your@email.com $0"
    exit 1
fi

# Validate domain
if ! validate_domain "$domain_name"; then
    exit 1
fi

print_header "Configuration:"
echo "  Domain: $domain_name"
echo "  WWW Domain: www.$domain_name"
if [ -n "$CERTBOT_EMAIL" ]; then
    echo "  Email: $CERTBOT_EMAIL"
else
    print_warning "No email provided (recommended for renewal notifications)"
fi
echo ""

# Install dependencies if needed
if ! command_exists dig; then
    print_status "Installing DNS utilities..."
    if [ -f /etc/debian_version ]; then
        sudo apt-get update && sudo apt-get install -y dnsutils
    elif [ -f /etc/redhat-release ]; then
        sudo dnf install -y bind-utils
    fi
fi

# Check if certbot is installed
if ! command_exists certbot; then
    print_warning "Certbot not found"
    read -p "Install Certbot? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        install_certbot
    else
        print_error "Certbot is required"
        exit 1
    fi
fi

# Verify certbot version
CERTBOT_VERSION=$(certbot --version 2>&1 | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
print_success "Certbot version: $CERTBOT_VERSION"

# Check DNS configuration
if ! check_dns "$domain_name"; then
    read -p "Continue without proper DNS? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for existing certificate
if check_existing_cert "$domain_name"; then
    print_success "Using existing certificate"
    exit 0
fi

# Check ports and firewall
check_ports

# Backup nginx config
backup_nginx_config

# Verify Nginx is configured
if [ ! -f "$NGINX_CONF" ]; then
    print_warning "Nginx config not found at: $NGINX_CONF"
    echo "Please ensure Nginx is properly configured before running this script"
fi

# Test nginx configuration
print_status "Testing Nginx configuration..."
if sudo nginx -t; then
    print_success "Nginx configuration is valid"
else
    print_error "Nginx configuration test failed"
    echo "Fix Nginx configuration before proceeding"
    exit 1
fi

echo ""
read -p "Proceed with SSL certificate setup? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    print_warning "SSL setup cancelled"
    exit 0
fi

# Try nginx plugin first, fallback to standalone
if setup_ssl_nginx_plugin "$domain_name"; then
    SSL_SUCCESS=true
else
    print_warning "Nginx plugin failed, trying standalone mode..."
    if setup_ssl_standalone "$domain_name"; then
        SSL_SUCCESS=true
    else
        SSL_SUCCESS=false
    fi
fi

if [ "$SSL_SUCCESS" = true ]; then
    # Test nginx with SSL
    print_status "Testing Nginx with SSL configuration..."
    if sudo nginx -t; then
        print_success "Nginx configuration is valid"
        
        # Reload nginx
        print_status "Reloading Nginx..."
        sudo systemctl reload nginx
        print_success "Nginx reloaded"
    else
        print_error "Nginx configuration test failed after SSL setup"
        sudo nginx -t
    fi
    
    # Setup auto-renewal
    setup_auto_renewal
    
    # Verify SSL
    verify_ssl "$domain_name"
    
    # Display summary
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    print_success "SSL setup completed successfully!"
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    
    print_header "📋 SSL Certificate Information:"
    sudo certbot certificates -d "$domain_name" 2>/dev/null || true
    echo ""
    
    print_header "🌐 Your application is now secure:"
    echo "  https://$domain_name"
    echo "  https://www.$domain_name"
    echo ""
    
    print_header "🔄 Automatic Renewal:"
    echo "  Certificates will auto-renew before expiration"
    echo "  Check renewal: sudo certbot renew --dry-run"
    echo "  View timer: systemctl list-timers certbot.timer"
    echo ""
    
    print_header "📊 Certificate Status:"
    echo "  Location: /etc/letsencrypt/live/$domain_name/"
    echo "  Expiry: $(sudo certbot certificates -d "$domain_name" 2>/dev/null | grep "Expiry Date" | cut -d: -f2- || echo "Run 'sudo certbot certificates' to check")"
    echo ""
    
    print_header "🔧 Useful Commands:"
    echo "  Check status:  sudo certbot certificates"
    echo "  Renew now:     sudo certbot renew"
    echo "  Test renewal:  sudo certbot renew --dry-run"
    echo "  Revoke cert:   sudo certbot revoke --cert-path /etc/letsencrypt/live/$domain_name/cert.pem"
    echo ""
else
    print_error "SSL setup failed"
    echo ""
    echo "Common issues:"
    echo "  1. Domain DNS not properly configured"
    echo "  2. Firewall blocking ports 80/443"
    echo "  3. Another service using port 80"
    echo "  4. Nginx configuration errors"
    echo ""
    echo "For help, visit: https://certbot.eff.org/docs/"
    exit 1
fi