/**
 * Tests for ParticipantSpecialCaseToggle.vue – mark / unmark a walker as a
 * "caso especial" (specs/special-case).
 *
 * Covers:
 *  - gates: needs participant:update AND participant:health (D2)
 *  - marking opens the dialog; category is required, note optional (D4)
 *  - mark payload carries the category, the trimmed note and the selected
 *    retreat as contextRetreatId, then refetches the list
 *  - cancel keeps the store untouched
 *  - unmarking is confirm-gated and sends only { specialCase: false }
 *  - store failure emits nothing and releases the saving flag
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ParticipantSpecialCaseToggle from '../ParticipantSpecialCaseToggle.vue';

// Mock axios (not @/services/api) so every api.ts export stays real for the
// stores; no network happens because the store actions are replaced per test.
vi.mock('axios', () => {
	const instance = {
		get: vi.fn(() => Promise.resolve({ data: [] })),
		post: vi.fn(() => Promise.resolve({ data: {} })),
		put: vi.fn(() => Promise.resolve({ data: {} })),
		patch: vi.fn(() => Promise.resolve({ data: {} })),
		delete: vi.fn(() => Promise.resolve({ data: {} })),
		interceptors: {
			request: { use: vi.fn() },
			response: { use: vi.fn() },
		},
	};
	const mockAxios = {
		create: vi.fn(() => instance),
		defaults: { baseURL: '', withCredentials: false },
	};
	return { default: mockAxios, ...mockAxios };
});

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

const WALKER = {
	id: 'p1',
	firstName: 'Juan',
	lastName: 'Perez',
	specialCase: false,
};

// The global @repo/ui Dialog stub renders its content even when closed; this
// one honours `open` so the tests can see the dialog open and close.
const DialogStub = {
	name: 'Dialog',
	props: ['open'],
	template: '<div v-if="open" data-testid="special-case-dialog"><slot /></div>',
};

let pinia: any;
let participantStore: any;

function mountToggle(participant: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
	return mount(ParticipantSpecialCaseToggle, {
		props: { participant: { ...WALKER, ...participant }, ...props },
		global: { plugins: [pinia], stubs: { Dialog: DialogStub } },
	});
}

async function grant(permissions: Array<'update' | 'health'>) {
	const { useAuthStore } = await import('@/stores/authStore');
	const authStore = useAuthStore();
	authStore.userProfile = {
		permissions: permissions.map((operation) => ({ resource: 'participant', operation })),
		roles: [],
	} as any;

	// hasPermission falls back to [] when no retreat is selected.
	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	if (!retreatStore.selectedRetreatId) retreatStore.selectRetreat('r1');
}

const toggleButton = (w: ReturnType<typeof mountToggle>) => w.find('[data-testid="special-case-toggle"]');

describe('ParticipantSpecialCaseToggle', () => {
	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);
		await grant(['update', 'health']);
		const { useParticipantStore } = await import('@/stores/participantStore');
		participantStore = useParticipantStore();
		participantStore.updateParticipant = vi.fn().mockResolvedValue(undefined);
		participantStore.fetchParticipants = vi.fn().mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		(window.localStorage as any)?._reset?.();
	});

	it('renders nothing without participant:update', async () => {
		await grant(['health']);
		const w = mountToggle();
		expect(toggleButton(w).exists()).toBe(false);
		expect(w.text()).toBe('');
	});

	it('renders nothing without participant:health (health regime)', async () => {
		await grant(['update']);
		const w = mountToggle({ specialCase: true });
		expect(toggleButton(w).exists()).toBe(false);
		expect(w.text()).toBe('');
	});

	it('offers to mark an unflagged walker and to remove the flag of a flagged one', () => {
		expect(toggleButton(mountToggle()).attributes('title')).toBe('specialCases.mark');
		expect(toggleButton(mountToggle({ specialCase: true })).attributes('title')).toBe(
			'specialCases.remove',
		);
	});

	it('the button variant shows a labeled action', () => {
		const w = mountToggle({ specialCase: true }, { variant: 'button' });
		expect(toggleButton(w).text()).toContain('specialCases.remove');
	});

	it('opens the dialog on mark; the category is required', async () => {
		const w = mountToggle();
		expect(w.find('[data-testid="special-case-dialog"]').exists()).toBe(false);

		await toggleButton(w).trigger('click');
		expect(w.find('[data-testid="special-case-dialog"]').exists()).toBe(true);

		const submit = w.find('button[type="submit"]');
		expect(submit.attributes('disabled')).toBeDefined();

		// Submitting the form without a category does nothing.
		await w.find('form').trigger('submit');
		await flushPromises();
		expect(participantStore.updateParticipant).not.toHaveBeenCalled();

		await w.find('input[value="room"]').setValue();
		expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
	});

	it('marks with category, trimmed note and contextRetreatId, then refetches', async () => {
		const w = mountToggle();
		await toggleButton(w).trigger('click');
		await w.find('input[value="health"]').setValue();
		await w.find('textarea').setValue('  usa silla de ruedas  ');
		await w.find('form').trigger('submit');
		await flushPromises();

		expect(participantStore.updateParticipant).toHaveBeenCalledWith('p1', {
			specialCase: true,
			specialCaseCategory: 'health',
			specialCaseNotes: 'usa silla de ruedas',
			contextRetreatId: 'r1',
		});
		expect(participantStore.fetchParticipants).toHaveBeenCalled();
		expect(w.emitted('saved')).toEqual([['p1']]);
		expect(w.find('[data-testid="special-case-dialog"]').exists()).toBe(false);
	});

	it('omits the note when it is blank', async () => {
		const w = mountToggle();
		await toggleButton(w).trigger('click');
		await w.find('input[value="other"]').setValue();
		await w.find('textarea').setValue('   ');
		await w.find('form').trigger('submit');
		await flushPromises();

		expect(participantStore.updateParticipant).toHaveBeenCalledWith('p1', {
			specialCase: true,
			specialCaseCategory: 'other',
			contextRetreatId: 'r1',
		});
	});

	it('cancel closes the dialog and keeps the store untouched', async () => {
		const w = mountToggle();
		await toggleButton(w).trigger('click');
		await w.find('input[value="room"]').setValue();
		const cancel = w.findAll('button').find((b) => b.text() === 'common.actions.cancel');
		await cancel!.trigger('click');
		await flushPromises();

		expect(w.find('[data-testid="special-case-dialog"]').exists()).toBe(false);
		expect(participantStore.updateParticipant).not.toHaveBeenCalled();
		expect(w.emitted('saved')).toBeUndefined();
	});

	it('unmarks with confirm and sends only specialCase: false + contextRetreatId', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const w = mountToggle({ specialCase: true, specialCaseCategory: 'room' });
		await toggleButton(w).trigger('click');
		await flushPromises();

		expect(confirmSpy).toHaveBeenCalledWith('specialCases.confirmRemove');
		expect(participantStore.updateParticipant).toHaveBeenCalledWith('p1', {
			specialCase: false,
			contextRetreatId: 'r1',
		});
		expect(w.emitted('saved')).toEqual([['p1']]);
		// No dialog on unmark.
		expect(w.find('[data-testid="special-case-dialog"]').exists()).toBe(false);
	});

	it('cancelling the unmark confirm keeps the store untouched', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		const w = mountToggle({ specialCase: true });
		await toggleButton(w).trigger('click');
		await flushPromises();

		expect(participantStore.updateParticipant).not.toHaveBeenCalled();
		expect(w.emitted('saved')).toBeUndefined();
	});

	it('emits nothing on store failure and releases the saving flag', async () => {
		participantStore.updateParticipant.mockRejectedValue(new Error('boom'));
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const w = mountToggle({ specialCase: true });
		await toggleButton(w).trigger('click');
		await flushPromises();

		expect(w.emitted('saved')).toBeUndefined();
		expect(toggleButton(w).attributes('disabled')).toBeUndefined();
	});
});
