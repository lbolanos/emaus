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

APP_DIR="/var/www/emaus"
API_PORT=3001

print_header() {
    echo -e "${MAGENTA}$1${NC}"
}

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

print_info() {
    echo -e "${CYAN}➜  $1${NC}"
}

print_header "═══════════════════════════════════════════════════════════"
print_header "🔍 Emaus AWS Diagnostic Tool"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# 1. System Information
print_header "📊 System Information"
echo "  Date: $(date)"
echo "  Uptime: $(uptime -p)"
echo "  Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "  Disk: $(df -h /var/www | tail -1 | awk '{print $3 "/" $2 " (" $5 ")"}')"
echo ""

# 2. PM2 Status
print_header "🔄 PM2 Status"
if command_exists pm2; then
    pm2 status
    echo ""
    print_info "PM2 Logs (last 10 lines):"
    pm2 logs --lines 10 --nostream 2>&1 | tail -15
else
    print_error "PM2 not installed"
fi
echo ""

# 3. API Health Check
print_header "🏥 API Health Check"
print_status "Testing local API on port $API_PORT..."
if curl -f -s "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
    print_success "API health endpoint responding"
    curl -s "http://localhost:$API_PORT/health"
elif curl -f -s "http://localhost:$API_PORT/" > /dev/null 2>&1; then
    print_success "API root endpoint responding"
else
    print_error "API not responding on port $API_PORT"
fi
echo ""

# 4. Nginx Status
print_header "🌐 Nginx Status"
if systemctl is-active --quiet nginx; then
    print_success "Nginx is running"
    echo "  Active: $(systemctl is-active nginx)"
    echo "  Enabled: $(systemctl is-enabled nginx)"
else
    print_error "Nginx is not running"
fi

print_info "Nginx configuration test:"
if sudo nginx -t 2>&1; then
    print_success "Nginx configuration is valid"
else
    print_error "Nginx configuration has errors"
fi
echo ""

# 5. Environment Variables
print_header "🔧 Environment Variables"
print_info "Checking .env.production file:"
if [ -f "$APP_DIR/apps/api/.env.production" ]; then
    print_success ".env.production exists"
    echo ""
    print_info "Key variables:"
    grep -E "^(NODE_ENV|PORT|FRONTEND_URL|SESSION_SECRET|DB_TYPE|GOOGLE_CLIENT_ID)=" "$APP_DIR/apps/api/.env.production" | sed 's/=.*/=***/' | head -10
else
    print_error ".env.production not found"
fi
echo ""

# 6. File Permissions
print_header "🔐 File Permissions"
print_info "Checking critical files:"
for file in \
    "$APP_DIR/apps/api/.env.production" \
    "$APP_DIR/apps/api/database.sqlite" \
    "$APP_DIR/apps/api/dist/index.js" \
    "$APP_DIR/apps/web/dist/index.html"
do
    if [ -f "$file" ]; then
        perms=$(ls -ld "$file" | awk '{print $1, $3, $4}')
        echo "  $file: $perms"
    else
        print_error "Missing: $file"
    fi
done
echo ""

# 7. Database Status
print_header "🗄️  Database Status"
if [ -f "$APP_DIR/apps/api/database.sqlite" ]; then
    db_size=$(du -h "$APP_DIR/apps/api/database.sqlite" | cut -f1)
    print_success "Database exists (size: $db_size)"

    # Check if database is locked
    if [ -f "$APP_DIR/apps/api/database.sqlite-shm" ] || [ -f "$APP_DIR/apps/api/database.sqlite-wal" ]; then
        print_warning "Database lock files found (may indicate active connection)"
    fi
else
    print_error "Database not found"
fi
echo ""

# 8. Network Ports
print_header "🌐 Network Ports"
print_info "Checking listening ports:"
for port in 80 443 3001; do
    if sudo lsof -i :$port -sTCP:LISTEN -t -P > /dev/null 2>&1; then
        process=$(sudo lsof -i :$port -sTCP:LISTEN -t -P | head -1 | awk '{print $1}')
        print_success "Port $port: open (process: $process)"
    else
        print_error "Port $port: not listening"
    fi
done
echo ""

# 9. Recent Errors
print_header "📋 Recent Error Logs"
print_info "PM2 Error logs (last 20 lines):"
if [ -f "/home/ubuntu/.pm2/logs/emaus-api-error.log" ]; then
    tail -20 "/home/ubuntu/.pm2/logs/emaus-api-error.log" 2>/dev/null || echo "Unable to read error log"
else
    print_warning "Error log file not found"
fi
echo ""

print_info "Nginx error logs (last 10 lines):"
if [ -f "/var/log/nginx/emaus-error.log" ]; then
    tail -10 "/var/log/nginx/emaus-error.log" 2>/dev/null || echo "Unable to read nginx error log"
else
    print_warning "Nginx error log not found"
fi
echo ""

# 10. API Dependencies
print_header "📦 API Dependencies"
print_info "Checking if critical dependencies are installed:"
cd "$APP_DIR" || exit 1
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

if [ -f "node_modules/.pnpm/express-session*/node_modules/express-session/package.json" ]; then
    print_success "express-session installed"
else
    print_error "express-session NOT installed"
fi

if [ -f "node_modules/.pnpm/passport*/node_modules/passport/package.json" ]; then
    print_success "passport installed"
else
    print_error "passport NOT installed"
fi
echo ""

# 11. Test Endpoints
print_header "🧪 Testing API Endpoints"
print_info "Testing /health endpoint:"
curl -s -w "\nHTTP Status: %{http_code}\n" "http://localhost:$API_PORT/health" 2>/dev/null || print_error "Failed to connect"
echo ""

# 12. Quick Fix Suggestions
print_header "💡 Quick Fix Suggestions"

# Check for common issues
if [ ! -f "$APP_DIR/apps/api/.env.production" ]; then
    print_warning "Missing .env.production - copy from .env.example"
fi

if ! pm2 list 2>/dev/null | grep -q "online"; then
    print_warning "PM2 processes not running - run: pm2 start ecosystem.config.js"
fi

if ! systemctl is-active --quiet nginx; then
    print_warning "Nginx not running - run: sudo systemctl start nginx"
fi

# Check for express-session specifically
if ! grep -q "express-session" "$APP_DIR/apps/api/package.json" 2>/dev/null; then
    print_warning "express-session not in package.json - may need to install dependencies"
fi

echo ""
print_header "═══════════════════════════════════════════════════════════"
print_success "Diagnostic complete!"
print_header "═══════════════════════════════════════════════════════════"
echo ""
print_info "Useful commands:"
echo "  View logs:       pm2 logs emaus-api"
echo "  Restart API:    pm2 restart emaus-api"
echo "  Restart Nginx:  sudo systemctl restart nginx"
echo "  Shell access:   ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105"
echo ""
