import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env';

interface UploadResult {
	url: string;
	key: string;
}

class S3Service {
	private client: S3Client;
	private bucketName: string;
	private prefix: string;

	constructor() {
		this.client = new S3Client({
			region: config.aws.region,
			credentials: {
				accessKeyId: config.aws.accessKeyId,
				secretAccessKey: config.aws.secretAccessKey,
			},
		});
		this.bucketName = config.aws.s3BucketName;
		this.prefix = config.aws.s3Prefix || 'avatars/';
	}

	async uploadAvatar(userId: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
		const key = `${this.prefix}${userId}.webp`;

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: buffer,
			ContentType: contentType,
			// Cache for 1 year
			CacheControl: 'public, max-age=31536000, immutable',
		});

		await this.client.send(command);

		return {
			url: this.getPublicUrl(key),
			key,
		};
	}

	async deleteAvatar(userId: string): Promise<void> {
		const key = `${this.prefix}${userId}.webp`;

		const command = new DeleteObjectCommand({
			Bucket: this.bucketName,
			Key: key,
		});

		await this.client.send(command);
	}

	private getPublicUrl(key: string): string {
		// Return S3 public URL format
		return `https://${this.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;
	}
}

export const s3Service = new S3Service();
