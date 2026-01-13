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
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.medium}"
KEY_NAME="${KEY_NAME:-emaus-key}"
SG_NAME="${SG_NAME:-emaus-sg}"
TAG_NAME="${TAG_NAME:-emaus}"
ALLOCATE_EIP="${ALLOCATE_EIP:-false}"

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
print_header "🚀 Creating AWS EC2 Instance for Emaus"
print_header "═══════════════════════════════════════════════════════════"
echo ""

# Check if AWS CLI is installed
if ! command_exists aws; then
    print_error "AWS CLI is not installed"
    echo "Install it from: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if AWS profile exists
print_status "Checking AWS profile: $AWS_PROFILE"
if ! aws configure get region --profile "$AWS_PROFILE" &> /dev/null; then
    print_error "AWS profile '$AWS_PROFILE' not found"
    echo ""
    echo "Available profiles:"
    aws configure list-profiles 2>/dev/null || echo "No profiles found"
    echo ""
    echo "Create profile with: aws configure --profile $AWS_PROFILE"
    exit 1
fi

print_success "AWS profile '$AWS_PROFILE' found"

# Display configuration
print_header "Configuration:"
echo "  AWS Profile: $AWS_PROFILE"
echo "  AWS Region: $AWS_REGION"
echo "  Instance Type: $INSTANCE_TYPE"
echo "  Key Name: $KEY_NAME"
echo "  Security Group: $SG_NAME"
echo "  Tag Name: $TAG_NAME"
echo "  Allocate Elastic IP: $ALLOCATE_EIP"
echo ""

# Show estimated cost
print_header "Estimated Monthly Cost:"
case $INSTANCE_TYPE in
    t2.micro|t3.micro)
        echo "  Instance: Free Tier eligible"
        ;;
    t2.small|t3.small)
        echo "  Instance: ~$15/month"
        ;;
    t2.medium|t3.medium)
        echo "  Instance: ~$30/month"
        ;;
    *)
        echo "  Instance: Check pricing for $INSTANCE_TYPE"
        ;;
esac
if [ "$ALLOCATE_EIP" = "true" ]; then
    echo "  Elastic IP: ~$3.60/month (if attached to stopped instance)"
fi
echo ""

# Ask for confirmation
read -p "Continue with this configuration? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    print_warning "Cancelled"
    exit 0
fi

# Check if key pair exists
print_status "Checking key pair: $KEY_NAME"
KEY_EXISTS=$(aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" 2>/dev/null && echo "true" || echo "false")

if [ "$KEY_EXISTS" = "false" ]; then
    print_warning "Key pair '$KEY_NAME' not found"
    echo ""
    read -p "Create new key pair '$KEY_NAME'? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        print_status "Creating key pair: $KEY_NAME"
        aws ec2 create-key-pair \
            --key-name "$KEY_NAME" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --output json > "/tmp/$KEY_NAME.json"

        # Extract private key and save to file
        jq -r '.KeyMaterial' "/tmp/$KEY_NAME.json" > "$HOME/.ssh/$KEY_NAME.pem"
        chmod 600 "$HOME/.ssh/$KEY_NAME.pem"
        rm "/tmp/$KEY_NAME.json"

        print_success "Key pair created and saved to: $HOME/.ssh/$KEY_NAME.pem"
    else
        print_error "Key pair is required to continue"
        exit 1
    fi
else
    print_success "Key pair '$KEY_NAME' exists"
fi

# Function to find latest AMI for a specific Ubuntu version
find_ami() {
    local version=$1
    local codename=$2

    # Try with full path first
    local ami_id=$(aws ec2 describe-images \
        --owners 099720109477 \
        --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-$codename-*-amd64-server-*" "Name=state,Values=available" \
        --query "sort_by(Images, &CreationDate)[-1].ImageId" \
        --output text \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" 2>/dev/null || echo "")

    # Fallback to simpler pattern if full path doesn't work
    if [ -z "$ami_id" ] || [ "$ami_id" = "None" ]; then
        ami_id=$(aws ec2 describe-images \
            --owners 099720109477 \
            --filters "Name=name,Values=*$codename*amd64*server*" "Name=architecture,Values=x86_64" "Name=state,Values=available" \
            --query "sort_by(Images, &CreationDate)[-1].ImageId" \
            --output text \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" 2>/dev/null || echo "")
    fi

    echo "$ami_id"
}

# Get latest Ubuntu AMI (try 24.04 first, fallback to 22.04)
print_header "🔍 Finding latest Ubuntu AMI..."

# Try Ubuntu 24.04 LTS (Noble) first
print_status "Looking for Ubuntu 24.04 LTS (Noble)..."
AMI_ID=$(find_ami "24.04" "noble-24.04")

# Fallback to Ubuntu 22.04 LTS (Jammy) if 24.04 not found
if [ -z "$AMI_ID" ] || [ "$AMI_ID" = "None" ]; then
    print_warning "Ubuntu 24.04 not found in region $AWS_REGION"
    print_status "Falling back to Ubuntu 22.04 LTS (Jammy)..."
    AMI_ID=$(find_ami "22.04" "jammy-22.04")
fi

if [ -z "$AMI_ID" ] || [ "$AMI_ID" = "None" ]; then
    print_error "Could not find any Ubuntu AMI in region $AWS_REGION"
    echo ""
    echo "Try using a different region with: export AWS_REGION=us-east-1"
    exit 1
fi

# Detect which version was found
if [[ $AMI_ID == *noble* ]]; then
    UBUNTU_VERSION="24.04 LTS (Noble)"
else
    UBUNTU_VERSION="22.04 LTS (Jammy)"
fi

print_success "Found Ubuntu $UBUNTU_VERSION AMI: $AMI_ID"

# Create or get security group
print_status "Checking security group: $SG_NAME"
SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SG_NAME" \
    --query "SecurityGroups[0].GroupId" \
    --output text \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" 2>/dev/null || echo "")

if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
    print_status "Creating security group: $SG_NAME"
    SG_ID=$(aws ec2 create-security-group \
        --group-name "$SG_NAME" \
        --description "Emaus security group" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query "GroupId" \
        --output text)

    print_success "Security group created: $SG_ID"

    # Add inbound rules
    print_status "Configuring security group rules..."
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" 2>/dev/null || print_warning "SSH rule may already exist"

    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" 2>/dev/null || print_warning "HTTP rule may already exist"

    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" 2>/dev/null || print_warning "HTTPS rule may already exist"

    print_success "Security group rules configured"
else
    print_success "Security group exists: $SG_ID"
fi

# Launch instance
print_header "🚀 Launching EC2 instance..."
print_status "This may take a minute..."

INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$TAG_NAME},{Key=Environment,Value=production}]" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --query "Instances[0].InstanceId" \
    --output text)

