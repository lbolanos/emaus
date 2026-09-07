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

	it('sets the alignment, which moves the icons and boxes too, not just the words', async () => {
		const wrapper = mountFields({ textAlign: 'left' });
		await wrapper.find('[data-align-option="right"]').trigger('click');

		expect(updates(wrapper)).toContainEqual(['textAlign', 'right']);
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
		// …and the opacity slider is out of the way while there is no box
		expect(wrapper.find('input[type="range"]').exists()).toBe(false);
	});

	it('offers the opacity slider once there is a box', () => {
		const wrapper = mountFields({ backgroundColor: '#ffffff', backgroundOpacity: 65 });
		expect(wrapper.find('input[type="range"]').exists()).toBe(true);
	});

	it('emits the text and heading colours independently of the background', async () => {
		const wrapper = mountFields();

		const swatches = wrapper.findAll('button[aria-label^="#"]');
		await swatches[0].trigger('click');

		expect(updates(wrapper)[0][0]).toBe('textColor');
	});

	it('toggles the text shadow', async () => {
		const wrapper = mountFields();
		await wrapper.find('input[type="checkbox"]').setValue(true);

		expect(updates(wrapper)).toContainEqual(['textShadow', true]);
	});
});
