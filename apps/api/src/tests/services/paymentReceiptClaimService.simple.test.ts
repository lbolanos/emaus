/**
 * Test del servicio de comprobantes enviados por familias (link de capacidad):
 * submit público (token/participante), apply crea el pago con la foto seteada
 * y sella el claim, dismiss, from-letter crea el pago desde el adjunto foto de
 * una carta y la sella `attached`. El roundtrip del token AES también.
 *
 * imageService se mockea (sharp en tests no es determinista); el flujo de
 * storage corre en modo base64 (dev), así que no hay S3 en la toma.
 * domainAuditService se spy-ea (fire-and-forget).
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

// Acceso al retiro (anti-IDOR): el servicio de autorización lee roles por su
// propia conexión, que la DB de test no trae; se simula con la regla real
// —solo el revisor de ESTE retiro tiene acceso— y se verifica que el servicio
// la consulta con el retiro del claim/carta.
jest.mock('@/middleware/authorization', () => {
	const actual = jest.requireActual('@/middleware/authorization');
	return {
		...actual,
		authorizationService: { ...actual.authorizationService, hasRetreatAccess: jest.fn() },
	};
});
jest.mock('@/services/domainAuditService', () => {
	const actual = jest.requireActual('@/services/domainAuditService');
	return {
		...actual,
		domainAuditService: { log: jest.fn().mockResolvedValue(undefined), logCreate: jest.fn().mockResolvedValue(undefined) },
	};
});
jest.mock('@/services/imageService', () => {
	class FlyerAssetError extends Error {}
	return {
		imageService: {
			base64ToBuffer: jest.fn(() => ({ buffer: Buffer.from('processed'), contentType: 'image/webp' })),
			processPhoto: jest.fn(async () => ({
				buffer: Buffer.from('processed-webp'),
				contentType: 'image/webp',
			})),
		},
		FlyerAssetError,
	};
});

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import {
	submitReceiptClaim,
	applyReceiptClaim,
	dismissReceiptClaim,
	createPaymentFromLetter,
	getReceiptLinks,
	markReceiptLinkShared,
	getLetterReceiptPhoto,
	attachLetterToPayment,
	PaymentClaimError,
} from '@/services/paymentReceiptClaimService';
import {
	buildPaymentReceiptLinkToken,
	parsePaymentReceiptLinkToken,
	buildPaymentReceiptLinkUrl,
	parsePaymentReceiptLinkToken as parseToken,
} from '@/utils/paymentReceiptLinkToken';
import { PaymentReceiptClaim } from '@/entities/paymentReceiptClaim.entity';
import { Payment } from '@/entities/payment.entity';
import { Letter } from '@/entities/letter.entity';
import { v4 as uuidv4 } from 'uuid';

const getDS = () => (TestDataFactory as any)['testDataSource'];
const PHOTO = `data:image/jpeg;base64,${Buffer.from('foto-familia').toString('base64')}`;

describe('paymentReceiptClaimService (integration)', () => {
	let retreat: any;
	let participant: any;
	let userId: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
		participant = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);
		const user = await TestDataFactory.createTestUser();
		userId = user.id;
		const { authorizationService } = await import('@/middleware/authorization');
		(authorizationService.hasRetreatAccess as jest.Mock).mockImplementation(
			async (uid: string, rid: string) => uid === userId && rid === retreat.id,
		);
	});

	const tokenFor = (participantId = participant.id): string =>
		buildPaymentReceiptLinkToken(retreat.id, participantId);

	it('el token AES hace roundtrip y un token alterado parsea null', () => {
		const token = buildPaymentReceiptLinkToken(retreat.id, participant.id);
		const parsed = parsePaymentReceiptLinkToken(token);
		expect(parsed).toEqual({ retreatId: retreat.id, participantId: participant.id });
		expect(parseToken(token.slice(0, -2) + 'XX')).toBeNull();
	});

	it('submit crea un claim pending con la foto (base64 en dev)', async () => {
		const { claimId } = await submitReceiptClaim(tokenFor(participant.id), {
			photo: PHOTO,
			amountClaimed: 1500,
			senderContact: 'mamá',
		});

		const claim = await getDS().getRepository(PaymentReceiptClaim).findOneByOrFail({ id: claimId });
		expect(claim.status).toBe('pending');
		expect(claim.retreatId).toBe(retreat.id);
		expect(claim.participantId).toBe(participant.id);
		expect(claim.amountClaimed).toBe(1500);
		expect(claim.photoUrl.startsWith('data:image/webp;base64,')).toBe(true);
	});

	it('submit con token inválido o participante borrado → 404', async () => {
		await expect(submitReceiptClaim('token-malo', { photo: PHOTO })).rejects.toMatchObject({
			code: 'invalid_token',
			httpStatus: 404,
		});

		// Participante borrado lógicamente.
		await getDS()
			.getRepository(await import('@/entities/participant.entity').then((m) => m.Participant))
			.update(participant.id, { dataDeletedAt: new Date() });
		await expect(submitReceiptClaim(tokenFor(participant.id), { photo: PHOTO })).rejects.toMatchObject({
			code: 'invalid_participant',
			httpStatus: 404,
		});
	});

	it('apply crea el pago con la foto seteada y sella el claim attached', async () => {
		const { claimId } = await submitReceiptClaim(tokenFor(participant.id), { photo: PHOTO });
		const result = await applyReceiptClaim(claimId, { amount: 1500, paymentMethod: 'transfer' }, userId);

		const payment = await getDS().getRepository(Payment).findOneByOrFail({ id: result.paymentId });
		expect(Number(payment.amount)).toBe(1500);
		expect(payment.participantId).toBe(participant.id);
		expect(payment.receiptUrl).toContain('data:image/webp');
		expect(payment.receiptS3Key).toBeNull();

		const claim = await getDS().getRepository(PaymentReceiptClaim).findOneByOrFail({ id: claimId });
		expect(claim.status).toBe('attached');
		expect(claim.attachedPaymentId).toBe(result.paymentId);
		expect(claim.attachedById).toBe(userId);
		expect(claim.attachedAt).toBeTruthy();
	});

	it('apply sobre un claim no-pending → 409', async () => {
		const { claimId } = await submitReceiptClaim(tokenFor(participant.id), { photo: PHOTO });
		const repo = getDS().getRepository(PaymentReceiptClaim);
		await repo.update(claimId, { status: 'attached' });

		await expect(
			applyReceiptClaim(claimId, { amount: 100 }, userId),
		).rejects.toMatchObject({ code: 'claim_not_pending', httpStatus: 409 });
	});

	it('dismiss marca dismissed y audit', async () => {
		const { claimId } = await submitReceiptClaim(tokenFor(participant.id), { photo: PHOTO });
		await dismissReceiptClaim(claimId, userId);
		const claim = await getDS().getRepository(PaymentReceiptClaim).findOneByOrFail({ id: claimId });
		expect(claim.status).toBe('dismissed');
	});

	describe('formulario de pago estándar desde una carta', () => {
		const letterWithPhoto = async (over: Record<string, unknown> = {}, withPhoto = true) => {
			const rp = (
				await getDS().query(
					`SELECT "id" FROM "retreat_participants" WHERE "participantId" = ? LIMIT 1`,
					[participant.id],
				)
			)[0];
			const letter = await getDS().getRepository(Letter).save({
				retreatId: retreat.id, retreatParticipantId: rp.id, fromEmail: 'familia@ejemplo.com',
				bodyText: 'Va el comprobante', status: 'pending', receivedAt: new Date(), ...over,
			});
			if (withPhoto) {
				await getDS()
					.getRepository(await import('@/entities/letterAttachment.entity').then((m) => m.LetterAttachment))
					.save({
						letterId: letter.id, fileName: 'transferencia.jpg', mimeType: 'image/jpeg', sizeBytes: 1000,
						isBrowserSafeImage: true, storageKey: '', storageUrl: PHOTO, sortOrder: 0,
					});
			}
			return letter;
		};
		const paymentFor = async (pid = participant.id) => {
			const { claimId } = await submitReceiptClaim(tokenFor(pid), { photo: PHOTO });
			return (await applyReceiptClaim(claimId, { amount: 500 }, userId)).paymentId;
		};

		it('photo: devuelve la foto como data-URL y el caminante, para abrir el formulario', async () => {
			const letter = await letterWithPhoto();
			const result = await getLetterReceiptPhoto(letter.id, userId);
			expect(result.dataUrl).toBe(PHOTO);
			expect(result.participantId).toBe(participant.id);
			expect(result.fileName).toBe('transferencia.jpg');
		});

		it('photo: carta sin foto → 400; carta oculta → 409; otro retiro → 403', async () => {
			const noPhoto = await letterWithPhoto({}, false);
			await expect(getLetterReceiptPhoto(noPhoto.id, userId)).rejects.toMatchObject({ code: 'no_photo' });
			const hidden = await letterWithPhoto({ status: 'hidden' });
			await expect(getLetterReceiptPhoto(hidden.id, userId)).rejects.toMatchObject({ httpStatus: 409 });
			const other = (await TestDataFactory.createTestUser()).id;
			await expect(getLetterReceiptPhoto(hidden.id, other)).rejects.toMatchObject({ httpStatus: 403 });
		});

		it('attach: sella la carta attached con un pago del mismo caminante', async () => {
			const letter = await letterWithPhoto({ status: 'approved' });
			const paymentId = await paymentFor();
			await attachLetterToPayment(letter.id, paymentId, userId);
			const sealed = await getDS().getRepository(Letter).findOneByOrFail({ id: letter.id });
			expect(sealed.status).toBe('attached');
		});

		it('attach: un pago de OTRO caminante no sella la carta (404)', async () => {
			const letter = await letterWithPhoto();
			const other = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);
			const paymentId = await paymentFor(other.id);
			await expect(attachLetterToPayment(letter.id, paymentId, userId)).rejects.toMatchObject({
				code: 'invalid_participant',
				httpStatus: 404,
			});
			const still = await getDS().getRepository(Letter).findOneByOrFail({ id: letter.id });
			expect(still.status).toBe('pending');
		});
	});

	it('wiring: foto y sellado de una carta exigen letter:read además de payment:create', () => {
		const { readFileSync } = jest.requireActual('fs') as typeof import('fs');
		const { join } = jest.requireActual('path') as typeof import('path');
		const routes = readFileSync(join(__dirname, '..', '..', 'routes', 'paymentRoutes.ts'), 'utf-8');
		for (const path of ['/from-letter/:letterId/photo', '/from-letter/:letterId/attach']) {
			const start = routes.indexOf(`'${path}'`);
			expect(start).toBeGreaterThan(-1);
			const chain = routes.slice(start, routes.indexOf(');', start));
			expect(chain).toMatch(/requirePermission\(\s*'payment:create'\s*\)/);
			expect(chain).toMatch(/requirePermission\(\s*'letter:read'\s*\)/);
		}
	});

	describe('anti-IDOR: el permiso de pagos no basta, hace falta acceso al retiro', () => {
		// Un coordinador de OTRO retiro: usuario real, sin user_retreat en éste.
		const outsider = async () => (await TestDataFactory.createTestUser()).id;

		it('aplicar un comprobante de otro retiro → 403 y no crea pago', async () => {
			const { claimId } = await submitReceiptClaim(tokenFor(participant.id), { photo: PHOTO });
			const intruder = await outsider();
			// clearTestData no vacía payments: se compara antes/después.
			const paymentsBefore = await getDS().getRepository(Payment).count();
			await expect(applyReceiptClaim(claimId, { amount: 100 }, intruder)).rejects.toMatchObject({
				code: 'no_access',
				httpStatus: 403,
			});
			// Se consultó el acceso al retiro DEL CLAIM (no a otro).
			const { authorizationService } = await import('@/middleware/authorization');
			expect(authorizationService.hasRetreatAccess).toHaveBeenCalledWith(intruder, retreat.id);
			expect(await getDS().getRepository(Payment).count()).toBe(paymentsBefore);
			const claim = await getDS().getRepository(PaymentReceiptClaim).findOneByOrFail({ id: claimId });
			expect(claim.status).toBe('pending');
		});

		it('descartar un comprobante de otro retiro → 403 y sigue pendiente', async () => {
			const { claimId } = await submitReceiptClaim(tokenFor(participant.id), { photo: PHOTO });
			await expect(dismissReceiptClaim(claimId, await outsider())).rejects.toMatchObject({
				code: 'no_access',
				httpStatus: 403,
			});
			const claim = await getDS().getRepository(PaymentReceiptClaim).findOneByOrFail({ id: claimId });
			expect(claim.status).toBe('pending');
		});

		it('pago desde una carta de otro retiro → 403', async () => {
			const rp = (
				await getDS().query(
					`SELECT "id" FROM "retreat_participants" WHERE "participantId" = ? LIMIT 1`,
					[participant.id],
				)
			)[0];
			const letter = await getDS().getRepository(Letter).save({
				retreatId: retreat.id, retreatParticipantId: rp.id, fromEmail: 'familia@ejemplo.com',
				bodyText: 'Comprobante', status: 'pending', receivedAt: new Date(),
			});
			await expect(
				createPaymentFromLetter(letter.id, { amount: 100 }, await outsider()),
			).rejects.toMatchObject({ code: 'no_access', httpStatus: 403 });
		});
	});

	it('getReceiptLinks trae link y sharedAt null; markReceiptLinkShared lo sella (mejora 9)', async () => {
		const links = await getReceiptLinks(retreat.id);
		const mine = links.find((l) => l.participantId === participant.id);
		expect(mine).toBeTruthy();
		expect(mine!.link).toContain('/comprobante/');
		expect(mine!.sharedAt).toBeNull();

		// La marca usa el id de retreat_participants (no el participantId global).
		const rp = (
			await getDS().query(
				`SELECT "id" FROM "retreat_participants" WHERE "participantId" = ? AND "retreatId" = ? LIMIT 1`,
				[participant.id, retreat.id],
			)
		)[0];
		expect(mine!.retreatParticipantId).toBe(rp.id);
		const sharedAt = await markReceiptLinkShared(retreat.id, rp.id);
		expect(sharedAt).toBeTruthy();

		const after = await getReceiptLinks(retreat.id);
		expect(after.find((l) => l.participantId === participant.id)!.sharedAt).toBeTruthy();
	});

	it('markReceiptLinkShared con rp de otro retiro → 404 (anti-IDOR)', async () => {
		const otherRetreat = await TestDataFactory.createTestRetreat();
		const other = await TestDataFactory.createTestParticipant(otherRetreat.id, {
			type: 'walker',
		} as any);
		const rp = (
			await getDS().query(
				`SELECT "id" FROM "retreat_participants" WHERE "participantId" = ? AND "retreatId" = ? LIMIT 1`,
				[other.id, otherRetreat.id],
			)
		)[0];
		await expect(markReceiptLinkShared(retreat.id, rp.id)).rejects.toMatchObject({
			code: 'unknown_claim',
			httpStatus: 404,
		});
	});

	it('from-letter crea el pago con la foto de la carta y la sella attached', async () => {
		// rp del participante (la Letter referencia retreat_participants.id).
		const rp = (
			await getDS().query(
				`SELECT "id", "participantId" FROM "retreat_participants" WHERE "participantId" = ? LIMIT 1`,
				[participant.id],
			)
		)[0];

		const letter = await getDS().getRepository(Letter).save({
			retreatId: retreat.id,
			retreatParticipantId: rp.id,
			fromEmail: 'familia@ejemplo.com',
			bodyText: 'Carta con foto',
			status: 'pending',
			receivedAt: new Date(),
		});
		const attachment = await getDS()
			.getRepository(await import('@/entities/letterAttachment.entity').then((m) => m.LetterAttachment))
			.save({
				letterId: letter.id,
				fileName: 'captura.jpg',
				mimeType: 'image/jpeg',
				sizeBytes: 1000,
				isBrowserSafeImage: true,
				storageKey: '',
				storageUrl: PHOTO, // data-URL en modo base64
				sortOrder: 0,
			});

		const result = await createPaymentFromLetter(
			letter.id,
			{ amount: 800, paymentMethod: 'transfer' },
			userId,
		);

		const payment = await getDS().getRepository(Payment).findOneByOrFail({ id: result.paymentId });
		expect(payment.participantId).toBe(rp.participantId);
		expect(payment.receiptUrl).toBe(PHOTO);

		const sealedLetter = await getDS().getRepository(Letter).findOneByOrFail({ id: letter.id });
		expect(sealedLetter.status).toBe('attached');

		// El adjunto sigue en la carta (traza) — la foto del pago es su copia.
		const att = await getDS()
			.getRepository(await import('@/entities/letterAttachment.entity').then((m) => m.LetterAttachment))
			.findOneByOrFail({ id: attachment.id });
		expect(att.letterId).toBe(letter.id);
	});
});
