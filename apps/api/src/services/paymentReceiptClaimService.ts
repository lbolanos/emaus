import { randomUUID } from 'crypto';
import { AppDataSource } from '../data-source';
import { config } from '../config/env';
import {
	PaymentReceiptClaim,
	PaymentReceiptClaimStatus,
} from '../entities/paymentReceiptClaim.entity';
import { Payment } from '../entities/payment.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { Letter } from '../entities/letter.entity';
import { domainAuditService } from './domainAuditService';
import { s3Service } from './s3Service';
import { imageService, FlyerAssetError } from './imageService';
import { hydrateParticipantRetreatContext } from './participantRetreatHydration';
import {
	buildPaymentReceiptLinkToken,
	buildPaymentReceiptLinkUrl,
	parsePaymentReceiptLinkToken,
} from '../utils/paymentReceiptLinkToken';
import { fullName } from './letterMailboxService';
import { DomainAuditAction } from '@repo/types';
import type { PaymentReceiptClaim as PaymentReceiptClaimDTO } from '@repo/types';

const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export class PaymentClaimError extends Error {
	constructor(
		public readonly code:
			| 'invalid_token'
			| 'unknown_claim'
			| 'claim_not_pending'
			| 'no_photo'
			| 'invalid_photo'
			| 'invalid_participant'
			| 'no_access',
		public readonly httpStatus: number,
		message?: string,
	) {
		super(message ?? code);
		this.name = 'PaymentClaimError';
	}
}

/** Anti-IDOR: el permiso payment:create/update NO basta — hay que tener acceso al retiro del claim. */
async function assertRetreatAccess(userId: string, retreatId: string): Promise<void> {
	const { authorizationService } = await import('../middleware/authorization');
	if (!(await authorizationService.hasRetreatAccess(userId, retreatId))) {
		throw new PaymentClaimError('no_access', 403);
	}
}

const fullNameOf = (
	p:
		| {
				firstName?: string | null;
				lastName?: string | null;
				nickname?: string | null;
		  }
		| null
		| undefined,
): string => fullName(p);

/**
 * Contexto para renderizar el link público: valida que el participante exista,
 * pertenezca al retiro del token y no esté cancelado ni borrado. Null en
 * cualquier otro caso → el caller responde 404 uniforme.
 */
export async function getReceiptLinkContext(token: string): Promise<{
	participantName: string;
	retreatParish: string;
} | null> {
	const payload = parsePaymentReceiptLinkToken(token);
	if (!payload) return null;

	const participant = await AppDataSource.getRepository(Participant).findOne({
		where: { id: payload.participantId },
	});
	if (!participant || participant.dataDeletedAt) return null;

	// La parroquia del retiro DEL TOKEN (no la primaria del participante: puede
	// pertenecer a varios retiros).
	const retreat = await AppDataSource.getRepository(Retreat).findOne({
		where: { id: payload.retreatId },
	});

	const rp = await AppDataSource.query(
		`SELECT "isCancelled" FROM "retreat_participants"
		 WHERE "participantId" = ? AND "retreatId" = ? LIMIT 1`,
		[participant.id, payload.retreatId],
	);
	if (!rp.length || rp[0].isCancelled) return null;

	return {
		participantName: fullNameOf(participant),
		retreatParish: retreat?.parish ?? '',
	};
}

async function assertClaimTarget(retreatId: string, participantId: string): Promise<void> {
	const participant = await AppDataSource.getRepository(Participant).findOne({
		where: { id: participantId },
	});
	if (!participant || participant.dataDeletedAt) {
		throw new PaymentClaimError('invalid_participant', 404);
	}
	const rp = await AppDataSource.query(
		`SELECT "isCancelled" FROM "retreat_participants"
		 WHERE "participantId" = ? AND "retreatId" = ? LIMIT 1`,
		[participantId, retreatId],
	);
	if (!rp.length || rp[0].isCancelled) throw new PaymentClaimError('invalid_participant', 404);
}

/**
 * Ingest PÚBLICO (link de capacidad): crea el claim con la foto ya procesada
 * (el controller la pasa por imageService antes de llamarnos).
 */
