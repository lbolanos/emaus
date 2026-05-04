/**
 * Validación: cada item del seeder tiene `responsabilityName`, y ese nombre
 * existe en la lista canónica de Responsabilidades del sistema (las 27 fijas
 * que crea `createDefaultResponsibilitiesForRetreat` + las charlas/textos
 * de `getDefaultCharlas()` — generadas dinámicamente al materializar via
 * `ensureCharlaResponsibilitiesFromTemplateSet`).
 *
 * Si añades un item nuevo al template y olvidas el campo, este test grita.
 * Si renombras una responsabilidad canónica, este test grita.
 * Si agregas una charla nueva al template, asegúrate de agregarla a
 * `getDefaultCharlas` para que tenga el anexo correcto al materializar.
 */
import { describe, it, expect } from '@jest/globals';
import { __TEST__ } from '../../data/scheduleTemplateSeeder';
import { getDefaultCharlas } from '../../services/responsabilityService';

const CANONICAL_FIXED = [
	'Palanquero 1',
	'Palanquero 2',
	'Palanquero 3',
	'Logistica',
	'Inventario',
	'Tesorero',
	'Sacerdotes',
	'Mantelitos',
	'Snacks',
	'Compras',
	'Transporte',
	'Música',
	'Comedor',
	'Salón',
	'Cuartos',
	'Oración de Intercesión',
	'Palanquitas',
	'Santísimo',
	'Campanero',
	'Continua',
	'Biblias',
	'Explicación Rosario y entrega',
	'Bolsas',
	'Resumen del día',
	'Recepción',
	'Reglamento de la Casa',
];

const ALL_CANONICAL = new Set<string>([
	...CANONICAL_FIXED,
	...getDefaultCharlas().map((c) => c.name),
]);

