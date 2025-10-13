#!/bin/bash
set -e

echo "💾 Creating database backup for Emaus"

# SQLite database path
DB_PATH="/var/www/emaus/apps/api/database.sqlite"
BACKUP_DIR="/var/backups/emaus"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/emaus_$TIMESTAMP.sqlite"

# Create backup directory if it doesn't exist
sudo mkdir -p $BACKUP_DIR
sudo chown $USER:$USER $BACKUP_DIR

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "⚠️ Database file not found: $DB_PATH"
    echo "💾 Skipping backup - database doesn't exist yet"
    exit 0
fi

# Create backup using SQLite .dump command
echo "📦 Creating SQLite backup..."
sqlite3 $DB_PATH ".backup $BACKUP_FILE"

# Compress backup
echo "🗜️ Compressing backup..."
gzip $BACKUP_FILE

# Set proper permissions
sudo chown $USER:$USER $BACKUP_FILE.gz

# Clean up old backups (keep last 7 days)
echo "🧹 Cleaning up old backups..."
find $BACKUP_DIR -name "*.gz" -type f -mtime +7 -delete

echo "✅ Database backup completed: $BACKUP_FILE.gz"
echo "📊 Backup size: $(du -h $BACKUP_FILE.gz | cut -f1)"

# Optional: Upload to remote storage (uncomment and configure)
# echo "📤 Uploading to remote storage..."
# scp $BACKUP_FILE.gz user@remote-server:/backup/path/

echo "💾 Backup process completed successfully!"
