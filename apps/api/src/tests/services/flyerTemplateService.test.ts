import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { FlyerTemplate } from '@/entities/flyerTemplate.entity';
import { CommunityAdmin } from '@/entities/communityAdmin.entity';
import { authorizationService } from '@/middleware/authorization';
import {
	FlyerTemplateForbiddenError,
	FlyerTemplateNotFoundError,
	create,
	listForUser,
	remove,
	update,
} from '@/services/flyerTemplateService';

const LAYOUT = {
	layoutVersion: 2,
	blocks: [{ id: 'intro', slot: 'left', order: 0, visible: true }],
	images: { bodyBackground: 'https://cdn.example.com/bg.webp' },
	hopeOverride: 'Encuentro',
};

describe('flyerTemplateService', () => {
	let ownerId: string;
	let coAdminId: string;
	let outsiderId: string;
	let communityId: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		await AppDataSource.query('DELETE FROM flyer_templates;');
		// hasRole hits the roles tables, which the factory does not populate
		jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);

		const owner = await TestDataFactory.createTestUser();
		const coAdmin = await TestDataFactory.createTestUser();
		const outsider = await TestDataFactory.createTestUser();
		ownerId = owner.id;
		coAdminId = coAdmin.id;
		outsiderId = outsider.id;

		const community = await TestDataFactory.createTestCommunity(ownerId, { name: 'Del Valle' });
		communityId = community.id;

		const adminRepo = AppDataSource.getRepository(CommunityAdmin);
		await adminRepo.save(
			adminRepo.create({ communityId, userId: coAdminId, role: 'admin', status: 'active' }),
		);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('create', () => {
		it('stores a personal template for its author', async () => {
			const template = await create(ownerId, {
				name: 'Mi diseño',
				scope: 'personal',
				layout: LAYOUT as any,
			});

			expect(template.createdBy).toBe(ownerId);
			// The column comes back as null from the driver, not undefined
			expect(template.communityId ?? null).toBeNull();
			expect(template.layout).toMatchObject({ layoutVersion: 2, hopeOverride: 'Encuentro' });
		});

		it('stores a community template when the author administers it', async () => {
			const template = await create(coAdminId, {
				name: 'Diseño de la comunidad',
				scope: 'community',
				communityId,
				layout: LAYOUT as any,
			});

			expect(template.scope).toBe('community');
			expect(template.communityId).toBe(communityId);
		});

		it('refuses to share with a community the author does not administer', async () => {
			await expect(
				create(outsiderId, {
					name: 'Ajena',
					scope: 'community',
					communityId,
					layout: LAYOUT as any,
				}),
			).rejects.toThrow(FlyerTemplateForbiddenError);
		});
	});

	describe('listForUser', () => {
		it('shows a personal template only to its author', async () => {
			await create(ownerId, { name: 'Solo mía', scope: 'personal', layout: LAYOUT as any });

			expect((await listForUser(ownerId)).map((t) => t.name)).toEqual(['Solo mía']);
			expect(await listForUser(coAdminId)).toEqual([]);
			expect(await listForUser(outsiderId)).toEqual([]);
		});

		it('shows a community template to every active admin, and to nobody else', async () => {
			await create(ownerId, {
				name: 'Compartida',
				scope: 'community',
				communityId,
				layout: LAYOUT as any,
			});

			expect((await listForUser(coAdminId)).map((t) => t.name)).toEqual(['Compartida']);
			expect(await listForUser(outsiderId)).toEqual([]);
		});

		it('hides a community template once the admin is no longer active', async () => {
			await create(ownerId, {
				name: 'Compartida',
				scope: 'community',
				communityId,
				layout: LAYOUT as any,
			});

			await AppDataSource.getRepository(CommunityAdmin).update(
				{ communityId, userId: coAdminId },
				{ status: 'inactive' },
			);

			expect(await listForUser(coAdminId)).toEqual([]);
		});

		it('does not duplicate a community template the user also authored', async () => {
			await create(ownerId, {
				name: 'Compartida',
				scope: 'community',
				communityId,
				layout: LAYOUT as any,
			});

			expect(await listForUser(ownerId)).toHaveLength(1);
		});

		it('shows everything to a superadmin', async () => {
			await create(ownerId, { name: 'Ajena', scope: 'personal', layout: LAYOUT as any });

			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
			expect((await listForUser(outsiderId)).map((t) => t.name)).toEqual(['Ajena']);
		});
	});

	describe('update', () => {
		it('lets the author rename and overwrite the design', async () => {
			const created = await create(ownerId, {
				name: 'Borrador',
				scope: 'personal',
				layout: LAYOUT as any,
			});

			const renamed = await update(created.id, ownerId, { name: 'Definitivo' });
			expect(renamed.name).toBe('Definitivo');

			const rewritten = await update(created.id, ownerId, {
				layout: { layoutVersion: 2, blocks: [] } as any,
			});
			expect(rewritten.layout).toEqual({ layoutVersion: 2, blocks: [] });
		});

		it('lets a co-admin edit a community template', async () => {
			const created = await create(ownerId, {
				name: 'Compartida',
				scope: 'community',
				communityId,
				layout: LAYOUT as any,
			});

			const renamed = await update(created.id, coAdminId, { name: 'Retocada' });
			expect(renamed.name).toBe('Retocada');
		});

		it('refuses an edit from someone unrelated', async () => {
			const created = await create(ownerId, {
				name: 'Mía',
				scope: 'personal',
				layout: LAYOUT as any,
			});

			await expect(update(created.id, outsiderId, { name: 'Robada' })).rejects.toThrow(
				FlyerTemplateForbiddenError,
			);
		});

		it('reports a missing template as not found', async () => {
			await expect(
				update('11111111-1111-4111-8111-111111111111', ownerId, { name: 'X' }),
			).rejects.toThrow(FlyerTemplateNotFoundError);
		});
	});

	describe('remove', () => {
		it('lets the author delete', async () => {
			const created = await create(ownerId, {
				name: 'Descartable',
				scope: 'personal',
				layout: LAYOUT as any,
			});

			await remove(created.id, ownerId);
			expect(await AppDataSource.getRepository(FlyerTemplate).count()).toBe(0);
		});

		it('refuses a delete from someone unrelated', async () => {
			const created = await create(ownerId, {
				name: 'Mía',
				scope: 'personal',
				layout: LAYOUT as any,
			});

			await expect(remove(created.id, outsiderId)).rejects.toThrow(FlyerTemplateForbiddenError);
			expect(await AppDataSource.getRepository(FlyerTemplate).count()).toBe(1);
		});
	});
});
