import { randomUUID } from 'crypto';
import { AppDataSource } from '../data-source';
import { config } from '../config/env';
import { Letter, LetterStatus } from '../entities/letter.entity';
import { LetterAttachment } from '../entities/letterAttachment.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { s3Service } from './s3Service';
import { resolveMailbox, fullName, MAILBOX_ELIGIBLE_TYPES } from './letterMailboxService';
import { emitLetterReceived } from '../realtime';
import { tableNumberOf } from '../utils/tableNaming';
import { LETTER_PALANQUERO_NONE } from '@repo/types';
import type { InboundLetterPayload, LetterFolderRow, LetterPrintBatchEntry } from '@repo/types';

// Topes del ingest (D11). El Worker aplica los mismos ANTES de postear; el API
// nunca confía en el cliente.
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 12 * 1024 * 1024;

export type LetterIngestErrorCode =
	| 'unknown_mailbox'
	| 'mailbox_disabled'
	| 'duplicate'
	| 'too_large'
	| 'invalid_payload'
	| 'no_body';

export class LetterIngestError extends Error {
	constructor(
		public readonly code: LetterIngestErrorCode,
		public readonly httpStatus: number,
		message?: string,
	) {
		super(message ?? code);
		this.name = 'LetterIngestError';
	}
}

/** Imágenes y PDF por magic bytes (HEIC y PDF se guardan pero no se imprimen). */
const IMAGE_MIME_BY_MAGIC: { mime: string; browserSafe: boolean; test: (b: Buffer) => boolean }[] = [
	{
		mime: 'image/jpeg',
		browserSafe: true,
		test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	},
	{
		mime: 'image/png',
		browserSafe: true,
		test: (b) =>
			b.length >= 8 &&
			b[0] === 0x89 &&
			b[1] === 0x50 &&
			b[2] === 0x4e &&
			b[3] === 0x47 &&
			b[4] === 0x0d &&
			b[5] === 0x0a &&
			b[6] === 0x1a &&
			b[7] === 0x0a,
	},
	{
		mime: 'image/gif',
		browserSafe: true,
		test: (b) => b.length > 6 && b.slice(0, 6).toString('ascii').startsWith('GIF8'),
	},
	{
		mime: 'image/webp',
		browserSafe: true,
		test: (b) =>
			b.length > 12 &&
			b.slice(0, 4).toString('ascii') === 'RIFF' &&
			b.slice(8, 12).toString('ascii') === 'WEBP',
	},
	{
		// HEIC/HEIF: contenedor ISOBMFF con brand heic/heif/mif1 en bytes 8-12.
		mime: 'image/heic',
		browserSafe: false,
		test: (b) => {
			if (b.length < 12 || b.slice(4, 8).toString('ascii') !== 'ftyp') return false;
			const brand = b.slice(8, 12).toString('ascii');
			return brand.startsWith('heic') || brand.startsWith('heif') || brand.startsWith('mif1');
		},
	},
	{
		mime: 'application/pdf',
		browserSafe: false,
		test: (b) => b.length > 5 && b.slice(0, 5).toString('ascii') === '%PDF-',
	},
];

/**
 * Documentos que se guardan (no se imprimen; se abren o descargan desde la
 * bandeja): el contenedor se verifica por magic bytes y la extensión decide
 * el tipo concreto. Sin macros: los .docm/.pptm/.xlsm y cualquier contenedor
 * con proyecto VBA o Basic se descartan — es la vía habitual de malware en
 * adjuntos de Office.
 */
const DOCUMENT_BY_EXT: Record<string, { mime: string; container: 'ooxml' | 'odf' | 'ole' | 'text' }> = {
	docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', container: 'ooxml' },
	pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', container: 'ooxml' },
	xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', container: 'ooxml' },
	odt: { mime: 'application/vnd.oasis.opendocument.text', container: 'odf' },
	odp: { mime: 'application/vnd.oasis.opendocument.presentation', container: 'odf' },
	ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', container: 'odf' },
	doc: { mime: 'application/msword', container: 'ole' },
	ppt: { mime: 'application/vnd.ms-powerpoint', container: 'ole' },
	xls: { mime: 'application/vnd.ms-excel', container: 'ole' },
	txt: { mime: 'text/plain', container: 'text' },
};

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const hasMacros = (buffer: Buffer, container: 'ooxml' | 'odf' | 'ole'): boolean => {
	if (container === 'ooxml') return buffer.includes('vbaProject.bin');
	if (container === 'odf') return buffer.includes('Basic/');
	// OLE: los nombres del directorio van en UTF-16LE.
	return (
		buffer.includes(Buffer.from('_VBA_PROJECT', 'utf16le')) ||
		buffer.includes(Buffer.from('Macros', 'utf16le'))
	);
};

