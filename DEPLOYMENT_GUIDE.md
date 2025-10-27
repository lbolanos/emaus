# Emaus Deployment Guide 🎯

Your Emaus Retreat Management System is now **fully production-ready**! Choose the deployment method that fits your workflow.

## 🚀 Deployment Methods

### Option 1: Pre-built Local Deploy (Recommended for $5 VPS) 🏠

**Build locally, deploy built artifacts - No VPS memory issues**

```bash
# Set your VPS connection details
export VPS_HOST=your-vps-ip
export VPS_USER=root

# Run the deployment
./build-locally-deploy.sh
```

**✅ Advantages:**

- Builds on your powerful local machine
- Very fast deployment (seconds)
- Works with $5/month VPS
- Most reliable for memory-constrained servers

### Option 2: GitHub Releases 🚀

**Download pre-built binaries from GitHub**

```bash
# First, create a release (see below)
# Then on your VPS:
export GITHUB_REPO=lbolanos/emaus
export RELEASE_TAG=v1.0.0

./release-from-github.sh
```

**✅ Advantages:**

- No build tools needed on VPS
- Version management through GitHub
- CDN-fast downloads
- Easy rollback to previous versions

### Option 3: Direct VPS Build ⚡

**Build directly on VPS (requires more memory)**

```bash
# Only works with $10+ VPS or added swap
./deploy-vultr.sh
```

---

## 📋 Complete Setup Instructions

### Step 1: VPS Preparation

```bash
# Connect to your VPS
ssh root@YOUR_VPS_IP

# Run initial setup (works on Ubuntu, AlmaLinux, Rocky, Alpine, FreeBSD, OpenBSD)
curl -fsSL https://raw.githubusercontent.com/lbolanos/emaus/master/setup-vultr.sh | bash
```

### Step 2: Choose Deployment Method

#### Method A: Pre-built Deployment (Recommended)

```bash
# On your LOCAL machine
export VPS_HOST=your-vps-ip
export VPS_USER=root
./build-locally-deploy.sh
```

#### Method B: GitHub Release Deployment

```bash
# First, create a release (see "Creating Releases" below)
# Then on your VPS:
export GITHUB_REPO=lbolanos/emaus
export RELEASE_TAG=v1.0.0
./release-from-github.sh
```

### Step 3: SSL Setup (Optional but Recommended)

```bash
export DOMAIN_NAME=yourdomain.com
./ssl-setup.sh
```

---

## 🏷️ Creating GitHub Releases

### Automated Release Process

1. **Push a version tag to GitHub:**

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **GitHub Actions will automatically:**
   - Build your application
   - Create `web-dist.tar.gz` (frontend)
   - Create `api-dist.tar.gz` (backend)
   - Attach to GitHub release

3. **Deploy from VPS:**
   ```bash
   export GITHUB_REPO=yourusername/emaus
   export RELEASE_TAG=v1.0.0
   ./release-from-github.sh
   ```

### Manual Release Process

```bash
# Build locally
pnpm build

# Create archives
cd apps/web/dist && tar -czf ../../../web-dist.tar.gz .
cd ../../../apps/api/dist && tar -czf ../../../api-dist.tar.gz .

# Upload to GitHub release manually
```

---


---

## 🔧 Environment Configuration Setup

### 🚨 IMPORTANT: Security Best Practices

**Never hardcode API keys in your deployment files!** Use environment variables or repository secrets.

### Required Environment Variables

#### API Configuration (`apps/api/.env`)
```bash
DB_TYPE=sqlite
DB_DATABASE=database.sqlite
SESSION_SECRET=your-secret-here
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production
```

#### Frontend Configuration (`apps/web/.env.production`)
```bash
# Use environment variables, not hardcoded values
VITE_API_URL=https://yourdomain.com/api
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

### 🔧 Setting Up Environment Variables

#### Method 1: Environment Variables (Recommended for Production)
```bash
# Set at deployment time
export VITE_API_URL=https://yourdomain.com/api
export VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key

# Run deployment script
./release-from-github.sh
```

#### Method 2: Configuration File
```bash
# Copy example template
cp apps/web/.env.production.example apps/web/.env.production

# Edit with your actual values
nano apps/web/.env.production
```

#### Method 3: GitHub Repository Secrets (For CI/CD)
1. Go to GitHub Repository Settings
2. Navigate to Secrets and variables > Actions
3. Add repository secret: `VITE_GOOGLE_MAPS_API_KEY`
4. The GitHub workflow will automatically use this secret

### 🔄 Updating Environment Variables

```bash
# On VPS, edit environment or configuration files:
nano apps/api/.env
nano apps/web/.env.production

