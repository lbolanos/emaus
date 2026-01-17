import { z } from 'zod';

const envSchema = z.object({
	// Node environment
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

	// Avatar Storage Configuration
	AVATAR_STORAGE: z.enum(['base64', 's3']).default('base64'),

	// AWS S3 Configuration
	AWS_REGION: z.string().default('us-east-1'),
	AWS_ACCESS_KEY_ID: z.string().optional(),
	AWS_SECRET_ACCESS_KEY: z.string().optional(),
	S3_BUCKET_NAME: z.string().optional(),
	S3_BUCKET_PREFIX: z.string().default('avatars/'),
});

// Validate and parse environment variables
function validateEnv() {
	const parsed = envSchema.safeParse(process.env);

	if (!parsed.success) {
		const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
		throw new Error(`Environment validation failed:\n${errors}`);
	}

	// Warn if S3 is configured but missing credentials
	if (parsed.data.AVATAR_STORAGE === 's3') {
		if (
			!parsed.data.AWS_ACCESS_KEY_ID ||
			!parsed.data.AWS_SECRET_ACCESS_KEY ||
			!parsed.data.S3_BUCKET_NAME
		) {
			throw new Error(
				'AVATAR_STORAGE=s3 requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME to be set',
			);
		}
	}

	return parsed.data;
}

const env = validateEnv();

// Export typed config
export const config = {
	env: env.NODE_ENV,
	avatar: {
		storage: env.AVATAR_STORAGE as 'base64' | 's3',
	},
	aws: {
		region: env.AWS_REGION,
		accessKeyId: env.AWS_ACCESS_KEY_ID || '',
		secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
		s3BucketName: env.S3_BUCKET_NAME || '',
		s3Prefix: env.S3_BUCKET_PREFIX,
	},
} as const;

export type Config = typeof config;
