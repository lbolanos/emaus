import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
	charlaDocumentation,
	responsibilityDocumentation,
} from '../../data/charlaDocumentation.js';
import { SERVICE_TEAM_INSTRUCTIONS } from '../../data/serviceTeamInstructions.js';
import {
	PREVIOUS_DOC_HASHES,
	PREVIOUS_TEAM_INSTRUCTION_HASHES,
} from '../../data/canonicalDocHashes.js';

/**
 * Propaga a las copias ya sembradas el bloque de sentido (Objetivo / Por qué importa /
 * La espiritualidad detrás / El regalo de servir aquí) que ahora abre cada documento
 * operativo.
 *
 * El contenido se copia a la base cuando se crea el retiro y cuando arranca el API, y
 * ninguno de esos caminos sobrescribe una copia existente. Sin esta migración, todo
 * entorno ya sembrado —producción incluida— seguiría mostrando el texto viejo para siempre.
 *
 * REGLA: se actualiza solo lo que nadie tocó. Se compara el SHA-256 de la fila contra las
 * revisiones canónicas congeladas en canonicalDocHashes.ts; si coincide, se reemplaza, y si
 * no, se deja intacto porque alguien lo editó. La única excepción son las descripciones que
 * el propio sistema dejó vacías o con el código de anexo suelto ("A-2-1"), que se rellenan.
 *
 * Antes de pisar el texto de un attachment se guarda la versión previa en
 * `responsability_attachment_history`, igual que hace el service al editar: así el
 * coordinador puede volver atrás desde el propio diálogo si prefiere el texto anterior.
 *
 * Importa solo módulos de datos sin dependencias. NO puede importar `dynamicsTemplates`
 * ni nada que encadene a `@repo/types`: en producción el loader resuelve las migraciones
 * contra `dist/` y esa cadena falla con "Unknown file extension .ts", dejando la migración
 * pending para siempre (ver la cabecera de AddMissingServiceTeams).
 *
 * Sin DDL → no requiere transaction = false. Idempotente: al correr de nuevo, las filas ya
 * actualizadas no coinciden con ningún hash previo y se dejan como están.
 */

const CANONICAL_DOCS: Record<string, string> = {
	...charlaDocumentation,
	...responsibilityDocumentation,
};

/**
 * Restos del sistema, no documentación: vacío, o el código de anexo suelto que
 * CreateServiceTeams dejaba como descripción antes de traer el texto completo ("A-2-1").
 *
 * Se reconocen por su forma exacta y no por ser cortos: una nota breve que un coordinador
 * escribió para su retiro ("La lleva Juan este año") también es corta, y no es nuestra para
 * pisarla. Todo lo que no encaje aquí pasa por la comprobación de hash, igual que las
 * instrucciones de equipo.
 */
const LEGACY_ANEXO_CODE = /^A-\d+-\w+$/;

const isSystemLeftover = (description: string | null) => {
	const value = (description ?? '').trim();
	return value === '' || LEGACY_ANEXO_CODE.test(value);
};

const sha256 = (value: string) => createHash('sha256').update(value, 'utf-8').digest('hex');

const isKnownRevision = (hashes: Record<string, string[]>, name: string, value: string) =>
	(hashes[name] ?? []).includes(sha256(value));

const markdownDataUrl = (content: string) =>
	`data:text/markdown;charset=utf-8;base64,${Buffer.from(content, 'utf-8').toString('base64')}`;

export class RefreshCanonicalDocsWithSpirituality20260908120000 implements MigrationInterface {
	name = 'RefreshCanonicalDocsWithSpirituality20260908120000';
	timestamp = '20260908120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		let attachments = 0;
		let descriptions = 0;
		let instructions = 0;
		let preserved = 0;

		// ── 1. Attachments markdown (lo que la vista de Responsabilidades muestra) ──

		const attachmentRows: Array<{
			id: string;
			responsabilityName: string;
			content: string | null;
			fileName: string | null;
			description: string | null;
			sizeBytes: number;
		}> = await queryRunner.query(
			`SELECT "id", "responsabilityName", "content", "fileName", "description", "sizeBytes"
			 FROM "responsability_attachment" WHERE "kind" = 'markdown'`,
		);