export type AttachmentClassification =
	| { kind: 'stored'; mime: string; browserSafe: boolean }
	| { kind: 'rejected'; reason: 'unsupported' | 'macros' };

/**
 * Clasifica un adjunto (D11): el mimeType declarado viene del remitente y no
 * se confía en él. Imágenes y PDF por magic bytes; documentos por contenedor
 * (magic bytes) + extensión. Todo lo demás (ejecutables, comprimidos, HTML,
 * SVG…) se descarta con warning.
 */
export const classifyAttachment = (buffer: Buffer, fileName: string): AttachmentClassification => {
	for (const entry of IMAGE_MIME_BY_MAGIC) {
		if (entry.test(buffer)) return { kind: 'stored', mime: entry.mime, browserSafe: entry.browserSafe };
	}
	const ext = (fileName.split('.').pop() ?? '').toLowerCase();
	if (['docm', 'pptm', 'xlsm', 'dotm', 'potm', 'xltm'].includes(ext)) {
		return { kind: 'rejected', reason: 'macros' };
	}
	const doc = DOCUMENT_BY_EXT[ext];
	if (!doc) return { kind: 'rejected', reason: 'unsupported' };

	if (doc.container === 'text') {
		const isUtf8 = Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
		return !buffer.includes(0) && isUtf8
			? { kind: 'stored', mime: doc.mime, browserSafe: false }
			: { kind: 'rejected', reason: 'unsupported' };
	}
	const isZip = buffer.subarray(0, 4).equals(ZIP_MAGIC);
	const containerOk =
		doc.container === 'ooxml'
			? isZip && buffer.includes('[Content_Types].xml')
			: doc.container === 'odf'
				? isZip && buffer.includes('mimetype') && buffer.includes(doc.mime)
				: buffer.subarray(0, 8).equals(OLE_MAGIC);
	if (!containerOk) return { kind: 'rejected', reason: 'unsupported' };
	if (hasMacros(buffer, doc.container)) return { kind: 'rejected', reason: 'macros' };
	return { kind: 'stored', mime: doc.mime, browserSafe: false };
};

/**
 * Conversión local HTML → texto (sin dependencias nuevas, D10/D15). Regexes
 * lineales sobre el HTML del email (memoria: backtracking catastrófico con
 * data-URLs enormes — sin cuantificadores anidados, y se recortan los
 * <style>/<script> antes de quitar tags).
 */
export const htmlToText = (html: string): string => {
	let text = html
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<head[\s\S]*?<\/head>/gi, ' ');
	text = text
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
		.replace(/<[^>]+>/g, '');
	text = text
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&#(\d+);/g, (_m, code) => {
			const n = Number(code);
			return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
		});
	// Colapsar solo espacios/blanklines redundantes, conservando saltos reales.
	return text
		.replace(/[ \t\r]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
};

const deriveBodyText = (payload: InboundLetterPayload): string => {
	const text = (payload.text ?? '').trim();
	if (text) return text;
	const html = (payload.html ?? '').trim();
	if (html) return htmlToText(html);
	return '';
};

export interface IngestResult {
	status: 'accepted' | 'duplicate';
	letterId?: string;
	duplicate: boolean;
}

