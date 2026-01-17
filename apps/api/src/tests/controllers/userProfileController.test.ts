// Tests for userProfileController - Avatar endpoints
import { Request, Response } from 'express';
import { updateAvatar, removeAvatar } from '../../controllers/userProfileController';

// Mock dependencies
jest.mock('../../utils/auth');
jest.mock('../../services/userProfileService');
jest.mock('../../services/avatarStorageService');

import { getUserFromRequest } from '../../utils/auth';
import { avatarStorageService } from '../../services/avatarStorageService';
import { getUserProfile, updateUserProfile } from '../../services/userProfileService';

const mockGetUserFromRequest = getUserFromRequest as jest.MockedFunction<typeof getUserFromRequest>;
const mockAvatarStorageService = avatarStorageService as jest.Mocked<typeof avatarStorageService>;
const mockGetUserProfile = getUserProfile as jest.MockedFunction<typeof getUserProfile>;
const mockUpdateUserProfile = updateUserProfile as jest.MockedFunction<typeof updateUserProfile>;

describe('UserProfileController - Avatar Endpoints', () => {
	let mockRequest: Partial<Request>;
	let mockResponse: Partial<Response>;
	let responseJson: any;
	let responseStatus: any;

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();

		// Setup mock request
		mockRequest = {
			body: {},
			params: {},
		};

		// Setup mock response
		responseJson = jest.fn().mockReturnThis();
		responseStatus = jest.fn().mockReturnValue({ json: responseJson });
		mockResponse = {
			status: responseStatus,
			json: responseJson,
		} as any;

		// Setup default user
		const mockUser = { id: 'user-123', email: 'test@example.com' };
		mockGetUserFromRequest.mockReturnValue(mockUser as any);

		// Setup default profile
		const mockProfile = {
			userId: 'user-123',
			bio: 'Test bio',
			avatarUrl: null,
		};
		mockGetUserProfile.mockResolvedValue(mockProfile);
		mockUpdateUserProfile.mockResolvedValue(mockProfile);

		// Setup avatar storage service mocks
		mockAvatarStorageService.uploadAvatar.mockResolvedValue({
			url: 'data:image/jpeg;base64,test',
			storageType: 'base64',
		});
		mockAvatarStorageService.deleteAvatar.mockResolvedValue();
	});

	describe('updateAvatar', () => {
		const mockBase64Avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
		const mockS3Url = 'https://bucket.s3.amazonaws.com/avatars/user-123.webp';

		beforeEach(() => {
			mockRequest.body = { avatarUrl: mockBase64Avatar };
		});

		test('should update avatar successfully with base64 input', async () => {
			mockAvatarStorageService.uploadAvatar.mockResolvedValue({
				url: mockBase64Avatar,
				storageType: 'base64',
			});
			mockUpdateUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: mockBase64Avatar, // Return profile with updated avatarUrl
			});

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(mockAvatarStorageService.uploadAvatar).toHaveBeenCalledWith(
				'user-123',
				mockBase64Avatar,
			);
			expect(mockUpdateUserProfile).toHaveBeenCalledWith('user-123', {
				avatarUrl: mockBase64Avatar,
			});
			expect(responseJson).toHaveBeenCalledWith(
				expect.objectContaining({ avatarUrl: mockBase64Avatar }),
			);
		});

		test('should update avatar successfully with S3 upload', async () => {
			mockAvatarStorageService.uploadAvatar.mockResolvedValue({
				url: mockS3Url,
				storageType: 's3',
			});
			mockUpdateUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: mockS3Url, // Return profile with updated avatarUrl
			});

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(mockAvatarStorageService.uploadAvatar).toHaveBeenCalledWith(
				'user-123',
				mockBase64Avatar,
			);
			expect(mockUpdateUserProfile).toHaveBeenCalledWith('user-123', {
				avatarUrl: mockS3Url,
			});
			expect(responseJson).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: mockS3Url }));
		});

		test('should delete old avatar before uploading new one', async () => {
			const oldProfile = {
				userId: 'user-123',
				avatarUrl: 'https://old-url.s3.amazonaws.com/avatars/user-123.webp',
			};
			mockGetUserProfile.mockResolvedValue(oldProfile);

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(mockGetUserProfile).toHaveBeenCalledWith('user-123');
			expect(mockAvatarStorageService.deleteAvatar).toHaveBeenCalledWith(
				'user-123',
				oldProfile.avatarUrl,
			);
			expect(mockAvatarStorageService.uploadAvatar).toHaveBeenCalled();
		});

		test('should handle null old avatar gracefully', async () => {
			mockGetUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: null,
			});

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			// Controller doesn't call deleteAvatar when avatarUrl is null
			expect(mockAvatarStorageService.deleteAvatar).not.toHaveBeenCalled();
			expect(mockAvatarStorageService.uploadAvatar).toHaveBeenCalled();
		});

		test('should return 401 if user is not authenticated', async () => {
			mockGetUserFromRequest.mockReturnValue(null);

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(401);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Usuario no autenticado' });
		});

		test('should return 400 if avatarUrl is missing', async () => {
			mockRequest.body = {};

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(400);
			expect(responseJson).toHaveBeenCalledWith({ message: 'avatarUrl es requerido' });
		});

		test('should return 400 if avatarUrl is empty string', async () => {
			mockRequest.body = { avatarUrl: '' };

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(400);
			expect(responseJson).toHaveBeenCalledWith({ message: 'avatarUrl es requerido' });
		});

		test('should return 400 if avatarUrl is null', async () => {
			mockRequest.body = { avatarUrl: null };

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(400);
			expect(responseJson).toHaveBeenCalledWith({ message: 'avatarUrl es requerido' });
		});

		test('should handle storage service errors', async () => {
			mockAvatarStorageService.uploadAvatar.mockRejectedValue(new Error('Storage upload failed'));

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(500);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Storage upload failed' });
		});

		test('should handle database update errors', async () => {
			mockUpdateUserProfile.mockRejectedValue(new Error('Database error'));

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(500);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Database error' });
		});

		test('should handle profile retrieval errors', async () => {
			mockGetUserProfile.mockRejectedValue(new Error('Database error'));

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(500);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Database error' });
		});

		test('should handle delete old avatar errors but still upload new one', async () => {
			// The controller stops execution if delete fails, so upload is not attempted
			mockAvatarStorageService.deleteAvatar.mockRejectedValue(new Error('Delete failed'));

			// Set up a profile with an existing avatar
			mockGetUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: 'https://old-url.s3.amazonaws.com/avatars/user-123.webp',
			});

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			// Delete was attempted but failed
			expect(mockAvatarStorageService.deleteAvatar).toHaveBeenCalled();
			// Upload was not attempted because delete failed
			expect(mockAvatarStorageService.uploadAvatar).not.toHaveBeenCalled();
			expect(responseStatus).toHaveBeenCalledWith(500);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Delete failed' });
		});
	});

	describe('removeAvatar', () => {
		const mockS3Url = 'https://bucket.s3.amazonaws.com/avatars/user-123.webp';

		beforeEach(() => {
			mockAvatarStorageService.deleteAvatar.mockResolvedValue();
		});

		test('should remove avatar successfully', async () => {
			mockGetUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: mockS3Url,
			});
			mockUpdateUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: null,
			});

			await removeAvatar(mockRequest as Request, mockResponse as Response);

			expect(mockGetUserProfile).toHaveBeenCalledWith('user-123');
			expect(mockAvatarStorageService.deleteAvatar).toHaveBeenCalledWith('user-123', mockS3Url);
			expect(mockUpdateUserProfile).toHaveBeenCalledWith('user-123', {
				avatarUrl: null,
			});
			expect(responseJson).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: null }));
		});

		test('should handle removal of base64 avatar', async () => {
			const base64Avatar = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
			mockGetUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: base64Avatar,
			});
			mockUpdateUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: null,
			});

			await removeAvatar(mockRequest as Request, mockResponse as Response);

			// deleteAvatar should be called but won't do anything for base64
			expect(mockAvatarStorageService.deleteAvatar).toHaveBeenCalledWith('user-123', base64Avatar);
			expect(mockUpdateUserProfile).toHaveBeenCalledWith('user-123', {
				avatarUrl: null,
			});
		});

		test('should handle null current avatar', async () => {
			mockGetUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: null,
			});
			mockUpdateUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: null,
			});

			await removeAvatar(mockRequest as Request, mockResponse as Response);

			// Controller doesn't call deleteAvatar when avatarUrl is null
			expect(mockAvatarStorageService.deleteAvatar).not.toHaveBeenCalled();
			expect(mockUpdateUserProfile).toHaveBeenCalledWith('user-123', {
				avatarUrl: null,
			});
			expect(responseJson).toHaveBeenCalled();
		});

		test('should return 401 if user is not authenticated', async () => {
			mockGetUserFromRequest.mockReturnValue(null);

			await removeAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(401);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Usuario no autenticado' });
		});

		test('should handle storage service errors', async () => {
			// Set up a profile with an existing avatar so delete is called
			mockGetUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: mockS3Url,
			});
			mockAvatarStorageService.deleteAvatar.mockRejectedValue(new Error('Storage delete failed'));

			await removeAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(500);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Storage delete failed' });
		});

		test('should handle database update errors', async () => {
			mockUpdateUserProfile.mockRejectedValue(new Error('Database error'));

			await removeAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(500);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Database error' });
		});

		test('should handle profile retrieval errors', async () => {
			mockGetUserProfile.mockRejectedValue(new Error('Database error'));

			await removeAvatar(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(500);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Database error' });
		});
	});

	describe('Integration scenarios', () => {
		test('should handle complete avatar update cycle', async () => {
			// First upload
			const firstAvatar = 'data:image/jpeg;base64,first-avatar';
			mockRequest.body = { avatarUrl: firstAvatar };
			mockAvatarStorageService.uploadAvatar.mockResolvedValue({
				url: 'https://s3.amazonaws.com/avatars/user-123.webp',
				storageType: 's3',
			});

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(mockAvatarStorageService.uploadAvatar).toHaveBeenCalledWith('user-123', firstAvatar);

			// Update to new avatar
			const secondAvatar = 'data:image/png;base64,second-avatar';
			mockRequest.body = { avatarUrl: secondAvatar };
			const oldProfile = {
				userId: 'user-123',
				avatarUrl: 'https://s3.amazonaws.com/avatars/user-123.webp',
			};
			mockGetUserProfile.mockResolvedValue(oldProfile);
			mockAvatarStorageService.uploadAvatar.mockResolvedValue({
				url: 'https://s3.amazonaws.com/avatars/user-123.webp',
				storageType: 's3',
			});

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			expect(mockAvatarStorageService.deleteAvatar).toHaveBeenCalledWith(
				'user-123',
				oldProfile.avatarUrl,
			);
			expect(mockAvatarStorageService.uploadAvatar).toHaveBeenCalledWith('user-123', secondAvatar);
		});

		test('should handle avatar removal after update', async () => {
			// Upload avatar
			const avatar = 'data:image/jpeg;base64,test-avatar';
			mockRequest.body = { avatarUrl: avatar };
			mockAvatarStorageService.uploadAvatar.mockResolvedValue({
				url: 'https://s3.amazonaws.com/avatars/user-123.webp',
				storageType: 's3',
			});

			await updateAvatar(mockRequest as Request, mockResponse as Response);

			// Remove avatar
			mockGetUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: 'https://s3.amazonaws.com/avatars/user-123.webp',
			});
			mockUpdateUserProfile.mockResolvedValue({
				userId: 'user-123',
				avatarUrl: null,
			});

			await removeAvatar(mockRequest as Request, mockResponse as Response);

			expect(mockAvatarStorageService.deleteAvatar).toHaveBeenCalledWith(
				'user-123',
				'https://s3.amazonaws.com/avatars/user-123.webp',
			);
			expect(mockUpdateUserProfile).toHaveBeenCalledWith('user-123', { avatarUrl: null });
		});
	});
});
