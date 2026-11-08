import { Request, Response } from 'express';
import { authorizationService } from '../middleware/authorization';
import { domainAuditService } from '../services/domainAuditService';
import { DomainAuditAction } from '@repo/types';
import { s3Service } from '../services/s3Service';
import {
	activateMailboxesForRetreat,
	buildMailboxAddress,
	fullName,
	getMailboxesForRetreat,
	markMailboxShared,
	setMailboxEnabled,
} from '../services/letterMailboxService';
import {
	getLetterDetail,
	getLetterFolders,
	getLetterRetreatId,
	getPrintBatch,
	letterCountsByStatus,
	listLetters,
	markPrinted,
	reviewLetter,
	unmarkPrinted,
} from '../services/letterService';
import type { Letter } from '../entities/letter.entity';
import type { LetterAttachment } from '../entities/letterAttachment.entity';
import type {
	Letter as LetterDTO,
	LetterAttachment as LetterAttachmentDTO,
	LetterStatus,
} from '@repo/types';

const asId = (value: unknown): string | undefined => {
	const str = typeof value === 'string' ? value.trim() : '';
	return /^[0-9a-f-]{36}$/i.test(str) ? str : undefined;
};

const attachmentToDTO = async (
	attachment: LetterAttachment,
): Promise<LetterAttachmentDTO> => ({
	id: attachment.id,
	letterId: attachment.letterId,
	fileName: attachment.fileName,
	mimeType: attachment.mimeType,
	sizeBytes: attachment.sizeBytes,
	isBrowserSafeImage: attachment.isBrowserSafeImage,
	// PDF: firmado «inline» para verlo en el navegador. Fotos y documentos de
	// Office: la descarga de siempre (el objeto se guardó como attachment).
	storageUrl: await s3Service.presignPrivateUrl(
		attachment.storageUrl,
		attachment.mimeType === 'application/pdf' ? { inlineAs: 'application/pdf' } : {},
	),
	sortOrder: attachment.sortOrder,
	createdAt: attachment.createdAt,
});

const letterToDTO = async (letter: Letter): Promise<LetterDTO> => {
	const rp = letter.retreatParticipant;
	return {
		id: letter.id,
		retreatId: letter.retreatId,
		retreatParticipantId: letter.retreatParticipantId,
		participantId: rp?.participantId ?? null,
		participantName: rp?.participant ? fullName(rp.participant) : undefined,
		tableId: rp?.tableId ?? null,
		tableName: rp?.tableMesa?.name ?? null,
		fromEmail: letter.fromEmail,
		fromName: letter.fromName ?? null,
		subject: letter.subject ?? null,
		bodyText: letter.bodyText,
		status: letter.status,
		receivedAt: letter.receivedAt,
		warnings: letter.warnings ?? null,
		reviewedAt: letter.reviewedAt ?? null,
		printedAt: letter.printedAt ?? null,
		printedBatchId: letter.printedBatchId ?? null,
		attachments: await Promise.all((letter.attachments ?? []).map(attachmentToDTO)),
	};
};

/**
 * GET /retreats/:retreatId/letters — bandeja. Lectura de contenido sensible:
 * queda auditada (mismo criterio que participant.health_view).
 */
export const listLettersHandler = async (req: Request, res: Response) => {
	try {
		const { retreatId } = req.params;
		const result = await listLetters(retreatId, {
			participantId: asId(req.query.participantId),
			retreatParticipantId: asId(req.query.retreatParticipantId),
			tableId: asId(req.query.tableId),
			status: ((req.query.status as string) || '') as LetterStatus | '',
			q: (req.query.q as string) || undefined,
			palanquero: (req.query.palanquero as string) || undefined,
		});
		const letters = await Promise.all(result.letters.map(letterToDTO));
		void domainAuditService.log({
			action: DomainAuditAction.LETTER_INBOX_VIEW,
			resourceType: 'letter',
			retreatId,
			metadata: {
				count: letters.length,
				counts: result.counts,
				filters: {
					participantId: req.query.participantId || undefined,
					tableId: req.query.tableId || undefined,
					status: req.query.status || undefined,
					q: req.query.q || undefined,
					palanquero: req.query.palanquero || undefined,
				},
			},
		});
		res.json({ letters, counts: result.counts });
	} catch (error) {
		console.error('listLetters error:', error);
		res.status(500).json({ message: 'Error al listar las cartas' });
	}
};

