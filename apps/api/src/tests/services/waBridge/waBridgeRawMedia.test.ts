/**
 * Inbox v1.5 (specs/whatsapp-inbox D26): what the inbox does with a file a
 * walker or contact sends. The type comes from the bytes (letters'
 * classifier), never from the sender's MIME; macros and risky types are
 * refused; the response says how the browser may show it. Also "add as
 * letter" keeping the original document. Test DB; wacli is mocked.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../../test-setup';
import { TestDataFactory } from '../../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { WhatsappBridgeLink } from '@/entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '@/entities/whatsappInboxMessage.entity';
import { Letter } from '@/entities/letter.entity';
import { LetterAttachment } from '@/entities/letterAttachment.entity';
import { authorizationService } from '@/middleware/authorization';
import { WaBridgeController } from '@/controllers/waBridgeController';
import { classifyRawMedia, WaMediaRejectedError } from '@/services/waBridge/waBridgeService';
import { config } from '@/config';

const mockMediaDownload = jest.fn();
jest.mock('@/services/waBridge/wacliClient', () => {
	const actual = jest.requireActual('@/services/waBridge/wacliClient');
	return { ...actual, mediaDownload: (...args: unknown[]) => mockMediaDownload(...args) };
});
jest.mock('@/realtime', () => ({
	emitInboxChanged: jest.fn(),
	emitLetterReceived: jest.fn(),
}));

const PHONE = '5511406977';
const CHAT_PHONE = `521${PHONE}`;
const JID = `${CHAT_PHONE}@s.whatsapp.net`;

const DOCX = Buffer.concat([
	Buffer.from([0x50, 0x4b, 0x03, 0x04]),
	Buffer.from('....[Content_Types].xml....word/document.xml....'),
]);
const DOCX_WITH_MACROS = Buffer.concat([DOCX, Buffer.from('word/vbaProject.bin')]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const HTML = Buffer.from('<html><script>fetch("/api/users")</script></html>');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)]);

function message(extra: Partial<WhatsappInboxMessage>): WhatsappInboxMessage {
	return {
		id: '0b1c2d3e-0000-4000-8000-000000000000',
		messageType: 'document',
		mediaMime: null,
		mediaFileName: null,
		...extra,
	} as WhatsappInboxMessage;
}

describe('classifyRawMedia (v1.5)', () => {
	it('documents: verified type and how to show them', () => {
		expect(classifyRawMedia(message({ mediaFileName: 'carta.pdf' }), PDF)).toMatchObject({
			mime: 'application/pdf',
			previewKind: 'pdf',
			fileName: 'carta.pdf',
		});
		expect(classifyRawMedia(message({ mediaFileName: 'Carta para Juan.docx' }), DOCX)).toMatchObject({
			mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			previewKind: 'download',
		});
		expect(classifyRawMedia(message({ mediaFileName: 'carta.txt' }), Buffer.from('Querido Juan'))).toMatchObject({
			mime: 'text/plain',
			previewKind: 'text',
		});
		// A photo sent "as document" is still an image.
		expect(classifyRawMedia(message({ mediaFileName: 'foto.jpg' }), JPEG)).toMatchObject({
			mime: 'image/jpeg',
			previewKind: 'image',
		});
	});

	it('ignores the sender MIME: HTML disguised as a PDF is refused', () => {
		const disguised = message({ mediaFileName: 'carta.pdf', mediaMime: 'application/pdf' });
		expect(() => classifyRawMedia(disguised, HTML)).toThrow(WaMediaRejectedError);
		const declaredHtml = message({ mediaFileName: 'carta.html', mediaMime: 'text/html' });
		expect(() => classifyRawMedia(declaredHtml, HTML)).toThrow(/por seguridad/);
	});

	it('refuses documents with macros', () => {
		const byName = () => classifyRawMedia(message({ mediaFileName: 'carta.docm' }), DOCX);
		expect(byName).toThrow(expect.objectContaining({ reason: 'macros' }));
		const byContent = () => classifyRawMedia(message({ mediaFileName: 'carta.docx' }), DOCX_WITH_MACROS);
		expect(byContent).toThrow(expect.objectContaining({ reason: 'macros' }));
	});

	it('a nameless document takes the extension from the declared type, verified by content', () => {
		const nameless = message({
			mediaMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		});
		expect(classifyRawMedia(nameless, DOCX)).toMatchObject({ previewKind: 'download', fileName: 'whatsapp-0b1c2d3e.docx' });
		expect(() => classifyRawMedia(nameless, HTML)).toThrow(WaMediaRejectedError);
	});

	it('video must be mp4/mov; voice notes keep an audio type', () => {
		expect(classifyRawMedia(message({ messageType: 'video' }), MP4)).toMatchObject({
			mime: 'video/mp4',
			previewKind: 'video',
		});
		expect(() => classifyRawMedia(message({ messageType: 'video' }), HTML)).toThrow(WaMediaRejectedError);
		expect(
			classifyRawMedia(message({ messageType: 'audio', mediaMime: 'audio/ogg; codecs=opus' }), Buffer.from('OggS')),
		).toMatchObject({ mime: 'audio/ogg', previewKind: 'audio' });
		// A voice note claiming to be HTML still only ever plays in <audio>.
		expect(classifyRawMedia(message({ messageType: 'audio', mediaMime: 'text/html' }), HTML).mime).toBe('audio/ogg');
	});
});

describe('raw media endpoint and letters with documents (integration)', () => {
	const controller = new WaBridgeController();
	let tmpRoot: string;
	let savedDataDir: string;
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
		mockMediaDownload.mockReset();
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-raw-test-'));
		savedDataDir = config.waBridge.dataDir;
		config.waBridge.dataDir = tmpRoot;
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
	});
	afterEach(() => {
		config.waBridge.dataDir = savedDataDir;
		fs.rmSync(tmpRoot, { recursive: true, force: true });
		jest.restoreAllMocks();
	});

	async function seed(file: Buffer, extra: Partial<WhatsappInboxMessage>) {
		const staff = await TestDataFactory.createTestUser();
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, { cellPhone: PHONE, country: 'MX' });
		const storePath = path.join(tmpRoot, 'store');
		fs.mkdirSync(storePath, { recursive: true });
		const link = await AppDataSource.getRepository(WhatsappBridgeLink).save({
			retreatId: retreat.id,
			userId: staff.id,
			status: 'connected',
			storePath,
		} as any);
		const repo = AppDataSource.getRepository(WhatsappInboxMessage);
		const msg = await repo.save(
			repo.create({
				linkId: link.id,
				retreatId: retreat.id,
				chatJid: JID,
				chatPhone: CHAT_PHONE,
				waMessageId: `M-${Math.random().toString(36).slice(2)}`,
				timestamp: new Date('2026-11-08T10:00:00Z'),
				fromMe: false,
				body: null,
				messageType: 'document',
				...extra,
			}),
		);
		mockMediaDownload.mockImplementation(async (_store: string, _jid: string, _id: string, out: string) => {
			fs.writeFileSync(out, file);
		});
		return { staff, walker, msg };
	}

	it('serves a Word document as a download with its verified type', async () => {
		const { staff, msg } = await seed(DOCX, { mediaFileName: 'Carta.docx', mediaMime: 'text/html' });
		const r = res();
		await controller.rawMedia({ params: { messageId: msg.id }, user: { id: staff.id } } as any, r);
		expect(r.status).not.toHaveBeenCalled();
		const payload = r.json.mock.calls[0][0];
		expect(payload).toMatchObject({
			mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			fileName: 'Carta.docx',
			previewKind: 'download',
		});
		expect(payload.dataUrl.startsWith('data:application/vnd.openxmlformats')).toBe(true);
	});

	it('415 for HTML disguised as a PDF, 413 over the size cap', async () => {
		const disguised = await seed(HTML, { mediaFileName: 'carta.pdf', mediaMime: 'application/pdf' });
		const r = res();
		await controller.rawMedia({ params: { messageId: disguised.msg.id }, user: { id: disguised.staff.id } } as any, r);
		expect(r.status).toHaveBeenCalledWith(415);
		expect(r.json.mock.calls[0][0]).toMatchObject({ reason: 'unsupported' });

		await clearTestData();
		const big = await seed(Buffer.alloc(11 * 1024 * 1024, 0x20), { mediaFileName: 'grande.txt' });
		const r2 = res();
		await controller.rawMedia({ params: { messageId: big.msg.id }, user: { id: big.staff.id } } as any, r2);
		expect(r2.status).toHaveBeenCalledWith(413);
	});

	it('plays a video', async () => {
		const { staff, msg } = await seed(MP4, { messageType: 'video', mediaMime: 'video/mp4' });
		const r = res();
		await controller.rawMedia({ params: { messageId: msg.id }, user: { id: staff.id } } as any, r);
		expect(r.json.mock.calls[0][0]).toMatchObject({ mime: 'video/mp4', previewKind: 'video' });
	});

	it('"add as letter" keeps the original document, not printable', async () => {
		const { staff, walker, msg } = await seed(DOCX, { mediaFileName: 'Carta para Juan.docx' });
		const r = res();
		await controller.addAsLetter(
			{
				params: { messageId: msg.id },
				body: { participantId: walker.id, bodyText: 'Carta en el documento adjunto', includeDocument: true },
				user: { id: staff.id },
			} as any,
			r,
		);
		expect(r.status).toHaveBeenCalledWith(201);
		const letter = await AppDataSource.getRepository(Letter).findOneOrFail({ where: {} });
		const attachments = await AppDataSource.getRepository(LetterAttachment).find({ where: { letterId: letter.id } });
		expect(attachments).toHaveLength(1);
		expect(attachments[0]).toMatchObject({
			fileName: 'Carta para Juan.docx',
			mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			isBrowserSafeImage: false,
		});
	});

	it('"add as letter" refuses a document with macros and creates nothing', async () => {
		const { staff, walker, msg } = await seed(DOCX_WITH_MACROS, { mediaFileName: 'carta.docx' });
		const r = res();
		await controller.addAsLetter(
			{
				params: { messageId: msg.id },
				body: { participantId: walker.id, bodyText: 'x', includeDocument: true },
				user: { id: staff.id },
			} as any,
			r,
		);
		expect(r.status).toHaveBeenCalledWith(415);
		expect(await AppDataSource.getRepository(Letter).count()).toBe(0);
	});
});
