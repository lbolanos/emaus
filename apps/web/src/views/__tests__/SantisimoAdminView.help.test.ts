import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';

// Para abrir/cerrar el dialog de ayuda y verificar que las secciones se rendericen.
// El resto del view (slots, signups, generate dialog) se ejercita en otros tests.

vi.mock('lucide-vue-next', () => {
	const stub = { template: '<i></i>' };
	return {
		HelpCircle: stub,
		Link2: stub,
		Plus: stub,
		Printer: stub,
	};
});

vi.mock('@repo/ui', () => ({
	Button: {
		template: '<button :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
		emits: ['click'],
	},
	Input: {
		template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'type', 'placeholder'],
		emits: ['update:modelValue'],
	},
	Dialog: {
		template:
			'<div v-if="open" :data-testid="$attrs[\'data-testid\']" class="dialog-mock"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: {
		template: '<div :data-testid="$attrs[\'data-testid\']" class="dialog-content-mock"><slot /></div>',
	},
	DialogDescription: { template: '<p class="dialog-description-mock"><slot /></p>' },
	DialogFooter: { template: '<div class="dialog-footer-mock"><slot /></div>' },
	DialogHeader: { template: '<div class="dialog-header-mock"><slot /></div>' },
	DialogTitle: { template: '<h2 class="dialog-title-mock"><slot /></h2>' },
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/api', () => ({
	api: { get: vi.fn().mockResolvedValue({ data: [] }) },
	santisimoApi: {
		listSlots: vi.fn().mockResolvedValue([]),
		generateSlots: vi.fn(),
		updateSlot: vi.fn(),
		deleteSlot: vi.fn(),
		adminCreateSignup: vi.fn(),
		deleteSignup: vi.fn(),
	},
	retreatScheduleApi: {
		resolveSantisimo: vi
			.fn()
			.mockResolvedValue({ mealSlots: 0, angelitosAssigned: 0, unresolvedSlots: [] }),
	},
}));

vi.mock('@/stores/santisimoStore', () => {
	const { ref } = require('vue');
	return {
		useSantisimoStore: () => ({
			slots: ref([]),
			loading: ref(false),
			error: ref(null),
			fetchSlots: vi.fn().mockResolvedValue(undefined),
			generateSlots: vi.fn(),
			updateSlot: vi.fn(),
			deleteSlot: vi.fn(),
			adminCreateSignup: vi.fn(),
			deleteSignup: vi.fn(),
		}),
	};
});

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		retreats: [
			{ id: 'r1', startDate: '2026-06-01', endDate: '2026-06-03', santisimoEnabled: true, isPublic: true, slug: 'r1' },
		],
		selectedRetreatId: 'r1',
	}),
}));

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'r1' } }),
}));

vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (k: string) => k, // identity translator — los tests asertan claves
	}),
}));

async function flush() {
	for (let i = 0; i < 5; i++) {
		await nextTick();
		await new Promise((r) => setTimeout(r, 0));
	}
}

async function mountView() {
	const pinia = createPinia();
	setActivePinia(pinia);
	const { default: SantisimoAdminView } = await import('../SantisimoAdminView.vue');
	const wrapper = mount(SantisimoAdminView, {
		global: {
			plugins: [pinia],
			stubs: {
				teleport: true,
				transition: true,
				'router-link': true,
			},
		},
	});
	await flush();
	return wrapper;
}

describe('SantisimoAdminView — actions menu + help dialog', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renderiza el botón "Más acciones" en el toolbar', async () => {
		const wrapper = await mountView();
		const btn = wrapper.find('[data-testid="santisimo-actions-button"]');
		expect(btn.exists()).toBe(true);
		wrapper.unmount();
	});

	it('el menú inicia cerrado y el dialog de ayuda también', async () => {
		const wrapper = await mountView();
		expect(wrapper.find('[data-testid="santisimo-actions-menu"]').exists()).toBe(false);
		expect(wrapper.find('[data-testid="santisimo-help-dialog"]').exists()).toBe(false);
		wrapper.unmount();
	});

	it('al abrir el menú aparecen los items (auto-asignar, ayuda)', async () => {
		const wrapper = await mountView();
		await wrapper.find('[data-testid="santisimo-actions-button"]').trigger('click');
		await flush();

		const menu = wrapper.find('[data-testid="santisimo-actions-menu"]');
		expect(menu.exists()).toBe(true);
		expect(menu.find('[data-testid="santisimo-auto-assign-button"]').exists()).toBe(true);
		expect(menu.find('[data-testid="santisimo-help-button"]').exists()).toBe(true);
		wrapper.unmount();
	});

	it('al hacer click en "Ayuda" abre el dialog con las 4 secciones', async () => {
		const wrapper = await mountView();
		await wrapper.find('[data-testid="santisimo-actions-button"]').trigger('click');
		await flush();
		await wrapper.find('[data-testid="santisimo-help-button"]').trigger('click');
		await flush();

		const dialog = wrapper.find('[data-testid="santisimo-help-dialog"]');
		expect(dialog.exists()).toBe(true);

		const text = dialog.text();
		// Las 4 secciones deben aparecer (claves i18n usadas como identidad).
		expect(text).toContain('santisimo.helpAutoTitle');
		expect(text).toContain('santisimo.helpMealTitle');
		expect(text).toContain('santisimo.helpManualTitle');
		expect(text).toContain('santisimo.helpSignupTitle');
		// Y el título principal
		expect(text).toContain('santisimo.helpTitle');
		wrapper.unmount();
	});

	it('"Auto-asignar angelitos" llama a retreatScheduleApi.resolveSantisimo', async () => {
		const { retreatScheduleApi } = await import('@/services/api');
		const wrapper = await mountView();
		await wrapper.find('[data-testid="santisimo-actions-button"]').trigger('click');
		await flush();
		await wrapper.find('[data-testid="santisimo-auto-assign-button"]').trigger('click');
		await flush();

		expect(retreatScheduleApi.resolveSantisimo).toHaveBeenCalledWith('r1');
		wrapper.unmount();
	});
});
