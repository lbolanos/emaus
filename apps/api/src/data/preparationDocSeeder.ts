import * as fs from 'fs';
import * as path from 'path';

/**
 * Documentos por defecto de las preparaciones semanales (serie "Emaús
 * hombres IX", la única completa 1ª–7ª). Los .docx viven como assets en
 * `src/data/preparation-docs/` y se adjuntan al generar el calendario
 * (cada retiro recibe su propia copia: en prod sube a S3, en dev inline).
 */
export interface DefaultPreparationDoc {
	week: number;
	asset: string;
	fileName: string; // nombre visible para el usuario
}

export const DEFAULT_PREPARATION_DOCS: DefaultPreparationDoc[] = [
	{ week: 1, asset: 'semana1-servicio.docx', fileName: '1ª preparación — Servicio.docx' },
	{
		week: 2,
		asset: 'semana2-conocerte-a-ti-mismo.docx',
		fileName: '2ª preparación — Conocerte a ti mismo.docx',
	},
	{
		week: 3,
		asset: 'semana3-sanacion-y-perdon.docx',
		fileName: '3ª preparación — Sanación y Perdón.docx',
	},
	{
		week: 4,
		asset: 'semana4-familia-y-amigos.docx',
		fileName: '4ª preparación — Familia y Amigos.docx',
	},
	{
		week: 5,
		asset: 'semana5-palabra-y-oracion.docx',
		fileName: '5ª preparación — Palabra y Oración.docx',
	},
	{
		week: 5,
		asset: 'semana5-dinamica-de-oracion.docx',
		fileName: '5ª preparación — Dinámica de Oración.docx',
	},
	{ week: 6, asset: 'semana6-la-confianza.docx', fileName: '6ª preparación — La Confianza.docx' },
	{
		week: 7,
		asset: 'semana7-amor-del-padre.docx',
		fileName: '7ª preparación — Amor del Padre.docx',
	},
];

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// El bundle SSR corre desde apps/api (pm2 cwd) pero __dirname cambia al
// compilar; probar rutas relativas al cwd y al source.
const CANDIDATE_DIRS = [
	path.resolve(process.cwd(), 'src/data/preparation-docs'),
	path.resolve(process.cwd(), 'apps/api/src/data/preparation-docs'),
	path.resolve(__dirname, 'preparation-docs'),
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

/**
 * Devuelve los documentos por defecto de una semana como data-urls listos
 * para `retreatPreparationService.addDocument`. Si los assets no están
 * disponibles (deploy sin el folder), devuelve [] — el calendario se genera
 * igual, solo sin documentos.
 */
export function loadDefaultDocsForWeek(
	week: number,
): Array<{ fileName: string; mimeType: string; dataUrl: string }> {
	const dir = resolveDocsDir();
	if (!dir) return [];
	const out: Array<{ fileName: string; mimeType: string; dataUrl: string }> = [];
	for (const doc of DEFAULT_PREPARATION_DOCS.filter((d) => d.week === week)) {
		try {
			const buffer = fs.readFileSync(path.join(dir, doc.asset));
			out.push({
				fileName: doc.fileName,
				mimeType: DOCX_MIME,
				dataUrl: `data:${DOCX_MIME};base64,${buffer.toString('base64')}`,
			});
		} catch (err) {
			console.warn(`[preparationDocSeeder] no se pudo leer ${doc.asset}`, err);
		}
	}
	return out;
}
