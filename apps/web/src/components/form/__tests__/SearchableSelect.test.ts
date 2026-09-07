import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import SearchableSelect from '../SearchableSelect.vue';

/**
 * The country field of the public registration used a plain reka-ui Select with
 * 250 options: on a phone only the ~19 that fit on screen could be tapped, with
 * no search box and no scroll buttons. This component replaced it, so the search
 * and the tap-to-choose behaviour are what these tests pin down.
 */

const OPTIONS = [
	{ value: 'AR', label: 'Argentina' },
	{ value: 'ES', label: 'España' },
	{ value: 'MX', label: 'México' },
	{ value: 'US', label: 'Estados Unidos' },
];

function mountSelect(props: Record<string, unknown> = {}) {
	return mount(SearchableSelect, {
		attachTo: document.body,
		props: { modelValue: '', options: OPTIONS, id: 'country', ...props },
	});
}

const trigger = (wrapper: VueWrapper) => wrapper.get('[role="combobox"]');
const optionLabels = (wrapper: VueWrapper) =>
	wrapper.findAll('[role="option"]').map((o) => o.text());

describe('SearchableSelect', () => {
	let wrapper: VueWrapper | null = null;

	beforeEach(() => {
		document.body.innerHTML = '';
	});

	afterEach(() => {
		wrapper?.unmount();
		wrapper = null;
	});

	it('shows the label of the selected value, not its code', () => {
		wrapper = mountSelect({ modelValue: 'MX' });
		expect(trigger(wrapper).text()).toContain('México');
	});

	it('falls back to the placeholder when nothing is selected', () => {
		wrapper = mountSelect({ placeholder: 'País' });
		expect(trigger(wrapper).text()).toContain('País');
	});

	it('opens the list with a search box', async () => {
		wrapper = mountSelect();
		expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

		await trigger(wrapper).trigger('click');

		expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
		expect(wrapper.find('input[type="text"]').exists()).toBe(true);
		expect(optionLabels(wrapper)).toEqual(['Argentina', 'España', 'México', 'Estados Unidos']);
	});

	it('filters ignoring case and accents', async () => {
		wrapper = mountSelect();
		await trigger(wrapper).trigger('click');

		// A phone keyboard rarely types the accent: "mexico" must find "México".
		await wrapper.get('input[type="text"]').setValue('mexico');
		expect(optionLabels(wrapper)).toEqual(['México']);

		// Case and the ñ are folded too: "ESPAN" still finds "España".
		await wrapper.get('input[type="text"]').setValue('ESPAN');
		expect(optionLabels(wrapper)).toEqual(['España']);

		await wrapper.get('input[type="text"]').setValue('zzz');
		expect(optionLabels(wrapper)).toEqual([]);
	});

	it('ignores stray spaces around the query', async () => {
		wrapper = mountSelect();
		await trigger(wrapper).trigger('click');

		// Autocomplete and paste on a phone often leave a trailing space.
		await wrapper.get('input[type="text"]').setValue('  mexico  ');
		expect(optionLabels(wrapper)).toEqual(['México']);
	});

	it('emits the chosen value and closes', async () => {
		wrapper = mountSelect();
		await trigger(wrapper).trigger('click');
		await wrapper.get('input[type="text"]').setValue('argent');

		await wrapper.get('[role="option"]').trigger('click');

		expect(wrapper.emitted('update:modelValue')).toEqual([['AR']]);
		expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
	});

	it('reaches an option that a phone-sized list would never show', async () => {
		const many = Array.from({ length: 250 }, (_, i) => ({
			value: `C${i}`,
			label: `Country ${i}`,
		}));
		wrapper = mountSelect({ options: many, maxVisible: 20 });
		await trigger(wrapper).trigger('click');

		// Only a slice renders until the user types — the DOM stays small.
		expect(wrapper.findAll('[role="option"]')).toHaveLength(20);

		await wrapper.get('input[type="text"]').setValue('Country 249');
		await wrapper.get('[role="option"]').trigger('click');

		expect(wrapper.emitted('update:modelValue')).toEqual([['C249']]);
	});

	it('keeps Escape from reaching the dialog that wraps the form', async () => {
		wrapper = mountSelect();
		await trigger(wrapper).trigger('click');
		expect(wrapper.find('[role="listbox"]').exists()).toBe(true);

		const event = new KeyboardEvent('keydown', {
			key: 'Escape',
			bubbles: true,
			cancelable: true,
		});
		let reachedTheDialog = false;
		document.addEventListener('keydown', () => {
			reachedTheDialog = true;
		});
		wrapper.element.dispatchEvent(event);
		await wrapper.vm.$nextTick();

		expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
		expect(reachedTheDialog).toBe(false);
	});

	it('closes when the user taps outside', async () => {
		wrapper = mountSelect();
		await trigger(wrapper).trigger('click');
		expect(wrapper.find('[role="listbox"]').exists()).toBe(true);

		document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		await wrapper.vm.$nextTick();

		expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
	});

	it('does not open while the options are still loading', async () => {
		wrapper = mountSelect({ disabled: true });
		await trigger(wrapper).trigger('click');
		expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
	});
});
