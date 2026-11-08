/**
 * Inbox v1.4 (specs/whatsapp-inbox D22): chats of the walkers' emergency
 * contacts. Sender index (slots, walker wins, shared contact), visibility
 * gated on participant:health in list/badge/search/endpoints/history, and the
 * poller (whitelist, backfill of chats new to a link, toast without the
 * contact's name). Test DB; wacli is mocked.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../../test-setup';
import { TestDataFactory } from '../../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Retreat } from '@/entities/retreat.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { WhatsappBridgeLink } from '@/entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '@/entities/whatsappInboxMessage.entity';
import { Letter } from '@/entities/letter.entity';
import { authorizationService } from '@/middleware/authorization';
import { WaBridgeController } from '@/controllers/waBridgeController';
import { ParticipantCommunicationController } from '@/controllers/participantCommunicationController';
import { waBridgeService, senderDisplayName } from '@/services/waBridge/waBridgeService';
import { WaBridgePoller } from '@/services/waBridge/waBridgePoller';
import { emitInboxChanged } from '@/realtime';
import { config } from '@/config';

const mockListChats = jest.fn();
const mockListMessages = jest.fn();
jest.mock('@/services/waBridge/wacliClient', () => {
	const actual = jest.requireActual('@/services/waBridge/wacliClient');
	return {
		...actual,
		listChats: (...args: unknown[]) => mockListChats(...args),
		listMessages: (...args: unknown[]) => mockListMessages(...args),
	};
});
jest.mock('@/realtime', () => ({
	emitInboxChanged: jest.fn(),
	emitLetterReceived: jest.fn(),
}));

// National MX numbers; WhatsApp JIDs carry 521 + national.
const WALKER_PHONE = '5511406977';
const MOM_PHONE = '5522223333';
const UNCLE_HOME = '5544445555';
const WALKER_CHAT = `521${WALKER_PHONE}`;
const MOM_CHAT = `521${MOM_PHONE}`;
const UNCLE_CHAT = `521${UNCLE_HOME}`;
const jid = (digits: string) => `${digits}@s.whatsapp.net`;

/** hasPermission mock: every permission except the ones listed. */
function grantAllBut(...denied: string[]) {
	jest
		.spyOn(authorizationService, 'hasPermission')
		.mockImplementation(async (_userId: string, permission: string) => !denied.includes(permission));
}

