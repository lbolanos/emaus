import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MeetingRecurrenceForm from '../MeetingRecurrenceForm.vue';

// El mock global de '@repo/ui' (apps/web/src/test/setup.ts) tiene un Input
// que no emite update:modelValue al cambiar. Lo sobrescribimos junto con Switch
// para poder testear el flow del datepicker.
vi.mock('@repo/ui', async () => {
	const actual: any = await vi.importActual('@repo/ui');
	return {
		...actual,
		Input: {
			name: 'Input',
			template:
				'<input :value="modelValue" :type="type" :min="min" @input="$emit(\'update:modelValue\', $event.target.value)" />',
			props: ['modelValue', 'placeholder', 'type', 'disabled', 'min', 'max'],
			emits: ['update:modelValue'],
		},
		Switch: {
			name: 'Switch',
			template:
				'<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
			props: ['modelValue', 'disabled'],
			emits: ['update:modelValue'],
		},
	};
});

const baseRecurrence = {
	frequency: 'weekly' as const,
	interval: 1,
	dayOfWeek: 'monday',
	dayOfMonth: null as number | null,
	endDate: null as string | null,
};

const factory = (overrides: Record<string, any> = {}) =>
	mount(MeetingRecurrenceForm, {
		props: {
			isRecurring: true,
			recurrence: { ...baseRecurrence, ...(overrides.recurrence ?? {}) },
			startDate: overrides.startDate ?? '2026-06-01',
			...overrides.props,
		},
		global: {
			mocks: {
				$t: (key: string) => key,
			},
		},
	});

describe('MeetingRecurrenceForm — recurrenceEndDate', () => {
	it('renders the endDate input when recurring', () => {
		const wrapper = factory();
		const dateInputs = wrapper.findAll('input[type="date"]');
		expect(dateInputs.length).toBeGreaterThanOrEqual(1);
	});

	it('hides the entire recurrence block when isRecurring=false', () => {
		const wrapper = mount(MeetingRecurrenceForm, {
			props: {
				isRecurring: false,
				recurrence: baseRecurrence,
				startDate: '2026-06-01',
			},
			global: { mocks: { $t: (key: string) => key } },
		});
		expect(wrapper.findAll('input[type="date"]').length).toBe(0);
	});

	it('emits update:endDate with the typed string when the input changes', async () => {
		const wrapper = factory();
		const dateInput = wrapper.find('input[type="date"]');
		(dateInput.element as HTMLInputElement).value = '2026-08-15';
		await dateInput.trigger('input');

		const emitted = wrapper.emitted('update:endDate');
		expect(emitted).toBeTruthy();
		expect(emitted![0]).toEqual(['2026-08-15']);
	});

	it('emits null when the date input is cleared', async () => {
		const wrapper = factory({ recurrence: { endDate: '2026-07-01' } });
		const dateInput = wrapper.find('input[type="date"]');
		(dateInput.element as HTMLInputElement).value = '';
		await dateInput.trigger('input');

		const emitted = wrapper.emitted('update:endDate');
		expect(emitted).toBeTruthy();
		// Empty string → null para limpiar el overlay.
		expect(emitted![emitted!.length - 1]).toEqual([null]);
	});

	it('uses startDate as min attribute of the endDate input', () => {
		const wrapper = factory({ startDate: '2026-09-10' });
		const dateInput = wrapper.find('input[type="date"]');
		expect(dateInput.attributes('min')).toBe('2026-09-10');
	});

	it('falls back to today as min when startDate prop is absent', () => {
		const wrapper = mount(MeetingRecurrenceForm, {
			props: {
				isRecurring: true,
				recurrence: baseRecurrence,
			},
			global: { mocks: { $t: (key: string) => key } },
		});
		const dateInput = wrapper.find('input[type="date"]');
		const today = new Date().toISOString().slice(0, 10);
		expect(dateInput.attributes('min')).toBe(today);
	});

	it('preview text includes the endDate when set (weekly)', () => {
		const wrapper = factory({ recurrence: { endDate: '2026-12-31' } });
		expect(wrapper.text()).toContain('hasta el 2026-12-31');
	});

	it('preview text does NOT include "hasta el" when no endDate', () => {
		const wrapper = factory();
		expect(wrapper.text()).not.toContain('hasta el');
	});

	it('preview text reflects monthly with endDate', () => {
		const wrapper = factory({
			recurrence: { frequency: 'monthly', dayOfMonth: 15, endDate: '2027-01-01' },
		});
		expect(wrapper.text()).toContain('cada mes el día 15');
		expect(wrapper.text()).toContain('hasta el 2027-01-01');
	});

	it('preview text reflects daily without endDate', () => {
		const wrapper = factory({ recurrence: { frequency: 'daily', endDate: null } });
		expect(wrapper.text()).toContain('diariamente');
	});
});
