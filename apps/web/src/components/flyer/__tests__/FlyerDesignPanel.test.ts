import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { FlyerBlockId, FlyerBlockLayout, FlyerTheme } from '@repo/types';
import FlyerDesignPanel from '../editor/FlyerDesignPanel.vue';

const BLOCKS: FlyerBlockLayout[] = [
	{ id: 'intro', slot: 'left', order: 0, visible: true },
	{ id: 'startTime', slot: 'left', order: 1, visible: false },
	{ id: 'location', slot: 'right', order: 0, visible: true },
];

function mountPanel(over: Partial<Record<string, unknown>> = {}) {
	return mount(FlyerDesignPanel, {
		props: {
			blocks: BLOCKS,
			theme: {} as FlyerTheme,
			blockStyles: {},
			selectedBlockId: null as FlyerBlockId | null,
			...over,
		},
	});
}

const section = (wrapper: ReturnType<typeof mountPanel>, name: string) =>
	wrapper.find(`[data-section="${name}"]`);

describe('FlyerDesignPanel', () => {
	it('opens the blocks section and leaves the palette folded away', () => {
		const wrapper = mountPanel();

		expect(section(wrapper, 'blocks').attributes('aria-expanded')).toBe('true');
		expect(section(wrapper, 'whole-flyer').attributes('aria-expanded')).toBe('false');
	});

	it('folds and unfolds each section on its own', async () => {
		const wrapper = mountPanel();

		await section(wrapper, 'whole-flyer').trigger('click');
		expect(section(wrapper, 'whole-flyer').attributes('aria-expanded')).toBe('true');
		// Opening one must not close the other: they are not a single accordion
		expect(section(wrapper, 'blocks').attributes('aria-expanded')).toBe('true');

		await section(wrapper, 'blocks').trigger('click');
		expect(section(wrapper, 'blocks').attributes('aria-expanded')).toBe('false');
	});

	// The fields are v-show'd, so a folded section keeps whatever is typed in it
	it('keeps the folded fields mounted', () => {
		const wrapper = mountPanel();
		expect(wrapper.find('input[type="color"]').exists()).toBe(true);
	});

	// Clicking a block on the flyer selects it; its fields have to be reachable
	it('unfolds the blocks section when a block gets selected', async () => {
		const wrapper = mountPanel();
		await section(wrapper, 'blocks').trigger('click');
		expect(section(wrapper, 'blocks').attributes('aria-expanded')).toBe('false');

		await wrapper.setProps({ selectedBlockId: 'intro' });
		await nextTick();

		expect(section(wrapper, 'blocks').attributes('aria-expanded')).toBe('true');
		expect(wrapper.text()).toContain('retreatFlyerEditor.design.reset');
	});

	// Folded, the header is all you can see — it has to carry the signal
	it('counts the hidden blocks in the header', () => {
		expect(section(mountPanel(), 'blocks').text()).toContain(
			'retreatFlyerEditor.design.hiddenCount',
		);
	});

	it('warns about poor contrast from the header too', () => {
		const wrapper = mountPanel({
			theme: { textColor: '#ffffff', backgroundColor: '#ffffff', backgroundOpacity: 100 },
		});

		expect(section(wrapper, 'blocks').html()).toContain('retreatFlyerEditor.design.lowContrast');
	});

	it('shows the theme colours in the palette header, or says it is untouched', async () => {
		const untouched = mountPanel();
		expect(section(untouched, 'whole-flyer').text()).toContain(
			'retreatFlyerEditor.design.preset.original',
		);

		const themed = mountPanel({ theme: { textColor: '#112233', headingColor: '#445566' } });
		const swatches = section(themed, 'whole-flyer').findAll('span[style]');
		expect(swatches.map((s) => s.attributes('style'))).toEqual([
			'background-color: #445566;',
			'background-color: #112233;',
		]);
	});

	it('still emits what the fields inside a section are for', async () => {
		const wrapper = mountPanel();

		await wrapper.find('[data-toggle-visibility="intro"]').trigger('click');
		expect(wrapper.emitted('toggleVisibility')?.[0]).toEqual(['intro']);

		await wrapper.find('[data-move-down="intro"]').trigger('click');
		expect(wrapper.emitted('moveBlock')?.[0]).toEqual(['intro', 'left', 1]);
	});
});
