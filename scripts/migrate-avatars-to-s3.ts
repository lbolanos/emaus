import { DataSource } from 'typeorm';
import { UserProfile } from '../api/src/entities/userProfile.entity';
import { s3Service } from '../api/src/services/s3Service';
import { imageService } from '../api/src/services/imageService';
import { getDataSource } from '../api/src/database/config';

async function migrateAvatarsToS3() {
	console.log('🔄 Starting avatar migration to S3...');

	const dataSource = await getDataSource();
	const userProfileRepo = dataSource.getRepository(UserProfile);

	// Get all profiles with base64 avatars
	const profiles = await userProfileRepo
		.createQueryBuilder('profile')
		.where('profile.avatarUrl LIKE :prefix', { prefix: 'data:image%' })
		.getMany();

	console.log(`Found ${profiles.length} avatars to migrate`);

	let success = 0;
	let failed = 0;

	for (const profile of profiles) {
		try {
			const buffer = imageService.base64ToBuffer(profile.avatarUrl!);
			const processed = await imageService.processAvatar(buffer, 'image/*');
			const result = await s3Service.uploadAvatar(
				profile.userId,
				processed.buffer,
				processed.contentType,
			);

			// Update profile with S3 URL
			profile.avatarUrl = result.url;
			await userProfileRepo.save(profile);

			success++;
			console.log(`✅ Migrated: ${profile.userId}`);
		} catch (error) {
			failed++;
			console.error(`❌ Failed: ${profile.userId}`, error);
		}
	}

	await dataSource.destroy();

	console.log(`\nMigration complete: ${success} success, ${failed} failed`);
}

migrateAvatarsToS3().catch(console.error);
