import { z } from 'zod';

const envSchema = z.object({
	// Node environment
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

	// Avatar Storage Configuration
	AVATAR_STORAGE: z.enum(['base64', 's3']).default('base64'),

	// AWS S3 Configuration
	AWS_REGION: z.string().default('us-east-1'),
	AWS_USE_IAM_ROLE: z.enum(['true', 'false']).default('false'),
	AWS_ROLE_ARN: z.string().optional(),
	AWS_ACCESS_KEY_ID: z.string().optional(),
	AWS_SECRET_ACCESS_KEY: z.string().optional(),
	S3_BUCKET_NAME: z.string().optional(),

	// S3 Storage Prefixes (for different content types)
	S3_AVATARS_PREFIX: z.string().default('avatars/'),
	S3_RETREAT_MEMORIES_PREFIX: z.string().default('retreat-memories/'),
	S3_DOCUMENTS_PREFIX: z.string().default('documents/'),
	S3_PUBLIC_ASSETS_PREFIX: z.string().default('public-assets/'),

	// Legacy S3_BUCKET_PREFIX for backward compatibility
	S3_BUCKET_PREFIX: z.string().default('avatars/'),
});

// Validate and parse environment variables
function validateEnv() {
	const parsed = envSchema.safeParse(process.env);

	if (!parsed.success) {
		const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
		throw new Error(`Environment validation failed:\n${errors}`);
	}

	// Validate S3 configuration
	if (parsed.data.AVATAR_STORAGE === 's3') {
		const useIAMRole = parsed.data.AWS_USE_IAM_ROLE === 'true';
		if (!parsed.data.S3_BUCKET_NAME) {
			throw new Error('AVATAR_STORAGE=s3 requires S3_BUCKET_NAME to be set');
		}

		if (useIAMRole) {
			// Production: IAM role-based
			console.log('✅ Using IAM role for AWS authentication');
		} else {
			// Development: credential-based
			if (!parsed.data.AWS_ACCESS_KEY_ID || !parsed.data.AWS_SECRET_ACCESS_KEY) {
				throw new Error(
					'AVATAR_STORAGE=s3 requires either AWS_USE_IAM_ROLE=true or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
				);
			}
			console.warn('⚠️  Using AWS credentials from environment (dev only)');
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
		useIAMRole: env.AWS_USE_IAM_ROLE === 'true',
		roleArn: env.AWS_ROLE_ARN,
		accessKeyId: env.AWS_ACCESS_KEY_ID || '',
		secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
		s3BucketName: env.S3_BUCKET_NAME || '',
		s3Prefix: env.S3_BUCKET_PREFIX, // Legacy for backward compatibility
		s3Prefixes: {
			avatars: env.S3_AVATARS_PREFIX,
			retreatMemories: env.S3_RETREAT_MEMORIES_PREFIX,
			documents: env.S3_DOCUMENTS_PREFIX,
			publicAssets: env.S3_PUBLIC_ASSETS_PREFIX,
		},
	},
} as const;

export type Config = typeof config;
