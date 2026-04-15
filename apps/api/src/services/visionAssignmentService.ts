import { generateObject } from 'ai';
import { z } from 'zod';
import { getVisionModel, isConfigured } from './aiChatService';
import { findAllParticipants } from './participantService';
import { findTablesByRetreatId, assignWalkerToTable } from './tableMesaService';

const LotteryAnalysisSchema = z.object({
	assignments: z.array(
		z.object({
			idOnRetreat: z.number().describe('El número de ID del caminante en la tarjeta'),
			tableName: z.string().describe('El nombre de la mesa (ej: Mesa 1, Mesa 2)'),
		}),
	),
	unreadable: z.array(
		z.object({
			description: z.string().describe('Descripción de la tarjeta ilegible y su ubicación'),
			possibleId: z.number().optional().describe('ID posible si se puede adivinar parcialmente'),
		}),
	),
	notes: z.string().describe('Observaciones generales sobre la foto y el análisis'),
});

export type LotteryAnalysis = z.infer<typeof LotteryAnalysisSchema>;

export interface AssignmentProposal {
	idOnRetreat: number;
	participantId: string | null;
	participantName: string | null;
	tableName: string;
	tableId: string | null;
	valid: boolean;
	error?: string;
}

export interface AnalysisResult {
	proposals: AssignmentProposal[];
	unreadable: LotteryAnalysis['unreadable'];
	notes: string;
}

export interface ExecutionResult {
	idOnRetreat: number;
	participantName: string;
	tableName: string;
	success: boolean;
	error?: string;
}

export async function analyzeLotteryPhoto(
	imageBase64: string,
	contentType: string,
	retreatId: string,
): Promise<AnalysisResult> {
	if (!isConfigured()) {
		throw new Error('AI no está configurado');
	}

	// Validate content type
	const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
	if (!validTypes.includes(contentType)) {
		throw new Error('Formato de imagen no soportado. Usa JPG, PNG o WebP.');
	}

	// Load context: tables and walkers for this retreat
	const [tables, walkers] = await Promise.all([
		findTablesByRetreatId(retreatId),
		findAllParticipants(retreatId, 'walker', false),
	]);

	const tableNames = tables.map((t) => t.name).join(', ');
	const walkerIds = walkers
		.filter((w) => w.id_on_retreat)
		.map((w) => w.id_on_retreat)
		.sort((a, b) => (a || 0) - (b || 0))
		.join(', ');

	const prompt = `Analiza esta foto que muestra los resultados de un sorteo de mesas para un retiro de Emaús.

En la foto hay tarjetas con números (ID de retiro de cada caminante) que están agrupadas por mesa. Cada grupo de tarjetas corresponde a una mesa específica.

Mesas disponibles: ${tableNames}
IDs de caminantes válidos: ${walkerIds}

INSTRUCCIONES:
1. Identifica cada tarjeta visible y lee el número de ID.
2. Determina a qué mesa pertenece cada tarjeta basándote en su agrupación visual.
3. Si una tarjeta es parcialmente legible, intenta leer el número pero inclúyela en "unreadable" si no estás seguro.
4. Si ves texto que identifica las mesas (como "Mesa 1", "Mesa 2", etc.), úsalo para mapear las tarjetas.
5. Si no hay etiquetas de mesa visibles, numera los grupos de izquierda a derecha, de arriba a abajo.

Responde con las asignaciones encontradas.`;

	const imageBuffer = Buffer.from(imageBase64, 'base64');

	console.log(`[Vision:analyzeLotteryPhoto] retreatId=${retreatId} tables=${tables.length} unassignedWalkers=${walkers.length} imageSize=${Math.round(imageBase64.length * 3 / 4 / 1024)}KB`);
	const { object } = await generateObject({
		model: getVisionModel(),
		mode: 'json',
		schema: LotteryAnalysisSchema,
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'image', image: imageBuffer, mimeType: contentType as 'image/jpeg' | 'image/png' | 'image/webp' },
					{ type: 'text', text: prompt },
				],
			},
		],
	});
	console.log(`[Vision:analyzeLotteryPhoto] result: assignments=${object.assignments.length} unreadable=${object.unreadable.length} notes="${object.notes}"`);

	// Resolve proposals: map IDs to actual participants and table names to table IDs
	const walkerMap = new Map(walkers.filter((w) => w.id_on_retreat).map((w) => [w.id_on_retreat!, w]));
	const tableMap = new Map(tables.map((t) => [t.name.toLowerCase().trim(), t]));

	const proposals: AssignmentProposal[] = object.assignments.map((a) => {
		const walker = walkerMap.get(a.idOnRetreat);
		const table = tableMap.get(a.tableName.toLowerCase().trim());

		let valid = true;
		let error: string | undefined;

		if (!walker) {
			valid = false;
			error = `ID ${a.idOnRetreat} no encontrado`;
		} else if (!table) {
			valid = false;
			error = `Mesa "${a.tableName}" no encontrada`;
		} else if ((table.walkers?.length || 0) >= 7) {
			valid = false;
			error = 'Mesa llena (máximo 7)';
		}

		return {
			idOnRetreat: a.idOnRetreat,
			participantId: walker?.id || null,
			participantName: walker ? `${walker.firstName} ${walker.lastName}` : null,
			tableName: a.tableName,
			tableId: table?.id || null,
			valid,
			error,
		};
	});

	return {
		proposals,
		unreadable: object.unreadable,
		notes: object.notes,
	};
}

