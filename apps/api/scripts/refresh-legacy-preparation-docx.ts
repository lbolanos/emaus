/**
 * Reemplaza el .docx adjunto de fábrica en las preparaciones ya creadas por
 * la versión sin las referencias al retiro de origen ("Polanco III", "Del
 * Valle 1" y sus fechas).
 *
 * Los .docx se copian al adjuntarse, así que arreglar el archivo fuente no
 * toca los retiros existentes, y `resyncDefaultDocuments` conserva el .docx
 * tal cual: solo migra las plantillas markdown.
 *
 * Sobrescribe el MISMO objeto de S3 (`storageKey`), en vez de borrar y subir
 * de nuevo: así la URL que ya se compartió con los servidores sigue sirviendo,
 * ahora el archivo limpio. Los adjuntos inline (data-url, sin S3) se
 * regeneran en la propia fila.
 *
 * Solo toca documentos `kind: 'file'` cuyo nombre coincide EXACTO con el
 * `legacyFileName` del manifest: un archivo renombrado o subido por un
 * coordinador no se toca. Es idempotente — salta los que ya pesan lo que el
 * archivo en disco.
 *
 * Uso (con el API detenido para evitar locks de SQLite):
 *   pnpm --filter api exec vite-node --require dotenv/config scripts/refresh-legacy-preparation-docx.ts
 *   …mismo comando con --apply para escribir de verdad.
 */
import * as fs from 'fs';
import * as path from 'path';
import { In } from 'typeorm';
import { AppDataSource } from '../src/data-source';
import { RetreatPreparationDocument } from '../src/entities/retreatPreparationDocument.entity';
import { RetreatPreparation } from '../src/entities/retreatPreparation.entity';
import { DEFAULT_PREPARATION_DOCS } from '../src/data/preparationDocSeeder';
import { s3Service } from '../src/services/s3Service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCS_DIR = path.resolve(process.cwd(), 'src/data/preparation-docs');
const apply = process.argv.includes('--apply');

(async () => {
	await AppDataSource.initialize();
	const repo = AppDataSource.getRepository(RetreatPreparationDocument);
	const prepRepo = AppDataSource.getRepository(RetreatPreparation);

	const byFileName = new Map(DEFAULT_PREPARATION_DOCS.map((d) => [d.legacyFileName, d]));
	const docs = await repo.find({
		where: { kind: 'file', fileName: In([...byFileName.keys()]) },
		order: { fileName: 'ASC' },
	});

	console.log(`${docs.length} adjunto(s) de fábrica encontrados${apply ? '' : ' (dry-run)'}\n`);

	let updated = 0;
	let skipped = 0;
	for (const doc of docs) {
		const entry = byFileName.get(doc.fileName)!;
		const buffer = fs.readFileSync(path.join(DOCS_DIR, entry.legacyAsset));
		const prep = await prepRepo.findOne({ where: { id: doc.preparationId } });
		const where = `retiro ${prep?.retreatId ?? '?'} · semana ${prep?.weekNumber ?? '?'}`;
		const storage = doc.storageKey ? `S3 ${doc.storageKey}` : 'inline';

		if (doc.sizeBytes === buffer.byteLength) {
			console.log(`  = ${doc.fileName} · ${where} · ya al día (${doc.sizeBytes} B)`);
			skipped++;
			continue;
		}

		console.log(
			`  ${apply ? '↻' : '·'} ${doc.fileName} · ${where} · ${storage} · ${doc.sizeBytes} → ${buffer.byteLength} B`,
		);
		if (!apply) {
			updated++;
			continue;
		}

		if (doc.storageKey) {
			const result = await s3Service.uploadPublicAsset(doc.storageKey, buffer, DOCX_MIME);
			doc.url = result.url;
		} else {
			doc.url = `data:${DOCX_MIME};base64,${buffer.toString('base64')}`;
		}
		doc.mimeType = DOCX_MIME;
		doc.sizeBytes = buffer.byteLength;
		await repo.save(doc);
		updated++;
	}

	console.log(
		`\n${apply ? '✅ actualizados' : 'se actualizarían'}: ${updated} · sin cambios: ${skipped}`,
	);
	if (!apply && updated) console.log('Repetí el comando con --apply para escribir.');
	await AppDataSource.destroy();
})().catch((err) => {
	console.error('Error refrescando los .docx de preparaciones:', err);
	process.exit(1);
});
