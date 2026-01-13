#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="${AWS_PROFILE:-emaus}"
AWS_REGION="${AWS_REGION:-us-east-2}"

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

print_header() {
    echo -e "${MAGENTA}$1${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Main script starts here
print_header "═══════════════════════════════════════════════════════════"
print_header "📋 Listing AWS EC2 Instances for Emaus"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# Check if AWS CLI is installed
if ! command_exists aws; then
    print_error "AWS CLI is not installed"
    exit 1
fi

# Check if AWS profile exists
if ! aws configure get region --profile "$AWS_PROFILE" &> /dev/null; then
    print_error "AWS profile '$AWS_PROFILE' not found"
    echo ""
    echo "Available profiles:"
    aws configure list-profiles 2>/dev/null || echo "No profiles found"
    exit 1
fi

print_status "Using AWS profile: $AWS_PROFILE"
print_status "Region: $AWS_REGION"
echo ""

# Get instances with emaus tag (or all instances)
print_status "Fetching EC2 instances..."
echo ""

# Get all instances with their details
INSTANCES=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=emaus*" "Name=instance-state-name,Values=pending,running,stopped,stopping" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --output json 2>/dev/null || echo "[]")

# Check if jq is installed for pretty output
if ! command_exists jq; then
    print_warning "jq not found. Install for better output: sudo apt install jq"
    echo ""
    echo "$INSTANCES" | python3 -m json.tool 2>/dev/null || echo "$INSTANCES"
    exit 0
fi

# Parse and display instances
INSTANCE_COUNT=$(echo "$INSTANCES" | jq '.Reservations | length')

if [ "$INSTANCE_COUNT" -eq 0 ]; then
    print_warning "No Emaus instances found"
    echo ""
    echo "To create a new instance, run:"
    echo "  ./deploy/aws/create-ec2.sh"
    exit 0
fi

echo -e "${CYAN}Found $INSTANCE_INSTANCE_COUNT instance(s)${NC}"
echo ""

# Print table header
printf "${MAGENTA}%-12s %-12s %-18s %-15s %-20s %-10s${NC}\n" \
    "Instance ID" "State" "Type" "Public IP" "Name" "Launched"

# Print separator
printf "%-12s %-12s %-18s %-15s %-20s %-10s\n" \
    "------------" "------------" "------------------" "---------------" "--------------------" "----------"

# Process each instance
echo "$INSTANCES" | jq -r '.Reservations[].Instances[] | @json' | while IFS= read -r instance; do
    INSTANCE_ID=$(echo "$instance" | jq -r '.InstanceId')
    STATE=$(echo "$instance" | jq -r '.State.Name')
    TYPE=$(echo "$instance" | jq -r '.InstanceType')
    PUBLIC_IP=$(echo "$instance" | jq -r '.PublicIpAddress // "N/A"')
    LAUNCH_TIME=$(echo "$instance" | jq -r '.LaunchTime' | cut -d'T' -f1)
    NAME=$(echo "$instance" | jq -r '.Tags[]? | select(.Key=="Name") | .Value // "Unnamed"')

    # Color code state
    STATE_COLOR="$NC"
    case $STATE in
        "running")
            STATE_COLOR="$GREEN"
            ;;
        "stopped")
            STATE_COLOR="$RED"
            ;;
        "stopping"|"pending")
            STATE_COLOR="$YELLOW"
            ;;
    esac

    printf "%-12s ${STATE_COLOR}%-12s${NC} %-18s %-15s %-20s %-10s\n" \
        "$INSTANCE_ID" "$STATE" "$TYPE" "$PUBLIC_IP" "$NAME" "$LAUNCH_TIME"
done

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Show commands for running instances
RUNNING_INSTANCES=$(echo "$INSTANCES" | jq -r '[.Reservations[].Instances[] | select(.State.Name=="running")] | length')
if [ "$RUNNING_INSTANCES" -gt 0 ]; then
    print_header "🔐 SSH Commands for Running Instances:"
    echo ""
    echo "$INSTANCES" | jq -r '.Reservations[].Instances[] | select(.State.Name=="running") | @json' | while IFS= read -r instance; do
        INSTANCE_ID=$(echo "$instance" | jq -r '.InstanceId')
        PUBLIC_IP=$(echo "$instance" | jq -r '.PublicIpAddress')
        KEY_NAME=$(echo "$instance" | jq -r '.KeyName')
        NAME=$(echo "$instance" | jq -r '.Tags[]? | select(.Key=="Name") | .Value // "Unnamed"')

        echo -e "${BLUE}$NAME ($INSTANCE_ID):${NC}"
        echo "  ssh -i ~/.ssh/$KEY_NAME.pem ubuntu@$PUBLIC_IP"
        echo ""
    done
fi

print_header "🔧 Useful Commands:"
echo "  Create instance:  ./deploy/aws/create-ec2.sh"
echo "  Destroy instance: ./deploy/aws/destroy-ec2.sh <instance-id>"
echo "  View in console:  https://$AWS_REGION.console.aws.amazon.com/ec2/"
echo ""

# Save instance list to file
echo "$INSTANCES" | jq -r '.Reservations[].Instances[] | "\(.InstanceId)\t\(.State.Name)\t\(.PublicIpAddress // "N/A")\t\(.Tags[]? | select(.Key=="Name") | .Value // "Unnamed")"' > /tmp/emaus-instances.txt

print_success "Instance list saved to: /tmp/emaus-instances.txt"
