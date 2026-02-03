# Manual Deployment Guide

This guide explains how to deploy manually when GitHub Actions is unavailable.

## When to Use Manual Deployment

Use manual deployment when:
- GitHub Actions has an outage (check [githubstatus.com](https://www.githubstatus.com))
- Workflows are stuck in queue for extended periods
- You need to deploy urgently and can't wait for CI/CD

## Quick Start

```bash
# From project root
./scripts/manual-deploy.sh
```

## Prerequisites

1. **SSH Key**: You need the EC2 SSH private key at `~/.ssh/emaus-key.pem`
2. **SSH Access**: Your IP must be allowed in EC2 security group
3. **Local Build**: Must be able to run `pnpm build` locally

## What the Script Does

The `scripts/manual-deploy.sh` script performs these steps:

| Step | Action | Description |
|------|--------|-------------|
| 1 | Check SSH key | Verifies SSH key exists and has correct permissions |
| 2 | Test connection | Confirms SSH connectivity to EC2 |
| 3 | Build locally | Runs `pnpm build` to create production artifacts |
| 4 | Upload API | SCPs `apps/api/dist` to EC2 |
| 5 | Upload Web | SCPs `apps/web/dist` to EC2 |
| 6 | Remote deploy | Installs deps, runs migrations, restarts PM2 |
| 7 | Verify | Checks application is responding |

## Manual Steps (Without Script)

If you need to deploy manually without the script:

### Step 1: Build Locally

```bash
cd /home/lbolanos/emaus
pnpm install
pnpm build
```

### Step 2: Upload Build Artifacts

```bash
# Upload API
scp -i ~/.ssh/emaus-key.pem -r apps/api/dist ubuntu@emaus.cc:/var/www/emaus/apps/api/

# Upload Web
scp -i ~/.ssh/emaus-key.pem -r apps/web/dist ubuntu@emaus.cc:/var/www/emaus/apps/web/
```

### Step 3: SSH and Complete Deployment

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@emaus.cc

# On EC2:
cd /var/www/emaus
pnpm install --frozen-lockfile
pnpm --filter api migration:run
pm2 restart emaus-api
pm2 status
```

### Step 4: Verify

```bash
# Check application is running
curl https://emaus.cc/

# Check API health
curl https://emaus.cc/api/health

# Check PM2 logs
pm2 logs emaus-api --lines 50
```

## Environment Variables

The script supports these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `EC2_HOST` | `emaus.cc` | EC2 hostname or IP |
| `EC2_USER` | `ubuntu` | SSH username |
| `SSH_KEY` | `~/.ssh/emaus-key.pem` | Path to SSH private key |

Example with custom values:
```bash
EC2_HOST=123.45.67.89 SSH_KEY=~/.ssh/my-key.pem ./scripts/manual-deploy.sh
```

## Troubleshooting

### SSH Connection Failed

```bash
# Check if key has correct permissions
chmod 600 ~/.ssh/emaus-key.pem

# Test SSH connection
ssh -i ~/.ssh/emaus-key.pem -v ubuntu@emaus.cc

# Check EC2 security group allows your IP on port 22
```

### Build Failed

```bash
# Clean and rebuild
rm -rf node_modules apps/*/node_modules
pnpm install
pnpm build
```

### PM2 Not Restarting

```bash
# SSH to EC2 and check PM2
ssh -i ~/.ssh/emaus-key.pem ubuntu@emaus.cc

pm2 status
pm2 logs emaus-api --lines 100
pm2 restart emaus-api --update-env
```

### Migration Failed

```bash
# Check migration status
pnpm --filter api migration:show

# Run specific migration
pnpm --filter api migration:run
```

## Deployment Log - 2026-02-02

### Issue
GitHub Actions experiencing **partial outage**. Workflows stuck in queue for 15-30 minutes, then jobs cancelled immediately without executing.

### Resolution
Created manual deployment script (`scripts/manual-deploy.sh`) to bypass GitHub Actions.

### Changes Deployed
Security remediation commit `da32314`:
- Password reset tokens moved to database (SHA256 hashed)
- CSRF token rotation on high-value operations
- Rate limiting on auth endpoints
- Image magic byte validation
- Session cookie hardening
- Authorization cache improvements

### Verification Commands

After manual deployment, verify security changes:

```bash
# Check API is running
curl -s https://emaus.cc/api/auth/csrf | head -1

# Check database has new columns
ssh -i ~/.ssh/emaus-key.pem ubuntu@emaus.cc \
  "sqlite3 /var/www/emaus/apps/api/database.sqlite '.schema users'" | grep -i reset

# Check PM2 process
ssh -i ~/.ssh/emaus-key.pem ubuntu@emaus.cc "pm2 show emaus-api"
```

---

## See Also

- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - Full production setup guide
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - General deployment information
- [GitHub Actions Status](https://www.githubstatus.com) - Check CI/CD status
