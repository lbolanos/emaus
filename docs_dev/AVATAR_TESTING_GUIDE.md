# Avatar Storage Testing Guide

## Overview

This guide documents the testing approach for the avatar storage system, which supports both base64 and AWS S3 storage modes. The test suite includes comprehensive coverage for image processing, S3 operations, storage abstraction, and API endpoints.

## Test Files

| Test File                                             | Description                     | Tests  |
| ----------------------------------------------------- | ------------------------------- | ------ |
| `src/tests/services/imageService.test.ts`             | Image processing and conversion | 20     |
| `src/tests/services/s3Service.test.ts`                | AWS S3 operations               | 16     |
| `src/tests/services/avatarStorageService.test.ts`     | Storage abstraction layer       | 14     |
| `src/tests/controllers/userProfileController.test.ts` | Avatar API endpoints            | 25     |
| **Total**                                             |                                 | **75** |

## Running the Tests

```bash
# Run all avatar-related tests
pnpm test

# Run specific test file
pnpm --filter api test -- imageService.test.ts
pnpm --filter api test -- s3Service.test.ts
pnpm --filter api test -- avatarStorageService.test.ts
pnpm --filter api test -- userProfileController.test.ts

# Run with coverage
pnpm --filter api test -- --coverage
```

## Test Environment Setup

### Image Service Tests

The image service tests mock the `sharp` library to avoid image processing dependencies:

```typescript
// Mock structure
const mockMetadata = jest.fn().mockResolvedValue({ width: 1024, height: 768 });
const mockResize = jest.fn().mockReturnThis();
const mockWebp = jest.fn().mockReturnThis();
const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('processed-image'));

jest.mock('sharp', () =>
	jest.fn(() => ({
		metadata: mockMetadata,
		resize: mockResize,
		webp: mockWebp,
		toBuffer: mockToBuffer,
	})),
);
```

### S3 Service Tests

The S3 service tests set environment variables before importing the module:

```typescript
// Set environment variables BEFORE importing
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.S3_BUCKET_NAME = 'test-avatars-bucket';
process.env.S3_BUCKET_PREFIX = 'avatars/';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => {
	const mockSend = jest.fn().mockResolvedValue({ ETag: '"test-etag"' });
	return {
		S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
		PutObjectCommand: jest.fn(),
		DeleteObjectCommand: jest.fn(),
		mockSend,
	};
});
```

### Controller Tests

The controller tests mock both the storage service and the user profile service:

```typescript
// Mock storage service
jest.mock('../../services/avatarStorageService', () => ({
	avatarStorageService: {
		uploadAvatar: jest.fn(),
		deleteAvatar: jest.fn(),
		isS3Storage: jest.fn(),
	},
}));

// Mock user profile service
jest.mock('../../services/userProfileService', () => ({
	getUserProfile: jest.fn(),
	updateUserProfile: jest.fn(),
}));
```

## Test Coverage

### Image Service Tests (20 tests)

#### Base64 Conversion

- Convert base64 JPEG image to buffer
- Convert base64 PNG image to buffer
- Convert base64 GIF image to buffer
- Convert base64 WebP image to buffer
- Handle invalid base64 format

#### Image Validation

- Validate JPEG images
- Validate PNG images
- Validate GIF images
- Validate WebP images
- Reject unsupported formats

#### Image Processing

- Process avatar with resize to 512px
- Process avatar with WebP conversion
- Process large image (resize to max dimensions)
- Handle sharp processing errors

---

### S3 Service Tests (16 tests)

#### Upload Operations

- Upload avatar to S3 with correct parameters
- Return URL and key after successful upload
- Handle different user IDs
- Set correct cache control headers

#### Error Handling

- Handle S3 upload errors
- Handle network errors during upload
- Handle access denied errors

#### Delete Operations

- Delete avatar from S3 with correct parameters
- Handle S3 deletion errors
- Handle access denied during deletion

#### URL Generation

- Generate correct public URL for standard us-east-1 region
- Include full key path in URL

#### Client Configuration

- Initialize S3Client with correct region
- Initialize S3Client with correct credentials

#### Integration Scenarios

- Handle complete upload and delete cycle
- Handle multiple concurrent uploads
- Handle partial failures in batch operations

---

### Avatar Storage Service Tests (14 tests)

#### Base64 Mode Tests

- Upload avatar in base64 mode
- Delete avatar in base64 mode (no-op)
- Detect base64 avatar URLs
- Return base64 as-is without processing

#### Storage Detection

- Identify base64 data URL format
- Identify S3 URL format
- Handle null/undefined avatar URLs

#### S3 Storage Mode

- Upload avatar to S3
- Delete S3 avatar
- Check if using S3 storage

---

### Controller Tests (25 tests)

#### Avatar Upload

- Upload avatar successfully (authenticated)
- Reject avatar upload without authentication
- Validate avatarUrl parameter presence
- Delete old S3 avatar when uploading new one
- Handle S3 upload errors

