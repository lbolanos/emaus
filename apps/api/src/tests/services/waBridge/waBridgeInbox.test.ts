/**
 * Integration tests (test DB) for the inbox v1.2/v1.3 service paths that only
 * QA used to cover: SQL conversation aggregate, unread counting, shared-phone
 * walkers, explicit teardown, resilient media batch + cache, retention and
 * "add as letter". wacli is mocked: no binary runs here.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../../test-setup';
import { TestDataFactory } from '../../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { WhatsappBridgeLink } from '@/entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '@/entities/whatsappInboxMessage.entity';
import { WhatsappInboxReadState } from '@/entities/whatsappInboxReadState.entity';
import { Letter } from '@/entities/letter.entity';
import { LetterAttachment } from '@/entities/letterAttachment.entity';
import { waBridgeService, sqliteUtcToDate } from '@/services/waBridge/waBridgeService';
import { waBridgeRetentionService } from '@/services/waBridge/waBridgeRetentionService';
import { createLetterFromWhatsapp, WaLetterError } from '@/services/waBridge/waLetterService';
import { imageService } from '@/services/imageService';
import { config } from '@/config';

const mockMediaDownload = jest.fn();
jest.mock('@/services/waBridge/wacliClient', () => {
	const actual = jest.requireActual('@/services/waBridge/wacliClient');
	return {
		...actual,
		mediaDownload: (...args: unknown[]) => mockMediaDownload(...args),
		wacliLogout: jest.fn().mockResolvedValue(undefined),
	};
});
jest.mock('@/realtime', () => ({
	emitInboxChanged: jest.fn(),
	emitLetterReceived: jest.fn(),
}));

const PHONE = '5511406977'; // national MX number
const JID = `521${PHONE}@s.whatsapp.net`;
const CHAT_PHONE = `521${PHONE}`;

/** 1x1 PNG. */
const PNG_1PX = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64',
);