		for (const row of attachmentRows) {
			const next = CANONICAL_DOCS[row.responsabilityName];
			if (!next || row.content == null || row.content === next) continue;
			if (!isKnownRevision(PREVIOUS_DOC_HASHES, row.responsabilityName, row.content)) {
				preserved++;
				continue;
			}

			// Snapshot de la versión previa, restaurable desde el diálogo de historial.
			await queryRunner.query(
				`INSERT INTO "responsability_attachment_history"
				   ("id", "attachmentId", "title", "content", "description", "sizeBytes", "savedAt", "savedById")
				 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), NULL)`,
				[
					uuidv4(),
					row.id,
					(row.fileName ?? 'Documento').replace(/\.md$/i, ''),
					row.content,
					row.description,
					row.sizeBytes,
				],
			);

			await queryRunner.query(
				`UPDATE "responsability_attachment"
				 SET "content" = ?, "sizeBytes" = ?, "storageUrl" = ?, "updatedAt" = datetime('now')
				 WHERE "id" = ?`,
				[next, Buffer.byteLength(next, 'utf-8'), markdownDataUrl(next), row.id],
			);
			attachments++;
		}

		// ── 2. Descripción de la responsabilidad en cada retiro ──

		const responsibilityRows: Array<{ id: string; name: string; description: string | null }> =
			await queryRunner.query(
				`SELECT "id", "name", "description" FROM "retreat_responsibilities"`,
			);

		for (const row of responsibilityRows) {
			const next = CANONICAL_DOCS[row.name];
			if (!next || row.description === next) continue;
			const current = row.description ?? '';
			if (!isSystemLeftover(row.description) && !isKnownRevision(PREVIOUS_DOC_HASHES, row.name, current)) {
				preserved++;
				continue;
			}
			await queryRunner.query(
				`UPDATE "retreat_responsibilities" SET "description" = ?, "updatedAt" = datetime('now') WHERE "id" = ?`,
				[next, row.id],
			);
			descriptions++;
		}

		// ── 3. Instrucciones de cada equipo de servicio ──

		const teamRows: Array<{ id: string; name: string; instructions: string | null }> =
			await queryRunner.query(`SELECT "id", "name", "instructions" FROM "service_teams"`);

		for (const row of teamRows) {
			const next = SERVICE_TEAM_INSTRUCTIONS[row.name];
			if (!next || row.instructions === next) continue;
			if (!isKnownRevision(PREVIOUS_TEAM_INSTRUCTION_HASHES, row.name, row.instructions ?? '')) {
				preserved++;
				continue;
			}
			await queryRunner.query(
				`UPDATE "service_teams" SET "instructions" = ?, "updatedAt" = datetime('now') WHERE "id" = ?`,
				[next, row.id],
			);
			instructions++;
		}

		console.log(
			`[RefreshCanonicalDocsWithSpirituality] attachments: ${attachments}, ` +
				`descripciones: ${descriptions}, equipos: ${instructions}, ` +
				`respetados por estar editados: ${preserved}`,
		);
	}

	/**
	 * Solo los attachments son reversibles: su texto anterior quedó en el historial que
	 * escribió `up()`. Las descripciones por retiro y las instrucciones de equipo no tienen
	 * historial — para volver atrás ahí hay que restaurar el backup de la base, que es lo
	 * que este repo hace en vez de usar `migration:revert` (que no es confiable).
	 */
	public async down(queryRunner: QueryRunner): Promise<void> {
		let restored = 0;

		const rows: Array<{ id: string; responsabilityName: string; content: string | null }> =
			await queryRunner.query(
				`SELECT "id", "responsabilityName", "content"
				 FROM "responsability_attachment" WHERE "kind" = 'markdown'`,
			);

		for (const row of rows) {
			const next = CANONICAL_DOCS[row.responsabilityName];
			if (!next || row.content !== next) continue; // no lo escribió esta migración

			const history: Array<{ id: string; content: string; description: string | null }> =
				await queryRunner.query(
					`SELECT "id", "content", "description" FROM "responsability_attachment_history"
					 WHERE "attachmentId" = ? AND "savedById" IS NULL ORDER BY "savedAt" DESC`,
					[row.id],
				);
			const previous = history.find((h) =>
				isKnownRevision(PREVIOUS_DOC_HASHES, row.responsabilityName, h.content),
			);
			if (!previous) continue;

			await queryRunner.query(
				`UPDATE "responsability_attachment"
				 SET "content" = ?, "sizeBytes" = ?, "storageUrl" = ?, "updatedAt" = datetime('now')
				 WHERE "id" = ?`,
				[
					previous.content,
					Buffer.byteLength(previous.content, 'utf-8'),
					markdownDataUrl(previous.content),
					row.id,
				],
			);
			await queryRunner.query(`DELETE FROM "responsability_attachment_history" WHERE "id" = ?`, [
				previous.id,
			]);
			restored++;
		}

		console.log(
			`[RefreshCanonicalDocsWithSpirituality] attachments restaurados: ${restored}. ` +
				'Las descripciones por retiro y las instrucciones de equipo NO se revierten: restaurar el backup.',
		);
	}
}
