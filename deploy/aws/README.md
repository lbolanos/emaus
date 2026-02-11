# AWS Deployment Scripts for Emaus

This directory contains automated scripts for deploying the Emaus retreat logistics management system to AWS EC2 instances running Ubuntu 24.04 LTS.

## Prerequisites

### Local Machine

- AWS CLI installed and configured with profile `emaus`
- AWS credentials with EC2 permissions
- SSH key pair (or script will create one)

### AWS Profile

The scripts use the `emaus` AWS profile by default. To set it up:

```bash
aws configure --profile emaus
```

Required IAM permissions:

- `ec2:*` (full EC2 access)
- `elasticip:*` (for Elastic IP management)

## Scripts Overview

| Script                       | Purpose                            | Location                 | Run On           |
| ---------------------------- | ---------------------------------- | ------------------------ | ---------------- |
| `create-ec2.sh`              | Provision new EC2 instance         | Local machine            | Local            |
| `list-ec2.sh`                | List all Emaus instances           | Local machine            | Local            |
| `destroy-ec2.sh`             | Terminate an instance              | Local machine            | Local            |
| `setup-aws.sh`               | Bootstrap server with dependencies | EC2 instance             | Remote (SSH)     |
| `deploy-aws.sh`              | Deploy from GitHub release         | EC2 instance             | Remote (SSH)     |
| `aws-release-from-github.sh` | Deploy from GitHub release         | EC2 instance             | Remote (SSH)     |
| `diagnose.sh`                | Run system diagnostics             | EC2 instance             | Remote (SSH)     |
| `emaus-user-data.sh`         | Cloud-init script                  | EC2 instance (user data) | Auto (at launch) |

## Quick Start

### 1. Create EC2 Instance

From your local machine:

```bash
cd deploy/aws

# Optional: Set environment variables
export AWS_REGION=us-east-2          # Default: us-east-2
export INSTANCE_TYPE=t3.micro        # Options: t3.micro (Free Tier), t3.small, t3.medium
export KEY_NAME=emaus-key            # Default: emaus-key
export ALLOCATE_EIP=true             # Default: false

# Create instance
./create-ec2.sh
```

This will output the instance ID and public IP.

### 2. SSH into the Instance

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@<PUBLIC_IP>
```

### 3. Run Setup (First Time Only)

```bash
cd /var/www/emaus/deploy/aws
./setup-aws.sh
```

This installs Node.js, pnpm, PM2, Nginx, and other dependencies.

### 4. Deploy the Application

```bash
# Set environment variables
export RELEASE_TAG=v1.0.0               # GitHub release tag to deploy
export DOMAIN_NAME=yourdomain.com       # Optional: enables SSL with Let's Encrypt
export VITE_GOOGLE_MAPS_API_KEY=your-key  # Optional

# Deploy from GitHub release
./deploy-aws.sh
```

**Note**: The deployment script will:

- Download pre-built artifacts from GitHub releases
- Configure Nginx (always configured, with or without domain)
- Automatically obtain SSL certificate if `DOMAIN_NAME` is set
- Start the application with PM2

## Ongoing Deployments

### Create a New Release

From your local machine:

```bash
# Create and push a new release tag
NEW_TAG=v1.0.2 ./create-release.sh
```

This will build the application and create a GitHub release with the artifacts.

### Deploy from GitHub Release

On the AWS instance:

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@<INSTANCE_IP>

cd /var/www/emaus/deploy/aws

# Set environment variables
export RELEASE_TAG=v1.0.1              # Version to deploy
export DOMAIN_NAME=yourdomain.com     # Optional: for SSL setup

# Deploy the release
./deploy-aws.sh
```

**Note**: `deploy-aws.sh` and `aws-release-from-github.sh` serve the same purpose. You can use either one.

## Environment Variables

### For create-ec2.sh

