import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env';

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
}

export const s3Service = new S3Service();
