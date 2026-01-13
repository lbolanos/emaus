#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="${AWS_PROFILE:-emaus}"
AWS_REGION="${AWS_REGION:-us-east-2}"
CREATE_BACKUP="${CREATE_BACKUP:-false}"
FORCE="${FORCE:-false}"

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

# Function to check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Main script starts here
print_header "═══════════════════════════════════════════════════════════"
print_header "🔥 Destroying AWS EC2 Instance for Emaus"
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
    exit 1
fi

# Get instance ID from argument or list
INSTANCE_ID=""
if [ -n "$1" ]; then
    INSTANCE_ID="$1"
else
    print_warning "No instance ID provided"
    echo ""
    echo "Usage:"
    echo "  $0 <instance-id>"
    echo "  $0 <instance-id> --force"
    echo ""
    echo "Available instances:"
    echo ""

    # List instances
    INSTANCES=$(aws ec2 describe-instances \
        --filters "Name=tag:Name,Values=emaus*" "Name=instance-state-name,Values=pending,running,stopped" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --output json 2>/dev/null || echo "[]")

    if command_exists jq; then
        INSTANCE_COUNT=$(echo "$INSTANCES" | jq '.Reservations | length')

        if [ "$INSTANCE_COUNT" -eq 0 ]; then
            print_warning "No Emaus instances found"
            exit 0
        fi

        echo "$INSTANCES" | jq -r '.Reservations[].Instances[] | @json' | while IFS= read -r instance; do
            IID=$(echo "$instance" | jq -r '.InstanceId')
            STATE=$(echo "$instance" | jq -r '.State.Name')
            TYPE=$(echo "$instance" | jq -r '.InstanceType')
            PUBLIC_IP=$(echo "$instance" | jq -r '.PublicIpAddress // "N/A"')
            NAME=$(echo "$instance" | jq -r '.Tags[]? | select(.Key=="Name") | .Value // "Unnamed"')

            printf "  %-15s %-10s %-12s %-15s %s\n" "$IID" "$STATE" "$TYPE" "$PUBLIC_IP" "$NAME"
        done
    else
        echo "$INSTANCES"
    fi

    echo ""
    read -p "Enter instance ID to destroy: " INSTANCE_ID

    if [ -z "$INSTANCE_ID" ]; then
        print_error "No instance ID provided"
        exit 1
    fi
fi

# Validate instance ID format
if [[ ! $INSTANCE_ID =~ ^i-[a-f0-9]{8,}$ ]]; then
    print_error "Invalid instance ID format: $INSTANCE_ID"
    echo "Expected format: i-xxxxxxxxxxxxxxxxx"
    exit 1
fi

# Get instance details
print_status "Getting instance details..."
INSTANCE_INFO=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --output json 2>/dev/null || echo "[]")

if [ "$INSTANCE_INFO" = "[]" ]; then
    print_error "Instance not found: $INSTANCE_ID"
    exit 1
fi

if command_exists jq; then
    STATE=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].State.Name')
    TYPE=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].InstanceType')
    PUBLIC_IP=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].PublicIpAddress // "N/A"')
    NAME=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].Tags[]? | select(.Key=="Name") | .Value // "Unnamed"')
    LAUNCH_TIME=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].LaunchTime')

    print_header "Instance to Destroy:"
    echo "  Instance ID: $INSTANCE_ID"
    echo "  Name: $NAME"
    echo "  State: $STATE"
    echo "  Type: $TYPE"
    echo "  Public IP: $PUBLIC_IP"
    echo "  Launched: $LAUNCH_TIME"
    echo ""
else
    print_status "Instance: $INSTANCE_ID"
fi

# Check if force flag is set
if [ "$FORCE" != "true" ]; then
    print_warning "This action cannot be undone!"
    echo ""
    read -p "Are you sure you want to destroy instance $INSTANCE_ID? (yes/no): " CONFIRM

    if [ "$CONFIRM" != "yes" ]; then
        print_warning "Destruction cancelled"
        exit 0
    fi
fi

# Create backup if requested
if [ "$CREATE_BACKUP" = "true" ] && [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "N/A" ]; then
    print_header "💾 Creating backup before destruction..."

    # Try to SSH and create backup
    if command_exists ssh; then
        KEY_NAME=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].KeyName // "emaus-key"')

        print_status "Attempting to create backup via SSH..."

        # Try to create backup on remote server
        ssh -i "$HOME/.ssh/$KEY_NAME.pem" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
            ubuntu@$PUBLIC_IP "cd /var/www/emaus && tar -czf /tmp/emaus-backup-\$(date +%Y%m%d-%H%M%S).tar.gz . && ls -la /tmp/emaus-backup-*.tar.gz | tail -1" 2>/dev/null || \
            print_warning "Could not create backup via SSH (instance may not be accessible)"
    fi
fi

# Terminate instance
print_header "🔥 Terminating instance..."
print_status "Sending termination request for $INSTANCE_ID..."

aws ec2 terminate-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --output text > /dev/null

print_success "Termination request sent"

# Wait for instance to terminate
print_status "Waiting for instance to terminate..."
aws ec2 wait instance-terminated \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE"

print_success "Instance terminated"

# Check for and release Elastic IP if associated
print_status "Checking for Elastic IP association..."

EIPS=$(aws ec2 describe-addresses \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --output json 2>/dev/null || echo "[]")

if command_exists jq && [ "$EIPS" != "[]" ]; then
    ASSOCIATED_EIP=$(echo "$EIPS" | jq -r ".Addresses[]? | select(.Association?.InstanceId == \"$INSTANCE_ID\") | .AllocationId" || echo "")

    if [ -n "$ASSOCIATED_EIP" ]; then
        print_status "Releasing Elastic IP: $ASSOCIATED_EIP"
        aws ec2 release-address \
            --allocation-id "$ASSOCIATED_EIP" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" > /dev/null
        print_success "Elastic IP released"
    fi
fi

# Display summary
echo ""
print_header "═══════════════════════════════════════════════════════════"
print_success "Instance Destroyed Successfully!"
print_header "═══════════════════════════════════════════════════════════"
echo ""

print_header "📊 Summary:"
echo "  Instance ID: $INSTANCE_ID"
echo "  Name: $NAME"
echo "  Destroyed: $(date)"
echo ""

print_header "📝 Note:"
echo "  - The instance has been terminated"
echo "  - EBS volumes will be deleted (if set to delete on termination)"
echo "  - Any associated Elastic IP has been released"
echo ""

print_header "🔧 Next Steps:"
echo "  - Update DNS records if this was a production instance"
echo "  - Verify all resources are cleaned up in AWS console"
echo "  - Create a new instance: ./deploy/aws/create-ec2.sh"
echo ""
print_header "🎉 Done!"
