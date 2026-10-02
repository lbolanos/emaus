import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { authorizationService } from '@/middleware/authorization';
import { AppDataSource } from '@/data-source';
import { MessageTemplate } from '@/entities/messageTemplate.entity';

function mockRes() {
	const res: any = { statusCode: 200, body: undefined };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body: any) => {
		res.body = body;
		return res;
	};
	return res;
}

/**
 * PUT /message-templates/:id must authorize BEFORE writing. It used to update
 * first and check after, so a caller without access got a 403 with the change
 * already saved — and since M6 the write also clears the type's other
 * defaults in that retreat.
 */
describe('updateMessageTemplate — authorization before the write', () => {
	let OUTSIDER: string;
	let MEMBER: string;
	let retreatA: string;
	let retreatB: string;
	const repo = () => AppDataSource.getRepository(MessageTemplate);
	let updateMessageTemplate: (req: any, res: any) => Promise<unknown>;

	beforeAll(async () => {
		await setupTestDatabase();
		// The controller builds its service (and repository) at import time:
		// import it only after the test DataSource is initialized.
		({ updateMessageTemplate } = await import('@/controllers/messageTemplateController'));
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
		OUTSIDER = (await TestDataFactory.createTestUser({ email: 'fuera-tpl@test.com' } as any)).id;
		MEMBER = (await TestDataFactory.createTestUser({ email: 'miembro-tpl@test.com' } as any)).id;
		retreatA = (await TestDataFactory.createTestRetreat()).id;
		retreatB = (await TestDataFactory.createTestRetreat()).id;
		// MEMBER coordinates retreat A only; OUTSIDER none.
		jest
			.spyOn(authorizationService, 'hasRetreatAccess')
			.mockImplementation(async (userId: string, rid: string) => userId === MEMBER && rid === retreatA);
	});

	const tpl = (retreatId: string, name: string, isDefault = false) =>
		repo().save(
			repo().create({ name, type: 'GENERAL' as any, scope: 'retreat', retreatId, message: name, isDefault }),
		);
	const put = async (userId: string, id: string, body: Record<string, unknown>) => {
		const res = mockRes();
		await updateMessageTemplate({ user: { id: userId }, params: { id }, body } as any, res);
		return res;
	};

	it('a caller without access gets 403 and nothing is written (no default cleared either)', async () => {
		const target = await tpl(retreatB, 'Target');
		const sibling = await tpl(retreatB, 'Sibling', true);

		const res = await put(OUTSIDER, target.id, { name: 'Hacked', isDefault: true });

		expect(res.statusCode).toBe(403);
		expect((await repo().findOneBy({ id: target.id }))!.name).toBe('Target');
		expect((await repo().findOneBy({ id: sibling.id }))!.isDefault).toBe(true);
	});

	it('moving an own template into a retreat without access is refused', async () => {
		const own = await tpl(retreatA, 'Own');

		const res = await put(MEMBER, own.id, { retreatId: retreatB });

		expect(res.statusCode).toBe(403);
		expect((await repo().findOneBy({ id: own.id }))!.retreatId).toBe(retreatA);
	});

	it('with access it updates, and taking the default clears the sibling', async () => {
		const own = await tpl(retreatA, 'Own');
		const sibling = await tpl(retreatA, 'Sibling', true);

		const res = await put(MEMBER, own.id, { isDefault: true });

		expect(res.statusCode).toBe(200);
		expect(res.body.isDefault).toBe(true);
		expect((await repo().findOneBy({ id: sibling.id }))!.isDefault).toBe(false);
	});

	it('an unknown template is 404, not 403', async () => {
		const res = await put(MEMBER, '00000000-0000-4000-8000-000000000000', { name: 'x' });
		expect(res.statusCode).toBe(404);
	});
});
