# Environment Configuration Setup

This document explains how to set up environment variables for the Emaus application in different deployment scenarios.

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | API endpoint URL | `https://emaus.cc/api` |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key | `AIzaSy...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |

## Setup Methods

### 1. Repository Secrets (Recommended)

For GitHub Actions, set up repository secrets:

1. Go to your GitHub repository
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add `VITE_GOOGLE_MAPS_API_KEY` with your Google Maps API key

### 2. Environment Variables (.env files)

#### Development
Create `apps/web/.env.development`:
```bash
VITE_API_URL=http://localhost:3001/api
VITE_GOOGLE_MAPS_API_KEY=your-dev-key
```

#### Staging
Create `apps/web/.env.staging`:
```bash
VITE_API_URL=https://staging.emaus.cc/api
VITE_GOOGLE_MAPS_API_KEY=your-staging-key
```

#### Production
Copy the example file and add your values:
```bash
cp apps/web/.env.production.example apps/web/.env.production
# Edit apps/web/.env.production with your actual values
```

### 3. Shell Environment (Deploy Script)

When using `release-from-github.sh`:

```bash
export VITE_API_URL=https://your-api-domain.com/api
export VITE_GOOGLE_MAPS_API_KEY=your-google-maps-key
./release-from-github.sh
```

## Google Maps API Key Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new API key or use an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Geocoding API
   - Places API
4. Copy the API key to your environment variables

## GitHub Actions Workflow

The GitHub workflow (`.github/workflows/build-release.yml`) now:

✅ **Sets default API URL**: `VITE_API_URL=https://emaus.cc/api`
✅ **Uses repository secret**: `VITE_GOOGLE_MAPS_API_KEY` from secrets
✅ **Builds with environment variables**: All variables available during build
✅ **Documents setup**: Release notes include environment variable instructions

## Runtime Configuration

The application uses a sophisticated runtime configuration system that:

🔄 **Detects Environment Automatically**
- Development: localhost, 127.0.0.1, ports 5173, 8080, 3000
- Staging: domains containing 'staging' or 'stg'
- Production: all other domains

🌐 **Supports Runtime Changes**
- `window.getEmausConfig()` - Get current configuration
- `window.updateEmausConfig()` - Update configuration at runtime
- Environment detection happens automatically

🛡️ **Security Best Practices**
- No hardcoded API keys in source code
- Environment variables passed at build/deployment time
- Runtime config generated dynamically
- Sensitive values kept in repository secrets

## Testing Environment Configuration

Use the test page to verify configuration:
```bash
# Start development server
python3 -m http.server 8080

# Open test page
http://localhost:8080/test-runtime-config.html
```

This will show:
- Detected environment
- Current API URL
- Google Maps API key status
- Runtime update functionality