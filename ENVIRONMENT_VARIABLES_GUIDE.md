# Environment Variables Placement Guide

This guide explains **where and how** to set up environment variables for the Emaus application in different deployment scenarios.

## 🚨 Important: Environment Variables Must Be Set BEFORE Running Scripts

Environment variables must be available **before** the deployment script runs, not after!

## ✅ Correct Placement

### 1. Shell Environment (Recommended for Production)

Set variables **before** running the deployment script:

```bash
# ✅ CORRECT - Set environment FIRST
export VITE_API_URL=https://your-api-domain.com/api
export VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key

# Then run deployment script
./release-from-github.sh
```

### 2. Repository Secrets (GitHub Actions)

Add to GitHub repository settings **before** running workflow:

```yaml
# ✅ CORRECT - In GitHub Actions environment section
env:
  VITE_API_URL: https://your-api-domain.com/api
  VITE_GOOGLE_MAPS_API_KEY: ${{ secrets.VITE_GOOGLE_MAPS_API_KEY }}
```

### 3. Configuration Files

Create `.env` files **before** building:

```bash
# ✅ CORRECT - Configuration files are read during build/deployment
# apps/web/.env.production
VITE_API_URL=https://your-api-domain.com/api
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key

# apps/api/.env
DB_TYPE=sqlite
SESSION_SECRET=your-session-secret
```

## ❌ Incorrect Placement

### Inside Scripts (After Script Starts)

Environment variables set **inside** deployment scripts won't work for the build process:

```bash
# ❌ INCORRECT - Too late, build already completed
./release-from-github.sh

# This won't affect the already-built configuration:
export VITE_API_URL=https://your-api-domain.com/api
```

### In Wrong Files

Variables in files that aren't read by the build process:

```bash
# ❌ INCORRECT - This file isn't used during deployment
# random-file.txt
VITE_API_URL=https://your-api-domain.com/api
```

## 🔧 How Environment Variables Flow Works

### Build Time (GitHub Actions)
```
GitHub Secrets → Environment Variables → Vite Build Process → Built Application
```

### Deployment Time (Manual)
```
Shell Environment → Deployment Script → Runtime Config Generation → Application
```

### Runtime (Application)
```
Runtime Config → Environment Detection → Dynamic Configuration → Live Application
```

## 📁 Environment Variables Sources (Priority Order)

### For Web Frontend (`apps/web/`)

1. **Runtime Environment Variables** (highest priority)
   ```bash
   export VITE_API_URL=https://prod.example.com/api
   export VITE_GOOGLE_MAPS_API_KEY=your-key
   ./release-from-github.sh
   ```

2. **Build-time Variables** (`VITE_*` prefixed)
   ```bash
   # apps/web/.env.production
   VITE_API_URL=https://prod.example.com/api
   VITE_GOOGLE_MAPS_API_KEY=your-key
   pnpm build
   ```

3. **Runtime Detection Fallback** (automatic)
   - Production: `https://emaus.cc/api`
   - Staging: `https://staging.emaus.cc/api`
   - Development: `http://localhost:3001/api`

### For API Backend (`apps/api/`)

1. **Configuration Files**
   ```bash
   # apps/api/.env
   DB_TYPE=sqlite
   DB_DATABASE=database.sqlite
   SESSION_SECRET=your-secret
   NODE_ENV=production
   ```

2. **Default Fallbacks**
   - SQLite database: `database.sqlite`
   - Session secret: Random string (warning)
   - Environment: `production`

## 🎯 Deployment Script Flow Analysis

### Current `release-from-github.sh` Flow

```bash
# ✅ CORRECT - Environment variables available during config generation
VITE_API_URL=${VITE_API_URL:-https://emaus.cc/api}
VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY:-}

# Runtime config is generated HERE with these variables
cat > apps/web/dist/runtime-config.js << EOF
window.EMAUS_RUNTIME_CONFIG = {
    apiUrl: '$(get_api_url production)',        # ✅ Uses environment variable
    googleMapsApiKey: '$VITE_GOOGLE_MAPS_API_KEY',   # ✅ Uses environment variable
    // ...
};
EOF
```

### Line 227 Where You Selected

```bash
# Line 227 in release-from-github.sh
VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY:-}
```

This line is **correctly placed** because:
- ✅ It's read before runtime config generation
- ✅ Used in the `cat > runtime-config.js` heredoc
- ✅ Available during configuration file creation

## 🚀 Quick Setup Commands

### Production Deployment

```bash
# Method 1: Environment variables (recommended)
export VITE_API_URL=https://your-domain.com/api
export VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key
./release-from-github.sh

# Method 2: Configuration file
cp apps/web/.env.production.example apps/web/.env.production
# Edit apps/web/.env.production with your values
./release-from-github.sh

# Method 3: GitHub Actions
# Set VITE_GOOGLE_MAPS_API_KEY as repository secret
# Push tag to trigger build
```

### Development

```bash
# Create development environment
cp apps/web/.env.production.example apps/web/.env.development
# Edit with development values
pnpm dev
```

## 🔍 Troubleshooting

### Environment Variables Not Working

1. **Check Timing**
   ```bash
   # Verify variables are set BEFORE running script
   echo "API_URL: $VITE_API_URL"
   echo "Maps Key: ${VITE_GOOGLE_MAPS_API_KEY:0:10}..."
   ./release-from-github.sh
   ```

2. **Check File Permissions**
   ```bash
   # Ensure .env files have correct permissions
   chmod 600 apps/web/.env.production
   ls -la apps/web/.env*
   ```

3. **Verify Runtime Config**
   ```bash
   # Check generated runtime config file
   cat apps/web/dist/runtime-config.js | grep -E "(apiUrl|googleMapsApiKey)"
   ```

### Google Maps API Key Issues

1. **API Key Format**: Must start with `AIza`
2. **API Restrictions**: Set HTTP referrers in Google Cloud Console
3. **Environment Mismatch**: Ensure key matches target environment

### Common Mistakes to Avoid

❌ **Setting variables AFTER script runs**
❌ **Using wrong file locations**
❌ **Forgetting to export in subshells**
❌ **Incorrect variable names (VITE_ prefix required for frontend)**
❌ **Not setting GitHub repository secrets**

## ✅ Best Practice Summary

1. **Set environment variables BEFORE running deployment scripts**
2. **Use repository secrets for sensitive values in CI/CD**
3. **Create .env.production files for persistent configuration**
4. **Test with the provided test files:**
   - `test-runtime-config.html` for quick verification
   - `test-config.html` for comprehensive testing
5. **Check runtime-config.js generation in deployment logs**

Remember: **Environment variables must be available when the runtime configuration file is generated, not afterwards!**