/** GET /letters/:id — detalle con adjuntos presigned (auditado). */
export const getLetterHandler = async (req: Request, res: Response) => {
	try {
		const detail = await getLetterDetail(req.params.id);
		if (!detail) return res.status(404).json({ message: 'Carta no encontrada' });
		const userId = (req as any).user?.id;
		const allowed = await authorizationService.hasRetreatAccess(userId, detail.letter.retreatId);
		if (!allowed) return res.status(403).json({ message: 'Forbidden' });
		void domainAuditService.log({
			action: DomainAuditAction.LETTER_INBOX_VIEW,
			resourceType: 'letter',
			retreatId: detail.letter.retreatId,
			metadata: { letterId: detail.letter.id },
		});
		res.json({
			letter: await letterToDTO(detail.letter),
			participant: detail.participant,
			tableName: detail.tableName,
		});
	} catch (error) {
		console.error('getLetter error:', error);
		res.status(500).json({ message: 'Error al obtener la carta' });
	}
};

/** PATCH /letters/:id/review — approve/hide con sello de revisión. */
export const reviewLetterHandler = async (req: Request, res: Response) => {
	try {
		const userId = (req as any).user?.id;
		const status = req.body?.status as 'approved' | 'hidden';
		// Recurso más específico: el permiso letter:update NO basta solo — hay que
		// tener acceso al retiro de ESA carta (regla anti-IDOR del repo).
		const target = await getLetterRetreatId(req.params.id);
		if (!target) return res.status(404).json({ message: 'Carta no encontrada' });
		if (!(await authorizationService.hasRetreatAccess(userId, target.retreatId))) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		const letter = await reviewLetter(target.id, status, userId);
		void domainAuditService.log({
			action: DomainAuditAction.LETTER_REVIEW,
			resourceType: 'letter',
			retreatId: target.retreatId,
			metadata: { letterId: target.id, status },
		});
		res.json({ letter: await letterToDTO(letter!) });
	} catch (error) {
		console.error('reviewLetter error:', error);
		res.status(500).json({ message: 'Error al revisar la carta' });
	}
};

/** POST /retreats/:retreatId/letters/mailbox/activate — activación idempotente. */
export const activateMailboxesHandler = async (req: Request, res: Response) => {
	try {
		const result = await activateMailboxesForRetreat(req.params.retreatId);
		res.json(result);
	} catch (error) {
		console.error('activateMailboxes error:', error);
		res.status(500).json({ message: 'Error al activar los buzones' });
	}
};

/** GET /retreats/:retreatId/letters/counts — conteo por estado (badge). */
export const letterCountsHandler = async (req: Request, res: Response) => {
	try {
		const counts = await letterCountsByStatus(req.params.retreatId);
		res.json({ counts });
	} catch (error) {
		console.error('letterCounts error:', error);
		res.status(500).json({ message: 'Error al contar las cartas' });
	}
};

/** GET /retreats/:retreatId/letters/mailbox — lista con contadores. */
export const getMailboxesHandler = async (req: Request, res: Response) => {
	try {
		const mailboxes = await getMailboxesForRetreat(req.params.retreatId);
		res.json({ mailboxes });
	} catch (error) {
		console.error('getMailboxes error:', error);
		res.status(500).json({ message: 'Error al listar los buzones' });
	}
};

/** PATCH /retreats/:retreatId/letters/mailbox/:retreatParticipantId — toggle. */
export const toggleMailboxHandler = async (req: Request, res: Response) => {
	try {
		const enabled = Boolean(req.body?.mailboxEnabled);
		const rp = await setMailboxEnabled(req.params.retreatId, req.params.retreatParticipantId, enabled);
		void domainAuditService.log({
			action: DomainAuditAction.LETTER_MAILBOX_TOGGLE,
			resourceType: 'letter',
			retreatId: req.params.retreatId,
			metadata: { retreatParticipantId: rp.id, mailboxEnabled: enabled },
		});
		res.json({
			retreatParticipantId: rp.id,
			mailboxCode: rp.mailboxCode,
			mailboxAddress: rp.mailboxCode ? buildMailboxAddress(rp.mailboxCode) : null,
			mailboxEnabled: rp.mailboxEnabled,
			mailboxIssuedAt: rp.mailboxIssuedAt,
		});
	} catch (error) {
		if (error instanceof Error && error.message === 'RetreatParticipant not found') {
			return res.status(404).json({ message: 'Participante del retiro no encontrado' });
		}
		console.error('toggleMailbox error:', error);
		res.status(500).json({ message: 'Error al actualizar el buzón' });
	}
};

