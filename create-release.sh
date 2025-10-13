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

    # Check workflow runs status (only if we can access API)
    echo "🔍 Checking workflow status..."

    WORKFLOW_URL="https://api.github.com/repos/$(git remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/\(.*\)\.git/\1\/\2/')/actions/runs?per_page=10"

    # Try to get workflow run for this specific tag
    GITHUB_TOKEN=$(gh auth token 2>/dev/null)
    if [ $? -ne 0 ] || [ -z "$GITHUB_TOKEN" ]; then
        echo "❌ Unable to get GitHub token"
        WORKFLOW_DATA=""
    else
        WORKFLOW_DATA=$(curl -s "$WORKFLOW_URL" -H "Authorization: token $GITHUB_TOKEN" 2>/dev/null)
    fi

    if [ $? -eq 0 ] && [ -n "$WORKFLOW_DATA" ]; then
        # Extract workflow run for the specific tag (try both current HEAD and tag name)
        CURRENT_SHA=$(git rev-parse HEAD)

        # First try to find exact match for current tag or SHA (look for tag push events)
        RUN_DATA=$(echo "$WORKFLOW_DATA" | jq -r ".workflow_runs[] | select(.head_sha == \"$CURRENT_SHA\" or (.head_branch == \"$NEW_TAG\" and .event == \"push\") or (.event == \"push\" and (.head_branch | contains(\"$NEW_TAG\")))) | {id: .id, status: .status, conclusion: .conclusion, html_url: .html_url, jobs_url: .jobs_url}" 2>/dev/null | head -1)

        # If no exact match found, look for the most recent "Build and Release" workflow
        if [ -z "$RUN_DATA" ] || [ "$RUN_DATA" = "null" ]; then
            echo "🔍 No exact match found, looking for most recent Build and Release workflow..."
            RUN_DATA=$(echo "$WORKFLOW_DATA" | jq -r '.workflow_runs[] | select(.name == "Build and Release") | {id: .id, status: .status, conclusion: .conclusion, html_url: .html_url, jobs_url: .jobs_url}' 2>/dev/null | head -1)
        fi

        if [ -n "$RUN_DATA" ] && [ "$RUN_DATA" != "null" ]; then
            STATUS=$(echo "$RUN_DATA" | jq -r '.status // empty' 2>/dev/null || echo "unknown")
            CONCLUSION=$(echo "$RUN_DATA" | jq -r '.conclusion // empty' 2>/dev/null || echo "unknown")
            HTML_URL=$(echo "$RUN_DATA" | jq -r '.html_url // empty' 2>/dev/null || echo "")
            JOBS_URL=$(echo "$RUN_DATA" | jq -r '.jobs_url // empty' 2>/dev/null || echo "")

            echo "📊 Workflow Status: $STATUS, Conclusion: $CONCLUSION"

            # If workflow is in progress or failed, fetch job details
            if [ "$STATUS" = "in_progress" ] || [ "$STATUS" = "queued" ] || [ "$CONCLUSION" = "failure" ]; then
                if [ -n "$JOBS_URL" ] && [ "$JOBS_URL" != "null" ]; then
                    echo "🔍 Fetching job details..."
                    JOBS_DATA=$(curl -s "$JOBS_URL" -H "Authorization: token $GITHUB_TOKEN" 2>/dev/null)

                    if [ $? -eq 0 ] && [ -n "$JOBS_DATA" ]; then
                        echo "📋 Job Status:"
                        echo "$JOBS_DATA" | jq -r '.jobs[] | "  • \(.name): \(.status) \(.conclusion // "running")"' 2>/dev/null || echo "  Could not fetch job details"

                        # Show currently running or recently failed job
                        CURRENT_JOB=$(echo "$JOBS_DATA" | jq -r '.jobs[] | select(.status == "in_progress" or (.status == "completed" and .conclusion == "failure")) | .name' 2>/dev/null | head -1)
                        if [ -n "$CURRENT_JOB" ] && [ "$CURRENT_JOB" != "null" ]; then
                            echo "🎯 Current focus: $CURRENT_JOB"
                        fi
                    else
                        echo "  Could not fetch job details"
                    fi
                fi
            fi

            if [ "$CONCLUSION" = "failure" ] || [ "$CONCLUSION" = "timed_out" ] || [ "$CONCLUSION" = "action_required" ]; then
                echo ""
                echo "❌ GitHub Actions workflow failed!"
                echo ""
                if [ -n "$HTML_URL" ]; then
                    echo "🔍 Check the failed workflow:"
                    echo "$HTML_URL"
                fi
                echo ""
                echo "💡 Check the Actions tab in your GitHub repository for error logs"
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
            echo "⏳ Looking for workflow run..."
            echo "DEBUG: WORKFLOW_DATA length: $(echo "$WORKFLOW_DATA" | wc -c)"
            echo "DEBUG: Current SHA: $CURRENT_SHA"
            echo "DEBUG: Looking for tag: $NEW_TAG"
            echo "DEBUG: API response preview:"
            echo "$WORKFLOW_DATA" | head -c 200
            echo ""
            echo "DEBUG: Total workflow runs: $(echo "$WORKFLOW_DATA" | jq -r '.total_count // 0' 2>/dev/null || echo "0")"
        fi
    else
        echo "⚠️ Could not access GitHub API"
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
