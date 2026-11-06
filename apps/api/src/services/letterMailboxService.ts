import { randomBytes } from 'crypto';
import { AppDataSource } from '../data-source';
import { config } from '../config/env';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { tableNumberOf } from '../utils/tableNaming';
import type { LetterMailboxRow } from '@repo/types';

// Alfabeto sin caracteres ambiguos (sin 0/O/1/I/L): una familia que teclea el
// código a mano no debería poder confundirlos.
const MAILBOX_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const MAILBOX_CODE_LENGTH = 8;
const MAILBOX_CODE_MAX_ATTEMPTS = 5;

export const LETTER_MAILBOX_LOCAL_PART_PREFIX = 'carta.';

export const buildMailboxAddress = (code: string): string =>
	`${LETTER_MAILBOX_LOCAL_PART_PREFIX}${code}@${config.letters.mailboxDomain}`;

/**
 * Código de buzón: 8 chars del alfabeto sin ambigüedad. Rechazo de bytes para
 * evitar el sesgo del módulo (248 = 8 × 31: los bytes >= 248 se descartan).
 */
export const generateMailboxCode = (): string => {
	let code = '';
	while (code.length < MAILBOX_CODE_LENGTH) {
		const bytes = randomBytes(MAILBOX_CODE_LENGTH * 2);
		for (const byte of bytes) {
			if (byte >= 248) continue;
			code += MAILBOX_CODE_ALPHABET[byte % MAILBOX_CODE_ALPHABET.length];
			if (code.length === MAILBOX_CODE_LENGTH) break;
		}
	}
	return code;
};

// Mismo criterio que la activación (D1/D4): sin cancelados, sin borrados, sin waiting.
export const MAILBOX_ELIGIBLE_TYPES = ['walker', 'server', 'partial_server'];

/**
 * Activa los buzones del retiro (idempotente, D4): genera código para los que
 * faltan, habilita los que crea, y no toca los existentes (ni sus toggles).
 */
export async function activateMailboxesForRetreat(
	retreatId: string,
): Promise<{ activated: number; alreadyActive: number }> {
	const repo = AppDataSource.getRepository(RetreatParticipant);
	const rows = await repo
		.createQueryBuilder('rp')
		.leftJoin('rp.participant', 'participant')
		.where('rp.retreatId = :retreatId', { retreatId })
		.andWhere('rp.isCancelled = false')
		.andWhere('rp.type IN (:...types)', { types: MAILBOX_ELIGIBLE_TYPES })
		.andWhere('participant.dataDeletedAt IS NULL')
		.getMany();

	let activated = 0;
	let alreadyActive = 0;
	for (const row of rows) {
		if (row.mailboxCode) {
			alreadyActive++;
			continue;
		}
		// Colisión: el índice único parcial es la última línea de defensa; el
		// chequeo previo evita casi todas las carreras.
		let assigned: string | null = null;
		for (let attempt = 0; attempt < MAILBOX_CODE_MAX_ATTEMPTS && !assigned; attempt++) {
			const candidate = generateMailboxCode();
			const clash = await repo.findOne({ where: { mailboxCode: candidate } });
			if (!clash) assigned = candidate;
		}
		if (!assigned) {
			throw new Error('No se pudo generar un código de buzón único (colisiones repetidas)');
		}
		row.mailboxCode = assigned;
		row.mailboxEnabled = true;
		row.mailboxIssuedAt = new Date();
		await repo.save(row);
		activated++;
	}
	return { activated, alreadyActive };
}

export type MailboxResolution =
	| { status: 'ok'; retreatParticipant: RetreatParticipant }
	| { status: 'unknown' }
	| { status: 'disabled' };

/**
 * Resuelve `carta.{CODE}@dominio` (case-insensitive) → (retiro, participante).
 * Distingue código desconocido (rebotar) de buzón deshabilitado (también
 * rebota, con causa distinta para el log).
 */
export async function resolveMailbox(address: string): Promise<MailboxResolution> {
	const normalized = address.trim().toLowerCase();
	const at = normalized.lastIndexOf('@');
	if (at === -1) return { status: 'unknown' };
	const localPart = normalized.slice(0, at);
	const domain = normalized.slice(at + 1);
	if (domain !== config.letters.mailboxDomain.toLowerCase()) return { status: 'unknown' };
	if (!localPart.startsWith(LETTER_MAILBOX_LOCAL_PART_PREFIX)) return { status: 'unknown' };
	const code = localPart.slice(LETTER_MAILBOX_LOCAL_PART_PREFIX.length);
	if (!code || code.length !== MAILBOX_CODE_LENGTH) return { status: 'unknown' };

	const upperCode = code.toUpperCase();
	const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
		where: { mailboxCode: upperCode },
		relations: ['participant'],
	});
	if (!rp) return { status: 'unknown' };
	if (!rp.mailboxEnabled) return { status: 'disabled' };
	return { status: 'ok', retreatParticipant: rp };
}

