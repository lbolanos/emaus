# Production Deployment Guide

Complete guide to deploying the Emaus Retreat Management System to production with automated GitHub Actions CI/CD pipeline and AWS S3 integration.

## Overview

The production deployment uses:

- **GitHub Actions** for automated build, test, and deployment
- **AWS EC2** for hosting (t3.small instance recommended)
- **AWS S3** for media storage (avatars, documents, assets)
- **PM2** for process management
- **SQLite** for database
- **Nginx** for reverse proxy

---

## Prerequisites

### AWS Setup

1. **AWS Account with S3 access**

   ```bash
   # Configure AWS CLI with emaus profile
   aws configure --profile emaus
   # Enter your AWS Access Key ID and Secret Access Key
   ```

2. **EC2 Instance** (t3.small or larger)
   - Ubuntu 24.04 LTS or compatible
   - At least 2GB RAM (t3.micro will run out of memory)
   - 25GB+ storage
   - Security group allowing:
     - HTTP (80)
     - HTTPS (443)
     - SSH (22) - restricted to your IP

3. **GitHub Repository Secrets** (set in repository settings)
   ```
   EC2_HOST           - Your EC2 public IP
   EC2_USER           - SSH user (usually 'ubuntu')
   EC2_SSH_PRIVATE_KEY - Your EC2 SSH private key (full PEM contents)
   DOMAIN_NAME        - Your production domain (emaus.cc)
   ```

### Local Prerequisites

- Git configured with SSH keys
- pnpm installed (`npm install -g pnpm`)
- Node.js 20+
- Bash shell (for scripts)

---

## Step 1: Initial EC2 Setup

### Connect to Your EC2 Instance

```bash
# First time connection - accept the host key
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# Create required directories
mkdir -p /var/www/emaus
mkdir -p /var/log/emaus
mkdir -p ~/.ssh

# Set permissions
chmod 700 ~/.ssh
```

### Install Dependencies

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2 globally
npm install -g pm2

# Install nginx
sudo apt install -y nginx

# Start nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Configure PM2 to Auto-restart on Reboot

```bash
pm2 startup
pm2 save

# Verify PM2 startup is configured
systemctl status pm2-ubuntu
```

---

## Step 2: GitHub Actions Workflow Setup

### Workflow File Location

The deployment is controlled by `.github/workflows/deploy-production.yml`

### Key Workflow Components

**Build Job:**

- Runs `pnpm lint` to check code style
- Runs `pnpm test:field-mapping` for tests
- Builds application with `pnpm build`
- Uploads build artifacts to GitHub

**Deploy Job:**

- Downloads build artifacts
- Uploads to EC2 via SCP
- Runs `pnpm install --frozen-lockfile` on EC2
- Runs database migrations with `pnpm --filter api migration:run`
- Restarts PM2 process
- Verifies API health

**Deployment Summary:**

- Creates GitHub Actions summary with deployment status
- Shows commit hash, author, timestamp, and application URL

### Triggering Deployment

**Automatic:** Pushes to `master` branch automatically trigger deployment

**Manual:** Go to GitHub Actions tab and manually run the workflow

---

## Step 3: Configure Production Environment

### SSH into Your EC2 Instance

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP
```

### Create Production Environment File

```bash
# Navigate to API directory
cd /var/www/emaus/apps/api

# Create .env.production with your settings
nano .env.production
```

### Add These Environment Variables

**Database:**

```bash
DB_TYPE=sqlite
DB_DATABASE=database.sqlite
```

**Application:**

```bash
FRONTEND_URL=https://emaus.cc
SESSION_SECRET=<your-random-secret-key>
PORT=3001
NODE_ENV=production
```

**Google OAuth:**

```bash
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
```

**Email (SMTP):**

```bash
SMTP_HOST=<your-smtp-host>
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<your-smtp-user>
SMTP_PASS=<your-smtp-password>
SMTP_FROM=noreply@yourdomain.com
```

**Telemetry (Optional):**

```bash
INFLUXDB_URL=<optional>
INFLUXDB_TOKEN=<optional>
GRAFANA_URL=<optional>
GRAFANA_API_KEY=<optional>
```

**Migrations:**

```bash
MIGRATIONS_AUTO_RUN=true
MIGRATIONS_WARN_ONLY=true
MIGRATIONS_LOG_LEVEL=info
```

**Seed Data:**

```bash
SEED_AUTO_RUN=true
SEED_FORCE=true
SEED_MASTER_USER_EMAIL=your@email.com
SEED_MASTER_USER_NAME=Your Name
SEED_MASTER_USER_PASSWORD=<secure-password>
```

**Save and Exit:** Press `Ctrl+X`, then `Y`, then `Enter`

---

## Step 4: Configure S3 for Media Storage

### Disable AWS Block Public Access

This allows public read access for avatars while keeping documents private:

```bash
# Disable Block Public Access on S3 bucket
aws --profile emaus s3api put-public-access-block \
  --bucket emaus-media \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### Create S3 Bucket

**Option 1: Automated Setup (Recommended)**

