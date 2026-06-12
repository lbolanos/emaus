import { describe, it, expect } from 'vitest';
import { DomainAuditAction, DOMAIN_RESOURCE_TYPES } from '@repo/types';
import es from '../es.json';
import en from '../en.json';

/**
 * Keystone anti-drift: cada acción/recurso de auditoría declarado en @repo/types
 * DEBE tener etiqueta no vacía en ambos locales. Si agregas una constante a
 * `DomainAuditAction` (o un resource type) sin su traducción, este test truena.
 */

function resolve(obj: any, path: string[]): unknown {
	return path.reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

const LOCALES: [string, any][] = [
	['es', es],
	['en', en],
];

describe('cobertura de locales del namespace audit', () => {
	it.each(LOCALES)('toda acción de DomainAuditAction tiene etiqueta en %s', (_name, messages) => {
		for (const action of Object.values(DomainAuditAction)) {
			const value = resolve(messages, ['audit', 'actions', ...action.split('.')]);
			expect(value, `falta audit.actions.${action}`).toBeTypeOf('string');
			expect((value as string).trim(), `audit.actions.${action} está vacío`).not.toBe('');
		}
	});

	it.each(LOCALES)('todo resource type tiene etiqueta en %s', (_name, messages) => {
		for (const rt of DOMAIN_RESOURCE_TYPES) {
			const value = resolve(messages, ['audit', 'resources', rt]);
			expect(value, `falta audit.resources.${rt}`).toBeTypeOf('string');
			expect((value as string).trim(), `audit.resources.${rt} está vacío`).not.toBe('');
		}
	});

	it.each(LOCALES)('todo rango rápido del view tiene etiqueta en %s', (_name, messages) => {
		for (const key of ['1w', '2w', '1m', '3m', '6m', 'all']) {
			const value = resolve(messages, ['audit', 'ranges', key]);
			expect(value, `falta audit.ranges.${key}`).toBeTypeOf('string');
		}
	});
});
