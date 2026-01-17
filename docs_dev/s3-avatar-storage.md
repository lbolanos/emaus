# S3 Avatar Storage Implementation

## Overview

This document explains the implementation of AWS S3 storage for user avatars in the Emaus system. The implementation provides a flexible, flag-based storage strategy that allows switching between base64 database storage and S3 object storage without code changes.

## Architecture

### Storage Strategy

The system uses an environment variable `AVATAR_STORAGE` to determine the storage method:

- **`base64`** (default): Store avatars as base64 strings in the database
- **`s3`**: Upload avatars to AWS S3 and store the URL in the database

### Components

```
┌─────────────────┐
│  Frontend       │
│  AvatarUpload   │
└────────┬────────┘
         │ base64 image
         ▼
┌─────────────────────────────────────────────────────────┐
│  userProfileController                                  │
│  - updateAvatar()                                       │
│  - removeAvatar()                                       │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  avatarStorageService (Abstraction Layer)               │
│  - Routes to base64 or S3 based on AVATAR_STORAGE flag  │
└──────┬─────────────────────────────────────┬────────────┘
       │                                     │
       ▼ (base64)                            ▼ (s3)
  Return as-is                    ┌──────────────────────┐
                                  │  imageService        │
                                  │  - Process image     │
                                  │  - Convert to WebP   │
                                  │  - Resize to 512px   │
                                  └──────────┬───────────┘
                                             │
                                             ▼
                                  ┌──────────────────────┐
                                  │  s3Service           │
                                  │  - Upload to S3      │
                                  │  - Generate URL      │
                                  │  - Delete old file   │
                                  └──────────────────────┘
```

## Configuration

### Environment Variables

Add to `apps/api/.env`:

```bash
# Avatar Storage Configuration
# Options: base64 (store in database), s3 (AWS S3 storage)
AVATAR_STORAGE=base64

# AWS S3 Configuration (required when AVATAR_STORAGE=s3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=emaus-avatars
S3_BUCKET_PREFIX=avatars/
```

### IAM Permissions

