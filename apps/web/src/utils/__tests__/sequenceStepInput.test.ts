import { describe, it, expect } from 'vitest';
import { clampStepRanges } from '../sequenceStepInput';

describe('clampStepRanges (#4 validaciones blandas)', () => {
	it('corrige horas fuera de 0–23 y días negativos, y cuenta sólo lo tocado', () => {
		const steps = [
			{ offsetDays: -5, sendHour: 9 }, // días → 0
			{ offsetDays: 2, sendHour: 99 }, // hora → 23
			{ offsetDays: 3, sendHour: 8 }, // ya válido
		];
		const fixed = clampStepRanges(steps);
		expect(fixed).toBe(2);
		expect(steps).toEqual([
			{ offsetDays: 0, sendHour: 9 },
			{ offsetDays: 2, sendHour: 23 },
			{ offsetDays: 3, sendHour: 8 },
		]);
	});

	it('redondea fracciones y trata vacío/NaN como 0', () => {
		const steps = [
			{ offsetDays: 2.6, sendHour: 9.4 }, // → 3 / 9
			{ offsetDays: Number(''), sendHour: Number(undefined) }, // NaN → 0
		];
		expect(clampStepRanges(steps)).toBe(2);
		expect(steps[0]).toEqual({ offsetDays: 3, sendHour: 9 });
		expect(steps[1]).toEqual({ offsetDays: 0, sendHour: 0 });
	});

	it('no reporta ajustes cuando todo está en rango', () => {
		const steps = [{ offsetDays: 0, sendHour: 0 }, { offsetDays: 30, sendHour: 23 }];
		expect(clampStepRanges(steps)).toBe(0);
		expect(steps).toEqual([{ offsetDays: 0, sendHour: 0 }, { offsetDays: 30, sendHour: 23 }]);
	});
});
