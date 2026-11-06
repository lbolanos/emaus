/**
 * Contrato HTTP del controller del puente WhatsApp (specs/whatsapp-inbox, M3).
 *
 * Los guards de permiso/retiro viven en la ruta (requirePermission +
 * requireRetreatAccess, moldes ya probados) — aquí se prueban las reglas del
 * controller: consentimiento server-side, mapeo de rechazos a códigos HTTP,
 * QR y linkedPhone solo al dueño (S5/S12) y validaciones de entrada.
 * Las ramas que tocan DB (conversations/messages/seen) se ejercitan en el QA
 * manual de M5.
 */
import { WaBridgeController } from '../../controllers/waBridgeController';
import { waBridgeService } from '../../services/waBridge';
import { authorizationService } from '../../middleware/authorization';
import { config } from '../../config';

const RETREAT_ID = '33333333-3333-4333-8333-333333333333';
const LINK_ID = '55555555-5555-4555-8555-555555555555';

describe('waBridgeController', () => {
	let controller: WaBridgeController;
	let savedEnabled: boolean;

	const req = (overrides: Record<string, unknown> = {}) =>
		({
			params: { retreatId: RETREAT_ID, linkId: LINK_ID },
			user: { id: 'user-1' },
			body: {},
			query: {},
			...overrides,
		}) as any;
	const res = () => {
		const r: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
		return r;
	};
	const link = (overrides: Record<string, unknown> = {}) =>
		({
			id: LINK_ID,
			retreatId: RETREAT_ID,
			userId: 'user-1',
			status: 'connected',
			linkedPhone: '5512345678',
			lastError: null,
			createdAt: new Date('2026-11-05T10:00:00Z'),
			...overrides,
		}) as any;

	beforeAll(() => {
		controller = new WaBridgeController();
	});
	beforeEach(() => {
		savedEnabled = config.waBridge.enabled;
	});
	afterEach(() => {
		config.waBridge.enabled = savedEnabled;
		jest.restoreAllMocks();
	});

	describe('startLink', () => {
		it('400 sin consentAccepted=true — el consentimiento se exige server-side (D7)', async () => {
			const r = res();
			await controller.startLink(req({ body: {} }), r);
			expect(r.status).toHaveBeenCalledWith(400);
		});

		it('503 con el kill switch apagado, sin tocar el servicio', async () => {
			config.waBridge.enabled = false;
			const spy = jest.spyOn(waBridgeService, 'startLink');
			const r = res();

			await controller.startLink(req({ body: { consentAccepted: true } }), r);

			expect(r.status).toHaveBeenCalledWith(503);
			expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'disabled' }));
			expect(spy).not.toHaveBeenCalled();
		});

		it('mapea cap_reached a 409 con mensaje claro (D12)', async () => {
			jest
				.spyOn(waBridgeService, 'startLink')
				.mockResolvedValue({ ok: false, reason: 'cap_reached' });
			const r = res();

			await controller.startLink(req({ body: { consentAccepted: true } }), r);

			expect(r.status).toHaveBeenCalledWith(409);
			expect(r.json).toHaveBeenCalledWith(
				expect.objectContaining({
					reason: 'cap_reached',
					message: expect.stringContaining('máximo de sesiones'),
				}),
			);
		});

		it('mapea outside_window a 422 (D5)', async () => {
			jest
				.spyOn(waBridgeService, 'startLink')
				.mockResolvedValue({ ok: false, reason: 'outside_window' });
			const r = res();

			await controller.startLink(req({ body: { consentAccepted: true } }), r);

			expect(r.status).toHaveBeenCalledWith(422);
		});

		it('201 con el link (con teléfono: el que vincula es el dueño)', async () => {
			jest.spyOn(waBridgeService, 'startLink').mockResolvedValue({ ok: true, link: link() });
			const r = res();

			await controller.startLink(req({ body: { consentAccepted: true } }), r);

			expect(r.status).toHaveBeenCalledWith(201);
			expect(r.json).toHaveBeenCalledWith({
				link: expect.objectContaining({ id: LINK_ID, linkedPhone: '5512345678' }),
			});
		});
	});

	describe('listLinks', () => {
		it('strippea linkedPhone ajeno, conserva el propio (S12)', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			jest.spyOn(waBridgeService, 'listLinksForRetreat').mockResolvedValue([
				link(),
				link({ id: 'other', userId: 'user-2' }) as any,
			]);
			const r = res();

			await controller.listLinks(req(), r);

			const links = (r.json.mock.calls[0][0] as { links: Array<Record<string, unknown>> }).links;
			expect(links.find((l) => l.id === LINK_ID)?.linkedPhone).toBe('5512345678');
			expect(links.find((l) => l.id === 'other')?.linkedPhone).toBeNull();
		});

		it('superadmin ve todos los teléfonos', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
			jest.spyOn(waBridgeService, 'listLinksForRetreat').mockResolvedValue([
				link({ id: 'other', userId: 'user-2' }) as any,
			]);
			const r = res();

			await controller.listLinks(req(), r);

			const links = (r.json.mock.calls[0][0] as { links: Array<Record<string, unknown>> }).links;
			expect(links[0].linkedPhone).toBe('5512345678');
		});
	});

	describe('linkStatus', () => {
		it('404 para vínculo inexistente', async () => {
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(null);
			const r = res();

			await controller.linkStatus(req(), r);

			expect(r.status).toHaveBeenCalledWith(404);
		});

		it('403 al no-dueño sin superadmin, sin exponer ni QR ni teléfono (S5)', async () => {
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(link({ userId: 'user-2' }));
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			const qrSpy = jest.spyOn(waBridgeService, 'getQr');
			const r = res();

			await controller.linkStatus(req(), r);

			expect(r.status).toHaveBeenCalledWith(403);
			expect(qrSpy).not.toHaveBeenCalled();
		});

		it('el dueño recibe status, qr y teléfono', async () => {
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(link());
			jest.spyOn(waBridgeService, 'getQr').mockReturnValue('waid://QR');
			const r = res();

			await controller.linkStatus(req(), r);

			expect(r.json).toHaveBeenCalledWith(
				expect.objectContaining({ status: 'connected', qr: 'waid://QR', linkedPhone: '5512345678' }),
			);
		});
	});

	describe('unlink', () => {
		it('403 al no-dueño sin superadmin', async () => {
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(link({ userId: 'user-2' }));
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			const spy = jest.spyOn(waBridgeService, 'unlink');
			const r = res();

			await controller.unlink(req(), r);

			expect(r.status).toHaveBeenCalledWith(403);
			expect(spy).not.toHaveBeenCalled();
		});

		it('desvincula y responde ok para el dueño (FR6)', async () => {
			const theLink = link();
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(theLink);
			jest.spyOn(waBridgeService, 'unlink').mockResolvedValue(undefined);
			const r = res();

			await controller.unlink(req(), r);

			expect(waBridgeService.unlink).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), theLink);
			expect(r.json).toHaveBeenCalledWith({ ok: true });
		});
	});

	describe('markSeen / messages — validaciones sin DB', () => {
		it('400 con chatJid que no es 1:1 (grupos fuera)', async () => {
			const r = res();
			await controller.markSeen(req({ body: { chatJid: '999@g.us' } }), r);
			expect(r.status).toHaveBeenCalledWith(400);
		});

		it('400 con before no-fecha en messages', async () => {
			const r = res();
			await controller.messages(
				req({ query: { chatJid: '5215512345678@s.whatsapp.net', before: 'no-es-fecha' } }),
				r,
			);
			expect(r.status).toHaveBeenCalledWith(400);
		});
	});
});