| Variable        | Description          | Default     |
| --------------- | -------------------- | ----------- |
| `AWS_PROFILE`   | AWS CLI profile name | `emaus`     |
| `AWS_REGION`    | AWS region           | `us-east-2` |
| `INSTANCE_TYPE` | EC2 instance type    | `t3.medium` |
| `KEY_NAME`      | SSH key pair name    | `emaus-key` |
| `SG_NAME`       | Security group name  | `emaus-sg`  |
| `ALLOCATE_EIP`  | Allocate Elastic IP  | `false`     |
| `TAG_NAME`      | Instance tag name    | `emaus`     |

### For deploy-aws.sh / aws-release-from-github.sh

| Variable                   | Description                                        | Default                | Required |
| -------------------------- | -------------------------------------------------- | ---------------------- | -------- |
| `RELEASE_TAG`              | GitHub release version to deploy                   | -                      | Yes      |
| `DOMAIN_NAME`              | Domain name for SSL (triggers automatic SSL setup) | -                      | No       |
| `VITE_API_URL`             | Frontend API URL                                   | `https://emaus.cc/api` | No       |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key                                | Empty                  | No       |
| `API_PORT`                 | API server port                                    | `3001`                 | No       |

## Managing Instances

### List All Instances

```bash
./list-ec2.sh
```

Output shows instance ID, state, type, public IP, and SSH command.

### Destroy an Instance

```bash
# Interactive (prompts for confirmation)
./destroy-ec2.sh <instance-id>

# Force destroy without confirmation
./destroy-ec2.sh <instance-id> --force

# Create backup before destroying
CREATE_BACKUP=true ./destroy-ec2.sh <instance-id>
```

## Using Cloud-Init (User Data)

To automatically run setup on instance launch, pass the user data script:

```bash
aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.medium \
  --key-name emaus-key \
  --user-data file://emaus-user-data.sh \
  ...
```

Or modify `create-ec2.sh` to include user data automatically.

## Architecture

### EC2 Instance Specifications

- **OS**: Ubuntu 24.04 LTS
- **Instance Type**: t3.medium (2 vCPU, 4GB RAM)
- **Storage**: 8-25GB SSD (gp2/gp3)
- **Security Group**: Ports 22 (SSH), 80 (HTTP), 443 (HTTPS)

### Application Stack

- **Frontend**: Vue.js 3 + Vite (served by Nginx)
- **Backend**: Express.js + Node.js 20 (managed by PM2)
- **Database**: SQLite (file-based)
- **Process Manager**: PM2
- **Web Server**: Nginx with SSL
- **SSL**: Let's Encrypt with Certbot

### Directory Structure

```
/var/www/emaus/
├── apps/
│   ├── api/
│   │   ├── dist/          # Built backend
│   │   ├── database.sqlite
│   │   └── .env.production
│   └── web/
│       ├── dist/          # Built frontend
│       └── .env.production
├── deploy/aws/            # Deployment scripts
├── ecosystem.config.js    # PM2 configuration
├── nginx.conf             # Nginx template
└── .deployment-info       # Deployment metadata
```

## Cost Estimate

