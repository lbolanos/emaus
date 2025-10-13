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
echo "🔍 Monitoring release creation..."
MAX_WAIT=600  # 10 minutes
WAIT_TIME=0

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    # Check if release exists
    if gh release view "$NEW_TAG" &> /dev/null; then
        echo ""
        echo "✅ Release $NEW_TAG created successfully!"
        echo ""
        echo "📦 Release assets:"
        gh release view "$NEW_TAG" --json assets -q '.assets[].name'

        echo ""
        echo "🚀 To deploy to your VPS:"
        echo "export GITHUB_REPO=$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')"
        echo "export RELEASE_TAG=$NEW_TAG"
        echo "scp release-from-github.sh root@YOUR_VPS_IP:/root/"
        echo "ssh root@YOUR_VPS_IP './release-from-github.sh'"
        break
    fi

    echo -n "."
    sleep 10
    WAIT_TIME=$((WAIT_TIME + 10))
done

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
    echo ""
    echo "⏳ Release creation is taking longer than expected."
    echo "Check the GitHub Actions tab manually:"
    echo "https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/actions"
fi
