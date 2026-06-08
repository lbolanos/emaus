import { diffFields, sanitizeSnapshot } from '@/utils/auditDiff';

describe('auditDiff', () => {
	describe('diffFields', () => {
		it('devuelve solo los campos que cambiaron', () => {
			const diff = diffFields(
				{ name: 'A', cost: 10, city: 'MX' },
				{ name: 'B', cost: 10, city: 'GDL' },
			);
			expect(diff).toEqual({
				name: { from: 'A', to: 'B' },
				city: { from: 'MX', to: 'GDL' },
			});
		});

		it('devuelve null cuando no hay cambios escalares', () => {
			expect(diffFields({ a: 1 }, { a: 1 })).toBeNull();
		});

		it('respeta la allowlist de fields', () => {
			const diff = diffFields(
				{ name: 'A', secretInternal: 'x' },
				{ name: 'B', secretInternal: 'y' },
				['name'],
			);
			expect(diff).toEqual({ name: { from: 'A', to: 'B' } });
		});

		it('nunca incluye campos secretos (password, token, etc.)', () => {
			const diff = diffFields(
				{ password: 'old', token: 't1', email: 'a@x.com' },
				{ password: 'new', token: 't2', email: 'b@x.com' },
			);
			expect(diff).toEqual({ email: { from: 'a@x.com', to: 'b@x.com' } });
		});

		it('ignora objetos/relaciones anidadas (solo escalares)', () => {
			const diff = diffFields(
				{ name: 'A', house: { id: '1' } },
				{ name: 'A', house: { id: '2' } },
			);
			expect(diff).toBeNull();
		});

		it('normaliza Date a ISO para comparar', () => {
			const d1 = new Date('2026-01-01T00:00:00.000Z');
			const d2 = new Date('2026-01-01T00:00:00.000Z');
			expect(diffFields({ at: d1 }, { at: d2 })).toBeNull();
		});

		it('devuelve null si falta old o new', () => {
			expect(diffFields(null, { a: 1 })).toBeNull();
			expect(diffFields({ a: 1 }, null)).toBeNull();
		});
	});

	describe('sanitizeSnapshot', () => {
		it('copia solo escalares no-secretos', () => {
			const snap = sanitizeSnapshot({
				name: 'A',
				password: 'x',
				house: { id: '1' },
				cost: 5,
			});
			expect(snap).toEqual({ name: 'A', cost: 5 });
		});

		it('respeta la allowlist', () => {
			const snap = sanitizeSnapshot({ name: 'A', city: 'MX' }, ['name']);
			expect(snap).toEqual({ name: 'A' });
		});

		it('devuelve null si no quedan campos', () => {
			expect(sanitizeSnapshot({ password: 'x', rel: { a: 1 } })).toBeNull();
			expect(sanitizeSnapshot(null)).toBeNull();
		});
	});
});
