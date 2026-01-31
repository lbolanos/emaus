# Automated Deployment Guide

This guide explains how the Emaus application is automatically deployed to AWS EC2 when code is pushed to the `master` branch.

## Overview

The deployment system uses GitHub Actions to automatically:
1. Run CI tests (lint, test, build)
2. Generate a semantic version tag
3. Create a GitHub release with built artifacts
4. Deploy to EC2 instance
5. Run health checks
6. Send notifications

**Key Points:**
- ✅ Fully automated on every push to `master`
- ✅ Can only deploy from `master` branch (protected)
- ✅ Automatic rollback on failure
- ✅ Health checks verify deployment success
- ✅ Email notifications on success/failure

## Deployment Flow

### Step 1: Prepare Code for Deployment

```bash
# 1. Create feature branch
git checkout develop
git checkout -b feature/my-feature

# 2. Make changes and test locally
pnpm install
pnpm dev

# 3. Commit and push
git add .
git commit -m "feat: add new feature"
git push -u origin feature/my-feature
```

### Step 2: Create Pull Request to Develop

```bash
# 1. Go to GitHub repository
# 2. Click "New Pull Request"
# 3. Set base branch: develop, compare: feature/my-feature
# 4. Fill in title and description
# 5. Request reviews
# 6. Wait for:
#    - CI tests to pass
#    - Code review approvals
#    - All conversations resolved
# 7. Merge PR (use "Squash and merge")
```

### Step 3: Create Release PR to Master

```bash
# 1. Create release branch
git checkout develop
git pull origin develop
git checkout -b release/v1.2.3

# 2. Update version numbers if needed
# 3. Commit and push
git push -u origin release/v1.2.3

# 4. Go to GitHub and create PR to master
# 5. After approval, merge to master
# 6. GitHub automatically creates the tag
```

### Step 4: Automatic Deployment Triggers

When a pull request is merged to `master`, GitHub Actions automatically:

```
1. Run CI Pipeline (5-10 minutes)
   ├─ Lint (ESLint)
   ├─ Test API (Jest)
   ├─ Test Web (Vitest)
   └─ Build

2. Prepare Release (2 minutes)
   ├─ Generate next version (v1.2.4)
   ├─ Create git tag
   └─ Push tag to GitHub

3. Build and Release (5 minutes)
   ├─ Build production artifacts
   ├─ Create release archives
   └─ Upload to GitHub release

4. Deploy to EC2 (5 minutes)
   ├─ Wait for artifacts
   ├─ SSH to EC2
   ├─ Download artifacts
   ├─ Extract and deploy
   ├─ Run database migrations
   ├─ Restart PM2
   └─ Run health checks

5. Notification
   ├─ Create GitHub deployment event
   ├─ Send email notification
   └─ Display summary in GitHub
```

**Total Time:** ~20-30 minutes

## Monitoring Deployment

### Option 1: GitHub Actions

1. Go to repository → "Actions" tab
2. Find the "Deploy to Production" workflow run
3. Click to see detailed logs
4. Each job shows real-time output

### Option 2: GitHub Deployments

1. Go to repository → "Deployments" tab
2. See deployment history
3. View which version is deployed
4. Click deployment to see details

### Option 3: Email Notification

Receive email when deployment:
- ✅ Succeeds with version and timestamp
- ❌ Fails with error details and rollback info

## Deployment Status

After deployment completes:

### ✅ Success

- Application is running on EC2
- Web app accessible at https://emaus.cc
- API running on http://localhost:3001 (proxied via Nginx)
- All health checks pass
- GitHub shows green checkmark

### ❌ Failure

- Automatic rollback to previous version
- Previous version continues running
- GitHub Actions shows red X
- Email notification with error details
- Check logs for root cause

## Manual Deployment (Emergency)

If automatic deployment fails or needs to be triggered manually:

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP>

# Navigate to app directory
cd /var/www/emaus

# Download and deploy specific release
export RELEASE_TAG=v1.2.3
export DOMAIN_NAME=emaus.cc
bash deploy/aws/deploy-aws.sh

