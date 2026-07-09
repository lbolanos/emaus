import { randomUUID } from 'crypto';
import { AppDataSource } from '../data-source';
import { RetreatPreparation } from '../entities/retreatPreparation.entity';
import { RetreatPreparationDocument } from '../entities/retreatPreparationDocument.entity';
import { Retreat } from '../entities/retreat.entity';
import { s3Service } from './s3Service';
import { avatarStorageService } from './avatarStorageService';
import { loadDefaultDocsForWeek } from '../data/preparationDocSeeder';

export class PreparationValidationError extends Error {}
export class PreparationNotFoundError extends Error {}

const MAX_BYTES = 15 * 1024 * 1024; // 15MB (PDFs de preparaciones llegan a ~3MB)
// Sin S3 el archivo vive inline como data-url en la DB. 2MB cubre los DOCX
// reales de las preparaciones (la 6ª pesa ~1.1MB); con S3 aplica solo MAX_BYTES.
const MAX_INLINE_BYTES = 2 * 1024 * 1024;
const MAX_MD_BYTES = 200 * 1024; // 200KB de markdown
const MAX_DOCS_PER_PREPARATION = 10;

const ALLOWED_MIMES = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/webp',
]);

interface GenerateInput {
	weeks: number;
	firstDate: string; // YYYY-MM-DD
	time: string; // HH:MM (hora local del retiro)
	clearExisting?: boolean;
	// Adjunta a cada semana los documentos por defecto (serie IX) del seeder.
	includeDefaultDocs?: boolean;
}

interface UploadDocumentInput {
	fileName: string;
	mimeType: string;
	dataUrl: string;
}

