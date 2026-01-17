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

	async processAvatar(buffer: Buffer, contentType: string): Promise<ProcessedImage> {
		let image = sharp(buffer);

		// Get metadata
		const metadata = await image.metadata();

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
	}

	base64ToBuffer(base64: string): Buffer {
		const matches = base64.match(/^data:image\/(\w+);base64,(.+)$/);
		if (!matches) {
			throw new Error('Invalid base64 image format');
		}
		return Buffer.from(matches[2], 'base64');
	}

	isValidImage(contentType: string): boolean {
		return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType);
	}
}

export const imageService = new ImageService();
