# AWS S3 Media Storage Implementation

## Overview

This document explains the implementation of AWS S3 storage for media and assets in the Emaus system. The system uses a single, organized S3 bucket (`emaus-media`) with multiple prefixes for different content types: user avatars, retreat memory photos, documents, and public assets.

## Architecture

### Multi-Purpose Bucket Structure

```
emaus-media/
├── avatars/              # User profile pictures (public read)
│   └── {userId}.webp
├── retreat-memories/     # Retreat memory photos (private)
│   └── {retreatId}.webp
├── documents/            # Participant documents (private)
│   ├── participant-forms/
│   ├── retreat-schedules/
│   └── medical-records/
└── public-assets/        # Website assets (public read)
    ├── flyers/
    ├── posters/
    └── logos/
```

### Access Control by Prefix

| Prefix               | Access Level | Use Case                          |
| -------------------- | ------------ | --------------------------------- |
| `avatars/*`          | Public Read  | User profile pictures             |
| `retreat-memories/*` | Private      | Retreat photos (future: public)   |
| `documents/*`        | Private      | Participant forms, medical docs   |
| `public-assets/*`    | Public Read  | Flyers, logos, website graphics   |

### Storage Strategy

The system uses an environment variable `AVATAR_STORAGE` to determine storage method:

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
│  userProfileController / retreatController             │
│  - updateAvatar()                                       │
│  - uploadRetreatMemory()                                │
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
S3_BUCKET_NAME=emaus-media

# S3 Storage Prefixes (for different content types)
S3_AVATARS_PREFIX=avatars/
S3_RETREAT_MEMORIES_PREFIX=retreat-memories/
S3_DOCUMENTS_PREFIX=documents/
S3_PUBLIC_ASSETS_PREFIX=public-assets/
```

### IAM Permissions

The IAM user needs these minimum permissions:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"],
			"Resource": "arn:aws:s3:::emaus-media/*"
		},
		{
			"Effect": "Allow",
			"Action": ["s3:ListBucket"],
			"Resource": "arn:aws:s3:::emaus-media"
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
export S3_BUCKET_NAME=emaus-media

# Run setup script
./scripts/setup-s3.sh
```

The setup script automatically configures:
- Bucket creation with versioning
- Public read policy for `avatars/*` and `public-assets/*`
- Private policy for `documents/*` and `retreat-memories/*`
- CORS configuration
- AES256 encryption

### Manual Setup

If you prefer manual configuration:

1. **Create Bucket:**

   ```bash
   aws s3api create-bucket --bucket emaus-media --region us-east-1
   ```

2. **Enable Versioning:**

   ```bash
   aws s3api put-bucket-versioning \
     --bucket emaus-media \
     --versioning-configuration Status=Enabled
   ```

3. **Set Selective Public Read Policy:**

   ```bash
   aws s3api put-bucket-policy \
     --bucket emaus-media \
     --policy '{
       "Version": "2012-10-17",
       "Statement": [
         {
           "Sid": "PublicReadAvatars",
           "Effect": "Allow",
           "Principal": "*",
           "Action": "s3:GetObject",
           "Resource": "arn:aws:s3:::emaus-media/avatars/*"
         },
         {
           "Sid": "PublicReadAssets",
           "Effect": "Allow",
           "Principal": "*",
           "Action": "s3:GetObject",
           "Resource": "arn:aws:s3:::emaus-media/public-assets/*"
         }
       ]
     }'
   ```

4. **Configure CORS:**

   ```bash
   aws s3api put-bucket-cors \
     --bucket emaus-media \
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

5. **Enable Encryption:**

   ```bash
   aws s3api put-bucket-encryption \
     --bucket emaus-media \
     --server-side-encryption-configuration '{
       "Rules": [{
         "ApplyServerSideEncryptionByDefault": {
           "SSEAlgorithm": "AES256"
         }
       }]
     }'
   ```

## Migration from Old Bucket

### Migrating from `emaus-avatars` to `emaus-media`

Use the migration script to copy all objects:

```bash
# Set environment variables
export OLD_BUCKET_NAME=emaus-avatars
export NEW_BUCKET_NAME=emaus-media
export AWS_REGION=us-east-1

# Create new bucket first
export S3_BUCKET_NAME=emaus-media
./scripts/setup-s3.sh

