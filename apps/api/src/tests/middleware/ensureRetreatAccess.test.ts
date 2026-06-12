/**
 * Unit tests de `ensureRetreatAccess` — el guard de acceso a retiro para usar
 * DENTRO de un controller cuando el retreatId no viene en la ruta (body o
 * derivado del registro) y `requireRetreatAccess` no aplica.
 *
 * Contrato: responde 401/403 él mismo y devuelve `false`; devuelve `true`
 * sin tocar la response cuando hay acceso. `hasRetreatAccess` se mockea
 * (el bypass de superadmin vive dentro del service y se prueba allá).
 */
import { ensureRetreatAccess, authorizationService } from '@/middleware/authorization';

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

describe('ensureRetreatAccess', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('responde 401 y devuelve false cuando no hay usuario en el request', async () => {
		const spy = jest.spyOn(authorizationService, 'hasRetreatAccess');
		const res = mockRes();

		const ok = await ensureRetreatAccess({ user: undefined } as any, res, 'retreat-1');

		expect(ok).toBe(false);
		expect(res.status).toHaveBeenCalledWith(401);
		// No debe consultar autorización si ni siquiera hay usuario.
		expect(spy).not.toHaveBeenCalled();
	});

	it('responde 403 y devuelve false cuando el usuario no tiene acceso al retiro', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		const res = mockRes();

		const ok = await ensureRetreatAccess({ user: { id: 'user-1' } } as any, res, 'retreat-1');

		expect(ok).toBe(false);
		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.body).toEqual({ message: 'No tienes acceso a este retiro' });
	});

	it('devuelve true sin tocar la response cuando hay acceso', async () => {
		const spy = jest
			.spyOn(authorizationService, 'hasRetreatAccess')
			.mockResolvedValue(true);
		const res = mockRes();

		const ok = await ensureRetreatAccess({ user: { id: 'user-1' } } as any, res, 'retreat-1');

		expect(ok).toBe(true);
		expect(res.status).not.toHaveBeenCalled();
		expect(res.json).not.toHaveBeenCalled();
		// Consulta con el userId del request y el retreatId efectivo recibidos.
		expect(spy).toHaveBeenCalledWith('user-1', 'retreat-1');
	});
});
