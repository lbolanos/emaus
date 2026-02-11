# Deployment Documentation Index

Complete guide to all deployment and infrastructure documentation for Emaus.

---

## 🚀 Start Here

### [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md) ⭐ **READ THIS FIRST**

Complete step-by-step guide to deploying Emaus to AWS EC2 with:

- GitHub Actions CI/CD pipeline
- S3 bucket configuration
- Environment setup
- Monitoring and troubleshooting

**Use when:** Deploying the application to production for the first time or subsequent deployments.

---

## 📋 Quick References

### [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)

Quick reference checklist for rapid deployment.

**Use when:** You need a quick reference for deployment steps after reading the full guide.

---

## 🔧 Specific Topics

### [S3 Media Storage Guide](./s3-media-storage.md)

Detailed documentation of S3 storage architecture and implementation.

**Topics covered:**

- Multi-purpose bucket structure (avatars, documents, assets)
- Environment variable configuration
- Bucket setup (automated and manual)
- Image processing pipeline
- Migration from old buckets
- Cost considerations
- Troubleshooting

**Use when:**

- Configuring S3 storage
- Understanding storage architecture
- Migrating from old S3 bucket
- Troubleshooting S3 issues

### [Environment Variables Guide](./ENVIRONMENT_VARIABLES_GUIDE.md)

Complete reference for all environment variables.

**Use when:**

- Setting up .env files
- Understanding what each variable does
- Configuring different environments

### [Google OAuth Setup](./GOOGLE_OAUTH_SETUP.md)

Step-by-step guide to setting up Google OAuth authentication.

**Use when:**

- First-time Google OAuth configuration
- Updating Google OAuth credentials
- Troubleshooting authentication issues

### [Telemetry Setup](./TELEMETRY_SETUP.md)

Guide to setting up InfluxDB and Grafana for monitoring.

**Use when:**

- Setting up monitoring and alerting
- Tracking application metrics
- Viewing performance dashboards

---

## 🏗️ Architecture & Design

### [RBAC Documentation](./RBAC_DOCUMENTATION.md)

Role-Based Access Control system documentation.

**Use when:**

- Understanding user roles and permissions
- Setting up authorization
- Managing user access levels

### [Security Guide](./docs_dev/SECURITY.md)

Security best practices and considerations.

**Use when:**

- Understanding security features
- Implementing secure configurations
- Reviewing security policies

---

## 📚 Alternative Deployment Methods

### [Vultr Deployment README](./VULTR_DEPLOYMENT_README.md)

Guide to deploying on Vultr VPS (alternative to AWS EC2).

**Use when:**

- Deploying to Vultr instead of AWS
- Using alternative VPS provider
- Different infrastructure setup

### [Deployment Guide](./DEPLOYMENT_GUIDE.md) (Legacy)

Legacy deployment guide with multiple options.

**Use when:**

- Looking for alternative deployment strategies
- Pre-built artifact deployments
- GitHub Releases integration

---

## 🧪 Testing & Development

### [Test Commands](./TEST_COMMANDS.md)

Reference for running tests.

**Use when:**

- Running tests locally
- Understanding test structure
- Debugging test failures

### [Avatar Testing Guide](./AVATAR_TESTING_GUIDE.md)

Guide to testing avatar upload and display functionality.

**Use when:**

- Testing S3 avatar uploads
- Debugging avatar issues
- Verifying storage functionality

---

## 📊 Setup & Configuration

### [Environment Setup](./ENVIRONMENT_SETUP.md)

Local development environment setup.

**Use when:**

- First-time development setup
- Configuring local environment
- Setting up dependencies

---

## 📖 How to Use This Documentation

### For Initial Setup

1. Read [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)
2. Use [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md) as you work
3. Reference [Environment Variables Guide](./ENVIRONMENT_VARIABLES_GUIDE.md) as needed

### For S3 Configuration

1. Read [S3 Media Storage Guide](./s3-media-storage.md)
2. Use [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md) Step 4
3. Reference [Avatar Testing Guide](./AVATAR_TESTING_GUIDE.md) to verify

### For Google OAuth

1. Read [Google OAuth Setup](./GOOGLE_OAUTH_SETUP.md)
2. Get credentials from Google Cloud Console
3. Add to [Environment Variables](./ENVIRONMENT_VARIABLES_GUIDE.md)

### For Monitoring

1. Read [Telemetry Setup](./TELEMETRY_SETUP.md)
2. Set up InfluxDB and Grafana
3. Configure dashboard

### For Troubleshooting