/** Suma días a una fecha date-only leyendo componentes UTC (nunca hora local del server). */
export function addDaysYmd(ymd: string, days: number): string {
	const d = new Date(`${ymd}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function ordinalEs(n: number): string {
	return `${n}ª preparación`;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
	const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
	if (!match) throw new PreparationValidationError('Invalid data URL');
	return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function slugFileName(name: string): string {
	const parts = name.split('.');
	const ext = parts.length > 1 ? parts.pop()! : '';
	const base = parts.join('.') || 'file';
	const safeBase = base
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9-_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60);
	const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
	return safeExt ? `${safeBase || 'file'}.${safeExt}` : safeBase || 'file';
}

class RetreatPreparationService {
	// Lazy repo lookup: los tests re-cablean AppDataSource a un SQLite in-memory
	// después de que este módulo carga (mismo patrón que responsabilityAttachmentService).
	private get repo() {
		return AppDataSource.getRepository(RetreatPreparation);
	}

	private get docRepo() {
		return AppDataSource.getRepository(RetreatPreparationDocument);
	}

	private get retreatRepo() {
		return AppDataSource.getRepository(Retreat);
	}

	async listForRetreat(retreatId: string): Promise<RetreatPreparation[]> {
		const rows = await this.repo.find({
			where: { retreatId },
			relations: ['documents'],
		});
		return this.sortEntries(rows);
	}

	async get(id: string): Promise<RetreatPreparation | null> {
		return this.repo.findOne({ where: { id }, relations: ['documents'] });
	}

	/**
	 * Orden del calendario: por fecha ascendente; en la misma fecha, el festivo
	 * (break) va antes que la sesión; entradas sin fecha al final por sortOrder.
	 */
	private sortEntries(rows: RetreatPreparation[]): RetreatPreparation[] {
		return [...rows].sort((a, b) => {
			if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
			if (a.date && !b.date) return -1;
			if (!a.date && b.date) return 1;
			if (a.date === b.date && a.type !== b.type) return a.type === 'break' ? -1 : 1;
			return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
		});
	}

	/**
	 * Genera el calendario semanal: `weeks` sesiones a partir de `firstDate`,
	 * una por semana, todas a la misma hora. El número de semanas es variable
	 * (típicamente 7 a 9). Si ya existe calendario, exige clearExisting.
	 */
	async generate(retreatId: string, input: GenerateInput): Promise<RetreatPreparation[]> {
		const existing = await this.repo.find({ where: { retreatId }, relations: ['documents'] });
		if (existing.length > 0 && !input.clearExisting) {
			throw new PreparationValidationError(
				'Ya existe un calendario de preparaciones. Usa "Reemplazar todo" para regenerarlo.',
			);
		}
		if (existing.length > 0 && input.clearExisting) {
			for (const prep of existing) {
				for (const doc of prep.documents ?? []) {
					await this.deleteStoredFile(doc);
				}
			}
			await this.repo.delete({ retreatId });
		}

		const created: RetreatPreparation[] = [];
		for (let week = 1; week <= input.weeks; week++) {
			const entity = this.repo.create({
				retreatId,
				type: 'session',
				weekNumber: week,
				title: ordinalEs(week),
				date: addDaysYmd(input.firstDate, (week - 1) * 7),
				time: input.time,
				sortOrder: week * 10,
			});
			created.push(await this.repo.save(entity));
		}

		if (input.includeDefaultDocs) {
			for (const session of created) {
				for (const doc of loadDefaultDocsForWeek(session.weekNumber!)) {
					try {
						await this.addDocument(session.id, doc);
					} catch (err) {
						console.warn(
							`[retreatPreparationService] no se pudo adjuntar doc por defecto (semana ${session.weekNumber})`,
							err,
						);
					}
				}
			}
		}

		return this.listForRetreat(retreatId);
	}

	async create(
		retreatId: string,
		input: Partial<RetreatPreparation>,
	): Promise<RetreatPreparation> {
		const entity = this.repo.create({
			retreatId,
			type: (input.type as any) ?? 'session',
			weekNumber: input.weekNumber ?? null,
			title: input.title || 'Preparación',
			description: input.description ?? null,
			date: input.date ?? null,
			time: input.time ?? null,
			sortOrder: input.sortOrder ?? 0,
		});
		return this.repo.save(entity);
	}

	async update(
		id: string,
		patch: Partial<RetreatPreparation>,
	): Promise<RetreatPreparation | null> {
		const existing = await this.repo.findOne({ where: { id } });
		if (!existing) return null;
		if (patch.type !== undefined) existing.type = patch.type;
		if (patch.weekNumber !== undefined) existing.weekNumber = patch.weekNumber;
		if (patch.title !== undefined) existing.title = patch.title;
		if (patch.description !== undefined) existing.description = patch.description;
		if (patch.date !== undefined) existing.date = patch.date;
		if (patch.time !== undefined) existing.time = patch.time;
		if (patch.sortOrder !== undefined) existing.sortOrder = patch.sortOrder;
		await this.repo.save(existing);
		return this.get(id);
	}

	async remove(id: string): Promise<boolean> {
		const existing = await this.repo.findOne({ where: { id }, relations: ['documents'] });
		if (!existing) return false;
		for (const doc of existing.documents ?? []) {
			await this.deleteStoredFile(doc);
		}
		await this.repo.delete(id);
		return true;
	}

	/**
	 * Salta la fecha de una sesión por festivo: registra un 'break' en la fecha
	 * original y **adelanta una semana (−7 días) esa sesión y todas las
	 * anteriores**. Las posteriores no se mueven: el final del calendario queda
	 * anclado antes del retiro (la fecha del retiro es fija), así que el
	 * calendario crece hacia atrás tomando una fecha anterior para la primera.
	 * Los breaks existentes no se mueven (son fechas de calendario fijas).
	 */
	async skipForHoliday(id: string, reason?: string): Promise<RetreatPreparation[]> {
		const prep = await this.repo.findOne({ where: { id } });
		if (!prep) throw new PreparationNotFoundError('Preparación no encontrada');
		if (prep.type !== 'session') {
			throw new PreparationValidationError('Solo se puede saltar una sesión');
		}
		if (!prep.date) {
			throw new PreparationValidationError('La sesión no tiene fecha asignada');
		}

		const skippedDate = prep.date;
		const all = await this.repo.find({ where: { retreatId: prep.retreatId } });

		const toShift = all.filter((p) => p.type === 'session' && p.date && p.date <= skippedDate);
		for (const session of toShift) {
			session.date = addDaysYmd(session.date!, -7);
			await this.repo.save(session);
		}

		const breakEntry = this.repo.create({
			retreatId: prep.retreatId,
			type: 'break',
			weekNumber: null,
			title: reason?.trim() || 'Festivo — no hay preparación',
			date: skippedDate,
			time: null,
			sortOrder: prep.sortOrder,
		});
		await this.repo.save(breakEntry);

		return this.listForRetreat(prep.retreatId);
	}

	async addDocument(
		preparationId: string,
		input: UploadDocumentInput,
	): Promise<RetreatPreparationDocument> {
		const prep = await this.repo.findOne({ where: { id: preparationId } });
		if (!prep) throw new PreparationNotFoundError('Preparación no encontrada');
		if (prep.type !== 'session') {
			throw new PreparationValidationError('Solo las sesiones pueden tener documentos');
		}

		const { buffer, mimeType: parsedMime } = parseDataUrl(input.dataUrl);
		const mimeType = (input.mimeType || parsedMime).toLowerCase();
		if (!ALLOWED_MIMES.has(mimeType)) {
			throw new PreparationValidationError(`Tipo de archivo no permitido: ${mimeType}`);
		}
		if (buffer.byteLength > MAX_BYTES) {
			throw new PreparationValidationError('El archivo excede 15MB');
		}

		const existingCount = await this.docRepo.count({ where: { preparationId } });
		if (existingCount >= MAX_DOCS_PER_PREPARATION) {
			throw new PreparationValidationError(
				`Máximo ${MAX_DOCS_PER_PREPARATION} documentos por preparación`,
			);
		}

		const fileName = (input.fileName || 'documento').slice(0, 200);
		let url: string;
		let storageKey: string | null = null;

		if (avatarStorageService.isS3Storage()) {
			// Bajo `public-assets/` para reusar la bucket policy pública existente:
			// el calendario y sus archivos son públicos por diseño.
			const path = `preparations/${prep.retreatId}/${randomUUID()}-${slugFileName(fileName)}`;
			const result = await s3Service.uploadPublicAsset(path, buffer, mimeType);
			url = result.url;
			storageKey = path;
		} else {
			if (buffer.byteLength > MAX_INLINE_BYTES) {
				throw new PreparationValidationError('Archivo > 2MB requiere S3 configurado.');
			}
			url = `data:${mimeType};base64,${buffer.toString('base64')}`;
		}

		const entity = this.docRepo.create({
			preparationId,
			fileName,
			mimeType,
			sizeBytes: buffer.byteLength,
			url,
			storageKey,
			sortOrder: (existingCount + 1) * 10,
		});
		return this.docRepo.save(entity);
	}

	/**
	 * Documento de texto (markdown) editable in-app — mismo modelo dual que
	 * los docs de responsabilidades. No sube nada a S3: `content` vive en DB.
	 */
	async createMarkdownDocument(
		preparationId: string,
		input: { title: string; content?: string },
	): Promise<RetreatPreparationDocument> {
		const prep = await this.repo.findOne({ where: { id: preparationId } });
		if (!prep) throw new PreparationNotFoundError('Preparación no encontrada');
		if (prep.type !== 'session') {
			throw new PreparationValidationError('Solo las sesiones pueden tener documentos');
		}

		const existingCount = await this.docRepo.count({ where: { preparationId } });
		if (existingCount >= MAX_DOCS_PER_PREPARATION) {
			throw new PreparationValidationError(
				`Máximo ${MAX_DOCS_PER_PREPARATION} documentos por preparación`,
			);
		}

		const title = (input.title || 'Documento').slice(0, 200).trim() || 'Documento';
		const content = input.content ?? '';
		const sizeBytes = Buffer.byteLength(content, 'utf-8');
		if (sizeBytes > MAX_MD_BYTES) {
			throw new PreparationValidationError('El texto excede 200KB');
		}

		const fileName = title.endsWith('.md') ? title : `${title}.md`;
		const entity = this.docRepo.create({
			preparationId,
			kind: 'markdown',
			content,
			fileName,
			mimeType: 'text/markdown',
			sizeBytes,
			url: `data:text/markdown;charset=utf-8;base64,${Buffer.from(content, 'utf-8').toString('base64')}`,
			storageKey: null,
			sortOrder: (existingCount + 1) * 10,
		});
		return this.docRepo.save(entity);
	}

	async updateMarkdownDocument(
		docId: string,
		patch: { title?: string; content?: string },
	): Promise<RetreatPreparationDocument> {
		const existing = await this.docRepo.findOne({ where: { id: docId } });
		if (!existing) throw new PreparationNotFoundError('Documento no encontrado');
		if (existing.kind !== 'markdown') {
			throw new PreparationValidationError('Este documento no es de texto');
		}
		if (patch.title !== undefined) {
			const title = patch.title.slice(0, 200).trim() || 'Documento';
			existing.fileName = title.endsWith('.md') ? title : `${title}.md`;
		}
		if (patch.content !== undefined) {
			const sizeBytes = Buffer.byteLength(patch.content, 'utf-8');
			if (sizeBytes > MAX_MD_BYTES) {
				throw new PreparationValidationError('El texto excede 200KB');
			}
			existing.content = patch.content;
			existing.sizeBytes = sizeBytes;
			existing.url = `data:text/markdown;charset=utf-8;base64,${Buffer.from(patch.content, 'utf-8').toString('base64')}`;
		}
		return this.docRepo.save(existing);
	}

	async getDocument(docId: string): Promise<RetreatPreparationDocument | null> {
		return this.docRepo.findOne({ where: { id: docId }, relations: ['preparation'] });
	}

	async removeDocument(docId: string): Promise<boolean> {
		const existing = await this.docRepo.findOne({ where: { id: docId } });
		if (!existing) return false;
		await this.deleteStoredFile(existing);
		await this.docRepo.delete(docId);
		return true;
	}

	private async deleteStoredFile(doc: RetreatPreparationDocument): Promise<void> {
		if (!doc.storageKey) return;
		try {
			await s3Service.deletePublicAsset(doc.storageKey);
		} catch (err) {
			console.warn('[retreatPreparationService] S3 delete failed', err);
		}
	}

	/**
	 * Vista pública por slug. Requiere retreat.isPublic (mismo gate que el
	 * Santísimo público). Devuelve solo datos mínimos del retiro.
	 */
	async getPublicBySlug(slug: string): Promise<{
		retreat: { id: string; parish?: string | null; startDate?: Date | null; endDate?: Date | null };
		preparations: RetreatPreparation[];
	} | null> {
		const retreat = await this.retreatRepo.findOne({ where: { slug } });
		if (!retreat || !retreat.isPublic) return null;
		const preparations = await this.listForRetreat(retreat.id);
		return {
			retreat: {
				id: retreat.id,
				parish: retreat.parish ?? null,
				startDate: retreat.startDate ?? null,
				endDate: retreat.endDate ?? null,
			},
			preparations,
		};
	}
}

export const retreatPreparationService = new RetreatPreparationService();
