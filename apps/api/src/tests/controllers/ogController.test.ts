/**
 * Tests de `GET /api/og/:slug` y `/api/og/:slug/server`.
 *
 * nginx enruta aquí a los rastreadores de WhatsApp/Facebook/Telegram que piden
 * las URLs públicas de inscripción, porque no ejecutan JavaScript y del SPA
 * solo verían las metas genéricas de index.html.
 */
import * as ogController from '../../controllers/ogController';
import * as retreatService from '../../services/retreatService';
import * as participantService from '../../services/participantService';

describe('ogController.getRetreatPreview', () => {
	const createMockRequest = (overrides: any = {}) => ({
		params: {},
		path: '/api/og/celayav',
		...overrides,
	});

	const createMockResponse = () => {
		const res: any = {
			status: jest.fn().mockReturnThis(),
			type: jest.fn().mockReturnThis(),
			set: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
		};
		return res;
	};

	const mockNext = jest.fn();

	const publicRetreat = {
		id: 'r1',
		slug: 'celayav',
		parish: 'Celaya',
		isPublic: true,
		// date-only columns: UTC midnight
		startDate: new Date('2026-08-28T00:00:00.000Z'),
		endDate: new Date('2026-08-30T00:00:00.000Z'),
		house: { name: 'Hacienda Landeta', city: 'San Miguel de Allende' },
	};

	beforeEach(() => {
		jest.restoreAllMocks();
		mockNext.mockClear();
		jest.spyOn(participantService, 'isRetreatPast').mockReturnValue(false);
	});

	const renderFor = async (req: any) => {
		const res = createMockResponse();
		await ogController.getRetreatPreview(req as any, res as any, mockNext);
		expect(mockNext).not.toHaveBeenCalled();
		return { res, html: res.send.mock.calls[0][0] as string };
	};

	test('devuelve las metas del retiro con parroquia, fechas y casa', async () => {
		jest.spyOn(retreatService, 'findBySlug').mockResolvedValue(publicRetreat as any);

		const { res, html } = await renderFor(
			createMockRequest({ params: { slug: 'celayav' } }),
		);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.type).toHaveBeenCalledWith('html');
		expect(html).toContain(
			'<meta property="og:title" content="Retiro Emaús Celaya · 28 al 30 de agosto de 2026">',
		);
		expect(html).toContain('Hacienda Landeta, San Miguel de Allende');
		expect(html).toContain('<meta property="og:image" content="');
		expect(html).toContain('/og-image.jpg">');
		expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
	});

	test('distingue el registro de servidores por la ruta', async () => {
		jest.spyOn(retreatService, 'findBySlug').mockResolvedValue(publicRetreat as any);

		const { html } = await renderFor(
			createMockRequest({
				params: { slug: 'celayav' },
				path: '/api/og/celayav/server',
			}),
		);

		expect(html).toContain('og:title" content="Servidores · Retiro Emaús Celaya');
		expect(html).toContain('equipo de servidores');
		expect(html).toContain('og:url" content="http://localhost:5173/celayav/server">');
	});

	test('avisa que el retiro ya pasó en vez de invitar a inscribirse', async () => {
		jest.spyOn(retreatService, 'findBySlug').mockResolvedValue(publicRetreat as any);
		jest.spyOn(participantService, 'isRetreatPast').mockReturnValue(true);

		const { html } = await renderFor(
			createMockRequest({ params: { slug: 'celayav' } }),
		);

		expect(html).toContain('ya se realizó');
		expect(html).not.toContain('Inscríbete en línea.');
	});

	test('no revela si un slug desconocido o privado existe', async () => {
		jest.spyOn(retreatService, 'findBySlug').mockResolvedValue(null as any);

		const unknown = await renderFor(
			createMockRequest({ params: { slug: 'noexiste' } }),
		);
		expect(unknown.res.status).toHaveBeenCalledWith(200);
		expect(unknown.html).toContain('og:title" content="Retiros Emaús">');
		expect(unknown.html).not.toContain('noexiste');

		jest
			.spyOn(retreatService, 'findBySlug')
			.mockResolvedValue({ ...publicRetreat, isPublic: false } as any);

		const priv = await renderFor(createMockRequest({ params: { slug: 'celayav' } }));
		expect(priv.html).toContain('og:title" content="Retiros Emaús">');
		expect(priv.html).not.toContain('Celaya');
	});

	test('escapa el contenido que viene de la base', async () => {
		jest.spyOn(retreatService, 'findBySlug').mockResolvedValue({
			...publicRetreat,
			parish: 'Celaya "<script>alert(1)</script>',
		} as any);

		const { html } = await renderFor(
			createMockRequest({ params: { slug: 'celayav' } }),
		);

		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&quot;');
	});

	test('propaga el error al handler central si la consulta falla', async () => {
		const boom = new Error('db down');
		jest.spyOn(retreatService, 'findBySlug').mockRejectedValue(boom);

		const res = createMockResponse();
		await ogController.getRetreatPreview(
			createMockRequest({ params: { slug: 'celayav' } }) as any,
			res as any,
			mockNext,
		);

		expect(mockNext).toHaveBeenCalledWith(boom);
		expect(res.send).not.toHaveBeenCalled();
	});
});

describe('formatRetreatDateRange', () => {
	// Las fechas del retiro son columnas date-only guardadas como medianoche UTC:
	// formatearlas en la zona del server las correría un día hacia atrás.
	test('no corre el día al formatear medianoche UTC', () => {
		expect(
			ogController.formatRetreatDateRange(
				new Date('2026-08-28T00:00:00.000Z'),
				new Date('2026-08-30T00:00:00.000Z'),
			),
		).toBe('28 al 30 de agosto de 2026');
	});

	test('incluye ambos meses cuando el retiro los cruza', () => {
		expect(
			ogController.formatRetreatDateRange(
				new Date('2026-10-30T00:00:00.000Z'),
				new Date('2026-11-01T00:00:00.000Z'),
			),
		).toBe('30 de octubre al 1 de noviembre de 2026');
	});

	test('incluye ambos años cuando el retiro los cruza', () => {
		expect(
			ogController.formatRetreatDateRange(
				new Date('2026-12-31T00:00:00.000Z'),
				new Date('2027-01-02T00:00:00.000Z'),
			),
		).toBe('31 de diciembre de 2026 al 2 de enero de 2027');
	});

	test('colapsa un retiro de un solo día', () => {
		expect(
			ogController.formatRetreatDateRange(
				new Date('2026-08-28T00:00:00.000Z'),
				new Date('2026-08-28T00:00:00.000Z'),
			),
		).toBe('28 de agosto de 2026');
	});

	test('devuelve cadena vacía sin fecha o con fecha inválida', () => {
		expect(ogController.formatRetreatDateRange(null, null)).toBe('');
		expect(ogController.formatRetreatDateRange('no-es-fecha', null)).toBe('');
	});
});
