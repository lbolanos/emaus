// Tests for s3Service.presignPrivateUrl — turning stored public S3 URLs under
// PRIVATE prefixes into short-lived presigned URLs, while leaving public
// prefixes, data: URIs and external links untouched.

// Force S3 mode BEFORE importing the service (config is read at import time).
process.env.AVATAR_STORAGE = 's3';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.S3_BUCKET_NAME = 'emaus-media';

jest.mock('@aws-sdk/client-s3', () => ({
	S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
	PutObjectCommand: jest.fn(),
	DeleteObjectCommand: jest.fn(),
	GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

// Deterministic signer: echo the key it was asked to sign so assertions are simple.
jest.mock('@aws-sdk/s3-request-presigner', () => ({
	getSignedUrl: jest.fn(async (_client: unknown, command: any) => {
		return `https://signed.example/${command.input.Key}?X-Amz-Signature=stub`;
	}),
}));

import { s3Service } from '../../services/s3Service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';

const BASE = 'https://emaus-media.s3.us-east-1.amazonaws.com/';

describe('s3Service.presignPrivateUrl', () => {
	test('signs URLs under the private retreat-memories prefix', async () => {
		const key = 'retreat-memories/r-1/p-1.webp';
		const result = await s3Service.presignPrivateUrl(`${BASE}${key}`);
		expect(result).toBe(`https://signed.example/${key}?X-Amz-Signature=stub`);
	});

	test('signs URLs under the private community-meetings prefix', async () => {
		const key = 'community-meetings/m-1.webp';
		const result = await s3Service.presignPrivateUrl(`${BASE}${key}`);
		expect(result).toBe(`https://signed.example/${key}?X-Amz-Signature=stub`);
	});

	test('leaves public avatars URLs unchanged', async () => {
		const url = `${BASE}avatars/user-1.webp`;
		expect(await s3Service.presignPrivateUrl(url)).toBe(url);
	});

	test('leaves base64 data URIs unchanged', async () => {
		const dataUri = 'data:image/webp;base64,UklGRiQAAABXRUJQ';
		expect(await s3Service.presignPrivateUrl(dataUri)).toBe(dataUri);
	});

	test('leaves external URLs unchanged', async () => {
		const url = 'https://open.spotify.com/playlist/abc';
		expect(await s3Service.presignPrivateUrl(url)).toBe(url);
	});

	test('passes null/undefined through unchanged', async () => {
		expect(await s3Service.presignPrivateUrl(null)).toBeNull();
		expect(await s3Service.presignPrivateUrl(undefined)).toBeUndefined();
	});

	test('re-signs an already-signed URL by stripping the existing query', async () => {
		const key = 'retreat-memories/r-1/p-1.webp';
		const alreadySigned = `${BASE}${key}?X-Amz-Signature=old`;
		const result = await s3Service.presignPrivateUrl(alreadySigned);
		expect(result).toBe(`https://signed.example/${key}?X-Amz-Signature=stub`);
	});
});

describe('letter attachments: PDF viewable in the browser, safe download filenames', () => {
	beforeEach(() => {
		s3Service.clearSignedUrlCache();
		jest.clearAllMocks();
	});

	test('inlineAs asks S3 for an inline response with that type (overrides stored attachment)', async () => {
		const key = 'letters/l-1/a-1/carta.pdf';
		await s3Service.presignPrivateUrl(`${BASE}${key}`, { inlineAs: 'application/pdf' });
		const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
		expect(command.input).toMatchObject({
			Key: key,
			ResponseContentDisposition: 'inline',
			ResponseContentType: 'application/pdf',
		});
	});

	test('the inline and the download signature of the same key are cached apart', async () => {
		const key = 'letters/l-1/a-1/carta.pdf';
		await s3Service.presignPrivateUrl(`${BASE}${key}`, { inlineAs: 'application/pdf' });
		await s3Service.presignPrivateUrl(`${BASE}${key}`);
		expect(getSignedUrl).toHaveBeenCalledTimes(2);
		const plain = (getSignedUrl as jest.Mock).mock.calls[1][1];
		expect(plain.input.ResponseContentDisposition).toBeUndefined();
	});

	test('upload keeps the real accented name in filename* and an ASCII fallback in filename', async () => {
		await s3Service.uploadLetterAttachment(
			'l-1',
			'a-1',
			'Carta para José "mamá".docx',
			Buffer.from('x'),
			'application/msword',
		);
		const input = (PutObjectCommand as unknown as jest.Mock).mock.calls.at(-1)![0];
		// Respaldo ASCII: no-ASCII → «_» y sin comillas (romperían el parámetro).
		expect(input.ContentDisposition).toBe(
			`attachment; filename="Carta para Jos_ mam_.docx"; filename*=UTF-8''${encodeURIComponent('Carta para José "mamá".docx')}`,
		);
		// Solo ASCII imprimible en la cabecera: nada fuera de \x20-\x7e.
		expect(/^[\x20-\x7e]*$/.test(input.ContentDisposition)).toBe(true);
	});
});

describe('s3Service.getSignedReadUrl signature cache (spec tables-second-cycle D4)', () => {
	const key = (n: number) => `retreat-memories/r-1/tables/t-${n}.webp`;

	beforeEach(() => {
		s3Service.clearSignedUrlCache();
		jest.clearAllMocks();
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('reuses the signature while most of its life remains', async () => {
		const now = Date.now();
		jest.spyOn(Date, 'now').mockReturnValue(now);

		const first = await s3Service.getSignedReadUrl(key(1));
		const second = await s3Service.getSignedReadUrl(key(1));

		expect(second).toBe(first);
		expect(getSignedUrl).toHaveBeenCalledTimes(1);

		// A different key signs on its own.
		await s3Service.getSignedReadUrl(key(2));
		expect(getSignedUrl).toHaveBeenCalledTimes(2);
	});

	test('re-signs once less than 30 min of the 60 min life remain', async () => {
		const now = Date.now();
		const clock = jest.spyOn(Date, 'now').mockReturnValue(now);

		await s3Service.getSignedReadUrl(key(1)); // signs, caches
		await s3Service.getSignedReadUrl(key(1)); // cache hit
		expect(getSignedUrl).toHaveBeenCalledTimes(1);

		clock.mockReturnValue(now + 31 * 60 * 1000); // 29 min left → below the reuse floor
		await s3Service.getSignedReadUrl(key(1));
		expect(getSignedUrl).toHaveBeenCalledTimes(2);
	});

	test('prunes oldest-first past 500 entries, keeping the newest usable', async () => {
		const now = Date.now();
		jest.spyOn(Date, 'now').mockReturnValue(now);

		for (let i = 0; i <= 500; i++) {
			await s3Service.getSignedReadUrl(key(i));
		}
		expect(getSignedUrl).toHaveBeenCalledTimes(501);

		// Newest entry is still cached: no new signature.
		await s3Service.getSignedReadUrl(key(500));
		expect(getSignedUrl).toHaveBeenCalledTimes(501);

		// The oldest was evicted: it signs again.
		await s3Service.getSignedReadUrl(key(0));
		expect(getSignedUrl).toHaveBeenCalledTimes(502);
	});
});
