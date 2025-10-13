#!/bin/bash
set -e

echo "🏠 Building on local machine, deploying to VPS"

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the project root directory"
    exit 1
fi

# Check for required environment variables
if [ -z "$VPS_HOST" ] || [ -z "$VPS_USER" ]; then
    echo "❌ Error: Set VPS_HOST and VPS_USER environment variables"
    echo "Example: export VPS_HOST=your-server-ip VPS_USER=root"
    exit 1
fi

echo "🔨 Building locally with full memory..."
echo "This may take a few minutes..."

# Build using normal high-memory build
pnpm build

# Create deployment package
echo "📦 Creating deployment package..."
DEPLOY_DIR="deploy_$(date +%Y%m%d_%H%M%S)"
mkdir -p $DEPLOY_DIR

# Copy built assets
cp -r apps/api/dist $DEPLOY_DIR/api-dist
cp -r apps/web/dist $DEPLOY_DIR/web-dist

# Copy required runtime files
cp package.json $DEPLOY_DIR/
cp pnpm-lock.yaml $DEPLOY_DIR/
cp -r apps/api/package.json $DEPLOY_DIR/api-package.json

echo "🚀 Deploying to VPS: $VPS_USER@$VPS_HOST"

# Deploy to VPS
rsync -avz --delete -e "ssh -o StrictHostKeyChecking=no" \
    $DEPLOY_DIR/ \
    $VPS_USER@$VPS_HOST:/var/www/emaus/deploy/

# Run deployment script on VPS
echo "⚙️ Running deployment script on VPS..."
ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST << 'EOF'
cd /var/www/emaus

echo "📦 Installing production dependencies..."
export NODE_OPTIONS="--max-old-space-size=256"
# Install only production dependencies
pnpm install --frozen-lockfile --prod --reporter=append-only

echo "🔨 Building API..."
# Copy built API
cp -r deploy/api-dist/* apps/api/
cp deploy/api-package.json apps/api/package.json

echo "🔨 Copying web build..."
# Copy built web app
rm -rf apps/web/dist
cp -r deploy/web-dist apps/web/dist

echo "✅ Pre-built deployment complete!"
echo "🌐 Your application should be available at http://$VPS_HOST"

EOF

# Cleanup
rm -rf $DEPLOY_DIR

echo "✅ Local build and VPS deployment completed!"
echo "Access your app at: http://$VPS_HOST"