export async function submitReceiptClaim(
	token: string,
	body: {
		photo: string;
		amountClaimed?: number;
		reference?: string;
		note?: string;
		senderContact?: string;
	},
): Promise<{ claimId: string }> {
	const payload = parsePaymentReceiptLinkToken(token);
	if (!payload) throw new PaymentClaimError('invalid_token', 404);
	await assertClaimTarget(payload.retreatId, payload.participantId);

	const processed = await imageService.processPhoto(
		Buffer.from(body.photo.split(',')[1] ?? '', 'base64'),
		'image/jpeg',
	).catch((err: unknown) => {
		if (err instanceof FlyerAssetError) {
			throw new PaymentClaimError('invalid_photo', 400, (err as Error).message);
		}
		throw err;
	});

	const claimId = randomUUID();
	let photoUrl: string;
	let photoS3Key: string | null = null;
	if (config.avatar.storage === 's3') {
		const uploaded = await s3Service.uploadPaymentReceiptClaim(
			claimId,
			processed.buffer,
			processed.contentType,
		);
		photoUrl = uploaded.url;
		photoS3Key = uploaded.key;
	} else {
		// Dev sin S3: data-URL inline del WebP procesado (mismo criterio de letters).
		photoUrl = `data:${processed.contentType};base64,${processed.buffer.toString('base64')}`;
	}

	const claim = AppDataSource.getRepository(PaymentReceiptClaim).create({
		id: claimId,
		retreatId: payload.retreatId,
		participantId: payload.participantId,
		status: 'pending' as PaymentReceiptClaimStatus,
		amountClaimed: body.amountClaimed ?? null,
		reference: body.reference ?? null,
		note: body.note ?? null,
		senderContact: body.senderContact ?? null,
		photoUrl,
		photoS3Key,
	});
	await AppDataSource.getRepository(PaymentReceiptClaim).insert(claim);
	console.log(`🧾 Comprobante recibido (claim ${claimId}) para ${payload.participantId}`);
	return { claimId };
}

/** Bandeja: claims del retiro con foto presigned y saldo pendiente del participante. */
export async function listReceiptClaims(
	retreatId: string,
	status?: PaymentReceiptClaimStatus,
): Promise<PaymentReceiptClaimDTO[]> {
	const qb = AppDataSource.getRepository(PaymentReceiptClaim)
		.createQueryBuilder('claim')
		.leftJoinAndSelect('claim.participant', 'participant')
		.where('claim.retreatId = :retreatId', { retreatId });
	if (status) qb.andWhere('claim.status = :status', { status });
	qb.orderBy('claim.createdAt', 'DESC').limit(200);

	const claims = await qb.getMany();

	const balanceByParticipant = new Map<string, number | null>();
	const uniqueParticipantIds = [
		...new Set(claims.map((c) => c.participant?.id).filter((id): id is string => !!id)),
	];
	await Promise.all(
		uniqueParticipantIds.map(async (participantId) => {
			const participant = await AppDataSource.getRepository(Participant).findOne({
				where: { id: participantId },
				relations: ['payments', 'debts', 'retreat'],
			});
			if (!participant) return;
			// chargeBreakdown es getter sobre pagos/deudas filtrados AL retiro de
			// contexto (hydrateParticipantRetreatContext).
			await hydrateParticipantRetreatContext(participant, retreatId);
			const balance = participant.chargeBreakdown?.balance;
			balanceByParticipant.set(
				participantId,
				typeof balance === 'number' ? balance : null,
			);
		}),
	);

	return claims.map((claim): PaymentReceiptClaimDTO => ({
		id: claim.id,
		retreatId: claim.retreatId,
		participantId: claim.participantId,
		participantName: fullNameOf(claim.participant),
		participantBalance: balanceByParticipant.get(claim.participantId) ?? null,
		status: claim.status,
		amountClaimed: claim.amountClaimed != null ? Number(claim.amountClaimed) : null,
		reference: claim.reference ?? null,
		note: claim.note ?? null,
		senderContact: claim.senderContact ?? null,
		photoUrl: claim.photoUrl, // presignado abajo para los de S3
		attachedPaymentId: claim.attachedPaymentId ?? null,
		attachedAt: claim.attachedAt ?? null,
		createdAt: claim.createdAt,
	}));
}

/** Presign de las fotos de claim (S3). No-op en modo base64. */
export async function presignClaimPhotos(claims: { photoUrl: string }[]): Promise<void> {
	for (const claim of claims) {
		claim.photoUrl = await s3Service.presignPrivateUrl(claim.photoUrl);
	}
}