1. Check [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md) Common Issues
2. See [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md) Troubleshooting
3. Check [S3 Media Storage Guide](./s3-media-storage.md) if S3-related
4. Review logs: `pm2 logs emaus-api`

---

## 🎯 Deployment Scenarios

### Scenario 1: First-Time Production Deployment

```
1. Read: Production Deployment Guide
2. Follow: Step 1-5 for initial setup
3. Execute: Step 6 to deploy via GitHub Actions
4. Verify: Step 7 to test everything
5. Reference: Deployment Checklist as you go
```

### Scenario 2: Updating Production Code

```
1. Make code changes locally
2. Git commit and push to master
3. GitHub Actions automatically deploys
4. Monitor: GitHub Actions → Actions tab
5. Verify: Check logs with `pm2 logs emaus-api`
```

### Scenario 3: Configuring New Environment

```
1. Read: Environment Setup
2. Reference: Environment Variables Guide
3. Create: .env.production file
4. Follow: Production Deployment Guide Step 3
```

### Scenario 4: Troubleshooting S3 Issues

```
1. Check: S3 Media Storage Guide troubleshooting section
2. Verify: AWS credentials in .env.production
3. Test: Avatar upload functionality
4. Check: S3 bucket contents with AWS CLI
5. Review: PM2 logs for S3 errors
```

---

## 📞 When You Get Stuck

1. **Check the relevant guide** - Most issues are covered
2. **Review the troubleshooting section** of the relevant guide
3. **Check PM2 logs** - `pm2 logs emaus-api`
4. **Check GitHub Actions logs** - See what failed in the workflow
5. **Use Deployment Checklist** - Verify all prerequisites are met

---

## 🔗 Quick Links

| Task                  | Document                                                        |
| --------------------- | --------------------------------------------------------------- |
| Deploy to production  | [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)       |
| Quick reference       | [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)               |
| S3 configuration      | [S3 Media Storage Guide](./s3-media-storage.md)                 |
| Environment variables | [Environment Variables Guide](./ENVIRONMENT_VARIABLES_GUIDE.md) |
| Google OAuth          | [Google OAuth Setup](./GOOGLE_OAUTH_SETUP.md)                   |
| Monitoring            | [Telemetry Setup](./TELEMETRY_SETUP.md)                         |
| Testing               | [Test Commands](./TEST_COMMANDS.md)                             |
| RBAC                  | [RBAC Documentation](./RBAC_DOCUMENTATION.md)                   |
| Security              | [Security Guide](./SECURITY.md)                                 |

---

## 📝 Version Information

- **Current Production Domain**: https://emaus.cc
- **S3 Bucket**: emaus-media
- **Infrastructure**: AWS EC2 (t3.small)
- **Database**: SQLite
- **Framework**: Express.js + Vue.js 3
- **Build Tool**: Vite
- **Process Manager**: PM2

---

## 📚 Additional Resources

### Official Documentation

- [Express.js Documentation](https://expressjs.com/)
- [Vue.js 3 Documentation](https://vuejs.org/)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [PM2 Documentation](https://pm2.io/docs/)

### Project Structure

```
emaus/
├── apps/
│   ├── api/          # Express.js backend
│   └── web/          # Vue.js 3 frontend
├── packages/
│   ├── config/       # Shared ESLint config
│   ├── tsconfig/     # Shared TypeScript config
│   ├── types/        # Shared Zod schemas
│   └── ui/           # Shared Vue components
├── scripts/          # Deployment and utility scripts
├── docs_dev/         # This documentation
└── .github/
    └── workflows/
        └── deploy-production.yml  # GitHub Actions CI/CD
```

---

## 🎓 Learning Path

### For New Developers

1. Read [Environment Setup](./ENVIRONMENT_SETUP.md)
2. Understand [RBAC Documentation](./RBAC_DOCUMENTATION.md)
3. Learn about [S3 Architecture](./s3-media-storage.md)
4. Review [Security Guide](./SECURITY.md)

### For DevOps/Infrastructure

1. Read [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)
2. Review [Telemetry Setup](./TELEMETRY_SETUP.md)
3. Understand [S3 Configuration](./s3-media-storage.md)
4. Learn [Environment Variables](./ENVIRONMENT_VARIABLES_GUIDE.md)

### For Security Review

1. Read [Security Guide](./SECURITY.md)
2. Review [RBAC Documentation](./RBAC_DOCUMENTATION.md)
3. Check [Environment Variables Guide](./ENVIRONMENT_VARIABLES_GUIDE.md)
4. Understand [S3 Bucket Policies](./s3-media-storage.md)

---

**Last Updated**: February 2, 2026

For the most up-to-date information, refer to the individual documentation files.
