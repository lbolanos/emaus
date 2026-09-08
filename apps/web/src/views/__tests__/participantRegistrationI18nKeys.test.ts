import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import es from '@/locales/es.json';
import en from '@/locales/en.json';

/**
 * El registro público es la pantalla que ve un caminante o un servidor antes de
 * tener cuenta, y sus textos salían en inglés ("Registration Successful",
 * "Validation Error", "An unexpected error occurred") o con español fijo, sin
 * pasar por i18n.
 *
 * Ningún test de montaje puede cazar esto: el mock global de `vue-i18n`
 * devuelve la clave tal cual, así que una clave inexistente pasa verde y en
 * producción la persona ve `serverRegistration.toasts.algo` a la cara. Este
 * guard lee el archivo fuente.
 */
const VIEW = join(__dirname, '..', 'ParticipantRegistrationView.vue');
const source = readFileSync(VIEW, 'utf-8');

const resolveKey = (messages: Record<string, any>, key: string): unknown => {
	let current: any = messages;
	for (const part of key.split('.')) {
		if (typeof current !== 'object' || current === null || !(part in current)) return undefined;
		current = current[part];
	}
	return current;
};

describe('ParticipantRegistrationView — claves de i18n', () => {
	const keys = [...source.matchAll(/\$?t\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);

	it('referencia claves (si no, no hay nada que comprobar)', () => {
		expect(keys.length).toBeGreaterThan(20);
	});

	it.each(['es', 'en'])('todas las claves que usa existen en %s.json', (locale) => {
		const messages = (locale === 'es' ? es : en) as Record<string, any>;
		const missing = [...new Set(keys)].filter((key) => typeof resolveKey(messages, key) !== 'string');

		expect(missing).toEqual([]);
	});
});

describe('ParticipantRegistrationView — sin textos en inglés para el público', () => {
	// Los `console.*` y los comentarios van en inglés por convención del repo:
	// solo interesa lo que puede acabar en pantalla.
	const userFacingSource = source
		.split('\n')
		.filter((line) => {
			const trimmed = line.trim();
			if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
			return !/console\.(log|warn|error|debug|info)\(/.test(trimmed);
		})
		.join('\n');

	// Los literales que se vieron en producción, cada uno con su reemplazo.
	const REMOVED = [
		'An unexpected error occurred',
		'Registration Successful',
		'Validation Error',
		'Registration Failed',
		'Submission Failed',
		'Please correct the errors in step',
		'Please review all steps and correct any errors',
		'Invalid retreat ID or retreat not available',
	];

	it.each(REMOVED)('ya no trae el literal %p', (literal) => {
		expect(userFacingSource).not.toContain(literal);
	});
});
