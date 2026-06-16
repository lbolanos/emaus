import { enforceAbsoluteSessionExpiry } from '../../middleware/sessionExpiry';
import { parseDaysEnv, config } from '../../config';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('parseDaysEnv (validación/clamp de ENV de días)', () => {
	test('usa el fallback con valor ausente, vacío o no numérico', () => {
		expect(parseDaysEnv(undefined, 30)).toBe(30);
		expect(parseDaysEnv('', 30)).toBe(30);
		expect(parseDaysEnv('30d', 30)).toBe(30); // typo común → NaN → fallback
		expect(parseDaysEnv('abc', 30)).toBe(30);
	});

	test('usa el fallback con cero o negativo (no degrada la expiración)', () => {
		expect(parseDaysEnv('0', 30)).toBe(30);
		expect(parseDaysEnv('-5', 30)).toBe(30);
	});

	test('respeta un valor válido y lo acota al máximo', () => {
		expect(parseDaysEnv('45', 30, 365)).toBe(45);
		expect(parseDaysEnv('9999', 30, 365)).toBe(365);
	});
});

describe('enforceAbsoluteSessionExpiry (techo absoluto de sesión)', () => {
	const absoluteMaxMs = config.session.absoluteMaxAgeDays * DAY_MS;

	const makeReq = (overrides: any = {}) => {
		const { session, isAuthenticated, ...rest } = overrides;
		return {
			session: { destroy: jest.fn((cb: any) => cb && cb()), ...session },
			isAuthenticated: isAuthenticated ?? (() => true),
			logout: jest.fn((cb: any) => cb && cb()),
			...rest,
		};
	};

	const makeRes = () => {
		const res: any = {};
		res.status = jest.fn(() => res);
		res.json = jest.fn(() => res);
		res.clearCookie = jest.fn(() => res);
		return res;
	};

	test('deja pasar peticiones no autenticadas sin tocar la sesión', () => {
		const req = makeReq({ isAuthenticated: () => false, session: { loginAt: 1 } });
		const res = makeRes();
		const next = jest.fn();
		enforceAbsoluteSessionExpiry(req as any, res as any, next);
		expect(next).toHaveBeenCalledTimes(1);
		expect(res.status).not.toHaveBeenCalled();
	});

	test('sella sesiones legadas sin loginAt y continúa (no expulsa)', () => {
		const req = makeReq({ session: { destroy: jest.fn() } });
		const res = makeRes();
		const next = jest.fn();
		enforceAbsoluteSessionExpiry(req as any, res as any, next);
		expect(typeof req.session.loginAt).toBe('number');
		expect(next).toHaveBeenCalledTimes(1);
		expect(res.status).not.toHaveBeenCalled();
	});

	test('deja pasar una sesión dentro del techo absoluto', () => {
		const req = makeReq({ session: { loginAt: Date.now() - DAY_MS } });
		const res = makeRes();
		const next = jest.fn();
		enforceAbsoluteSessionExpiry(req as any, res as any, next);
		expect(next).toHaveBeenCalledTimes(1);
		expect(req.logout).not.toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	test('destruye y responde 401 cuando supera el techo absoluto', () => {
		const req = makeReq({ session: { loginAt: Date.now() - absoluteMaxMs - DAY_MS } });
		const res = makeRes();
		const next = jest.fn();
		enforceAbsoluteSessionExpiry(req as any, res as any, next);
		expect(req.logout).toHaveBeenCalledTimes(1);
		expect(req.session.destroy).toHaveBeenCalledTimes(1);
		expect(res.clearCookie).toHaveBeenCalledWith('emaus.sid');
		expect(res.status).toHaveBeenCalledWith(401);
		expect(next).not.toHaveBeenCalled();
	});
});
