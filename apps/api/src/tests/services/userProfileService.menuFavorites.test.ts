import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { AppDataSource } from '@/data-source';
import { DEFAULT_FAVORITE_MENU_ITEMS } from '@repo/types';

/**
 * Menu favorites seed + privacy (specs/menu-favorites D4/D5), exercised
 * against the real test DB: the seed reads telemetry_events with json_extract,
 * so mocking the query would test nothing.
 *
 * The service is imported dynamically AFTER setupTestDatabase: its
 * module-level repositories bind to AppDataSource at import time, and the
 * test setup patches AppDataSource in place (same pattern as
 * rbac.integration.test.ts).
 *
 * Views layout (favorites-user): pages OUTSIDE the allowlist deliberately have
 * the MOST views — the seed must skip them instead of wasting slots.
 */
let getUserProfile: typeof import('@/services/userProfileService').getUserProfile;
let updateUserProfile: typeof import('@/services/userProfileService').updateUserProfile;
let getPublicProfile: typeof import('@/services/userProfileService').getPublicProfile;
let searchUsers: typeof import('@/services/userProfileService').searchUsers;
const FAV_USER = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '33333333-3333-4333-8333-333333333333';

const insertUser = async (id: string, email: string, displayName: string) => {
	// OR IGNORE: later describes reuse FAV_USER from earlier ones.
	await AppDataSource.query(
		`INSERT OR IGNORE INTO users (id, email, displayName, password, createdAt, updatedAt)
		 VALUES ('${id}', '${email}', '${displayName}', 'x', datetime('now'), datetime('now'))`,
	);
};

const insertProfile = async (userId: string, favorites: string[] | null) => {
	// [] persists as '' (simple-array join), which hydrates back as [].
	const value = favorites === null ? 'NULL' : `'${favorites.join(',')}'`;
	await AppDataSource.query(
		`INSERT INTO user_profiles (userId, favoriteMenuItems) VALUES ('${userId}', ${value})`,
	);
};

const insertPageView = async (userId: string, page: string, times: number) => {
	for (let i = 0; i < times; i++) {
		await AppDataSource.query(
			`INSERT INTO telemetry_events (id, eventType, severity, description, eventData, userId, createdAt)
			 VALUES (
				 lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
				 'page_view', 'info', 'view', '${JSON.stringify({ page })}', '${userId}', datetime('now')
			 )`,
		);
	}
};

const cleanup = async (...userIds: string[]) => {
	for (const userId of userIds) {
		await AppDataSource.query(`DELETE FROM telemetry_events WHERE userId = '${userId}'`);
		await AppDataSource.query(`DELETE FROM user_profiles WHERE userId = '${userId}'`);
		await AppDataSource.query(`DELETE FROM users WHERE id = '${userId}'`);
	}
};

describe('userProfileService — menu favorites', () => {
	beforeAll(async () => {
		await setupTestDatabase();
		({
			getUserProfile,
			updateUserProfile,
			getPublicProfile,
			searchUsers,
		} = await import('@/services/userProfileService'));
	});

	afterAll(async () => {
		await cleanup(FAV_USER, OTHER_USER);
		await teardownTestDatabase();
	});

	describe('seedFavoriteMenuItems (via getUserProfile)', () => {
		beforeAll(async () => {
			await insertUser(FAV_USER, 'fav-seed@test.local', 'Fav Seed User');
			// Out-of-allowlist pages dominate the raw view counts on purpose.
			await insertPageView(FAV_USER, 'community-dashboard', 10);
			await insertPageView(FAV_USER, 'community-meetings', 8);
			await insertPageView(FAV_USER, 'retreat-dashboard', 5);
			await insertPageView(FAV_USER, 'message-sequences', 4);
			await insertPageView(FAV_USER, 'walkers', 3);
			await insertPageView(FAV_USER, 'servers', 2);
			await insertPageView(FAV_USER, 'tables', 1);
		});

		it('seeds null favorites with the top 5 allowlisted pages by views', async () => {
			await insertProfile(FAV_USER, null);

			const profile = await getUserProfile(FAV_USER);

			expect(profile?.favoriteMenuItems).toEqual([
				'retreat-dashboard',
				'message-sequences',
				'walkers',
				'servers',
				'tables',
			]);
		});

		it('does not re-seed an explicit empty list', async () => {
			// Clear via the service so the [] → '' → [] driver round-trip is
			// exercised end to end.
			await updateUserProfile(FAV_USER, { favoriteMenuItems: [] });

			const profile = await getUserProfile(FAV_USER);

			// '' hydrates as [] through simple-array: a deliberate empty list,
			// not an unseeded one.
			expect(profile?.favoriteMenuItems).toEqual([]);
		});

		it('falls back to the default list when telemetry has no allowlisted pages', async () => {
			const noHistory = '44444444-4444-4444-8444-444444444444';
			try {
				await insertUser(noHistory, 'fav-empty@test.local', 'Fav Empty User');
				await insertProfile(noHistory, null);

				const profile = await getUserProfile(noHistory);

				expect(profile?.favoriteMenuItems).toEqual(DEFAULT_FAVORITE_MENU_ITEMS);
			} finally {
				await cleanup(noHistory);
			}
		});
	});

	describe('updateUserProfile sanitization', () => {
		it('dedupes favoriteMenuItems', async () => {
			await insertUser(FAV_USER, 'fav-seed@test.local', 'Fav Seed User');
			// The seed describe left this profile created; reset to null.
			await AppDataSource.query(
				`DELETE FROM user_profiles WHERE userId = '${FAV_USER}'`,
			);
			await insertProfile(FAV_USER, null);

			const profile = await updateUserProfile(FAV_USER, {
				favoriteMenuItems: ['walkers', 'walkers', 'servers'],
			});

			expect(profile.favoriteMenuItems).toEqual(['walkers', 'servers']);
		});

		it('caps favoriteMenuItems at the limit (defense in depth past zod)', async () => {
			const many = Array.from({ length: 20 }, (_, i) => `route-${i}`);

			const profile = await updateUserProfile(FAV_USER, {
				favoriteMenuItems: many,
			});

			expect(profile.favoriteMenuItems).toHaveLength(12);
			// First 12 win, in the order the client sent them.
			expect(profile.favoriteMenuItems).toEqual(many.slice(0, 12));
		});
	});

	describe('privacy — favoriteMenuItems never leaves the owner profile', () => {
		beforeAll(async () => {
			await cleanup(FAV_USER, OTHER_USER);
			await insertUser(FAV_USER, 'fav-seed@test.local', 'Fav Seed User');
			await insertProfile(FAV_USER, ['walkers', 'tables']);
			await insertUser(OTHER_USER, 'fav-other@test.local', 'Fav Other User');
		});

		it('getPublicProfile strips favoriteMenuItems', async () => {
			const result = await getPublicProfile(FAV_USER, OTHER_USER);

			expect(result?.profile).toBeTruthy();
			expect(result?.profile).not.toHaveProperty('favoriteMenuItems');
		});

		it('searchUsers strips favoriteMenuItems', async () => {
			const results = await searchUsers('Fav Seed');

			expect(results).toHaveLength(1);
			expect(results[0].profile).not.toHaveProperty('favoriteMenuItems');
		});
	});
});
