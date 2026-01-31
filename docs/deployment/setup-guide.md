# Git Flow + Deployment Setup Guide

This guide walks you through the final setup steps needed to enable automated deployment to AWS EC2.

## Prerequisites

- GitHub repository access with admin permissions
- AWS EC2 instance already provisioned and running
- SSH key pair for EC2 (emaus-key.pem) already generated
- Domain name configured (emaus.cc)

## Step 1: Configure GitHub Secrets

GitHub Secrets are encrypted environment variables used by GitHub Actions during deployment.

### Access GitHub Secrets

1. Go to your GitHub repository: https://github.com/lbolanos/emaus
2. Click **Settings** (top navigation)
3. In left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret** button

### Required Secrets to Add

Add each secret by clicking "New repository secret" and filling in the form:

#### 1. `EC2_HOST`

- **Name:** `EC2_HOST`
- **Value:** Your EC2 instance's public IP address or domain
- **Example:** `54.88.125.10` or `emaus.example.com`
- **How to find:**
  ```bash
  aws ec2 describe-instances --query "Reservations[0].Instances[0].PublicIpAddress" --output text --profile emaus
  ```

#### 2. `EC2_USER`

- **Name:** `EC2_USER`
- **Value:** `ubuntu` (for Ubuntu AMI)
- **This is standard, don't change**

#### 3. `EC2_SSH_PRIVATE_KEY`

- **Name:** `EC2_SSH_PRIVATE_KEY`
- **Value:** Contents of your `~/.ssh/emaus-key.pem` file
- **How to get the value:**
  ```bash
  cat ~/.ssh/emaus-key.pem
  ```
  Copy the entire output, including:
  ```
  -----BEGIN RSA PRIVATE KEY-----
  MIIEpAIBAAKCAQEA...
  [middle section with many lines]
  -----END RSA PRIVATE KEY-----
  ```
- **⚠️ IMPORTANT:** Never commit this key to git. Store only in GitHub Secrets.

#### 4. `DOMAIN_NAME`

- **Name:** `DOMAIN_NAME`
- **Value:** Your domain name
- **Example:** `emaus.cc`
- **Used for:** SSL certificate setup, web app access

#### 5. `VITE_GOOGLE_MAPS_API_KEY` (Optional)

- **Name:** `VITE_GOOGLE_MAPS_API_KEY`
- **Value:** Your Google Maps API key
- **If empty:** Web app will work but map features may be disabled
- **How to get:** https://developers.google.com/maps/documentation/javascript/get-api-key

#### 6-9. Email Notification Secrets (Optional but Recommended)

If you want email notifications on deployment:

- **`NOTIFICATION_EMAIL`**: Email address to receive alerts (e.g., `admin@example.com`)
- **`SMTP_HOST`**: SMTP server (e.g., `smtp.gmail.com`)
- **`SMTP_PORT`**: SMTP port (e.g., `587`)
- **`SMTP_USER`**: SMTP username/email
- **`SMTP_PASSWORD`**: SMTP password (for Gmail: app-specific password)

### Verify Secrets Are Added

After adding all secrets:
1. Go to Settings → Secrets and variables → Actions
2. You should see a list of your secrets (values are hidden)
3. Secrets appear with a green checkmark once saved

## Step 2: Configure GitHub Branch Settings

### Set Default Branch to `develop`

1. Go to Settings → General
2. Scroll to "Default branch" section
3. Click the dropdown (currently showing `master`)
4. Select `develop`
5. Click "Update" button
6. Confirm the change

### Configure Branch Protection Rules for `master`

1. Go to Settings → Branches
2. Click **Add branch protection rule**
3. Fill in the following:

**Branch name pattern:** `master`

**Protection Settings:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: `1`
  - ✅ Require status checks to pass before merging
  - ✅ Status checks that must pass:
    - `lint`
    - `test-api`
    - `build`
  - ✅ Require branches to be up to date before merging
  - ✅ Include administrators in restrictions

4. Click **Create** to save

### Configure Branch Protection Rules for `develop`

1. Go to Settings → Branches
2. Click **Add branch protection rule**
3. Fill in the following:

**Branch name pattern:** `develop`

**Protection Settings:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: `1`
  - ✅ Require status checks to pass before merging
  - ✅ Status checks that must pass:
    - `lint`
    - `test-api`
    - `build`
- ✅ Allow force pushes (for rebasing, team must coordinate)

4. Click **Create** to save

