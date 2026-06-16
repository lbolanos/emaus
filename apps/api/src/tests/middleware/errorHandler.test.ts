import { errorHandler } from '@/middleware/errorHandler';

function mockRes() {
	const res: any = { statusCode: 200, body: undefined, headersSent: false };
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
 * errorHandler: mapea el body demasiado grande a 413 (antes caía en 500 genérico).
 */
describe('errorHandler', () => {
	it('mapea PayloadTooLargeError (type entity.too.large) a 413', () => {
		const err: any = new Error('request entity too large');
		err.type = 'entity.too.large';
		err.status = 413;
		const res = mockRes();
		errorHandler(err, {} as any, res, (() => {}) as any);
		expect(res.statusCode).toBe(413);
		expect(res.body.message).toMatch(/demasiado grande/i);
	});

	it('errores de validación conocidos → 400 con el mensaje', () => {
		const res = mockRes();
		errorHandler(new Error('Participant not found'), {} as any, res, (() => {}) as any);
		expect(res.statusCode).toBe(400);
	});

	it('error inesperado → 500 genérico', () => {
		const res = mockRes();
		errorHandler(new Error('boom'), {} as any, res, (() => {}) as any);
		expect(res.statusCode).toBe(500);
		expect(res.body.message).toBe('Internal Server Error');
	});
});
