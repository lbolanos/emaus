import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';
import { config } from '../config/env';

// Default validity for presigned read URLs. Kept short on purpose: in production
// the S3 client signs with EC2 IAM-role *temporary* credentials, and a presigned
// URL can never outlive the credentials that produced it. We presign on every
// read, so a 1-hour window comfortably covers a page session.
const SIGNED_URL_TTL_SECONDS = 3600;

// Private prefixes whose objects are NOT world-readable in the bucket policy and
// therefore must be served via presigned URLs. `avatars/` and `public-assets/`
// are intentionally absent: they are public and their plain URLs pass through.
const PRIVATE_PREFIXES = ['retreat-memories/', 'community-meetings/'];

interface UploadResult {
	url: string;
	key: string;
}

// S3 storage prefixes for different content types
export const S3_PREFIXES = {
	AVATARS: 'avatars/',
	RETREAT_MEMORIES: 'retreat-memories/',
	DOCUMENTS: 'documents/',
	PUBLIC_ASSETS: 'public-assets/',
} as const;

class S3Service {
	private client: S3Client | null = null;
	private bucketName: string;
	private prefixes: {
		avatars: string;
		retreatMemories: string;
		documents: string;
		publicAssets: string;
	};
	private initialized: boolean = false;

	constructor() {
		this.bucketName = config.aws.s3BucketName;
		this.prefixes = config.aws.s3Prefixes;

		// Only initialize S3 client if storage is configured for S3
		if (config.avatar.storage === 's3') {
			this.initializeClient();
		}
	}

	private initializeClient(): void {
		if (this.initialized) return;

		if (config.aws.useIAMRole) {
			// Production: Use IAM role
			this.client = new S3Client({
				region: config.aws.region,
				// AWS SDK auto-discovers credentials from EC2 metadata
			});
			console.log('✅ S3 client initialized with IAM role');
		} else {
			// Development: Use explicit credentials
			if (!config.aws.accessKeyId || !config.aws.secretAccessKey) {
				throw new Error(
					'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or use AWS_USE_IAM_ROLE=true',
				);
			}

			this.client = new S3Client({
				region: config.aws.region,
				credentials: {
					accessKeyId: config.aws.accessKeyId,
					secretAccessKey: config.aws.secretAccessKey,
				},
			});
			console.warn('⚠️  S3 using explicit credentials (dev mode)');
		}

		this.initialized = true;
	}

	private ensureClient(): S3Client {
		if (!this.client) {
			this.initializeClient();
		}
		if (!this.client) {
			throw new Error('S3 client not initialized. Check your AWS configuration.');
		}
		return this.client;
	}

