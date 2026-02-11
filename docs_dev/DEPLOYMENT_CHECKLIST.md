# Production Deployment Checklist

Quick reference for deploying Emaus to production.

> **See [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md) for detailed instructions.**

---

## Pre-Deployment ✓

- [ ] EC2 instance is running (t3.small or larger)
- [ ] GitHub repository secrets are set:
  - [ ] `EC2_HOST` - Your EC2 public IP
  - [ ] `EC2_USER` - SSH user (usually 'ubuntu')
  - [ ] `EC2_SSH_PRIVATE_KEY` - Full SSH private key (PEM)
  - [ ] `DOMAIN_NAME` - Production domain (emaus.cc)
- [ ] SSH key is in `~/.ssh/emaus-key.pem`
- [ ] AWS CLI configured: `aws configure --profile emaus`

---

## Deployment Steps

### 1. Prepare Production Environment

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# Create/edit .env.production
nano /var/www/emaus/apps/api/.env.production

# Required variables:
# - DB_TYPE=sqlite
# - FRONTEND_URL=https://emaus.cc
# - SESSION_SECRET=<random-key>
# - GOOGLE_CLIENT_ID/SECRET
# - SMTP credentials
# - AVATAR_STORAGE=s3
# - AWS credentials and S3 config
```

- [ ] .env.production is complete
- [ ] All required variables are set
- [ ] No sensitive values are hardcoded elsewhere

### 2. Create S3 Bucket (One-time Setup)

```bash
# Disable Block Public Access
aws --profile emaus s3api put-public-access-block \
  --bucket emaus-media \
  --public-access-block-configuration \
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Run setup script
export AWS_PROFILE=emaus
export AWS_REGION=us-east-1
./scripts/setup-s3.sh

# Verify bucket
aws --profile emaus s3 ls | grep emaus-media
```

- [ ] S3 bucket created successfully
- [ ] Versioning enabled
- [ ] Encryption enabled
- [ ] CORS configured
- [ ] Public read policy set for avatars/assets

### 3. Deploy to Production

**Option A: Automatic (Recommended)**

```bash
# Commit and push to master
git add .
git commit -m "chore: production deployment"
git push origin master

# GitHub Actions automatically deploys
# Monitor: Go to GitHub repo → Actions tab
```

- [ ] Code committed to master
- [ ] GitHub Actions workflow started
- [ ] Workflow shows green ✅

**Option B: Manual SSH**

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# If needed, manually restart
pm2 restart emaus-api --update-env
```

### 4. Verify Deployment

```bash
# Check API health
curl https://emaus.cc/api/health

# Check web app
curl -I https://emaus.cc/

# Check logs
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP
pm2 logs emaus-api --lines 50
```

- [ ] API responds with 200 OK
- [ ] Web app loads (200 OK)
- [ ] PM2 shows process as online
- [ ] No errors in logs

### 5. Test S3 Storage

```bash
# Log in to https://emaus.cc
# Upload a profile avatar
# Verify avatar displays correctly

# Check S3 for uploaded file
aws --profile emaus s3 ls s3://emaus-media/avatars/
```

- [ ] Avatar uploads without errors
- [ ] Avatar displays in profile
- [ ] File appears in S3 bucket

---

## Post-Deployment Monitoring

After deployment, monitor for 24-48 hours:

```bash
# Watch logs for errors
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP
pm2 logs emaus-api --follow

# Check system resources
uptime
free -h
df -h

# Check S3 uploads are working
aws --profile emaus s3 ls s3://emaus-media/ --recursive --summarize
```

- [ ] No errors in logs
- [ ] Memory usage stable
- [ ] Disk space adequate
- [ ] New S3 uploads working

---

## If Something Goes Wrong

### Rollback S3 to Base64

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP
nano /var/www/emaus/apps/api/.env.production

# Change to:
# AVATAR_STORAGE=base64

# Remove AWS credentials if desired

pm2 restart emaus-api --update-env
```

### Rollback Code Deployment

```bash
# The GitHub Actions workflow includes automatic rollback
# If health checks fail, previous version is restored

# Manual rollback (if needed):
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP
ls -lh /var/www/emaus-backups/

# Restore from backup
BACKUP_PATH="/var/www/emaus-backups/backup-YYYYMMDD-HHMMSS"
cp -r "$BACKUP_PATH/api-dist"/* /var/www/emaus/apps/api/dist/
pm2 restart emaus-api
```

---

## Common Issues

| Issue               | Solution                                                           |
| ------------------- | ------------------------------------------------------------------ |
| SSH timeout         | Check EC2 security group allows SSH, verify instance is running    |
| Deployment fails    | Check GitHub Actions logs, verify EC2_SSH_PRIVATE_KEY secret       |
| Avatar upload fails | Verify AVATAR_STORAGE=s3, check AWS credentials in .env.production |
| Out of memory       | Ensure instance is t3.small or larger (t3.micro is too small)      |
| Database locked     | Restart PM2: `pm2 kill && pm2 start ecosystem.config.js`           |

---

## Quick Commands Reference

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@YOUR_EC2_IP

# View logs
pm2 logs emaus-api

# Restart app
pm2 restart emaus-api --update-env

# Check status
pm2 status

# Monitor resources
top
free -h
df -h

# View environment
cat /var/www/emaus/apps/api/.env.production

# Check S3 bucket
aws --profile emaus s3 ls s3://emaus-media/

# List files in avatars
aws --profile emaus s3 ls s3://emaus-media/avatars/
```

---

## Timeline

- **Build**: ~5-10 minutes (GitHub Actions)
- **Deploy**: ~5 minutes (artifact upload + installation)
- **Migrations**: ~1 minute
- **Restart**: ~1 minute
- **Health Check**: ~2 minutes
- **Total**: ~15-20 minutes from push to master

---

## After Successful Deployment

1. ✅ Notify stakeholders that new version is live
2. ✅ Monitor application for 24-48 hours
3. ✅ Check S3 costs in AWS billing
4. ✅ Plan next feature or fix
5. ✅ Document any issues encountered

---

## Contacts & Resources

- **Production Domain**: https://emaus.cc
- **GitHub Repo**: https://github.com/lbolanos/emaus
- **GitHub Actions**: https://github.com/lbolanos/emaus/actions
- **AWS S3 Bucket**: s3://emaus-media
- **AWS Console**: https://console.aws.amazon.com

---

**For detailed instructions, see [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)**