export async function ingestLetter(payload: InboundLetterPayload): Promise<IngestResult> {
	// 1) Dedupe primero: un reintento del Worker no debe re-procesar adjuntos.
	if (payload.messageId) {
		const existing = await AppDataSource.getRepository(Letter).findOne({
			where: { messageId: payload.messageId },
			select: ['id'],
		});
		if (existing) return { status: 'duplicate', letterId: existing.id, duplicate: true };
	}

	// 2) Buzón destino.
	const resolution = await resolveMailbox(payload.to);
	if (resolution.status === 'unknown') throw new LetterIngestError('unknown_mailbox', 404);
	if (resolution.status === 'disabled') throw new LetterIngestError('mailbox_disabled', 404);
	const rp = resolution.retreatParticipant;

	// 3) Cuerpo solo texto (D10): el HTML nunca se persiste.
	const bodyText = deriveBodyText(payload);
	if (!bodyText) throw new LetterIngestError('no_body', 400, 'Email sin cuerpo de texto');

	// 4) Adjuntos: topes + clasificación por magic bytes.
	const rawAttachments = payload.attachments ?? [];
	const warnings: string[] = [];
	const attachments: {
		id: string;
		fileName: string;
		mimeType: string;
		sizeBytes: number;
		isBrowserSafeImage: boolean;
		buffer: Buffer;
		sortOrder: number;
	}[] = [];

	let totalBytes = 0;
	for (const attachment of rawAttachments) {
		if (attachments.length >= MAX_ATTACHMENTS) {
			warnings.push(`Adjunto "${attachment.fileName}" descartado: excede el máximo de ${MAX_ATTACHMENTS}`);
			continue;
		}
		let buffer: Buffer;
		try {
			buffer = Buffer.from(attachment.contentBase64, 'base64');
		} catch {
			warnings.push(`Adjunto "${attachment.fileName}" descartado: base64 inválido`);
			continue;
		}
		if (buffer.length === 0) {
			warnings.push(`Adjunto "${attachment.fileName}" descartado: vacío`);
			continue;
		}
		if (buffer.length > MAX_ATTACHMENT_BYTES) {
			warnings.push(
				`Adjunto "${attachment.fileName}" descartado: supera ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`,
			);
			continue;
		}
		if (totalBytes + buffer.length > MAX_TOTAL_ATTACHMENT_BYTES) {
			warnings.push(`Adjunto "${attachment.fileName}" descartado: se superó el total por carta`);
			continue;
		}
		const classified = classifyAttachment(buffer, attachment.fileName);
		if (classified.kind === 'rejected') {
			warnings.push(
				classified.reason === 'macros'
					? `Adjunto "${attachment.fileName}" descartado: documento con macros`
					: `Adjunto "${attachment.fileName}" descartado: formato no soportado (${attachment.mimeType})`,
			);
			continue;
		}
		totalBytes += buffer.length;
		attachments.push({
			id: randomUUID(),
			fileName: attachment.fileName,
			mimeType: classified.mime,
			sizeBytes: buffer.length,
			isBrowserSafeImage: classified.browserSafe,
			buffer,
			sortOrder: attachments.length,
		});
	}

	// 5) Subida a S3 (fuera de la transacción: si la DB falla luego, quedan
	// objetos privados huérfanos — riesgo aceptado en la spec, R8 del rollback).
	const letterId = randomUUID();
	const uploaded: { url: string; key: string }[] = [];
	for (const attachment of attachments) {
		if (config.avatar.storage === 's3') {
			uploaded.push(
				await s3Service.uploadLetterAttachment(
					letterId,
					attachment.id,
					attachment.fileName,
					attachment.buffer,
					attachment.mimeType,
				),
			);
		} else {
			// Dev sin S3: data URL inline (patrón de retreat_memory_photo). El presign
			// es no-op para data: URLs, así que la lectura funciona igual.
			uploaded.push({
				url: `data:${attachment.mimeType};base64,${attachment.buffer.toString('base64')}`,
				key: '',
			});
		}
	}

	// 6) Insert transaccional de carta + adjuntos.
	try {
		await AppDataSource.transaction(async (em) => {
			const letter = em.create(Letter, {
				id: letterId,
				retreatId: rp.retreatId,
				retreatParticipantId: rp.id,
				fromEmail: payload.from,
				fromName: payload.fromName ?? null,
				subject: payload.subject ?? null,
				bodyText,
				status: 'pending' as LetterStatus,
				messageId: payload.messageId ?? null,
				receivedAt: payload.receivedAt ?? new Date(),
				warnings: warnings.length ? warnings : null,
			});
			await em.save(letter);
			for (let i = 0; i < attachments.length; i++) {
				await em.insert(LetterAttachment, {
					id: attachments[i].id,
					letterId,
					fileName: attachments[i].fileName,
					mimeType: attachments[i].mimeType,
					sizeBytes: attachments[i].sizeBytes,
					isBrowserSafeImage: attachments[i].isBrowserSafeImage,
					storageKey: uploaded[i].key,
					storageUrl: uploaded[i].url,
					sortOrder: attachments[i].sortOrder,
				});
			}
		});
	} catch (error) {
		// Carrera con otro reintento simultáneo del Worker: unique violation del
		// messageId = el otro ganó; responder duplicate, no 500.
		if (
			payload.messageId &&
			error instanceof Error &&
			error.message.includes('UQ_letters_message_id')
		) {
			return { status: 'duplicate', duplicate: true };
		}
		throw error;
	}

	// Badge del sidebar + bandeja en vivo (realtime; fire-and-forget).
	emitLetterReceived({
		retreatId: rp.retreatId,
		letterId,
		participantName: fullName(rp.participant),
	});

	return { status: 'accepted', letterId, duplicate: false };
}

