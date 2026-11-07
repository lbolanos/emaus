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
		// Acceso del revisor al retiro: hasRetreatAccess lo exige en apply/dismiss
		// (anti-IDOR) y los tests del servicio lo ejercitan con acceso real. El
		// rol va creado por factory: la DB de test enforcea FKs (roleId=1 no existe).
		const role = await TestDataFactory.createTestRole();
		await getDS()
			.getRepository(await import('@/entities/userRetreat.entity').then((m) => m.UserRetreat))
			.save({
				userId: user.id,
				retreatId: retreat.id,
				roleId: role.id,
				status: 'active',
			} as any);
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
