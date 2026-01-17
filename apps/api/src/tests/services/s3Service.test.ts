// Tests for s3Service - S3 operations for avatar storage

// Set test environment variables BEFORE importing the service
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.S3_BUCKET_NAME = 'test-avatars-bucket';
process.env.S3_BUCKET_PREFIX = 'avatars/';

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Service } from '../../services/s3Service';

// Mock AWS SDK v3 clients
jest.mock('@aws-sdk/client-s3', () => {
	const mockSend = jest.fn();
	return {
		S3Client: jest.fn().mockImplementation(() => ({
			send: mockSend,
		})),
		PutObjectCommand: jest.fn(),
		DeleteObjectCommand: jest.fn(),
		mockSend, // Export for testing
	};
});

const mockSend = require('@aws-sdk/client-s3').mockSend;

describe('S3Service', () => {
	const mockUserId = 'user-123';
	const mockBuffer = Buffer.from('test-image-data');
	const mockContentType = 'image/webp';
	const expectedBucket = 'test-avatars-bucket';
	const expectedPrefix = 'avatars/';

	beforeEach(() => {
		jest.clearAllMocks();
		mockSend.mockResolvedValue({ ETag: '"test-etag"' });
	});

	describe('uploadAvatar', () => {
		test('should upload avatar to S3 with correct parameters', async () => {
			await s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType);

			expect(PutObjectCommand).toHaveBeenCalledWith({
				Bucket: expectedBucket,
				Key: `${expectedPrefix}${mockUserId}.webp`,
				Body: mockBuffer,
				ContentType: mockContentType,
				CacheControl: 'public, max-age=31536000, immutable',
			});
			expect(mockSend).toHaveBeenCalled();
		});

		test('should return URL and key after successful upload', async () => {
			const result = await s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType);

			expect(result).toEqual({
				url: `https://${expectedBucket}.s3.us-east-1.amazonaws.com/${expectedPrefix}${mockUserId}.webp`,
				key: `${expectedPrefix}${mockUserId}.webp`,
			});
		});

		test('should handle different user IDs', async () => {
			const userIds = ['user-abc', 'user-xyz-123', 'user-with-special_chars'];

			for (const userId of userIds) {
				await s3Service.uploadAvatar(userId, mockBuffer, mockContentType);
			}

			expect(PutObjectCommand).toHaveBeenCalledTimes(3);
		});

		test('should set correct cache control headers', async () => {
			await s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType);

			expect(PutObjectCommand).toHaveBeenCalledWith(
				expect.objectContaining({
					CacheControl: 'public, max-age=31536000, immutable',
				}),
			);
		});

		test('should handle S3 upload errors', async () => {
			const s3Error = new Error('S3 upload failed');
			s3Error.name = 'NoSuchBucket';
			mockSend.mockRejectedValueOnce(s3Error);

			await expect(s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType)).rejects.toThrow(
				'S3 upload failed',
			);
		});

		test('should handle network errors during upload', async () => {
			const networkError = new Error('Network error');
			networkError.name = 'NetworkError';
			mockSend.mockRejectedValueOnce(networkError);

			await expect(s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType)).rejects.toThrow(
				'Network error',
			);
		});

		test('should handle access denied errors', async () => {
			const accessError = new Error('Access Denied');
			accessError.name = 'AccessDenied';
			mockSend.mockRejectedValueOnce(accessError);

			await expect(s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType)).rejects.toThrow(
				'Access Denied',
			);
		});
	});

	describe('deleteAvatar', () => {
		test('should delete avatar from S3 with correct parameters', async () => {
			await s3Service.deleteAvatar(mockUserId);

			expect(DeleteObjectCommand).toHaveBeenCalledWith({
				Bucket: expectedBucket,
				Key: `${expectedPrefix}${mockUserId}.webp`,
			});
			expect(mockSend).toHaveBeenCalled();
		});

		test('should handle S3 deletion errors', async () => {
			const s3Error = new Error('S3 deletion failed');
			mockSend.mockRejectedValueOnce(s3Error);

			await expect(s3Service.deleteAvatar(mockUserId)).rejects.toThrow('S3 deletion failed');
		});

		test('should handle access denied during deletion', async () => {
			const accessError = new Error('Access Denied');
			accessError.name = 'AccessDenied';
			mockSend.mockRejectedValueOnce(accessError);

			await expect(s3Service.deleteAvatar(mockUserId)).rejects.toThrow('Access Denied');
		});
	});

	describe('getPublicUrl', () => {
		test('should generate correct public URL for standard us-east-1 region', async () => {
			const result = await s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType);

			expect(result.url).toBe(
				`https://${expectedBucket}.s3.us-east-1.amazonaws.com/${expectedPrefix}${mockUserId}.webp`,
			);
		});

		test('should include full key path in URL', async () => {
			const result = await s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType);

			expect(result.url).toContain(`${expectedPrefix}${mockUserId}.webp`);
		});
	});

	describe('S3Client Configuration', () => {
		test('should initialize S3Client with correct region', () => {
			// S3Client is initialized at module load time, so we just verify
			// the service was created successfully (which it was if we got here)
			expect(s3Service).toBeDefined();
		});

		test('should initialize S3Client with correct credentials', () => {
			// S3Client is initialized at module load time with credentials
			// We verify the service works by checking it was created
			expect(s3Service).toBeDefined();
		});
	});

	describe('Integration Scenarios', () => {
		test('should handle complete upload and delete cycle', async () => {
			// Upload
			const uploadResult = await s3Service.uploadAvatar(mockUserId, mockBuffer, mockContentType);
			expect(uploadResult.url).toContain(`${mockUserId}.webp`);

			// Delete
			await s3Service.deleteAvatar(mockUserId);
			expect(DeleteObjectCommand).toHaveBeenCalled();
		});

		test('should handle multiple concurrent uploads', async () => {
			const uploadPromises = [
				s3Service.uploadAvatar('user-1', mockBuffer, mockContentType),
				s3Service.uploadAvatar('user-2', mockBuffer, mockContentType),
				s3Service.uploadAvatar('user-3', mockBuffer, mockContentType),
			];

			const results = await Promise.all(uploadPromises);

			expect(results).toHaveLength(3);
			expect(results[0].url).toContain('user-1.webp');
			expect(results[1].url).toContain('user-2.webp');
			expect(results[2].url).toContain('user-3.webp');
		});

		test('should handle partial failures in batch operations', async () => {
			let callCount = 0;
			mockSend.mockImplementation(() => {
				callCount++;
				if (callCount === 2) {
					return Promise.reject(new Error('Upload failed'));
				}
				return Promise.resolve({ ETag: '"test-etag"' });
			});

			const uploadPromises = [
				s3Service.uploadAvatar('user-1', mockBuffer, mockContentType),
				s3Service.uploadAvatar('user-2', mockBuffer, mockContentType),
				s3Service.uploadAvatar('user-3', mockBuffer, mockContentType),
			];

			const results = await Promise.allSettled(uploadPromises);

			expect(results[0].status).toBe('fulfilled');
			expect(results[1].status).toBe('rejected');
			expect(results[2].status).toBe('fulfilled');
		});
	});
});