The IAM user needs these minimum permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::emaus-avatars/*"
    }
  ]
}
```

## S3 Bucket Setup

### Automated Setup

Use the provided script to create and configure the S3 bucket:

```bash
# Set environment variables
export AWS_REGION=us-east-1
export S3_BUCKET_NAME=emaus-avatars

# Run setup script
./scripts/setup-s3.sh
```

### Manual Setup

If you prefer manual configuration:

1. **Create Bucket:**
   ```bash
   aws s3api create-bucket --bucket emaus-avatars --region us-east-1
   ```

2. **Enable Public Read:**
   ```bash
   aws s3api put-bucket-policy \
     --bucket emaus-avatars \
     --policy '{
       "Version": "2012-10-17",
       "Statement": [{
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::emaus-avatars/*"
       }]
     }'
   ```

3. **Configure CORS:**
   ```bash
   aws s3api put-bucket-cors \
     --bucket emaus-avatars \
     --cors-configuration '{
       "CORSRules": [{
         "AllowedHeaders": ["*"],
         "AllowedMethods": ["GET", "PUT"],
         "AllowedOrigins": ["*"],
         "ExposeHeaders": ["ETag"],
         "MaxAgeSeconds": 3600
       }]
     }'
   ```

## Image Processing

### Processing Pipeline

When an avatar is uploaded (regardless of storage method):

1. **Validation**: Base64 format is validated
2. **Conversion**: Image is converted to WebP format
3. **Resizing**: If larger than 512px, resized to 512x512 (cover fit)
4. **Compression**: WebP quality set to 85%
5. **Storage**: Either saved as base64 or uploaded to S3

### Why WebP?

- **Smaller file sizes**: Typically 25-35% smaller than JPEG
- **Better quality**: Equivalent visual quality at lower bitrates
- **Widely supported**: Supported in all modern browsers
- **Alpha channel**: Supports transparency if needed

### File Size Impact

| Original Format | Typical Size | After Processing | Reduction |
|----------------|--------------|------------------|-----------|
| JPEG (2MB)     | 2,048 KB     | ~50 KB           | 97.5%     |
| PNG (500KB)    | 500 KB       | ~30 KB           | 94%       |

## Service Modules

### 1. Environment Configuration (`config/env.ts`)

Validates environment variables and provides typed configuration:

```typescript
export const config = {
  avatar: {
    storage: 'base64' | 's3',
  },
  aws: {
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    s3BucketName: string,
    s3Prefix: string,
  },
};
```

### 2. S3 Service (`services/s3Service.ts`)

Handles direct S3 operations:

- `uploadAvatar(userId, buffer, contentType)` - Upload image to S3
- `deleteAvatar(userId)` - Delete image from S3
- `getPublicUrl(key)` - Generate public URL

**File naming convention**: `avatars/{userId}.webp`

### 3. Image Service (`services/imageService.ts`)

Processes images before storage:

- `processAvatar(buffer, contentType)` - Resize and convert to WebP
- `base64ToBuffer(base64)` - Convert base64 string to Buffer
- `isValidImage(contentType)` - Validate image type

**Constants:**
- Max size: 512px
- Quality: 85%
- Max file size: 2MB

### 4. Avatar Storage Service (`services/avatarStorageService.ts`)

Abstraction layer that routes to appropriate storage:

- `uploadAvatar(userId, base64Data)` - Routes to base64 or S3
- `deleteAvatar(userId, currentUrl)` - Cleans up old avatar
- `isS3Storage()` - Check current storage mode

## Controller Changes

### Update Avatar (`updateAvatar`)

```typescript
// Before (base64 only)
const profile = await updateUserProfile(user.id, { avatarUrl });

// After (flexible storage)
const currentProfile = await getUserProfile(user.id);
await avatarStorageService.deleteAvatar(user.id, currentProfile.avatarUrl);
const result = await avatarStorageService.uploadAvatar(user.id, avatarUrl);
const profile = await updateUserProfile(user.id, { avatarUrl: result.url });
```

### Remove Avatar (`removeAvatar`)

```typescript
// Before
const profile = await updateUserProfile(user.id, { avatarUrl: null });

// After
const currentProfile = await getUserProfile(user.id);
await avatarStorageService.deleteAvatar(user.id, currentProfile.avatarUrl);
const profile = await updateUserProfile(user.id, { avatarUrl: null });
```

## Migration

### Migrating from Base64 to S3

To migrate existing base64 avatars to S3:

```bash
# Ensure AWS credentials are configured
aws configure

# Set AVATAR_STORAGE=s3 in .env
echo "AVATAR_STORAGE=s3" >> apps/api/.env

# Run migration script
npx ts-node scripts/migrate-avatars-to-s3.ts
```

The migration script:
1. Finds all profiles with base64 avatars (`data:image/%`)
2. Processes each image (resize, WebP conversion)
3. Uploads to S3
4. Updates database with S3 URL

### Migration Output

```
🔄 Starting avatar migration to S3...
Found 25 avatars to migrate
✅ Migrated: user_123
✅ Migrated: user_456
❌ Failed: user_789 (error details)

Migration complete: 24 success, 1 failed
```

## Testing

### Test Base64 Mode

1. Ensure `AVATAR_STORAGE=base64` (or unset)
2. Upload avatar via ProfileView
3. Verify avatar displays correctly
4. Check database - should contain base64 string starting with `data:image/`

### Test S3 Mode

1. Set `AVATAR_STORAGE=s3` in `.env`
2. Configure AWS credentials
3. Upload avatar via ProfileView
4. Verify avatar displays correctly
5. Check database - should contain S3 URL starting with `https://`
6. Verify file exists in S3 bucket:
   ```bash
   aws s3 ls s3://emaus-avatars/avatars/
   ```

### Switching Between Modes

The system supports hot-swapping between storage modes:

```bash
# Switch to S3
export AVATAR_STORAGE=s3
# Restart API server

# Switch back to base64
export AVATAR_STORAGE=base64
# Restart API server
```

**Note:** New uploads use the active mode. Existing avatars continue working regardless of mode.

## Cost Considerations

### S3 Pricing (us-east-1)

| Resource | Cost |
|----------|------|
| Storage | $0.023/GB/month |
| PUT requests | $0.0004 per 1,000 |
| GET requests | $0.0004 per 1,000 |
| Data transfer | First 100GB free, then $0.09/GB |

### Estimated Costs for 1,000 Users

- Average avatar size: 50 KB (WebP compressed)
- Total storage: 1,000 × 50 KB = 50 MB
- **Monthly storage cost**: ~$0.01
- **Upload cost** (1,000 uploads): ~$0.0004
- **Daily serving** (10,000 views): ~$0.004

**Total estimated monthly cost**: < $0.02 for 1,000 users

## Troubleshooting

### Issue: "AWS credentials not found"

**Solution:** Configure AWS credentials:
```bash
aws configure
# Or set environment variables:
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
```

### Issue: "Invalid base64 image format"

**Solution:** Ensure frontend sends proper base64 format:
```
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...
```

### Issue: "Avatar not displaying after S3 upload"

**Solutions:**
1. Check S3 bucket policy allows public read
2. Verify CORS configuration
3. Check that file exists in S3
4. Ensure IAM user has `s3:GetObject` permission

### Issue: "Sharp installation fails"

**Solution:** Install sharp dependencies:
```bash
pnpm --filter api add sharp
# If still failing, try:
pnpm rebuild sharp
```

## Security Considerations

### Base64 Mode
- ✅ No external dependencies
- ✅ Works offline
- ⚠️ Increases database size
- ⚠️ Slower database backups

### S3 Mode
- ✅ Smaller database size
- ✅ Faster database backups
- ✅ CDN capability with CloudFront
- ⚠️ Requires AWS configuration
- ⚠️ Network dependency for uploads

### Best Practices

1. **Use HTTPS** for all S3 operations
2. **Enable bucket encryption** (AES256)
3. **Set appropriate CORS** (restrict to your domain in production)
4. **Monitor costs** with AWS billing alerts
5. **Use IAM roles** in production instead of access keys
6. **Enable versioning** for recovery options

## File Reference

### New Files

```
apps/api/src/
├── config/
│   └── env.ts                    # Environment configuration
└── services/
    ├── s3Service.ts              # S3 operations
    ├── imageService.ts           # Image processing
    └── avatarStorageService.ts   # Storage abstraction

scripts/
├── setup-s3.sh                   # S3 bucket setup
└── migrate-avatars-to-s3.ts      # Migration script
```

### Modified Files

```
apps/api/
├── .env.example                  # Added S3 configuration
└── src/controllers/
    └── userProfileController.ts  # Updated avatar handlers
```

## Future Enhancements

Potential improvements for the avatar system:

1. **Presigned URLs** - Generate time-limited upload URLs for direct browser-to-S3 uploads
2. **CDN Integration** - Use CloudFront for faster global delivery
3. **Image Variants** - Store multiple sizes (thumbnail, medium, large)
4. **Backup Strategy** - Automatic backup of avatars to Glacier
5. **Migration Monitoring** - Track migration progress and retry failures
6. **Batch Operations** - Bulk upload/delete for admin operations
7. **Avatar Moderation** - Queue system for reviewing uploaded images
