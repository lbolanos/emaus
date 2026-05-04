/**
 * Heurística pura para sugerir Responsabilidades para items del Minuto a Minuto.
 *
 * Regla: dado el `name` y `type` de un item del schedule, y la lista de
 * Responsabilidades disponibles del retiro, devolver el id de la mejor coincidencia
 * (o null si no hay match con confianza razonable).
 *
 * El matching prioriza:
 *   1. Coincidencia por type→responsibility (ej. type='campana' → "Campanero")
 *   2. Keywords en el nombre (palabras significativas, sin acentos, lowercase)
 *   3. Charlas: "Charla X" → "Charlista X" (con número)
 *
 * Pure function — sin dependencias de DB ni TypeORM. Testeable directamente.
 */

export interface ResponsabilityLite {
	id: string;
	name: string;
	/** True si esta responsabilidad ya tiene participante. Solo se usa para tie-break. */
	hasParticipant?: boolean;
}

export interface ScheduleItemLite {
	id: string;
	name: string;
	type?: string | null;
}

export interface MatchSuggestion {
	itemId: string;
	responsabilityId: string | null;
	confidence: 'high' | 'medium' | 'low' | 'none';
	reason: string;
}

/** Normaliza: lowercase, sin acentos, sin puntuación extra. */
export function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Mapeo type → palabras clave esperadas en el nombre de la responsabilidad. */
const TYPE_TO_RESP_KEYWORDS: Record<string, string[]> = {
	campana: ['campanero', 'campana'],
	santisimo: ['santisimo', 'stmo'],
	oracion: ['oracion', 'rosario'],
	logistica: ['logistica'],
	comida: ['comedor', 'cocina'],
	dinamica: ['logistica'],
	charla: ['charlista'],
	misa: ['sacerdote', 'presbitero'],
	musica: ['musica', 'palanquita'],
};

/** Mapeo de keywords del nombre del item → keywords esperadas en la responsabilidad. */
const NAME_KEYWORDS_TO_RESP: Array<[RegExp, string[]]> = [
	[/\bcampana\b/i, ['campanero']],
	[/\b(rosario|oracion|lectura)\b/i, ['oracion']],
	[/\b(santisimo|vigilia|adoracion)\b/i, ['santisimo']],
	[/\b(musica|cancion|palanquita)\b/i, ['musica', 'palanquita']],
	[/\b(cena|desayuno|comida|almuerzo|merienda)\b/i, ['comedor', 'cocina']],
	[/\b(misa|bendicion|eucaristia)\b/i, ['sacerdote', 'presbitero']],
	[/\b(logistica|presentacion|explicacion|reglas)\b/i, ['logistica']],
	[/\bsnack\b/i, ['snack', 'comedor']],
	[/\b(transporte|salida|llegada)\b/i, ['transporte', 'logistica']],
	[/\b(inventario|materiales)\b/i, ['inventario', 'logistica']],
	[/\b(palanca|carta)\b/i, ['palanquero']],
	[/\b(mantelito|mantelitos|servilleta)\b/i, ['mantelito']],
	[/\b(sala|salon)\b/i, ['salon']],
	[/\b(cuarto|dormitorio|habitacion|cama)\b/i, ['cuarto']],
];

/** Extrae el número de "Charla 1", "Testimonio 2", etc. */
function extractChallaNumber(name: string): number | null {
	const m = name.match(/(?:charla|testimonio)\s*(\d+)/i);
	if (m) return parseInt(m[1], 10);
	return null;
}

/**
 * Sugiere la mejor responsabilidad para un item dado.
 * Retorna null si no encuentra match con confianza.
 */
export function suggestResponsability(
	item: ScheduleItemLite,
	responsabilities: ResponsabilityLite[],
): MatchSuggestion {
	if (!responsabilities.length) {
		return {
			itemId: item.id,
			responsabilityId: null,
			confidence: 'none',
			reason: 'Sin responsabilidades disponibles',
		};
	}

	const itemName = normalize(item.name);
	const normalizedResps = responsabilities.map((r) => ({
		...r,
		_norm: normalize(r.name),
	}));

	// 1. Charlas: "Charla 1 (Testimonio)" → "Charlista 1"
	// Si hay número de charla pero no existe Charlista N, retornar null SIN fallback
	// (evita asignar Charlista 1 a "Charla 99" arbitrariamente).
	const challaNum = extractChallaNumber(item.name);
	if (challaNum !== null) {
		const match = normalizedResps.find(
			(r) => r._norm.includes('charlista') && r._norm.includes(String(challaNum)),
		);
		if (match) {
			return {
				itemId: item.id,
				responsabilityId: match.id,
				confidence: 'high',
				reason: `Match charla ${challaNum} → ${match.name}`,
			};
		}
		return {
			itemId: item.id,
			responsabilityId: null,
			confidence: 'none',
			reason: `No existe Charlista ${challaNum} en este retiro`,
		};
	}

	// 2. Match por type → keywords
	if (item.type) {
		const kws = TYPE_TO_RESP_KEYWORDS[item.type];
		if (kws) {
			for (const kw of kws) {
				const match = normalizedResps.find((r) => r._norm.includes(kw));
				if (match) {
					return {
						itemId: item.id,
						responsabilityId: match.id,
						confidence: 'high',
						reason: `Match type=${item.type} → ${match.name}`,
					};
				}
			}
		}
	}

	// 3. Keywords en el nombre del item
	for (const [regex, kws] of NAME_KEYWORDS_TO_RESP) {
		if (regex.test(itemName)) {
			for (const kw of kws) {
				const match = normalizedResps.find((r) => r._norm.includes(kw));
				if (match) {
					return {
						itemId: item.id,
						responsabilityId: match.id,
						confidence: 'medium',
						reason: `Keyword "${kw}" en "${item.name}" → ${match.name}`,
					};
				}
			}
		}
	}

	// Sin match
	return {
		itemId: item.id,
		responsabilityId: null,
		confidence: 'none',
		reason: 'Sin sugerencia automática',
	};
}

/**
 * Genera sugerencias para múltiples items.
 * No devuelve duplicados — si dos items matchean la misma responsabilidad,
 * ambos la reciben (es válido que una responsabilidad cubra varios items).
 */
export function suggestForItems(
	items: ScheduleItemLite[],
	responsabilities: ResponsabilityLite[],
): MatchSuggestion[] {
	return items.map((item) => suggestResponsability(item, responsabilities));
}