# Run migration script
./scripts/migrate-s3-bucket.sh
```

The migration script:
1. Verifies both buckets exist
2. Counts objects in source bucket
3. Copies all objects from old bucket to `new-bucket/avatars/` prefix
4. Verifies object counts match
5. Generates migration report

**Important:** The old bucket remains intact during migration. Delete it only after confirming the application works with the new bucket.

### Rollback Procedure

If issues occur after migration:

```bash
# Revert to old bucket
export S3_BUCKET_NAME=emaus-avatars
# Restart application
pm2 restart emaus-api
```

The old bucket remains intact, so no data is lost.

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
| --------------- | ------------ | ---------------- | --------- |
| JPEG (2MB)      | 2,048 KB     | ~50 KB           | 97.5%     |
| PNG (500KB)     | 500 KB       | ~30 KB           | 94%       |

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
		s3Prefixes: {
			avatars: string,
			retreatMemories: string,
			documents: string,
			publicAssets: string,
		},
	},
};
```

### 2. S3 Service (`services/s3Service.ts`)

Handles direct S3 operations with methods for each content type:

#### Avatar Methods

- `uploadAvatar(userId, buffer, contentType)` - Upload image to S3
- `deleteAvatar(userId)` - Delete image from S3

**File naming convention**: `avatars/{userId}.webp`

#### Retreat Memory Methods

- `uploadRetreatMemoryPhoto(retreatId, buffer, contentType)` - Upload photo
- `deleteRetreatMemoryPhoto(retreatId)` - Delete photo

**File naming convention**: `retreat-memories/{retreatId}.webp`

#### Document Methods

- `uploadDocument(path, buffer, contentType)` - Upload document
- `deleteDocument(path)` - Delete document
- `getDocumentUrl(path)` - Get document URL

**File path format**: `documents/{path}` (e.g., `documents/participant-forms/form-123.pdf`)

#### Public Asset Methods

- `uploadPublicAsset(path, buffer, contentType)` - Upload asset
- `deletePublicAsset(path)` - Delete asset
- `getPublicAssetUrl(path)` - Get public URL

**File path format**: `public-assets/{path}` (e.g., `public-assets/flyers/retreat-2024.pdf`)

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

## Testing

### Test Base64 Mode

1. Ensure `AVATAR_STORAGE=base64` (or unset)
2. Upload avatar via ProfileView
3. Verify avatar displays correctly
4. Check database - should contain base64 string starting with `data:image/`

### Test S3 Mode

