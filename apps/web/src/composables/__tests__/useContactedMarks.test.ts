import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useContactedMarks } from '../useContactedMarks';

describe('useContactedMarks', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('starts empty when localStorage has nothing', () => {
		const cid = ref('community-1');
		const m = useContactedMarks(cid);
		expect(m.count.value).toBe(0);
		expect(m.isMarked('member-1')).toBe(false);
		expect(m.getMarkedAt('member-1')).toBeUndefined();
	});

	it('toggle marks/unmarks a member and persists to localStorage', () => {
		const cid = ref('community-1');
		const m = useContactedMarks(cid);

		m.toggle('member-1');
		expect(m.isMarked('member-1')).toBe(true);
		expect(m.count.value).toBe(1);
		expect(m.getMarkedAt('member-1')).toMatch(/^\d{4}-/);

		// localStorage debe tener el JSON
		const stored = JSON.parse(localStorage.getItem('community-contacted-community-1') || '{}');
		expect(stored['member-1']).toBeDefined();

		// Toggle de nuevo → desmarca
		m.toggle('member-1');
		expect(m.isMarked('member-1')).toBe(false);
		expect(m.count.value).toBe(0);
	});

	it('mark is idempotent (no cambia timestamp si ya estaba marcado)', async () => {
		const cid = ref('community-1');
		const m = useContactedMarks(cid);
		m.mark('member-1');
		const first = m.getMarkedAt('member-1');
		await new Promise((r) => setTimeout(r, 5));
		m.mark('member-1');
		expect(m.getMarkedAt('member-1')).toBe(first);
	});

	it('unmark removes without throwing si no estaba marcado', () => {
		const cid = ref('community-1');
		const m = useContactedMarks(cid);
		expect(() => m.unmark('inexistente')).not.toThrow();
		m.mark('member-1');
		m.unmark('member-1');
		expect(m.isMarked('member-1')).toBe(false);
	});

	it('clear borra todas las marcas y la entrada de localStorage', () => {
		const cid = ref('community-1');
		const m = useContactedMarks(cid);
		m.toggle('a');
		m.toggle('b');
		m.toggle('c');
		expect(m.count.value).toBe(3);

		m.clear();
		expect(m.count.value).toBe(0);
		expect(localStorage.getItem('community-contacted-community-1')).toBeNull();
	});

	it('marcas son aisladas por comunidad', () => {
		const cidA = ref('community-A');
		const cidB = ref('community-B');
		const mA = useContactedMarks(cidA);
		const mB = useContactedMarks(cidB);

		mA.toggle('shared-member');
		expect(mA.isMarked('shared-member')).toBe(true);
		expect(mB.isMarked('shared-member')).toBe(false);
	});

	it('reload al cambiar communityId — instances mantienen su propia storage', () => {
		// Simular escritura previa para community-B
		localStorage.setItem('community-contacted-community-B', JSON.stringify({ 'x': '2026-05-15T10:00:00Z' }));

		const cid = ref('community-A');
		const m = useContactedMarks(cid);
		expect(m.isMarked('x')).toBe(false);

		// Cambiar al community-B → debe cargar la marca persistida
		cid.value = 'community-B';
		// El watcher es síncrono dentro de Vue test utils para refs primitivos —
		// damos un tick para que el watch se dispare.
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				expect(m.isMarked('x')).toBe(true);
				resolve();
			}, 0);
		});
	});

	it('tolerar localStorage con JSON corrupto sin reventar', () => {
		localStorage.setItem('community-contacted-community-1', '{not valid json');
		const cid = ref('community-1');
		const m = useContactedMarks(cid);
		expect(m.count.value).toBe(0); // reset silencioso
	});
});
