import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

// i18n: t devuelve la clave (suficiente para asertar estructura).
vi.mock('vue-i18n', () => ({
	useI18n: () => ({ t: (k: string) => k }),
}));

// @repo/ui: stubs simples de los componentes usados.
vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast: vi.fn() }),
	Button: { name: 'Button', template: '<button><slot /></button>' },
	Input: { name: 'Input', props: ['modelValue'], template: '<input />' },
}));

// API: named exports usados por ambos stores (secuencias globales + plantillas globales).
vi.mock('@/services/api', () => ({
	api: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
	getGlobalSequences: vi.fn().mockResolvedValue([]),
	createGlobalSequence: vi.fn(),
	updateGlobalSequence: vi.fn(),
	deleteGlobalSequence: vi.fn(),
	toggleGlobalSequenceActive: vi.fn(),
	copyGlobalSequenceToRetreat: vi.fn(),
}));

vi.mock('lucide-vue-next', () => ({
	Plus: { name: 'Plus', template: '<svg></svg>' },
	Trash2: { name: 'Trash2', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	Pencil: { name: 'Pencil', template: '<svg></svg>' },
	Power: { name: 'Power', template: '<svg></svg>' },
}));

import GlobalMessageSequencesView from '../GlobalMessageSequencesView.vue';
import { useGlobalMessageSequenceStore } from '@/stores/globalMessageSequenceStore';

function mountView() {
	const pinia = createPinia();
	setActivePinia(pinia);
	return mount(GlobalMessageSequencesView, {
		global: { plugins: [pinia], stubs: { teleport: true } },
	});
}

describe('GlobalMessageSequencesView', () => {
	beforeEach(() => setActivePinia(createPinia()));
	afterEach(() => vi.clearAllMocks());

	it('renderiza el título y el estado vacío', async () => {
		const wrapper = mountView();
		await nextTick();
		expect(wrapper.text()).toContain('globalSequences.title');
		expect(wrapper.text()).toContain('globalSequences.empty');
	});

	it('lista las plantillas y marca la inactiva', async () => {
		const wrapper = mountView();
		const store = useGlobalMessageSequenceStore();
		store.sequences = [
			{ id: 'g1', name: 'Bienvenida', trigger: 'participant_created', audience: 'all', isActive: false, steps: [] } as any,
		];
		await nextTick();
		expect(wrapper.text()).toContain('Bienvenida');
		expect(wrapper.text()).toContain('globalSequences.inactive');
	});

	it('abre el editor al pulsar "Nueva plantilla"', async () => {
		const wrapper = mountView();
		await nextTick();
		expect(wrapper.text()).not.toContain('globalSequences.newTitle');
		// El primer botón del header es "Nueva plantilla".
		await wrapper.find('button').trigger('click');
		await nextTick();
		expect(wrapper.text()).toContain('globalSequences.newTitle');
	});
});
