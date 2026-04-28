import { randomUUID } from 'crypto';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ResponsabilityAttachment } from '../entities/responsabilityAttachment.entity';
import { s3Service } from './s3Service';
import { avatarStorageService } from './avatarStorageService';

export class AttachmentValidationError extends Error {}
export class AttachmentNotFoundError extends Error {}

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_INLINE_BYTES = 1 * 1024 * 1024; // 1MB cuando no hay S3
const MAX_PER_RESPONSABILITY = 5;
const MAX_MD_BYTES = 200 * 1024; // 200KB

const ALLOWED_MIMES = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/webp',
]);

interface UploadInput {
	dataUrl: string;
	fileName: string;
	mimeType: string;
	description?: string | null;
}

interface MarkdownInput {
	title: string;
	content: string;
	description?: string | null;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
	const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
	if (!match) throw new AttachmentValidationError('Invalid data URL');
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

function slugResponsability(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9-_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 80) || 'responsability';
}

function normalizeName(name: string): string {
	return (name ?? '').trim();
}

class ResponsabilityAttachmentService {
	// Lazy repo lookup: tests re-cable AppDataSource to an in-memory SQLite
	// after this module first loads. Capturing the repo eagerly leaves the
	// singleton pointing at a stale (pre-test) DataSource whose entity-class
	// reference no longer matches the metadata registered on the test
	// DataSource — TypeORM then throws "Class constructor X cannot be
	// invoked without 'new'" inside .find(). The getter ensures every call
	// resolves the repo against whatever AppDataSource currently is.
	private get repo() {
		return AppDataSource.getRepository(ResponsabilityAttachment);
	}

	async list(responsabilityName: string): Promise<ResponsabilityAttachment[]> {
		const name = normalizeName(responsabilityName);
		if (!name) return [];
		return this.repo.find({
			where: { responsabilityName: name },
			order: { sortOrder: 'ASC', createdAt: 'ASC' },
		});
	}

	/**
	 * Carga attachments para múltiples nombres canónicos en una sola query y
	 * los devuelve agrupados. Usado por list/get del schedule para popular
	 * `attachments` en cada item sin N+1.
	 *
	 * **Variante "lite"**: excluye `content` y `storageUrl` (que para markdown
	 * inline puede pesar hasta 200KB). El timeline solo necesita metadata para
	 * mostrar el badge `📎 N`; cuando el usuario abre el dialog, el frontend
	 * llama a `list(name)` que sí trae el contenido completo.
	 */
	async listForNames(
		responsabilityNames: string[],
	): Promise<Map<string, ResponsabilityAttachment[]>> {
		const map = new Map<string, ResponsabilityAttachment[]>();
		const normalized = Array.from(
			new Set(responsabilityNames.map(normalizeName).filter((n) => !!n)),
		);
		if (!normalized.length) return map;
		const rows = await this.repo.find({
			where: { responsabilityName: In(normalized) },
			order: { sortOrder: 'ASC', createdAt: 'ASC' },
			select: [
				'id',
				'responsabilityName',
				'kind',
				'fileName',
				'mimeType',
				'sizeBytes',
				'description',
				'sortOrder',
				'createdAt',
				'updatedAt',
			],
		});
		for (const r of rows) {
			const arr = map.get(r.responsabilityName) ?? [];
			arr.push(r);
			map.set(r.responsabilityName, arr);
		}
		return map;
	}

	async upload(
		responsabilityName: string,
		input: UploadInput,
		userId?: string | null,
	): Promise<ResponsabilityAttachment> {
		const name = normalizeName(responsabilityName);
		if (!name) throw new AttachmentValidationError('Responsabilidad inválida');

		const { buffer, mimeType: parsedMime } = parseDataUrl(input.dataUrl);
		const mimeType = (input.mimeType || parsedMime).toLowerCase();

		if (!ALLOWED_MIMES.has(mimeType)) {
			throw new AttachmentValidationError(`Tipo de archivo no permitido: ${mimeType}`);
		}
		if (buffer.byteLength > MAX_BYTES) {
			throw new AttachmentValidationError('El archivo excede 10MB');
		}

		const existingCount = await this.repo.count({
			where: { responsabilityName: name },
		});
		if (existingCount >= MAX_PER_RESPONSABILITY) {
			throw new AttachmentValidationError(
				`Máximo ${MAX_PER_RESPONSABILITY} archivos por responsabilidad`,
			);
		}

		const fileName = (input.fileName || 'archivo').slice(0, 200);
		let storageUrl: string;
		let storageKey: string | null = null;

		if (avatarStorageService.isS3Storage()) {
			// Sube bajo el prefijo `public-assets/` para reusar la bucket policy
			// que ya expone esa carpeta como pública (`s3:GetObject` para todos).
			// Los guiones canónicos del manual Emaús son públicos por naturaleza;
			// cualquier doc custom es semi-público (necesita la URL exacta para leer).
			const path = `responsability-attachments/${slugResponsability(name)}/${randomUUID()}-${slugFileName(fileName)}`;
			const result = await s3Service.uploadPublicAsset(path, buffer, mimeType);
			storageUrl = result.url;
			storageKey = path;
		} else {
			if (buffer.byteLength > MAX_INLINE_BYTES) {
				throw new AttachmentValidationError(
					'Archivo > 1MB requiere S3 configurado.',
				);
			}
			storageUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
		}

		const next = (existingCount + 1) * 10;
		const entity = this.repo.create({
			responsabilityName: name,
			kind: 'file',
			fileName,
			mimeType,
			sizeBytes: buffer.byteLength,
			storageUrl,
			storageKey,
			content: null,
			description: input.description ?? null,
			sortOrder: next,
			uploadedById: userId ?? null,
		});
		return this.repo.save(entity);
	}