const TablePhotoSchema = z.object({
	foundIds: z.array(z.number()).describe('Todos los números enteros que puedas leer en la imagen, sin filtrar'),
	unreadable: z.array(z.string()).describe('Descripciones de tarjetas o números que no puedas leer con certeza'),
	notes: z.string().describe('Observaciones generales sobre la imagen'),
});

export async function analyzeTablePhoto(
	imageBase64: string,
	contentType: string,
	retreatId: string,
	tableId: string,
): Promise<AnalysisResult> {
	if (!isConfigured()) {
		throw new Error('AI no está configurado');
	}

	const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
	if (!validTypes.includes(contentType)) {
		throw new Error('Formato de imagen no soportado. Usa JPG, PNG o WebP.');
	}

	const [tables, walkers] = await Promise.all([
		findTablesByRetreatId(retreatId),
		findAllParticipants(retreatId, 'walker', false),
	]);

	const table = tables.find((t) => t.id === tableId);
	if (!table) throw new Error('Mesa no encontrada');

	// Only show unassigned walkers
	const assignedIds = new Set<string>();
	for (const t of tables) {
		for (const w of (t.walkers || []) as { id: string }[]) {
			assignedIds.add(w.id);
		}
	}
	const unassignedWalkers = walkers.filter((w) => !assignedIds.has(w.id));

	const prompt = `Eres un lector de números. Tu ÚNICA tarea es extraer los números enteros visibles en esta imagen.

La imagen muestra tarjetas o papelitos con números escritos o impresos, posiblemente del sistema de retiros Emaús.

INSTRUCCIONES ESTRICTAS:
1. Lee SOLO los números que realmente puedas ver escritos en la imagen.
2. NO inventes números. Si no ves números claros, devuelve foundIds vacío.
3. Si la imagen es borrosa, oscura o no muestra números legibles, devuelve foundIds vacío y explica en notes.
4. Incluye en "unreadable" cualquier número parcialmente visible que no puedas leer con certeza.
5. Ignora texto que no sea números (nombres, palabras, logos).
6. Es MEJOR devolver menos números que inventar números que no están en la imagen.`;

	const imageBuffer = Buffer.from(imageBase64, 'base64');

	console.log(`[Vision:analyzeTablePhoto] retreatId=${retreatId} tableId=${tableId} tableName=${table.name} unassignedWalkers=${unassignedWalkers.length} imageSize=${Math.round(imageBase64.length * 3 / 4 / 1024)}KB`);
	const { object } = await generateObject({
		model: getVisionModel(),
		mode: 'json',
		schema: TablePhotoSchema,
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'image', image: imageBuffer, mimeType: contentType as 'image/jpeg' | 'image/png' | 'image/webp' },
					{ type: 'text', text: prompt },
				],
			},
		],
	});
	console.log(`[Vision:analyzeTablePhoto] raw result: foundIds=${JSON.stringify(object.foundIds)} unreadable=${JSON.stringify(object.unreadable)} notes="${object.notes}"`);

	const walkerMap = new Map(unassignedWalkers.filter((w) => w.id_on_retreat).map((w) => [w.id_on_retreat!, w]));

	// Build a map of ALL walkers (to give better error messages for already-assigned ones)
	const allWalkerMap = new Map(walkers.filter((w) => w.id_on_retreat).map((w) => [w.id_on_retreat!, w]));

	// Deduplicate and keep only positive integers (ignore noise like 0 or negative numbers)
	const uniqueIds = [...new Set(object.foundIds.filter((id) => Number.isInteger(id) && id > 0))];

	const proposals: AssignmentProposal[] = uniqueIds.map((id) => {
		const walker = walkerMap.get(id); // unassigned only
		const allWalker = allWalkerMap.get(id);
		const alreadyAssigned = !walker && !!allWalker;
		return {
			idOnRetreat: id,
			participantId: walker?.id || null,
			participantName: walker ? `${walker.firstName} ${walker.lastName}` : (allWalker ? `${allWalker.firstName} ${allWalker.lastName}` : null),
			tableName: table.name,
			tableId: table.id,
			valid: !!walker,
			error: alreadyAssigned ? `ID ${id} ya está asignado a otra mesa` : (!allWalker ? `ID ${id} no existe en este retiro` : undefined),
		};
	});

	return {
		proposals,
		unreadable: object.unreadable.map((d) => ({ description: d })),
		notes: object.notes,
	};
}

export async function executeAssignments(
	retreatId: string,
	assignments: Array<{ participantId: string; tableId: string; idOnRetreat: number; participantName: string; tableName: string }>,
): Promise<ExecutionResult[]> {
	const results: ExecutionResult[] = [];

	for (const a of assignments) {
		try {
			await assignWalkerToTable(a.tableId, a.participantId);
			results.push({
				idOnRetreat: a.idOnRetreat,
				participantName: a.participantName,
				tableName: a.tableName,
				success: true,
			});
		} catch (error: any) {
			results.push({
				idOnRetreat: a.idOnRetreat,
				participantName: a.participantName,
				tableName: a.tableName,
				success: false,
				error: error.message || 'Error desconocido',
			});
		}
	}

	return results;
}