```bash
# Clone or navigate to repository
cd ~/emaus

# Run setup script
export AWS_PROFILE=emaus
export AWS_REGION=us-east-1
./scripts/setup-s3.sh
```

**Option 2: Manual Commands**

```bash
export AWS_PROFILE=emaus

# Create bucket
aws s3api create-bucket \
  --bucket emaus-media \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket emaus-media \
  --versioning-configuration Status=Enabled

# Set bucket policy (public read for avatars/assets)
aws s3api put-bucket-policy --bucket emaus-media --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": ["arn:aws:s3:::emaus-media/avatars/*", "arn:aws:s3:::emaus-media/public-assets/*"]
    }
  ]
}'

# Configure CORS
aws s3api put-bucket-cors --bucket emaus-media --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }]
}'

# Enable encryption
aws s3api put-bucket-encryption --bucket emaus-media --server-side-encryption-configuration '{
  "Rules": [{
    "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}
  }]
}'
```

### Verify S3 Bucket Configuration

```bash
# List buckets
aws --profile emaus s3 ls | grep emaus-media

# Check versioning
aws --profile emaus s3api get-bucket-versioning --bucket emaus-media

# Check policy
aws --profile emaus s3api get-bucket-policy --bucket emaus-media

# Check encryption
aws --profile emaus s3api get-bucket-encryption --bucket emaus-media
```

---

## Step 5: Enable S3 in Production

### Add AWS Credentials to Production Environment

SSH to your EC2 instance:

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# Edit production environment
nano /var/www/emaus/apps/api/.env.production
```

Add these S3 variables:

```bash
# S3 Storage Configuration
AVATAR_STORAGE=s3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>
S3_BUCKET_NAME=emaus-media
S3_AVATARS_PREFIX=avatars/
S3_RETREAT_MEMORIES_PREFIX=retreat-memories/
S3_DOCUMENTS_PREFIX=documents/
S3_PUBLIC_ASSETS_PREFIX=public-assets/
```

Save with `Ctrl+X`, `Y`, `Enter`

### Restart PM2 with New Environment

```bash
# Update environment variables in PM2
pm2 restart emaus-api --update-env

# Verify restart
sleep 2
pm2 status

# Check logs for errors
pm2 logs emaus-api --lines 20
```

---

## Step 6: Deploy to Production

### Option 1: Automatic Deployment via GitHub Actions

1. Commit your changes:

   ```bash
   git add .
   git commit -m "feat: enable S3 storage with emaus-media bucket"
   git push origin master
   ```

2. GitHub Actions automatically triggers deployment

3. Monitor progress:
   - Go to GitHub repository → Actions tab
   - Watch for workflow completion
   - Check for green checkmarks ✅

### Option 2: Manual Verification After GitHub Deployment

```bash
# SSH to EC2 instance
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# Check PM2 status
pm2 status emaus-api

# View recent logs
pm2 logs emaus-api --lines 30

# Check if migrations ran
pm2 logs emaus-api --lines 50 | grep -i migration
```

---

## Step 7: Verify Production Deployment

### Check Application Health

```bash
# Test API endpoint
curl https://emaus.cc/api/health

# Test web application
curl -I https://emaus.cc/

# Both should return HTTP 200 OK
```

### Verify S3 Configuration

```bash
# Check S3 bucket contents
aws --profile emaus s3 ls s3://emaus-media/

# List directories
aws --profile emaus s3 ls s3://emaus-media/ --recursive --summarize
```

### Test Avatar Upload

1. Open https://emaus.cc in your browser
2. Log in with seed credentials
3. Go to your profile
4. Upload an avatar
5. Verify the avatar displays correctly

### Verify Avatar in S3

```bash
# Check if avatar was uploaded to S3
aws --profile emaus s3 ls s3://emaus-media/avatars/

# If file exists, S3 storage is working!
```

### Check Application Logs

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# View real-time logs
pm2 logs emaus-api

# View last 50 lines
pm2 logs emaus-api --nostream --lines 50

# Check for S3 errors
pm2 logs emaus-api --nostream --lines 100 | grep -i "s3\|error\|fail"
```

---

## Monitoring & Maintenance

### Check Instance Health

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# Check uptime and CPU
uptime
top -bn1 | grep "Cpu(s)"

# Check memory
free -h

# Check disk space
df -h /var/www/emaus
```

### View PM2 Logs

```bash
# Real-time logs
pm2 logs emaus-api

# Last 100 lines
pm2 logs emaus-api --lines 100

# Only errors
pm2 logs emaus-api --err --lines 50

# With timestamps
pm2 logs emaus-api --format json
```

### Restart Application

```bash
# Restart API
pm2 restart emaus-api

# Restart all services
pm2 restart all

# Reload with no downtime
pm2 reload emaus-api
```

### Database Backups

```bash
# Manual backup
cp /var/www/emaus/apps/api/database.sqlite \
   /var/www/emaus/database-$(date +%Y%m%d-%H%M%S).sqlite.backup

