/**
 * POST /api/telemetry/public/client-error
 *
 * Nació de un fallo que no dejó rastro: el 2026-09-08 una persona vio un error
 * al confirmar su registro desde un iPhone y en el servidor no había nada —
 * la petición nunca llegó. El resto de telemetría vive detrás de
 * `router.use(isAuthenticated)`, así que una pantalla pública no puede
 * reportar por ahí: esta ruta tiene que quedar ANTES de ese middleware, y
 * tiene que seguir estándolo.
 */
import express from 'express';
import request from 'supertest';

const getRepository = jest.fn();
jest.mock('../../data-source', () => ({ AppDataSource: { getRepository } }));
jest.mock('../../services/telemetryCollectionService', () => ({
	getTelemetryCollectionService: () => ({}),
}));
jest.mock('../../services/telemetryAggregationService', () => ({
	getTelemetryAggregationService: () => ({}),
}));
jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (_req: any, res: any) => res.status(401).json({ message: 'Unauthorized' }),
}));
jest.mock('../../middleware/authorization', () => ({
	requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

import telemetryRoutes from '../../routes/telemetryRoutes';

const app = express();
app.use(express.json());
app.use('/telemetry', telemetryRoutes);

const VALID_REPORT = {
	context: 'confirm-registration',
	message: 'Network Error',
	retried: true,
	page: '/delvalleii/server',
};

describe('telemetry client error report (public)', () => {
	let warn: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	it('accepts a report without a session', async () => {
		const response = await request(app).post('/telemetry/public/client-error').send(VALID_REPORT);

		expect(response.status).toBe(204);
	});

	it('leaves the report in the API log', async () => {
		await request(app).post('/telemetry/public/client-error').send(VALID_REPORT);

		expect(warn).toHaveBeenCalledTimes(1);
		const line = warn.mock.calls[0][0] as string;
		expect(line).toContain('[CLIENT ERROR]');
		expect(line).toContain('context=confirm-registration');
		expect(line).toContain('retried=true');
		expect(line).toContain('message="Network Error"');
		expect(line).toContain('page=/delvalleii/server');
	});

	it('keeps the log entry on a single line', async () => {
		await request(app)
			.post('/telemetry/public/client-error')
			.send({ context: 'confirm-registration', message: 'line one\nline two\r\n[CLIENT ERROR] fake' });

		const line = warn.mock.calls[0][0] as string;
		expect(line).not.toMatch(/[\r\n]/);
	});

	it('stores nothing in the database', async () => {
		await request(app).post('/telemetry/public/client-error').send(VALID_REPORT);

		expect(getRepository).not.toHaveBeenCalled();
	});

	it.each([
		['an empty body', {}],
		['no message', { context: 'confirm-registration' }],
		['an oversized message', { context: 'confirm-registration', message: 'x'.repeat(301) }],
		['an oversized context', { context: 'c'.repeat(61), message: 'Network Error' }],
		['a status outside the HTTP range', { context: 'c', message: 'm', status: 42 }],
		['a non-numeric status', { context: 'c', message: 'm', status: '502' }],
	])('rejects %s', async (_name, body) => {
		const response = await request(app).post('/telemetry/public/client-error').send(body);

		expect(response.status).toBe(400);
		expect(warn).not.toHaveBeenCalled();
	});

	it('still requires a session for the authenticated telemetry routes', async () => {
		const response = await request(app)
			.post('/telemetry/events')
			.send({ eventType: 'system_error', severity: 'error', description: 'x' });

		expect(response.status).toBe(401);
	});
});