	async createMarkdown(
		responsabilityName: string,
		input: MarkdownInput,
		userId?: string | null,
	): Promise<ResponsabilityAttachment> {
		const name = normalizeName(responsabilityName);
		if (!name) throw new AttachmentValidationError('Responsabilidad inválida');

		const title = (input.title || 'Documento').slice(0, 200).trim();
		if (!title) throw new AttachmentValidationError('Título requerido');
		const content = input.content ?? '';
		const sizeBytes = Buffer.byteLength(content, 'utf-8');
		if (sizeBytes > MAX_MD_BYTES) {
			throw new AttachmentValidationError('El texto excede 200KB');
		}

		const existingCount = await this.repo.count({
			where: { responsabilityName: name },
		});
		if (existingCount >= MAX_PER_RESPONSABILITY) {
			throw new AttachmentValidationError(
				`Máximo ${MAX_PER_RESPONSABILITY} archivos por responsabilidad`,
			);
		}

		const fileName = title.endsWith('.md') ? title : `${title}.md`;
		const storageUrl = `data:text/markdown;charset=utf-8;base64,${Buffer.from(content, 'utf-8').toString('base64')}`;
		const next = (existingCount + 1) * 10;
		const entity = this.repo.create({
			responsabilityName: name,
			kind: 'markdown',
			fileName,
			mimeType: 'text/markdown',
			sizeBytes,
			storageUrl,
			storageKey: null,
			content,
			description: input.description ?? null,
			sortOrder: next,
			uploadedById: userId ?? null,
		});
		return this.repo.save(entity);
	}

	async update(
		attachmentId: string,
		patch: { description?: string | null; sortOrder?: number },
	): Promise<ResponsabilityAttachment> {
		const existing = await this.repo.findOne({ where: { id: attachmentId } });
		if (!existing) throw new AttachmentNotFoundError('attachment not found');
		if (patch.description !== undefined) existing.description = patch.description;
		if (patch.sortOrder !== undefined) existing.sortOrder = patch.sortOrder;
		return this.repo.save(existing);
	}

	async updateMarkdown(
		attachmentId: string,
		patch: { title?: string; content?: string; description?: string | null },
	): Promise<ResponsabilityAttachment> {
		const existing = await this.repo.findOne({ where: { id: attachmentId } });
		if (!existing) throw new AttachmentNotFoundError('attachment not found');
		if (existing.kind !== 'markdown') {
			throw new AttachmentValidationError('Este attachment no es markdown');
		}
		if (patch.title !== undefined) {
			const title = patch.title.slice(0, 200).trim() || 'Documento';
			existing.fileName = title.endsWith('.md') ? title : `${title}.md`;
		}
		if (patch.content !== undefined) {
			const sizeBytes = Buffer.byteLength(patch.content, 'utf-8');
			if (sizeBytes > MAX_MD_BYTES) {
				throw new AttachmentValidationError('El texto excede 200KB');
			}
			existing.content = patch.content;
			existing.sizeBytes = sizeBytes;
			existing.storageUrl = `data:text/markdown;charset=utf-8;base64,${Buffer.from(patch.content, 'utf-8').toString('base64')}`;
		}
		if (patch.description !== undefined) existing.description = patch.description;
		return this.repo.save(existing);
	}

	async delete(attachmentId: string): Promise<void> {
		const existing = await this.repo.findOne({ where: { id: attachmentId } });
		if (!existing) throw new AttachmentNotFoundError('attachment not found');
		if (existing.storageKey) {
			try {
				await s3Service.deletePublicAsset(existing.storageKey);
			} catch (err) {
				console.warn('[responsabilityAttachmentService] S3 delete failed', err);
			}
		}
		await this.repo.delete(attachmentId);
	}
}

export const responsabilityAttachmentService = new ResponsabilityAttachmentService();