describe('scheduleTemplateSeeder — responsabilityName en cada item', () => {
	it('Sta Clara tiene 67+ items', () => {
		expect(__TEST__.STA_CLARA_ITEMS.length).toBeGreaterThanOrEqual(67);
	});

	it('Polanco tiene 120+ items', () => {
		expect(__TEST__.POLANCO_ITEMS.length).toBeGreaterThanOrEqual(120);
	});

	it('Polanco: cada item tiene description (cobertura completa)', () => {
		const sin = __TEST__.POLANCO_ITEMS.filter((r) => !r.description);
		if (sin.length) {
			console.log('Polanco items sin description:', sin.map((r) => r.name).join(', '));
		}
		expect(sin).toEqual([]);
	});

	it('Polanco: las nuevas responsabilidades están en uso', () => {
		const polanco = __TEST__.POLANCO_ITEMS;
		const responsibilities = new Set(polanco.map((r) => r.responsabilityName));
		expect(responsibilities.has('Salón')).toBe(true);
		expect(responsibilities.has('Reglamento de la Casa')).toBe(true);
		expect(responsibilities.has('Snacks')).toBe(true);
		expect(responsibilities.has('Recepción')).toBe(true);
		expect(responsibilities.has('Texto: Oración al Espíritu Santo')).toBe(true);
		expect(responsibilities.has('Resumen del día')).toBe(true);
		expect(responsibilities.has('Biblias')).toBe(true);
		expect(responsibilities.has('Bolsas')).toBe(true);
	});

	it('Polanco: revisión de la casa está dividida en 5 tareas paralelas a las 14:40', () => {
		const reviews = __TEST__.POLANCO_ITEMS.filter(
			(r) => r.defaultDay === 1 && r.defaultStartTime === '14:40' && /^Revisión|Setup|Pruebas/.test(r.name ?? ''),
		);
		expect(reviews.length).toBeGreaterThanOrEqual(5);
		const responsibilities = new Set(reviews.map((r) => r.responsabilityName));
		expect(responsibilities.has('Cuartos')).toBe(true);
		expect(responsibilities.has('Salón')).toBe(true);
		expect(responsibilities.has('Comedor')).toBe(true);
		expect(responsibilities.has('Música')).toBe(true);
		expect(responsibilities.has('Recepción')).toBe(true);
	});

	it('Polanco: desarmar logística post-comida (Día 3) está dividido en 5 tareas paralelas', () => {
		const tasks = __TEST__.POLANCO_ITEMS.filter(
			(r) => r.defaultDay === 3 && r.defaultStartTime === '15:00' && /(Desarmar|Limpiar|Recoger|Preparar entrega)/i.test(r.name ?? ''),
		);
		expect(tasks.length).toBeGreaterThanOrEqual(5);
		const responsibilities = new Set(tasks.map((r) => r.responsabilityName));
		expect(responsibilities.has('Cuartos')).toBe(true);
		expect(responsibilities.has('Salón')).toBe(true);
		expect(responsibilities.has('Comedor')).toBe(true);
		expect(responsibilities.has('Música')).toBe(true);
		expect(responsibilities.has('Bolsas')).toBe(true);
	});

	it('Sta Clara tiene 10 testimonios (charlas completas con type=testimonio)', () => {
		const testimonios = __TEST__.STA_CLARA_ITEMS.filter((r) => r.type === 'testimonio');
		expect(testimonios.length).toBeGreaterThanOrEqual(10);
	});

	it('Polanco: las 5 lecturas del Camino de Emaús apuntan a Continua', () => {
		const lecturas = __TEST__.POLANCO_ITEMS.filter((r) =>
			/(Primera|Segunda|Tercera|Cuarta|Quinta)\s+Lectura/i.test(r.name ?? '') ||
			/Lectura\s+(completa\s+)?(del\s+)?Cami(no)?\s+de\s+Em(a|á)ús/i.test(r.name ?? ''),
		);
		expect(lecturas.length).toBeGreaterThanOrEqual(5);
		for (const l of lecturas) expect(l.responsabilityName).toBe(__TEST__.R.continua);
	});

	it('Polanco: items "Resumen del día anterior" usan Resumen del día', () => {
		const resumenes = __TEST__.POLANCO_ITEMS.filter((r) => /Resumen\s+del\s+d[íi]a/i.test(r.name ?? ''));
		expect(resumenes.length).toBeGreaterThanOrEqual(2);
		for (const r of resumenes) expect(r.responsabilityName).toBe(__TEST__.R.resumenDia);
	});

	it('todos los items de Sta Clara tienen responsabilityName', () => {
		const sin = __TEST__.STA_CLARA_ITEMS.filter((r) => !r.responsabilityName);
		if (sin.length) {
			console.log(
				'Items sin responsabilityName:',
				sin.map((r) => r.name).join(', '),
			);
		}
		expect(sin).toEqual([]);
	});

	it('todos los items de Polanco tienen responsabilityName', () => {
		const sin = __TEST__.POLANCO_ITEMS.filter((r) => !r.responsabilityName);
		if (sin.length) {
			console.log(
				'Items sin responsabilityName:',
				sin.map((r) => r.name).join(', '),
			);
		}
		expect(sin).toEqual([]);
	});

	it('cada responsabilityName existe en la lista canónica', () => {
		const items = [...__TEST__.STA_CLARA_ITEMS, ...__TEST__.POLANCO_ITEMS];
		const invalid: Array<{ item: string; resp: string }> = [];
		for (const it of items) {
			if (it.responsabilityName && !ALL_CANONICAL.has(it.responsabilityName)) {
				invalid.push({ item: it.name ?? '(sin nombre)', resp: it.responsabilityName });
			}
		}
		if (invalid.length) {
			console.log('responsabilityName que no existe en la lista canónica:', invalid);
		}
		expect(invalid).toEqual([]);
	});

	it('R alias coincide con CANONICAL_FIXED', () => {
		expect(CANONICAL_FIXED).toContain(__TEST__.R.logistica);
		expect(CANONICAL_FIXED).toContain(__TEST__.R.comedor);
		expect(CANONICAL_FIXED).toContain(__TEST__.R.campanero);
		expect(CANONICAL_FIXED).toContain(__TEST__.R.santisimo);
	});

	it('items de comida → Comedor', () => {
		const cenas = __TEST__.STA_CLARA_ITEMS.filter((r) => r.type === 'comida');
		for (const c of cenas) {
			expect(c.responsabilityName).toBe(__TEST__.R.comedor);
		}
	});

	it('items de refrigerio (breaks) → Snacks (en ambos templates)', () => {
		const breaks = [
			...__TEST__.STA_CLARA_ITEMS,
			...__TEST__.POLANCO_ITEMS,
		].filter((r) => r.type === 'refrigerio');
		expect(breaks.length).toBeGreaterThan(0);
		for (const b of breaks) {
			expect(b.responsabilityName).toBe(__TEST__.R.snacks);
		}
	});

	it('items de campana → Campanero (en ambos templates)', () => {
		const camp = [
			...__TEST__.STA_CLARA_ITEMS,
			...__TEST__.POLANCO_ITEMS,
		].filter((r) => r.type === 'campana');
		expect(camp.length).toBeGreaterThan(0);
		for (const c of camp) {
			expect(c.responsabilityName).toBe(__TEST__.R.campanero);
		}
	});

	it('Polanco tiene campanas en transiciones clave (al menos 10)', () => {
		const camp = __TEST__.POLANCO_ITEMS.filter((r) => r.type === 'campana');
		expect(camp.length).toBeGreaterThanOrEqual(10);
	});

	it('Polanco no tiene items de tipo testimonio (placeholders eliminados)', () => {
		const testimonios = __TEST__.POLANCO_ITEMS.filter((r) => r.type === 'testimonio');
		expect(testimonios).toEqual([]);
	});

	it('alias R.rosarios apunta al nombre canónico actualizado', () => {
		expect(__TEST__.R.rosarios).toBe('Explicación Rosario y entrega');
	});

	it('alias R.despedida fue removido — sus tareas pasaron a Bolsas', () => {
		expect((__TEST__.R as Record<string, string>).despedida).toBeUndefined();
		const usedDespedida = __TEST__.POLANCO_ITEMS.some(
			(r) => r.responsabilityName === 'Despedida',
		);
		expect(usedDespedida).toBe(false);
		// "Preparar entrega de celulares y despedida" debe usar Bolsas
		const cierre = __TEST__.POLANCO_ITEMS.find((r) =>
			/Preparar entrega de celulares y despedida/i.test(r.name ?? ''),
		);
		expect(cierre?.responsabilityName).toBe('Bolsas');
	});

	it('alias R.snacks está disponible y todos los breaks lo usan', () => {
		expect(__TEST__.R.snacks).toBe('Snacks');
		const breaks = __TEST__.POLANCO_ITEMS.filter((r) => r.type === 'refrigerio');
		expect(breaks.length).toBeGreaterThan(0);
		for (const b of breaks) expect(b.responsabilityName).toBe('Snacks');
	});

	it('Polanco: tareas de revisión pre-retiro tienen tipos coincidentes', () => {
		const revs = __TEST__.POLANCO_ITEMS.filter(
			(r) => r.defaultDay === 1 && r.defaultStartTime === '14:40',
		);
		expect(revs.length).toBeGreaterThanOrEqual(5);
		// Each must have description (cobertura de docs)
		for (const r of revs) expect(r.description).toBeTruthy();
	});

	it('items de santisimo → Santísimo', () => {
		const sant = __TEST__.STA_CLARA_ITEMS.filter((r) => r.type === 'santisimo');
		for (const s of sant) {
			expect(s.responsabilityName).toBe(__TEST__.R.santisimo);
		}
	});
});

describe('scheduleTemplateSeeder — relink lookup case-insensitive', () => {
	// Reproduce la lógica del service: lowercase + trim para indexar.
	function normalize(s: string): string {
		return s.toLowerCase().trim();
	}

	it('los nombres canónicos no colisionan al normalizar', () => {
		const seen = new Set<string>();
		for (const name of CANONICAL_FIXED) {
			const norm = normalize(name);
			expect(seen.has(norm)).toBe(false);
			seen.add(norm);
		}
	});

	it('match round-trip: canonical → normalize → lookup → canonical', () => {
		const index = new Map(CANONICAL_FIXED.map((n) => [normalize(n), n]));
		for (const item of __TEST__.STA_CLARA_ITEMS) {
			if (!item.responsabilityName) continue;
			if (!CANONICAL_FIXED.includes(item.responsabilityName)) continue; // skip charlas
			const found = index.get(normalize(item.responsabilityName));
			expect(found).toBe(item.responsabilityName);
		}
	});
});
