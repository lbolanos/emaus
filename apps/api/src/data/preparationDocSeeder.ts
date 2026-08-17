import * as fs from 'fs';
import * as path from 'path';

/**
 * Documentos por defecto de las preparaciones semanales (serie "Emaús
 * hombres IX", la única completa 1ª–7ª).
 *
 * Cada semana tiene una **plantilla markdown** en `src/data/preparation-docs/`
 * que se adjunta al generar el calendario. Las plantillas conservan sus
 * placeholders `{retreat.*}` / `{preparations.table}` sin resolver: el texto
 * se resuelve en cada lectura (ver `retreatPreparationService`), para que
 * mover una fecha o saltar un festivo actualice el documento solo.
 *
 * Los `.docx` originales siguen aquí como referencia de auditoría y como
 * descarga opcional (`includeOriginalDocx`). No se adjuntan por defecto:
 * traían fechas de un retiro pasado quemadas dentro del binario, que es
 * justamente lo que las plantillas vinieron a arreglar.
 */
export interface DefaultPreparationDoc {
	week: number;
	/** Plantilla markdown en `src/data/preparation-docs/`. */
	asset: string;
	/** Nombre visible; `createMarkdownDocument` le añade el `.md`. */
	fileName: string;
	/** .docx original, para la descarga opcional. */
	legacyAsset: string;
	/**
	 * Nombre con el que el .docx quedó guardado en los retiros generados antes
	 * de las plantillas. `resyncDefaultDocuments` lo compara byte a byte para
	 * decidir qué reemplazar — no lo cambies sin migrar esos retiros.
	 */
	legacyFileName: string;
}

export const DEFAULT_PREPARATION_DOCS: DefaultPreparationDoc[] = [
	{
		week: 1,
		asset: 'semana1-servicio.md',
		fileName: '1ª preparación — Servicio',
		legacyAsset: 'semana1-servicio.docx',
		legacyFileName: '1ª preparación — Servicio.docx',
	},
	{
		week: 2,
		asset: 'semana2-conocerte-a-ti-mismo.md',
		fileName: '2ª preparación — Conocerte a ti mismo',
		legacyAsset: 'semana2-conocerte-a-ti-mismo.docx',
		legacyFileName: '2ª preparación — Conocerte a ti mismo.docx',
	},
	{
		week: 3,
		asset: 'semana3-sanacion-y-perdon.md',
		fileName: '3ª preparación — Sanación y Perdón',
		legacyAsset: 'semana3-sanacion-y-perdon.docx',
		legacyFileName: '3ª preparación — Sanación y Perdón.docx',
	},
	{
		week: 4,
		asset: 'semana4-familia-y-amigos.md',
		fileName: '4ª preparación — Familia y Amigos',
		legacyAsset: 'semana4-familia-y-amigos.docx',
		legacyFileName: '4ª preparación — Familia y Amigos.docx',
	},
	{
		week: 5,
		asset: 'semana5-palabra-y-oracion.md',
		fileName: '5ª preparación — Palabra y Oración',
		legacyAsset: 'semana5-palabra-y-oracion.docx',
		legacyFileName: '5ª preparación — Palabra y Oración.docx',
	},
	{
		week: 5,
		asset: 'semana5-dinamica-de-oracion.md',
		fileName: '5ª preparación — Dinámica de Oración',
		legacyAsset: 'semana5-dinamica-de-oracion.docx',
		legacyFileName: '5ª preparación — Dinámica de Oración.docx',
	},
	{
		week: 6,
		asset: 'semana6-la-confianza.md',
		fileName: '6ª preparación — La Confianza',
		legacyAsset: 'semana6-la-confianza.docx',
		legacyFileName: '6ª preparación — La Confianza.docx',
	},
	{
		week: 7,
		asset: 'semana7-amor-del-padre.md',
		fileName: '7ª preparación — Amor del Padre',
		legacyAsset: 'semana7-amor-del-padre.docx',
		legacyFileName: '7ª preparación — Amor del Padre.docx',
	},
];

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Resolver relativo al cwd, NUNCA a __dirname: el bundle de prod es ESM
// (`"type": "module"`) y `__dirname` no existe ahí → ReferenceError al cargar
// el módulo y crash-loop del API (incidente 2026-07-09). En prod el cwd de PM2
// es `/var/www/emaus/apps/api`; en dev/tests es `apps/api`. En ambos, los
// documentos viven en `src/data/preparation-docs` (el deploy los sincroniza
// vía rsync de src/).
const CANDIDATE_DIRS = [
	path.resolve(process.cwd(), 'src/data/preparation-docs'),
	path.resolve(process.cwd(), 'apps/api/src/data/preparation-docs'),
];

function resolveDocsDir(): string | null {
	for (const dir of CANDIDATE_DIRS) {
		try {
			if (fs.existsSync(dir)) return dir;
		} catch {
			// seguir probando
		}
	}
	return null;
}

export interface DefaultMarkdownDoc {
	fileName: string;
	content: string;
}

/**
 * Plantillas markdown de una semana, listas para
 * `retreatPreparationService.createMarkdownDocument`. Si los assets no están
 * disponibles (deploy sin el folder), devuelve [] — el calendario se genera
 * igual, solo sin documentos.
 */
export function loadDefaultDocsForWeek(week: number): DefaultMarkdownDoc[] {
	const dir = resolveDocsDir();
	if (!dir) return [];
	const out: DefaultMarkdownDoc[] = [];
	for (const doc of DEFAULT_PREPARATION_DOCS.filter((d) => d.week === week)) {
		try {
			out.push({
				fileName: doc.fileName,
				content: fs.readFileSync(path.join(dir, doc.asset), 'utf-8'),
			});
		} catch (err) {
			console.warn(`[preparationDocSeeder] no se pudo leer ${doc.asset}`, err);
		}
	}
	return out;
}

/**
 * Los .docx originales de una semana como data-urls, para adjuntarlos junto a
 * las plantillas cuando se pide la descarga opcional del formato Word.
 */
export function loadOriginalDocxForWeek(
	week: number,
): Array<{ fileName: string; mimeType: string; dataUrl: string }> {
	const dir = resolveDocsDir();
	if (!dir) return [];
	const out: Array<{ fileName: string; mimeType: string; dataUrl: string }> = [];
	for (const doc of DEFAULT_PREPARATION_DOCS.filter((d) => d.week === week)) {
		try {
			const buffer = fs.readFileSync(path.join(dir, doc.legacyAsset));
			out.push({
				fileName: doc.legacyFileName,
				mimeType: DOCX_MIME,
				dataUrl: `data:${DOCX_MIME};base64,${buffer.toString('base64')}`,
			});
		} catch (err) {
			console.warn(`[preparationDocSeeder] no se pudo leer ${doc.legacyAsset}`, err);
		}
	}
	return out;
}
