/**
 * `requireRetreatAccessOrCreator` reading the retreat id from params, body or
 * query. The community import routes take it from the body (import) and the
 * query string (candidate list); before 2026-10-22 they had no retreat check at
 * all. `hasRetreatAccess` / `isRetreatCreator` are mocked: the superadmin bypass
 * lives inside the service and is tested there.
 */
import { requireRetreatAccessOrCreator, authorizationService } from '@/middleware/authorization';

function mockRes() {
	const res: any = { statusCode: 200, body: undefined };
	res.status = jest.fn((code: number) => {
		res.statusCode = code;
		return res;
	});
	res.json = jest.fn((body: any) => {
		res.body = body;
		return res;
	});
	return res;
}

const run = async (req: any, ...args: Parameters<typeof requireRetreatAccessOrCreator>) => {
	const res = mockRes();
	const next = jest.fn();
	await requireRetreatAccessOrCreator(...args)(req, res, next);
	return { res, next };
};

describe('requireRetreatAccessOrCreator', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('reads the id from params by default (existing callers)', async () => {
		const access = jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		jest.spyOn(authorizationService, 'isRetreatCreator').mockResolvedValue(false);

		const { next } = await run({ user: { id: 'u1' }, params: { retreatId: 'r1' } });

		expect(access).toHaveBeenCalledWith('u1', 'r1');
		expect(next).toHaveBeenCalled();
	});

	it('reads the id from the body', async () => {
		const access = jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		jest.spyOn(authorizationService, 'isRetreatCreator').mockResolvedValue(false);

		const { next } = await run(
			{ user: { id: 'u1' }, params: {}, body: { retreatId: 'r-body' } },
			'retreatId',
			'body',
		);

		expect(access).toHaveBeenCalledWith('u1', 'r-body');
		expect(next).toHaveBeenCalled();
	});

	it('reads the id from the query string', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		const creator = jest.spyOn(authorizationService, 'isRetreatCreator').mockResolvedValue(true);

		const { next } = await run(
			{ user: { id: 'u1' }, params: {}, query: { retreatId: 'r-query' } },
			'retreatId',
			'query',
		);

		expect(creator).toHaveBeenCalledWith('u1', 'r-query');
		expect(next).toHaveBeenCalled();
	});

	it('answers 403 without access and without being the creator', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		jest.spyOn(authorizationService, 'isRetreatCreator').mockResolvedValue(false);

		const { res, next } = await run(
			{ user: { id: 'u1' }, params: {}, query: { retreatId: 'someone-elses' } },
			'retreatId',
			'query',
		);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	it('answers 400 when the id is missing or repeated', async () => {
		const access = jest.spyOn(authorizationService, 'hasRetreatAccess');

		const missing = await run({ user: { id: 'u1' }, params: {}, query: {} }, 'retreatId', 'query');
		const repeated = await run(
			{ user: { id: 'u1' }, params: {}, query: { retreatId: ['mine', 'theirs'] } },
			'retreatId',
			'query',
		);

		expect(missing.res.status).toHaveBeenCalledWith(400);
		expect(repeated.res.status).toHaveBeenCalledWith(400);
		expect(access).not.toHaveBeenCalled();
	});
});