export interface ListLettersFilters {
	participantId?: string;
	retreatParticipantId?: string;
	tableId?: string;
	status?: LetterStatus | '';
	q?: string;
	palanquero?: string;
}

export async function listLetters(retreatId: string, filters: ListLettersFilters) {
	const qb = AppDataSource.getRepository(Letter)
		.createQueryBuilder('letter')
		.leftJoinAndSelect('letter.retreatParticipant', 'rp')
		.leftJoinAndSelect('rp.participant', 'participant')
		.leftJoinAndSelect('rp.tableMesa', 'table')
		.leftJoinAndSelect('letter.attachments', 'attachment')
		.where('letter.retreatId = :retreatId', { retreatId });

	if (filters.participantId) {
		qb.andWhere('rp.participantId = :participantId', { participantId: filters.participantId });
	}
	if (filters.retreatParticipantId) {
		qb.andWhere('letter.retreatParticipantId = :rpId', { rpId: filters.retreatParticipantId });
	}
	if (filters.tableId) {
		qb.andWhere('rp.tableId = :tableId', { tableId: filters.tableId });
	}
	if (filters.palanquero === LETTER_PALANQUERO_NONE) {
		qb.andWhere(`(rp.palancasCoordinator IS NULL OR rp.palancasCoordinator = '')`);
	} else if (filters.palanquero) {
		qb.andWhere('rp.palancasCoordinator = :palanquero', { palanquero: filters.palanquero });
	}
	if (filters.status) {
		qb.andWhere('letter.status = :status', { status: filters.status });
	}
	if (filters.q) {
		const like = `%${filters.q.replace(/[%_]/g, '\\$&')}%`;
		qb.andWhere(
			`(letter.bodyText LIKE :like ESCAPE '\\' OR letter.subject LIKE :like ESCAPE '\\' OR letter.fromName LIKE :like ESCAPE '\\' OR letter.fromEmail LIKE :like ESCAPE '\\')`,
			{ like },
		);
	}
	qb.orderBy('letter.receivedAt', 'DESC').limit(500);

	const [letters, counts] = await Promise.all([qb.getMany(), letterCountsByStatus(retreatId)]);
	return { letters, counts };
}

/** Conteo por estado para el badge del sidebar y los chips de la bandeja. */
export async function letterCountsByStatus(
	retreatId: string,
): Promise<{ pending: number; approved: number; hidden: number; attached: number }> {
	const countsRaw: { status: string; c: number }[] = await AppDataSource.query(
		`SELECT "status", COUNT(*) AS c FROM "letters" WHERE "retreatId" = ? GROUP BY "status"`,
		[retreatId],
	);
	const counts = { pending: 0, approved: 0, hidden: 0, attached: 0 };
	for (const row of countsRaw) {
		if (row.status in counts) counts[row.status as keyof typeof counts] = Number(row.c);
	}
	return counts;
}

/**
 * Estado del folder por participante (vista Carpetas): los elegibles para buzón
 * del retiro más cualquiera que ya tenga cartas (p. ej. cancelado después de
 * recibirlas), con sus cartas por estado y cuántas aprobadas siguen sin papel.
 */
