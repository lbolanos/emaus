import { describe, it, expect } from 'vitest';
import { effectiveDefaultTemplate } from '../templateDefault';

describe('effectiveDefaultTemplate (M6: same order as the server)', () => {
	const oldest = { id: 'a', createdAt: '2026-01-01T10:00:00.000Z' };
	const newer = { id: 'b', createdAt: '2026-01-05T10:00:00.000Z' };

	it('without a flagged default, the oldest wins regardless of list order', () => {
		expect(effectiveDefaultTemplate([newer, oldest])?.id).toBe('a');
	});

	it('a flagged default wins over the oldest', () => {
		expect(effectiveDefaultTemplate([oldest, { ...newer, isDefault: true }])?.id).toBe('b');
	});

	it('a template without createdAt never beats a dated one; empty list gives undefined', () => {
		expect(effectiveDefaultTemplate([{ id: 'x' }, newer])?.id).toBe('b');
		expect(effectiveDefaultTemplate([])).toBeUndefined();
	});

	it('does not reorder the caller array', () => {
		const list = [newer, oldest];
		effectiveDefaultTemplate(list);
		expect(list.map((t) => t.id)).toEqual(['b', 'a']);
	});
});