## Step 3: Verify EC2 Instance Setup

Before first deployment, verify the EC2 instance is ready:

### Test SSH Connection

```bash
# Test connection with the key that will be used in GitHub Actions
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP> "echo 'Connection successful'"

# Expected output: "Connection successful"
```

### Verify Required Software

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP> <<'EOF'
echo "Checking installed software..."
node --version
pnpm --version
pm2 --version
nginx -v
which git
EOF
```

**Expected versions:**
- Node.js: v20.x or later
- pnpm: Installed
- PM2: Installed
- Nginx: Installed
- Git: Installed

### Verify Application Directory

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP> "ls -la /var/www/emaus/"

# Expected output: apps, deploy, packages, node_modules directories
```

### Verify Environment Files

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP> <<'EOF'
ls -la /var/www/emaus/apps/api/.env.production
ls -la /var/www/emaus/apps/web/.env.production
EOF
```

If files don't exist, copy from examples:

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP> <<'EOF'
cd /var/www/emaus
cp apps/api/.env.example apps/api/.env.production
cp apps/web/.env.example apps/web/.env.production
EOF
```

### If Setup Missing, Run Setup Script

If any of the above checks fail:

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP>

# Download and run setup script
cd /var/www/emaus/deploy/aws
chmod +x setup-aws.sh
./setup-aws.sh

# This will:
# - Install Node.js (v20)
# - Install pnpm
# - Install PM2
# - Install Nginx
# - Install Certbot
# - Setup application directory
```

## Step 4: Test the Deployment Pipeline

### Create a Test Branch

```bash
# Create a test feature branch
git checkout develop
git pull origin develop
git checkout -b feature/test-deployment

# Make a small, safe change
echo "# Deployment Test" >> README.md
git add README.md
git commit -m "test: deployment pipeline test"
git push -u origin feature/test-deployment
```

### Create a Test PR to Develop

1. Go to GitHub repository
2. Click **Pull requests** tab
3. Click **New pull request**
4. Set:
   - **Base:** `develop`
   - **Compare:** `feature/test-deployment`
5. Click **Create pull request**
6. Fill in title: "Test: Deployment pipeline verification"
7. Click **Create pull request**

### Verify CI Pipeline Runs

1. Go to the PR you just created
2. Scroll down to see checks
3. Wait for CI pipeline to complete:
   - Lint ✅
   - Test API ✅
   - Test Web ✅
   - Build ✅

If all checks pass, proceed. If any fail:
- Review the error logs
- Fix the issue
- Push new commit to the same branch

### Merge Test PR to Develop

1. Once CI passes and you've requested a review from a team member
2. Click **Approve** (or have another team member approve)
3. Click **Merge pull request**
4. Choose "Squash and merge" (cleaner history)
5. Confirm the merge

### Clean Up Test Branch

After merge, the test branch is automatically deleted by GitHub.

### Create Release PR to Master

```bash
# Create release branch
git checkout develop
git pull origin develop
git checkout -b release/v1.0.0

# Make any final adjustments
git push -u origin release/v1.0.0
```

1. Go to GitHub and create PR:
   - **Base:** `master`
   - **Compare:** `release/v1.0.0`
2. Title: "Release: v1.0.0"
3. Click **Create pull request**

### Merge Release PR to Master - This Triggers Deployment!

1. After approval, click **Merge pull request**
2. Choose "Create a merge commit" (preserves context)
3. Click **Confirm merge**

**This action triggers the deployment workflow!**

### Monitor Deployment

1. Go to **Actions** tab
2. Find the "Deploy to Production" workflow run
3. Click to see detailed logs:
   - **ci** - Runs lint, test, build
   - **prepare-release** - Generates version tag (v1.0.0 or v1.0.1)
   - **build-release** - Creates artifacts
   - **deploy** - Deploys to EC2
   - **deployment-summary** - Final status

**Watch for:**
- ✅ All jobs complete with green checkmarks
- ⏱️ Total time: ~20-30 minutes
- 📧 Email notification (if configured)

### Verify Deployment on EC2

Once deployment completes:

```bash
# SSH to EC2
ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP>

# Check PM2 status
pm2 status
# Expected: emaus-api should show "online"

# Check API health
curl http://localhost:3001/health
# Expected: {"status":"ok",...}

# Check web app (requires DOMAIN_NAME)
curl -I https://emaus.cc/
# Expected: HTTP/1.1 200 OK