# Or set environment variables before running deployment:
export VITE_API_URL=https://new-domain.com/api
export VITE_GOOGLE_MAPS_API_KEY=new-key

# Restart services to apply changes
pm2 restart ecosystem.config.js
sudo systemctl reload nginx
```

### 🔑 Google Maps API Key Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create API key with these restrictions:
   - HTTP referrers: `*.yourdomain.com/*`
   - APIs enabled: Maps JavaScript, Geocoding, Places
3. Add to environment variables or repository secrets
4. Never commit API keys to your repository

### 🧪 Runtime Configuration Benefits

The new runtime configuration system provides:

✅ **No Hardcoded Values**: API keys loaded from environment
✅ **Environment Detection**: Auto-detects dev/staging/production
✅ **Runtime Updates**: Change configuration without rebuilds
✅ **Security**: Sensitive data kept in secrets/environment
✅ **Flexibility**: Same build works across environments

---

## 🔧 Maintenance Commands

### Check Services

```bash
pm2 status              # App status
sudo systemctl status nginx    # Web server
sudo systemctl status postgresql  # Database (if used)
```

### Logs

```bash
pm2 logs               # App logs
sudo tail -f /var/log/nginx/emaus-access.log  # Web logs
```

### Updates

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Restart services
pm2 restart all
sudo systemctl reload nginx
```

### Database Backup

```bash
./backup-db.sh
```

---

## 🆘 Troubleshooting

### Memory Issues

**Problem:** "FATAL ERROR: Reached heap limit"
**Solution:** Use pre-built deployment methods (Option 1 or 2)

### App Won't Start

```bash
pm2 logs emaus-api
# Check for database connection errors
```

### Web App Shows API Errors

```bash
curl http://localhost:3001/health
# Check if API is responding
```

### SSL Issues

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## 📊 Resource Requirements

### Minimum VPS Specs (Pre-built deployment):

- **CPU:** 1 vCPU
- **RAM:** 1 GB
- **Storage:** 25 GB SSD
- **Cost:** ~$5/month
- **OS:** Ubuntu, AlmaLinux, Rocky, Alpine, etc.

### Recommended VPS Specs:

- **CPU:** 2 vCPU
- **RAM:** 2-4 GB
- **Storage:** 50 GB SSD
- **Cost:** ~$10-15/month

---

## 🎉 You're All Set!

Your Emaus application supports **multiple deployment strategies** - choose what works best for your workflow:

- **Local Build:** `build-locally-deploy.sh` - Most reliable
- **GitHub Releases:** `release-from-github.sh` - Best for versioning
- **Direct Build:** `deploy-vultr.sh` - For higher-end VPS

All methods include automatic SSL, nginx configuration, PM2 process management, and database backup scripts.

Step 1: Initial Deployment (HTTP only)
bashCopy# Use the pre-SSL config
cp nginx-pre-ssl.conf nginx.conf

# Deploy your application

DOMAIN_NAME=yourdomain.com ./deploy.sh
Step 2: Setup SSL
bashCopy# Create certbot webroot directory
sudo mkdir -p /var/www/certbot

# Run SSL setup

DOMAIN_NAME=yourdomain.com CERTBOT_EMAIL=your@email.com ./ssl-setup.sh
Step 3: Update to HTTPS config
After SSL is obtained, the certbot will automatically update your nginx config. Or you can manually update it:
bashCopy# Backup current config
sudo cp /etc/nginx/sites-available/emaus /etc/nginx/sites-available/emaus.backup

# Update with the full HTTPS config provided above

# Make sure to replace $DOMAIN_NAME with your actual domain

sudo nano /etc/nginx/sites-available/emaus

# Test and reload

sudo nginx -t
sudo systemctl reload nginx
Testing:
bashCopy# Test HTTP redirect
curl -I http://yourdomain.com

# Test HTTPS

curl -I https://yourdomain.com

# Test SSL certificate

openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Check SSL rating (optional)

# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com

Files to Change Summary:

nginx.conf - Your main nginx configuration (choose pre-SSL or full HTTPS version)
apps/web/.env.production - Update API URL to use HTTPS:
envCopyVITE_API_URL=https://yourdomain.com/api

Auto-conversion Script
Here's a script that automatically converts your nginx config after SSL setup:
convert-to-https.sh:

**Happy deploying! 🚀**
