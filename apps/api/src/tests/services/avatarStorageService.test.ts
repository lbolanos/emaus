// Tests for avatarStorageService - Storage abstraction layer

// Set test environment variables BEFORE importing the service
process.env.AVATAR_STORAGE = 'base64';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.S3_BUCKET_PREFIX = 'avatars/';

import { avatarStorageService } from '../../services/avatarStorageService';
import { imageService } from '../../services/imageService';
import { s3Service } from '../../services/s3Service';

// Mock the underlying services
jest.mock('../../services/imageService');
jest.mock('../../services/s3Service');

const mockImageService = imageService as jest.Mocked<typeof imageService>;
const mockS3Service = s3Service as jest.Mocked<typeof s3Service>;

describe('AvatarStorageService', () => {
	const mockUserId = 'user-123';
	const mockBase64Data = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('uploadAvatar in base64 mode', () => {
		test('should return base64 data as-is', async () => {
			const result = await avatarStorageService.uploadAvatar(mockUserId, mockBase64Data);

			expect(result).toEqual({
				url: mockBase64Data,
				storageType: 'base64',
			});
		});

		test('should not call S3 or image processing in base64 mode', async () => {
			await avatarStorageService.uploadAvatar(mockUserId, mockBase64Data);

			expect(mockS3Service.uploadAvatar).not.toHaveBeenCalled();
			expect(mockImageService.base64ToBuffer).not.toHaveBeenCalled();
			expect(mockImageService.processAvatar).not.toHaveBeenCalled();
		});

		test('should handle various image formats in base64 mode', async () => {
			const testCases = [
				'data:image/jpeg;base64,/9j/...',
				'data:image/png;base64,iVBORw...',
				'data:image/gif;base64,R0lGO...',
				'data:image/webp;base64,UklGR...',
			];

			for (const base64 of testCases) {
				const result = await avatarStorageService.uploadAvatar(mockUserId, base64);
				expect(result.storageType).toBe('base64');
				expect(result.url).toBe(base64);
			}
		});
	});

	describe('deleteAvatar in base64 mode', () => {
		test('should not delete from S3 for base64 avatars', async () => {
			await avatarStorageService.deleteAvatar(mockUserId, mockBase64Data);

			expect(mockS3Service.deleteAvatar).not.toHaveBeenCalled();
		});

		test('should not delete from S3 for null avatar URL', async () => {
			await avatarStorageService.deleteAvatar(mockUserId, null as any);

			expect(mockS3Service.deleteAvatar).not.toHaveBeenCalled();
		});

		test('should not delete from S3 for undefined avatar URL', async () => {
			await avatarStorageService.deleteAvatar(mockUserId, undefined as any);

			expect(mockS3Service.deleteAvatar).not.toHaveBeenCalled();
		});

		test('should not delete from S3 for empty string avatar URL', async () => {
			await avatarStorageService.deleteAvatar(mockUserId, '');

			expect(mockS3Service.deleteAvatar).not.toHaveBeenCalled();
		});

		test('should not delete from S3 for S3 URLs when in base64 mode', async () => {
			// Even if it's an S3 URL, in base64 mode we don't call S3 delete
			const s3Url = 'https://bucket.s3.region.amazonaws.com/avatars/user-123.webp';

			await avatarStorageService.deleteAvatar(mockUserId, s3Url);

			expect(mockS3Service.deleteAvatar).not.toHaveBeenCalled();
		});
	});

	describe('isS3Storage', () => {
		test('should return false in base64 mode', () => {
			expect(avatarStorageService.isS3Storage()).toBe(false);
		});
	});

	describe('Integration scenarios', () => {
		test('should handle complete avatar lifecycle with base64', async () => {
			// Upload
			const uploadResult = await avatarStorageService.uploadAvatar(mockUserId, mockBase64Data);
			expect(uploadResult.storageType).toBe('base64');

			// Delete (no-op for base64)
			await avatarStorageService.deleteAvatar(mockUserId, uploadResult.url);
			expect(mockS3Service.deleteAvatar).not.toHaveBeenCalled();
		});

		test('should handle avatar update cycle', async () => {
			const oldAvatar = 'data:image/jpeg;base64,old-data';
			const newAvatar = 'data:image/png;base64,new-data';

			// Delete old (no-op)
			await avatarStorageService.deleteAvatar(mockUserId, oldAvatar);

			// Upload new
			const result = await avatarStorageService.uploadAvatar(mockUserId, newAvatar);

			expect(result.storageType).toBe('base64');
			expect(result.url).toBe(newAvatar);
		});

		test('should handle S3 service unavailability gracefully', async () => {
			mockS3Service.uploadAvatar.mockRejectedValue(new Error('Service unavailable'));

			// In base64 mode, S3 errors don't affect the service
			const result = await avatarStorageService.uploadAvatar(mockUserId, mockBase64Data);
			expect(result.storageType).toBe('base64');
		});
	});
});
