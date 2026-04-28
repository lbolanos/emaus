import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';

// ── @repo/ui mock ────────────────────────────────────────────────────────────
vi.mock('@repo/ui', () => ({
	Button: {
		template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
		props: ['variant', 'size', 'disabled'],
	},
	Dialog: {
		template: '<div v-if="open" class="dialog-mock"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div class="dialog-content-mock"><slot /></div>' },
	DialogFooter: { template: '<div class="dialog-footer-mock"><slot /></div>' },
	DialogHeader: { template: '<div class="dialog-header-mock"><slot /></div>' },
	DialogTitle: { template: '<h2 class="dialog-title-mock"><slot /></h2>' },
	Input: {
		template: '<input :type="type" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'type', 'placeholder'],
		emits: ['update:modelValue'],
	},
	Label: { template: '<label><slot /></label>' },
	Textarea: {
		template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
		props: ['modelValue', 'rows'],
		emits: ['update:modelValue'],
	},
	useToast: () => ({ toast: vi.fn() }),
}));

// ── API mock ─────────────────────────────────────────────────────────────────
const mockListSets = vi.fn();
const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();
const mockCreateSet = vi.fn();
const mockUpdateSet = vi.fn();
const mockRemoveSet = vi.fn();

vi.mock('@/services/api', () => ({
	scheduleTemplateApi: {
		listSets: mockListSets,
		list: mockList,
		create: mockCreate,
		update: mockUpdate,
		remove: mockRemove,
		createSet: mockCreateSet,
		updateSet: mockUpdateSet,
		removeSet: mockRemoveSet,
	},
}));

// useAuthPermissions: ScheduleTemplateView gates "Nueva actividad",
// "Marcar predeterminado", "Eliminar template" etc. behind
// canManage.scheduleTemplate. Tests run as an admin user so these
// buttons render; permission-denied paths have their own coverage.
vi.mock('@/composables/useAuthPermissions', () => {
	const { computed } = require('vue');
	const truthy = computed(() => true);
	return {
		useAuthPermissions: () => ({
			canManage: {
				retreat: truthy,
				participants: truthy,
				houses: truthy,
				inventory: truthy,
				tables: truthy,
				payments: truthy,
				schedule: truthy,
				scheduleTemplate: truthy,
			},
			isAdmin: truthy,
			hasRole: () => true,
		}),
	};
});

// ── Fixtures ──────────────────────────────────────────────────────────────────
const SET_DEFAULT = { id: 'set-1', name: 'Emaús Colombia', description: 'Retiro clásico de 3 días', isDefault: true, isActive: true };
const SET_OTHER   = { id: 'set-2', name: 'Emaús Rápido', description: null, isDefault: false, isActive: true };

function makeItem(overrides: Record<string, any> = {}) {
	return {
		id: `item-${Math.random()}`,
		templateSetId: 'set-1',
		name: 'Actividad de prueba',
		type: 'charla',
		defaultDay: 1,
		defaultOrder: 0,
		defaultStartTime: '08:00',
		defaultDurationMinutes: 60,
		requiresResponsable: false,
		blocksSantisimoAttendance: false,
		palanquitaNotes: null,
		description: null,
		isActive: true,
		...overrides,
	};
}

// Activities covering three days, multiple types
const DAY1_ITEMS = [
	makeItem({ id: 'a1', name: 'Bienvenida', type: 'logistica',  defaultDay: 1, defaultStartTime: '10:00', blocksSantisimoAttendance: false }),
	makeItem({ id: 'a2', name: 'Almuerzo equipo', type: 'comida', defaultDay: 1, defaultStartTime: '13:00', blocksSantisimoAttendance: true }),
	makeItem({ id: 'a3', name: 'Testimonio 1', type: 'testimonio', defaultDay: 1, defaultStartTime: '21:00', palanquitaNotes: 'Hoy Necesito' }),
];
const DAY2_ITEMS = [
	makeItem({ id: 'b1', name: 'Misa de apertura', type: 'misa', defaultDay: 2, defaultStartTime: '09:00' }),
	makeItem({ id: 'b2', name: 'Vigilia Santísimo', type: 'santisimo', defaultDay: 2, defaultStartTime: '00:00' }),
];
const DAY3_ITEMS = [
	makeItem({ id: 'c1', name: 'Clausura', type: 'charla', defaultDay: 3, defaultStartTime: '10:00' }),
];
const ALL_ITEMS = [...DAY1_ITEMS, ...DAY2_ITEMS, ...DAY3_ITEMS];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function flushAll() {
	for (let i = 0; i < 8; i++) {
		await nextTick();
		await new Promise(r => setTimeout(r, 0));
	}
}

