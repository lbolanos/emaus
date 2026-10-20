/**
 * Idempotency-Key middleware (specs/offline-mode, FR-16) against the real test
 * database: the guarantee is "a resend never executes the write twice", so the
 * tests count handler executions, not just status codes.
 */
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { AppDataSource } from '@/data-source';
import { IdempotencyKey } from '@/entities/idempotencyKey.entity';
import { idempotency } from '@/middleware/idempotency';
import { idempotencyService, IN_PROGRESS } from '@/services/idempotencyService';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER_REQUEST_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

let executions: Record<string, number>;

function buildApp() {
	const app = express();
	app.use(express.json());
	// Stand-in for passport: the caller is whoever the test says.
	app.use((req: Request, _res: Response, next: NextFunction) => {
		const user = req.get('x-test-user');
		if (user) (req as any).user = { id: user };
		next();
	});
	const count = (name: string) => {
		executions[name] = (executions[name] ?? 0) + 1;
		return executions[name];
	};
	app.post('/api/payments', idempotency, (_req, res) => {
		res.status(201).json({ id: count('payments'), email: 'walker@example.com' });
	});
	app.put('/api/beds/:id/assign', idempotency, (_req, res) => {
		count('beds');
		res.status(409).json({ message: 'Bed is already assigned to another participant' });
	});
	let flaky = 0;
	app.post('/api/flaky', idempotency, (_req, res) => {
		count('flaky');
		flaky += 1;
		if (flaky === 1) return res.status(500).json({ message: 'Internal Server Error' });
		res.json({ ok: true });
	});
	app.delete('/api/tables/:id/walkers/:w', idempotency, (_req, res) => {
		count('unassign');
		res.status(204).send();
	});
	app.post('/api/slow', idempotency, async (_req, res) => {
		count('slow');
		await new Promise((r) => setTimeout(r, 150));
		res.json({ ok: true });
	});
	return app;
}

