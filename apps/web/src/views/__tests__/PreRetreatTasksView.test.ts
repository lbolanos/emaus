import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { computed } from 'vue';

// ── @repo/ui mock ────────────────────────────────────────────────────────────
vi.mock('@repo/ui', () => ({
	Button: {
		template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
		props: ['variant', 'size', 'disabled', 'asChild', 'title'],
	},
	Checkbox: {
		// reka-ui checkbox: modelValue + update:modelValue (nunca :checked)
		template:
			'<input type="checkbox" class="checkbox-mock" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', !modelValue)" />',
		props: ['modelValue', 'disabled'],
		emits: ['update:modelValue'],
	},
	Dialog: {
		template: '<div v-if="open" class="dialog-mock"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div><slot /></div>' },
	DialogFooter: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DropdownMenu: { template: '<div class="dropdown-mock"><slot /></div>' },
	DropdownMenuContent: { template: '<div><slot /></div>' },
	DropdownMenuItem: {
		template: '<button class="dd-item" @click="$emit(\'select\')"><slot /></button>',
		emits: ['select'],
	},
	DropdownMenuSeparator: { template: '<hr />' },
	DropdownMenuTrigger: { template: '<div><slot /></div>', props: ['asChild'] },
	Input: {
		template:
			'<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'placeholder', 'type'],
		emits: ['update:modelValue'],
	},
	Label: { template: '<label><slot /></label>' },
	Textarea: {
		template: '<textarea :value="modelValue"></textarea>',
		props: ['modelValue', 'rows'],
	},
	useToast: () => ({ toast: vi.fn() }),
}));

// ── API mock (vi.hoisted: el import estático de la vista evalúa el factory
// antes que las consts top-level) ───────────────────────────────────────────
const { mockTaskApi, mockTemplateApi, mockAxios } = vi.hoisted(() => ({
	mockTaskApi: {
		list: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		setStatus: vi.fn(),
		remove: vi.fn(),
		materialize: vi.fn(),
		addMissing: vi.fn(),
	},
	mockTemplateApi: { list: vi.fn(), listSets: vi.fn() },
	mockAxios: { get: vi.fn() },
}));

vi.mock('@/services/api', () => ({
	api: mockAxios,
	apiErrorMessage: (e: unknown) => String(e),
	preRetreatTaskApi: mockTaskApi,
	preRetreatTaskTemplateApi: mockTemplateApi,
}));

// ── Permisos controlables por test (holder hoisted, sin refs top-level) ─────
const perms = vi.hoisted(() => ({ manage: true }));
vi.mock('@/composables/useAuthPermissions', () => ({
	useAuthPermissions: () => ({
		canManage: {
			preRetreatTask: computed(() => perms.manage),
			preRetreatTaskTemplate: computed(() => true),
		},
	}),
}));

vi.mock('@/composables/useRekaDialogFix', () => ({
	useRekaDialogFix: () => ({ deferOpen: (fn: () => void) => fn(), restoreBodyOverflow: vi.fn() }),
}));

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		selectedRetreatId: 'retreat-1',
		selectedRetreat: { id: 'retreat-1', startDate: '2026-09-18' },
	}),
}));

// El modal importa ParticipantSelect y el store; lo stubeamos para aislar la vista.
vi.mock('@/components/PreRetreatTaskEditModal.vue', () => ({
	default: { name: 'PreRetreatTaskEditModal', template: '<div class="edit-modal-stub" />' },
}));

import PreRetreatTasksView from '../PreRetreatTasksView.vue';

const TASKS = [
	{
		id: 'p1',
		retreatId: 'retreat-1',
		name: 'Buscar parroquia',
		status: 'pending',
		dueOffsetDays: 120,
		dueDate: '2000-01-01', // vencidísima → semáforo rojo
		sortOrder: 10,
		children: [],
		progress: { done: 0, total: 0 },
	},
	{
		id: 'p2',
		retreatId: 'retreat-1',
		name: 'Snacks',
		status: 'pending',
		dueOffsetDays: 14,
		dueDate: '2999-01-01',
		sortOrder: 320,
		children: [
			{
				id: 'c1',
				retreatId: 'retreat-1',
				parentId: 'p2',
				name: 'Comprar snacks',
				status: 'done',
				sortOrder: 0,
			},
			{
				id: 'c2',
				retreatId: 'retreat-1',
				parentId: 'p2',
				name: 'Verificar cafeteras',
				status: 'pending',
				sortOrder: 10,
			},
		],
		progress: { done: 1, total: 2 },
	},
];

async function mountView() {
	const wrapper = mount(PreRetreatTasksView);
	await flushPromises();
	return wrapper;
}