export async function getLetterFolders(retreatId: string): Promise<LetterFolderRow[]> {
	const countRows: { rpId: string; status: string; printed: number; c: number }[] =
		await AppDataSource.query(
			`SELECT "retreatParticipantId" AS rpId, "status",
			        CASE WHEN "printedAt" IS NULL THEN 0 ELSE 1 END AS printed,
			        COUNT(*) AS c
			 FROM "letters" WHERE "retreatId" = ?
			 GROUP BY "retreatParticipantId", "status", printed`,
			[retreatId],
		);
	const withLetters = new Set(countRows.map((r) => r.rpId));
	// Adjuntos que no van en el papel (PDF, Office, HEIC), por participante.
	const documentRows: { rpId: string; c: number }[] = await AppDataSource.query(
		`SELECT l."retreatParticipantId" AS rpId, COUNT(a."id") AS c
		 FROM "letter_attachments" a JOIN "letters" l ON l."id" = a."letterId"
		 WHERE l."retreatId" = ? AND a."isBrowserSafeImage" = 0 AND l."status" IN ('pending', 'approved')
		 GROUP BY l."retreatParticipantId"`,
		[retreatId],
	);
	const documentsByRp = new Map(documentRows.map((r) => [r.rpId, Number(r.c)]));

	const qb = AppDataSource.getRepository(RetreatParticipant)
		.createQueryBuilder('rp')
		.leftJoinAndSelect('rp.participant', 'participant')
		.leftJoinAndSelect('rp.tableMesa', 'table')
		.where('rp.retreatId = :retreatId', { retreatId });
	const eligible = `(rp.isCancelled = false AND rp.type IN (:...types) AND participant.dataDeletedAt IS NULL)`;
	if (withLetters.size > 0) {
		qb.andWhere(`(${eligible} OR rp.id IN (:...withLetters))`, {
			types: MAILBOX_ELIGIBLE_TYPES,
			withLetters: [...withLetters],
		});
	} else {
		qb.andWhere(eligible, { types: MAILBOX_ELIGIBLE_TYPES });
	}
	const rps = await qb.getMany();

	const byRp = new Map<string, Pick<LetterFolderRow, 'counts' | 'printed' | 'unprinted'>>();
	for (const row of countRows) {
		const entry = byRp.get(row.rpId) ?? {
			counts: { pending: 0, approved: 0, hidden: 0, attached: 0 },
			printed: 0,
			unprinted: 0,
		};
		const n = Number(row.c);
		if (row.status in entry.counts) entry.counts[row.status as keyof LetterFolderRow['counts']] += n;
		if (row.status === 'approved') {
			if (Number(row.printed) === 1) entry.printed += n;
			else entry.unprinted += n;
		}
		byRp.set(row.rpId, entry);
	}

	return rps
		.map((rp): LetterFolderRow => {
			const stats = byRp.get(rp.id) ?? {
				counts: { pending: 0, approved: 0, hidden: 0, attached: 0 },
				printed: 0,
				unprinted: 0,
			};
			return {
				retreatParticipantId: rp.id,
				participantId: rp.participantId ?? null,
				participantName: fullName(rp.participant),
				participantType: rp.type ?? null,
				palancasCoordinator: rp.palancasCoordinator || null,
				tableId: rp.tableId ?? null,
				tableName: rp.tableMesa?.name ?? null,
				idOnRetreat: rp.idOnRetreat ?? null,
				mailboxEnabled: rp.mailboxEnabled,
				mailboxSharedAt: rp.mailboxSharedAt ? rp.mailboxSharedAt.toISOString() : null,
				...stats,
				documents: documentsByRp.get(rp.id) ?? 0,
			};
		})
		.sort((a, b) => {
			const tableDiff =
				(tableNumberOf(a.tableName ?? '') ?? Number.MAX_SAFE_INTEGER) -
				(tableNumberOf(b.tableName ?? '') ?? Number.MAX_SAFE_INTEGER);
			if (tableDiff !== 0) return tableDiff;
			return a.participantName.localeCompare(b.participantName, 'es');
		});
}

/** {id, retreatId} mínimo para el chequeo de acceso al recurso específico. */
export async function getLetterRetreatId(
	letterId: string,
): Promise<{ id: string; retreatId: string } | null> {
	const letter = await AppDataSource.getRepository(Letter).findOne({
		where: { id: letterId },
		select: ['id', 'retreatId'],
	});
	return letter ? { id: letter.id, retreatId: letter.retreatId } : null;
}