#### Avatar Removal

- Remove avatar successfully (authenticated)
- Reject avatar removal without authentication
- Delete S3 avatar when removing
- Handle null old avatar gracefully
- Handle S3 deletion errors

#### Profile Retrieval

- Get my profile (authenticated)
- Reject profile retrieval without authentication
- Return user profile with avatar

#### Public Profile

- Get public profile by ID
- Return 404 for non-existent profile
- Exclude sensitive information from public profile

#### User Search

- Search users by query
- Reject search without query parameter
- Filter by interests
- Filter by skills
- Filter by location
- Filter by retreatId

#### Participant Linking

- Link user to participant
- Reject linking without authentication
- Unlink user from participant

## Test Data

### Sample Base64 Images

```typescript
// Valid base64 image (1x1 red pixel WebP)
const validBase64 = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4...';

// Invalid base64 format
const invalidBase64 = 'not-a-base64-image';
```

### Sample User Data

```typescript
const mockUser = {
	id: 'user-uuid',
	displayName: 'John Doe',
	email: 'john@example.com',
};

const mockProfile = {
	userId: 'user-uuid',
	displayName: 'John Doe',
	bio: 'Retreat enthusiast',
	location: 'Madrid, Spain',
	interests: ['meditation', 'nature'],
	avatarUrl: 'data:image/webp;base64,...',
};
```

### Sample S3 Configuration

```typescript
const s3Config = {
	region: 'us-east-1',
	bucketName: 'test-avatars-bucket',
	prefix: 'avatars/',
	expectedUrl: 'https://test-avatars-bucket.s3.us-east-1.amazonaws.com/avatars/user-uuid.webp',
};
```

## Testing Best Practices

### 1. Mock External Dependencies

Always mock external libraries and services to ensure tests run quickly and reliably:

```typescript
// ✅ GOOD - Mock sharp library
jest.mock('sharp', () =>
	jest.fn(() => ({
		/* ... */
	})),
);

// ❌ BAD - Real sharp library (slow, requires system dependencies)
import sharp from 'sharp';
```

### 2. Set Environment Variables Early

Set environment variables before importing modules that read them:

```typescript
// ✅ GOOD - Set before import
process.env.AWS_REGION = 'us-east-1';
import { s3Service } from './s3Service';

// ❌ BAD - Set after module initialization
import { s3Service } from './s3Service';
process.env.AWS_REGION = 'us-east-1'; // Too late!
```

### 3. Clear Mocks Between Tests

Use `beforeEach` to ensure clean state:

```typescript
beforeEach(() => {
	jest.clearAllMocks();
	mockSend.mockResolvedValue({ ETag: '"test-etag"' });
});
```

### 4. Test Both Success and Failure Cases

Comprehensive tests cover both happy path and edge cases:

```typescript
// Success case
test('should upload avatar successfully', async () => {
	/* ... */
});

// Failure cases
test('should handle S3 upload errors', async () => {
	/* ... */
});
test('should handle network errors', async () => {
	/* ... */
});
test('should handle access denied', async () => {
	/* ... */
});
```

### 5. Use Descriptive Test Names

Test names should clearly describe what is being tested:

```typescript
// ✅ GOOD
test('should delete old S3 avatar when uploading new one', async () => {
	/* ... */
});

// ❌ BAD
test('test avatar deletion', async () => {
	/* ... */
});
```

## Continuous Integration

The avatar tests run automatically in CI/CD:

```yaml
# .github/workflows/test.yml
steps:
  - name: Run tests
    run: pnpm test
```

### Test Results

As of the latest test run:

```
Test Suites: 25 passed, 25 total
Tests:       498 passed, 557 total
Snapshots:   0 total
Time:        ~180s
```

## Troubleshooting

### Common Issues

#### "Cannot find module 'sharp'"

This error occurs when tests try to use the real sharp library. Ensure sharp is properly mocked:

```typescript
jest.mock('sharp', () => jest.fn(() => ({ /* ... */ }));
```

#### "S3Client is not defined"

This occurs when environment variables are not set before module import. Move environment variable setup to the top of the file:

```typescript
process.env.AWS_REGION = 'us-east-1';
// ... other env vars
import { s3Service } from './s3Service';
```

#### "Entity metadata for UserProfile was not found"

This occurs when new entities are not registered in test setup. Add entities to `jest.setup.ts`:

```typescript
import { UserProfile } from '../entities/userProfile.entity';

beforeAll(async () => {
	dataSource = await createDataSource({
		entities: [User, UserProfile /* ... */],
	});
});
```

## Contributing

When adding new avatar-related features:

1. Write tests first (TDD approach)
2. Ensure all existing tests pass
3. Add new test cases to this documentation
4. Run `pnpm test` before committing
5. Aim for >80% code coverage

---

_This testing guide ensures the avatar storage system remains reliable and maintainable as new features are added._
