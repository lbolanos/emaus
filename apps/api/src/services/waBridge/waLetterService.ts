import { randomUUID } from 'crypto';
import { AppDataSource } from '../../data-source';
import { config as envConfig } from '../../config/env';
import { Letter } from '../../entities/letter.entity';
import { LetterAttachment } from '../../entities/letterAttachment.entity';
import { RetreatParticipant } from '../../entities/retreatParticipant.entity';
import { WhatsappInboxMessage } from '../../entities/whatsappInboxMessage.entity';
import { s3Service } from '../s3Service';
import { emitLetterReceived } from '../../realtime';

/**
 * "Add as letter" (specs/whatsapp-inbox v1.3, D20): turns an inbox message
 * into a Letter of a retreat participant, so it is reviewed and printed with
 * the letters that arrive by email (specs/letters-email).
 *
 * Sibling of letterService.ingestLetter, not a call into it: ingestLetter
 * resolves the mailbox from an email address. The letter is created
 * 'approved' — a staff member chose it on purpose, which is the review — and
 * deduplicated by `messageId = whatsapp:<inboxMessageId>`.
 *
 * Attachments follow the letters rule: only browser-safe images print. A PDF
 * reaches this function already rendered to PNG by the browser (pdf.js), so
 * the server never parses PDFs.
 *
 * v1.5 (D26): the letter may also keep the ORIGINAL document (Word, PDF,
 * PowerPoint…) — families send letters that way. It arrives already
 * downloaded and verified by the letters' classifier (no macros, no HTML) and
 * is stored like a mailbox attachment: listed and opened from the folder,
 * printed only when it is a browser-safe image.
 */

export class WaLetterError extends Error {
	constructor(
		public readonly httpStatus: number,
		message: string,
	) {
		super(message);
		this.name = 'WaLetterError';
	}
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_BODY_CHARS = 20000;

/** Printable image types by magic bytes (same set the letters print). */
function detectPrintableImage(buffer: Buffer): string | null {
	if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return 'image/jpeg';
	}
	if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return 'image/png';
	}
	if (
		buffer.length > 12 &&
		buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
		buffer.slice(8, 12).toString('ascii') === 'WEBP'
	) {
		return 'image/webp';
	}
	return null;
}

/** data:image/...;base64,... → Buffer (plain slicing: no regex on MBs of base64). */
export function dataUrlToBuffer(dataUrl: string): Buffer | null {
	const marker = ';base64,';
	const at = dataUrl.indexOf(marker);
	if (!dataUrl.startsWith('data:') || at === -1) return null;
	try {
		return Buffer.from(dataUrl.slice(at + marker.length), 'base64');
	} catch {
		return null;
	}
}

export interface CreateLetterFromWhatsappInput {
	message: WhatsappInboxMessage;
	retreatParticipantId: string;
	bodyText: string;
	senderName: string;
	attachment?: { fileName: string; dataUrl: string } | null;
	/** v1.5: the original document, verified server-side (waBridgeService.downloadRawMedia). */
	document?: { fileName: string; mimeType: string; buffer: Buffer; printable: boolean } | null;
	actorUserId: string;
}

interface PendingAttachment {
	id: string;
	fileName: string;
	mimeType: string;
	buffer: Buffer;
	printable: boolean;
}

export async function createLetterFromWhatsapp(
	input: CreateLetterFromWhatsappInput,
): Promise<{ letterId: string; duplicate: boolean }> {
	const { message } = input;
	const messageId = `whatsapp:${message.id}`;

	const existing = await AppDataSource.getRepository(Letter).findOne({
		where: { messageId },
		select: ['id'],
	});
	if (existing) return { letterId: existing.id, duplicate: true };

	const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
		where: { id: input.retreatParticipantId },
		relations: ['participant'],
	});
	if (!rp || rp.retreatId !== message.retreatId) {
		throw new WaLetterError(400, 'El participante elegido no pertenece a este retiro.');
	}

	const bodyText = input.bodyText.trim().slice(0, MAX_BODY_CHARS);
	if (!bodyText) {
		throw new WaLetterError(400, 'La carta necesita texto. Escribe al menos una línea.');
	}

	const attachments: PendingAttachment[] = [];
	if (input.attachment) {
		const buffer = dataUrlToBuffer(input.attachment.dataUrl);
		if (!buffer || buffer.length === 0) {
			throw new WaLetterError(400, 'El adjunto no es una imagen válida.');
		}
		if (buffer.length > MAX_ATTACHMENT_BYTES) {
			throw new WaLetterError(400, 'El adjunto supera 8 MB. Usa una imagen más ligera.');
		}
		const mimeType = detectPrintableImage(buffer);
		if (!mimeType) {
			throw new WaLetterError(400, 'Solo se imprimen imágenes JPG, PNG o WebP.');
		}
		attachments.push({
			id: randomUUID(),
			fileName: input.attachment.fileName.slice(0, 200) || 'whatsapp',
			mimeType,
			buffer,
			printable: true,
		});
	}
	if (input.document) {
		attachments.push({
			id: randomUUID(),
			fileName: input.document.fileName.slice(0, 200) || 'whatsapp',
			mimeType: input.document.mimeType,
			buffer: input.document.buffer,
			printable: input.document.printable,
		});
	}

	// Upload outside the transaction (same accepted risk as ingestLetter: an
	// orphan private object if the DB insert fails afterwards).
	const letterId = randomUUID();
	const stored: Array<{ url: string; key: string }> = [];
	for (const attachment of attachments) {
		stored.push(
			envConfig.avatar.storage === 's3'
				? await s3Service.uploadLetterAttachment(
						letterId,
						attachment.id,
						attachment.fileName,
						attachment.buffer,
						attachment.mimeType,
					)
				: {
						url: `data:${attachment.mimeType};base64,${attachment.buffer.toString('base64')}`,
						key: '',
					},
		);
	}

	const now = new Date();
	await AppDataSource.transaction(async (em) => {
		await em.save(
			em.create(Letter, {
				id: letterId,
				retreatId: rp.retreatId,
				retreatParticipantId: rp.id,
				fromEmail: `whatsapp:+${message.chatPhone}`,
				fromName: `${input.senderName} (WhatsApp)`.slice(0, 200),
				subject: null,
				bodyText,
				status: 'approved',
				messageId,
				receivedAt: message.timestamp,
				warnings: null,
				reviewedAt: now,
				reviewedById: input.actorUserId,
			}),
		);
		for (const [index, attachment] of attachments.entries()) {
			await em.insert(LetterAttachment, {
				id: attachment.id,
				letterId,
				fileName: attachment.fileName,
				mimeType: attachment.mimeType,
				sizeBytes: attachment.buffer.length,
				isBrowserSafeImage: attachment.printable,
				storageKey: stored[index].key,
				storageUrl: stored[index].url,
				sortOrder: index,
			});
		}
		await em.update(
			WhatsappInboxMessage,
			{ id: message.id },
			{ letterId, letterAddedById: input.actorUserId, letterAddedAt: now },
		);
	});

	const participant = rp.participant;
	emitLetterReceived({
		retreatId: rp.retreatId,
		letterId,
		participantName: participant
			? `${participant.firstName ?? ''} ${participant.lastName ?? ''}`.trim()
			: '',
	});
	return { letterId, duplicate: false };
}