export async function setMailboxEnabled(
	retreatId: string,
	retreatParticipantId: string,
	enabled: boolean,
): Promise<RetreatParticipant> {
	const repo = AppDataSource.getRepository(RetreatParticipant);
	const rp = await repo.findOne({
		where: { id: retreatParticipantId, retreatId },
		relations: ['participant'],
	});
	if (!rp) throw new Error('RetreatParticipant not found');
	if (enabled && !rp.mailboxCode) {
		let assigned: string | null = null;
		for (let attempt = 0; attempt < MAILBOX_CODE_MAX_ATTEMPTS && !assigned; attempt++) {
			const candidate = generateMailboxCode();
			const clash = await repo.findOne({ where: { mailboxCode: candidate } });
			if (!clash) assigned = candidate;
		}
		if (!assigned) throw new Error('No se pudo generar un código de buzón único');
		rp.mailboxCode = assigned;
		rp.mailboxIssuedAt = new Date();
	}
	rp.mailboxEnabled = enabled;
	return repo.save(rp);
}

/** Nombre legible de un participante: "Nombre Apellido" o el apodo como fallback. */
export const fullName = (p: {
	firstName?: string | null;
	lastName?: string | null;
	nickname?: string | null;
} | null | undefined): string => {
	if (!p) return '—';
	return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.nickname || '—';
};

/** Lista de buzones para el dialog de gestión (con contadores de cartas). */
export async function getMailboxesForRetreat(retreatId: string): Promise<LetterMailboxRow[]> {
	const rows = await AppDataSource.getRepository(RetreatParticipant)
		.createQueryBuilder('rp')
		.leftJoinAndSelect('rp.participant', 'participant')
		.leftJoinAndSelect('rp.tableMesa', 'table')
		.where('rp.retreatId = :retreatId', { retreatId })
		.andWhere('rp.isCancelled = false')
		.andWhere('rp.type IN (:...types)', { types: MAILBOX_ELIGIBLE_TYPES })
		.andWhere('participant.dataDeletedAt IS NULL')
		.getMany();

	const countRows: { retreatParticipantId: string; status: string; c: string }[] =
		await AppDataSource.query(
			`SELECT "retreatParticipantId", "status", COUNT(*) AS c
			 FROM "letters" WHERE "retreatId" = ?
			 GROUP BY "retreatParticipantId", "status"`,
			[retreatId],
		);
	const counts = new Map<string, { pending: number; approved: number; hidden: number }>();
	for (const row of countRows) {
		const entry = counts.get(row.retreatParticipantId) ?? {
			pending: 0,
			approved: 0,
			hidden: 0,
		};
		entry[row.status as 'pending' | 'approved' | 'hidden'] = Number(row.c);
		counts.set(row.retreatParticipantId, entry);
	}

	return rows
		.map((rp): LetterMailboxRow => ({
			retreatParticipantId: rp.id,
			participantId: rp.participantId ?? null,
			participantName: fullName(rp.participant),
			participantType: rp.type ?? null,
			tableId: rp.tableId ?? null,
			tableName: rp.tableMesa?.name ?? null,
			cellPhone: rp.participant?.cellPhone ?? null,
			mailboxCode: rp.mailboxCode ?? null,
			mailboxAddress: rp.mailboxCode ? buildMailboxAddress(rp.mailboxCode) : null,
			mailboxEnabled: rp.mailboxEnabled,
			letterCounts: counts.get(rp.id) ?? { pending: 0, approved: 0, hidden: 0 },
		}))
		.sort((a, b) => {
			const tableDiff =
				(tableNumberOf(a.tableName ?? '') ?? Number.MAX_SAFE_INTEGER) -
				(tableNumberOf(b.tableName ?? '') ?? Number.MAX_SAFE_INTEGER);
			if (tableDiff !== 0) return tableDiff;
			return a.participantName.localeCompare(b.participantName, 'es');
		});
}
