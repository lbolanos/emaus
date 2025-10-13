#!/bin/bash
set -e

# Check if NEW_TAG is provided
if [ -z "$NEW_TAG" ]; then
    echo "❌ NEW_TAG environment variable is required"
    echo "Usage: NEW_TAG=v0.0.3 ./create-release.sh"
    exit 1
fi

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
MAX_WAIT=1800  # 30 minutes (GitHub Actions timeout is usually 6 hours, but 30 min gives good feedback)
WAIT_TIME=0
WORKFLOW_SUCCESS=false
WORKFLOW_FAILED=false

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    echo "🔄 Task: Monitoring GitHub Actions workflow for release $NEW_TAG ($(date +%H:%M:%S))"

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

    # Check workflow runs status using GitHub CLI (simpler and more reliable)
    echo "🔍 Checking workflow status..."

    # Try to find recent Build and Release workflows
    if gh run list --workflow="Build and Release" --limit=3 --json=status,conclusion,headBranch,displayTitle &>/dev/null; then
        WORKFLOW_INFO=$(gh run list --workflow="Build and Release" --limit=3 --json=status,conclusion,headBranch,displayTitle)

        # Look for workflow matching our tag
        if echo "$WORKFLOW_INFO" | jq -e ".[] | select(.headBranch == \"$NEW_TAG\")" &>/dev/null; then
            # Found workflow for this tag
            STATUS=$(echo "$WORKFLOW_INFO" | jq -r ".[] | select(.headBranch == \"$NEW_TAG\") | .status")
            CONCLUSION=$(echo "$WORKFLOW_INFO" | jq -r ".[] | select(.headBranch == \"$NEW_TAG\") | .conclusion")
            echo "📊 Workflow Status: $STATUS, Conclusion: $CONCLUSION"
        else
            # Get the most recent Build and Release workflow
            STATUS=$(echo "$WORKFLOW_INFO" | jq -r ".[0].status // empty")
            CONCLUSION=$(echo "$WORKFLOW_INFO" | jq -r ".[0].conclusion // empty")
            echo "📊 Latest Build and Release workflow - Status: $STATUS, Conclusion: $CONCLUSION"
        fi

        # Check if workflow failed
        if [ "$CONCLUSION" = "failure" ] || [ "$CONCLUSION" = "timed_out" ] || [ "$CONCLUSION" = "action_required" ]; then
            echo ""
            echo "❌ GitHub Actions workflow failed!"
            echo ""
            echo "🔍 Check the Actions tab for details:"
            echo "https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/actions"
            WORKFLOW_FAILED=true
            break
        elif [ "$STATUS" = "completed" ] && [ "$CONCLUSION" = "success" ]; then
            echo "✅ Workflow completed successfully!"
            WORKFLOW_SUCCESS=true
            break
        elif [ "$STATUS" = "in_progress" ] || [ "$STATUS" = "queued" ]; then
            ELAPSED_MIN=$((WAIT_TIME / 60))
            echo "⏳ Workflow in progress... (${ELAPSED_MIN}m elapsed)"
        fi
    else
        echo "⚠️ Could not access workflow information via GitHub CLI"
        echo "⏸️ Monitoring disabled - check repository manually"
        # Give some extra time when API access fails
        MAX_WAIT=300  # Reduce wait time when we can't monitor
    fi

    sleep 10
    WAIT_TIME=$((WAIT_TIME + 10))
done

if [ "$WORKFLOW_SUCCESS" = false ]; then
    echo ""
    if [ "$WORKFLOW_FAILED" = true ]; then
        echo "❌ Workflow failed during monitoring"
        exit 1
    else
        echo "⏳ GitHub Actions workflow is still running or taking longer than expected."
        echo ""
        echo "🔍 Check the Actions tab manually:"
        echo "https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/actions"
        echo ""
        echo "You can also check for the release manually:"
        if gh release view "$NEW_TAG" &> /dev/null; then
            echo ""
            echo "✅ Actually, the release was created successfully!"
            echo "📦 Release assets:"
            gh release view "$NEW_TAG" --json assets -q '.assets[].name'
            WORKFLOW_SUCCESS=true
        else
            echo "gh release view $NEW_TAG"
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