print_success "Instance launched: $INSTANCE_ID"

# Wait for instance to be running
print_status "Waiting for instance to be running..."
aws ec2 wait instance-running \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE"

print_success "Instance is running"

# Get instance details
print_status "Getting instance details..."
INSTANCE_INFO=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE")

PUBLIC_IP=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].PublicIpAddress // "N/A"')
PRIVATE_IP=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].PrivateIpAddress // "N/A"')
AVAILABILITY_ZONE=$(echo "$INSTANCE_INFO" | jq -r '.Reservations[0].Instances[0].Placement.AvailabilityZone')

# Allocate Elastic IP if requested
EIP_ALLOCATION_ID=""
if [ "$ALLOCATE_EIP" = "true" ]; then
    print_status "Allocating Elastic IP..."
    ALLOCATION_ID=$(aws ec2 allocate-address \
        --domain vpc \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query "AllocationId" \
        --output text)

    aws ec2 associate-address \
        --instance-id "$INSTANCE_ID" \
        --allocation-id "$ALLOCATION_ID" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" > /dev/null

    # Get new public IP (Elastic IP)
    PUBLIC_IP=$(aws ec2 describe-addresses \
        --allocation-ids "$ALLOCATION_ID" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --query "Addresses[0].PublicIp" \
        --output text)

    EIP_ALLOCATION_ID=" (Elastic IP: $ALLOCATION_ID)"
    print_success "Elastic IP allocated: $PUBLIC_IP"
fi

# Display deployment summary
echo ""
print_header "═══════════════════════════════════════════════════════════"
print_success "EC2 Instance Created Successfully!"
print_header "═══════════════════════════════════════════════════════════"
echo ""

print_header "📊 Instance Information:"
echo "  Instance ID: $INSTANCE_ID"
echo "  Instance Type: $INSTANCE_TYPE"
echo "  Public IP: $PUBLIC_IP$EIP_ALLOCATION_ID"
echo "  Private IP: $PRIVATE_IP"
echo "  Availability Zone: $AVAILABILITY_ZONE"
echo "  Region: $AWS_REGION"
echo ""

print_header "🔐 SSH Connection:"
echo "  ssh -i ~/.ssh/$KEY_NAME.pem ubuntu@$PUBLIC_IP"
echo ""

print_header "📋 Next Steps:"
echo "  1. Copy the setup script to the instance:"
echo "     scp -i ~/.ssh/$KEY_NAME.pem deploy/aws/setup-aws.sh ubuntu@$PUBLIC_IP:/home/ubuntu/"
echo ""
echo "  2. SSH into the instance:"
echo "     ssh -i ~/.ssh/$KEY_NAME.pem ubuntu@$PUBLIC_IP"
echo ""
echo "  3. Run the setup script:"
echo "     chmod +x setup-aws.sh && ./setup-aws.sh"
echo ""
echo "  4. Set environment variables and deploy:"
echo "     export DOMAIN_NAME=yourdomain.com"
echo "     cd /var/www/emaus/deploy/aws && ./deploy-aws.sh"
echo ""

print_header "🔧 Useful Commands:"
echo "  List instances:  ./deploy/aws/list-ec2.sh"
echo "  Destroy instance: ./deploy/aws/destroy-ec2.sh $INSTANCE_ID"
echo "  View in console:  https://$AWS_REGION.console.aws.amazon.com/ec2/"
echo ""

# Save instance info to file
cat > "/tmp/emaus-ec2-$INSTANCE_ID.txt" << EOF
Instance ID: $INSTANCE_ID
Public IP: $PUBLIC_IP
Private IP: $PRIVATE_IP
Key Name: $KEY_NAME
Security Group: $SG_ID
Region: $AWS_REGION
Created: $(date)
EOF

print_success "Instance info saved to: /tmp/emaus-ec2-$INSTANCE_ID.txt"
echo ""
print_header "🎉 Ready to deploy!"
