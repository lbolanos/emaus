# Rollback Procedure

This guide explains how to rollback a deployment if issues are discovered after the new version is deployed to production.

## When to Rollback

Consider rolling back when:

- ✅ **Critical functionality is broken** (e.g., users can't login)
- ✅ **Data corruption occurs** (e.g., database migrations fail)
- ✅ **Major performance issues** (e.g., API responses > 10 seconds)
- ✅ **Security vulnerability discovered** in the latest release
- ✅ **User-impacting bugs** that weren't caught in testing

Do NOT rollback for:

- ❌ Minor UI issues (push a fix instead)
- ❌ Typos in error messages (push a fix instead)
- ❌ Feature flags that control behavior (use feature flags instead)
- ❌ Non-critical API endpoints down (fix and redeploy)

## Automatic Rollback

If the deployment fails during the GitHub Actions workflow, automatic rollback is triggered:

1. **Detection:** Health checks fail or deployment script exits with error
2. **Rollback:** Previous version is automatically restored from backup
3. **Verification:** Application restarts and previous version resumes running
4. **Notification:** Email sent with rollback details

**Automatic Rollback Time:** < 5 minutes

## Manual Rollback Steps

### Step 1: SSH to EC2 Instance

```bash
# Replace <EC2_IP> with actual IP address
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP>
```

### Step 2: List Available Backups

```bash
# List all backups with timestamps
ls -la /var/www/emaus-backups/

# Example output:
# drwxr-xr-x  backup-20260131-143022  (most recent)
# drwxr-xr-x  backup-20260130-091545
# drwxr-xr-x  backup-20260129-150300
```

Each backup directory contains:

- `api-dist/` - API distribution files
- `web-dist/` - Web application files

### Step 3: Choose Backup to Restore

Typically, restore the most recent backup (the previous version). However, if that version also had issues, you may need to restore an older version.

```bash
# Set backup path to most recent (example)
BACKUP_PATH="/var/www/emaus-backups/backup-20260130-091545"
```

### Step 4: Stop Current Application

```bash
# Stop the running application to prevent conflicts
pm2 stop emaus-api

# Verify it's stopped
pm2 status
```

### Step 5: Backup Current Broken Version (Optional but Recommended)

Before restoring, backup the current broken version for investigation:

```bash
# Create investigation backup
BROKEN_BACKUP="/var/www/emaus-backups/backup-broken-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BROKEN_BACKUP"

# Backup current files
cp -r /var/www/emaus/apps/api/dist "$BROKEN_BACKUP/api-dist"
cp -r /var/www/emaus/apps/web/dist "$BROKEN_BACKUP/web-dist"

echo "Broken version backed up to: $BROKEN_BACKUP"
```

### Step 6: Restore Application Files

```bash
# Define paths
APP_DIR="/var/www/emaus"
BACKUP_PATH="/var/www/emaus-backups/backup-20260130-091545"

# Restore API
echo "Restoring API distribution..."
rm -rf "$APP_DIR/apps/api/dist"/*
mkdir -p "$APP_DIR/apps/api/dist"
cp -r "$BACKUP_PATH/api-dist"/* "$APP_DIR/apps/api/dist/"

# Restore Web
echo "Restoring web distribution..."
rm -rf "$APP_DIR/apps/web/dist"/*
mkdir -p "$APP_DIR/apps/web/dist"
cp -r "$BACKUP_PATH/web-dist"/* "$APP_DIR/apps/web/dist/"

echo "✅ Files restored from backup: $BACKUP_PATH"
```

### Step 7: Start Application

```bash
# Start the application
pm2 start ecosystem.config.cjs

# Or if using PM2 with app name
pm2 start emaus-api --watch

# Verify it's running
pm2 status
```

### Step 8: Run Health Checks

```bash
# Run health check script
bash /var/www/emaus/deploy/aws/health-check.sh

# Or manual checks:

# Check API health
curl http://localhost:3001/health

# Check PM2
pm2 status

# Check logs
pm2 logs emaus-api --lines 20
```

### Step 9: Verify Application

```bash
# Test API endpoint
curl -I https://emaus.cc/api/health

# Check for errors in logs
pm2 logs emaus-api | head -50

# Check Nginx status
sudo systemctl status nginx
```

## Database Rollback

If the rollback involves database issues, you may need to revert migrations:

### Check Current Migration State

```bash
# SSH to EC2
cd /var/www/emaus/apps/api

# View migration history
sqlite3 database.sqlite "SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 10;"
```

### Revert Latest Migration

```bash
# Revert one migration
npm run migration:revert:prod

# Verify it was reverted
sqlite3 database.sqlite "SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 5;"
```

### Revert Multiple Migrations

```bash
# Revert the last 2 migrations
npm run migration:revert:prod
npm run migration:revert:prod

# Verify all reverted
sqlite3 database.sqlite "SELECT COUNT(*) as migration_count FROM migrations;"
```

## Rollback Verification Checklist

After completing rollback, verify:

- [ ] Application is running: `pm2 status` shows "online"
- [ ] API responds: `curl http://localhost:3001/health` returns 200
- [ ] Web app loads: Access https://emaus.cc/ in browser
- [ ] No errors in logs: `pm2 logs emaus-api` shows no errors
- [ ] Database is accessible: Can query participants table
- [ ] Previous features work: Test critical user journeys
- [ ] Performance acceptable: API responses < 1 second
- [ ] No data loss: Verify important data still exists

## Quick Rollback Script

Save this as `/var/www/emaus/deploy/aws/rollback.sh` for quick rollback:

```bash
#!/bin/bash
set -e

BACKUP_DATE=${1:-}
APP_DIR="/var/www/emaus"
BACKUP_BASE="/var/www/emaus-backups"

if [ -z "$BACKUP_DATE" ]; then
  echo "Usage: $0 <backup-date-time>"
  echo "Example: $0 20260130-091545"
  echo ""
  echo "Available backups:"
  ls -1 "$BACKUP_BASE" | grep "^backup-" | sort -r | head -5
  exit 1
fi

BACKUP_PATH="$BACKUP_BASE/backup-$BACKUP_DATE"

if [ ! -d "$BACKUP_PATH" ]; then
  echo "❌ Backup not found: $BACKUP_PATH"
  exit 1
fi

echo "🔄 Rolling back to: $BACKUP_PATH"

# Stop application
pm2 stop emaus-api 2>/dev/null || true

# Restore files
rm -rf "$APP_DIR/apps/api/dist"/* "$APP_DIR/apps/web/dist"/*
cp -r "$BACKUP_PATH/api-dist"/* "$APP_DIR/apps/api/dist/" 2>/dev/null || true
cp -r "$BACKUP_PATH/web-dist"/* "$APP_DIR/apps/web/dist/" 2>/dev/null || true

# Start application
pm2 start ecosystem.config.cjs

# Run health checks
sleep 5
bash "$APP_DIR/deploy/aws/health-check.sh"
```

## Troubleshooting Rollback

### Backup Directory Not Found

```bash
# List all backups
ls -la /var/www/emaus-backups/

# If empty, backups may not have been created
# Restore from git tag manually
cd /var/www/emaus
git checkout v1.2.2  # Use previous version tag
git clean -fd
pnpm install
pnpm build
pm2 restart emaus-api
```

### Files Incomplete in Backup

```bash
# Check backup contents
ls -la /var/www/emaus-backups/backup-<date>/

# If api-dist or web-dist missing, check:
# 1. Deployment script logs
# 2. Available disk space
# 3. Earlier backups for complete versions
```

### Application Won't Start After Rollback

```bash
# Check for missing dependencies
pm2 logs emaus-api

# Reinstall dependencies
cd /var/www/emaus
pnpm install

# Try starting again
pm2 start ecosystem.config.cjs
```

### Database Migration Broke Data

```bash
# If you have database backups
sqlite3 /var/www/emaus/apps/api/database.sqlite ".backup database.backup"

# Restore from known good version
# Contact DevOps team for database recovery

# Revert migrations
npm run migration:revert:prod
```

## Post-Rollback Actions

After successful rollback:

### 1. Communicate Status

- Notify team that rollback completed
- Update status page if public
- Inform users if applicable

### 2. Preserve Broken Version

- Keep the broken backup for investigation
- Don't delete until root cause is identified
- Copy logs to secure location

### 3. Investigate Root Cause

```bash
# Review broken deployment backup
cd /var/www/emaus-backups/backup-broken-*/
# Analyze what changed

# Check GitHub for recent commits
git log --oneline -10 master

# Review GitHub Actions logs
# Go to Actions tab and check failed deployment
```

### 4. Create Hotfix

```bash
# Create hotfix branch
git checkout master
git checkout -b hotfix/fix-issue

# Make minimal fix
# Commit and push
git push -u origin hotfix/fix-issue

# Create PR and merge to master
# Deployment will trigger automatically
```

### 5. Document Incident

- What went wrong
- How it was discovered
- How it was fixed
- How to prevent in future

## Example Rollback Scenario

**Scenario:** New version v1.2.4 deployed but users can't login.

**Timeline:**

1. 14:30 - v1.2.4 deployed to production
2. 14:35 - User reports login broken
3. 14:40 - Confirmed: login endpoint returns 500 error
4. 14:41 - Decide to rollback

**Steps:**

```bash
# Step 1: SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@54.88.125.10

# Step 2: Verify issue
curl http://localhost:3001/api/auth/login -X POST -d '{"email":"test@test.com"}'
# Returns: 500 Internal Server Error

# Step 3: Stop app
pm2 stop emaus-api

# Step 4: Restore previous version
BACKUP_PATH="/var/www/emaus-backups/backup-20260131-143000"
rm -rf /var/www/emaus/apps/api/dist/*
cp -r "$BACKUP_PATH/api-dist"/* /var/www/emaus/apps/api/dist/

# Step 5: Start app
pm2 start ecosystem.config.cjs

# Step 6: Test
sleep 5
curl http://localhost:3001/api/auth/login -X POST -d '{"email":"test@test.com"}'
# Returns: 200 OK

# Step 7: Full health check
bash /var/www/emaus/deploy/aws/health-check.sh
# All checks pass

echo "✅ Rollback to v1.2.3 completed at $(date)"
```

**Result:** Users can login again. Previous version restored. Issue investigated and fixed in hotfix branch.

## Prevention

To prevent needing rollbacks:

1. **Test thoroughly** - Run full test suite before deployment
2. **Gradual rollout** - Could implement canary deployments
3. **Feature flags** - Hide new features behind flags for safe testing
4. **Staging environment** - Test on staging before production (future enhancement)
5. **Monitoring** - Watch logs after deployment for errors
6. **Communication** - Notify team when deploying major changes

## Contact

For rollback issues or questions:

- **On-call DevOps:** Check Slack #deployments channel
- **Documentation:** Review this guide and deployment guide
- **Logs:** GitHub Actions > Actions tab > Workflow run
- **Emergency:** Contact team lead

---

**Last Updated:** 2026-01-31
**Version:** 1.0.0
