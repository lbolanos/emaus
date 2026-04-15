import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import PhotoAssignmentDialog from '../PhotoAssignmentDialog.vue';
import type { TableMesa } from '@repo/types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@repo/ui', () => ({
	Button: { template: '<button :disabled="disabled"><slot /></button>', props: ['variant', 'size', 'disabled'] },
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogDescription: { template: '<p><slot /></p>' },
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('lucide-vue-next', () => ({
	Camera: { template: '<svg />' },
	Loader2: { template: '<svg />' },
	ChevronLeft: { template: '<svg />' },
	Check: { template: '<svg />' },
}));

vi.mock('@/services/api', () => ({
	analyzeTablePhoto: vi.fn(),
	executeTableAssignments: vi.fn(),
}));

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({ selectedRetreat: { id: 'r-1' } }),
}));

import * as api from '@/services/api';

const mockAnalyze = api.analyzeTablePhoto as ReturnType<typeof vi.fn>;
const mockExecute = api.executeTableAssignments as ReturnType<typeof vi.fn>;

const table: TableMesa = {
	id: 't-1',
	name: 'Mesa 1',
	retreatId: 'r-1',
	walkers: [],
	lider: null,
	colider1: null,
	colider2: null,
} as unknown as TableMesa;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mountDialog = (open = true) =>
	mount(PhotoAssignmentDialog, {
		props: { open, table },
		global: {
			plugins: [createPinia()],
			mocks: { $t: (key: string, params?: any) => params ? `${key}:${JSON.stringify(params)}` : key },
		},
	});

describe('PhotoAssignmentDialog', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	// ─── Rendering ────────────────────────────────────────────────────────────

	describe('rendering', () => {
		it('renders when open=true', () => {
			expect(mountDialog().find('.dialog').exists()).toBe(true);
		});

		it('does not render when open=false', () => {
			expect(mountDialog(false).find('.dialog').exists()).toBe(false);
		});

		it('starts on upload step — shows upload label', () => {
			const w = mountDialog();
			expect(w.text()).toContain('tables.photoAssign.uploadLabel');
		});

		it('shows Analyze button only after a file is selected', async () => {
			const w = mountDialog();
			// Before file: no Analyze button text
			expect(w.text()).not.toContain('tables.photoAssign.analyze');
		});
	});

	// ─── Review step ─────────────────────────────────────────────────────────

	describe('review step', () => {
		const proposals = [
			{ idOnRetreat: 1, participantId: 'p-1', participantName: 'Juan Pérez', tableName: 'Mesa 1', tableId: 't-1', valid: true },
			{ idOnRetreat: 99, participantId: null, participantName: null, tableName: 'Mesa 1', tableId: null, valid: false, error: 'ID 99 no encontrado' },
		];

		async function goToReview() {
			mockAnalyze.mockResolvedValueOnce({ proposals, unreadable: [], notes: '' });
			const w = mountDialog();
			// Manually set imageBase64 and trigger analyze via internal ref manipulation
			// We do it by invoking component's analyze method via expose
			const vm = w.vm as any;
			vm.imageBase64 = 'fakeBase64';
			vm.contentType = 'image/jpeg';
			await vm.analyze();
			await nextTick();
			return w;
		}

		it('transitions to review step after analysis', async () => {
			const w = await goToReview();
			expect(w.text()).toContain('tables.photoAssign.walkersFound');
		});

		it('shows valid proposals as checked checkboxes', async () => {
			const w = await goToReview();
			const checkboxes = w.findAll('input[type="checkbox"]');
			const validBox = checkboxes.find((cb) => !(cb.element as HTMLInputElement).disabled);
			expect(validBox).toBeTruthy();
			expect((validBox!.element as HTMLInputElement).checked).toBe(true);
		});

		it('shows invalid proposals as disabled checkboxes', async () => {
			const w = await goToReview();
			const checkboxes = w.findAll('input[type="checkbox"]');
			const disabledBox = checkboxes.find((cb) => (cb.element as HTMLInputElement).disabled);
			expect(disabledBox).toBeTruthy();
		});

		it('shows error message for invalid proposals', async () => {
			const w = await goToReview();
			expect(w.text()).toContain('ID 99 no encontrado');
		});
	});

	// ─── Done step ───────────────────────────────────────────────────────────

	describe('done step', () => {
		it('transitions to done after applying and emits assigned', async () => {
			mockAnalyze.mockResolvedValueOnce({
				proposals: [
					{ idOnRetreat: 1, participantId: 'p-1', participantName: 'Juan', tableName: 'Mesa 1', tableId: 't-1', valid: true },
				],
				unreadable: [],
				notes: '',
			});
			mockExecute.mockResolvedValueOnce({ results: [{ success: true }] });

			const w = mountDialog();
			const vm = w.vm as any;
			vm.imageBase64 = 'x';
			vm.contentType = 'image/jpeg';
			await vm.analyze();
			await nextTick();
			await vm.applyAssignments();
			await nextTick();

			expect(w.text()).toContain('tables.photoAssign.applied');
			expect(w.emitted('assigned')).toBeTruthy();
		});
	});

	// ─── selectedCount computed ───────────────────────────────────────────────

	describe('selectedCount', () => {
		it('counts only selected proposals', async () => {
			mockAnalyze.mockResolvedValueOnce({
				proposals: [
					{ idOnRetreat: 1, participantId: 'p-1', participantName: 'A', tableName: 'Mesa 1', tableId: 't-1', valid: true },
					{ idOnRetreat: 2, participantId: 'p-2', participantName: 'B', tableName: 'Mesa 1', tableId: 't-1', valid: true },
				],
				unreadable: [],
				notes: '',
			});
			const w = mountDialog();
			const vm = w.vm as any;
			vm.imageBase64 = 'x';
			await vm.analyze();
			await nextTick();
			// Both valid → both selected → count = 2
			expect(w.text()).toContain('(2)');
		});
	});
});
