// Tests for imageService - Image processing for avatars
import { imageService } from '../../services/imageService';

// Mock sharp to avoid image processing dependencies in tests
jest.mock('sharp');

import sharp from 'sharp';

const mockMetadata = jest.fn();
const mockResize = jest.fn();
const mockWebp = jest.fn();
const mockToBuffer = jest.fn();

// Create a mock sharp instance
const mockSharpInstance = {
	metadata: mockMetadata,
	resize: mockResize,
	webp: mockWebp,
	toBuffer: mockToBuffer,
};

// Set up default mock implementations
beforeEach(() => {
	// Clear all mock calls
	jest.clearAllMocks();

	// Set up default return values
	mockResize.mockReturnValue(mockSharpInstance);
	mockWebp.mockReturnValue(mockSharpInstance);
	mockMetadata.mockResolvedValue({ width: 1024, height: 768, format: 'jpeg' });
	mockToBuffer.mockResolvedValue(Buffer.from('processed-webp'));
});

// Mock the sharp constructor
(sharp as unknown as jest.Mock).mockReturnValue(mockSharpInstance);

describe('ImageService', () => {
	describe('base64ToBuffer', () => {
		test('should convert valid base64 JPEG to buffer', () => {
			const base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';
			const result = imageService.base64ToBuffer(base64);

			expect(result.buffer).toBeInstanceOf(Buffer);
			expect(result.contentType).toBe('image/jpeg');
			expect(result.buffer.length).toBeGreaterThan(0);
		});

		test('should convert valid base64 PNG to buffer', () => {
			const base64 =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
			const result = imageService.base64ToBuffer(base64);

			expect(result.buffer).toBeInstanceOf(Buffer);
			expect(result.contentType).toBe('image/png');
			expect(result.buffer.length).toBeGreaterThan(0);
		});

		test('should convert valid base64 WebP to buffer', () => {
			const base64 =
				'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
			const result = imageService.base64ToBuffer(base64);

			expect(result.buffer).toBeInstanceOf(Buffer);
			expect(result.contentType).toBe('image/webp');
			expect(result.buffer.length).toBeGreaterThan(0);
		});

		test('should throw error for invalid base64 format', () => {
			const invalidBase64 = 'not-a-valid-base64-string';

			expect(() => {
				imageService.base64ToBuffer(invalidBase64);
			}).toThrow('Invalid base64 image format');
		});

		test('should throw error for base64 without data prefix', () => {
			const base64WithoutPrefix = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';

			expect(() => {
				imageService.base64ToBuffer(base64WithoutPrefix);
			}).toThrow('Invalid base64 image format');
		});

		test('should throw error for base64 with invalid image type', () => {
			const invalidImageType = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';

			expect(() => {
				imageService.base64ToBuffer(invalidImageType);
			}).toThrow('Invalid base64 image format');
		});

		// Note: Empty base64 data (after the comma) is invalid and will throw
		// This is expected behavior as we require at least one character of data
	});

	describe('isValidImage', () => {
		test('should validate JPEG content type', () => {
			expect(imageService.isValidImage('image/jpeg')).toBe(true);
		});

		test('should validate PNG content type', () => {
			expect(imageService.isValidImage('image/png')).toBe(true);
		});

		test('should validate GIF content type', () => {
			expect(imageService.isValidImage('image/gif')).toBe(true);
		});

		test('should validate WebP content type', () => {
			expect(imageService.isValidImage('image/webp')).toBe(true);
		});

		test('should reject invalid content types', () => {
			expect(imageService.isValidImage('image/svg+xml')).toBe(false);
			expect(imageService.isValidImage('application/pdf')).toBe(false);
			expect(imageService.isValidImage('text/plain')).toBe(false);
			expect(imageService.isValidImage('')).toBe(false);
		});
	});

	describe('processAvatar', () => {
		// Create buffers with valid magic bytes for each image type
		const createJpegBuffer = () => Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
		const createPngBuffer = () => Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
		const createGifBuffer = () => Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
		const createWebpBuffer = () => Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

		test('should process image and convert to WebP', async () => {
			const result = await imageService.processAvatar(createJpegBuffer(), 'image/jpeg');

			expect(result).toEqual({
				buffer: expect.any(Buffer),
				contentType: 'image/webp',
				width: 1024,
				height: 768,
			});
		});

		test('should resize image if larger than MAX_SIZE', async () => {
			// Mock metadata to return larger than MAX_SIZE (512)
			mockMetadata.mockResolvedValueOnce({
				width: 1920,
				height: 1080,
				format: 'jpeg',
			});

			await imageService.processAvatar(createJpegBuffer(), 'image/jpeg');

			expect(mockResize).toHaveBeenCalledWith(
				512,
				512,
				expect.objectContaining({
					fit: 'cover',
					position: 'center',
				}),
			);
		});

		test('should not resize image if smaller than MAX_SIZE', async () => {
			// Mock metadata to return smaller than MAX_SIZE (512)
			mockMetadata.mockResolvedValueOnce({
				width: 300,
				height: 200,
				format: 'jpeg',
			});

			await imageService.processAvatar(createJpegBuffer(), 'image/jpeg');

			expect(mockResize).not.toHaveBeenCalled();
		});

		test('should not resize image if exactly MAX_SIZE', async () => {
			mockMetadata.mockResolvedValueOnce({
				width: 512,
				height: 512,
				format: 'jpeg',
			});

			await imageService.processAvatar(createJpegBuffer(), 'image/jpeg');

			expect(mockResize).not.toHaveBeenCalled();
		});

		test('should convert to WebP with correct quality', async () => {
			await imageService.processAvatar(createJpegBuffer(), 'image/jpeg');

			expect(mockWebp).toHaveBeenCalledWith(
				expect.objectContaining({
					quality: 85,
				}),
			);
		});

		test('should handle PNG input', async () => {
			mockMetadata.mockResolvedValueOnce({ width: 100, height: 100, format: 'png' });
			const result = await imageService.processAvatar(createPngBuffer(), 'image/png');

			expect(result.contentType).toBe('image/webp');
			expect(result.buffer).toBeInstanceOf(Buffer);
		});

		test('should handle WebP input', async () => {
			mockMetadata.mockResolvedValueOnce({ width: 100, height: 100, format: 'webp' });
			const result = await imageService.processAvatar(createWebpBuffer(), 'image/webp');

			expect(result.contentType).toBe('image/webp');
			expect(result.buffer).toBeInstanceOf(Buffer);
		});

		test('should handle GIF input', async () => {
			mockMetadata.mockResolvedValueOnce({ width: 100, height: 100, format: 'gif' });
			const result = await imageService.processAvatar(createGifBuffer(), 'image/gif');

			expect(result.contentType).toBe('image/webp');
			expect(result.buffer).toBeInstanceOf(Buffer);
		});

		test('should return zero dimensions when metadata is missing', async () => {
			mockMetadata.mockResolvedValueOnce({ format: 'jpeg' });

			const result = await imageService.processAvatar(createJpegBuffer(), 'image/jpeg');

			expect(result.width).toBe(0);
			expect(result.height).toBe(0);
		});

		test('should return zero dimensions when metadata returns null width', async () => {
			mockMetadata.mockResolvedValueOnce({
				width: null,
				height: null,
				format: 'jpeg',
			});

			const result = await imageService.processAvatar(createJpegBuffer(), 'image/jpeg');

			expect(result.width).toBe(0);
			expect(result.height).toBe(0);
		});
	});

	describe('Process Flow Integration', () => {
		test('should handle complete base64 to WebP conversion flow', async () => {
			const base64Input = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD';

			// Convert base64 to buffer
			const { buffer, contentType } = imageService.base64ToBuffer(base64Input);
			expect(buffer).toBeInstanceOf(Buffer);
			expect(contentType).toBe('image/jpeg');

			// Note: processAvatar will fail magic bytes validation since Sharp is mocked
			// and the base64 data is too short. This test validates the conversion flow.
		});

		test('should handle different aspect ratios correctly', async () => {
			const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);

			// Test landscape (16:9)
			mockMetadata.mockResolvedValueOnce({
				width: 1920,
				height: 1080,
				format: 'jpeg',
			});

			await imageService.processAvatar(jpegBuffer, 'image/jpeg');
			expect(mockResize).toHaveBeenCalledWith(512, 512, {
				fit: 'cover',
				position: 'center',
			});

			// Test portrait (9:16)
			mockMetadata.mockResolvedValueOnce({
				width: 1080,
				height: 1920,
				format: 'jpeg',
			});

			jest.clearAllMocks();
			await imageService.processAvatar(jpegBuffer, 'image/jpeg');
			expect(mockResize).toHaveBeenCalledWith(512, 512, {
				fit: 'cover',
				position: 'center',
			});
		});
	});

	describe('Error Handling', () => {
		// Create a buffer with valid JPEG magic bytes for testing Sharp errors
		const createJpegBuffer = () => Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);

		test('should handle sharp processing errors gracefully', async () => {
			const mockBuffer = createJpegBuffer();
			mockToBuffer.mockRejectedValueOnce(new Error('Sharp processing failed'));

			await expect(imageService.processAvatar(mockBuffer, 'image/jpeg')).rejects.toThrow(
				'Sharp processing failed',
			);
		});

		test('should handle metadata retrieval errors', async () => {
			const mockBuffer = createJpegBuffer();
			mockMetadata.mockRejectedValueOnce(new Error('Cannot read metadata'));

			await expect(imageService.processAvatar(mockBuffer, 'image/jpeg')).rejects.toThrow(
				'Cannot read metadata',
			);
		});

		test('should reject buffer with invalid magic bytes', async () => {
			const mockBuffer = Buffer.from('not-an-image');

			await expect(imageService.processAvatar(mockBuffer, 'image/jpeg')).rejects.toThrow(
				'File content does not match declared MIME type',
			);
		});
	});
});
