#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
MAX_WAIT=1800  # 30 minutes
CHECK_INTERVAL=15  # Check every 15 seconds
WORKFLOW_NAME="Build and Release"
WORKFLOW_FILE="build-release.yml"

# Function to print colored output
print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_header() {
    echo -e "${MAGENTA}$1${NC}"
}

# Function to validate semantic versioning
validate_version() {
    local version=$1
    if [[ ! $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+)?$ ]]; then
        print_error "Invalid version format: $version"
        echo "Version must follow semantic versioning: v<major>.<minor>.<patch>[-<prerelease>]"
        echo "Examples: v1.0.0, v1.2.3, v2.0.0-beta.1, v1.5.0-rc.2"
        return 1
    fi
    return 0
}

# Function to get repository info
get_repo_info() {
    local remote_url=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -z "$remote_url" ]; then
        print_error "Not in a git repository or no origin remote found"
        exit 1
    fi
    
    # Parse GitHub repository from URL
    if [[ $remote_url =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
        echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    else
        print_error "Could not parse GitHub repository from: $remote_url"
        exit 1
    fi
}

# Function to check if we're on the correct branch
check_branch() {
    local current_branch=$(git branch --show-current)
    local default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
    
    if [ "$current_branch" != "$default_branch" ] && [ "$current_branch" != "main" ] && [ "$current_branch" != "master" ]; then
        print_warning "You're on branch '$current_branch', not the default branch '$default_branch'"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Function to check for uncommitted changes
check_working_directory() {
    if ! git diff-index --quiet HEAD --; then
        print_warning "You have uncommitted changes"
        git status --short
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Function to install GitHub CLI
install_gh_cli() {
    print_status "GitHub CLI not found. Attempting to install..."

    if command -v apt-get &> /dev/null; then
        print_status "Installing on Ubuntu/Debian..."
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update && sudo apt install gh -y

    elif command -v dnf &> /dev/null; then
        print_status "Installing on RHEL/Fedora/AlmaLinux..."
        sudo dnf install gh -y || {
            print_status "Trying alternative installation method..."
            sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
            sudo dnf install gh -y
        }

    elif command -v brew &> /dev/null; then
        print_status "Installing via Homebrew..."
        brew install gh

    elif command -v snap &> /dev/null; then
        print_status "Installing via snap..."
        sudo snap install gh

    else
        print_error "Could not determine package manager"
        echo "Please install GitHub CLI manually from: https://cli.github.com/"
        echo "Then run: gh auth login"
        exit 1
    fi

    if ! command -v gh &> /dev/null; then
        print_error "GitHub CLI installation failed"
        exit 1
    fi

    print_success "GitHub CLI installed successfully!"
}

# Function to check GitHub authentication
check_gh_auth() {
    if ! gh auth status &> /dev/null; then
        print_warning "GitHub CLI not authenticated"
        echo ""
        echo "Please authenticate with GitHub:"
        echo "  gh auth login"
        echo ""
        read -p "Authenticate now? (Y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            gh auth login
        else
            print_error "GitHub authentication required to continue"
            exit 1
        fi
    fi
}

# Function to check if workflow file exists
check_workflow_file() {
    local workflow_path=".github/workflows/$WORKFLOW_FILE"
    
    if [ ! -f "$workflow_path" ]; then
        print_error "Workflow file not found: $workflow_path"
        echo ""
        echo "Please ensure the GitHub Actions workflow is set up:"
        echo "  1. Create .github/workflows/$WORKFLOW_FILE"
        echo "  2. Configure it to trigger on tag push (tags: v*.*.*)"
        echo "  3. Commit and push the workflow file"
        exit 1
    fi
    
    print_success "Workflow file found: $workflow_path"
}

# Function to get latest tag
get_latest_tag() {
    git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"
}

# Function to suggest next version
suggest_next_version() {
    local latest=$(get_latest_tag)
    
    if [[ $latest =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
        local major="${BASH_REMATCH[1]}"
        local minor="${BASH_REMATCH[2]}"
        local patch="${BASH_REMATCH[3]}"
        
        echo ""
        print_header "Current version: $latest"
        echo "Suggested versions:"
        echo "  Patch: v$major.$minor.$((patch + 1))"
        echo "  Minor: v$major.$((minor + 1)).0"
        echo "  Major: v$((major + 1)).0.0"
        echo ""
    fi
}

# Function to monitor workflow
monitor_workflow() {
    local tag=$1
    local repo=$2
    local wait_time=0
    local last_status=""
    local run_id=""
    
    print_header "Monitoring GitHub Actions workflow..."
    
    # Give GitHub a moment to register the tag
    sleep 5
    
    while [ $wait_time -lt $MAX_WAIT ]; do
        local elapsed_min=$((wait_time / 60))
        local elapsed_sec=$((wait_time % 60))
        
        # Try to find the workflow run
        local run_info=$(gh run list \
            --repo "$repo" \
            --workflow="$WORKFLOW_NAME" \
            --limit 5 \
            --json databaseId,status,conclusion,headBranch,displayTitle,createdAt,url \
            2>/dev/null || echo "[]")
        
        if [ "$run_info" = "[]" ] || [ -z "$run_info" ]; then
            if [ $wait_time -eq 0 ]; then
                print_status "Waiting for workflow to start..."
            fi
            sleep $CHECK_INTERVAL
            wait_time=$((wait_time + CHECK_INTERVAL))
            continue
        fi
        
        # Find run for this tag
        local tag_run=$(echo "$run_info" | jq -r ".[] | select(.headBranch == \"$tag\") | @json" | head -n 1)
        
        if [ -n "$tag_run" ]; then
            local status=$(echo "$tag_run" | jq -r '.status')
            local conclusion=$(echo "$tag_run" | jq -r '.conclusion')
            local run_url=$(echo "$tag_run" | jq -r '.url')
            local current_run_id=$(echo "$tag_run" | jq -r '.databaseId')
            
            # Store run ID for later use
            if [ -z "$run_id" ]; then
                run_id=$current_run_id
                print_success "Found workflow run: $run_url"
            fi
            
            # Only print status if it changed
            if [ "$status" != "$last_status" ]; then
                case $status in
                    "queued")
                        print_status "Workflow queued (${elapsed_min}m ${elapsed_sec}s)"
                        ;;
                    "in_progress")
                        print_status "Workflow in progress (${elapsed_min}m ${elapsed_sec}s)"
                        ;;
                    "completed")
                        case $conclusion in
                            "success")
                                print_success "Workflow completed successfully!"
                                return 0
                                ;;
                            "failure")
                                print_error "Workflow failed"
                                echo "View logs: $run_url"
                                return 1
                                ;;
                            "cancelled")
                                print_warning "Workflow was cancelled"
                                return 1
                                ;;
                            "timed_out")
                                print_error "Workflow timed out"
                                return 1
                                ;;
                            *)
                                print_warning "Workflow completed with status: $conclusion"
                                return 1
                                ;;
                        esac
                        ;;
                esac
                last_status=$status
            else
                # Print periodic updates
                if [ $((wait_time % 60)) -eq 0 ] && [ $wait_time -gt 0 ]; then
                    echo -ne "\r⏳ Still ${status}... (${elapsed_min}m ${elapsed_sec}s elapsed)   "
                fi
            fi
        else
            if [ $((wait_time % 30)) -eq 0 ]; then
                print_status "Waiting for workflow to start... (${elapsed_min}m ${elapsed_sec}s)"
            fi
        fi
        
        sleep $CHECK_INTERVAL
        wait_time=$((wait_time + CHECK_INTERVAL))
    done
    
    print_warning "Workflow monitoring timed out after $((MAX_WAIT / 60)) minutes"
    return 2
}

