/**
 * Test del webhook de cartas (specs/letters-email T12): contrato Worker → API
 * completo vía supertest + testApp (ruta pública real, con exención CSRF y
 * limiter del wiring de routes/index).
 *
 * Cubre: 200 accepted (carta pending + adjuntos clasificados por magic bytes),
 * 200 duplicate (dedupe por messageId), 404 unknown_mailbox / mailbox_disabled,
 * 401 secret inválido, 413 topes (llamada al handler directo: el parser de
 * testApp es 2mb y cortaría el payload grande antes de llegar al controlador),
 * y html→text sin tags (el HTML del email nunca se persiste, D10).
 *
 * El wiring (exención CSRF, montaje antes de letterRoutes) se verifica
 * source-level, patrón de santisimoInviteRoutes.simple.test.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';

jest.mock('@/config/env', () => ({
	config: {
		env: 'test',
		avatar: { storage: 'base64' },
		aws: {
			s3BucketName: 'test-bucket',
			region: 'us-east-1',
			useIAMRole: false,
			accessKeyId: '',
			secretAccessKey: '',
			s3Prefix: 'avatars/',
			s3Prefixes: {
				avatars: 'avatars/',
				retreatMemories: 'retreat-memories/',
				documents: 'documents/',
				publicAssets: 'public-assets/',
				letters: 'letters/',
			},
		},
		letters: { webhookSecret: 'test-letter-webhook-secret', mailboxDomain: 'emaus.cc' },
	},
}));

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createTestApp, cleanupTestApp } from '../test-utils/testApp';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { Letter } from '@/entities/letter.entity';
import { LetterAttachment } from '@/entities/letterAttachment.entity';
import { activateMailboxesForRetreat } from '@/services/letterMailboxService';
import { receiveLetterWebhook } from '@/controllers/letterWebhookController';

const SECRET = 'test-letter-webhook-secret';
const getDS = () => (TestDataFactory as any)['testDataSource'];

// Bytes mínimos que pasan cada sniffer (el clasificador solo mira headers).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC = Buffer.concat([
	Buffer.from([0x00, 0x00, 0x00, 0x20]),
	Buffer.from('ftypheic'),
	Buffer.alloc(8, 0),
]);
const PDF = Buffer.from('%PDF-1.4\n');
const TXT = Buffer.from('ejecutable o documento raro');

const b64 = (buf: Buffer) => buf.toString('base64');

const mockRes = () => {
	const res: any = { statusCode: 500, body: undefined };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (payload: unknown) => {
		res.body = payload;
		return res;
	};
	return res;
};

describe('letterWebhook — contrato Worker → API', () => {
	let app: any;
	let retreat: any;
	let mailboxCode: string;

	const makePayload = (overrides: Record<string, unknown> = {}) => ({
		messageId: `<test-${Date.now()}-${Math.random().toString(36).slice(2)}@mail.ejemplo.com>`,
		from: 'familia@ejemplo.com',
		fromName: 'Familia de Prueba',
		to: `carta.${mailboxCode}@emaus.cc`,
		subject: 'Para ti',
		text: 'Hola, fuerza en el retiro.',
		html: null,
		receivedAt: '2026-11-05T14:03:00.000Z',
		attachments: [],
		...overrides,
	});

	const postWebhook = (payload: Record<string, unknown>, secret = SECRET) =>
		request(app).post('/api/letters/webhook').set('X-Emaus-Letter-Secret', secret).send(payload);

	beforeAll(async () => {
		await setupTestDatabase();
		app = await createTestApp();
	});

	afterAll(async () => {
		await cleanupTestApp();
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });
		await activateMailboxesForRetreat(retreat.id);
		const rp = await getDS()
			.getRepository(RetreatParticipant)
			.findOne({ where: { participantId: walker.id } });
		mailboxCode = rp!.mailboxCode!;
	});

	it('wiring: CSRF-exempt y montado ANTES de letterRoutes (source-level)', () => {
		const indexSrc = readFileSync(join(__dirname, '..', '..', 'routes', 'index.ts'), 'utf-8');
		expect(indexSrc).toMatch(/['"]\/letters\/webhook['"]/);
		// La exención CSRF va en la lista, y el webhook se monta antes de letterRoutes.
		const exemptPos = indexSrc.indexOf("'/letters/webhook'");
		const webhookPos = indexSrc.indexOf('router.use(letterWebhookRoutes)');
		const letterPos = indexSrc.indexOf("router.use('/letters', letterRoutes)");
		expect(exemptPos).toBeGreaterThan(-1);
		expect(webhookPos).toBeGreaterThan(-1);
		expect(webhookPos).toBeLessThan(letterPos);

		// Y AMBOS antes de shirtTypeRoutes: ese router tiene un
		// `router.use(isAuthenticated)` sin path y sin prefijo que exige sesión a
		// todo lo montado después — el webhook es público (bug del primer wiring).
		const shirtPos = indexSrc.indexOf('router.use(shirtTypeRoutes)');
		expect(shirtPos).toBeGreaterThan(webhookPos);
		expect(shirtPos).toBeGreaterThan(letterPos);

		const limiterSrc = readFileSync(
			join(__dirname, '..', '..', 'middleware', 'rateLimiting.ts'),
			'utf-8',
		);
		expect(limiterSrc).toMatch(/letterWebhookLimiter/);
	});

	it('200 accepted: carta pending con adjuntos clasificados y key bajo letters/', async () => {
		const response = await postWebhook(
			makePayload({
				attachments: [
					{ fileName: 'foto.jpg', mimeType: 'image/jpeg', contentBase64: b64(JPEG) },
					{ fileName: 'captura.png', mimeType: 'image/png', contentBase64: b64(PNG) },
					{ fileName: 'retrato.heic', mimeType: 'image/heic', contentBase64: b64(HEIC) },
					{ fileName: 'doc.pdf', mimeType: 'application/pdf', contentBase64: b64(PDF) },
					{ fileName: 'raro.exe', mimeType: 'application/octet-stream', contentBase64: b64(TXT) },
				],
			}),
		);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ status: 'accepted', duplicate: false });
		expect(typeof response.body.letterId).toBe('string');

		const letterRepo = getDS().getRepository(Letter);
		const letter = await letterRepo.findOne({
			where: { id: response.body.letterId },
			relations: ['attachments'],
		});
		expect(letter).toBeTruthy();
		expect(letter!.status).toBe('pending');
		expect(letter!.retreatId).toBe(retreat.id);
		// 4 guardados (el .exe se descarta) + warning del descartado.
		expect(letter!.attachments!.length).toBe(4);
		expect(letter!.warnings).toHaveLength(1);
		expect(letter!.warnings![0]).toContain('raro.exe');

		const byName = new Map(letter!.attachments!.map((a) => [a.fileName, a]));
		expect(byName.get('foto.jpg')!.isBrowserSafeImage).toBe(true);
		expect(byName.get('captura.png')!.mimeType).toBe('image/png');
		expect(byName.get('retrato.heic')!.isBrowserSafeImage).toBe(false);
		expect(byName.get('doc.pdf')!.mimeType).toBe('application/pdf');
		// Modo base64 (sin S3 en tests): data URL inline; en prod el key empieza letters/.
		const attachment = byName.get('foto.jpg')!;
		expect(attachment.storageUrl.startsWith('data:image/jpeg;base64,') || attachment.storageKey.startsWith('letters/')).toBe(true);
	});

	it('documentos: Office/OpenDocument/texto se guardan; con macros o disfrazados se descartan', async () => {
		const zip = (...entries: string[]) =>
			Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(entries.join('\0'))]);
		const ole = (...extra: Buffer[]) =>
			Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(32), ...extra]);
		const response = await postWebhook(
			makePayload({
				attachments: [
					{ fileName: 'Carta para José.docx', mimeType: 'application/octet-stream', contentBase64: b64(zip('[Content_Types].xml', 'word/document.xml')) },
					{ fileName: 'fotos.pptx', mimeType: 'application/octet-stream', contentBase64: b64(zip('[Content_Types].xml', 'ppt/presentation.xml')) },
					{ fileName: 'carta.odt', mimeType: 'application/octet-stream', contentBase64: b64(zip('mimetype', 'application/vnd.oasis.opendocument.text')) },
					{ fileName: 'vieja.doc', mimeType: 'application/msword', contentBase64: b64(ole()) },
					{ fileName: 'nota.txt', mimeType: 'text/plain', contentBase64: b64(Buffer.from('Querido Juan:\nTe queremos.')) },
					// Descartados:
					{ fileName: 'macro.docx', mimeType: 'application/octet-stream', contentBase64: b64(zip('[Content_Types].xml', 'word/vbaProject.bin')) },
					{ fileName: 'macro.docm', mimeType: 'application/octet-stream', contentBase64: b64(zip('[Content_Types].xml')) },
					{ fileName: 'macro.doc', mimeType: 'application/msword', contentBase64: b64(ole(Buffer.from('_VBA_PROJECT', 'utf16le'))) },
					{ fileName: 'disfrazado.docx', mimeType: 'application/octet-stream', contentBase64: b64(Buffer.from('MZ ejecutable')) },
					{ fileName: 'dibujo.svg', mimeType: 'image/svg+xml', contentBase64: b64(Buffer.from('<svg onload="x()"/>')) },
				],
			}),
		);
		expect(response.status).toBe(200);
		const letter = await getDS().getRepository(Letter).findOne({
			where: { id: response.body.letterId },
			relations: ['attachments'],
		});
		const byName = new Map(letter!.attachments!.map((a) => [a.fileName, a]));
		expect([...byName.keys()].sort()).toEqual(
			['Carta para José.docx', 'carta.odt', 'fotos.pptx', 'nota.txt', 'vieja.doc'].sort(),
		);
		expect(byName.get('Carta para José.docx')!.mimeType).toBe(
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		);
		expect(byName.get('vieja.doc')!.mimeType).toBe('application/msword');
		expect(byName.get('nota.txt')!.mimeType).toBe('text/plain');
		// Ningún documento cuenta como imagen imprimible.
		expect([...byName.values()].every((a) => !a.isBrowserSafeImage)).toBe(true);

		const warnings = letter!.warnings!.join(' | ');
		expect(warnings).toContain('"macro.docx" descartado: documento con macros');
		expect(warnings).toContain('"macro.docm" descartado: documento con macros');
		expect(warnings).toContain('"macro.doc" descartado: documento con macros');
		expect(warnings).toContain('"disfrazado.docx" descartado: formato no soportado');
		expect(warnings).toContain('"dibujo.svg" descartado: formato no soportado');
	});

	it('200 duplicate: mismo messageId no crea segunda carta', async () => {
		const payload = makePayload();
		const first = await postWebhook(payload);
		expect(first.body.status).toBe('accepted');

		const second = await postWebhook(payload);
		expect(second.status).toBe(200);
		expect(second.body.duplicate).toBe(true);

		const count = await getDS().getRepository(Letter).count();
		expect(count).toBe(1);
	});

	it('404 unknown_mailbox: código inventado (el Worker rebota al remitente)', async () => {
		const response = await postWebhook(makePayload({ to: 'carta.ZZ99ZZ99@emaus.cc' }));
		expect(response.status).toBe(404);
		expect(response.body.error).toBe('unknown_mailbox');
		expect(await getDS().getRepository(Letter).count()).toBe(0);
	});

	it('404 mailbox_disabled: buzón apagado también rebota', async () => {
		const rpRepo = getDS().getRepository(RetreatParticipant);
		const rp = await rpRepo.findOne({ where: { mailboxCode } });
		rp!.mailboxEnabled = false;
		await rpRepo.save(rp!);

		const response = await postWebhook(makePayload());
		expect(response.status).toBe(404);
		expect(response.body.error).toBe('mailbox_disabled');
	});

	it('401: secret inválido o ausente', async () => {
		const bad = await postWebhook(makePayload(), 'secret-equivocado');
		expect(bad.status).toBe(401);
		const missing = await request(app).post('/api/letters/webhook').send(makePayload());
		expect(missing.status).toBe(401);
	});

	it('413 too_large: adjunto > 8 MB (handler directo; el parser de testApp es 2mb)', async () => {
		const bigAttachment = {
			fileName: 'grande.jpg',
			mimeType: 'image/jpeg',
			contentBase64: b64(Buffer.alloc(9 * 1024 * 1024 + 16, 0xff)),
		};
		const req: any = {
			header: (name: string) => (name === 'X-Emaus-Letter-Secret' ? SECRET : undefined),
			body: makePayload({ attachments: [bigAttachment] }),
		};
		const res = mockRes();
		await receiveLetterWebhook(req, res);
		expect(res.statusCode).toBe(413);
		expect(res.body.error).toBe('too_large');
	});

	it('400 invalid_payload: sin from o sin to', async () => {
		const noFrom = makePayload();
		delete noFrom.from;
		expect((await postWebhook(noFrom)).status).toBe(400);
		expect((await postWebhook({})).status).toBe(400);
	});

	it('html→text: un email con solo HTML guarda texto plano sin tags (D10)', async () => {
		const response = await postWebhook(
			makePayload({
				text: null,
				html: '<html><head><style>p{color:red}</style></head><body><p>Hola <b>Juan</b></p><script>alert(1)</script><p> Fuerza.</p></body></html>',
			}),
		);
		expect(response.status).toBe(200);

		const letter = await getDS().getRepository(Letter).findOne({ where: { id: response.body.letterId } });
		expect(letter!.bodyText).toContain('Hola');
		expect(letter!.bodyText).toContain('Juan');
		expect(letter!.bodyText).not.toMatch(/</);
		expect(letter!.bodyText).not.toContain('alert');
		expect(letter!.bodyText).not.toContain('color:red');
	});
});
