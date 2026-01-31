# S3 Public Assets Management (Future Feature)

## Overview

This document describes the planned public assets management feature for the Emaus system using AWS S3. This enables storing and serving website assets like flyers, posters, logos, and graphics.

## Purpose

The public assets system will enable:

- Storage of retreat flyers and promotional materials
- Event posters and announcements
- Logo variations for different uses
- Website graphics and banners
- Social media assets
- Print-ready documents

## Storage Structure

Public assets are organized in the `public-assets/` prefix with subdirectories by type:

```
emaus-media/public-assets/
├── flyers/
│   ├── retreat-2024-spring.pdf
│   ├── retreat-2024-spring-poster.jpg
│   └── retreat-2024-spring-social.png
├── posters/
│   ├── prayer-vigil-2024.pdf
│   ├── volunteer-recruitment.jpg
│   └── fundraiser-2024.png
├── logos/
│   ├── emaus-logo-primary.svg
│   ├── emaus-logo-white.png
│   ├── emaus-logo-icon.png
│   └── emaus-logo-favicon.ico
└── graphics/
    ├── social-media/
    │   ├── facebook-banner.png
    │   ├── instagram-post.jpg
    │   └── twitter-header.png
    └── website/
        ├── hero-image.webp
        ├── team-background.jpg
        └── event-banner.png
```

## Access Control

Public assets are **publicly readable**:

- Anyone can view/download public assets
- Only admins can upload/delete assets
- Cached by CDN for fast delivery

## Supported File Types

| Category        | Allowed Types                | Recommended Size |
| --------------- | ---------------------------- | ---------------- |
| Flyers/Posters  | PDF, JPG, PNG                | < 5 MB           |
| Logos           | SVG, PNG, ICO                | < 1 MB           |
| Graphics        | PNG, JPG, WebP, SVG          | < 3 MB           |
| Social Media    | PNG, JPG, GIF, WebP          | < 2 MB           |

## API Endpoints (Planned)

### Upload Public Asset

```http
POST /api/admin/public-assets
Content-Type: multipart/form-data

{
  "file": <File>,
  "assetType": "flyer|poster|logo|graphic",
  "category": "social-media|website|...",
  "description": "Asset description",
  "cacheControl": "max-age=2592000, immutable"
}

Response:
{
  "id": "asset-123",
  "url": "https://emaus-media.s3.amazonaws.com/public-assets/...",
  "cdnUrl": "https://d123.cloudfront.net/public-assets/...",
  "key": "public-assets/logos/emaus-logo.svg",
  "size": 2048,
  "uploadedAt": "2024-01-31T12:00:00Z"
}
```

### List Public Assets

```http
GET /api/public-assets?assetType=logo&category=website

Response:
[
  {
    "id": "asset-123",
    "name": "emaus-logo-primary.svg",
    "type": "logo",
    "category": "website",
    "url": "https://emaus-media.s3.amazonaws.com/public-assets/...",
    "cdnUrl": "https://d123.cloudfront.net/public-assets/...",
    "size": 2048,
    "uploadedAt": "2024-01-31T12:00:00Z"
  }
]
```

### Delete Public Asset

```http
DELETE /api/admin/public-assets/:assetId

Response: { success: true }
```

### Get Asset Metadata

```http
GET /api/public-assets/:assetId

Response:
{
  "id": "asset-123",
  "name": "emaus-logo.svg",
  "url": "https://emaus-media.s3.amazonaws.com/...",
  "cdnUrl": "https://d123.cloudfront.net/...",
  "type": "logo",
  "size": 2048,
  "mimeType": "image/svg+xml",
  "uploadedAt": "2024-01-31T12:00:00Z"
}
```

## Implementation Details

### Service Methods (To Be Added)

In `s3Service.ts`:

```typescript
// Upload public asset
async uploadPublicAsset(
  path: string,
  buffer: Buffer,
  contentType: string,
  cacheControl?: string
): Promise<UploadResult>

// Delete public asset
async deletePublicAsset(path: string): Promise<void>

// Get public asset URL
getPublicAssetUrl(path: string): string

// Get CDN URL (when CloudFront enabled)
getCdnUrl(path: string): string

// List assets with prefix
async listPublicAssets(prefix: string): Promise<AssetInfo[]>
```

### Database Schema Extension

New table for asset tracking:

```sql
CREATE TABLE public_assets (
  id UUID PRIMARY KEY,
  asset_type VARCHAR(50),
  category VARCHAR(50),
  s3_key VARCHAR(255) UNIQUE,
  original_filename VARCHAR(255),
  content_type VARCHAR(100),
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  metadata JSONB,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_public_assets_type ON public_assets(asset_type);
CREATE INDEX idx_public_assets_category ON public_assets(category);
```

## Image Optimization

### Automatic Resizing

When uploading images, the system will automatically create optimized versions:

```
public-assets/
└── graphics/
    ├── hero-image.webp          (original)
    ├── hero-image-thumb.webp    (200px, 0.5x)
    ├── hero-image-medium.webp   (600px, 1.0x)
    └── hero-image-large.webp    (1200px, 2.0x)
```

### Optimization Settings

| Size     | Format | Quality | Use Case                  |
| -------- | ------ | ------- | ------------------------- |
| Thumb    | WebP   | 80%     | Thumbnails, previews      |
| Medium   | WebP   | 85%     | Mobile devices            |
| Large    | WebP   | 85%     | Desktop, print            |
| Original | Auto   | 100%    | High-quality downloads    |

## Cache Control Headers

Different cache strategies by asset type:

```
avatars/*
  Cache-Control: public, max-age=31536000, immutable

public-assets/*
  Cache-Control: public, max-age=2592000, immutable

retreat-memories/*
  Cache-Control: private, max-age=86400
```

## CDN Integration (Future)

### CloudFront Setup

When integrated with CloudFront:

1. **Distribution Setup**
   - Origin: `emaus-media.s3.amazonaws.com`
   - Default cache TTL: 30 days
   - Max cache TTL: 1 year

2. **Performance**
   - Global edge locations
   - Automatic compression
   - DDoS protection

3. **Pricing**
   - Significantly reduces S3 GET costs
   - Data transfer cost: $0.085/GB (vs $0.09/GB S3)
   - Request cost: $0.0075 per 10,000 (vs S3 rates)

### CloudFront URL Format

```
Before: https://emaus-media.s3.amazonaws.com/public-assets/logo.svg
After:  https://d1234abcd.cloudfront.net/public-assets/logo.svg
```

## Use Cases

### 1. Retreat Flyers

Marketing materials for upcoming retreats:

```
public-assets/flyers/
├── retreat-2024-spring-flyer.pdf
├── retreat-2024-spring-flyer.jpg
└── retreat-2024-spring-web.png
```

**Usage:**
- Download from website
- Print distribution
- Email campaigns

### 2. Event Posters

Promotional posters for events:

```
public-assets/posters/
├── prayer-vigil-2024.pdf
├── volunteer-drive-2024.png
└── fundraiser-2024.jpg
```

**Usage:**
- Church bulletin boards
- Community centers
- Digital displays

### 3. Logo Library

Official logo variations:

```
public-assets/logos/
├── emaus-logo-primary.svg      (primary color)
├── emaus-logo-white.png        (white version)
├── emaus-logo-black.png        (black version)
├── emaus-logo-icon.svg         (icon only)
└── emaus-logo-favicon.ico      (website favicon)
```

**Usage:**
- Website branding
- Document headers
- Email signatures

### 4. Social Media Assets

Optimized graphics for social platforms:

```
public-assets/graphics/social-media/
├── facebook-banner.png         (1200x628px)
├── instagram-post.jpg          (1080x1080px)
├── twitter-header.png          (1500x500px)
└── linkedin-banner.png         (1200x627px)
```

**Usage:**
- Social media posting
- Event promotion
- Community engagement

### 5. Website Graphics

Images for website pages:

```
public-assets/graphics/website/
├── hero-image.webp
├── team-background.jpg
└── event-banner.png
```

**Usage:**
- Page headers
- Background images
- Hero sections

## Cost Estimation

For public assets (estimated 100 MB total):

- Storage: 100 MB × $0.023/month = ~$0.002/month
- GET requests: 10,000/month × $0.0004/1K = ~$0.004/month
- **Total: ~$0.006/month** (very affordable!)

## Security Considerations

1. **Public Access**
   - Assets are public and cacheable
   - No authentication required
   - Suitable for marketing materials only

2. **Upload Security**
   - Only admins can upload assets
   - File type validation required
   - Virus/malware scanning (future)

3. **CDN Security**
   - Automatic HTTPS
   - DDoS protection with CloudFront
   - Signed URLs for restricted assets (future)

## Features to Implement

### Phase 1: Basic Asset Upload

- [x] S3 public asset upload methods
- [ ] Asset upload API endpoint
- [ ] File type validation
- [ ] Database tracking

### Phase 2: Asset Management

- [ ] List assets by type/category
- [ ] Download assets
- [ ] Delete assets
- [ ] Soft delete

### Phase 3: Optimization

- [ ] Automatic image resizing
- [ ] Format conversion (to WebP)
- [ ] Thumbnail generation
- [ ] Compression optimization

### Phase 4: CDN Integration

- [ ] CloudFront setup
- [ ] CDN URL generation
- [ ] Cache invalidation API
- [ ] Performance monitoring

## Related Files

- `docs_dev/s3-media-storage.md` - Main S3 storage documentation
- `apps/api/src/services/s3Service.ts` - S3 service implementation
- `apps/api/src/config/env.ts` - Configuration with public-assets prefix

## See Also

- [S3 Media Storage](./s3-media-storage.md)
- [S3 Document Storage](./s3-document-storage.md)