# Main script starts here
print_header "═══════════════════════════════════════════════════════════"
print_header "🚀 GitHub Release Creator for Emaus"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# Check if NEW_TAG is provided
if [ -z "$NEW_TAG" ]; then
    suggest_next_version
    print_error "NEW_TAG environment variable is required"
    echo ""
    echo "Usage:"
    echo "  NEW_TAG=v1.0.0 $0"
    echo ""
    echo "Or interactively:"
    read -p "Enter new version tag (e.g., v1.0.0): " NEW_TAG
    
    if [ -z "$NEW_TAG" ]; then
        print_error "No version provided"
        exit 1
    fi
fi

# Validate version format
validate_version "$NEW_TAG" || exit 1

# Check for required tools
print_status "Checking prerequisites..."

if ! command -v git &> /dev/null; then
    print_error "Git is required but not installed"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    print_warning "jq not found (recommended for better workflow monitoring)"
    read -p "Install jq? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y jq
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y jq
        elif command -v brew &> /dev/null; then
            brew install jq
        fi
    fi
fi

# Install and configure GitHub CLI if needed
if ! command -v gh &> /dev/null; then
    install_gh_cli
fi

check_gh_auth

# Get repository information
REPO=$(get_repo_info)
print_success "Repository: $REPO"

# Perform safety checks
print_status "Performing safety checks..."
check_branch
check_working_directory
check_workflow_file