# List backups
ls -lh /var/www/emaus/database-*.backup
```

---

## Rollback Procedures

### Rollback to Previous Deployment

If issues occur after deployment:

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# View available backups
ls -lh /var/www/emaus-backups/ 2>/dev/null || echo "No backups found"

# Manual rollback: restore from backup
BACKUP_PATH="/var/www/emaus-backups/backup-YYYYMMDD-HHMMSS"
[ -d "$BACKUP_PATH" ] && {
  cp -r "$BACKUP_PATH/api-dist"/* /var/www/emaus/apps/api/dist/ 2>/dev/null
  cp -r "$BACKUP_PATH/web-dist"/* /var/www/emaus/apps/web/dist/ 2>/dev/null
  pm2 restart emaus-api
}
```

### Rollback S3 to Base64 Storage

If S3 has issues:

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# Edit environment
nano /var/www/emaus/apps/api/.env.production

# Change S3 setting
# AVATAR_STORAGE=base64

# Restart
pm2 restart emaus-api --update-env
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs emaus-api --lines 100 --err

# Common issues:
# 1. Missing environment variables
# 2. Database locked
# 3. Port 3001 already in use

# Kill process if stuck
pm2 kill

# Restart PM2
pm2 start ecosystem.config.js
```

### SSH Connection Timeout

```bash
# Check EC2 security group allows SSH (port 22)
# Check instance is running
# Try from different network if behind firewall
```

### GitHub Actions Deployment Fails

1. Check workflow logs in GitHub Actions tab
2. Common issues:
   - Missing `EC2_SSH_PRIVATE_KEY` secret
   - Incorrect `EC2_HOST` IP address
   - EC2 instance is stopped
   - Insufficient disk space on EC2

### S3 Upload Permission Denied

```bash
# Verify IAM user has S3 permissions
aws --profile emaus sts get-caller-identity

# Check S3 bucket policy
aws --profile emaus s3api get-bucket-policy --bucket emaus-media

# Verify AWS credentials in .env.production
grep AWS_ /var/www/emaus/apps/api/.env.production
```

### Avatars Not Displaying

1. Check if avatar exists in S3:

   ```bash
   aws --profile emaus s3 ls s3://emaus-media/avatars/
   ```

2. Verify bucket policy allows public read:

   ```bash
   aws --profile emaus s3api get-bucket-policy --bucket emaus-media
   ```

3. Check CORS configuration:

   ```bash
   aws --profile emaus s3api get-bucket-cors --bucket emaus-media
   ```

4. Verify `AVATAR_STORAGE=s3` is set in .env.production

---

## Environment Variables Reference

| Variable                | Example            | Purpose               |
| ----------------------- | ------------------ | --------------------- |
| `DB_TYPE`               | `sqlite`           | Database type         |
| `DB_DATABASE`           | `database.sqlite`  | Database file path    |
| `FRONTEND_URL`          | `https://emaus.cc` | Frontend domain       |
| `SESSION_SECRET`        | (random string)    | Session encryption    |
| `PORT`                  | `3001`             | API port              |
| `NODE_ENV`              | `production`       | Environment mode      |
| `AVATAR_STORAGE`        | `s3` or `base64`   | Avatar storage method |
| `AWS_REGION`            | `us-east-1`        | AWS region            |
| `AWS_ACCESS_KEY_ID`     | (your key)         | AWS access key        |
| `AWS_SECRET_ACCESS_KEY` | (your secret)      | AWS secret key        |
| `S3_BUCKET_NAME`        | `emaus-media`      | S3 bucket name        |

---

## Security Best Practices

1. ✅ Always use HTTPS (enforce in nginx)
2. ✅ Keep EC2 security group restrictive
3. ✅ Rotate AWS access keys regularly
4. ✅ Use IAM roles instead of access keys (future improvement)
5. ✅ Enable S3 versioning for recovery
6. ✅ Enable S3 encryption (AES256)
7. ✅ Set appropriate S3 bucket policies
8. ✅ Monitor AWS costs with billing alerts
9. ✅ Keep system packages updated
10. ✅ Use strong SESSION_SECRET and passwords

---

## Summary

**Deployment Steps:**

1. ✅ Set up EC2 instance with t3.small or larger
2. ✅ Configure GitHub repository secrets
3. ✅ Create .env.production with all required variables
4. ✅ Create S3 bucket with proper configuration
5. ✅ Enable S3 in production .env.production
6. ✅ Push changes to master branch
7. ✅ Monitor GitHub Actions workflow
8. ✅ Verify application is running
9. ✅ Test avatar upload to S3
10. ✅ Monitor logs and performance

**Deployment takes ~20-30 minutes after push to master.**

---

## Further Reading

- [S3 Media Storage Guide](./s3-media-storage.md)
- [Environment Variables Guide](./ENVIRONMENT_VARIABLES_GUIDE.md)
- [RBAC Documentation](./RBAC_DOCUMENTATION.md)
- [Google OAuth Setup](./GOOGLE_OAUTH_SETUP.md)

---

## Support

For issues or questions:

1. Check troubleshooting section above
2. Review GitHub Actions workflow logs
3. Check EC2 PM2 logs: `pm2 logs emaus-api`
4. Review application documentation in docs_dev/
