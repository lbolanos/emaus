#!/bin/bash
#
# Reset password for a specific user
#
# Usage:
#   ./scripts/reset-password.sh <email> [password]
#   ./scripts/reset-password.sh --prod <email> [password]
#
# Examples:
#   ./scripts/reset-password.sh admin@emaus.org              # auto-generated password
#   ./scripts/reset-password.sh admin@emaus.org MyPass123     # specific password
#   ./scripts/reset-password.sh --prod luis@example.com       # production, auto-generated
#   ./scripts/reset-password.sh --prod luis@example.com Pass1 # production, specific
#

set -e

# SSH config (same as manual-deploy.sh)
EC2_HOST="${EC2_HOST:-emaus.cc}"
EC2_USER="${EC2_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/emaus-key.pem}"

# Local DB path
LOCAL_DB="$(dirname "$0")/../apps/api/database.sqlite"
REMOTE_DB="/var/www/emaus/apps/api/database.sqlite"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse args
PROD=false
if [ "$1" = "--prod" ]; then
    PROD=true
    shift
fi

EMAIL="$1"
PASSWORD="$2"

if [ -z "$EMAIL" ]; then
    echo -e "${RED}Usage: $0 [--prod] <email> [password]${NC}"
    exit 1
fi

# Generate random password if not provided
if [ -z "$PASSWORD" ]; then
    PASSWORD=$(node -e "console.log(require('crypto').randomBytes(6).toString('base64url'))")
fi

# Generate bcrypt hash
HASH=$(node -e "require('bcrypt').hash('$PASSWORD', 10).then(h => console.log(h))")

if [ "$PROD" = true ]; then
    # Production: execute via SSH
    echo -e "${YELLOW}Resetting password on PRODUCTION for ${EMAIL}...${NC}"

    if [ ! -f "$SSH_KEY" ]; then
        echo -e "${RED}SSH key not found at $SSH_KEY${NC}"
        exit 1
    fi

    RESULT=$(ssh -i "$SSH_KEY" "$EC2_USER@$EC2_HOST" "
        COUNT=\$(sqlite3 '$REMOTE_DB' \"SELECT COUNT(*) FROM users WHERE email = '$EMAIL';\")
        if [ \"\$COUNT\" -eq 0 ]; then
            echo 'NOT_FOUND'
        else
            sqlite3 '$REMOTE_DB' \"UPDATE users SET password = '$HASH' WHERE email = '$EMAIL';\"
            echo 'OK'
        fi
    ")
else
    # Local
    echo -e "${YELLOW}Resetting password locally for ${EMAIL}...${NC}"

    if [ ! -f "$LOCAL_DB" ]; then
        echo -e "${RED}Database not found at $LOCAL_DB${NC}"
        exit 1
    fi

    COUNT=$(sqlite3 "$LOCAL_DB" "SELECT COUNT(*) FROM users WHERE email = '$EMAIL';")
    if [ "$COUNT" -eq 0 ]; then
        RESULT="NOT_FOUND"
    else
        sqlite3 "$LOCAL_DB" "UPDATE users SET password = '$HASH' WHERE email = '$EMAIL';"
        RESULT="OK"
    fi
fi

if [ "$RESULT" = "NOT_FOUND" ]; then
    echo -e "${RED}User not found: ${EMAIL}${NC}"
    exit 1
fi

echo -e "${GREEN}Updated password for ${EMAIL} → ${PASSWORD}${NC}"
