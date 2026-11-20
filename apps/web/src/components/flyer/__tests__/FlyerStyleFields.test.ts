import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { FlyerBlockStyle } from '@repo/types';
import FlyerStyleFields from '../editor/FlyerStyleFields.vue';

function mountFields(values: FlyerBlockStyle = {}) {
	return mount(FlyerStyleFields, { props: { values } });
}

const buttonWith = (wrapper: ReturnType<typeof mountFields>, key: string) =>
	wrapper.findAll('button').find((b) => b.text().includes(key));

/** All the [key, value] pairs emitted so far. */
const updates = (wrapper: ReturnType<typeof mountFields>) =>
	(wrapper.emitted('update') ?? []) as [string, unknown][];

describe('FlyerStyleFields', () => {
	// The bug this guards: "none" used to emit an absent backgroundColor, which cannot
	// clear the veil the cost block gets from its defaults — the box stayed put.
	it('switches the background off with an explicit zero opacity', async () => {
		const wrapper = mountFields({ backgroundColor: '#ffffff', backgroundOpacity: 65 });
		await buttonWith(wrapper, 'retreatFlyerEditor.design.background.none')!.trigger('click');

		expect(updates(wrapper)).toContainEqual(['backgroundColor', undefined]);
		expect(updates(wrapper)).toContainEqual(['backgroundOpacity', 0]);
	});

	it('brings the opacity back when a veil is picked after switching off', async () => {
		const wrapper = mountFields({ backgroundOpacity: 0 });
		await buttonWith(wrapper, 'retreatFlyerEditor.design.background.light')!.trigger('click');

		expect(updates(wrapper)).toContainEqual(['backgroundColor', '#ffffff']);
		expect(updates(wrapper)).toContainEqual(['backgroundOpacity', 85]);
	});

	it('aligns one slot without moving the others', async () => {
		const wrapper = mountFields();
		await wrapper.find('[data-slot-align="title:right"]').trigger('click');

		expect(updates(wrapper)).toContainEqual(['fonts', { title: { align: 'right' } }]);
	});

	it('leaves a chosen opacity alone when only the colour changes', async () => {
		const wrapper = mountFields({ backgroundColor: '#ffffff', backgroundOpacity: 40 });
		await buttonWith(wrapper, 'retreatFlyerEditor.design.background.dark')!.trigger('click');

		expect(updates(wrapper)).toContainEqual(['backgroundColor', '#000000']);
		expect(updates(wrapper).map(([key]) => key)).not.toContain('backgroundOpacity');
	});

	it('shows a zero-opacity background as "none"', () => {
		const wrapper = mountFields({ backgroundColor: '#ffffff', backgroundOpacity: 0 });
		const none = buttonWith(wrapper, 'retreatFlyerEditor.design.background.none');

		expect(none!.classes().join(' ')).toContain('border-primary');
		// …and the opacity slider is out of the way while there is no box (the
		// per-slot size steppers are buttons, not ranges)
		expect(wrapper.find('[data-opacity-slider]').exists()).toBe(false);
		expect(wrapper.findAll('input[type="range"]').length).toBe(0);
	});

	it('offers the opacity slider once there is a box', () => {
		const wrapper = mountFields({ backgroundColor: '#ffffff', backgroundOpacity: 65 });
		expect(wrapper.find('[data-opacity-slider]').exists()).toBe(true);
	});

	it('colours one slot without touching the others', async () => {
		const wrapper = mountFields();

		await wrapper.find('[data-slot-color-swatch="emphasis:#fde68a"]').trigger('click');
		expect(updates(wrapper)).toContainEqual(['fonts', { emphasis: { color: '#fde68a' } }]);

		// The free picker writes the same slot
		await wrapper.setProps({ values: { fonts: { emphasis: { color: '#fde68a' } } } });
		const section = wrapper.find('[data-font-slot-section="emphasis"]');
		await section.find('input[type="color"]').setValue('#b45309');
		expect(updates(wrapper)).toContainEqual([
			'fonts',
			{ emphasis: { color: '#b45309' } },
		]);
	});

	it('toggles the text shadow', async () => {
		const wrapper = mountFields();
		await wrapper.find('input[type="checkbox"]').setValue(true);

		expect(updates(wrapper)).toContainEqual(['textShadow', true]);
	});

	it('steps the slot size with taps, clamped, and resets to the designed size', async () => {
		const wrapper = mountFields();
		expect(wrapper.findAll('[data-font-slot-section]').length).toBe(3);

		// No reset button while at the designed size
		expect(wrapper.find('[data-slot-scale-reset]').exists()).toBe(false);

		await wrapper.find('[data-slot-scale-plus="emphasis"]').trigger('click');
		expect(updates(wrapper)).toContainEqual(['fonts', { emphasis: { scale: 105 } }]);

		// Store round-trip, then down again: back at 100 the slot clears itself
		await wrapper.setProps({ values: { fonts: { emphasis: { scale: 105 } } } });
		await wrapper.find('[data-slot-scale-minus="emphasis"]').trigger('click');
		expect(updates(wrapper)).toContainEqual(['fonts', undefined]);

		// Clamped at the range edges — the buttons disable instead of wrapping
		await wrapper.setProps({ values: { fonts: { emphasis: { scale: 160 } } } });
		expect(wrapper.find('[data-slot-scale-plus="emphasis"]').attributes('disabled')).toBeDefined();
		await wrapper.setProps({ values: { fonts: { emphasis: { scale: 70 } } } });
		expect(wrapper.find('[data-slot-scale-minus="emphasis"]').attributes('disabled')).toBeDefined();
		// And one tap on reset clears a stray value
		await wrapper.find('[data-slot-scale-reset="emphasis"]').trigger('click');
		expect(updates(wrapper)).toContainEqual(['fonts', undefined]);
	});

	it('emits one slot family at a time, clearing at Original', async () => {
		const wrapper = mountFields();

		const emphasis = wrapper.find('[data-font-slot-section="emphasis"]');
		await emphasis.find('select').setValue('oswald');
		expect(updates(wrapper)).toContainEqual(['fonts', { emphasis: { family: 'oswald' } }]);

		await wrapper.setProps({ values: { fonts: { emphasis: { family: 'oswald' } } } });
		await emphasis.find('select').setValue('inherit');
		expect(updates(wrapper)).toContainEqual(['fonts', undefined]);
	});

	it('shows only the slots the block actually mixes', () => {
		const wrapper = mount(FlyerStyleFields, {
			props: { values: {}, fontSlots: ['title', 'body'] },
		});

		const slots = wrapper.findAll('[data-font-slot-section]');
		expect(slots.length).toBe(2);
		expect(wrapper.find('[data-font-slot-section="emphasis"]').exists()).toBe(false);
	});
});
