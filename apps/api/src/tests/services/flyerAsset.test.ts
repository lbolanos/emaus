// Tests for flyer artwork processing and storage.
import { imageService } from '../../services/imageService';

jest.mock('sharp');
jest.mock('../../services/s3Service', () => ({
	s3Service: { uploadPublicAsset: jest.fn() },
	S3_PREFIXES: { PUBLIC_ASSETS: 'public-assets/' },
}));
jest.mock('../../services/avatarStorageService', () => ({
	avatarStorageService: { isS3Storage: jest.fn() },
}));

import sharp from 'sharp';
import { s3Service } from '../../services/s3Service';
import { avatarStorageService } from '../../services/avatarStorageService';
import { FlyerAssetError, storeFlyerAsset } from '../../services/flyerAssetService';

const mockMetadata = jest.fn();
const mockResize = jest.fn();
const mockWebp = jest.fn();
const mockToBuffer = jest.fn();

const mockSharpInstance = {
	metadata: mockMetadata,
	resize: mockResize,
	webp: mockWebp,
	toBuffer: mockToBuffer,
};

/** A real 1x1 PNG: processFlyerAsset checks magic bytes before touching sharp. */
const PNG_DATA_URL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeEach(() => {
	jest.clearAllMocks();
	mockResize.mockReturnValue(mockSharpInstance);
	mockWebp.mockReturnValue(mockSharpInstance);
	mockMetadata.mockResolvedValue({ width: 3000, height: 2000, format: 'png' });
	mockToBuffer.mockResolvedValue(Buffer.from('processed-webp'));
	(sharp as unknown as jest.Mock).mockReturnValue(mockSharpInstance);
});

describe('imageService.processFlyerAsset', () => {
	const buffer = Buffer.from(
		'89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
		'hex',
	);

	test('bounds a background at 1600px and never crops it', async () => {
		await imageService.processFlyerAsset(buffer, 'image/png', 'bodyBackground');

		// fit 'inside' keeps the whole picture; 'cover' (what avatars use) would cut it
		expect(mockResize).toHaveBeenCalledWith(1600, 1600, {
			fit: 'inside',
			withoutEnlargement: true,
		});
	});

	test('bounds a logo at 512px', async () => {
		await imageService.processFlyerAsset(buffer, 'image/png', 'logo');

		expect(mockResize).toHaveBeenCalledWith(512, 512, {
			fit: 'inside',
			withoutEnlargement: true,
		});
	});

	test('always returns WebP', async () => {
		const result = await imageService.processFlyerAsset(buffer, 'image/png', 'headerBackground');

		expect(mockWebp).toHaveBeenCalledWith({ quality: 85 });
		expect(result.contentType).toBe('image/webp');
	});

	test('rejects a file over 2MB', async () => {
		const tooBig = Buffer.alloc(3 * 1024 * 1024);
		// Keep the PNG magic bytes so it fails on size, not on the type check
		Buffer.from('89504e470d0a1a0a', 'hex').copy(tooBig);

		await expect(imageService.processFlyerAsset(tooBig, 'image/png', 'logo')).rejects.toThrow(
			/2MB/,
		);
	});

	test('rejects content that does not match its declared type', async () => {
		const notAnImage = Buffer.from('this is not a png at all');

		await expect(
			imageService.processFlyerAsset(notAnImage, 'image/png', 'logo'),
		).rejects.toThrow(/does not match/);
	});
});

describe('storeFlyerAsset', () => {
	test('uploads under public-assets/ when S3 is configured', async () => {
		(avatarStorageService.isS3Storage as jest.Mock).mockReturnValue(true);
		(s3Service.uploadPublicAsset as jest.Mock).mockResolvedValue({
			url: 'https://bucket.s3.us-east-2.amazonaws.com/public-assets/flyer-assets/x-logo.webp',
			key: 'public-assets/flyer-assets/x-logo.webp',
		});

		const url = await storeFlyerAsset(PNG_DATA_URL, 'logo');

		expect(url).toContain('public-assets/flyer-assets/');
		const [path, , contentType] = (s3Service.uploadPublicAsset as jest.Mock).mock.calls[0];
		// public-assets/ is the only prefix served without a presigned URL, so a flyer
		// left open or shared as a link keeps working
		expect(path).toMatch(/^flyer-assets\/.+-logo\.webp$/);
		expect(contentType).toBe('image/webp');
	});

	test('falls back to an inline data URI when S3 is not configured', async () => {
		(avatarStorageService.isS3Storage as jest.Mock).mockReturnValue(false);

		const url = await storeFlyerAsset(PNG_DATA_URL, 'bodyBackground');

		expect(url.startsWith('data:image/webp;base64,')).toBe(true);
		expect(s3Service.uploadPublicAsset).not.toHaveBeenCalled();
	});

	test('refuses to inline something large without S3', async () => {
		(avatarStorageService.isS3Storage as jest.Mock).mockReturnValue(false);
		mockToBuffer.mockResolvedValue(Buffer.alloc(600 * 1024));

		await expect(storeFlyerAsset(PNG_DATA_URL, 'bodyBackground')).rejects.toThrow(
			FlyerAssetError,
		);
	});
});
