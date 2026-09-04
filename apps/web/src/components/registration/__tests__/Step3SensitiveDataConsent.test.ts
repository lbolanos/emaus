// La información de salud es un dato sensible (LFPDPPP art. 9) y exige
// consentimiento expreso. La casilla que lo recoge es condicional: aparece solo
// cuando el participante declara algún dato de salud, para no añadir fricción a
// quien responde "no" a todo.
//
// Este test fija ese contrato en la UI. El guard equivalente del servidor está
// en apps/api/src/tests/services/sensitiveDataConsent.simple.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import Step3ServiceInfo from '../Step3ServiceInfo.vue';

vi.mock('@repo/ui', () => ({
	Card: { name: 'Card', template: '<div class="card"><slot /></div>' },
	CardContent: { name: 'CardContent', template: '<div class="card-content"><slot /></div>' },
	CardHeader: { name: 'CardHeader', template: '<div class="card-header"><slot /></div>' },
	CardTitle: { name: 'CardTitle', template: '<h3 class="card-title"><slot /></h3>' },
	Input: {
		name: 'Input',
		props: ['modelValue', 'type', 'id', 'placeholder'],
		template: '<input :id="id" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		emits: ['update:modelValue'],
	},
	Label: { name: 'Label', props: ['for'], template: '<label><slot /></label>' },
}));

const CONSENT_KEY = 'serverRegistration.fields.sensitiveDataConsent';

describe('Step3ServiceInfo — consentimiento de datos sensibles', () => {
	let wrapper: VueWrapper;
	let pinia: ReturnType<typeof createPinia>;

	const baseFormData = {
		snores: false,
		hasMedication: false,
		medicationDetails: '',
		medicationSchedule: '',
		hasDietaryRestrictions: false,
		dietaryRestrictionsDetails: '',
		hasDisability: false,
		disabilitySupport: '',
		sacraments: [],
		acceptedSensitiveDataConsent: false,
	};

	// El objeto vivo del modelo: `defineModel` lo muta in-place, así que es aquí
	// donde se observan los cambios, no en los eventos emitidos.
	let model: Record<string, unknown>;

	const mountComponent = (
		overrides: Record<string, unknown> = {},
		errors: Record<string, string> = {},
	) => {
		model = reactive({ ...baseFormData, ...overrides });
		return mount(Step3ServiceInfo, {
			global: { plugins: [pinia], mocks: { $t: (key: string) => key } },
			props: { modelValue: model, errors, type: 'walker' },
		});
	};

	const consentToggle = (w: VueWrapper) =>
		w.findAll('button').find((b) => b.text().includes(CONSENT_KEY));

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);
	});

	afterEach(() => {
		if (wrapper) wrapper.unmount();
	});

	it('no muestra la casilla cuando no se declara ningún dato de salud', () => {
		wrapper = mountComponent();
		expect(wrapper.text()).not.toContain(CONSENT_KEY);
	});

	it.each([
		['medicación', { hasMedication: true }],
		['restricciones alimentarias', { hasDietaryRestrictions: true }],
		['capacidad diferente', { hasDisability: true }],
	])('muestra la casilla al declarar %s', (_label, overrides) => {
		wrapper = mountComponent(overrides);
		expect(wrapper.text()).toContain(CONSENT_KEY);
	});

	it('marca el consentimiento al pulsar la casilla', async () => {
		wrapper = mountComponent({ hasMedication: true });

		await consentToggle(wrapper)!.trigger('click');

		expect(model.acceptedSensitiveDataConsent).toBe(true);
	});

	it('limpia el consentimiento si se dejan de declarar datos de salud', async () => {
		wrapper = mountComponent({ hasMedication: true, acceptedSensitiveDataConsent: true });

		model.hasMedication = false;
		await wrapper.vm.$nextTick();

		expect(model.acceptedSensitiveDataConsent).toBe(false);
		expect(wrapper.text()).not.toContain(CONSENT_KEY);
	});

	it('muestra el mensaje de error del consentimiento cuando falta', () => {
		wrapper = mountComponent(
			{ hasMedication: true },
			{ acceptedSensitiveDataConsent: 'Debes autorizar el uso de tus datos de salud para continuar' },
		);

		expect(wrapper.text()).toContain('Debes autorizar el uso de tus datos de salud para continuar');
	});
});