export async function reviewLetter(letterId: string, status: 'approved' | 'hidden', userId: string) {
	const repo = AppDataSource.getRepository(Letter);
	const letter = await repo.findOne({ where: { id: letterId } });
	if (!letter) return null;
	letter.status = status;
	letter.reviewedAt = new Date();
	letter.reviewedById = userId;
	await repo.save(letter);
	return letter;
}

/**
 * Marca impresas solo cartas aprobadas del retiro (anti-IDOR por recurso).
 * Con `batchId` es la confirmación de un lote: sella las cartas de ese papel,
 * aunque ya estuvieran impresas (se reimprimió). Sin `batchId` es la marca a
 * mano: solo las que faltaban, para no pisar la fecha de las ya impresas; el
 * lote queda en null porque no salieron de una vista previa.
 */
export async function markPrinted(
	retreatId: string,
	target: { letterIds?: string[]; participantIds?: string[] },
	batchId?: string,
): Promise<number> {
	const letterIds = target.letterIds ?? [];
	const participantIds = target.participantIds ?? [];
	if (letterIds.length === 0 && participantIds.length === 0) return 0;

	const qb = AppDataSource.getRepository(Letter)
		.createQueryBuilder('letter')
		.innerJoin('letter.retreatParticipant', 'rp')
		.select('letter.id', 'id')
		.where('letter.retreatId = :retreatId', { retreatId })
		.andWhere('letter.status = :status', { status: 'approved' });
	if (!batchId) qb.andWhere('letter.printedAt IS NULL');
	const either: string[] = [];
	if (letterIds.length) either.push('letter.id IN (:...letterIds)');
	if (participantIds.length) either.push('rp.participantId IN (:...participantIds)');
	qb.andWhere(`(${either.join(' OR ')})`, { letterIds, participantIds });
	const rows: { id: string }[] = await qb.getRawMany();
	const ids = rows.map((r) => r.id);
	if (ids.length === 0) return 0;

	const result = await AppDataSource.getRepository(Letter)
		.createQueryBuilder()
		.update(Letter)
		.set({ printedAt: new Date(), printedBatchId: batchId ?? null })
		.where('retreatId = :retreatId AND id IN (:...ids)', { retreatId, ids })
		.execute();
	return result.affected ?? 0;
}

/**
 * Quita la marca de impresa. Siempre acotado al retiro: ids de cartas o de
 * participantes de otro retiro no matchean (anti-IDOR por recurso).
 */
export async function unmarkPrinted(
	retreatId: string,
	target: { letterIds?: string[]; participantIds?: string[] },
): Promise<number> {
	const letterIds = target.letterIds ?? [];
	const participantIds = target.participantIds ?? [];
	if (letterIds.length === 0 && participantIds.length === 0) return 0;

	const qb = AppDataSource.getRepository(Letter)
		.createQueryBuilder('letter')
		.innerJoin('letter.retreatParticipant', 'rp')
		.select('letter.id', 'id')
		.where('letter.retreatId = :retreatId', { retreatId })
		.andWhere('letter.printedAt IS NOT NULL');
	const either: string[] = [];
	if (letterIds.length) either.push('letter.id IN (:...letterIds)');
	if (participantIds.length) either.push('rp.participantId IN (:...participantIds)');
	qb.andWhere(`(${either.join(' OR ')})`, { letterIds, participantIds });
	const rows: { id: string }[] = await qb.getRawMany();
	const ids = rows.map((r) => r.id);
	if (ids.length === 0) return 0;

	const result = await AppDataSource.getRepository(Letter)
		.createQueryBuilder()
		.update(Letter)
		.set({ printedAt: null, printedBatchId: null })
		.where('retreatId = :retreatId AND id IN (:...ids)', { retreatId, ids })
		.execute();
	return result.affected ?? 0;
}