describe('waBridge v1.4 — emergency contacts (integration)', () => {
	let tmpRoot: string;
	let savedDataDir: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		mockListChats.mockReset();
		mockListMessages.mockReset();
		(emitInboxChanged as jest.Mock).mockReset();
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ec-test-'));
		savedDataDir = config.waBridge.dataDir;
		config.waBridge.dataDir = tmpRoot;
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
	});
	afterEach(() => {
		config.waBridge.dataDir = savedDataDir;
		fs.rmSync(tmpRoot, { recursive: true, force: true });
		jest.restoreAllMocks();
	});

	/** Juan (walker) with Mamá — María on slot 1 and Tío — Pedro (home phone) on slot 2. */
	async function seed() {
		const staff = await TestDataFactory.createTestUser({ displayName: 'Leo' } as any);
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'Juan',
			lastName: 'Pérez',
			cellPhone: WALKER_PHONE,
			country: 'MX',
			emergencyContact1Name: 'María',
			emergencyContact1Relation: 'Mamá',
			emergencyContact1CellPhone: MOM_PHONE,
			emergencyContact2Name: 'Pedro',
			emergencyContact2Relation: 'Tío',
			emergencyContact2CellPhone: null as any,
			emergencyContact2HomePhone: UNCLE_HOME,
		});
		const storePath = path.join(tmpRoot, `store-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(storePath, { recursive: true });
		const link = await AppDataSource.getRepository(WhatsappBridgeLink).save(
			AppDataSource.getRepository(WhatsappBridgeLink).create({
				retreatId: retreat.id,
				userId: staff.id,
				status: 'connected',
				storePath,
			}),
		);
		const repo = AppDataSource.getRepository(WhatsappInboxMessage);
		const message = (chatPhone: string, extra: Partial<WhatsappInboxMessage> = {}) =>
			repo.save(
				repo.create({
					linkId: link.id,
					retreatId: retreat.id,
					chatJid: jid(chatPhone),
					chatPhone,
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

	describe('getSenderIndex', () => {
		it('indexes the walker and both contact slots (cell and home phones)', async () => {
			const { retreat, walker } = await seed();
			const index = await waBridgeService.getSenderIndex(retreat.id);

			expect(index.get(WALKER_CHAT)?.walkers.map((p) => p.id)).toEqual([walker.id]);
			expect(index.get(MOM_CHAT)).toMatchObject({
				walkers: [],
				emergencyFor: [{ slot: 1, contactName: 'María', relation: 'Mamá' }],
			});
			expect(index.get(UNCLE_CHAT)?.emergencyFor[0]).toMatchObject({ slot: 2, contactName: 'Pedro' });
			expect(senderDisplayName(index.get(MOM_CHAT), '?')).toBe('Mamá — María (contacto de Juan Pérez)');
		});

		it('a walker match wins, and a shared contact lists every walker', async () => {
			const { retreat, walker } = await seed();
			// Juan's mother is also a walker of the retreat → a walker chat.
			await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'María',
				cellPhone: MOM_PHONE,
				country: 'MX',
			});
			// Juan's sister lists the same uncle.
			const sister = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Ana',
				lastName: 'Pérez',
				country: 'MX',
				emergencyContact1Name: 'Pedro',
				emergencyContact1Relation: 'Tío',
				emergencyContact1CellPhone: UNCLE_HOME,
			});

			const index = await waBridgeService.getSenderIndex(retreat.id);
			const mom = index.get(MOM_CHAT)!;
			expect(mom.walkers.map((p) => p.firstName)).toEqual(['María']);
			expect(waBridgeService.isChatVisible(mom, false)).toBe(true);
			expect(index.get(UNCLE_CHAT)?.emergencyFor.map((e) => e.participant.id).sort()).toEqual(
				[walker.id, sister.id].sort(),
			);
		});

		it('ignores cancelled walkers and their contacts', async () => {
			const { retreat, walker } = await seed();
			await AppDataSource.getRepository(RetreatParticipant).update(
				{ participantId: walker.id },
				{ isCancelled: true },
			);
			const index = await waBridgeService.getSenderIndex(retreat.id);
			expect(index.has(WALKER_CHAT)).toBe(false);
			expect(index.has(MOM_CHAT)).toBe(false);
		});
	});

	describe('listConversations / countUnreadForUser / searchMessages', () => {
		it('labels the contact chat and groups it under the walker', async () => {
			const { staff, retreat, walker, message } = await seed();
			await message(WALKER_CHAT);
			await message(MOM_CHAT, { body: 'carta para Juan' });

			const conversations = await waBridgeService.listConversations(retreat.id, staff.id, true);
			const mom = conversations.find((c) => c.chatPhone === MOM_CHAT);
			expect(mom).toMatchObject({
				senderKind: 'emergency_contact',
				contact: { name: 'María', relation: 'Mamá', slot: 1 },
				forWalkers: [{ participantId: walker.id, firstName: 'Juan', lastName: 'Pérez' }],
				participantId: walker.id,
				sharedWith: [],
			});
			const own = conversations.find((c) => c.chatPhone === WALKER_CHAT);
			expect(own).toMatchObject({ senderKind: 'walker', contact: null, participantId: walker.id });
		});

		it('hides contact chats (list, badge, search) without participant:health', async () => {
			const { staff, retreat, message } = await seed();
			await message(WALKER_CHAT, { body: 'pago listo' });
			await message(MOM_CHAT, { body: 'pago de la carta' });

			const hidden = await waBridgeService.listConversations(retreat.id, staff.id, false);
			expect(hidden.map((c) => c.chatPhone)).toEqual([WALKER_CHAT]);
			expect(await waBridgeService.countUnreadForUser(retreat.id, staff.id, false)).toBe(1);
			expect(await waBridgeService.countUnreadForUser(retreat.id, staff.id, true)).toBe(2);

			const blind = await waBridgeService.searchMessages(retreat.id, 'pago', {
				canSeeEmergencyContacts: false,
			});
			expect(blind.map((r) => r.chatPhone)).toEqual([WALKER_CHAT]);
			const full = await waBridgeService.searchMessages(retreat.id, 'pago', {
				canSeeEmergencyContacts: true,
			});
			expect(full).toHaveLength(2);
		});

		it('search by the contact name or the walker name finds the contact chat', async () => {
			const { retreat, message } = await seed();
			await message(MOM_CHAT, { body: 'buenas tardes' });

			const byContact = await waBridgeService.searchMessages(retreat.id, 'maria', {
				canSeeEmergencyContacts: true,
			});
			expect(byContact.map((r) => r.chatPhone)).toEqual([MOM_CHAT]);
			const byWalker = await waBridgeService.searchMessages(retreat.id, 'juan perez', {
				canSeeEmergencyContacts: true,
			});
			expect(byWalker.map((r) => r.chatPhone)).toEqual([MOM_CHAT]);
		});

		it('a chat that no longer resolves to anyone is hidden for everybody', async () => {
			const { staff, retreat, message } = await seed();
			await message('5215599990000');
			expect(await waBridgeService.listConversations(retreat.id, staff.id, true)).toEqual([]);
			expect(await waBridgeService.countUnreadForUser(retreat.id, staff.id, true)).toBe(0);
		});
	});

	describe('controller gate', () => {
		const controller = new WaBridgeController();
		const res = () => {
			const r: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
			return r;
		};

		it('403 on a contact thread, receipt and letter without participant:health', async () => {
			const { staff, retreat, walker, message } = await seed();
			const msg = await message(MOM_CHAT, { messageType: 'image' });
			grantAllBut('participant:health');

			const thread = res();
			await controller.messages(
				{ params: { retreatId: retreat.id }, query: { chatJid: jid(MOM_CHAT) }, user: { id: staff.id } } as any,
				thread,
			);
			expect(thread.status).toHaveBeenCalledWith(403);

			const receipt = res();
			await controller.receiptDataUrl({ params: { messageId: msg.id }, user: { id: staff.id } } as any, receipt);
			expect(receipt.status).toHaveBeenCalledWith(403);

			const letter = res();
			await controller.addAsLetter(
				{
					params: { messageId: msg.id },
					body: { participantId: walker.id, bodyText: 'x' },
					user: { id: staff.id },
				} as any,
				letter,
			);
			expect(letter.status).toHaveBeenCalledWith(403);
			expect(await AppDataSource.getRepository(Letter).count()).toBe(0);
		});

		it('with participant:health the letter names the contact and the walker', async () => {
			const { staff, retreat, walker, message } = await seed();
			const msg = await message(MOM_CHAT, { body: 'Hijo, te queremos' });
			grantAllBut();

			const thread = res();
			await controller.messages(
				{ params: { retreatId: retreat.id }, query: { chatJid: jid(MOM_CHAT) }, user: { id: staff.id } } as any,
				thread,
			);
			expect(thread.status).not.toHaveBeenCalled();
			expect(thread.json.mock.calls[0][0].messages).toHaveLength(1);

			const letter = res();
			await controller.addAsLetter(
				{
					params: { messageId: msg.id },
					body: { participantId: walker.id, bodyText: 'Hijo, te queremos' },
					user: { id: staff.id },
				} as any,
				letter,
			);
			expect(letter.status).toHaveBeenCalledWith(201);
			const created = await AppDataSource.getRepository(Letter).findOneOrFail({ where: {} });
			expect(created.fromName).toBe('Mamá — María (contacto de Juan Pérez) (WhatsApp)');
		});

		it('search results carry who wrote them', async () => {
			const { staff, retreat, walker, message } = await seed();
			await message(MOM_CHAT, { body: 'pago de Juan' });
			grantAllBut();
			const r = res();
			await controller.search(
				{ params: { retreatId: retreat.id }, query: { q: 'pago' }, user: { id: staff.id } } as any,
				r,
			);
			expect(r.json.mock.calls[0][0].results[0]).toMatchObject({
				senderKind: 'emergency_contact',
				contactName: 'María',
				contactRelation: 'Mamá',
				participantId: walker.id,
				participantFirstName: 'Juan',
			});
		});
	});

	describe('participant history', () => {
		const history = async (ctx: Awaited<ReturnType<typeof seed>>) => {
			const r: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
			// Built after setupTestDatabase: it binds repositories at construction.
			await new ParticipantCommunicationController().getParticipantCommunications(
				{
					params: { participantId: ctx.walker.id },
					query: { retreatId: ctx.retreat.id, limit: 20, offset: 0 },
					user: { id: ctx.staff.id },
				} as any,
				r,
			);
			return r.json.mock.calls[0][0].communications as Array<Record<string, unknown>>;
		};

		it('labels the contact messages, and leaves them out without participant:health', async () => {
			const ctx = await seed();
			await ctx.message(WALKER_CHAT, { body: 'del caminante', timestamp: new Date('2026-11-07T10:00:00Z') });
			await ctx.message(UNCLE_CHAT, { body: 'del tío', timestamp: new Date('2026-11-07T11:00:00Z') });

			grantAllBut();
			const full = await history(ctx);
			expect(full.map((c) => [c.messageContent, c.senderKind, c.contactName])).toEqual([
				['del tío', 'emergency_contact', 'Pedro'],
				['del caminante', 'walker', null],
			]);

			jest.restoreAllMocks();
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
			grantAllBut('participant:health');
			const limited = await history(ctx);
			expect(limited.map((c) => c.messageContent)).toEqual(['del caminante']);
		});
	});

	describe('poller', () => {
		let savedEnabled: boolean;
		beforeEach(() => {
			savedEnabled = config.waBridge.enabled;
			config.waBridge.enabled = true;
			jest.spyOn(waBridgeService, 'respawnFromDb').mockResolvedValue(undefined as any);
		});
		afterEach(() => {
			config.waBridge.enabled = savedEnabled;
		});

		const wacliMessage = (id: string, ts: string, text: string, fromMe = false) => ({
			MsgID: id,
			Timestamp: ts,
			FromMe: fromMe,
			Text: text,
			MediaType: '',
		});

		async function enable(retreatId: string) {
			await AppDataSource.getRepository(Retreat).update({ id: retreatId }, { whatsappInboxEnabled: true });
		}

		it('backfills a contact chat new to the link (newest first) without a toast for it', async () => {
			const { retreat, link, message } = await seed();
			await enable(retreat.id);
			await message(WALKER_CHAT); // the walker chat is already stored
			await AppDataSource.getRepository(WhatsappBridgeLink).update(
				{ id: link.id },
				{ lastSyncAt: new Date('2026-11-07T11:00:00Z') },
			);
			mockListChats.mockResolvedValue([
				{ jid: jid(WALKER_CHAT) },
				{ jid: jid(MOM_CHAT) },
				{ jid: jid('5215500001111') }, // stranger
				{ jid: '120363423125142089@g.us' },
			]);
			mockListMessages.mockImplementation(async (_store: string, chatJid: string) =>
				chatJid === jid(MOM_CHAT)
					? [
							wacliMessage('MOM-2', '2026-11-06T09:00:00Z', 'la carta'),
							wacliMessage('MOM-1', '2026-11-01T09:00:00Z', 'hola'),
						]
					: [wacliMessage('WALK-NEW', '2026-11-07T11:30:00Z', 'ya pagué')],
			);

			await new WaBridgePoller().pollAll();

			const readChats = mockListMessages.mock.calls.map((call) => call[1]);
			expect(readChats).not.toContain(jid('5215500001111'));
			const momCall = mockListMessages.mock.calls.find((call) => call[1] === jid(MOM_CHAT));
			expect(momCall?.[2]).toMatchObject({ newestFirst: true, limit: 500 });
			const stored = await AppDataSource.getRepository(WhatsappInboxMessage).find({
				where: { chatPhone: MOM_CHAT },
			});
			expect(stored.map((m) => m.waMessageId).sort()).toEqual(['MOM-1', 'MOM-2']);
			expect(emitInboxChanged).toHaveBeenCalledWith({
				retreatId: retreat.id,
				newCount: 1,
				senderName: 'Juan Pérez',
				preview: 'ya pagué',
				contactCount: 0,
			});
		});

		it('a new contact message is a bare count, never the contact name', async () => {
			const { retreat, link, message } = await seed();
			await enable(retreat.id);
			await message(MOM_CHAT, { waMessageId: 'MOM-OLD' });
			await AppDataSource.getRepository(WhatsappBridgeLink).update(
				{ id: link.id },
				{ lastSyncAt: new Date('2026-11-07T11:00:00Z') },
			);
			mockListChats.mockResolvedValue([{ jid: jid(MOM_CHAT) }]);
			mockListMessages.mockResolvedValue([wacliMessage('MOM-NEW', '2026-11-07T11:30:00Z', 'aquí el pago')]);

			await new WaBridgePoller().pollAll();

			// Already stored for this link: incremental read, not a backfill.
			expect(mockListMessages.mock.calls[0][2].newestFirst).toBeFalsy();
			expect(emitInboxChanged).toHaveBeenCalledWith({
				retreatId: retreat.id,
				newCount: 0,
				senderName: null,
				preview: null,
				contactCount: 1,
			});
		});
	});
});