describe('waBridge inbox (integration)', () => {
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
		mockMediaDownload.mockReset();
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-inbox-test-'));
		savedDataDir = config.waBridge.dataDir;
		config.waBridge.dataDir = tmpRoot;
	});
	afterEach(() => {
		config.waBridge.dataDir = savedDataDir;
		fs.rmSync(tmpRoot, { recursive: true, force: true });
		jest.restoreAllMocks();
	});

	async function seedLink(retreatId: string, userId: string, overrides: Partial<WhatsappBridgeLink> = {}) {
		const storePath = path.join(tmpRoot, `store-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(storePath, { recursive: true });
		return AppDataSource.getRepository(WhatsappBridgeLink).save(
			AppDataSource.getRepository(WhatsappBridgeLink).create({
				retreatId,
				userId,
				status: 'connected',
				storePath,
				...overrides,
			}),
		);
	}

	async function seedMessage(
		link: WhatsappBridgeLink,
		overrides: Partial<WhatsappInboxMessage> = {},
	): Promise<WhatsappInboxMessage> {
		const repo = AppDataSource.getRepository(WhatsappInboxMessage);
		return repo.save(
			repo.create({
				linkId: link.id,
				retreatId: link.retreatId,
				chatJid: JID,
				chatPhone: CHAT_PHONE,
				waMessageId: `MSG-${Math.random().toString(36).slice(2)}`,
				timestamp: new Date('2026-11-07T10:00:00Z'),
				fromMe: false,
				body: 'hola',
				messageType: 'text',
				...overrides,
			}),
		);
	}

	describe('sqliteUtcToDate', () => {
		it('parses the SQLite UTC string as UTC', () => {
			expect(sqliteUtcToDate('2026-11-07 20:28:53.000')?.toISOString()).toBe(
				'2026-11-07T20:28:53.000Z',
			);
			expect(sqliteUtcToDate('2026-11-07T20:28:53Z')?.toISOString()).toBe('2026-11-07T20:28:53.000Z');
			expect(sqliteUtcToDate(null)).toBeNull();
			expect(sqliteUtcToDate('no-date')).toBeNull();
		});
	});

	describe('walker phone index', () => {
		it('keeps every walker sharing a phone, most recent registration first', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const older = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Ana',
				cellPhone: PHONE,
				country: 'MX',
			});
			const newer = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Beto',
				cellPhone: PHONE,
				country: 'MX',
			});
			const rpRepo = AppDataSource.getRepository(RetreatParticipant);
			await rpRepo.update({ participantId: older.id }, { createdAt: new Date('2026-10-01T00:00:00Z') });
			await rpRepo.update({ participantId: newer.id }, { createdAt: new Date('2026-10-02T00:00:00Z') });

			const index = await waBridgeService.getWalkerDigitsIndex(retreat.id);
			expect(index.get(CHAT_PHONE)?.map((p) => p.firstName)).toEqual(['Beto', 'Ana']);
			const map = await waBridgeService.getWalkerDigitsMap(retreat.id);
			expect(map.get(CHAT_PHONE)?.firstName).toBe('Beto');
		});
	});

	describe('listConversations / countUnreadForUser', () => {
		it('counts only incoming as unread, reports the last reply author and awaitingReply', async () => {
			const staff = await TestDataFactory.createTestUser({ displayName: 'Leo' } as any);
			const reader = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Caminante',
				cellPhone: PHONE,
				country: 'MX',
			});
			const link = await seedLink(retreat.id, staff.id);
			await seedMessage(link, { timestamp: new Date('2026-11-07T10:00:00Z'), body: 'pregunta 1' });
			await seedMessage(link, {
				timestamp: new Date('2026-11-07T10:05:00Z'),
				fromMe: true,
				body: 'respuesta',
			});
			await seedMessage(link, { timestamp: new Date('2026-11-07T10:10:00Z'), body: 'pregunta 2' });
			// The reader saw up to the first question.
			await AppDataSource.getRepository(WhatsappInboxReadState).save({
				userId: reader.id,
				retreatId: retreat.id,
				chatJid: JID,
				lastSeenMessageTimestamp: new Date('2026-11-07T10:00:00Z'),
			} as any);

			const [conversation] = await waBridgeService.listConversations(retreat.id, reader.id);
			expect(conversation).toMatchObject({
				chatJid: JID,
				messageCount: 3,
				unreadCount: 1, // 'pregunta 2' only: the staff reply never counts
				lastMessagePreview: 'pregunta 2',
				lastMessageFromMe: false,
				lastReplyByName: 'Leo',
				awaitingReply: true,
				participantId: walker.id,
				participantFirstName: 'Caminante',
			});
			expect(conversation.lastMessageAt.toISOString()).toBe('2026-11-07T10:10:00.000Z');
			expect(await waBridgeService.countUnreadForUser(retreat.id, reader.id)).toBe(1);
			// A user with no read state: both incoming are unread, never the reply.
			expect(await waBridgeService.countUnreadForUser(retreat.id, staff.id)).toBe(2);
		});

		it('is not awaiting a reply once the staff answered last', async () => {
			const staff = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat();
			await TestDataFactory.createTestParticipant(retreat.id, { cellPhone: PHONE, country: 'MX' });
			const link = await seedLink(retreat.id, staff.id);
			await seedMessage(link, { timestamp: new Date('2026-11-07T10:00:00Z') });
			await seedMessage(link, { timestamp: new Date('2026-11-07T10:05:00Z'), fromMe: true });

			const [conversation] = await waBridgeService.listConversations(retreat.id, staff.id);
			expect(conversation.awaitingReply).toBe(false);
			expect(conversation.lastMessageFromMe).toBe(true);
		});
	});

	describe('teardownLink', () => {
		it('deletes the messages explicitly (no reliance on FK CASCADE) and the store', async () => {
			const staff = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat();
			const link = await seedLink(retreat.id, staff.id);
			await seedMessage(link);
			await seedMessage(link);
			await AppDataSource.getRepository(WhatsappInboxReadState).save({
				userId: staff.id,
				retreatId: retreat.id,
				chatJid: JID,
				lastSeenMessageTimestamp: new Date(),
			} as any);

			const result = await waBridgeService.teardownLink(link, { system: true });

			expect(result.messageCount).toBe(2);
			expect(await AppDataSource.getRepository(WhatsappInboxMessage).count()).toBe(0);
			expect(await AppDataSource.getRepository(WhatsappBridgeLink).count()).toBe(0);
			// Last link of the retreat: read states (walker JIDs) go too.
			expect(await AppDataSource.getRepository(WhatsappInboxReadState).count()).toBe(0);
			expect(fs.existsSync(link.storePath)).toBe(false);
		});
	});

	describe('getReceiptVariantsBatch', () => {
		beforeEach(() => {
			jest.spyOn(imageService, 'processWaReceiptVariants').mockResolvedValue({
				thumb: { buffer: Buffer.from('t'), contentType: 'image/webp', width: 1, height: 1 },
				large: { buffer: Buffer.from('l'), contentType: 'image/webp', width: 1, height: 1 },
			});
			mockMediaDownload.mockImplementation(
				async (_store: string, _jid: string, _id: string, outPath: string) => {
					fs.writeFileSync(outPath, PNG_1PX);
				},
			);
		});

		it('skips a dead link and a failing download without failing the batch', async () => {
			const staff = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat();
			const link = await seedLink(retreat.id, staff.id);
			const ok = await seedMessage(link, { messageType: 'image' });
			const broken = await seedMessage(link, { messageType: 'image' });
			const orphan = await seedMessage(link, { messageType: 'image' });
			orphan.linkId = '00000000-0000-4000-8000-000000000000';

			mockMediaDownload.mockImplementation(
				async (_store: string, _jid: string, waId: string, outPath: string) => {
					if (waId === broken.waMessageId) throw new Error('download failed with status code 403');
					fs.writeFileSync(outPath, PNG_1PX);
				},
			);
			jest.spyOn(console, 'error').mockImplementation(() => undefined);

			const map = await waBridgeService.getReceiptVariantsBatch([ok, broken, orphan]);
			expect(Array.from(map.keys())).toEqual([ok.id]);
		});

		it('serves cached variants without downloading again, and forgets them on teardown', async () => {
			const staff = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat();
			const link = await seedLink(retreat.id, staff.id);
			const image = await seedMessage(link, { messageType: 'image' });

			await waBridgeService.getReceiptVariantsBatch([image]);
			await waBridgeService.getReceiptVariantsBatch([image]);
			expect(mockMediaDownload).toHaveBeenCalledTimes(1);

			waBridgeService.forgetLinkMedia(link.id);
			await waBridgeService.getReceiptVariantsBatch([image]);
			expect(mockMediaDownload).toHaveBeenCalledTimes(2);
		});
	});

	describe('performRetention', () => {
		it('purges orphan messages and due links, store included', async () => {
			const staff = await TestDataFactory.createTestUser();
			const pastRetreat = await TestDataFactory.createTestRetreat({
				startDate: '2025-01-10',
				endDate: '2025-01-12',
			} as any);
			const link = await seedLink(pastRetreat.id, staff.id);
			await seedMessage(link);
			const repo = AppDataSource.getRepository(WhatsappInboxMessage);
			// Orphan left by a CASCADE that never ran (prod runs without FK
			// enforcement; the test DB enforces it, so switch it off to seed).
			await AppDataSource.query('PRAGMA foreign_keys = OFF');
			await repo.insert({
				linkId: '00000000-0000-4000-8000-000000000001',
				retreatId: pastRetreat.id,
				chatJid: JID,
				chatPhone: CHAT_PHONE,
				waMessageId: 'ORPHAN',
				timestamp: new Date(),
				fromMe: false,
				body: 'huérfano',
				messageType: 'text',
			});
			await AppDataSource.query('PRAGMA foreign_keys = ON');

			const result = await waBridgeRetentionService.performRetention();

			expect(result.purged).toBe(1);
			expect(await repo.count()).toBe(0);
			expect(fs.existsSync(link.storePath)).toBe(false);
		});
	});

	describe('createLetterFromWhatsapp', () => {
		it('creates an approved, printable letter once and links it to the message', async () => {
			const staff = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(retreat.id, {
				cellPhone: PHONE,
				country: 'MX',
			});
			const rp = await AppDataSource.getRepository(RetreatParticipant).findOneByOrFail({
				participantId: walker.id,
			});
			const link = await seedLink(retreat.id, staff.id);
			const message = await seedMessage(link, { body: 'Para mi hijo: te queremos' });

			const input = {
				message,
				retreatParticipantId: rp.id,
				bodyText: 'Para mi hijo: te queremos',
				senderName: 'Caminante',
				attachment: { fileName: 'foto.png', dataUrl: `data:image/png;base64,${PNG_1PX.toString('base64')}` },
				actorUserId: staff.id,
			};
			const first = await createLetterFromWhatsapp(input);
			const second = await createLetterFromWhatsapp(input);

			expect(first.duplicate).toBe(false);
			expect(second).toEqual({ letterId: first.letterId, duplicate: true });
			const letter = await AppDataSource.getRepository(Letter).findOneByOrFail({ id: first.letterId });
			expect(letter).toMatchObject({
				status: 'approved',
				reviewedById: staff.id,
				bodyText: 'Para mi hijo: te queremos',
				messageId: `whatsapp:${message.id}`,
				fromName: 'Caminante (WhatsApp)',
			});
			const attachments = await AppDataSource.getRepository(LetterAttachment).find({
				where: { letterId: first.letterId },
			});
			expect(attachments).toHaveLength(1);
			expect(attachments[0]).toMatchObject({ mimeType: 'image/png', isBrowserSafeImage: true });
			const updated = await AppDataSource.getRepository(WhatsappInboxMessage).findOneByOrFail({
				id: message.id,
			});
			expect(updated.letterId).toBe(first.letterId);
			expect(updated.letterAddedById).toBe(staff.id);
		});

		it('rejects a participant of another retreat and a non-image attachment', async () => {
			const staff = await TestDataFactory.createTestUser();
			const retreat = await TestDataFactory.createTestRetreat();
			const otherRetreat = await TestDataFactory.createTestRetreat();
			const stranger = await TestDataFactory.createTestParticipant(otherRetreat.id);
			const strangerRp = await AppDataSource.getRepository(RetreatParticipant).findOneByOrFail({
				participantId: stranger.id,
			});
			const walker = await TestDataFactory.createTestParticipant(retreat.id);
			const rp = await AppDataSource.getRepository(RetreatParticipant).findOneByOrFail({
				participantId: walker.id,
			});
			const link = await seedLink(retreat.id, staff.id);
			const message = await seedMessage(link);
			const base = { message, bodyText: 'hola', senderName: 'X', actorUserId: staff.id };

			await expect(
				createLetterFromWhatsapp({ ...base, retreatParticipantId: strangerRp.id }),
			).rejects.toBeInstanceOf(WaLetterError);
			await expect(
				createLetterFromWhatsapp({
					...base,
					retreatParticipantId: rp.id,
					attachment: { fileName: 'x.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' },
				}),
			).rejects.toThrow('Solo se imprimen imágenes');
			expect(await AppDataSource.getRepository(Letter).count()).toBe(0);
		});
	});
});
