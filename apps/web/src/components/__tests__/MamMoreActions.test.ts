import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MamMoreActions from '../MamMoreActions.vue';

// "Contraer/Expandir todos los días" (specs/ux-mam-responsabilidades, D4):
// only for the instance with days (`collapsible`) and while grouping by day.
const mountMenu = (props: Record<string, unknown>) =>
	mount(MamMoreActions, {
		props: { canManage: false, publicMamUrl: null, groupBy: 'day', open: true, ...props },
	});

const labels = (w: ReturnType<typeof mountMenu>) => w.findAll('[role="menuitem"]').map((b) => b.text());

describe('MamMoreActions — collapse days', () => {
	it('offers both actions and emits them', async () => {
		const w = mountMenu({ collapsible: true });
		const collapse = w.findAll('[role="menuitem"]').find((b) => b.text().includes('Contraer todos'));
		const expand = w.findAll('[role="menuitem"]').find((b) => b.text().includes('Expandir todos'));
		await collapse!.trigger('click');
		await expand!.trigger('click');
		expect(Object.keys(w.emitted())).toEqual(expect.arrayContaining(['collapse-all', 'expand-all']));
	});

	it('hides them without `collapsible` (empty schedule)', () => {
		expect(labels(mountMenu({})).some((l) => l.includes('todos los días'))).toBe(false);
	});

	it('hides them while grouping by responsibility', () => {
		expect(labels(mountMenu({ collapsible: true, groupBy: 'responsibility' })).some((l) => l.includes('todos los días'))).toBe(false);
	});
});
