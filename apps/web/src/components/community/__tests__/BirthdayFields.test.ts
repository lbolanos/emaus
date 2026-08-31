import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BirthdayFields from '../BirthdayFields.vue';

/**
 * El campo de cumpleaños emite el formato canónico que entiende el backend:
 * 'YYYY-MM-DD' con año, 'MM-DD' sin él, y '' para "sin fecha". Lo que importa
 * probar aquí es ese contrato de emisión, y que una fecha imposible nunca salga
 * del componente.
 *
 * Los `Select` de @repo/ui son stubs en el setup global, así que la selección
 * se simula emitiendo su evento — que es exactamente lo que hace el componente
 * real de reka-ui.
 */
const mountField = (modelValue = '') => mount(BirthdayFields, { props: { modelValue } });

const pickDay = (wrapper: ReturnType<typeof mountField>, day: string) =>
	wrapper.findAllComponents({ name: 'Select' })[0].vm.$emit('update:modelValue', day);

const pickMonth = (wrapper: ReturnType<typeof mountField>, month: string) =>
	wrapper.findAllComponents({ name: 'Select' })[1].vm.$emit('update:modelValue', month);

const lastEmitted = (wrapper: ReturnType<typeof mountField>, event: string) => {
	const emissions = wrapper.emitted(event);
	return emissions ? emissions[emissions.length - 1][0] : undefined;
};

describe('BirthdayFields', () => {
	it('emite MM-DD cuando no se captura el año', async () => {
		const wrapper = mountField();
		await pickDay(wrapper, '14');
		await pickMonth(wrapper, '03');

		expect(lastEmitted(wrapper, 'update:modelValue')).toBe('03-14');
		expect(lastEmitted(wrapper, 'update:invalid')).toBe(false);
	});

	it('emite YYYY-MM-DD cuando se captura el año', async () => {
		const wrapper = mountField();
		await pickDay(wrapper, '14');
		await pickMonth(wrapper, '03');
		await wrapper.find('input').setValue('1985');

		expect(lastEmitted(wrapper, 'update:modelValue')).toBe('1985-03-14');
		expect(lastEmitted(wrapper, 'update:invalid')).toBe(false);
	});

	it('no emite un valor mientras falte el mes', async () => {
		const wrapper = mountField();
		await pickDay(wrapper, '14');

		expect(lastEmitted(wrapper, 'update:modelValue')).toBe('');
		expect(lastEmitted(wrapper, 'update:invalid')).toBe(true);
	});

	it('bloquea una fecha que no existe en el calendario', async () => {
		const wrapper = mountField();
		await pickDay(wrapper, '31');
		await pickMonth(wrapper, '02');

		expect(lastEmitted(wrapper, 'update:modelValue')).toBe('');
		expect(lastEmitted(wrapper, 'update:invalid')).toBe(true);
		expect(wrapper.text()).toContain('no existe');
	});

	it('rechaza un año fuera de rango', async () => {
		const wrapper = mountField();
		await pickDay(wrapper, '14');
		await pickMonth(wrapper, '03');
		await wrapper.find('input').setValue('1800');

		expect(lastEmitted(wrapper, 'update:invalid')).toBe(true);
		expect(lastEmitted(wrapper, 'update:modelValue')).toBe('');
	});

	it('precarga el valor que recibe del padre', async () => {
		const wrapper = mountField('1985-03-14');
		// El año se pinta en el input; día y mes viven en los stubs de Select.
		expect((wrapper.find('input').element as HTMLInputElement).value).toBe('1985');
		expect(wrapper.text()).toContain('El año solo lo ve el coordinador.');
	});

	it('permite quitar la fecha', async () => {
		const wrapper = mountField('1985-03-14');
		await wrapper.find('button').trigger('click');

		expect(lastEmitted(wrapper, 'update:modelValue')).toBe('');
		expect(lastEmitted(wrapper, 'update:invalid')).toBe(false);
	});
});