# Check if tag already exists locally
if git tag --list | grep -q "^$NEW_TAG\$"; then
    print_error "Tag $NEW_TAG already exists locally"
    read -p "Delete and recreate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d "$NEW_TAG"
        print_success "Local tag deleted"
    else
        exit 1
    fi
fi

# Check if tag exists on remote
if git ls-remote --tags origin | grep -q "refs/tags/$NEW_TAG$"; then
    print_error "Tag $NEW_TAG already exists on remote"
    read -p "Delete remote tag and continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push origin --delete "$NEW_TAG"
        print_success "Remote tag deleted"
    else
        exit 1
    fi
fi

# Show what will be included in the release
echo ""
print_header "Release Information:"
echo "  Tag: $NEW_TAG"
echo "  Repository: $REPO"
echo "  Branch: $(git branch --show-current)"
echo "  Commit: $(git rev-parse --short HEAD)"
echo ""

# Get release notes
read -p "Add release notes? (Y/n): " -n 1 -r
echo
RELEASE_NOTES=""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "Enter release notes (end with Ctrl+D):"
    RELEASE_NOTES=$(cat)
fi

# Final confirmation
echo ""
read -p "Create release $NEW_TAG? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    print_warning "Release cancelled"
    exit 0
fi

# Create git tag
print_status "Creating git tag..."
if [ -n "$RELEASE_NOTES" ]; then
    git tag -a "$NEW_TAG" -m "Release $NEW_TAG" -m "$RELEASE_NOTES"
else
    git tag -a "$NEW_TAG" -m "Release $NEW_TAG"
fi
print_success "Tag created: $NEW_TAG"

# Push tag to trigger GitHub Actions
print_status "Pushing tag to GitHub..."
git push origin "$NEW_TAG"
print_success "Tag pushed successfully"

echo ""
print_header "GitHub Actions workflow triggered!"
echo "View workflow: https://github.com/$REPO/actions"
echo ""

# Monitor workflow
if monitor_workflow "$NEW_TAG" "$REPO"; then
    echo ""
    print_header "═══════════════════════════════════════════════════════════"
    print_success "Release created successfully!"
    print_header "═══════════════════════════════════════════════════════════"
    echo ""
    
    # Display release information
    if gh release view "$NEW_TAG" --repo "$REPO" &> /dev/null; then
        print_header "📦 Release Assets:"
        gh release view "$NEW_TAG" --repo "$REPO" --json assets -q '.assets[] | "  - \(.name) (\(.size / 1024 / 1024 | floor)MB)"'
        echo ""
        
        print_header "🔗 Release URL:"
        echo "  https://github.com/$REPO/releases/tag/$NEW_TAG"
        echo ""
    fi
    
    print_header "🚀 Deploy to VPS:"
    echo ""
    echo "  export GITHUB_REPO=$REPO"
    echo "  export RELEASE_TAG=$NEW_TAG"
    echo "  ./release-from-github.sh"
    echo ""
    echo "Or copy and run remotely:"
    echo ""
    echo "  scp release-from-github.sh root@YOUR_VPS_IP:/root/"
    echo "  ssh root@YOUR_VPS_IP 'export GITHUB_REPO=$REPO RELEASE_TAG=$NEW_TAG && ./release-from-github.sh'"
    echo ""
    
elif [ $? -eq 2 ]; then
    # Timeout
    print_warning "Workflow monitoring timed out"
    echo ""
    echo "The workflow may still be running. Check manually:"
    echo "  https://github.com/$REPO/actions"
    echo ""
    echo "Once complete, you can verify the release:"
    echo "  gh release view $NEW_TAG --repo $REPO"
else
    # Failure
    print_error "Workflow failed"
    echo ""
    echo "Check the logs at:"
    echo "  https://github.com/$REPO/actions"
    echo ""
    echo "You may need to:"
    echo "  1. Fix the issue"
    echo "  2. Delete the tag: git push origin --delete $NEW_TAG"
    echo "  3. Try again"
    exit 1
fi