#!/bin/bash
set -e

# Configuration
DB_PATH="/var/www/emaus/apps/api/database.sqlite"
BACKUP_DIR="/var/backups/emaus"
S3_BUCKET="emaus-media"
S3_PREFIX="backups/database"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="emaus_$TIMESTAMP.sqlite"
BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME"
LOCAL_RETENTION_DAYS=7
S3_RETENTION_DAYS=90

echo "💾 Creating database backup for Emaus"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "⚠️ Database file not found: $DB_PATH"
    exit 0
fi

# Create backup using SQLite online backup API (safe even while DB is in use)
echo "📦 Creating SQLite backup..."
sqlite3 "$DB_PATH" ".backup $BACKUP_FILE"

# Compress backup
echo "🗜️ Compressing backup..."
gzip "$BACKUP_FILE"
BACKUP_GZ="$BACKUP_FILE.gz"

echo "✅ Local backup: $BACKUP_GZ ($(du -h "$BACKUP_GZ" | cut -f1))"

# Upload to S3
if command -v aws &> /dev/null; then
    echo "📤 Uploading to S3..."
    aws s3 cp "$BACKUP_GZ" "s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_NAME.gz" \
        --storage-class STANDARD_IA \
        --quiet
    echo "✅ S3 upload: s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_NAME.gz"

    # Clean up old S3 backups
    echo "🧹 Cleaning S3 backups older than $S3_RETENTION_DAYS days..."
    CUTOFF_DATE=$(date -d "-${S3_RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-${S3_RETENTION_DAYS}d +%Y-%m-%d)
    aws s3api list-objects-v2 \
        --bucket "$S3_BUCKET" \
        --prefix "$S3_PREFIX/" \
        --query "Contents[?LastModified<='${CUTOFF_DATE}'].Key" \
        --output text 2>/dev/null | tr '\t' '\n' | while read -r key; do
        [ -n "$key" ] && [ "$key" != "None" ] && aws s3 rm "s3://$S3_BUCKET/$key" --quiet
    done
else
    echo "⚠️ AWS CLI not found - skipping S3 upload"
fi

# Clean up old local backups
echo "🧹 Cleaning local backups older than $LOCAL_RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "emaus_*.gz" -type f -mtime +$LOCAL_RETENTION_DAYS -delete

echo "💾 Backup completed successfully!"