# View logs
pm2 logs emaus-api --lines 20
```

### Access the Application

- **Web App:** https://emaus.cc
- **API Health:** https://emaus.cc/api/health
- **Deployment History:** GitHub → Deployments tab

## Step 5: Configure Optional Features

### Email Notifications

If you configured SMTP secrets, deployment notifications are already enabled.

To test:
1. Go to Settings → Secrets
2. Verify all SMTP secrets are present
3. Trigger another test deployment
4. Check your email for notification

### Slack Notifications (Future Enhancement)

Not yet implemented, but planned for future versions.

## Troubleshooting

### GitHub Secrets Not Found

**Error:** `Workflow job returned error: The specified secret is not found`

**Solution:**
1. Go to Settings → Secrets and variables → Actions
2. Verify all required secrets exist
3. Check secret names exactly match workflow file
4. Secrets are case-sensitive

### SSH Connection Fails

**Error:** `ssh: Could not resolve hostname`, `Connection refused`, or `Permission denied`

**Solution:**
1. Verify EC2_HOST secret is correct: `aws ec2 describe-instances ... --query "PublicIpAddress"`
2. Verify EC2 security group allows SSH port 22
3. Verify EC2_SSH_PRIVATE_KEY contains complete private key
4. Test locally: `ssh -i ~/.ssh/emaus-key.pem ubuntu@<IP>`

### Deployment Timeout

**Error:** `The operation timed out while waiting for ...`

**Solution:**
1. Check EC2 instance is running: `aws ec2 describe-instances ... --query "State"`
2. SSH to EC2 and check disk space: `df -h`
3. Check memory: `free -h`
4. Check available bandwidth
5. Consider increasing EC2 instance size (t3.medium → t3.large)

### Health Checks Fail

**Error:** `Health check failed` after deployment

**Solution:**
1. SSH to EC2: `ssh -i ~/.ssh/emaus-key.pem ubuntu@<EC2_IP>`
2. Check PM2: `pm2 status`, `pm2 logs emaus-api`
3. Check API: `curl http://localhost:3001/health`
4. Check database: `sqlite3 /var/www/emaus/apps/api/database.sqlite ".tables"`
5. Check Nginx: `sudo nginx -t`, `systemctl status nginx`
6. Review logs: `pm2 logs emaus-api --lines 50`

### Application Errors After Deployment

**Error:** 500 errors, blank page, or feature broken

**Solution:**
1. Check deployment was successful: GitHub Actions shows all green ✅
2. Check environment variables on EC2:
   ```bash
   cat /var/www/emaus/apps/api/.env.production
   cat /var/www/emaus/apps/web/.env.production
   ```
3. Review application logs: `pm2 logs emaus-api`
4. Check for database migrations: `pm2 logs | grep -i migration`
5. Consider rollback: See [rollback-procedure.md](./rollback-procedure.md)

## Next Steps

After successful first deployment:

1. **Configure Team Access** - Add team members to GitHub repository
2. **Setup Branch Protections** - Enforce code review (already configured in Step 2)
3. **Monitor Deployments** - Check GitHub Deployments tab after each release
4. **Test Rollback** - Practice rolling back a deployment
5. **Document Runbooks** - Create team-specific deployment procedures
6. **Setup Monitoring** - Configure application performance monitoring

## Support and Documentation

- **Git Flow Guide:** [docs/deployment/git-flow.md](./git-flow.md)
- **Deployment Guide:** [docs/deployment/deployment-guide.md](./deployment-guide.md)
- **Rollback Guide:** [docs/deployment/rollback-procedure.md](./rollback-procedure.md)
- **README:** [README.md](../../README.md) - Quick reference

## Checklist: Deployment Ready

Before considering deployment complete, verify:

- [ ] GitHub Secrets configured (EC2_HOST, EC2_USER, EC2_SSH_PRIVATE_KEY, DOMAIN_NAME)
- [ ] Default branch set to `develop`
- [ ] Branch protection rules configured for master
- [ ] Branch protection rules configured for develop
- [ ] EC2 instance SSH connection works
- [ ] EC2 has all required software
- [ ] Test deployment completed successfully
- [ ] Application accessible at https://emaus.cc
- [ ] GitHub Deployments tab shows deployment history
- [ ] Email notifications received (if configured)
- [ ] Team trained on Git Flow workflow
- [ ] Rollback procedure tested

---

**Last Updated:** 2026-01-31
**Version:** 1.0.0
**Status:** Ready for production deployment
