import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import AngelitoAvailabilityEditor from '../AngelitoAvailabilityEditor.vue';

vi.mock('@repo/ui', () => ({
	Input: {
		name: 'Input',
		props: ['modelValue', 'type', 'min', 'max'],
		emits: ['update:modelValue'],
		template:
			'<input :type="type" :value="modelValue" :min="min" :max="max" @input="$emit(\'update:modelValue\', $event.target.value)" />',
	},
	Button: {
		name: 'Button',
		props: ['type', 'variant', 'size', 'disabled'],
		template: '<button :type="type"><slot /></button>',
	},
	Tooltip: { name: 'Tooltip', template: '<div><slot /></div>' },
	TooltipContent: { name: 'TooltipContent', template: '<div class="tt-content"><slot /></div>' },
	TooltipProvider: { name: 'TooltipProvider', template: '<div><slot /></div>' },
	TooltipTrigger: {
		name: 'TooltipTrigger',
		props: ['asChild'],
		template: '<span class="tt-trigger"><slot /></span>',
	},
}));

vi.mock('lucide-vue-next', () => ({
	Trash2: { name: 'Trash2', template: '<svg class="trash-icon"></svg>' },
}));

type Block = { id?: string; startTime: string | Date; endTime: string | Date };

const mountComponent = (
	props: {
		modelValue?: Block[] | undefined;
		minDate?: string | Date | null;
		maxDate?: string | Date | null;
	} = {},
) =>
	mount(AngelitoAvailabilityEditor, {
		global: { mocks: { $t: (key: string) => key } },
		props,
	});

