import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Step5ServerInfo from '../Step5ServerInfo.vue';

// The size a server picks has to reach the payload as `shirtSizes`: that is the array
// the backend persists (participant_shirt_size). `shirtSizesByType` is only the index
// the UI reads (step-5 selects and the step-6 summary).

vi.mock('@repo/ui', () => ({
	Card: { template: '<div><slot /></div>' },
	CardContent: { template: '<div><slot /></div>' },
	CardHeader: { template: '<div><slot /></div>' },
	CardTitle: { template: '<h3><slot /></h3>' },
	Label: { props: ['for'], template: '<label><slot /></label>' },
	Input: { props: ['modelValue'], template: '<input :value="modelValue" />', emits: ['update:modelValue'] },
	Checkbox: { props: ['modelValue'], template: '<input type="checkbox" />', emits: ['update:modelValue'] },
	Select: {
		name: 'Select',
		props: ['modelValue'],
		emits: ['update:modelValue'],
		template: '<div class="select"><slot /></div>',
	},
	SelectContent: { template: '<div><slot /></div>' },
	SelectItem: { props: ['value'], template: '<div><slot /></div>' },
	SelectTrigger: { props: ['id'], template: '<div><slot /></div>' },
	SelectValue: { props: ['placeholder'], template: '<div><slot /></div>' },
}));

vi.mock('@/components/AngelitoAvailabilityEditor.vue', () => ({ default: { template: '<div />' } }));

const SHIRT_TYPES = [
	{ id: 'type-jacket', name: 'Chamarra', requiredForWalkers: false, optionalForServers: true, sortOrder: 2, availableSizes: ['S', 'M', 'G'] },
	{ id: 'type-white', name: 'Playera blanca', requiredForWalkers: false, optionalForServers: true, sortOrder: 1, availableSizes: ['S', 'M', 'G'] },
	{ id: 'type-walker', name: 'Playera de caminante', requiredForWalkers: true, optionalForServers: false, sortOrder: 0, availableSizes: ['S', 'M', 'G'] },
];

const mountStep = (formData: Record<string, any> = {}) =>
	mount(Step5ServerInfo, {
		props: { modelValue: formData, errors: {}, shirtTypes: SHIRT_TYPES as any },
		global: { mocks: { $t: (k: string) => k } },
	});

describe('Step5ServerInfo — shirt sizes', () => {
	beforeEach(() => vi.clearAllMocks());

	it('offers only the types marked optional for servers, in order', () => {
		const wrapper = mountStep();
		const labels = wrapper.findAll('label').map((l) => l.text());

		expect(labels).toContain('Playera blanca');
		expect(labels).toContain('Chamarra');
		expect(labels).not.toContain('Playera de caminante');
		expect(labels.indexOf('Playera blanca')).toBeLessThan(labels.indexOf('Chamarra'));
	});

	it('syncs the chosen size into shirtSizesByType and the shirtSizes array', async () => {
		const formData: Record<string, any> = {};
		const wrapper = mountStep(formData);
		const selects = wrapper.findAllComponents({ name: 'Select' });

		await selects[0].vm.$emit('update:modelValue', 'M'); // Playera blanca
		await selects[1].vm.$emit('update:modelValue', 'G'); // Chamarra
		await nextTick();

		expect(formData.shirtSizesByType).toEqual({ 'type-white': 'M', 'type-jacket': 'G' });
		expect(formData.shirtSizes).toEqual([
			{ shirtTypeId: 'type-white', size: 'M' },
			{ shirtTypeId: 'type-jacket', size: 'G' },
		]);
	});

	it('drops a type from the payload when it goes back to "No necesita"', async () => {
		const formData: Record<string, any> = {};
		const wrapper = mountStep(formData);
		const selects = wrapper.findAllComponents({ name: 'Select' });

		await selects[0].vm.$emit('update:modelValue', 'M');
		await selects[1].vm.$emit('update:modelValue', 'G');
		await selects[1].vm.$emit('update:modelValue', 'null');
		await nextTick();

		expect(formData.shirtSizes).toEqual([{ shirtTypeId: 'type-white', size: 'M' }]);
	});

	it('warns when the retreat has no shirt types configured', () => {
		const wrapper = mount(Step5ServerInfo, {
			props: { modelValue: {}, errors: {}, shirtTypes: [] },
			global: { mocks: { $t: (k: string) => k } },
		});

		expect(wrapper.text()).toContain('serverRegistration.fields.noShirtsConfigured');
	});
});
