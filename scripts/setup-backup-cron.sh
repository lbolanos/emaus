#!/bin/bash
set -e

# Setup daily database backup cron job on the production server
# Usage: ssh into server and run this script, or run remotely:
#   ssh -i ~/.ssh/emaus-key.pem ubuntu@emaus.cc 'bash -s' < scripts/setup-backup-cron.sh

BACKUP_SCRIPT="/var/www/emaus/backup-db.sh"
CRON_LOG="/var/log/emaus-backup.log"
CRON_SCHEDULE="0 3 * * *"  # Daily at 3:00 AM UTC

echo "🔧 Setting up backup cron job..."

# Ensure backup script is executable
chmod +x "$BACKUP_SCRIPT"

# Ensure AWS CLI is available
if ! command -v aws &> /dev/null; then
    echo "⚠️ AWS CLI not installed. Installing..."
    sudo apt-get update -qq && sudo apt-get install -y -qq awscli
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Run 'aws configure' first."
    echo "   Needed: access key with s3:PutObject and s3:DeleteObject on emaus-media bucket"
    exit 1
fi

# Create log file
sudo touch "$CRON_LOG"
sudo chown "$USER:$USER" "$CRON_LOG"

# Add cron job (idempotent - removes old entry first)
CRON_CMD="$CRON_SCHEDULE $BACKUP_SCRIPT >> $CRON_LOG 2>&1"
(crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT"; echo "$CRON_CMD") | crontab -

echo "✅ Cron job configured:"
echo "   Schedule: Daily at 3:00 AM UTC"
echo "   Script:   $BACKUP_SCRIPT"
echo "   Log:      $CRON_LOG"
echo ""
echo "Verify with: crontab -l"
echo "Test now with: $BACKUP_SCRIPT"