/** Links de comprobante por participante (con nombre y marca de difusión, para WhatsApp). */
export async function getReceiptLinks(
	retreatId: string,
): Promise<{
	participantId: string;
	retreatParticipantId: string;
	participantName: string;
	link: string;
	cellPhone: string | null;
	sharedAt: string | null;
}[]> {
	const rows = await AppDataSource.query(
		`SELECT rp."id" AS retreatParticipantId,
		        rp."participantId" AS participantId,
		        p."firstName" AS firstName, p."lastName" AS lastName, p."nickname" AS nickname,
		        p."cellPhone" AS cellPhone,
		        p."dataDeletedAt" AS dataDeletedAt,
		        rp."receiptLinkSharedAt" AS receiptLinkSharedAt
		 FROM "retreat_participants" rp
		 JOIN "participants" p ON p."id" = rp."participantId"
		 WHERE rp."retreatId" = ? AND rp."isCancelled" = 0
		   AND rp."type" IN ('walker', 'server', 'partial_server')
		   AND p."dataDeletedAt" IS NULL`,
		[retreatId],
	);
	return (rows as {
		retreatParticipantId: string;
		participantId: string;
		firstName: string | null;
		lastName: string | null;
		nickname: string | null;
		cellPhone: string | null;
		receiptLinkSharedAt: string | Date | null;
	}[]).map((row) => ({
		participantId: row.participantId,
		retreatParticipantId: row.retreatParticipantId,
		participantName: fullNameOf({
			firstName: row.firstName,
			lastName: row.lastName,
			nickname: row.nickname,
		}),
		link: buildPaymentReceiptLinkUrl(DEFAULT_FRONTEND_URL, retreatId, row.participantId),
		cellPhone: row.cellPhone ?? null,
		sharedAt: row.receiptLinkSharedAt ? new Date(row.receiptLinkSharedAt).toISOString() : null,
	}));
}

/**
 * Marca de difusión del link de comprobante (mejora 9): la clave es
 * {id, retreatId} — un rp de otro retiro no matchea y responde 404
 * (anti-IDOR al nivel del recurso más específico).
 */
export async function markReceiptLinkShared(
	retreatId: string,
	retreatParticipantId: string,
): Promise<Date> {
	const repo = AppDataSource.getRepository(RetreatParticipant);
	const rp = await repo.findOne({ where: { id: retreatParticipantId, retreatId } });
	if (!rp) throw new PaymentClaimError('unknown_claim', 404);
	rp.receiptLinkSharedAt = new Date();
	await repo.save(rp);
	return rp.receiptLinkSharedAt;
}

async function copyClaimPhotoToPayment(
	claim: PaymentReceiptClaim,
	paymentId: string,
): Promise<{ receiptUrl: string; receiptS3Key: string | null }> {
	if (config.avatar.storage === 's3' && claim.photoS3Key) {
		const stream = await s3Service.getObjectStream(claim.photoS3Key);
		const chunks: Buffer[] = [];
		for await (const chunk of stream) chunks.push(chunk as Buffer);
		const buffer = Buffer.concat(chunks);
		const uploaded = await s3Service.uploadPaymentReceipt(paymentId, buffer, 'image/webp');
		return { receiptUrl: uploaded.url, receiptS3Key: uploaded.key };
	}
	// Dev sin S3: el claim ya guarda un data-URL del WebP procesado — copiarlo tal cual.
	return { receiptUrl: claim.photoUrl, receiptS3Key: null };
}

/**
 * Aplica un claim: crea el pago con la foto seteada (movida de
 * `claims/{claimId}` a `{paymentId}` en S3) y sella el claim `attached`.
 * Transaccional pago+claim: sin pago no hay `attached` y viceversa.
 */
export async function applyReceiptClaim(
	claimId: string,
	body: {
		amount: number;
		paymentMethod?: (typeof PAYMENT_METHODS)[number];
		paymentDate?: string;
		reference?: string;
		notes?: string;
	},
	userId: string,
): Promise<{ paymentId: string }> {
	const repo = AppDataSource.getRepository(PaymentReceiptClaim);
	const claim = await repo.findOne({ where: { id: claimId } });
	if (!claim) throw new PaymentClaimError('unknown_claim', 404);
	// Anti-IDOR: el permiso de pagos es global; el claim es de UN retiro.
	await assertRetreatAccess(userId, claim.retreatId);
	if (claim.status !== 'pending') throw new PaymentClaimError('claim_not_pending', 409);

	const paymentId = randomUUID();
	const { receiptUrl, receiptS3Key } = await copyClaimPhotoToPayment(claim, paymentId);

	const paymentDate = body.paymentDate ? new Date(`${body.paymentDate}T12:00:00`) : new Date();
	const payment = AppDataSource.getRepository(Payment).create({
		id: paymentId,
		participantId: claim.participantId,
		retreatId: claim.retreatId,
		amount: body.amount,
		paymentDate,
		paymentMethod: body.paymentMethod ?? 'transfer',
		// Sin nulls: DeepPartial de las columnas opcionales es `?: string` — null
		// no tipa (y el insert real ignora undefined).
		referenceNumber: body.reference || undefined,
		notes: body.notes || undefined,
		receiptUrl,
		receiptS3Key: receiptS3Key ?? undefined,
		recordedBy: userId,
	});

	await AppDataSource.transaction(async (em) => {
		await em.insert(Payment, payment);
		await em.update(PaymentReceiptClaim, claim.id, {
			status: 'attached' as PaymentReceiptClaimStatus,
			attachedPaymentId: paymentId,
			attachedAt: new Date(),
			attachedById: userId,
		});
	});

	void domainAuditService.logCreate('payment', paymentId, payment, {
		retreatId: claim.retreatId,
		fields: ['participantId', 'amount', 'paymentDate', 'paymentMethod', 'referenceNumber'],
	});
	void domainAuditService.log({
		action: DomainAuditAction.PAYMENT_RECEIPT_CLAIM_APPLY,
		resourceType: 'payment',
		retreatId: claim.retreatId,
		metadata: { claimId, paymentId, amount: body.amount },
	});

	return { paymentId };
}

