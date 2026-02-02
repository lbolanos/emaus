import sharp from 'sharp';

interface ProcessedImage {
	buffer: Buffer;
	contentType: string;
	width: number;
	height: number;
}

class ImageService {
	private readonly MAX_SIZE = 512; // pixels
	private readonly QUALITY = 85; // webp quality
	private readonly MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

	// Magic bytes for file format verification
	private readonly MAGIC_BYTES = {
		jpeg: [0xFF, 0xD8, 0xFF],
		png: [0x89, 0x50, 0x4E, 0x47],
		gif: [0x47, 0x49, 0x46],
		webp: [0x52, 0x49, 0x46, 0x46], // RIFF
	};

	/**
	 * Verify file magic bytes match claimed content type
	 */
	private verifyMagicBytes(buffer: Buffer, contentType: string): boolean {
		const format = this.contentTypeToFormat(contentType);
		const magic = this.MAGIC_BYTES[format];

		if (!magic) return false;

		// Ensure buffer is large enough for magic byte check
		if (buffer.length < magic.length) {
			return false;
		}

		// Special case for WebP - needs 12 bytes minimum (RIFF...WEBP)
		if (format === 'webp') {
			if (buffer.length < 12) return false;
			return (
				buffer[0] === 0x52 && buffer[1] === 0x49 &&
				buffer[2] === 0x46 && buffer[3] === 0x46 &&
				buffer[8] === 0x57 && buffer[9] === 0x45 &&
				buffer[10] === 0x42 && buffer[11] === 0x50
			);
		}

		// Check if buffer starts with magic bytes
		for (let i = 0; i < magic.length; i++) {
			if (buffer[i] !== magic[i]) {
				return false;
			}
		}

		return true;
	}

	private contentTypeToFormat(contentType: string): keyof typeof this.MAGIC_BYTES {
		const formatMap: Record<string, keyof typeof this.MAGIC_BYTES> = {
			'image/jpeg': 'jpeg',
			'image/jpg': 'jpeg',
			'image/png': 'png',
			'image/gif': 'gif',
			'image/webp': 'webp',
		};
		return formatMap[contentType] || 'jpeg';
	}

	async processAvatar(buffer: Buffer, contentType: string): Promise<ProcessedImage> {
		// Validate buffer size
		if (buffer.length > this.MAX_FILE_SIZE) {
			throw new Error('File size exceeds maximum (2MB)');
		}

		// Verify magic bytes
		if (!this.verifyMagicBytes(buffer, contentType)) {
			throw new Error('File content does not match declared MIME type');
		}

		let image = sharp(buffer);

		try {
			// Get metadata
			const metadata = await image.metadata();

			if (!metadata.format) {
				throw new Error('Unable to determine image format');
			}

			// Verify format matches content type
			const expectedFormat = this.contentTypeToFormat(contentType);
			if (metadata.format !== expectedFormat && expectedFormat !== 'jpeg') {
				if (!(metadata.format === 'jpg' && expectedFormat === 'jpeg')) {
					throw new Error(
						`Image format mismatch: expected ${expectedFormat}, got ${metadata.format}`,
					);
				}
			}

			// Resize if needed (maintain aspect ratio, cover)
			if (metadata.width && metadata.width > this.MAX_SIZE) {
				image = image.resize(this.MAX_SIZE, this.MAX_SIZE, {
					fit: 'cover',
					position: 'center',
				});
			}

			// Convert to WebP for better compression
			const processed = await image.webp({ quality: this.QUALITY }).toBuffer();

			return {
				buffer: processed,
				contentType: 'image/webp',
				width: metadata.width || 0,
				height: metadata.height || 0,
			};
		} catch (error) {
			throw new Error(`Invalid image file: ${error.message}`);
		}
	}

	base64ToBuffer(base64: string): { buffer: Buffer; contentType: string } {
		const matches = base64.match(/^data:image\/(\w+);base64,(.+)$/);
		if (!matches) {
			throw new Error('Invalid base64 image format');
		}

		const contentType = `image/${matches[1]}`;

		if (!this.isValidImage(contentType)) {
			throw new Error('Unsupported image type');
		}

		const buffer = Buffer.from(matches[2], 'base64');

		// Enforce size limit
		if (buffer.length > this.MAX_FILE_SIZE) {
			throw new Error('Image size exceeds maximum (2MB)');
		}

		return { buffer, contentType };
	}

	isValidImage(contentType: string): boolean {
		return ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(
			contentType,
		);
	}
}

export const imageService = new ImageService();
