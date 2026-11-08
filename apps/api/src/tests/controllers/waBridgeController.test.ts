/**
 * HTTP contract of the WhatsApp bridge controller (specs/whatsapp-inbox, M3).
 *
 * Permission/retreat guards live in the route (requirePermission +
 * requireRetreatAccess, already-tested patterns) — this tests the controller's
 * rules: server-side consent, refusal → HTTP code mapping, QR and linkedPhone
 * for the owner only (S5/S12) and input validation. The DB branches of v1.2/
 * v1.3 are covered by waBridgeControllerV13.test.ts (test DB).
 */
import { WaBridgeController } from '../../controllers/waBridgeController';
import { waBridgeService } from '../../services/waBridge';
import { authorizationService } from '../../middleware/authorization';
import { config } from '../../config';
import { AppDataSource } from '../../data-source';

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
		it('400 without consentAccepted=true — consent is required server side (D7)', async () => {
			const r = res();
			await controller.startLink(req({ body: {} }), r);
			expect(r.status).toHaveBeenCalledWith(400);
		});

		it('503 with the kill switch off, without touching the service', async () => {
			config.waBridge.enabled = false;
			const spy = jest.spyOn(waBridgeService, 'startLink');
			const r = res();

			await controller.startLink(req({ body: { consentAccepted: true } }), r);

			expect(r.status).toHaveBeenCalledWith(503);
			expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ reason: 'disabled' }));
			expect(spy).not.toHaveBeenCalled();
		});

		it('maps cap_reached to 409 with a clear message (D12)', async () => {
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

		it('201 with the link (phone included: whoever links is the owner)', async () => {
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
		// listLinks reads retreat.whatsappInboxEnabled (D13): mock the DataSource
		// repo (the test does not initialize metadata).
		const mockRetreatRepo = () => {
			jest
				.spyOn(AppDataSource, 'getRepository')
				.mockReturnValue({ findOneBy: jest.fn().mockResolvedValue({ whatsappInboxEnabled: true }) } as any);
		};

		it('strips other staff linkedPhone, keeps the own one (S12)', async () => {
			mockRetreatRepo();
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			jest.spyOn(waBridgeService, 'listLinksForRetreat').mockResolvedValue([
				link(),
				link({ id: 'other', userId: 'user-2' }) as any,
			]);
			const r = res();

			await controller.listLinks(req(), r);

			const body = r.json.mock.calls[0][0] as { links: Array<Record<string, unknown>>; enabled: boolean };
			const links = body.links;
			expect(links.find((l) => l.id === LINK_ID)?.linkedPhone).toBe('5512345678');
			expect(links.find((l) => l.id === 'other')?.linkedPhone).toBeNull();
			expect(body.enabled).toBe(true);
		});

		it('superadmin sees every phone', async () => {
			mockRetreatRepo();
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
		it('404 for a missing link', async () => {
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(null);
			const r = res();

			await controller.linkStatus(req(), r);

			expect(r.status).toHaveBeenCalledWith(404);
		});

		it('403 for a non-owner without superadmin, exposing neither QR nor phone (S5)', async () => {
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(link({ userId: 'user-2' }));
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			const qrSpy = jest.spyOn(waBridgeService, 'getQr');
			const r = res();

			await controller.linkStatus(req(), r);

			expect(r.status).toHaveBeenCalledWith(403);
			expect(qrSpy).not.toHaveBeenCalled();
		});

		it('the owner gets status, qr and phone', async () => {
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
		it('403 for a non-owner without superadmin', async () => {
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(link({ userId: 'user-2' }));
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			const spy = jest.spyOn(waBridgeService, 'unlink');
			const r = res();

			await controller.unlink(req(), r);

			expect(r.status).toHaveBeenCalledWith(403);
			expect(spy).not.toHaveBeenCalled();
		});

		it('unlinks and answers ok for the owner (FR6)', async () => {
			const theLink = link();
			jest.spyOn(waBridgeService, 'getLinkById').mockResolvedValue(theLink);
			jest.spyOn(waBridgeService, 'unlink').mockResolvedValue(undefined);
			const r = res();

			await controller.unlink(req(), r);

			expect(waBridgeService.unlink).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), theLink);
			expect(r.json).toHaveBeenCalledWith({ ok: true });
		});
	});

	describe('markSeen / messages — validation without DB', () => {
		it('400 with a chatJid that is not 1:1 (groups excluded)', async () => {
			const r = res();
			await controller.markSeen(req({ body: { chatJid: '999@g.us' } }), r);
			expect(r.status).toHaveBeenCalledWith(400);
		});

		it('400 with a non-date before in messages', async () => {
			const r = res();
			await controller.messages(
				req({ query: { chatJid: '5215512345678@s.whatsapp.net', before: 'no-es-fecha' } }),
				r,
			);
			expect(r.status).toHaveBeenCalledWith(400);
		});
	});

	describe('setEnabled / terminateAll — superadmin only (D13/D14, v1.1)', () => {
		it('403 for a non-superadmin in setEnabled, touching nothing', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			const spy = jest.spyOn(waBridgeService, 'setEnabled');
			const r = res();

			await controller.setEnabled(req({ body: { enabled: true } }), r);

			expect(r.status).toHaveBeenCalledWith(403);
			expect(spy).not.toHaveBeenCalled();
		});

		it('400 with a non-boolean enabled, even for a superadmin', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
			const r = res();

			await controller.setEnabled(req({ body: { enabled: 'sí' } }), r);

			expect(r.status).toHaveBeenCalledWith(400);
		});

		it('superadmin enables it and the service gets the acting user', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
			const spy = jest
				.spyOn(waBridgeService, 'setEnabled')
				.mockResolvedValue(undefined);
			const r = res();

			await controller.setEnabled(req({ body: { enabled: true } }), r);

			expect(spy).toHaveBeenCalledWith(RETREAT_ID, true, expect.objectContaining({ id: 'user-1' }));
			expect(r.json).toHaveBeenCalledWith({ ok: true, enabled: true });
		});

		it('403 for a non-superadmin in terminate-all', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
			const spy = jest.spyOn(waBridgeService, 'terminateAll');
			const r = res();

			await controller.terminateAll(req({ body: {} }), r);

			expect(r.status).toHaveBeenCalledWith(403);
			expect(spy).not.toHaveBeenCalled();
		});

		it('superadmin termina todo; default disable=true (D14)', async () => {
			jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
			const spy = jest
				.spyOn(waBridgeService, 'terminateAll')
				.mockResolvedValue({ terminated: 2 });
			const r = res();

			await controller.terminateAll(req({ body: {} }), r);

			expect(spy).toHaveBeenCalledWith(RETREAT_ID, expect.anything(), { disable: true });
			expect(r.json).toHaveBeenCalledWith({ ok: true, terminated: 2, disabled: true });
		});
	});
});