describe('PreRetreatTasksView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		perms.manage = true;
		mockTaskApi.list.mockResolvedValue(JSON.parse(JSON.stringify(TASKS)));
		mockAxios.get.mockResolvedValue({ data: [] });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renderiza los grupos por tiempo antes del retiro', async () => {
		const w = await mountView();
		const headers = w.findAll('h2').map((h) => h.text());
		expect(headers).toContain('4 meses antes');
		expect(headers).toContain('2 semanas antes');
		expect(w.text()).toContain('Buscar parroquia');
		expect(w.text()).toContain('Snacks');
	});

	it('muestra el semáforo: vencida en rojo y progreso 1/2 del padre', async () => {
		const w = await mountView();
		expect(w.text()).toContain('Vencida');
		expect(w.text()).toContain('1/2');
	});

	it('inserta la marca "Hoy" entre tareas vencidas y próximas', async () => {
		const w = await mountView();
		const marker = w.find('[data-testid="today-marker"]');
		expect(marker.exists()).toBe(true);
		expect(marker.text()).toContain('Hoy');
	});

	it('el contador del header muestra vencidas', async () => {
		const w = await mountView();
		// p1 tiene dueDate 2000-01-01 (vencida)
		expect(w.text()).toContain('vencida');
	});

	it('el filtro "Vencidas" deja solo las tareas vencidas', async () => {
		const w = await mountView();
		expect(w.text()).toContain('Snacks'); // futura, visible con "Todas"
		await w.find('[data-testid="filter-overdue"]').trigger('click');
		expect(w.text()).toContain('Buscar parroquia'); // vencida
		expect(w.text()).not.toContain('Snacks'); // futura, oculta
	});

	it('exporta CSV al pulsar Exportar', async () => {
		const createUrl = vi
			.spyOn(URL, 'createObjectURL')
			.mockReturnValue('blob:fake');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(() => {});
		const w = await mountView();
		await w.find('[data-testid="export-csv"]').trigger('click');
		expect(createUrl).toHaveBeenCalled();
		expect(clickSpy).toHaveBeenCalled();
	});

	it('tareas sin responsable muestran "Sin asignar" y abren el picker al click', async () => {
		const w = await mountView();
		const chip = w
			.findAll('button')
			.find((b) => b.text().includes('Sin asignar'));
		expect(chip).toBeTruthy();
		await chip!.trigger('click');
		// El picker inline aparece con su buscador
		expect(w.find('input[placeholder="Buscar servidor…"]').exists()).toBe(true);
	});

	it('asignar un servidor desde el picker llama updateTask con responsibleParticipantId', async () => {
		mockAxios.get.mockResolvedValue({
			data: [{ id: 'srv-1', firstName: 'Ana', lastName: 'López', type: 'server' }],
		});
		mockTaskApi.update.mockResolvedValue({});
		const w = await mountView();
		const chip = w.findAll('button').find((b) => b.text().includes('Sin asignar'));
		await chip!.trigger('click');
		const option = w.findAll('button').find((b) => b.text().includes('Ana'));
		expect(option).toBeTruthy();
		await option!.trigger('mousedown');
		await flushPromises();
		expect(mockTaskApi.update).toHaveBeenCalledWith(
			'p1',
			expect.objectContaining({ responsibleParticipantId: 'srv-1' }),
		);
	});

	it('sin permiso manage no muestra botones de gestión ni checkboxes', async () => {
		perms.manage = false;
		const w = await mountView();
		expect(w.find('[data-testid="new-task"]').exists()).toBe(false);
		expect(w.find('[data-testid="import-template"]').exists()).toBe(false);
		expect(w.find('.checkbox-mock').exists()).toBe(false);
	});

	it('marcar el checkbox de una raíz llama setStatus con done', async () => {
		mockTaskApi.setStatus.mockResolvedValue({});
		const w = await mountView();
		await w.find('[data-testid="task-p1"] .checkbox-mock').trigger('change');
		await flushPromises();
		expect(mockTaskApi.setStatus).toHaveBeenCalledWith('p1', 'done');
	});

	it('expandir una tarea muestra sus sub-tareas y el checkbox del hijo funciona', async () => {
		mockTaskApi.setStatus.mockResolvedValue({});
		const w = await mountView();
		expect(w.text()).not.toContain('Comprar snacks');

		// el botón de expandir es el aria-label Expandir
		await w.find('button[aria-label="Expandir"]').trigger('click');
		expect(w.text()).toContain('Comprar snacks');

		// c1 está done → toggle lo regresa a pending
		await w.find('[data-testid="task-c1"] .checkbox-mock').trigger('change');
		await flushPromises();
		expect(mockTaskApi.setStatus).toHaveBeenCalledWith('c1', 'pending');
	});

	it('estado vacío ofrece importar desde template', async () => {
		mockTaskApi.list.mockResolvedValue([]);
		const w = await mountView();
		expect(w.text()).toContain('Aún no hay tareas para este retiro');
		expect(w.find('[data-testid="import-empty"]').exists()).toBe(true);
	});

	it('el dialog de importar carga sets y materializa al confirmar', async () => {
		mockTaskApi.list.mockResolvedValue([]);
		mockTemplateApi.listSets.mockResolvedValue([
			{ id: 'set-1', name: 'Pre-retiro — Emaús', isActive: true, isDefault: true },
		]);
		mockTaskApi.materialize.mockResolvedValue(JSON.parse(JSON.stringify(TASKS)));

		const w = await mountView();
		await w.find('[data-testid="import-empty"]').trigger('click');
		await flushPromises();
		expect(mockTemplateApi.listSets).toHaveBeenCalled();

		// sin tareas → preselecciona "replace"
		const buttons = w.findAll('button').filter((b) => b.text() === 'Importar');
		expect(buttons.length).toBe(1);
		await buttons[0].trigger('click');
		await flushPromises();
		expect(mockTaskApi.materialize).toHaveBeenCalledWith('retreat-1', {
			templateSetId: 'set-1',
			clearExisting: true,
		});
	});
});