/** Aparta un claim sin crear pago (duplicado, no procede…). Auditado. */
export async function dismissReceiptClaim(claimId: string, userId: string): Promise<void> {
	const repo = AppDataSource.getRepository(PaymentReceiptClaim);
	const claim = await repo.findOne({ where: { id: claimId } });
	if (!claim) throw new PaymentClaimError('unknown_claim', 404);
	// Anti-IDOR: el permiso de pagos es global; el claim es de UN retiro.
	await assertRetreatAccess(userId, claim.retreatId);
	if (claim.status !== 'pending') throw new PaymentClaimError('claim_not_pending', 409);

	claim.status = 'dismissed';
	claim.attachedById = userId;
	claim.attachedAt = new Date();
	await repo.save(claim);

	void domainAuditService.log({
		action: DomainAuditAction.PAYMENT_RECEIPT_CLAIM_DISMISS,
		resourceType: 'payment',
		retreatId: claim.retreatId,
		metadata: { claimId, by: userId },
	});
}

const PAYMENT_METHODS = ['cash', 'transfer', 'check', 'card', 'other'] as const;

/** Lee la foto de una carta del bucket y la normaliza (magic bytes + resize, WebP). */
async function processLetterPhoto(
	storageKey: string,
	mimeType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
	const stream = await s3Service.getObjectStream(storageKey);
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	return imageService.processPhoto(Buffer.concat(chunks), mimeType).catch((err: unknown) => {
		if (err instanceof FlyerAssetError) {
			throw new PaymentClaimError('no_photo', 400, (err as Error).message);
		}
		throw err;
	});
}

/** Carta + acceso al retiro + que siga pudiendo volverse comprobante. */
async function loadLetterForReceipt(letterId: string, userId: string): Promise<Letter> {
	const letter = await AppDataSource.getRepository(Letter).findOne({
		where: { id: letterId },
		relations: ['attachments', 'retreatParticipant'],
	});
	if (!letter) throw new PaymentClaimError('unknown_claim', 404);
	await assertRetreatAccess(userId, letter.retreatId);
	// Oculta = descartada; attached = ya es el comprobante de un pago.
	if (letter.status === 'hidden' || letter.status === 'attached') {
		throw new PaymentClaimError('claim_not_pending', 409, 'La carta ya no se puede registrar como pago');
	}
	return letter;
}

/**
 * Foto de la carta para precargar el formulario de pago estándar: data-URL ya
 * normalizada (WebP) + el participante, para abrir el formulario sobre él.
 */
export async function getLetterReceiptPhoto(
	letterId: string,
	userId: string,
): Promise<{ dataUrl: string; fileName: string; participantId: string }> {
	const letter = await loadLetterForReceipt(letterId, userId);
	const participantId = letter.retreatParticipant?.participantId;
	if (!participantId) throw new PaymentClaimError('unknown_claim', 404);
	const photo = (letter.attachments ?? []).find((a) => a.isBrowserSafeImage);
	if (!photo) throw new PaymentClaimError('no_photo', 400, 'La carta no tiene foto adjunta');

	if (config.avatar.storage === 's3' && photo.storageKey) {
		const processed = await processLetterPhoto(photo.storageKey, photo.mimeType);
		return {
			dataUrl: `data:${processed.contentType};base64,${processed.buffer.toString('base64')}`,
			fileName: photo.fileName,
			participantId,
		};
	}
	// Dev sin S3: el adjunto ya es un data-URL de imagen.
	return { dataUrl: photo.storageUrl, fileName: photo.fileName, participantId };
}