/**
 * POST /retreats/:retreatId/letters/mailbox/:retreatParticipantId/shared —
 * marca de difusión (mejora 9): la dirección ya se mandó a la familia.
 */
export const markMailboxSharedHandler = async (req: Request, res: Response) => {
	try {
		const sharedAt = await markMailboxShared(req.params.retreatId, req.params.retreatParticipantId);
		void domainAuditService.log({
			action: DomainAuditAction.LETTER_MAILBOX_MARK_SHARED,
			resourceType: 'letter',
			retreatId: req.params.retreatId,
			metadata: { retreatParticipantId: req.params.retreatParticipantId },
		});
		res.json({ retreatParticipantId: req.params.retreatParticipantId, mailboxSharedAt: sharedAt });
	} catch (error) {
		if (error instanceof Error && error.message === 'RetreatParticipant not found') {
			return res.status(404).json({ message: 'Participante del retiro no encontrado' });
		}
		console.error('markMailboxShared error:', error);
		res.status(500).json({ message: 'Error al marcar la difusión' });
	}
};

/** POST /retreats/:retreatId/letters/print-unmark — quita la marca de impresa. */
export const unmarkPrintedHandler = async (req: Request, res: Response) => {
	try {
		const { letterIds, participantIds } = req.body as {
			letterIds?: string[];
			participantIds?: string[];
		};
		const unmarked = await unmarkPrinted(req.params.retreatId, { letterIds, participantIds });
		void domainAuditService.log({
			action: DomainAuditAction.LETTER_PRINT_UNMARK,
			resourceType: 'letter',
			retreatId: req.params.retreatId,
			metadata: {
				count: unmarked,
				letterIds: letterIds?.length ? letterIds : undefined,
				participantIds: participantIds?.length ? participantIds : undefined,
			},
		});
		res.json({ unmarked });
	} catch (error) {
		console.error('unmarkPrinted error:', error);
		res.status(500).json({ message: 'Error al quitar la marca de impresa' });
	}
};

/** GET /retreats/:retreatId/letters/folders — estado del folder por participante. */
export const getFoldersHandler = async (req: Request, res: Response) => {
	try {
		const folders = await getLetterFolders(req.params.retreatId);
		res.json({ folders });
	} catch (error) {
		console.error('getFolders error:', error);
		res.status(500).json({ message: 'Error al listar las carpetas' });
	}
};

/** POST /retreats/:retreatId/letters/print-mark — marca el lote impreso. */
export const markPrintedHandler = async (req: Request, res: Response) => {
	try {
		const { letterIds, batchId } = req.body as { letterIds: string[]; batchId: string };
		const marked = await markPrinted(req.params.retreatId, letterIds, batchId);
		void domainAuditService.log({
			action: DomainAuditAction.LETTER_PRINT_MARK,
			resourceType: 'letter',
			retreatId: req.params.retreatId,
			metadata: { batchId, count: marked },
		});
		res.json({ marked });
	} catch (error) {
		console.error('markPrinted error:', error);
		res.status(500).json({ message: 'Error al marcar las cartas impresas' });
	}
};

/** GET /retreats/:retreatId/letters/print-batch — datos ordenados para imprimir. */
export const getPrintBatchHandler = async (req: Request, res: Response) => {
	try {
		const scope = (req.query.scope as 'participant' | 'table' | 'retreat') || 'retreat';
		const participantIds = ((req.query.participantIds as string) || '')
			.split(',')
			.map((s) => s.trim())
			.filter((s) => /^[0-9a-f-]{36}$/i.test(s));
		const tableId = asId(req.query.tableId);
		const onlyUnprinted = req.query.onlyUnprinted === 'true';
		const entries = await getPrintBatch(
			req.params.retreatId,
			scope,
			participantIds,
			tableId,
			onlyUnprinted,
		);
		void domainAuditService.log({
			action: DomainAuditAction.LETTER_INBOX_VIEW,
			resourceType: 'letter',
			retreatId: req.params.retreatId,
			metadata: {
				count: entries.reduce((sum, entry) => sum + entry.letters.length, 0),
				printScope: scope,
			},
		});
		res.json({ entries });
	} catch (error) {
		console.error('getPrintBatch error:', error);
		res.status(500).json({ message: 'Error al armar el lote de impresión' });
	}
};
