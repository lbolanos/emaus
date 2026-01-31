#!/bin/bash

# S3 Bucket Setup Script for Emaus Media Storage
# Supports multi-purpose storage: avatars, retreat memories, documents, public assets
# Usage: ./scripts/setup-s3.sh

set -e

# Configuration
BUCKET_NAME=${S3_BUCKET_NAME:-emaus-media}
REGION=${AWS_REGION:-us-east-1}

echo "🪣 Setting up S3 bucket for media storage..."
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Install it first: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if user is authenticated
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not found. Run 'aws configure' first."
    exit 1
fi

# Create bucket
echo "Creating bucket..."
if [ "$REGION" == "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION"
else
    aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
fi

# Enable versioning (optional, for recovery)
echo "Enabling versioning..."
aws s3api put-bucket-versioning \
    --bucket "$BUCKET_NAME" \
    --versioning-configuration Status=Enabled

# Set bucket policy for selective public access
# Public: avatars and public-assets prefixes
# Private: documents and retreat-memories prefixes
echo "Setting bucket policy..."
aws s3api put-bucket-policy \
    --bucket "$BUCKET_NAME" \
    --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadAvatars",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::'"$BUCKET_NAME"'/avatars/*"
    },
    {
      "Sid": "PublicReadAssets",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::'"$BUCKET_NAME"'/public-assets/*"
    }
  ]
}'

# Set CORS configuration
echo "Setting CORS configuration..."
aws s3api put-bucket-cors \
    --bucket "$BUCKET_NAME" \
    --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}'

# Enable encryption
echo "Enabling default encryption..."
aws s3api put-bucket-encryption \
    --bucket "$BUCKET_NAME" \
    --server-side-encryption-configuration '{
  "Rules": [
    {
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }
  ]
}'

echo ""
echo "✅ S3 bucket setup complete!"
echo ""
echo "Bucket URL: https://$BUCKET_NAME.s3.$REGION.amazonaws.com"
echo ""
echo "Bucket Structure:"
echo "  ├── avatars/                 (public read)"
echo "  ├── retreat-memories/        (private)"
echo "  ├── documents/               (private)"
echo "  └── public-assets/           (public read)"
echo ""
echo "Add these to your .env file:"
echo "AWS_REGION=$REGION"
echo "S3_BUCKET_NAME=$BUCKET_NAME"
echo "S3_AVATARS_PREFIX=avatars/"
echo "S3_RETREAT_MEMORIES_PREFIX=retreat-memories/"
echo "S3_DOCUMENTS_PREFIX=documents/"
echo "S3_PUBLIC_ASSETS_PREFIX=public-assets/"
echo "AVATAR_STORAGE=s3"
