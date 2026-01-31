#!/bin/bash

#
# Health Check Script
# Verifies that the application is running and healthy after deployment
#

set -e

echo "=========================================="
echo "🏥 Running Health Checks"
echo "=========================================="
echo "Timestamp: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "=========================================="

FAILED=0
PASSED=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Health check helper function
check_health() {
  local name=$1
  local command=$2

  echo ""
  echo -n "Checking $name... "

  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAILED++))
    return 1
  fi
}

# 1. Check PM2 process status
echo ""
echo "📊 Process Health"
echo "---"

check_health "PM2 emaus-api running" "pm2 status | grep -q 'emaus-api'"

if pm2 status | grep -q "emaus-api"; then
  PM2_STATUS=$(pm2 status | grep "emaus-api" | awk '{print $3}')
  echo "   Process status: $PM2_STATUS"
fi

# 2. Check API health endpoint
echo ""
echo "🔗 API Connectivity"
echo "---"

check_health "API health endpoint" "curl -sf http://localhost:3001/health > /dev/null"

if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  API_RESPONSE=$(curl -s http://localhost:3001/health)
  echo "   Response: $API_RESPONSE"
fi

# 3. Check Nginx configuration
echo ""
echo "🌐 Web Server Configuration"
echo "---"

check_health "Nginx configuration valid" "nginx -t > /dev/null 2>&1"

check_health "Nginx running" "systemctl is-active --quiet nginx"

# 4. Check web app accessibility
echo ""
echo "🌍 Web Application"
echo "---"

DOMAIN_NAME="${DOMAIN_NAME:-emaus.cc}"

check_health "Web app HTTP (local)" "curl -sf http://localhost:80/ > /dev/null || curl -sf http://localhost:3000/ > /dev/null"

# Try HTTPS if domain is set
if [ ! -z "$DOMAIN_NAME" ]; then
  check_health "Web app HTTPS" "curl -sf https://$DOMAIN_NAME/ > /dev/null"
fi

# 5. Check database connectivity
echo ""
echo "💾 Database"
echo "---"

if [ -f "/var/www/emaus/apps/api/database.sqlite" ]; then
  check_health "Database file exists" "test -f /var/www/emaus/apps/api/database.sqlite"

  check_health "Database readable" "sqlite3 /var/www/emaus/apps/api/database.sqlite '.tables' > /dev/null 2>&1"
else
  echo -n "Checking Database file exists... "
  echo -e "${YELLOW}⚠️  SKIP${NC} (database file not found at expected location)"
fi

# 6. Check application logs for errors
echo ""
echo "📋 Application Logs"
echo "---"

if pm2 logs emaus-api --lines 5 2>/dev/null | grep -q "error\|Error\|ERROR"; then
  echo -n "Checking for recent errors... "
  echo -e "${YELLOW}⚠️  WARNING${NC}"
  echo "   Recent error messages detected:"
  pm2 logs emaus-api --lines 10 2>/dev/null | grep -i "error" | head -3 || true
else
  check_health "No recent errors" "! pm2 logs emaus-api --lines 20 2>/dev/null | grep -iq 'error'"
fi

# 7. Check file permissions and ownership
echo ""
echo "🔐 File Permissions"
echo "---"

APP_DIR="/var/www/emaus"
if [ -d "$APP_DIR" ]; then
  check_health "App directory accessible" "test -r $APP_DIR"

  # Check if Ubuntu user can access the directory
  if su - ubuntu -c "test -w $APP_DIR" 2>/dev/null; then
    echo -n "Checking app directory writable... "
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASSED++))
  fi
fi

# 8. Check disk space
echo ""
echo "💿 System Resources"
echo "---"

DISK_USAGE=$(df /var/www/emaus | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 90 ]; then
  echo -n "Checking disk space (${DISK_USAGE}%)... "
  echo -e "${GREEN}✅ PASS${NC}"
  ((PASSED++))
else
  echo -n "Checking disk space (${DISK_USAGE}%)... "
  echo -e "${RED}❌ FAIL${NC}"
  ((FAILED++))
fi

# Summary
echo ""
echo "=========================================="
echo "📊 Health Check Summary"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All health checks passed!${NC}"
  echo ""
  echo "Application is healthy and ready for use."
  echo ""
  echo "📍 Access the application at:"
  echo "   - Web App: https://${DOMAIN_NAME:-emaus.cc}/"
  echo "   - API: http://localhost:3001/"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Some health checks failed!${NC}"
  echo ""
  echo "Please review the failures above and take corrective action."
  echo ""
  echo "Diagnostic Information:"
  echo "---"
  echo "PM2 Status:"
  pm2 status
  echo ""
  echo "Recent API Logs:"
  pm2 logs emaus-api --lines 20 2>/dev/null || echo "No logs available"
  echo ""
  exit 1
fi