1. Set `AVATAR_STORAGE=s3` in `.env`
2. Configure AWS credentials: `aws configure`
3. Create bucket: `./scripts/setup-s3.sh`
4. Upload avatar via ProfileView
5. Verify avatar displays correctly
6. Check database - should contain S3 URL starting with `https://`
7. Verify file exists in S3 bucket:

   ```bash
   aws s3 ls s3://emaus-media/avatars/
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

| Resource      | Cost                            |
| ------------- | ------------------------------- |
| Storage       | $0.023/GB/month                 |
| PUT requests  | $0.005 per 1,000                |
| GET requests  | $0.0004 per 1,000               |
| Data transfer | First 100GB free, then $0.09/GB |

### Estimated Costs for Single Bucket (1,000 users)

- Average avatar size: 50 KB (WebP compressed)
- Average retreat photo: 100 KB
- Average documents: 500 KB
- Total storage: ~650 MB

**Monthly breakdown:**

- Avatar storage: 50 MB × $0.023/GB = ~$0.01
- Retreat photos: 100 MB × $0.023/GB = ~$0.02
- Documents: 500 MB × $0.023/GB = ~$0.12
- **Total storage cost**: ~$0.15/month

- Upload operations (1,000): ~$0.005
- Download operations (10,000): ~$0.004
- **Total request cost**: ~$0.009/month

**Grand Total**: < $0.20/month for 1,000 users

### Future Optimization

Consider CloudFront CDN to reduce GET request costs and improve latency:
- CloudFront requests: $0.0075 per 10,000 (vs $0.0004 for S3)
- CDN costs may be offset by reduced S3 GET costs for frequently accessed files

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
- ✅ Selective access control per prefix
- ⚠️ Requires AWS configuration
- ⚠️ Network dependency for uploads

### Best Practices

1. **Use HTTPS** for all S3 operations
2. **Enable bucket encryption** (AES256) - ✅ Done by setup script
3. **Set appropriate CORS** (restrict to your domain in production)
4. **Monitor costs** with AWS billing alerts
5. **Use IAM roles** in production instead of access keys
6. **Enable versioning** for recovery options - ✅ Done by setup script
7. **Restrict public access** to appropriate prefixes only - ✅ Done by setup script

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

1. Check S3 bucket policy allows public read for `avatars/*`
2. Verify CORS configuration
3. Check that file exists in S3: `aws s3 ls s3://emaus-media/avatars/`
4. Ensure IAM user has `s3:GetObject` permission

### Issue: "Migration script fails"

**Solution:** Verify prerequisites:

```bash
# Check old bucket exists and has objects
aws s3 ls s3://emaus-avatars/ --recursive | head -5

# Check new bucket exists
aws s3 ls s3://emaus-media/ --recursive

# Verify IAM permissions allow bucket operations
aws sts get-caller-identity
```

### Issue: "Permission denied when creating bucket"

**Solution:** Verify IAM user has these permissions:

```json
{
	"Effect": "Allow",
	"Action": [
		"s3:CreateBucket",
		"s3:ListBucket",
		"s3:PutBucketPolicy",
		"s3:PutBucketVersioning",
		"s3:PutBucketCors",
		"s3:PutEncryptionConfiguration"
	],
	"Resource": ["arn:aws:s3:::emaus-media"]
}
```

## File Reference

### New Files

```
apps/api/src/config/
└── env.ts                       # Environment configuration with prefixes

apps/api/src/services/
├── s3Service.ts                 # S3 operations (avatars, documents, assets)
├── imageService.ts              # Image processing
└── avatarStorageService.ts      # Storage abstraction layer

apps/api/.env.example            # Example environment variables
apps/api/.env.production.example # Production environment template

scripts/
├── setup-s3.sh                  # S3 bucket setup
└── migrate-s3-bucket.sh         # Migration script (old to new bucket)

docs_dev/
└── s3-media-storage.md          # This documentation
```

### Key Configuration Files

```
apps/api/
├── .env.example                 # Updated with new bucket name and prefixes
├── .env.production.example      # Production S3 configuration template
└── src/config/
    └── env.ts                   # Configuration validation and typed exports
```

## Future Enhancements

### Document Storage (Future)

Features to add for document management:

1. **Document Upload API** - Endpoints for participant documents
2. **Document Versioning** - Track document history with S3 versioning
3. **Document Expiration** - Automatic deletion after retention period
4. **Access Control** - Fine-grained permissions per document type
5. **Audit Trail** - Log all document access

API Endpoints (Future):

```
POST   /api/participants/:id/documents           # Upload document
GET    /api/participants/:id/documents           # List documents
GET    /api/participants/:id/documents/:docId    # Download document
DELETE /api/participants/:id/documents/:docId    # Delete document
```

### Public Assets Management (Future)

Features for managing public-facing assets:

1. **Asset Upload** - Admin panel for uploading assets
2. **Asset Preview** - Thumbnail preview in CMS
3. **Asset Versioning** - Multiple versions of assets
4. **CDN Integration** - CloudFront distribution
5. **Image Optimization** - Auto-compression and resizing

Use Cases:

- Retreat flyers (PDF, JPG)
- Event posters (PNG, SVG)
- Logo variations (SVG, PNG, WebP)
- Website backgrounds (WebP, JPG)

### CDN Integration (Future)

Benefits of CloudFront:

- Faster global delivery
- Lower S3 GET costs
- Built-in caching
- Custom domain support
- Cache invalidation capabilities

## Migration Timeline

### Phase 1: Preparation

- [x] Review current S3 setup
- [x] Create new bucket setup script
- [x] Create migration script
- [x] Update environment configuration
- [ ] Test in development environment

### Phase 2: Bucket Creation

- [ ] Create new `emaus-media` bucket
- [ ] Verify bucket configuration
- [ ] Test bucket policies

### Phase 3: Data Migration

- [ ] Run migration script
- [ ] Verify object counts
- [ ] Test random sample of URLs

### Phase 4: Code Updates

- [ ] Update application configuration
- [ ] Update environment variables
- [ ] Test application with new bucket
- [ ] Run test suite

### Phase 5: Production Deployment

- [ ] Deploy code changes
- [ ] Update production environment variables
- [ ] Monitor logs for errors
- [ ] Verify all features work

### Phase 6: Cleanup

- [ ] Monitor for 1 week
- [ ] Delete old bucket (after verification)
- [ ] Update documentation

