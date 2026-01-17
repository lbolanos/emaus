import { s3Service } from './s3Service';
import { imageService } from './imageService';
import { config } from '../config/env';

type StorageType = 'base64' | 's3';

interface UploadResult {
	url: string;
	storageType: StorageType;
}

class AvatarStorageService {
	private getStorageType(): StorageType {
		return config.avatar.storage;
	}

	async uploadAvatar(userId: string, base64Data: string): Promise<UploadResult> {
		const storageType = this.getStorageType();

		if (storageType === 's3') {
			// Convert base64 to buffer
			const buffer = imageService.base64ToBuffer(base64Data);

			// Process image (resize, convert to webp)
			const processed = await imageService.processAvatar(buffer, 'image/*');

			// Upload to S3
			const result = await s3Service.uploadAvatar(userId, processed.buffer, processed.contentType);

			return {
				url: result.url,
				storageType: 's3',
			};
		}

		// Default: return base64 as-is
		return {
			url: base64Data,
			storageType: 'base64',
		};
	}

	async deleteAvatar(userId: string, currentUrl: string): Promise<void> {
		const storageType = this.getStorageType();

		if (storageType === 's3' && currentUrl && !currentUrl.startsWith('data:')) {
			// Delete from S3 if it's an S3 URL
			await s3Service.deleteAvatar(userId);
		}
		// For base64, nothing to delete (will be null in DB)
	}

	isS3Storage(): boolean {
		return this.getStorageType() === 's3';
	}
}

export const avatarStorageService = new AvatarStorageService();