describe('AngelitoAvailabilityEditor', () => {
	let wrapper: VueWrapper;
	afterEach(() => {
		if (wrapper) wrapper.unmount();
	});

	describe('Estado vacío', () => {
		it('muestra el mensaje vacío cuando modelValue es []', () => {
			wrapper = mountComponent({ modelValue: [] });
			expect(wrapper.text()).toContain(
				'serverRegistration.fields.angelitoAvailability.empty',
			);
		});

		it('muestra el mensaje vacío cuando modelValue es undefined', () => {
			wrapper = mountComponent({ modelValue: undefined });
			expect(wrapper.text()).toContain(
				'serverRegistration.fields.angelitoAvailability.empty',
			);
		});

		it('no renderiza inputs datetime-local cuando no hay bloques', () => {
			wrapper = mountComponent({ modelValue: [] });
			expect(wrapper.findAll('input[type="datetime-local"]').length).toBe(0);
		});

		it('siempre renderiza el botón "agregar bloque" aunque esté vacío', () => {
			wrapper = mountComponent({ modelValue: [] });
			const addBtn = wrapper.findAll('button').find((b) => b.text().includes('addBlock'));
			expect(addBtn).toBeTruthy();
		});
	});

	describe('Render de bloques', () => {
		it('renderiza dos inputs datetime-local por cada bloque', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
					{ startTime: '2026-06-06T08:00:00.000Z', endTime: '2026-06-06T12:00:00.000Z' },
				],
			});
			expect(wrapper.findAll('input[type="datetime-local"]').length).toBe(4);
		});

		it('renderiza un botón eliminar (Trash2) por cada bloque', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
					{ startTime: '2026-06-06T08:00:00.000Z', endTime: '2026-06-06T12:00:00.000Z' },
				],
			});
			expect(wrapper.findAll('.trash-icon').length).toBe(2);
		});
	});

	describe('addBlock', () => {
		it('emite update:modelValue con un bloque adicional', async () => {
			wrapper = mountComponent({
				modelValue: [],
				minDate: '2026-06-05T00:00:00.000Z',
			});
			const addBtn = wrapper.findAll('button').find((b) => b.text().includes('addBlock'));
			await addBtn!.trigger('click');

			const emitted = wrapper.emitted('update:modelValue');
			expect(emitted).toBeTruthy();
			const next = emitted![emitted!.length - 1][0] as Block[];
			expect(next.length).toBe(1);
			expect(typeof next[0].startTime).toBe('string');
			expect(typeof next[0].endTime).toBe('string');
		});

		it('default startTime usa la fecha calendario del retiro (timezone-safe)', async () => {
			// Bug recurrente (CLAUDE.md): new Date("2026-06-05T00:00:00Z") en CDMX
			// representa internamente "04-jun 18:00 local". calendarDateOnly() debe
			// extraer YYYY-MM-DD del string sin pasar por Date.
			wrapper = mountComponent({
				modelValue: [],
				minDate: '2026-06-05T00:00:00.000Z',
			});
			const addBtn = wrapper.findAll('button').find((b) => b.text().includes('addBlock'));
			await addBtn!.trigger('click');

			const emitted = wrapper.emitted('update:modelValue');
			const block = (emitted![0][0] as Block[])[0];
			// startTime debe ser un Date local del 5 de junio a las 08:00 → en cualquier TZ
			// el .toISOString() resultante representa ese mismo día (puede caer en UTC del 5).
			// Mas robusto: el objeto Date local coincide con el día calendario del retiro.
			const start = new Date(block.startTime);
			// Convertimos a la zona LOCAL del proceso (es donde defaultStart construyó el Date).
			expect(start.getFullYear()).toBe(2026);
			expect(start.getMonth()).toBe(5); // junio (0-indexed)
			expect(start.getDate()).toBe(5);
			expect(start.getHours()).toBe(8);
		});

		it('default endTime es 4 horas después del start', async () => {
			wrapper = mountComponent({
				modelValue: [],
				minDate: '2026-06-05T00:00:00.000Z',
			});
			const addBtn = wrapper.findAll('button').find((b) => b.text().includes('addBlock'));
			await addBtn!.trigger('click');

			const block = (wrapper.emitted('update:modelValue')![0][0] as Block[])[0];
			const start = new Date(block.startTime).getTime();
			const end = new Date(block.endTime).getTime();
			expect(end - start).toBe(4 * 60 * 60 * 1000);
		});

		it('agrega un bloque al final preservando los existentes', async () => {
			const initial: Block[] = [
				{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
			];
			wrapper = mountComponent({ modelValue: initial, minDate: '2026-06-05T00:00:00.000Z' });
			const addBtn = wrapper.findAll('button').find((b) => b.text().includes('addBlock'));
			await addBtn!.trigger('click');

			const next = wrapper.emitted('update:modelValue')![0][0] as Block[];
			expect(next.length).toBe(2);
			expect(next[0].startTime).toBe('2026-06-05T08:00:00.000Z');
		});
	});

	describe('removeBlock', () => {
		it('emite update:modelValue sin el bloque eliminado', async () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
					{ startTime: '2026-06-06T08:00:00.000Z', endTime: '2026-06-06T14:00:00.000Z' },
				],
			});
			const trashButtons = wrapper
				.findAll('button')
				.filter((b) => b.find('.trash-icon').exists());
			expect(trashButtons.length).toBe(2);
			await trashButtons[0].trigger('click');

			const emitted = wrapper.emitted('update:modelValue');
			expect(emitted).toBeTruthy();
			const next = emitted![emitted!.length - 1][0] as Block[];
			expect(next.length).toBe(1);
			expect(next[0].startTime).toBe('2026-06-06T08:00:00.000Z');
		});

		it('eliminar el último bloque deja la lista vacía', async () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
				],
			});
			const trash = wrapper
				.findAll('button')
				.filter((b) => b.find('.trash-icon').exists())[0];
			await trash.trigger('click');
			const next = wrapper.emitted('update:modelValue')!.slice(-1)[0][0] as Block[];
			expect(next.length).toBe(0);
		});
	});

	describe('Validación inline', () => {
		it('marca rango inválido cuando endTime <= startTime', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T14:00:00.000Z', endTime: '2026-06-05T10:00:00.000Z' },
				],
			});
			expect(wrapper.text()).toContain(
				'serverRegistration.fields.angelitoAvailability.invalidRange',
			);
		});

		it('NO marca como inválido un rango correcto', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
				],
			});
			expect(wrapper.text()).not.toContain(
				'serverRegistration.fields.angelitoAvailability.invalidRange',
			);
		});

		it('detecta solapamiento entre dos bloques que se intersectan', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
					{ startTime: '2026-06-05T12:00:00.000Z', endTime: '2026-06-05T16:00:00.000Z' },
				],
			});
			expect(wrapper.html()).toContain(
				'serverRegistration.fields.angelitoAvailability.overlap',
			);
		});

		it('NO marca como overlap a bloques contiguos sin intersección', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
					{ startTime: '2026-06-05T12:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
				],
			});
			expect(wrapper.html()).not.toContain(
				'serverRegistration.fields.angelitoAvailability.overlap',
			);
		});

		it('NO marca como overlap a bloques en días distintos', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
					{ startTime: '2026-06-06T10:00:00.000Z', endTime: '2026-06-06T14:00:00.000Z' },
				],
			});
			expect(wrapper.html()).not.toContain(
				'serverRegistration.fields.angelitoAvailability.overlap',
			);
		});

		it('aplica el estilo amber al contenedor del bloque solapado', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
					{ startTime: '2026-06-05T12:00:00.000Z', endTime: '2026-06-05T16:00:00.000Z' },
				],
			});
			const blocks = wrapper.findAll('.relative.rounded-lg');
			// Ambos bloques deben tener border amber por solapamiento
			expect(blocks[0].classes()).toContain('border-amber-400');
			expect(blocks[1].classes()).toContain('border-amber-400');
		});
	});

	describe('Constraints min/max (timezone safety)', () => {
		it('extrae YYYY-MM-DD del ISO UTC sin desplazamiento por TZ (bug recurrente)', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
				],
				minDate: '2026-06-05T00:00:00.000Z',
				maxDate: '2026-06-07T00:00:00.000Z',
			});
			const inputs = wrapper.findAll('input[type="datetime-local"]');
			// Min debe ser el día 5 a las 00:00 (NO 04 por shift TZ en CDMX)
			expect(inputs[0].attributes('min')).toBe('2026-06-05T00:00');
			// Max debe ser el día 7 a las 23:59 (NO 06)
			expect(inputs[0].attributes('max')).toBe('2026-06-07T23:59');
		});

		it('acepta minDate como objeto Date', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
				],
				minDate: new Date('2026-06-05T00:00:00.000Z'),
			});
			const inputs = wrapper.findAll('input[type="datetime-local"]');
			expect(inputs[0].attributes('min')).toBe('2026-06-05T00:00');
		});

		it('omite min/max cuando no se proveen', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
				],
			});
			const inputs = wrapper.findAll('input[type="datetime-local"]');
			expect(inputs[0].attributes('min')).toBeUndefined();
			expect(inputs[0].attributes('max')).toBeUndefined();
		});

		it('omite min/max cuando se pasan null', () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
				],
				minDate: null,
				maxDate: null,
			});
			const inputs = wrapper.findAll('input[type="datetime-local"]');
			expect(inputs[0].attributes('min')).toBeUndefined();
			expect(inputs[0].attributes('max')).toBeUndefined();
		});
	});

	describe('Edición de fechas', () => {
		it('emite update:modelValue al cambiar startTime de un bloque', async () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
				],
			});
			const startInput = wrapper.findAll('input[type="datetime-local"]')[0];
			await startInput.setValue('2026-06-05T09:30');

			const emitted = wrapper.emitted('update:modelValue');
			expect(emitted).toBeTruthy();
			const next = emitted![emitted!.length - 1][0] as Block[];
			expect(next.length).toBe(1);
			// El valor emitido viene como ISO UTC (fromLocalInput → toISOString)
			expect(typeof next[0].startTime).toBe('string');
			const d = new Date(next[0].startTime);
			expect(d.getFullYear()).toBe(2026);
			expect(d.getMonth()).toBe(5);
			expect(d.getDate()).toBe(5);
			expect(d.getHours()).toBe(9);
			expect(d.getMinutes()).toBe(30);
		});

		it('emite update:modelValue al cambiar endTime de un bloque', async () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T10:00:00.000Z', endTime: '2026-06-05T14:00:00.000Z' },
				],
			});
			const endInput = wrapper.findAll('input[type="datetime-local"]')[1];
			await endInput.setValue('2026-06-05T15:00');

			const emitted = wrapper.emitted('update:modelValue');
			expect(emitted).toBeTruthy();
			const next = emitted![emitted!.length - 1][0] as Block[];
			const d = new Date(next[0].endTime);
			expect(d.getDate()).toBe(5);
			expect(d.getHours()).toBe(15);
		});

		it('cambiar un bloque NO afecta los demás', async () => {
			wrapper = mountComponent({
				modelValue: [
					{ startTime: '2026-06-05T08:00:00.000Z', endTime: '2026-06-05T12:00:00.000Z' },
					{ startTime: '2026-06-06T08:00:00.000Z', endTime: '2026-06-06T12:00:00.000Z' },
				],
			});
			const inputs = wrapper.findAll('input[type="datetime-local"]');
			// Cambiar el endTime del primer bloque (índice 1)
			await inputs[1].setValue('2026-06-05T13:00');

			const next = wrapper.emitted('update:modelValue')!.slice(-1)[0][0] as Block[];
			expect(next.length).toBe(2);
			// Segundo bloque intacto
			expect(next[1].startTime).toBe('2026-06-06T08:00:00.000Z');
			expect(next[1].endTime).toBe('2026-06-06T12:00:00.000Z');
		});
	});
});
