#!/bin/bash
set -e

echo "🚀 Creating GitHub Release for Emaus"

# Check for required tools
if ! command -v git &> /dev/null; then
    echo "❌ Git is required but not installed"
    exit 1
fi

# Try to install GitHub CLI if not available
if ! command -v gh &> /dev/null; then
    echo "📦 GitHub CLI not found. Attempting to install..."

    # Detect OS and install accordingly
    if command -v apt-get &> /dev/null; then
        echo "🐧 Installing on Ubuntu/Debian..."
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update && sudo apt install gh -y

    elif command -v dnf &> /dev/null; then
        echo "🐧 Installing on RHEL/AlmaLinux..."
        sudo dnf install gh -y || {
            echo "dnf install failed, trying alternative..."
            sudo rpm --import https://cli.github.com/packages/rpm/gh-cli.repo.key
            sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
            sudo dnf install gh -y
        }

    elif command -v snap &> /dev/null; then
        echo "📦 Installing via snap..."
        sudo snap install gh --classic

    else
        echo "❌ Could not determine package manager. Please install GitHub CLI manually from: https://cli.github.com/"
        echo "Then run: gh auth login"
        exit 1
    fi

    # Verify installation
    if ! command -v gh &> /dev/null; then
        echo "❌ GitHub CLI installation failed. Please install manually."
        exit 1
    fi

    echo "✅ GitHub CLI installed successfully!"
    echo "🔐 Please authenticate with GitHub:"
    echo "gh auth login"
fi

# Check if tag already exists
if git tag --list | grep -q "^$NEW_TAG\$"; then
    echo "❌ Tag $NEW_TAG already exists"
    exit 1
fi

echo "🏷️ Creating release: $NEW_TAG"

# Create git tag
echo "🏷️ Creating git tag..."
git tag -a "$NEW_TAG" -m "Release $NEW_TAG"

# Push tag to trigger GitHub Actions
echo "📤 Pushing tag to GitHub (this will trigger the release workflow)..."
git push origin "$NEW_TAG"

echo "⏳ Waiting for GitHub Actions to complete..."
echo "Check your GitHub repository's Actions tab for build progress:"
echo "https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/actions"

# Check if workflow exists and is properly configured
WORKFLOW_EXISTS=$(curl -s -H "Authorization: token $(gh auth token 2>/dev/null || echo '')" \
  "https://api.github.com/repos/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/contents/.github/workflows/build-release.yml" | grep -q '"name"' && echo "yes" || echo "no")

if [ "$WORKFLOW_EXISTS" = "no" ]; then
    echo "⚠️ Warning: GitHub Actions workflow not found. Make sure .github/workflows/build-release.yml exists and is committed."
fi

# Check authentication status
if ! gh auth status > /dev/null 2>&1; then
    echo ""
    echo "⚠️ GitHub CLI not authenticated. Run: gh auth login"
    echo ""
    echo "Once the release is created, you can deploy with:"
    echo "export GITHUB_REPO=$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')"
    echo "export RELEASE_TAG=$NEW_TAG"
    echo "./release-from-github.sh"
    exit 0
fi

# Wait for workflow to complete (basic check)
echo "🔍 Monitoring GitHub Actions workflow..."
MAX_WAIT=900  # 15 minutes (GitHub Actions timeout is usually 6 hours, but 15 min gives good feedback)
WAIT_TIME=0
WORKFLOW_SUCCESS=false

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    # Check if release exists (success)
    if gh release view "$NEW_TAG" &> /dev/null; then
        echo ""
        echo "✅ Release $NEW_TAG created successfully!"
        echo ""
        echo "📦 Release assets:"
        gh release view "$NEW_TAG" --json assets -q '.assets[].name'
        WORKFLOW_SUCCESS=true
        break
    fi

    # Check workflow runs status (only if we can access API)
    WORKFLOW_URL="https://api.github.com/repos/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/actions/runs?event=push&status="
    WORKFLOW_FAILED=$(curl -s "$WORKFLOW_URL""failed" -H "Authorization: token $(gh auth token 2>/dev/null || echo '')" | jq -r '.total_count // 0' 2>/dev/null || echo "0")
    WORKFLOW_IN_PROGRESS=$(curl -s "$WORKFLOW_URL""in_progress" -H "Authorization: token $(gh auth token 2>/dev/null || echo '')" | jq -r '.total_count // 0' 2>/dev/null || echo "0")

    if [ "$WORKFLOW_FAILED" -gt 0 ]; then
        echo ""
        echo "❌ GitHub Actions workflow failed!"
        echo ""
        echo "🔍 Check the failed workflow:"
        echo "https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/actions"
        echo ""
        echo "💡 Common issues:"
        echo "   - Build errors (check logs)"
        echo "   - Dependency issues"
        echo "   - Memory limits in GitHub Actions"
        echo "   - Missing secrets/tokens"
        exit 1
    elif [ "$WORKFLOW_IN_PROGRESS" -gt 0 ]; then
        # Show helpful message
        ELAPSED_MIN=$((WAIT_TIME / 60))
        echo -ne "\r⏳ Workflow running... (${ELAPSED_MIN}m elapsed)"
    else
        # No workflows found
        echo -ne "\r⏳ Waiting for workflow to start..."
    fi

    sleep 10
    WAIT_TIME=$((WAIT_TIME + 10))
done

if [ "$WORKFLOW_SUCCESS" = false ]; then
    echo ""
    if [ "$WORKFLOW_FAILED" -gt 0 ]; then
        echo "❌ Workflow failed during monitoring"
        exit 1
    else
        echo "⏳ GitHub Actions workflow is still running or taking longer than expected."
        echo ""
        echo "🔍 Check the Actions tab manually:"
        echo "https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/actions"
        echo ""
        echo "You can also check for the release manually:"
        echo "gh release view $NEW_TAG"
        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ Actually, the release was created successfully!"
            echo "📦 Release assets:"
            gh release view "$NEW_TAG" --json assets -q '.assets[].name'
            WORKFLOW_SUCCESS=true
        fi
    fi
fi

if [ "$WORKFLOW_SUCCESS" = true ]; then
    echo ""
    echo "🚀 Ready to deploy to your VPS:"
    echo "export GITHUB_REPO=$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')"
    echo "export RELEASE_TAG=$NEW_TAG"
    echo "scp release-from-github.sh root@YOUR_VPS_IP:/root/"
    echo "ssh root@YOUR_VPS_IP './release-from-github.sh'"
fi
