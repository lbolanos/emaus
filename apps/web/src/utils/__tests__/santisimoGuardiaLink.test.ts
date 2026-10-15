import { describe, it, expect } from 'vitest';
import { replaceAllVariables } from '@/utils/message';

/**
 * {participant.santisimoGuardiaLink} — contrato de resolución en el cliente
 * (specs/santisimo-guardia-links R4). La URL la hidrata el caller (fetch del
 * mapa `guardia-links`); aquí se prueba que @repo/utils la pasa cuando está y
 * deja '' cuando no (findEmptyVariables la reporta), con mock para el preview.
 */
describe('Variables {participant.santisimoGuardiaLink}', () => {
	it('resuelve con el link inyectado por el caller', () => {
		const link = 'https://emaus.cc/santisimo/servidor/abc123_-';
		const result = replaceAllVariables(
			'Elige tu horario: {participant.santisimoGuardiaLink}',
			{ firstName: 'Ana', santisimoGuardiaLink: link } as any,
			null,
		);
		expect(result).toBe(`Elige tu horario: ${link}`);
	});

	it('sin el campo resuelve a vacío (variable "sin datos" avisa al usuario)', () => {
		const result = replaceAllVariables(
			'{participant.santisimoGuardiaLink}',
			{ firstName: 'Ana' } as any,
			null,
		);
		expect(result).toBe('');
	});

	it('sin participante cae al mock del preview del editor', () => {
		const result = replaceAllVariables('{participant.santisimoGuardiaLink}', null, null);
		expect(result).toMatch(/^https:\/\/emaus\.cc\/santisimo\/servidor\//);
	});
});