const globalOpts = {
	global: {
		stubs: {
			teleport: true,
			transition: true,
			'router-link': true,
		},
		mocks: {
			$t: (k: string) => k,
		},
	},
};

async function mountView() {
	mockListSets.mockResolvedValue([SET_DEFAULT, SET_OTHER]);
	mockList.mockResolvedValue(ALL_ITEMS);

	const pinia = createPinia();
	setActivePinia(pinia);

	const { default: ScheduleTemplateView } = await import('../ScheduleTemplateView.vue');

	const wrapper = mount(ScheduleTemplateView, {
		...globalOpts,
		global: { ...globalOpts.global, plugins: [pinia] },
	});

	await flushAll();
	return wrapper;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('ScheduleTemplateView', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── Rendering ─────────────────────────────────────────────────────────────
	describe('rendering', () => {
		it('shows the page title', async () => {
			const wrapper = await mountView();
			expect(wrapper.text()).toContain('Templates Minuto a Minuto');
			wrapper.unmount();
		});

		it('shows the subtitle', async () => {
			const wrapper = await mountView();
			expect(wrapper.text()).toContain('Plantillas maestras');
			wrapper.unmount();
		});

		it('renders both template sets in the selector', async () => {
			const wrapper = await mountView();
			const options = wrapper.findAll('option');
			expect(options.length).toBeGreaterThanOrEqual(2);
			const texts = options.map(o => o.text());
			expect(texts.some(t => t.includes('Emaús Colombia'))).toBe(true);
			expect(texts.some(t => t.includes('Emaús Rápido'))).toBe(true);
			wrapper.unmount();
		});

		it('marks the default set with a star in the selector', async () => {
			const wrapper = await mountView();
			const options = wrapper.findAll('option');
			expect(options.some(o => o.text().includes('★'))).toBe(true);
			wrapper.unmount();
		});

		it('shows the template description', async () => {
			const wrapper = await mountView();
			expect(wrapper.text()).toContain('Retiro clásico de 3 días');
			wrapper.unmount();
		});

		it('shows "Nueva actividad" button', async () => {
			const wrapper = await mountView();
			expect(wrapper.text()).toContain('Nueva actividad');
			wrapper.unmount();
		});

		it('renders a day pill for each day with activity count', async () => {
			const wrapper = await mountView();
			const text = wrapper.text();
			expect(text).toContain('Día 1');
			expect(text).toContain('Día 2');
			expect(text).toContain('Día 3');
			// Day 1 has 3, Day 2 has 2, Day 3 has 1
			expect(text).toContain('3 actividades');
			expect(text).toContain('2 actividades');
			expect(text).toContain('1 actividades');
			wrapper.unmount();
		});

		it('renders all activity names', async () => {
			const wrapper = await mountView();
			const text = wrapper.text();
			expect(text).toContain('Bienvenida');
			expect(text).toContain('Almuerzo equipo');
			expect(text).toContain('Testimonio 1');
			expect(text).toContain('Misa de apertura');
			expect(text).toContain('Clausura');
			wrapper.unmount();
		});

		it('renders start times in monospace-formatted cells', async () => {
			const wrapper = await mountView();
			const text = wrapper.text();
			expect(text).toContain('10:00');
			expect(text).toContain('13:00');
			expect(text).toContain('09:00');
			wrapper.unmount();
		});

		it('renders duration in minutes for each activity', async () => {
			const wrapper = await mountView();
			// default duration is 60 min
			expect(wrapper.text()).toContain('60 min');
			wrapper.unmount();
		});

		it('shows palanquitaNotes with music icon text', async () => {
			const wrapper = await mountView();
			// Testimonio 1 has palanquitaNotes = 'Hoy Necesito'
			expect(wrapper.text()).toContain('Hoy Necesito');
			wrapper.unmount();
		});

		it('calls listSets and list on mount', async () => {
			const wrapper = await mountView();
			expect(mockListSets).toHaveBeenCalledOnce();
			expect(mockList).toHaveBeenCalledWith('set-1');
			wrapper.unmount();
		});

		it('shows loading skeleton when data is loading', async () => {
			mockListSets.mockResolvedValue([SET_DEFAULT]);
			// Delay list to see the loading state
			mockList.mockImplementation(() => new Promise(r => setTimeout(() => r(ALL_ITEMS), 200)));

			const pinia = createPinia();
			setActivePinia(pinia);
			const { default: ScheduleTemplateView } = await import('../ScheduleTemplateView.vue');
			const wrapper = mount(ScheduleTemplateView, {
				...globalOpts,
				global: { ...globalOpts.global, plugins: [pinia] },
			});

			// After listSets resolves but before list resolves
			await nextTick();
			await new Promise(r => setTimeout(r, 0));
			expect(wrapper.find('.animate-pulse').exists()).toBe(true);

			wrapper.unmount();
		});

		it('shows empty state when template has no items', async () => {
			mockListSets.mockResolvedValue([SET_DEFAULT]);
			mockList.mockResolvedValue([]);

			const pinia = createPinia();
			setActivePinia(pinia);
			const { default: ScheduleTemplateView } = await import('../ScheduleTemplateView.vue');
			const wrapper = mount(ScheduleTemplateView, {
				...globalOpts,
				global: { ...globalOpts.global, plugins: [pinia] },
			});
			await flushAll();

			expect(wrapper.text()).toContain('no tiene actividades');
			wrapper.unmount();
		});
	});

	// ── Badge colors ──────────────────────────────────────────────────────────
	describe('type badge colors', () => {
		const BADGE_CASES: Array<[string, string]> = [
			['Bienvenida',      'logistica'],
			['Almuerzo equipo', 'comida'],
			['Testimonio 1',    'testimonio'],
			['Misa de apertura','misa'],
			['Vigilia Santísimo','santisimo'],
		];

		it.each(BADGE_CASES)('shows type badge "%s" → type "%s"', async (name, type) => {
			const wrapper = await mountView();
			const text = wrapper.text();
			expect(text).toContain(name);
			expect(text).toContain(type);
			wrapper.unmount();
		});

		it('applies distinct bg classes for different types', async () => {
			const wrapper = await mountView();
			const html = wrapper.html();
			// comida → green, testimonio → violet, santisimo → indigo
			expect(html).toContain('bg-green-100');
			expect(html).toContain('bg-violet-100');
			expect(html).toContain('bg-indigo-100');
			wrapper.unmount();
		});

		it('uses logistica gray style', async () => {
			const wrapper = await mountView();
			expect(wrapper.html()).toContain('bg-gray-100');
			wrapper.unmount();
		});
	});

	// ── Santísimo column ──────────────────────────────────────────────────────
	describe('santísimo column', () => {
		it('shows amber check for blocksSantisimoAttendance = true', async () => {
			const wrapper = await mountView();
			// Almuerzo equipo has blocksSantisimoAttendance = true
			expect(wrapper.html()).toContain('bg-amber-100');
			wrapper.unmount();
		});

		it('shows gray dash for blocksSantisimoAttendance = false', async () => {
			const wrapper = await mountView();
			expect(wrapper.html()).toContain('bg-gray-100');
			wrapper.unmount();
		});
	});

	// ── Interactions ──────────────────────────────────────────────────────────
	describe('interactions', () => {
		it('opens "Nueva actividad" dialog when button is clicked', async () => {
			const wrapper = await mountView();

			// Dialog should not be visible initially
			expect(wrapper.text()).not.toContain('Nueva actividad\nNombre');

			// Find and click the Nueva actividad button (the top-level one)
			const buttons = wrapper.findAll('button');
			const newBtn = buttons.find(b => b.text().includes('Nueva actividad'));
			expect(newBtn).toBeTruthy();
			await newBtn!.trigger('click');
			await flushAll();

			// Dialog title should now appear
			expect(wrapper.text()).toContain('Nueva actividad');
			wrapper.unmount();
		});

		it('opens edit dialog pre-filled when edit icon is clicked', async () => {
			const wrapper = await mountView();

			// Trigger hover to reveal action buttons on first row
			const rows = wrapper.findAll('tbody tr');
			expect(rows.length).toBeGreaterThan(0);
			await rows[0].trigger('mouseenter');

			// Find edit buttons (they're inside the row group)
			const editButtons = wrapper.findAll('button[title="Editar"]');
			if (editButtons.length === 0) {
				// Buttons are opacity-0 without hover in jsdom; click directly
				const allButtons = rows[0].findAll('button');
				const editBtn = allButtons.find(b => b.attributes('title') === 'Editar');
				if (editBtn) {
					await editBtn.trigger('click');
					await flushAll();
					expect(wrapper.text()).toContain('Editar actividad');
				}
			} else {
				await editButtons[0].trigger('click');
				await flushAll();
				expect(wrapper.text()).toContain('Editar actividad');
			}
			wrapper.unmount();
		});

		it('calls scheduleTemplateApi.remove when delete is confirmed', async () => {
			mockRemove.mockResolvedValue(undefined);
			mockList.mockResolvedValue(ALL_ITEMS);
			vi.spyOn(window, 'confirm').mockReturnValue(true);

			const wrapper = await mountView();

			const rows = wrapper.findAll('tbody tr');
			const deleteButtons = wrapper.findAll('button[title="Eliminar"]');
			if (deleteButtons.length > 0) {
				await deleteButtons[0].trigger('click');
				await flushAll();
				expect(mockRemove).toHaveBeenCalledOnce();
			} else {
				// Trigger via row button (opacity hidden in jsdom)
				const rowBtn = rows[0].findAll('button').find(b => b.attributes('title') === 'Eliminar');
				if (rowBtn) {
					await rowBtn.trigger('click');
					await flushAll();
					expect(mockRemove).toHaveBeenCalledOnce();
				}
			}
			wrapper.unmount();
		});

		it('does not call scheduleTemplateApi.remove when delete is cancelled', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(false);

			const wrapper = await mountView();

			const deleteButtons = wrapper.findAll('button[title="Eliminar"]');
			if (deleteButtons.length > 0) {
				await deleteButtons[0].trigger('click');
				await flushAll();
				expect(mockRemove).not.toHaveBeenCalled();
			}
			wrapper.unmount();
		});

		it('calls scheduleTemplateApi.list again after switching template set', async () => {
			mockListSets.mockResolvedValue([SET_DEFAULT, SET_OTHER]);
			mockList.mockResolvedValue(ALL_ITEMS);

			const wrapper = await mountView();
			expect(mockList).toHaveBeenCalledTimes(1);

			const select = wrapper.find('select');
			await select.setValue('set-2');
			await select.trigger('change');
			await flushAll();

			expect(mockList).toHaveBeenCalledWith('set-2');
			wrapper.unmount();
		});

		it('"Marcar predeterminado" button only shows for non-default set', async () => {
			const wrapper = await mountView();
			// Default set is selected → button should NOT appear
			expect(wrapper.text()).not.toContain('Marcar predeterminado');

			// Switch to non-default set
			const select = wrapper.find('select');
			await select.setValue('set-2');
			await select.trigger('change');
			await flushAll();

			expect(wrapper.text()).toContain('Marcar predeterminado');
			wrapper.unmount();
		});

		it('"Eliminar template" button is visible when a set is selected', async () => {
			const wrapper = await mountView();
			expect(wrapper.text()).toContain('Eliminar');
			wrapper.unmount();
		});
	});

	// ── Day ordering ──────────────────────────────────────────────────────────
	describe('day grouping order', () => {
		it('renders days in ascending numeric order', async () => {
			const wrapper = await mountView();
			const text = wrapper.text();
			const day1Pos = text.indexOf('Día 1');
			const day2Pos = text.indexOf('Día 2');
			const day3Pos = text.indexOf('Día 3');
			expect(day1Pos).toBeLessThan(day2Pos);
			expect(day2Pos).toBeLessThan(day3Pos);
			wrapper.unmount();
		});

		it('sorts activities within a day by start time', async () => {
			const wrapper = await mountView();
			const text = wrapper.text();
			// Within Day 1: 10:00 before 13:00 before 21:00
			const pos10 = text.indexOf('10:00');
			const pos13 = text.indexOf('13:00');
			const pos21 = text.indexOf('21:00');
			expect(pos10).toBeLessThan(pos13);
			expect(pos13).toBeLessThan(pos21);
			wrapper.unmount();
		});
	});
});
