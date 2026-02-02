// Tests for image magic byte validation security

describe('Image Magic Byte Validation', () => {
	// Magic byte definitions
	const MAGIC_BYTES = {
		jpeg: [0xff, 0xd8, 0xff],
		png: [0x89, 0x50, 0x4e, 0x47],
		gif: [0x47, 0x49, 0x46],
		webp: [0x52, 0x49, 0x46, 0x46], // RIFF header
	};

	// WebP needs additional check for WEBP at bytes 8-11
	const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // 'WEBP'

	describe('JPEG Detection', () => {
		test('should detect valid JPEG magic bytes', () => {
			const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

			const isJpeg =
				validJpeg[0] === MAGIC_BYTES.jpeg[0] &&
				validJpeg[1] === MAGIC_BYTES.jpeg[1] &&
				validJpeg[2] === MAGIC_BYTES.jpeg[2];

			expect(isJpeg).toBe(true);
		});

		test('should reject non-JPEG files claiming to be JPEG', () => {
			const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

			const isJpeg =
				fakePng[0] === MAGIC_BYTES.jpeg[0] &&
				fakePng[1] === MAGIC_BYTES.jpeg[1] &&
				fakePng[2] === MAGIC_BYTES.jpeg[2];

			expect(isJpeg).toBe(false);
		});

		test('should handle various JPEG APP markers', () => {
			// JPEG with JFIF marker (0xE0)
			const jpegJfif = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
			expect(jpegJfif[0] === 0xff && jpegJfif[1] === 0xd8 && jpegJfif[2] === 0xff).toBe(true);

			// JPEG with EXIF marker (0xE1)
			const jpegExif = Buffer.from([0xff, 0xd8, 0xff, 0xe1]);
			expect(jpegExif[0] === 0xff && jpegExif[1] === 0xd8 && jpegExif[2] === 0xff).toBe(true);
		});
	});

	describe('PNG Detection', () => {
		test('should detect valid PNG magic bytes', () => {
			const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

			const isPng =
				validPng[0] === MAGIC_BYTES.png[0] &&
				validPng[1] === MAGIC_BYTES.png[1] &&
				validPng[2] === MAGIC_BYTES.png[2] &&
				validPng[3] === MAGIC_BYTES.png[3];

			expect(isPng).toBe(true);
		});

		test('should reject non-PNG files claiming to be PNG', () => {
			const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

			const isPng =
				fakeJpeg[0] === MAGIC_BYTES.png[0] &&
				fakeJpeg[1] === MAGIC_BYTES.png[1] &&
				fakeJpeg[2] === MAGIC_BYTES.png[2] &&
				fakeJpeg[3] === MAGIC_BYTES.png[3];

			expect(isPng).toBe(false);
		});
	});

	describe('GIF Detection', () => {
		test('should detect GIF87a format', () => {
			// GIF87a
			const gif87a = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);

			const isGif =
				gif87a[0] === MAGIC_BYTES.gif[0] &&
				gif87a[1] === MAGIC_BYTES.gif[1] &&
				gif87a[2] === MAGIC_BYTES.gif[2];

			expect(isGif).toBe(true);
		});

		test('should detect GIF89a format', () => {
			// GIF89a
			const gif89a = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

			const isGif =
				gif89a[0] === MAGIC_BYTES.gif[0] &&
				gif89a[1] === MAGIC_BYTES.gif[1] &&
				gif89a[2] === MAGIC_BYTES.gif[2];

			expect(isGif).toBe(true);
		});
	});

	describe('WebP Detection', () => {
		test('should detect valid WebP with RIFF header and WEBP signature', () => {
			// Valid WebP: RIFF + size + WEBP
			const validWebp = Buffer.from([
				0x52,
				0x49,
				0x46,
				0x46, // RIFF
				0x00,
				0x00,
				0x00,
				0x00, // file size (placeholder)
				0x57,
				0x45,
				0x42,
				0x50, // WEBP
			]);

			const isWebp =
				validWebp[0] === MAGIC_BYTES.webp[0] &&
				validWebp[1] === MAGIC_BYTES.webp[1] &&
				validWebp[2] === MAGIC_BYTES.webp[2] &&
				validWebp[3] === MAGIC_BYTES.webp[3] &&
				validWebp[8] === WEBP_SIGNATURE[0] &&
				validWebp[9] === WEBP_SIGNATURE[1] &&
				validWebp[10] === WEBP_SIGNATURE[2] &&
				validWebp[11] === WEBP_SIGNATURE[3];

			expect(isWebp).toBe(true);
		});

		test('should reject RIFF files that are not WebP (e.g., WAV)', () => {
			// WAV file: RIFF + size + WAVE
			const wavFile = Buffer.from([
				0x52,
				0x49,
				0x46,
				0x46, // RIFF
				0x00,
				0x00,
				0x00,
				0x00, // file size
				0x57,
				0x41,
				0x56,
				0x45, // WAVE (not WEBP)
			]);

			const isWebp =
				wavFile[0] === MAGIC_BYTES.webp[0] &&
				wavFile[1] === MAGIC_BYTES.webp[1] &&
				wavFile[2] === MAGIC_BYTES.webp[2] &&
				wavFile[3] === MAGIC_BYTES.webp[3] &&
				wavFile[8] === WEBP_SIGNATURE[0] &&
				wavFile[9] === WEBP_SIGNATURE[1] &&
				wavFile[10] === WEBP_SIGNATURE[2] &&
				wavFile[11] === WEBP_SIGNATURE[3];

			// Has RIFF header but not WEBP signature
			expect(isWebp).toBe(false);
		});
	});

	describe('Buffer Size Validation', () => {
		test('should reject buffer smaller than magic bytes', () => {
			const tinyBuffer = Buffer.from([0xff, 0xd8]); // Only 2 bytes, JPEG needs 3

			const hasEnoughBytes = (buffer: Buffer, requiredLength: number): boolean => {
				return buffer.length >= requiredLength;
			};

			expect(hasEnoughBytes(tinyBuffer, 3)).toBe(false);
			expect(hasEnoughBytes(tinyBuffer, 2)).toBe(true);
		});

		test('should reject WebP buffer smaller than 12 bytes', () => {
			// WebP needs at least 12 bytes (RIFF + size + WEBP)
			const shortWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);

			const hasEnoughBytesForWebp = shortWebp.length >= 12;
			expect(hasEnoughBytesForWebp).toBe(false);
		});

		test('should reject empty buffer', () => {
			const emptyBuffer = Buffer.from([]);

			expect(emptyBuffer.length).toBe(0);
			expect(emptyBuffer.length >= 3).toBe(false);
		});
	});

	describe('Malicious File Detection', () => {
		test('should reject PHP file disguised as image', () => {
			const phpFile = Buffer.from('<?php system($_GET["cmd"]); ?>');

			// PHP files start with '<?' (0x3C, 0x3F)
			const isJpeg = phpFile[0] === 0xff && phpFile[1] === 0xd8;
			const isPng = phpFile[0] === 0x89 && phpFile[1] === 0x50;

			expect(isJpeg).toBe(false);
			expect(isPng).toBe(false);
		});

		test('should reject HTML file disguised as image', () => {
			const htmlFile = Buffer.from('<html><script>alert(1)</script></html>');

			// HTML files typically start with '<' (0x3C)
			const isJpeg = htmlFile[0] === 0xff && htmlFile[1] === 0xd8;
			const isPng = htmlFile[0] === 0x89 && htmlFile[1] === 0x50;

			expect(isJpeg).toBe(false);
			expect(isPng).toBe(false);
		});

		test('should reject JavaScript file disguised as image', () => {
			const jsFile = Buffer.from('eval(atob("YWxlcnQoMSk="))');

			const isJpeg = jsFile[0] === 0xff && jsFile[1] === 0xd8;
			const isPng = jsFile[0] === 0x89 && jsFile[1] === 0x50;

			expect(isJpeg).toBe(false);
			expect(isPng).toBe(false);
		});

		test('should reject polyglot JPEG/HTML', () => {
			// Polyglot files try to be valid as multiple formats
			// A naive check might be fooled, but we verify full signature

			// This is NOT a valid JPEG - starts with HTML but has JPEG markers later
			const polyglot = Buffer.from([
				0x3c,
				0x21,
				0x44,
				0x4f,
				0x43, // '<!DOC'
				0xff,
				0xd8,
				0xff, // JPEG markers (but not at start)
			]);

			// Valid JPEG must start with FF D8 FF
			const isValidJpeg =
				polyglot[0] === 0xff && polyglot[1] === 0xd8 && polyglot[2] === 0xff;

			expect(isValidJpeg).toBe(false);
		});
	});

	describe('Content Type Mapping', () => {
		test('should map content types to formats correctly', () => {
			const contentTypeToFormat = (
				contentType: string,
			): 'jpeg' | 'png' | 'gif' | 'webp' | null => {
				const map: Record<string, 'jpeg' | 'png' | 'gif' | 'webp'> = {
					'image/jpeg': 'jpeg',
					'image/jpg': 'jpeg',
					'image/png': 'png',
					'image/gif': 'gif',
					'image/webp': 'webp',
				};
				return map[contentType] || null;
			};

			expect(contentTypeToFormat('image/jpeg')).toBe('jpeg');
			expect(contentTypeToFormat('image/jpg')).toBe('jpeg');
			expect(contentTypeToFormat('image/png')).toBe('png');
			expect(contentTypeToFormat('image/gif')).toBe('gif');
			expect(contentTypeToFormat('image/webp')).toBe('webp');
			expect(contentTypeToFormat('image/svg+xml')).toBeNull();
			expect(contentTypeToFormat('application/pdf')).toBeNull();
		});
	});

	describe('Full Validation Flow', () => {
		test('should validate complete image buffer against content type', () => {
			const validateImage = (buffer: Buffer, contentType: string): boolean => {
				// Check minimum size
				if (buffer.length < 3) return false;

				// Get format from content type
				const formatMap: Record<string, string> = {
					'image/jpeg': 'jpeg',
					'image/jpg': 'jpeg',
					'image/png': 'png',
					'image/gif': 'gif',
					'image/webp': 'webp',
				};
				const format = formatMap[contentType];
				if (!format) return false;

				// Validate magic bytes
				switch (format) {
					case 'jpeg':
						return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

					case 'png':
						return (
							buffer.length >= 4 &&
							buffer[0] === 0x89 &&
							buffer[1] === 0x50 &&
							buffer[2] === 0x4e &&
							buffer[3] === 0x47
						);

					case 'gif':
						return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;

					case 'webp':
						return (
							buffer.length >= 12 &&
							buffer[0] === 0x52 &&
							buffer[1] === 0x49 &&
							buffer[2] === 0x46 &&
							buffer[3] === 0x46 &&
							buffer[8] === 0x57 &&
							buffer[9] === 0x45 &&
							buffer[10] === 0x42 &&
							buffer[11] === 0x50
						);

					default:
						return false;
				}
			};

			// Valid JPEG
			const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
			expect(validateImage(validJpeg, 'image/jpeg')).toBe(true);

			// PNG claiming to be JPEG - should fail
			const pngAsJpeg = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
			expect(validateImage(pngAsJpeg, 'image/jpeg')).toBe(false);

			// Valid PNG
			const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
			expect(validateImage(validPng, 'image/png')).toBe(true);

			// Valid WebP
			const validWebp = Buffer.from([
				0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
			]);
			expect(validateImage(validWebp, 'image/webp')).toBe(true);

			// Text file as image - should fail
			const textFile = Buffer.from('Hello World');
			expect(validateImage(textFile, 'image/jpeg')).toBe(false);
		});
	});

	describe('File Size Limits', () => {
		test('should enforce 2MB maximum file size', () => {
			const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

			const validateSize = (buffer: Buffer): boolean => {
				return buffer.length <= MAX_FILE_SIZE;
			};

			// 1MB file - should pass
			const oneMb = Buffer.alloc(1024 * 1024);
			expect(validateSize(oneMb)).toBe(true);

			// 2MB file - should pass (exactly at limit)
			const twoMb = Buffer.alloc(2 * 1024 * 1024);
			expect(validateSize(twoMb)).toBe(true);

			// 3MB file - should fail
			const threeMb = Buffer.alloc(3 * 1024 * 1024);
			expect(validateSize(threeMb)).toBe(false);
		});
	});
});
