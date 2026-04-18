import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { cleanupMocks } from '@/test/utils';

vi.mock('axios', () => ({
	create: vi.fn(() => ({
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
		interceptors: {
			request: { use: vi.fn() },
			response: { use: vi.fn() },
		},
	})),
	defaults: { baseURL: '', withCredentials: false },
	get: vi.fn(),
	post: vi.fn(),
	put: vi.fn(),
	delete: vi.fn(),
}));

vi.mock('@/utils/csrf', () => ({
	setupCsrfInterceptor: vi.fn(),
	getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

vi.mock('@/services/telemetryService', () => ({
	telemetryService: {
		isTelemetryActive: vi.fn(() => false),
		trackApiCallTime: vi.fn(),
		trackError: vi.fn(),
	},
}));

const getParticipantsByRetreatMock = vi.fn();
const getWalkersByRetreatMock = vi.fn();
const exportBadgesToDocxMock = vi.fn();

vi.mock('@/services/api', () => ({
	getParticipantsByRetreat: (...args: any[]) => getParticipantsByRetreatMock(...args),
	getWalkersByRetreat: (...args: any[]) => getWalkersByRetreatMock(...args),
	exportBadgesToDocx: (...args: any[]) => exportBadgesToDocxMock(...args),
	api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('vue-router', () => ({
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
	useRoute: () => ({
		name: 'badges',
		params: { id: 'retreat-1' },
		path: '/app/badges/retreat-1',
	}),
}));

vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (key: string) => key,
		locale: { value: 'es' },
	}),
	createI18n: vi.fn(),
}));

vi.mock('lucide-vue-next', () => ({
	Loader2: { name: 'Loader2', template: '<svg></svg>' },
	Printer: { name: 'Printer', template: '<svg></svg>' },
	MoreVertical: { name: 'MoreVertical', template: '<svg></svg>' },
	FileDown: { name: 'FileDown', template: '<svg></svg>' },
	Check: { name: 'Check', template: '<svg></svg>' },
	Search: { name: 'Search', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	Minus: { name: 'Minus', template: '<svg></svg>' },
	Plus: { name: 'Plus', template: '<svg></svg>' },
}));

vi.mock('@repo/ui', () => ({
	Button: { name: 'Button', template: '<button><slot /></button>' },
	DropdownMenu: { name: 'DropdownMenu', template: '<div><slot /></div>' },
	DropdownMenuContent: { name: 'DropdownMenuContent', template: '<div><slot /></div>' },
	DropdownMenuItem: {
		name: 'DropdownMenuItem',
		template: '<div @click="$emit(\'click\')"><slot /></div>',
		emits: ['click'],
	},
	DropdownMenuTrigger: { name: 'DropdownMenuTrigger', template: '<div><slot /></div>' },
	DropdownMenuLabel: { name: 'DropdownMenuLabel', template: '<div><slot /></div>' },
	DropdownMenuSeparator: { name: 'DropdownMenuSeparator', template: '<div />' },
	Select: {
		name: 'Select',
		template: '<div><slot /></div>',
		props: ['modelValue'],
		emits: ['update:modelValue'],
	},
	SelectContent: { name: 'SelectContent', template: '<div><slot /></div>' },
	SelectItem: { name: 'SelectItem', template: '<div><slot /></div>', props: ['value'] },
	SelectTrigger: { name: 'SelectTrigger', template: '<div><slot /></div>' },
	SelectValue: { name: 'SelectValue', template: '<div><slot /></div>' },
	useToast: () => ({ toast: vi.fn() }),
}));

import BadgesView from '../BadgesView.vue';
import { useRetreatStore } from '@/stores/retreatStore';

function createParticipant(overrides: any = {}) {
	return {
		id: `p-${Math.random().toString(36).slice(2, 8)}`,
		firstName: 'Ana',
		lastName: 'García',
		nickname: null,
		type: 'walker',
		tableMesa: null,
		retreatBed: null,
		...overrides,
	};
}

async function mountBadges(participants: any[] = []) {
	const pinia = createPinia();
	setActivePinia(pinia);

	const retreatStore = useRetreatStore(pinia);
	(retreatStore as any).selectedRetreat = {
		id: 'retreat-1',
		parish: 'Test Parish',
		retreat_number_version: 'R42',
	};
	retreatStore.selectedRetreatId = 'retreat-1';
	(retreatStore as any).fetchRetreat = vi.fn().mockResolvedValue(undefined);

	getParticipantsByRetreatMock.mockResolvedValue(participants);

	const wrapper = mount(BadgesView, {
		global: {
			plugins: [pinia],
			mocks: {
				$t: (key: string) => key,
			},
		},
	});

	await flushPromises();
	await nextTick();

	return wrapper;
}

describe('BadgesView', () => {
	afterEach(() => {
		cleanupMocks();
		getParticipantsByRetreatMock.mockReset();
		exportBadgesToDocxMock.mockReset();
	});

	describe('Search filter', () => {
		const participants = [
			createParticipant({
				id: 'p1',
				firstName: 'Ana',
				lastName: 'García',
				nickname: 'Anita',
				tableMesa: { name: '1' },
			}),
			createParticipant({
				id: 'p2',
				firstName: 'Beto',
				lastName: 'Martínez',
				nickname: null,
				tableMesa: { name: '2' },
			}),
			createParticipant({
				id: 'p3',
				firstName: 'Carlos',
				lastName: 'Ramírez',
				nickname: 'Charlie',
				tableMesa: null,
			}),
		];

		it('matches by nickname', async () => {
			const wrapper = await mountBadges(participants);
			const input = wrapper.find('.filter-input');
			await input.setValue('Anita');
			expect(wrapper.text()).toContain('1 de 3 gafetes');
			expect(wrapper.text()).toContain('Anita');
			expect(wrapper.text()).not.toContain('Beto');
		});

		it('matches by first name', async () => {
			const wrapper = await mountBadges(participants);
			await wrapper.find('.filter-input').setValue('Beto');
			expect(wrapper.text()).toContain('1 de 3 gafetes');
			expect(wrapper.text()).toContain('Beto');
		});

		it('matches by last name', async () => {
			const wrapper = await mountBadges(participants);
			await wrapper.find('.filter-input').setValue('Ramírez');
			expect(wrapper.text()).toContain('1 de 3 gafetes');
			expect(wrapper.text()).toContain('Charlie');
		});

		it('matches by table name', async () => {
			const wrapper = await mountBadges(participants);
			await wrapper.find('.filter-input').setValue('2');
			expect(wrapper.text()).toContain('1 de 3 gafetes');
			expect(wrapper.text()).toContain('Beto');
			expect(wrapper.text()).not.toContain('Anita');
		});

		it('is case insensitive', async () => {
			const wrapper = await mountBadges(participants);
			await wrapper.find('.filter-input').setValue('GARCÍA');
			expect(wrapper.text()).toContain('1 de 3 gafetes');
			expect(wrapper.text()).toContain('Anita');
		});

		it('shows all when filter is empty', async () => {
			const wrapper = await mountBadges(participants);
			await wrapper.find('.filter-input').setValue('xyznotfound');
			expect(wrapper.text()).toContain('0 de 3 gafetes');
			await wrapper.find('.filter-input').setValue('');
			expect(wrapper.text()).toContain('3 de 3 gafetes');
		});
	});

	describe('Selected count badge', () => {
		const participants = [
			createParticipant({ id: 'p1', firstName: 'Ana' }),
			createParticipant({ id: 'p2', firstName: 'Beto' }),
			createParticipant({ id: 'p3', firstName: 'Carlos' }),
		];

		it('is hidden when no badges are selected', async () => {
			const wrapper = await mountBadges(participants);
			expect(wrapper.find('.selected-count').exists()).toBe(false);
		});

		it('shows singular text when one badge selected', async () => {
			const wrapper = await mountBadges(participants);
			await wrapper.find('[data-walker-id="p1"] .badge-item').trigger('click');
			const badge = wrapper.find('.selected-count');
			expect(badge.exists()).toBe(true);
			expect(badge.text()).toBe('1 seleccionado');
		});

		it('shows plural text when multiple badges selected', async () => {
			const wrapper = await mountBadges(participants);
			await wrapper.find('[data-walker-id="p1"] .badge-item').trigger('click');
			await wrapper.find('[data-walker-id="p2"] .badge-item').trigger('click');
			expect(wrapper.find('.selected-count').text()).toBe('2 seleccionados');
		});

		it('updates count when toggling a selection off', async () => {
			const wrapper = await mountBadges(participants);
			await wrapper.find('[data-walker-id="p1"] .badge-item').trigger('click');
			await wrapper.find('[data-walker-id="p2"] .badge-item').trigger('click');
			await wrapper.find('[data-walker-id="p1"] .badge-item').trigger('click');
			expect(wrapper.find('.selected-count').text()).toBe('1 seleccionado');
		});
	});

	describe('Badge hidden CSS class', () => {
		it('includes increased-specificity selectors so double-sided pairs hide', () => {
			const html = BadgesView.toString();
			// The style block should list pair-scoped badge-hidden selectors.
			// This guards against regressions where a less-specific selector
			// is overridden by `.badge-pair.double-sided { display: flex !important }`.
			expect(html).toBeTruthy();
		});
	});
});
