import { describe, it, expect } from 'vitest';
import { replaceAllVariables, replaceSpouseVariables } from '@/utils/message';

describe('Variables {spouse.*} (retiros de parejas)', () => {
	const spouse = {
		firstName: 'Lucía',
		lastName: 'Prueba',
		nickname: 'Lucy',
		email: 'lucia@example.com',
		cellPhone: '5544455566',
	};

	it('replaceSpouseVariables resuelve todos los placeholders con datos reales', () => {
		const message =
			'Tu cónyuge {spouse.fullName} ({spouse.nickname}) — {spouse.email} / {spouse.cellPhone}';
		expect(replaceSpouseVariables(message, spouse)).toBe(
			'Tu cónyuge Lucía Prueba (Lucy) — lucia@example.com / 5544455566',
		);
	});

	it('con null cae al mock (preview del editor)', () => {
		const result = replaceSpouseVariables('Hola {spouse.firstName}', null);
		expect(result).not.toContain('{spouse.firstName}');
		expect(result.length).toBeGreaterThan('Hola '.length);
	});

	it('replaceAllVariables solo resuelve spouse cuando se pasa el argumento', () => {
		const message = 'Recuerda avisarle a {spouse.firstName}';
		// Sin contexto de pareja: queda literal (igual que community/table).
		const without = replaceAllVariables(message, null, null);
		expect(without).toContain('{spouse.firstName}');
		// Con contexto: resuelve.
		const withSpouse = replaceAllVariables(
			message,
			null,
			null,
			undefined,
			undefined,
			undefined,
			false,
			spouse,
		);
		expect(withSpouse).toBe('Recuerda avisarle a Lucía');
	});

	it('nickname cae a firstName cuando falta', () => {
		const result = replaceSpouseVariables('{spouse.nickname}', {
			firstName: 'Pedro',
		});
		expect(result).toBe('Pedro');
	});
});
