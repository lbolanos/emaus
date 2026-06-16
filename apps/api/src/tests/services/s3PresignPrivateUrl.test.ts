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
