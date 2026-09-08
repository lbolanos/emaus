/**
 * `retreat.communityId` es opcional, pero ponerlo no es inocuo: ese vínculo es
 * lo que autoriza a leer la asistencia a reuniones del equipo servidor desde el
 * retiro (`GET /communities/:id/server-attendance/:retreatId`). De ahí el guard:
 * vincular exige administrar la comunidad; desvincular no exige nada, porque
 * soltar el vínculo no da acceso a nada.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createMockResponse } from '../test-utils/authTestUtils';
import { AppDataSource } from '@/data-source';
import { Retreat } from '@/entities/retreat.entity';
import { createRetreat, updateRetreat } from '@/controllers/retreatController';

const requestFor = (user: any, retreatId: string, body: any) =>
	({ user, body, params: { id: retreatId }, query: {} }) as any;

describe('vínculo retiro ↔ comunidad', () => {
	let superadminRole: any;

	beforeAll(async () => {
		await setupTestDatabase();
		superadminRole = await TestDataFactory.createTestRole({ name: 'superadmin' });
		await TestDataFactory.createTestRole({ name: 'admin' });
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const communityIdOf = async (retreatId: string) => {
		const retreat = await AppDataSource.getRepository(Retreat).findOne({
			where: { id: retreatId },
		});
		return retreat?.communityId ?? null;
	};

	it('un admin activo de la comunidad puede vincular su retiro', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		await TestDataFactory.createTestCommunityAdmin(community.id, owner.id, {
			role: 'owner',
			status: 'active',
		});
		const retreat = await TestDataFactory.createTestRetreat();

		const res = createMockResponse();
		const next = jest.fn();
		await updateRetreat(requestFor(owner, retreat.id, { communityId: community.id }), res, next);

		expect(next).not.toHaveBeenCalled();
		expect(await communityIdOf(retreat.id)).toBe(community.id);
	});

	it('rechaza con 403 a quien no administra esa comunidad', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const outsider = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat();

		const res = createMockResponse();
		const next = jest.fn();
		await updateRetreat(
			requestFor(outsider, retreat.id, { communityId: community.id }),
			res,
			next,
		);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(await communityIdOf(retreat.id)).toBeNull();
	});

	// Regresión: el guard tiraba el 403 pero el catch de `createRetreat` solo
	// traducía el 409, y el errorHandler global solo trata el 413 — así que el
	// intento de colgar un retiro NUEVO de una comunidad ajena respondía 500.
	// El vínculo nunca se creaba (el guard corre antes del insert), pero el
	// coordinador recibía "Internal Server Error" en vez del motivo.
	it('al CREAR, rechaza con 403 y no con 500 a quien no administra esa comunidad', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const outsider = await TestDataFactory.createTestUser();

		const res = createMockResponse();
		const next = jest.fn();
		await createRetreat(
			{ user: outsider, body: { communityId: community.id }, params: {}, query: {} } as any,
			res,
			next,
		);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
		const created = await AppDataSource.getRepository(Retreat).count({
			where: { communityId: community.id },
		});
		expect(created).toBe(0);
	});

	it('un superadmin puede vincular sin fila en community_admin', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const superadmin = await TestDataFactory.createTestUser();
		const { UserRole } = await import('@/entities/userRole.entity');
		await AppDataSource.getRepository(UserRole).save({
			userId: superadmin.id,
			roleId: superadminRole.id,
		});
		const retreat = await TestDataFactory.createTestRetreat();

		const res = createMockResponse();
		const next = jest.fn();
		await updateRetreat(
			requestFor(superadmin, retreat.id, { communityId: community.id }),
			res,
			next,
		);

		expect(res.status).not.toHaveBeenCalledWith(403);
		expect(await communityIdOf(retreat.id)).toBe(community.id);
	});

	it('desvincular (null) no exige permisos de comunidad', async () => {
		const owner = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(owner.id);
		const retreat = await TestDataFactory.createTestRetreat();
		await AppDataSource.getRepository(Retreat).update(retreat.id, {
			communityId: community.id,
		});
		const outsider = await TestDataFactory.createTestUser();

		const res = createMockResponse();
		const next = jest.fn();
		await updateRetreat(requestFor(outsider, retreat.id, { communityId: null }), res, next);

		expect(res.status).not.toHaveBeenCalledWith(403);
		expect(await communityIdOf(retreat.id)).toBeNull();
	});

	it('una actualización que no menciona communityId no dispara el guard', async () => {
		const outsider = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat();

		const res = createMockResponse();
		const next = jest.fn();
		await updateRetreat(requestFor(outsider, retreat.id, { parish: 'Otra parroquia' }), res, next);

		expect(res.status).not.toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});
});
