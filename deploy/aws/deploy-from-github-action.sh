#!/bin/bash

#
# Deploy from GitHub Actions
# This script is called from the GitHub Actions workflow and coordinates deployment
# on the EC2 instance
#

set -e

# Configuration
APP_DIR="/var/www/emaus"
BACKUP_DIR="/var/www/emaus-backups"
DEPLOY_LOG="/tmp/deployment.log"

# Get environment variables
RELEASE_TAG="${RELEASE_TAG:-}"
DOMAIN_NAME="${DOMAIN_NAME:-emaus.cc}"
GITHUB_REPO="${GITHUB_REPO:-lbolanos/emaus}"

echo "=========================================="
echo "🚀 Deploying Emaus to Production"
echo "=========================================="
echo "Timestamp: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "Release Tag: $RELEASE_TAG"
echo "Domain: $DOMAIN_NAME"
echo "GitHub Repo: $GITHUB_REPO"
echo "App Directory: $APP_DIR"
echo "=========================================="

# Validate inputs
if [ -z "$RELEASE_TAG" ]; then
  echo "❌ ERROR: RELEASE_TAG environment variable not set"
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "❌ ERROR: Application directory $APP_DIR does not exist"
  exit 1
fi

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
  echo "📁 Creating backup directory: $BACKUP_DIR"
  sudo mkdir -p "$BACKUP_DIR"
  sudo chown ubuntu:ubuntu "$BACKUP_DIR"
fi

# Create timestamped backup directory
BACKUP_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup-$BACKUP_TIMESTAMP"

echo ""
echo "📦 Creating backup..."
mkdir -p "$BACKUP_PATH"

# Backup current application
if [ -d "$APP_DIR/apps/api/dist" ]; then
  echo "  - Backing up API dist..."
  cp -r "$APP_DIR/apps/api/dist" "$BACKUP_PATH/api-dist" || true
fi

if [ -d "$APP_DIR/apps/web/dist" ]; then
  echo "  - Backing up web dist..."
  cp -r "$APP_DIR/apps/web/dist" "$BACKUP_PATH/web-dist" || true
fi

echo "✅ Backup created at: $BACKUP_PATH"

# Call the main deployment script
echo ""
echo "🔄 Calling main deployment script..."
cd "$APP_DIR"

# Export variables for deploy-aws.sh
export RELEASE_TAG
export DOMAIN_NAME
export GITHUB_REPO
export BACKUP_ON_FAILURE=true

# Run the deployment script with error handling
if bash "deploy/aws/deploy-aws.sh" 2>&1 | tee -a "$DEPLOY_LOG"; then
  echo ""
  echo "✅ Deployment completed successfully!"
  echo "Release: $RELEASE_TAG"
  echo "Deployed at: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
  exit 0
else
  DEPLOY_EXIT_CODE=$?
  echo ""
  echo "❌ Deployment failed with exit code: $DEPLOY_EXIT_CODE"
  echo ""
  echo "🔄 Attempting rollback..."

  # Rollback from backup
  if [ -d "$BACKUP_PATH/api-dist" ]; then
    echo "  - Restoring API from backup..."
    mkdir -p "$APP_DIR/apps/api/dist"
    rm -rf "$APP_DIR/apps/api/dist"/*
    cp -r "$BACKUP_PATH/api-dist"/* "$APP_DIR/apps/api/dist/" || true
  fi

  if [ -d "$BACKUP_PATH/web-dist" ]; then
    echo "  - Restoring web from backup..."
    mkdir -p "$APP_DIR/apps/web/dist"
    rm -rf "$APP_DIR/apps/web/dist"/*
    cp -r "$BACKUP_PATH/web-dist"/* "$APP_DIR/apps/web/dist/" || true
  fi

  # Restart PM2
  echo "  - Restarting PM2..."
  pm2 restart emaus-api 2>/dev/null || pm2 start ecosystem.config.cjs 2>/dev/null || true

  echo "❌ Rollback completed. Previous version restored."
  exit $DEPLOY_EXIT_CODE
fi