| Service                           | Cost (USD)                                         |
| --------------------------------- | -------------------------------------------------- |
| EC2 t3.micro (Free Tier eligible) | $0-12/month\*                                      |
| EC2 t3.medium                     | ~$30/month                                         |
| Elastic IP                        | ~$3.60/month (if not attached to running instance) |
| Data Transfer (100GB)             | Free                                               |
| SSL Certificate                   | Free (Let's Encrypt)                               |
| **Total**                         | **~$0-40/month**                                   |

\*Free Tier: 750 hours/month for 12 months. After Free Tier expires: ~$12/month.

## Troubleshooting

### Instance Not Accessible

1. Check security group rules:

   ```bash
   ./list-ec2.sh
   ```

2. Verify firewall on instance:
   ```bash
   ssh ubuntu@<INSTANCE_IP> "sudo ufw status"
   ```

### Deployment Failed

1. Check PM2 logs:

   ```bash
   ssh ubuntu@<INSTANCE_IP> "pm2 logs emaus-api"
   ```

2. Check Nginx logs:

   ```bash
   ssh ubuntu@<INSTANCE_IP> "sudo tail -f /var/log/nginx/error.log"
   ```

3. Check application logs:
   ```bash
   ssh ubuntu@<INSTANCE_IP> "sudo tail -f /var/log/emaus/api-error.log"
   ```

### Health Check Failed

1. Verify API is running:

   ```bash
   ssh ubuntu@<INSTANCE_IP> "curl http://localhost:3001/health"
   ```

2. Restart PM2:
   ```bash
   ssh ubuntu@<INSTANCE_IP> "pm2 restart emaus-api"
   ```

### SSL Certificate Issues

1. Renew certificate:

   ```bash
   ssh ubuntu@<INSTANCE_IP> "sudo certbot renew"
   ```

2. Reconfigure Nginx with Certbot:
   ```bash
   ssh ubuntu@<INSTANCE_IP> "sudo certbot --nginx -d yourdomain.com"
   ```

### Run Diagnostics

For comprehensive system diagnostics, use the `diagnose.sh` script:

```bash
ssh -i ~/.ssh/emaus-key.pem ubuntu@<INSTANCE_IP>

cd /var/www/emaus/deploy/aws
./diagnose.sh
```

This will check:

- System information (uptime, memory, disk)
- PM2 process status and logs
- API health endpoints
- Nginx configuration and status
- Environment variables
- File permissions
- Database status
- Network ports
- Recent error logs
- API dependencies

## Security Best Practices

1. **SSH Keys**: Never use password authentication
2. **Security Groups**: Restrict SSH access to your IP only
3. **Updates**: Keep system and packages updated
4. **Backups**: Regular database backups to S3
5. **Monitoring**: Set up CloudWatch alarms
6. **SSL**: Always use HTTPS in production

## Backup and Recovery

### Database Backup

```bash
# Manual backup
ssh ubuntu@<INSTANCE_IP> "cp /var/www/emaus/apps/api/database.sqlite /var/www/emaus-backups/"

# Automated backup (add to crontab)
0 2 * * * cp /var/www/emaus/apps/api/database.sqlite /var/www/emaus-backups/db-$(date +\%Y\%m\%d).sqlite
```

### Create AMI

```bash
aws ec2 create-image \
  --instance-id <INSTANCE_ID> \
  --name "emaus-backup-$(date +%Y%m%d)" \
  --profile emaus \
  --region us-east-2
```

## Migration from Vultr

Key differences from Vultr deployment:

| Feature    | Vultr           | AWS                      |
| ---------- | --------------- | ------------------------ |
| OS         | Ubuntu 22.04    | Ubuntu 24.04 LTS         |
| Static IP  | Included        | Elastic IP (extra cost)  |
| Firewall   | UFW only        | Security Group + UFW     |
| CLI        | Vultr CLI       | AWS CLI                  |
| Console    | Vultr Dashboard | AWS Console              |
| Deployment | Git-based build | GitHub release artifacts |

To migrate:

1. Create AWS instance with `create-ec2.sh`
2. Copy database from Vultr: `scp root@vultr-ip:/var/www/emaus/apps/api/database.sqlite .`
3. Upload to AWS: `scp database.sqlite ubuntu@aws-ip:/var/www/emaus/apps/api/`
4. Copy `.env.production` from Vultr to AWS
5. Deploy application: `./deploy-aws.sh` (with `DOMAIN_NAME` for SSL)
6. Update DNS A records

### File Migration Commands

Copy `.env.production` and `database.sqlite` from Vultr to AWS:

```bash
# Copy .env.production
scp -i ~/.ssh/id_ed25519 root@155.138.230.215:/var/www/emaus/apps/api/.env.production /tmp/emaus-env-prod
scp -i ~/.ssh/emaus-key.pem /tmp/emaus-env-prod ubuntu@3.138.49.105:/tmp/
ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105 "sudo mv /tmp/emaus-env-prod /var/www/emaus/apps/api/.env.production && sudo chown ubuntu:ubuntu /var/www/emaus/apps/api/.env.production"
rm /tmp/emaus-env-prod

# Copy database.sqlite
scp -i ~/.ssh/id_ed25519 root@155.138.230.215:/var/www/emaus/apps/api/database.sqlite /tmp/emaus-db.sqlite
scp -i ~/.ssh/emaus-key.pem /tmp/emaus-db.sqlite ubuntu@3.138.49.105:/tmp/
ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105 "sudo mv /tmp/emaus-db.sqlite /var/www/emaus/apps/api/database.sqlite && sudo chown ubuntu:ubuntu /var/www/emaus/apps/api/database.sqlite"
rm /tmp/emaus-db.sqlite

# Restart application
ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105 "cd /var/www/emaus && pm2 restart emaus-api && pm2 save"
```

## Support

For issues or questions:

- Check logs: `pm2 logs emaus-api`
- Run diagnostics: `./diagnose.sh`
- AWS Console: https://us-east-2.console.aws.amazon.com/ec2/
- Project documentation: See main project README

## Here are all the commands I used to copy files from Vultr to AWS:

Step 1: Copy .env.production from Vultr → Local → AWS

# Vultr to local

scp -i ~/.ssh/id_ed25519 root@155.138.230.215:/var/www/emaus/apps/api/.env.production /tmp/emaus-env-prod

# Local to AWS (via /tmp due to permissions)

scp -i ~/.ssh/emaus-key.pem /tmp/emaus-env-prod ubuntu@3.138.49.105:/tmp/
ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105 "sudo mv /tmp/emaus-env-prod /var/www/emaus/apps/api/.env.production && sudo chown ubuntu:ubuntu /var/www/emaus/apps/api/.env.production"

# Cleanup local

rm /tmp/emaus-env-prod

Step 2: Copy database.sqlite from Vultr → Local → AWS

# Vultr to local

scp -i ~/.ssh/id_ed25519 root@155.138.230.215:/var/www/emaus/apps/api/database.sqlite /tmp/emaus-db.sqlite

# Local to AWS (via /tmp due to permissions)

scp -i ~/.ssh/emaus-key.pem /tmp/emaus-db.sqlite ubuntu@3.138.49.105:/tmp/
ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105 "sudo mv /tmp/emaus-db.sqlite /var/www/emaus/apps/api/database.sqlite && sudo chown ubuntu:ubuntu /var/www/emaus/apps/api/database.sqlite"

# Cleanup local

rm /tmp/emaus-db.sqlite

Step 3: Restart application on AWS

ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105 "cd /var/www/emaus && pm2 restart emaus-api && pm2 save"

All-in-one script (for future use)

#!/bin/bash

# Copy files from Vultr to AWS

VULTR_HOST="root@155.138.230.215"
AWS_HOST="ubuntu@3.138.49.105"
VULTR_KEY="~/.ssh/id_ed25519"
AWS_KEY="~/.ssh/emaus-key.pem"

# Copy .env.production

echo "Copying .env.production..."
scp -i "$VULTR_KEY" $VULTR_HOST:/var/www/emaus/apps/api/.env.production /tmp/emaus-env-prod
  scp -i "$AWS_KEY" /tmp/emaus-env-prod $AWS_HOST:/tmp/
  ssh -i "$AWS_KEY" $AWS_HOST "sudo mv /tmp/emaus-env-prod /var/www/emaus/apps/api/.env.production && sudo chown ubuntu:ubuntu /var/www/emaus/apps/api/.env.production"
rm /tmp/emaus-env-prod

# Copy database.sqlite

echo "Copying database.sqlite..."
scp -i "$VULTR_KEY" $VULTR_HOST:/var/www/emaus/apps/api/database.sqlite /tmp/emaus-db.sqlite
  scp -i "$AWS_KEY" /tmp/emaus-db.sqlite $AWS_HOST:/tmp/
  ssh -i "$AWS_KEY" $AWS_HOST "sudo mv /tmp/emaus-db.sqlite /var/www/emaus/apps/api/database.sqlite && sudo chown ubuntu:ubuntu /var/www/emaus/apps/api/database.sqlite"
rm /tmp/emaus-db.sqlite

# Restart application

echo "Restarting application..."
ssh -i "$AWS_KEY" $AWS_HOST "cd /var/www/emaus && pm2 restart emaus-api && pm2 save && pm2 status"

echo "✅ Migration complete!"
