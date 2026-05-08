/**
 * Tests del endpoint `GET /api/houses/timezone-from-coords?lat=&lon=`
 *
 * El frontend llama este endpoint al cambiar las coordenadas de la casa
 * (vía Google Places autocomplete) para auto-completar la timezone IANA.
 *
 * El endpoint envuelve `inferTimezoneFromCoords`; estos tests verifican
 * el contrato HTTP y el parseo del query string. La lógica del helper
 * tiene su propia suite (`inferTimezoneFromCoords.simple.test.ts`).
 */
import * as houseController from '../../controllers/houseController';
import * as dateTransformer from '../../utils/date.transformer';

describe('houseController.getTimezoneFromCoords', () => {
	const createMockRequest = (overrides: any = {}) => ({
		params: {},
		body: {},
		query: {},
		user: { id: 'user-id-1' },
		...overrides,
	});

	const createMockResponse = () => {
		const res: any = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
		};
		return res;
	};

	const mockNext = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('responde 200 con { timezone } cuando las coords son válidas', async () => {
		jest
			.spyOn(dateTransformer, 'inferTimezoneFromCoords')
			.mockResolvedValue('America/Mexico_City');

		const req = createMockRequest({ query: { lat: '19.43', lon: '-99.13' } });
		const res = createMockResponse();

		await houseController.getTimezoneFromCoords(req as any, res as any, mockNext);

		expect(dateTransformer.inferTimezoneFromCoords).toHaveBeenCalledWith(
			19.43,
			-99.13,
		);
		expect(res.json).toHaveBeenCalledWith({ timezone: 'America/Mexico_City' });
	});

	test('responde 200 con { timezone: null } cuando las coords son inválidas', async () => {
		jest.spyOn(dateTransformer, 'inferTimezoneFromCoords').mockResolvedValue(null);

		const req = createMockRequest({ query: { lat: 'abc', lon: 'def' } });
		const res = createMockResponse();

		await houseController.getTimezoneFromCoords(req as any, res as any, mockNext);

		// parseFloat('abc') = NaN, el helper devuelve null → response { timezone: null }
		expect(res.json).toHaveBeenCalledWith({ timezone: null });
	});

	test('parsea correctamente coords negativos', async () => {
		jest
			.spyOn(dateTransformer, 'inferTimezoneFromCoords')
			.mockResolvedValue('America/Bogota');

		const req = createMockRequest({ query: { lat: '4.711', lon: '-74.0721' } });
		const res = createMockResponse();

		await houseController.getTimezoneFromCoords(req as any, res as any, mockNext);

		expect(dateTransformer.inferTimezoneFromCoords).toHaveBeenCalledWith(
			4.711,
			-74.0721,
		);
	});

	test('llama next() cuando el helper lanza excepción', async () => {
		jest
			.spyOn(dateTransformer, 'inferTimezoneFromCoords')
			.mockRejectedValue(new Error('boom'));

		const req = createMockRequest({ query: { lat: '0', lon: '0' } });
		const res = createMockResponse();

		await houseController.getTimezoneFromCoords(req as any, res as any, mockNext);

		expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
	});

	test('query sin lat/lon → invoca el helper con NaN (responde null)', async () => {
		jest.spyOn(dateTransformer, 'inferTimezoneFromCoords').mockResolvedValue(null);

		const req = createMockRequest({ query: {} });
		const res = createMockResponse();

		await houseController.getTimezoneFromCoords(req as any, res as any, mockNext);

		expect(dateTransformer.inferTimezoneFromCoords).toHaveBeenCalledWith(
			NaN,
			NaN,
		);
		expect(res.json).toHaveBeenCalledWith({ timezone: null });
	});
});