/** Detalle de una carta con adjuntos presigned (la URL cruda nunca sale del API). */
export async function getLetterDetail(letterId: string) {
	const letter = await AppDataSource.getRepository(Letter).findOne({
		where: { id: letterId },
		relations: ['retreatParticipant', 'retreatParticipant.participant', 'retreatParticipant.tableMesa', 'attachments'],
	});
	if (!letter) return null;
	const attachments = letter.attachments ?? [];
	for (const attachment of attachments) {
		attachment.storageUrl = await s3Service.presignPrivateUrl(attachment.storageUrl);
	}
	return {
		letter,
		participant: letter.retreatParticipant?.participant
			? {
					id: letter.retreatParticipant.participantId ?? null,
					name: fullName(letter.retreatParticipant.participant),
					cellPhone: letter.retreatParticipant.participant.cellPhone ?? null,
				}
			: null,
		tableName: letter.retreatParticipant?.tableMesa?.name ?? null,
		attachments,
	};
}

/**
 * Paquete de impresión (D13): solo cartas approved, ordenadas mesa (natural) →
 * idOnRetreat → apellido. Cada adjunto sale con URL presigned lista para <img>.
 */
export async function getPrintBatch(
	retreatId: string,
	scope: 'participant' | 'table' | 'retreat',
	participantIds: string[],
	tableId?: string,
	onlyUnprinted = false,
): Promise<LetterPrintBatchEntry[]> {
	const qb = AppDataSource.getRepository(Letter)
		.createQueryBuilder('letter')
		.leftJoinAndSelect('letter.retreatParticipant', 'rp')
		.leftJoinAndSelect('rp.participant', 'participant')
		.leftJoinAndSelect('rp.tableMesa', 'table')
		.leftJoinAndSelect('letter.attachments', 'attachment')
		.where('letter.retreatId = :retreatId', { retreatId })
		.andWhere('letter.status = :status', { status: 'approved' });

	// Lo que falta del folder: no reimprimir lo que ya está en la carpeta.
	if (onlyUnprinted) {
		qb.andWhere('letter.printedAt IS NULL');
	}
	if (scope === 'table' && tableId) {
		qb.andWhere('rp.tableId = :tableId', { tableId });
	}
	// Guard anti-footgun: pedir un participante sin ids NO puede regresar el
	// retiro entero (el caller marcaría todas las cartas como impresas).
	if (scope === 'participant' && participantIds.length === 0) {
		return [];
	}
	if (scope === 'participant') {
		qb.andWhere('rp.participantId IN (:...participantIds)', { participantIds });
	}
	const letters = await qb.orderBy('letter.receivedAt', 'ASC').getMany();

	// Presign en paralelo (caché del s3Service deduplica las repetidas).
	const attachmentRows = letters.flatMap((letter) => letter.attachments ?? []);
	await Promise.all(
		attachmentRows.map(async (attachment) => {
			attachment.storageUrl = await s3Service.presignPrivateUrl(attachment.storageUrl);
		}),
	);

	const byParticipant = new Map<string, LetterPrintBatchEntry>();
	for (const letter of letters) {
		const rp = letter.retreatParticipant;
		if (!rp) continue;
		const key = rp.id;
		let entry = byParticipant.get(key);
		if (!entry) {
			entry = {
				retreatParticipantId: rp.id,
				participantId: rp.participantId ?? null,
				participantName: fullName(rp.participant),
				idOnRetreat: rp.idOnRetreat ?? null,
				tableName: rp.tableMesa?.name ?? null,
				tableSortKey: rp.tableMesa?.name ?? '',
				letters: [],
			};
			byParticipant.set(key, entry);
		}
		entry.letters.push(letter);
	}
	return Array.from(byParticipant.values()).sort((a, b) => {
		const tableDiff =
			(tableNumberOf(a.tableSortKey) ?? Number.MAX_SAFE_INTEGER) -
			(tableNumberOf(b.tableSortKey) ?? Number.MAX_SAFE_INTEGER);
		if (tableDiff !== 0) return tableDiff;
		const idDiff = (a.idOnRetreat ?? Number.MAX_SAFE_INTEGER) - (b.idOnRetreat ?? Number.MAX_SAFE_INTEGER);
		if (idDiff !== 0) return idDiff;
		return a.participantName.localeCompare(b.participantName, 'es');
	});
}

/** Para el controller de buzones: teléfono E.164 base de la difusión (D14). */
export async function getRetreatParticipantCellPhone(retreatParticipantId: string): Promise<string | null> {
	const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
		where: { id: retreatParticipantId },
		relations: ['participant'],
	});
	return rp?.participant?.cellPhone ?? null;
}
