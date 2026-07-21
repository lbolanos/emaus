import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import DeleteRetreatDialog from '../DeleteRetreatDialog.vue';
import { createMockRetreat } from '@/test/utils';
import { useRetreatStore } from '@/stores/retreatStore';

vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn().mockResolvedValue({}),
	},
	getRetreatDeletionImpact: vi.fn().mockResolvedValue({
		activeParticipants: 0,
		totalRegistrations: 0,
		payments: 0,
		tables: 0,
		scheduledMessages: 0,
	}),
}));

// Mock local de @repo/ui: Button propaga el click y el Input soporta v-model,
// para poder ejercitar la lógica de confirmación (el mock global consume onClick).
vi.mock('@repo/ui', () => {
	const pass = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` });
	return {
		Dialog: { props: ['open'], template: '<div><slot /></div>' },
		DialogContent: pass(),
		DialogHeader: pass(),
		DialogTitle: pass('h2'),
		DialogDescription: pass('p'),
		DialogFooter: pass(),
		Label: pass('label'),
		Input: {
			props: ['modelValue', 'placeholder', 'disabled'],
			emits: ['update:modelValue'],
			template:
				'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		},
		Button: {
			props: ['variant', 'disabled'],
			emits: ['click'],
			template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
		},
		useToast: () => ({ toast: vi.fn() }),
	};
});

describe('DeleteRetreatDialog', () => {
	let store: ReturnType<typeof useRetreatStore>;

	beforeEach(() => {
		setActivePinia(createPinia());
		store = useRetreatStore();
		vi.clearAllMocks();
	});

	function mountDialog(retreat: any) {
		return mount(DeleteRetreatDialog, { props: { open: true, retreat } });
	}

	function findEliminar(wrapper: any) {
		return wrapper.findAll('button').find((b: any) => b.text().includes('Eliminar'));
	}

	async function typeName(wrapper: any, value: string) {
		const input = wrapper.find('input');
		await input.setValue(value);
	}

	it('muestra el nombre del retiro a confirmar', () => {
		const retreat = createMockRetreat({ id: 'r1', parish: 'Mi Parroquia' });
		const wrapper = mountDialog(retreat);
		expect(wrapper.text()).toContain('Mi Parroquia');
	});

	it('NO borra si el texto no coincide con el nombre del retiro', async () => {
		const retreat = createMockRetreat({ id: 'r1', parish: 'Parroquia X' });
		const spy = vi.spyOn(store, 'deleteRetreat').mockResolvedValue(undefined);
		const wrapper = mountDialog(retreat);

		await findEliminar(wrapper)!.trigger('click');

		expect(spy).not.toHaveBeenCalled();
	});

	it('borra cuando el texto coincide exactamente y emite update:open', async () => {
		const retreat = createMockRetreat({ id: 'r1', parish: 'Parroquia X' });
		const spy = vi.spyOn(store, 'deleteRetreat').mockResolvedValue(undefined);
		const wrapper = mountDialog(retreat);

		await typeName(wrapper, 'Parroquia X');
		await nextTick();
		await findEliminar(wrapper)!.trigger('click');

		expect(spy).toHaveBeenCalledWith('r1');
		expect(wrapper.emitted('update:open')).toBeTruthy();
		expect(wrapper.emitted('update:open')!.at(-1)).toEqual([false]);
	});

	it('borra aunque el parish guardado tenga espacios al borde (se comparan trimeados)', async () => {
		const retreat = createMockRetreat({ id: 'r1', parish: 'Parroquia X | Mexico City ' });
		const spy = vi.spyOn(store, 'deleteRetreat').mockResolvedValue(undefined);
		const wrapper = mountDialog(retreat);

		// El usuario teclea el nombre sin el espacio final.
		await typeName(wrapper, 'Parroquia X | Mexico City');
		await nextTick();
		await findEliminar(wrapper)!.trigger('click');

		expect(spy).toHaveBeenCalledWith('r1');
	});

	it('NO borra si el nombre no coincide exactamente (espacios internos)', async () => {
		const retreat = createMockRetreat({ id: 'r1', parish: 'Parroquia X' });
		const spy = vi.spyOn(store, 'deleteRetreat').mockResolvedValue(undefined);
		const wrapper = mountDialog(retreat);

		await typeName(wrapper, 'Parroquia   X');
		await nextTick();
		await findEliminar(wrapper)!.trigger('click');

		expect(spy).not.toHaveBeenCalled();
	});
});
