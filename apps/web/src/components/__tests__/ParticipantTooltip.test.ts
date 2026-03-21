import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import ParticipantTooltip from '../ParticipantTooltip.vue';
import { cleanupMocks } from '@/test/utils';

// Mock @repo/ui with class selectors for queryability
vi.mock('@repo/ui', () => ({
	Tooltip: { name: 'Tooltip', template: '<div class="tooltip"><slot /></div>' },
	TooltipTrigger: {
		name: 'TooltipTrigger',
		props: ['asChild'],
		template: '<div class="tooltip-trigger"><slot /></div>',
	},
	TooltipContent: {
		name: 'TooltipContent',
		props: ['side'],
		template: '<div class="tooltip-content"><slot /></div>',
	},
}));

function createParticipant(overrides: Record<string, any> = {}) {
	return {
		id: 'p-1',
		firstName: 'Juan',
		lastName: 'Pérez',
		type: 'walker',
		email: 'juan@test.com',
		isCancelled: false,
		retreatId: 'r-1',
		id_on_retreat: 42,
		invitedBy: 'María García',
		retreatBed: null,
		...overrides,
	};
}

function mountTooltip(participantOverrides: Record<string, any> = {}, slotContent = '<span class="pill">JP</span>') {
	return mount(ParticipantTooltip, {
		props: {
			participant: createParticipant(participantOverrides),
		},
		slots: {
			default: slotContent,
		},
		global: {
			mocks: {
				$t: (key: string) => key,
			},
		},
	});
}

describe('ParticipantTooltip', () => {
	let wrapper: VueWrapper;

	afterEach(() => {
		wrapper?.unmount();
		cleanupMocks();
	});

	describe('Structure', () => {
		it('renders Tooltip > TooltipTrigger > slot + TooltipContent', () => {
			wrapper = mountTooltip();
			expect(wrapper.find('.tooltip').exists()).toBe(true);
			expect(wrapper.find('.tooltip-trigger').exists()).toBe(true);
			expect(wrapper.find('.tooltip-content').exists()).toBe(true);
		});

		it('renders the slot content inside the trigger', () => {
			wrapper = mountTooltip();
			expect(wrapper.find('.tooltip-trigger .pill').exists()).toBe(true);
			expect(wrapper.find('.tooltip-trigger .pill').text()).toBe('JP');
		});
	});

	describe('Full name', () => {
		it('always displays the full name', () => {
			wrapper = mountTooltip({ firstName: 'Carlos', lastName: 'Rodríguez' });
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).toContain('Carlos Rodríguez');
		});
	});

	describe('Retreat ID (id_on_retreat)', () => {
		it('displays # id_on_retreat when present', () => {
			wrapper = mountTooltip({ id_on_retreat: 7 });
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).toContain('# 7');
		});

		it('hides retreat ID row when id_on_retreat is null', () => {
			wrapper = mountTooltip({ id_on_retreat: null });
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).not.toContain('#');
		});

		it('hides retreat ID row when id_on_retreat is 0 (falsy)', () => {
			wrapper = mountTooltip({ id_on_retreat: 0 });
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).not.toContain('#');
		});
	});

	describe('Invited by', () => {
		it('displays invitedBy when present', () => {
			wrapper = mountTooltip({ invitedBy: 'Ana López' });
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).toContain('tables.invitedBy');
			expect(content.text()).toContain('Ana López');
		});

		it('hides invitedBy row when null', () => {
			wrapper = mountTooltip({ invitedBy: null });
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).not.toContain('tables.invitedBy');
		});

		it('hides invitedBy row when empty string', () => {
			wrapper = mountTooltip({ invitedBy: '' });
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).not.toContain('tables.invitedBy');
		});
	});

	describe('Bed location', () => {
		it('displays formatted bed location when retreatBed is present', () => {
			wrapper = mountTooltip({
				retreatBed: { floor: 2, roomNumber: '3', bedNumber: '1' },
			});
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).toContain('tables.tableCard.bedLocation');
			expect(content.text()).toContain('2-3-1');
		});

		it('uses dash for missing floor', () => {
			wrapper = mountTooltip({
				retreatBed: { floor: null, roomNumber: '5', bedNumber: '2' },
			});
			expect(wrapper.find('.tooltip-content').text()).toContain('--5-2');
		});

		it('uses dash for missing roomNumber', () => {
			wrapper = mountTooltip({
				retreatBed: { floor: 1, roomNumber: '', bedNumber: '3' },
			});
			expect(wrapper.find('.tooltip-content').text()).toContain('1---3');
		});

		it('uses dash for missing bedNumber', () => {
			wrapper = mountTooltip({
				retreatBed: { floor: 1, roomNumber: '2', bedNumber: '' },
			});
			expect(wrapper.find('.tooltip-content').text()).toContain('1-2--');
		});

		it('handles floor = 0 correctly (ground floor)', () => {
			wrapper = mountTooltip({
				retreatBed: { floor: 0, roomNumber: '1', bedNumber: '1' },
			});
			expect(wrapper.find('.tooltip-content').text()).toContain('0-1-1');
		});

		it('hides bed location row when retreatBed is null', () => {
			wrapper = mountTooltip({ retreatBed: null });
			expect(wrapper.find('.tooltip-content').text()).not.toContain('tables.tableCard.bedLocation');
		});

		it('hides bed location row when retreatBed is undefined', () => {
			wrapper = mountTooltip({ retreatBed: undefined });
			expect(wrapper.find('.tooltip-content').text()).not.toContain('tables.tableCard.bedLocation');
		});
	});

	describe('Minimal participant (only required fields)', () => {
		it('renders with only name, no optional fields', () => {
			wrapper = mountTooltip({
				id_on_retreat: null,
				invitedBy: null,
				retreatBed: null,
			});
			const content = wrapper.find('.tooltip-content');
			expect(content.text()).toBe('Juan Pérez');
		});
	});

	describe('Full participant (all fields present)', () => {
		it('renders all four rows', () => {
			wrapper = mountTooltip({
				id_on_retreat: 15,
				firstName: 'Pedro',
				lastName: 'Martínez',
				invitedBy: 'Luis Hernández',
				retreatBed: { floor: 3, roomNumber: '4', bedNumber: '2' },
			});
			const text = wrapper.find('.tooltip-content').text();
			expect(text).toContain('# 15');
			expect(text).toContain('Pedro Martínez');
			expect(text).toContain('Luis Hernández');
			expect(text).toContain('3-4-2');
		});
	});
});
