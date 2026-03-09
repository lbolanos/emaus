import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Step1PersonalInfo from '../Step1PersonalInfo.vue';

vi.mock('@repo/ui', () => ({
	Card: { name: 'Card', template: '<div class="card"><slot /></div>' },
	CardContent: { name: 'CardContent', template: '<div class="card-content"><slot /></div>' },
	CardHeader: { name: 'CardHeader', template: '<div class="card-header"><slot /></div>' },
	CardTitle: { name: 'CardTitle', template: '<h3 class="card-title"><slot /></h3>' },
	Input: {
		name: 'Input',
		props: ['modelValue', 'type', 'min', 'max', 'id'],
		template: '<input :type="type" :value="modelValue" :min="min" :max="max" :id="id" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		emits: ['update:modelValue'],
	},
	Label: { name: 'Label', props: ['for'], template: '<label><slot /></label>' },
	Select: { name: 'Select', props: ['modelValue'], template: '<div><slot /></div>', emits: ['update:modelValue'] },
	SelectContent: { name: 'SelectContent', template: '<div><slot /></div>' },
	SelectItem: { name: 'SelectItem', props: ['value'], template: '<option :value="value"><slot /></option>' },
	SelectTrigger: { name: 'SelectTrigger', template: '<div><slot /></div>' },
	SelectValue: { name: 'SelectValue', props: ['placeholder'], template: '<span>{{ placeholder }}</span>' },
}));

describe('Step1PersonalInfo', () => {
	let wrapper: VueWrapper;
	let pinia: ReturnType<typeof createPinia>;

	const defaultFormData = {
		firstName: '',
		lastName: '',
		nickname: '',
		birthDate: '',
		maritalStatus: '',
		parish: '',
		homePhone: '',
		workPhone: '',
		cellPhone: '',
		email: '',
		occupation: '',
	};

	const mountComponent = (formData = defaultFormData, errors: Record<string, string> = {}) => {
		return mount(Step1PersonalInfo, {
			global: {
				plugins: [pinia],
				mocks: { $t: (key: string) => key },
			},
			props: {
				modelValue: { ...formData },
				errors,
			},
		});
	};

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);
	});

	afterEach(() => {
		if (wrapper) wrapper.unmount();
	});

	describe('Birth Date Input Constraints', () => {
		it('should set min attribute to 1930-01-01', () => {
			wrapper = mountComponent();
			const birthInput = wrapper.find('input[id="birthDate"]');
			expect(birthInput.attributes('min')).toBe('1930-01-01');
		});

		it('should set max attribute to 20 years ago from today', () => {
			wrapper = mountComponent();
			const birthInput = wrapper.find('input[id="birthDate"]');

			const expected = new Date();
			expected.setFullYear(expected.getFullYear() - 20);
			const expectedStr = expected.toISOString().slice(0, 10);

			expect(birthInput.attributes('max')).toBe(expectedStr);
		});

		it('should have type="date" on birth date input', () => {
			wrapper = mountComponent();
			const birthInput = wrapper.find('input[id="birthDate"]');
			expect(birthInput.attributes('type')).toBe('date');
		});
	});

	describe('Error Display', () => {
		it('should show error message when birthDate has error', () => {
			wrapper = mountComponent(defaultFormData, { birthDate: 'Invalid date' });
			const errorText = wrapper.findAll('p.text-red-500').find(p => p.text() === 'Invalid date');
			expect(errorText).toBeTruthy();
		});

		it('should apply error class to birthDate input when error exists', () => {
			wrapper = mountComponent(defaultFormData, { birthDate: 'Required' });
			const birthInput = wrapper.find('input[id="birthDate"]');
			expect(birthInput.classes()).toContain('border-red-500');
		});
	});
});