	async uploadAvatar(userId: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
		const key = `${this.prefixes.avatars}${userId}.webp`;

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: buffer,
			ContentType: contentType,
			// Cache for 1 year
			CacheControl: 'public, max-age=31536000, immutable',
		});

		await this.ensureClient().send(command);

		return {
			url: this.getPublicUrl(key),
			key,
		};
	}

	async deleteAvatar(userId: string): Promise<void> {
		const key = `${this.prefixes.avatars}${userId}.webp`;

		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		});

		await this.ensureClient().send(command);
	}

	async uploadRetreatMemoryPhoto(
		retreatId: string,
		buffer: Buffer,
		contentType: string,
	): Promise<UploadResult> {
		const key = `${this.prefixes.retreatMemories}${retreatId}.webp`;

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: buffer,
			ContentType: contentType,
			CacheControl: 'public, max-age=31536000, immutable',
		});

		await this.ensureClient().send(command);

		return {
			url: this.getPublicUrl(key),
			key,
		};
	}

	async deleteRetreatMemoryPhoto(retreatId: string): Promise<void> {
		const key = `${this.prefixes.retreatMemories}${retreatId}.webp`;

		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		});

		await this.ensureClient().send(command);
	}

	// Per-photo key so a retreat can hold multiple memory photos without one
	// overwriting another (the legacy `{retreatId}.webp` key was fixed per retreat).
	async uploadRetreatMemoryPhotoById(
		retreatId: string,
		photoId: string,
		buffer: Buffer,
		contentType: string,
	): Promise<UploadResult> {
		const key = `${this.prefixes.retreatMemories}${retreatId}/${photoId}.webp`;

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: buffer,
			ContentType: contentType,
			CacheControl: 'public, max-age=31536000, immutable',
		});

		await this.ensureClient().send(command);

		return {
			url: this.getPublicUrl(key),
			key,
		};
	}

	// Delete a single memory photo by its stored S3 key.
	async deleteRetreatMemoryPhotoByKey(key: string): Promise<void> {
		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		});

		await this.ensureClient().send(command);
	}

	// Foto única por reunión de comunidad. Key fijo por meeting (community-meetings/{meetingId}.webp):
	// subir de nuevo reemplaza la foto anterior, igual que el avatar.
	async uploadCommunityMeetingPhoto(
		meetingId: string,
		buffer: Buffer,
		contentType: string,
	): Promise<UploadResult> {
		const key = `community-meetings/${meetingId}.webp`;

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: buffer,
			ContentType: contentType,
			CacheControl: 'public, max-age=31536000, immutable',
		});

		await this.ensureClient().send(command);

		return {
			url: this.getPublicUrl(key),
			key,
		};
	}

	async deleteCommunityMeetingPhoto(meetingId: string): Promise<void> {
		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: `community-meetings/${meetingId}.webp`,
		});

		await this.ensureClient().send(command);
	}

	// Document storage methods
	async uploadDocument(path: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
		const key = `${this.prefixes.documents}${path}`;

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: buffer,
			ContentType: contentType,
		});

		await this.ensureClient().send(command);

		return {
			url: this.getPublicUrl(key),
			key,
		};
	}

	async deleteDocument(path: string): Promise<void> {
		const key = `${this.prefixes.documents}${path}`;

		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		});

		await this.ensureClient().send(command);
	}

	async getDocumentUrl(path: string): Promise<string> {
		const key = `${this.prefixes.documents}${path}`;
		return this.getPublicUrl(key);
	}

	/**
	 * Fetch an object from S3 by its full key (including any prefix).
	 * Returns a Node.js `Readable` stream — caller is responsible for piping
	 * it. Throws on network/auth errors. Used by `streamRetreatBundle` to
	 * inline S3 attachments into a downloadable ZIP.
	 *
	 * Note: takes a FULL key (caller decides the prefix). This differs from
	 * `uploadDocument` which prepends `prefixes.documents`. Reason: storageKey
	 * is what we already saved to DB at upload time; we don't re-derive it.
	 */
	async getObjectStream(key: string): Promise<Readable> {
		const command = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		});
		const response = await this.ensureClient().send(command);
		if (!response.Body) {
			throw new Error(`S3 GetObject returned empty body for key: ${key}`);
		}
		// In Node.js the AWS SDK v3 returns the body as a Readable stream.
		// We cast accordingly — the SDK types this as a union of
		// Readable | Blob | ReadableStream depending on the runtime.
		return response.Body as Readable;
	}

	// Public assets methods
	async uploadPublicAsset(
		path: string,
		buffer: Buffer,
		contentType: string,
	): Promise<UploadResult> {
		const key = `${this.prefixes.publicAssets}${path}`;

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: buffer,
			ContentType: contentType,
			CacheControl: 'public, max-age=2592000, immutable',
		});

		await this.ensureClient().send(command);

		return {
			url: this.getPublicUrl(key),
			key,
		};
	}

	async deletePublicAsset(path: string): Promise<void> {
		const key = `${this.prefixes.publicAssets}${path}`;

		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		});

		await this.ensureClient().send(command);
	}

	getPublicAssetUrl(path: string): string {
		const key = `${this.prefixes.publicAssets}${path}`;
		return this.getPublicUrl(key);
	}

	private getPublicUrl(key: string): string {
		// Return S3 public URL format
		return `https://${this.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;
	}

	/**
	 * Generate a short-lived presigned GET URL for a full S3 key. Used to serve
	 * objects under private prefixes (the bucket policy denies public reads there).
	 */
	async getSignedReadUrl(key: string, expiresIn: number = SIGNED_URL_TTL_SECONDS): Promise<string> {
		const command = new GetObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		});
		return getSignedUrl(this.ensureClient(), command, { expiresIn });
	}

	/**
	 * Turn a *stored* public S3 URL that points at a PRIVATE prefix into a
	 * short-lived presigned URL. Idempotent and safe for any input:
	 *   - null / empty                       → returned unchanged
	 *   - base64 data: URIs / external links → returned unchanged (not our bucket)
	 *   - public prefixes (avatars/…)        → returned unchanged (world-readable)
	 *   - private prefixes (retreat-memories)→ replaced with a presigned URL
	 * Also a no-op when storage isn't S3, so base64-mode deployments are untouched.
	 */
	async presignPrivateUrl<T extends string | null | undefined>(url: T): Promise<T | string> {
		if (!url || config.avatar.storage !== 's3') return url;
		const base = `https://${this.bucketName}.s3.${config.aws.region}.amazonaws.com/`;
		if (!url.startsWith(base)) return url;
		// Drop any pre-existing query string before deriving the key.
		const key = url.slice(base.length).split('?')[0];
		if (!PRIVATE_PREFIXES.some((p) => key.startsWith(p))) return url;
		return this.getSignedReadUrl(key);
	}
}

export const s3Service = new S3Service();