# Monitor deployment
pm2 logs emaus-api --lines 50
```

## Environment Variables

### On EC2

The following environment variables must be configured in:
- `/var/www/emaus/apps/api/.env.production`
- `/var/www/emaus/apps/web/.env.production`

**API Variables:**
```bash
DB_TYPE=sqlite
DB_DATABASE=/var/www/emaus/apps/api/database.sqlite
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://emaus.cc
```

**Web Variables:**
```bash
VITE_API_URL=https://emaus.cc/api
VITE_GOOGLE_MAPS_API_KEY=<your-key>
```

### GitHub Secrets

For automatic deployment, configure these in GitHub Secrets:

| Secret | Value | Purpose |
|--------|-------|---------|
| `EC2_HOST` | Instance IP or domain | SSH target |
| `EC2_USER` | `ubuntu` | SSH username |
| `EC2_SSH_PRIVATE_KEY` | Private key file contents | SSH authentication |
| `DOMAIN_NAME` | `emaus.cc` | Domain name |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps API key | Maps functionality |

## Troubleshooting

### Deployment Stuck at "Waiting for Release Artifacts"

**Problem:** Deployment workflow waiting for artifacts that aren't appearing.

**Solution:**
1. Check "Build and Release" workflow completed successfully
2. Go to repository → Releases → Latest release
3. Verify artifacts (web-dist.tar.gz, api-dist.tar.gz) are uploaded
4. If missing, run workflow manually

### SSH Connection Timeout

**Problem:** Can't connect to EC2 instance.

**Solution:**
1. Verify EC2_HOST secret is correct IP/domain
2. Check EC2 security group allows SSH from GitHub Actions IPs
3. Verify SSH key in EC2_SSH_PRIVATE_KEY matches instance key
4. Test SSH locally: `ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP>`

### Health Checks Fail

**Problem:** Deployment completes but health checks fail.

**Solution:**
1. SSH to EC2 and check PM2: `pm2 status`
2. View API logs: `pm2 logs emaus-api --lines 50`
3. Check Nginx: `sudo systemctl status nginx`
4. Check database: `sqlite3 /var/www/emaus/apps/api/database.sqlite ".tables"`
5. Review full deployment log in GitHub Actions

### Application Not Accessible

**Problem:** Deployment succeeded but app returns error.

**Solution:**
1. Check web app logs: `pm2 logs emaus-api`
2. Verify environment variables: `cat /var/www/emaus/apps/api/.env.production`
3. Check Nginx configuration: `sudo nginx -t`
4. Review Nginx logs: `sudo tail -f /var/log/nginx/error.log`
5. Consider rollback if changes broke functionality

### Database Errors After Deployment

**Problem:** Application throws database errors post-deployment.

**Solution:**
1. Check migrations completed: `pm2 logs emaus-api | grep -i migration`
2. Run migrations manually:
   ```bash
   cd /var/www/emaus/apps/api
   npm run migration:run
   ```
3. Check database integrity:
   ```bash
   sqlite3 /var/www/emaus/apps/api/database.sqlite "PRAGMA integrity_check;"
   ```
4. If corrupted, restore from backup

## Deployment Checklist

Before pushing to master:

- [ ] All tests pass locally: `pnpm test`
- [ ] Code builds successfully: `pnpm build`
- [ ] No linting errors: `pnpm lint`
- [ ] Features tested manually
- [ ] Code reviewed and approved
- [ ] Branch is up to date with develop
- [ ] No incomplete changes

After deployment:

- [ ] GitHub Actions workflow completed successfully
- [ ] Health checks passed (all green)
- [ ] Email notification received
- [ ] Web app loads without errors
- [ ] API health endpoint returns 200
- [ ] Critical features still work
- [ ] No error messages in logs

## Rollback Procedures

See [Rollback Procedure](./rollback-procedure.md) for detailed rollback instructions.

Quick rollback:
```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP>

# List available backups
ls /var/www/emaus-backups/

# Restore from backup
cd /var/www/emaus-backups/backup-YYYYMMDD-HHMMSS
cp -r api-dist/* /var/www/emaus/apps/api/dist/
cp -r web-dist/* /var/www/emaus/apps/web/dist/

# Restart application
pm2 restart emaus-api
```

## Monitoring and Alerts

### Application Health

Check application status anytime:
```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP>

# Run health checks
bash /var/www/emaus/deploy/aws/health-check.sh

# View PM2 status
pm2 status

# View logs
pm2 logs emaus-api --lines 100
```

### Logs

- **API Logs:** `pm2 logs emaus-api`
- **Nginx Access:** `sudo tail -f /var/log/nginx/emaus-access.log`
- **Nginx Errors:** `sudo tail -f /var/log/nginx/emaus-error.log`
- **System:** `sudo journalctl -u nginx -f`

## Performance Monitoring

After deployment, verify performance:

1. **API Response Time:** Should be < 500ms for most endpoints
2. **Web App Load Time:** Should be < 3 seconds
3. **Database Queries:** Check logs for slow queries
4. **Memory Usage:** `pm2 monit`
5. **Disk Space:** `df -h`

## Disaster Recovery

If production is completely down:

1. **Immediate:** Trigger rollback (see rollback guide)
2. **Notify team:** Send message about incident
3. **Investigate:** Check logs and recent changes
4. **Fix:** Either revert recent change or apply hotfix
5. **Deploy:** Push fix to master or merge hotfix PR
6. **Monitor:** Watch logs and health checks
7. **Communicate:** Update team when resolved

## Support

- **Documentation:** See [/docs/deployment](.) directory
- **Workflows:** [GitHub Actions Workflows](.github/workflows/)
- **Scripts:** [AWS Deployment Scripts](deploy/aws/)
- **Issues:** Check GitHub Issues for known problems
- **Contact:** Reach out to DevOps team for help

---

**Last Updated:** 2026-01-31
**Version:** 1.0.0