describe('idempotency middleware (integration)', () => {
	let app: express.Express;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await AppDataSource.getRepository(IdempotencyKey).clear();
		executions = {};
		app = buildApp();
	});

	test('without the header every request runs, as before', async () => {
		await request(app).post('/api/payments').set('x-test-user', USER_A).expect(201);
		await request(app).post('/api/payments').set('x-test-user', USER_A).expect(201);

		expect(executions.payments).toBe(2);
		expect(await AppDataSource.getRepository(IdempotencyKey).count()).toBe(0);
	});

	test('a resend with the same key is replayed and the write runs once', async () => {
		const first = await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(201);
		expect(first.body.id).toBe(1);

		const again = await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(201);

		expect(executions.payments).toBe(1);
		expect(again.headers['idempotent-replayed']).toBe('true');
		expect(again.body).toEqual({ idempotentReplay: true });
	});

	test('a 2xx body is not stored (it can carry personal data)', async () => {
		await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(201);

		const row = await AppDataSource.getRepository(IdempotencyKey).findOneByOrFail({ key: REQUEST_ID });
		expect(row.statusCode).toBe(201);
		expect(row.responseBody).toBeNull();
		expect(row.completedAt).not.toBeNull();
	});

	test('a 4xx is final: replayed with the same message so the device can show the conflict', async () => {
		await request(app)
			.put('/api/beds/b1/assign')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(409);
		const again = await request(app)
			.put('/api/beds/b1/assign')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(409);

		expect(executions.beds).toBe(1);
		expect(again.body.message).toBe('Bed is already assigned to another participant');
	});

	test('a 5xx releases the key so the same operation can be retried', async () => {
		await request(app)
			.post('/api/flaky')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(500);
		expect(await AppDataSource.getRepository(IdempotencyKey).count()).toBe(0);

		await request(app)
			.post('/api/flaky')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(200);
		expect(executions.flaky).toBe(2);
	});

	test('answers without res.json (204) are recorded and replayed', async () => {
		await request(app)
			.delete('/api/tables/t1/walkers/w1')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(204);
		// 'finish' stores the outcome asynchronously
		for (let i = 0; i < 50; i++) {
			const row = await AppDataSource.getRepository(IdempotencyKey).findOneBy({ key: REQUEST_ID });
			if (row && row.statusCode !== IN_PROGRESS) break;
			await new Promise((r) => setTimeout(r, 5));
		}
		const again = await request(app)
			.delete('/api/tables/t1/walkers/w1')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(204);

		expect(executions.unassign).toBe(1);
		expect(again.headers['idempotent-replayed']).toBe('true');
	});

	test('the same key from another user is rejected, not replayed', async () => {
		await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(201);
		const res = await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_B)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(422);

		expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
		expect(executions.payments).toBe(1);
	});

	test('the same key on another path is rejected', async () => {
		await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(201);
		await request(app)
			.post('/api/flaky')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(422);
		expect(executions.flaky).toBeUndefined();
	});

	test('a malformed key is a 400 and nothing runs', async () => {
		const res = await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', 'not-a-uuid')
			.expect(400);
		expect(res.body.code).toBe('IDEMPOTENCY_KEY_INVALID');
		expect(executions.payments).toBeUndefined();
	});

	test('two concurrent requests with one key: one runs, the other waits its turn', async () => {
		const send = () =>
			request(app).post('/api/slow').set('x-test-user', USER_A).set('Idempotency-Key', REQUEST_ID);
		const [a, b] = await Promise.all([send(), send()]);

		expect(executions.slow).toBe(1);
		expect([a.status, b.status].sort()).toEqual([200, 409]);
		const busy = a.status === 409 ? a : b;
		expect(busy.body.code).toBe('IDEMPOTENCY_IN_PROGRESS');
	});

	test('a reservation abandoned mid-request (process restart) is reclaimed after 2 minutes', async () => {
		const repo = AppDataSource.getRepository(IdempotencyKey);
		await repo.insert({
			key: REQUEST_ID,
			userId: USER_A,
			method: 'POST',
			path: '/api/payments',
			statusCode: IN_PROGRESS,
			createdAt: new Date(Date.now() - 3 * 60 * 1000),
		});
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

		await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(201);

		expect(executions.payments).toBe(1);
		expect((await repo.findOneByOrFail({ key: REQUEST_ID })).statusCode).toBe(201);
		warn.mockRestore();
	});

	test('a recent reservation still running is not reclaimed', async () => {
		await AppDataSource.getRepository(IdempotencyKey).insert({
			key: REQUEST_ID,
			userId: USER_A,
			method: 'POST',
			path: '/api/payments',
			statusCode: IN_PROGRESS,
			createdAt: new Date(Date.now() - 30 * 1000),
		});

		await request(app)
			.post('/api/payments')
			.set('x-test-user', USER_A)
			.set('Idempotency-Key', REQUEST_ID)
			.expect(409);
		expect(executions.payments).toBeUndefined();
	});

	test('unauthenticated requests pass through (the route guards reject them)', async () => {
		await request(app).post('/api/payments').set('Idempotency-Key', REQUEST_ID).expect(201);
		expect(await AppDataSource.getRepository(IdempotencyKey).count()).toBe(0);
	});

	test('purge removes keys older than 7 days and keeps the recent ones', async () => {
		const repo = AppDataSource.getRepository(IdempotencyKey);
		await repo.insert({
			key: REQUEST_ID,
			userId: USER_A,
			method: 'POST',
			path: '/api/payments',
			statusCode: 201,
			createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
		});
		await repo.insert({
			key: OTHER_REQUEST_ID,
			userId: USER_A,
			method: 'POST',
			path: '/api/payments',
			statusCode: 201,
		});

		const purged = await idempotencyService.purgeOlderThan();

		expect(purged).toBe(1);
		expect(await repo.findOneBy({ key: REQUEST_ID })).toBeNull();
		expect(await repo.findOneBy({ key: OTHER_REQUEST_ID })).not.toBeNull();
	});
});
