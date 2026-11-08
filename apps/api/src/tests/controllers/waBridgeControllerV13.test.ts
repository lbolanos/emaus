/**
 * Controller contract for the inbox v1.2/v1.3 endpoints (test DB): batch
 * media scoped to the retreat and without raw wacli detail, payment link
 * guarded by retreat, raw-media type guard, add-as-letter validation, and the
 * participant history merge (permission-gated, offset-safe pagination).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { WaBridgeController } from '@/controllers/waBridgeController';
import { ParticipantCommunicationController } from '@/controllers/participantCommunicationController';
import { authorizationService } from '@/middleware/authorization';
import { WhatsappBridgeLink } from '@/entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '@/entities/whatsappInboxMessage.entity';
import { Payment } from '@/entities/payment.entity';
import { Participant } from '@/entities/participant.entity';
import { ParticipantCommunication } from '@/entities/participantCommunication.entity';
import { PaymentReceiptClaim } from '@/entities/paymentReceiptClaim.entity';
import { waBridgeService } from '@/services/waBridge/waBridgeService';
import { WacliError } from '@/services/waBridge/wacliClient';

jest.mock('@/realtime', () => ({
	emitInboxChanged: jest.fn(),
	emitLetterReceived: jest.fn(),
}));

const PHONE = '5511406977';
const JID = `521${PHONE}@s.whatsapp.net`;

describe('waBridge controller v1.3 (integration)', () => {
	const controller = new WaBridgeController();
	const res = () => {
		const r: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
		return r;
	};

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});

	async function seed() {
		const staff = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			cellPhone: PHONE,
			country: 'MX',
		});
		const storePath = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ctrl-'));
		const link = await AppDataSource.getRepository(WhatsappBridgeLink).save({
			retreatId: retreat.id,
			userId: staff.id,
			status: 'connected',
			storePath,
		} as any);
		const messageRepo = AppDataSource.getRepository(WhatsappInboxMessage);
		const message = (extra: Partial<WhatsappInboxMessage> = {}) =>
			messageRepo.save(
				messageRepo.create({
					linkId: link.id,
					retreatId: retreat.id,
					chatJid: JID,
					chatPhone: `521${PHONE}`,
					waMessageId: `M-${Math.random().toString(36).slice(2)}`,
					timestamp: new Date('2026-11-07T10:00:00Z'),
					fromMe: false,
					body: 'hola',
					messageType: 'text',
					...extra,
				}),
			);
		return { staff, retreat, walker, link, message };
	}

	describe('threadMedia', () => {
		it('only downloads images of the requested retreat', async () => {
			const { staff, retreat, message } = await seed();
			const image = await message({ messageType: 'image' });
			const text = await message();
			const spy = jest
				.spyOn(waBridgeService, 'getReceiptVariantsBatch')
				.mockResolvedValue(new Map([[image.id, { thumb: 't', large: 'l' }]]));
			const r = res();

			await controller.threadMedia(
				{
					params: { retreatId: retreat.id },
					body: { messageIds: [image.id, text.id] },
					user: { id: staff.id },
				} as any,
				r,
			);

			expect(spy.mock.calls[0][0].map((m) => m.id)).toEqual([image.id]);
			expect(r.json).toHaveBeenCalledWith({ media: { [image.id]: { thumb: 't', large: 'l' } }, skipped: 1 });
		});

		it('does not leak the raw wacli stderr to the client', async () => {
			const { staff, retreat, message } = await seed();
			const image = await message({ messageType: 'image' });
			jest
				.spyOn(waBridgeService, 'getReceiptVariantsBatch')
				.mockRejectedValue(new WacliError('boom', '/var/lib/emaus-wa-bridge/x pid=1'));
			jest.spyOn(console, 'error').mockImplementation(() => undefined);
			const r = res();

			await controller.threadMedia(
				{ params: { retreatId: retreat.id }, body: { messageIds: [image.id] }, user: { id: staff.id } } as any,
				r,
			);

			expect(r.status).toHaveBeenCalledWith(502);
			const payload = r.json.mock.calls[0][0];
			expect(payload).not.toHaveProperty('detail');
			expect(JSON.stringify(payload)).not.toContain('/var/lib');
		});
	});

	describe('linkPayment', () => {
		it('400 for a payment of another retreat; links a payment of the same retreat', async () => {
			const { staff, retreat, walker, message } = await seed();
			const otherRetreat = await TestDataFactory.createTestRetreat();
			const msg = await message({ messageType: 'image' });
			const paymentRepo = AppDataSource.getRepository(Payment);
			const foreign = await paymentRepo.save({
				participantId: walker.id,
				retreatId: otherRetreat.id,
				amount: 100,
				paymentDate: new Date('2026-11-07'),
				paymentMethod: 'cash',
			} as any);
			const own = await paymentRepo.save({
				participantId: walker.id,
				retreatId: retreat.id,
				amount: 100,
				paymentDate: new Date('2026-11-07'),
				paymentMethod: 'cash',
			} as any);

			const bad = res();
			await controller.linkPayment(
				{ params: { messageId: msg.id }, body: { paymentId: foreign.id }, user: { id: staff.id } } as any,
				bad,
			);
			expect(bad.status).toHaveBeenCalledWith(400);

			const ok = res();
			await controller.linkPayment(
				{ params: { messageId: msg.id }, body: { paymentId: own.id }, user: { id: staff.id } } as any,
				ok,
			);
			expect(ok.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, paymentId: own.id }));
			const updated = await AppDataSource.getRepository(WhatsappInboxMessage).findOneByOrFail({ id: msg.id });
			expect(updated.paymentId).toBe(own.id);
			expect(updated.paymentRegisteredById).toBe(staff.id);
		});
	});

	describe('linkPayment → «Comprobantes» (v1.5, D27)', () => {
		const link = async (staffId: string, messageId: string, paymentId: string) => {
			const r = res();
			await controller.linkPayment(
				{ params: { messageId }, body: { paymentId }, user: { id: staffId } } as any,
				r,
			);
			return r;
		};

		it('a payment with its receipt is listed as applied, once, with the WhatsApp number', async () => {
			const { staff, retreat, walker, message } = await seed();
			const msg = await message({ messageType: 'image', body: 'Ya quedó el depósito' });
			const payment = await AppDataSource.getRepository(Payment).save({
				participantId: walker.id,
				retreatId: retreat.id,
				amount: 4500,
				paymentDate: new Date('2026-11-08'),
				paymentMethod: 'transfer',
				referenceNumber: 'REF-77',
				receiptUrl: 'data:image/webp;base64,UklGR',
			} as any);

			await link(staff.id, msg.id, payment.id);
			await link(staff.id, msg.id, payment.id); // retried request

			const claims = await AppDataSource.getRepository(PaymentReceiptClaim).find();
			expect(claims).toHaveLength(1);
			expect(claims[0]).toMatchObject({
				retreatId: retreat.id,
				participantId: walker.id,
				status: 'attached',
				reference: 'REF-77',
				note: 'Ya quedó el depósito',
				senderContact: `WhatsApp +521${PHONE}`,
				photoUrl: 'data:image/webp;base64,UklGR',
				attachedPaymentId: payment.id,
				attachedById: staff.id,
			});
			expect(Number(claims[0].amountClaimed)).toBe(4500);
		});

		it('a payment without a photo adds nothing to «Comprobantes»', async () => {
			const { staff, retreat, walker, message } = await seed();
			const msg = await message({ messageType: 'image' });
			const payment = await AppDataSource.getRepository(Payment).save({
				participantId: walker.id,
				retreatId: retreat.id,
				amount: 100,
				paymentDate: new Date('2026-11-08'),
				paymentMethod: 'cash',
			} as any);
			const r = await link(staff.id, msg.id, payment.id);
			expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
			expect(await AppDataSource.getRepository(PaymentReceiptClaim).count()).toBe(0);
		});

		it("an emergency contact's number never reaches «Comprobantes»", async () => {
			const { staff, retreat, walker, link: waLink } = await seed();
			await AppDataSource.getRepository(Participant).update(
				{ id: walker.id },
				{ emergencyContact1CellPhone: '5522223333' },
			);
			const repo = AppDataSource.getRepository(WhatsappInboxMessage);
			const msg = await repo.save(
				repo.create({
					linkId: waLink.id,
					retreatId: retreat.id,
					chatJid: '5215522223333@s.whatsapp.net',
					chatPhone: '5215522223333',
					waMessageId: 'EC-RECEIPT',
					timestamp: new Date('2026-11-08T10:00:00Z'),
					fromMe: false,
					body: null,
					messageType: 'image',
				}),
			);
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
			const payment = await AppDataSource.getRepository(Payment).save({
				participantId: walker.id,
				retreatId: retreat.id,
				amount: 200,
				paymentDate: new Date('2026-11-08'),
				paymentMethod: 'transfer',
				receiptUrl: 'data:image/webp;base64,UklGR',
			} as any);
			await link(staff.id, msg.id, payment.id);
			const claim = await AppDataSource.getRepository(PaymentReceiptClaim).findOneByOrFail({
				attachedPaymentId: payment.id,
			});
			expect(claim.senderContact).toBe('WhatsApp (contacto de emergencia)');
		});
	});

	describe('rawMedia / addAsLetter guards', () => {
		it('rawMedia refuses a text message', async () => {
			const { staff, message } = await seed();
			const msg = await message();
			const r = res();
			await controller.rawMedia({ params: { messageId: msg.id }, user: { id: staff.id } } as any, r);
			expect(r.status).toHaveBeenCalledWith(400);
		});

		it('addAsLetter asks for the recipient participant', async () => {
			const { staff, message } = await seed();
			const msg = await message();
			const r = res();
			await controller.addAsLetter(
				{ params: { messageId: msg.id }, body: { bodyText: 'x' }, user: { id: staff.id } } as any,
				r,
			);
			expect(r.status).toHaveBeenCalledWith(400);
		});
	});

	describe('participant history merge', () => {
		async function seedHistory() {
			const ctx = await seed();
			// 3 sent (participant_communications) + 3 received (inbox), interleaved.
			const commRepo = AppDataSource.getRepository(ParticipantCommunication);
			for (const minute of [1, 3, 5]) {
				await commRepo.save({
					participantId: ctx.walker.id,
					retreatId: ctx.retreat.id,
					scope: 'retreat',
					messageType: 'whatsapp',
					recipientContact: PHONE,
					messageContent: `enviado ${minute}`,
					sentAt: new Date(`2026-11-07T10:0${minute}:00Z`),
				} as any);
			}
			for (const minute of [2, 4, 6]) {
				await ctx.message({ body: `recibido ${minute}`, timestamp: new Date(`2026-11-07T10:0${minute}:00Z`) });
			}
			return ctx;
		}

		const call = async (ctx: Awaited<ReturnType<typeof seed>>, query: Record<string, unknown>) => {
			const r = res();
			// Built after setupTestDatabase: the controller binds its repositories
			// at construction time.
			await new ParticipantCommunicationController().getParticipantCommunications(
				{
					params: { participantId: ctx.walker.id },
					query: { retreatId: ctx.retreat.id, ...query },
					user: { id: ctx.staff.id },
				} as any,
				r,
			);
			return r.json.mock.calls[0][0] as { communications: Array<{ messageContent: string }>; total: number };
		};

		it('merges received messages only for whatsappInbox:read, and pages without gaps', async () => {
			const ctx = await seedHistory();
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);

			const page1 = await call(ctx, { limit: 2, offset: 0 });
			const page2 = await call(ctx, { limit: 2, offset: 2 });
			const page3 = await call(ctx, { limit: 2, offset: 4 });
			expect(page1.total).toBe(6);
			expect([...page1.communications, ...page2.communications, ...page3.communications].map((c) => c.messageContent)).toEqual([
				'recibido 6',
				'enviado 5',
				'recibido 4',
				'enviado 3',
				'recibido 2',
				'enviado 1',
			]);
		});

		it('hides received messages without whatsappInbox:read', async () => {
			const ctx = await seedHistory();
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);

			const page = await call(ctx, { limit: 10, offset: 0 });
			expect(page.total).toBe(3);
			expect(page.communications.every((c) => c.messageContent.startsWith('enviado'))).toBe(true);
		});
	});
});
