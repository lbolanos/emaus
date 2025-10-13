# VPS Deployment Guide for Emaus

This guide provides step-by-step instructions for deploying the Emaus Retreat Logistics Management System to any VPS provider that supports the following operating systems:

- **Ubuntu/Debian** (recommended)
- **AlmaLinux 8**
- **Rocky Linux**
- **Alpine Linux**
- **CentOS/RHEL**
- **FreeBSD**
- **OpenBSD**

## Prerequisites

- VPS account with billing enabled (Vultr, DigitalOcean, Linode, etc.)
- Domain name (optional but recommended)
- SSH access to your local machine
- SSH key pair for secure server access (see SSH Setup below)

### SSH Key Setup (Required for Security)

Before provisioning your VPS, set up SSH keys for secure password-less access:

**On your local machine:**
```bash
# Generate SSH key pair (if you don't have one)
ssh-keygen -t ed25519 -C "your-email@example.com"

# Copy public key to clipboard
cat ~/.ssh/id_ed25519.pub

# Or use the ssh-copy-id utility (easiest method):
# ssh-copy-id root@YOUR_SERVER_IP
```

**Alternative - Using ssh-copy-id:**
```bash
# Install if not available
sudo apt install openssh-client  # Ubuntu/Debian
sudo dnf install openssh-clients  # RHEL/AlmaLinux

# Copy key to server
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@YOUR_SERVER_IP
```

**Test SSH access:**
```bash
# Try connecting without password
ssh root@YOUR_SERVER_IP

# Should connect automatically with your key
```

## Step 1: Provision VPS

### Vultr (Recommended)
1. **Log into Vultr**
   - Go to https://vultr.com/
   - Sign in to your account

2. **Create a new Cloud Compute instance**
   - Click "Deploy" → "Cloud Compute"
   - Server Type: Ubuntu 22.04 LTS x64 (or AlmaLinux 8 x64, Rocky Linux, Alpine Linux)
   - Server Location: Choose closest to your users (e.g., New Jersey, Miami, or California)
   - Server Size: $5/month plan (1 vCPU, 1GB RAM, 25GB SSD) - perfect for basic setup
   - Additional Features: Enable IPv6 (optional), Backups (recommended for production)

3. **Configure SSH**
   - Add your SSH key for secure access
   - Note the server IP address after creation

### Other Providers
The deployment scripts work with any VPS provider that offers:
- **Ubuntu 22.04 LTS** (easiest setup)
- **AlmaLinux 8 x64** (great alternative)
- **Rocky Linux** (RHEL-compatible)
- **Alpine Linux** (lightweight)
- **CentOS Stream 9** (legacy support)

## Step 2: Initial Server Setup

1. **Connect to your VPS**
   ```bash
   ssh root@YOUR_SERVER_IP
   ```

2. **Set environment variables**
   ```bash
   #export database_password='YOUR_STRONG_DB_PASSWORD'
   #export api_url='https://yourdomain.com'
   export frontend_url='https://yourdomain.com'   
   export domain_name='yourdomain.com'
   ```

3. **Run the setup script**
   ```bash
   # Download and run setup script
   curl -fsSL https://raw.githubusercontent.com/lbolanos/emaus/master/setup-vultr.sh | bash
   ```

   This will automatically detect your OS and install:
   - Node.js 20
   - PostgreSQL database server
   - Nginx web server
   - Firewall (UFW/firewalld)
   - pnpm package manager
   - SSL certificate tools

   **Supported Operating Systems:**
   - 🐧 Ubuntu/Debian (recommended)
   - 🐧 AlmaLinux 8 / Rocky Linux
   - 🐧 CentOS / RHEL
   - 🐧 Alpine Linux
   - 🐧 FreeBSD
   - 🐧 OpenBSD

## Step 3: Deploy Application

1. **Clone your repository**
   ```bash
   cd /var/www/emaus
   git clone https://github.com/lbolanos/emaus.git .
   ```

2. **Configure environment variables**
   Edit the environment files:
   ```bash
   # Edit API environment (apps/api/.env)
   nano apps/api/.env
   # Replace $database_password with your actual password
   # Replace $frontend_url with your domain

   # Edit web environment (apps/web/.env)
   nano apps/web/.env
   # Replace $api_url with your domain
   ```

3. **Run deployment script**
   ```bash
   # Make sure environment variables are still set
   export database_password='YOUR_STRONG_DB_PASSWORD'
   export frontend_url='https://yourdomain.com'
   export domain_name='yourdomain.com'

   bash deploy-vultr.sh
   ```

## Step 4: SSL Configuration (Optional but Recommended)

If you have a domain name:

1. **Configure DNS**
   - Point your domain A record to your Vultr server IP
   - Add www CNAME record if needed

2. **Setup SSL with Let's Encrypt**
   ```bash
   export domain_name='yourdomain.com'
   bash ssl-setup.sh
   ```

## Step 5: Verify Deployment

1. **Check application status**
   ```bash
   # Check if services are running
   pm2 status
   sudo systemctl status nginx
   sudo systemctl status postgresql

   # Check API health
   curl http://localhost:3001/health

   # Check web app
   curl http://localhost/health
   ```

2. **Access your application**
   - Web app: https://yourdomain.com (or http://server-ip)
   - API: https://yourdomain.com/api (or http://server-ip/api)

## Step 6: Production Checklist

- [ ] Database connection working
- [ ] Web app loads correctly
- [ ] API responds to requests
- [ ] SSL certificate installed (if configured)
- [ ] Login functionality works
- [ ] Email/SMTP configured correctly

## Maintenance

### Daily Backups
```bash
# Run daily database backup
bash backup-db.sh

# Optional: Setup cron job for automated backups
crontab -e
# Add: 0 2 * * * /var/www/emaus/backup-db.sh
```

### Updates
```bash
# Update server packages monthly
sudo apt update && sudo apt upgrade -y

# Restart services after updates
pm2 restart all
sudo systemctl reload nginx
```

### Monitoring
```bash
# Check logs
pm2 logs
sudo tail -f /var/log/nginx/emaus-access.log
sudo tail -f /var/log/nginx/emaus-error.log

# Monitor system resources
htop
df -h
```

## Troubleshooting

### Common Issues

**API not starting**
```bash
cd /var/www/emaus
pm2 logs emaus-api
# Check for database connection errors
```

**Web app shows "Cannot connect to API"**
```bash
# Check API is running
curl http://localhost:3001/health
# Check environment variables in apps/web/.env
```

**SSL certificate issues**
```bash
sudo certbot certificates
sudo certbot renew
```

### Performance Tuning

For the basic $5/month plan:
- The app is configured to handle ~100-200 concurrent users
- If you need more capacity, consider upgrading to $10/month plan

## Cost Summary

- **Vultr VPS**: $5/month
- **Domain**: ~$12/year
- **SSL**: Free (Let's Encrypt)
- **Total**: ~$17/year + electricity

## Security Notes

- SSH access is restricted to your key
- UFW firewall blocks unused ports
- Regular updates are required
- Change default passwords immediately
- Monitor logs regularly

## Support

If you encounter issues:
1. Check the logs using `pm2 logs`
2. Verify environment variables are set correctly
3. Ensure database is accessible: `sudo -u postgres psql -d emaus`
4. Check system resources: `htop`

For the latest deployment scripts, check the GitHub repository.
