import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { MessageTemplateService } from '@/services/messageTemplateService';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { AppDataSource } from '@/data-source';

describe('MessageTemplateService.findByCommunity', () => {
	let service: MessageTemplateService;
	let testCommunityId: string;
	let otherCommunityId: string;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new MessageTemplateService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Wipe message_templates so each test starts clean (clearTestData doesn't
		// truncate this table because no factory creates rows here by default).
		await AppDataSource.query('DELETE FROM message_templates;');

		const testUser = await TestDataFactory.createTestUser();
		const c1 = await TestDataFactory.createTestCommunity(testUser.id, { name: 'C1' });
		const c2 = await TestDataFactory.createTestCommunity(testUser.id, { name: 'C2' });
		testCommunityId = c1.id;
		otherCommunityId = c2.id;
	});

	const seedTemplate = async (overrides: Partial<MessageTemplate>) => {
		const repo = AppDataSource.getRepository(MessageTemplate);
		return repo.save(
			repo.create({
				name: 'Test tpl',
				type: 'COMMUNITY_MEETING_INVITATION',
				scope: 'community',
				message: 'Hola',
				...overrides,
			}),
		);
	};

	it('includes globals (communityId IS NULL) alongside community-specific rows', async () => {
		await seedTemplate({ name: 'Global', communityId: undefined });
		await seedTemplate({ name: 'Specific', communityId: testCommunityId });

		const results = await service.findByCommunity(testCommunityId);

		expect(results.length).toBe(2);
		expect(results.find((r) => r.name === 'Global')).toBeTruthy();
		expect(results.find((r) => r.name === 'Specific')).toBeTruthy();
	});

	it('orders community-specific rows BEFORE globals', async () => {
		await seedTemplate({ name: 'aaa Global', communityId: undefined });
		await seedTemplate({ name: 'zzz Specific', communityId: testCommunityId });

		const results = await service.findByCommunity(testCommunityId);

		expect(results.length).toBe(2);
		// 'zzz Specific' has communityId set → must come first despite alphabetical order
		expect(results[0].name).toBe('zzz Specific');
		expect(results[1].name).toBe('aaa Global');
	});

	it('does NOT include other communities templates', async () => {
		await seedTemplate({ name: 'Mine', communityId: testCommunityId });
		await seedTemplate({ name: 'Theirs', communityId: otherCommunityId });

		const results = await service.findByCommunity(testCommunityId);

		expect(results.length).toBe(1);
		expect(results[0].name).toBe('Mine');
	});

	it('excludes retreat-scoped templates', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		await seedTemplate({
			name: 'Retreat tpl',
			scope: 'retreat',
			type: 'WALKER_WELCOME',
			retreatId: retreat.id,
			communityId: undefined,
		});
		await seedTemplate({ name: 'Community Specific', communityId: testCommunityId });

		const results = await service.findByCommunity(testCommunityId);

		expect(results.find((r) => r.name === 'Retreat tpl')).toBeUndefined();
		expect(results.find((r) => r.name === 'Community Specific')).toBeTruthy();
	});

	it('returns empty array when the community has no templates and no globals exist', async () => {
		const results = await service.findByCommunity(testCommunityId);
		expect(results).toEqual([]);
	});
});
