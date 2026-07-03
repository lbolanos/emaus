// Validación pura del seed PRE_RETIRO_EMAUS (Excel "Que-Cuando"): claves de
// identidad únicas, offsets formateables, jerarquía de máximo 2 niveles.

import { describe, it, expect } from '@jest/globals';
import { __TEST__ } from '../../data/preRetreatTaskSeeder';
import { formatDueOffset, offsetDaysToParts, partsToOffsetDays } from '@repo/types';

const { PRE_RETIRO_EMAUS, SET_NAME } = __TEST__;

describe('preRetreatTaskSeeder — datos del seed', () => {
	it('tiene el volumen esperado del Excel (~40 raíces, ~30 sub-tareas)', () => {
		expect(PRE_RETIRO_EMAUS.length).toBeGreaterThanOrEqual(38);
		const children = PRE_RETIRO_EMAUS.flatMap((t) => t.children ?? []);
		expect(children.length).toBeGreaterThanOrEqual(25);
	});

	it('las claves (padre, nombre) son únicas — requisito de idempotencia', () => {
		const keys = new Set<string>();
		for (const root of PRE_RETIRO_EMAUS) {
			const rootKey = `__${root.name.trim().toLowerCase()}`;
			expect(keys.has(rootKey)).toBe(false);
			keys.add(rootKey);
			for (const child of root.children ?? []) {
				const childKey = `${root.name.trim().toLowerCase()}__${child.name.trim().toLowerCase()}`;
				expect(keys.has(childKey)).toBe(false);
				keys.add(childKey);
			}
		}
	});

	it('los offsets de raíces son null o > 0 y formatean sin ambigüedad (round-trip)', () => {
		for (const root of PRE_RETIRO_EMAUS) {
			if (root.dueOffsetDays == null) continue;
			expect(root.dueOffsetDays).toBeGreaterThan(0);
			const parts = offsetDaysToParts(root.dueOffsetDays);
			expect(partsToOffsetDays(parts.value, parts.unit)).toBe(root.dueOffsetDays);
			expect(formatDueOffset(root.dueOffsetDays)).toMatch(/^\d+ (mes(es)?|semanas?|días?)$/);
		}
	});

	it('cubre el rango completo del Excel: de 4 meses (120) a 2 días', () => {
		const offsets = PRE_RETIRO_EMAUS.map((t) => t.dueOffsetDays).filter(
			(x): x is number => x != null,
		);
		expect(Math.max(...offsets)).toBe(120);
		expect(Math.min(...offsets)).toBe(2);
	});

	it('los hijos no tienen nietos (profundidad máx 2 en el tipo y en los datos)', () => {
		for (const root of PRE_RETIRO_EMAUS) {
			for (const child of root.children ?? []) {
				expect((child as any).children).toBeUndefined();
			}
		}
	});

	it('nombres no vacíos en todas las filas', () => {
		for (const root of PRE_RETIRO_EMAUS) {
			expect(root.name.trim().length).toBeGreaterThan(0);
			for (const child of root.children ?? []) {
				expect(child.name.trim().length).toBeGreaterThan(0);
			}
		}
	});

	it('el set se llama "Pre-retiro — Emaús"', () => {
		expect(SET_NAME).toBe('Pre-retiro — Emaús');
	});
});
