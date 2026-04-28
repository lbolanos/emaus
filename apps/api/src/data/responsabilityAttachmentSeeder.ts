import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ResponsabilityAttachment } from '../entities/responsabilityAttachment.entity';
import {
	charlaDocumentation,
	responsibilityDocumentation,
} from './charlaDocumentation';

const MAX_CONTENT_LENGTH = 200 * 1024; // mismo límite que el service

/**
 * Carga los guiones canónicos de `charlaDocumentation.ts` (charlas + roles
 * operativos del manual oficial Emaús) como attachments markdown globales,
 * vinculados por nombre canónico de Responsabilidad.
 *
 * - Fuente única: `data/charlaDocumentation.ts` (47 entradas: 21 charlas/textos
 *   + 26 roles).
 * - Idempotente: si ya existe ALGÚN attachment para ese `responsabilityName`,
 *   no crea otro (no sobrescribe ediciones del usuario).
 * - Pensado para correr en cada boot — solo carga lo que falta.
 */
export async function seedResponsabilityAttachmentsFromDescriptions(): Promise<{
	created: number;
	skipped: number;
}> {
	const attRepo = AppDataSource.getRepository(ResponsabilityAttachment);

	const sourceByName = new Map<string, string>();
	for (const [name, content] of Object.entries(charlaDocumentation)) {
		if (!name || !content) continue;
		sourceByName.set(name.trim(), content);
	}
	for (const [name, content] of Object.entries(responsibilityDocumentation)) {
		if (!name || !content) continue;
		sourceByName.set(name.trim(), content);
	}

	const longestByName = new Map<string, string>();
	for (const [name, content] of sourceByName) {
		if (content.length > MAX_CONTENT_LENGTH) continue;
		longestByName.set(name, content);
	}

	if (longestByName.size === 0) return { created: 0, skipped: 0 };

	// ¿Cuáles ya tienen attachment? (matching por nombre exacto del rol).
	const existingRows = await attRepo.find({
		where: { responsabilityName: In(Array.from(longestByName.keys())) },
		select: ['responsabilityName'],
	});
	const alreadySeeded = new Set(existingRows.map((e) => e.responsabilityName));

	let created = 0;
	let skipped = 0;
	const toInsert: ResponsabilityAttachment[] = [];

	for (const [name, content] of longestByName) {
		if (alreadySeeded.has(name)) {
			skipped++;
			continue;
		}
		const titleBase = `Guion ${name}`.replace(/[\\/]/g, '-').slice(0, 200);
		const fileName = `${titleBase}.md`;
		const sizeBytes = Buffer.byteLength(content, 'utf-8');
		const storageUrl = `data:text/markdown;charset=utf-8;base64,${Buffer.from(content, 'utf-8').toString('base64')}`;

		toInsert.push(
			attRepo.create({
				responsabilityName: name,
				kind: 'markdown',
				fileName,
				mimeType: 'text/markdown',
				sizeBytes,
				storageUrl,
				storageKey: null,
				content,
				description: 'Guion canónico del manual Emaús (Anexos A-2 / A-5).',
				sortOrder: 10,
				uploadedById: null,
			}),
		);
		created++;
	}

	if (toInsert.length) {
		await attRepo.save(toInsert);
	}

	return { created, skipped };
}