/**
 * Después de guardar el pago con el formulario estándar: la carta queda
 * `attached` (sale de la revisión y no va al papel). El pago tiene que ser del
 * mismo retiro y del mismo caminante que la carta.
 */
export async function attachLetterToPayment(
	letterId: string,
	paymentId: string,
	userId: string,
): Promise<void> {
	const letter = await loadLetterForReceipt(letterId, userId);
	const payment = await AppDataSource.getRepository(Payment).findOne({ where: { id: paymentId } });
	if (
		!payment ||
		payment.retreatId !== letter.retreatId ||
		payment.participantId !== letter.retreatParticipant?.participantId
	) {
		throw new PaymentClaimError('invalid_participant', 404, 'El pago no corresponde a esta carta');
	}
	await AppDataSource.getRepository(Letter).update(letter.id, { status: 'attached' });
	void domainAuditService.log({
		action: DomainAuditAction.PAYMENT_RECEIPT_FROM_LETTER,
		resourceType: 'payment',
		retreatId: letter.retreatId,
		metadata: { letterId, paymentId, via: 'payment-form' },
	});
}

/**
 * Registra el adjunto foto de una CARTA del buzón como comprobante: crea el
 * pago con esa foto (`payment-receipts/{paymentId}.webp`) y sella la carta
 * `attached` (sale de la revisión con traza). El comprobante es el adjunto
 * foto; el texto del email no interviene.
 */
export async function createPaymentFromLetter(
	letterId: string,
	body: {
		amount: number;
		paymentMethod?: (typeof PAYMENT_METHODS)[number];
		paymentDate?: string;
		reference?: string;
		notes?: string;
	},
	userId: string,
): Promise<{ paymentId: string }> {
	const letter = await AppDataSource.getRepository(Letter).findOne({
		where: { id: letterId },
		relations: ['attachments', 'retreatParticipant'],
	});
	if (!letter) throw new PaymentClaimError('unknown_claim', 404);
	await assertRetreatAccess(userId, letter.retreatId);
	if (letter.status !== 'pending') {
		throw new PaymentClaimError('claim_not_pending', 409, 'La carta no está pendiente de revisión');
	}
	const participantId = letter.retreatParticipant?.participantId;
	if (!participantId) throw new PaymentClaimError('unknown_claim', 404);

	const photo = (letter.attachments ?? []).find((a: any) => a.isBrowserSafeImage);
	if (!photo) throw new PaymentClaimError('no_photo', 400, 'La carta no tiene foto adjunta');

	const paymentId = randomUUID();
	let receiptUrl: string;
	let receiptS3Key: string | null = null;

	if (config.avatar.storage === 's3' && photo.storageKey) {
		const processed = await processLetterPhoto(photo.storageKey, photo.mimeType);
		const uploaded = await s3Service.uploadPaymentReceipt(
			paymentId,
			processed.buffer,
			processed.contentType,
		);
		receiptUrl = uploaded.url;
		receiptS3Key = uploaded.key;
	} else {
		// Dev sin S3: el adjunto de la carta ya es data-URL de imagen — se copia
		// tal cual como comprobante del pago.
		receiptUrl = photo.storageUrl;
	}

	const paymentDate = body.paymentDate ? new Date(`${body.paymentDate}T12:00:00`) : new Date();
	const payment = AppDataSource.getRepository(Payment).create({
		id: paymentId,
		participantId,
		retreatId: letter.retreatId,
		amount: body.amount,
		paymentDate,
		paymentMethod: body.paymentMethod ?? 'transfer',
		referenceNumber: body.reference || undefined,
		notes: body.notes || undefined,
		receiptUrl,
		receiptS3Key: receiptS3Key ?? undefined,
		recordedBy: userId,
	});

	await AppDataSource.transaction(async (em) => {
		await em.insert(Payment, payment);
		await em.update(Letter, letter.id, {
			status: 'attached',
		});
	});

	void domainAuditService.logCreate('payment', paymentId, payment, {
		retreatId: letter.retreatId,
		fields: ['participantId', 'amount', 'paymentDate', 'paymentMethod', 'referenceNumber'],
	});
	void domainAuditService.log({
		action: DomainAuditAction.PAYMENT_RECEIPT_FROM_LETTER,
		resourceType: 'payment',
		retreatId: letter.retreatId,
		metadata: { letterId, paymentId, amount: body.amount },
	});

	return { paymentId };
}
