#!/bin/bash

# S3 Bucket Migration Script
# Migrates data from emaus-avatars bucket to emaus-media bucket
# Usage: ./scripts/migrate-s3-bucket.sh

set -e

# Configuration
OLD_BUCKET_NAME=${OLD_BUCKET_NAME:-emaus-avatars}
NEW_BUCKET_NAME=${NEW_BUCKET_NAME:-emaus-media}
REGION=${AWS_REGION:-us-east-1}

echo "📦 Starting S3 bucket migration..."
echo "Source bucket: $OLD_BUCKET_NAME"
echo "Target bucket: $NEW_BUCKET_NAME"
echo "Region: $REGION"
echo ""

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

# Verify old bucket exists
echo "Verifying source bucket exists..."
if ! aws s3 ls "s3://$OLD_BUCKET_NAME" --region "$REGION" &> /dev/null; then
    echo "❌ Source bucket '$OLD_BUCKET_NAME' not found or not accessible."
    exit 1
fi

# Verify new bucket exists
echo "Verifying target bucket exists..."
if ! aws s3 ls "s3://$NEW_BUCKET_NAME" --region "$REGION" &> /dev/null; then
    echo "❌ Target bucket '$NEW_BUCKET_NAME' not found or not accessible."
    echo "💡 Create the target bucket first using: ./scripts/setup-s3.sh"
    exit 1
fi

# Count objects in old bucket
echo "Counting objects in source bucket..."
OLD_COUNT=$(aws s3 ls "s3://$OLD_BUCKET_NAME/" --recursive --region "$REGION" | wc -l)
echo "📊 Found $OLD_COUNT objects in source bucket"
echo ""

if [ "$OLD_COUNT" -eq 0 ]; then
    echo "⚠️  No objects found in source bucket. Nothing to migrate."
    exit 0
fi

# Copy objects from old bucket to new bucket
echo "🔄 Copying objects from source to target bucket..."
echo "   This may take a while depending on the number and size of objects..."
echo ""

# Use S3 sync to copy all objects
aws s3 sync "s3://$OLD_BUCKET_NAME/" "s3://$NEW_BUCKET_NAME/avatars/" \
    --region "$REGION" \
    --storage-class STANDARD \
    --include "*"

echo ""
echo "✅ Copy operation completed!"
echo ""

# Count objects in new bucket
echo "🔍 Verifying migration..."
NEW_COUNT=$(aws s3 ls "s3://$NEW_BUCKET_NAME/avatars/" --recursive --region "$REGION" | wc -l)
echo "📊 Found $NEW_COUNT objects in target bucket (avatars/ prefix)"

# Calculate total in new bucket
NEW_TOTAL=$(aws s3 ls "s3://$NEW_BUCKET_NAME/" --recursive --region "$REGION" | wc -l)
echo "📊 Total objects in target bucket: $NEW_TOTAL"
echo ""

if [ "$OLD_COUNT" -eq "$NEW_COUNT" ]; then
    echo "✅ Migration successful! All objects copied."
    echo ""
    echo "📋 Migration Summary:"
    echo "   Source:      s3://$OLD_BUCKET_NAME/ ($OLD_COUNT objects)"
    echo "   Target:      s3://$NEW_BUCKET_NAME/avatars/ ($NEW_COUNT objects)"
    echo ""
    echo "⚠️  Important: Keep the old bucket intact during testing/verification."
    echo "   Delete only after confirming application works with new bucket."
    echo ""
    echo "To delete old bucket (when ready):"
    echo "   aws s3 rb s3://$OLD_BUCKET_NAME --force --region $REGION"
else
    echo "⚠️  Migration count mismatch!"
    echo "   Source objects: $OLD_COUNT"
    echo "   Target objects: $NEW_COUNT"
    echo ""
    echo "💡 This might be OK if there were existing objects in target bucket."
    echo "   Please verify manually: aws s3 ls s3://$NEW_BUCKET_NAME/ --recursive"
    exit 1
fi
