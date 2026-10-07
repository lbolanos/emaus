/**
 * Tests for ParticipantQuickPhoneEditor.vue – inline patch of the walker's cell
 * phone and both emergency-contact cell phones (palancas flow).
 *
 * Covers:
 *  - permission gate: without participant:update nothing renders
 *  - popover seeds the 3 inputs from the row and labels EC fields with names
 *  - required fields (cell/EC1) cannot be emptied; EC2 can
 *  - country-aware validation rejects a wrong length without calling the store
 *  - payload carries ONLY changed fields; canonical result is re-emitted (`saved`)
 *  - Enter with no changes closes the popover without a store call
 *  - store failure keeps the popover open and emits nothing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import ParticipantQuickPhoneEditor from '../ParticipantQuickPhoneEditor.vue';

// Mock axios (not @/services/api) so every api.ts export stays real for the
// stores; no network happens because the store action is spied per test.
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

// In case a store resolves useRoute() at setup time.
vi.mock('vue-router', () => ({
	useRoute: () => ({ name: 'palancas', params: {}, query: {} }),
	useRouter: () => ({ push: vi.fn(), resolve: vi.fn(() => ({ href: '/' })) }),
}));

const PARTICIPANT = {
	id: 'p1',
	cellPhone: '5512345678',
	emergencyContact1Name: 'Mamá',
	emergencyContact1CellPhone: '5587654321',
	emergencyContact2Name: null,
	emergencyContact2CellPhone: null,
};

const CANONICAL_RESULT = {
	id: 'p1',
	cellPhone: '5512345678',
	emergencyContact1CellPhone: '5587654321',
	emergencyContact2CellPhone: '5511112222',
};

let pinia: any;
let participantStore: any;

function mountEditor(props: Record<string, unknown> = {}) {
	return mount(ParticipantQuickPhoneEditor, {
		props: {
			participant: { ...PARTICIPANT },
			country: 'México',
			...props,
		},
		global: { plugins: [pinia] },
	});
}

async function grantParticipantUpdate(enabled = true) {
	const { useAuthStore } = await import('@/stores/authStore');
	const authStore = useAuthStore();
	authStore.userProfile = {
		permissions: enabled ? [{ resource: 'participant', operation: 'update' }] : [],
		roles: [],
	} as any;

	// hasPermission falls back to [] when no retreat is selected.
	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	if (!retreatStore.selectedRetreatId) retreatStore.selectRetreat('r1');
}

/** Opens the popover and returns the wrapper. */
async function openPopover() {
	const w = mountEditor();
	await w.find('button[title="participants.quickPhones.edit"]').trigger('click');
	return w;
}

const saveButton = (w: VueWrapper<any>) =>
	w.findAll('button').find((b) => b.text() === 'common.actions.save');

describe('ParticipantQuickPhoneEditor', () => {
	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);
		await grantParticipantUpdate();
		const { useParticipantStore } = await import('@/stores/participantStore');
		participantStore = useParticipantStore();
		// The optimistic action is unit-tested by its own suite; here we only
		// care about what the editor sends and how it reacts to the outcome.
		participantStore.updateParticipantPhones = vi.fn();
		// focus() runs on open; keep it a no-op like the PreRetreat mold.
		vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		(window.localStorage as any)?._reset?.();
	});

	it('renders nothing without participant:update', async () => {
		await grantParticipantUpdate(false);
		const w = mountEditor();
		expect(w.find('button').exists()).toBe(false);
		expect(w.text()).toBe('');
	});

	it('seeds the 3 inputs from the row and names the EC labels', async () => {
		const w = await openPopover();
		const cell = w.find('#qp-cellPhone');
		const ec1 = w.find('#qp-emergencyContact1CellPhone');
		const ec2 = w.find('#qp-emergencyContact2CellPhone');
		expect((cell.element as HTMLInputElement).value).toBe('5512345678');
		expect((ec1.element as HTMLInputElement).value).toBe('5587654321');
		expect((ec2.element as HTMLInputElement).value).toBe('');
		// t() returns the key in tests; the EC1 label appends the contact's name.
		expect(w.find('label[for="qp-emergencyContact1CellPhone"]').text()).toContain('Mamá');
	});

	it('closing with Esc removes the popover', async () => {
		const w = await openPopover();
		await w.find('#qp-cellPhone').trigger('keydown.esc');
		expect(w.find('#qp-cellPhone').exists()).toBe(false);
	});

	it('blocks emptying cellPhone with requiredEmpty and no store call', async () => {
		const w = await openPopover();
		await w.find('#qp-cellPhone').setValue('');
		await saveButton(w)!.trigger('click');
		expect(w.text()).toContain('participants.quickPhones.requiredEmpty');
		expect(participantStore.updateParticipantPhones).not.toHaveBeenCalled();
		// Popover stays open for correction.
		expect(w.find('#qp-cellPhone').exists()).toBe(true);
	});

	it('rejects a wrong-length phone for the retreat country', async () => {
		const w = await openPopover();
		await w.find('#qp-cellPhone').setValue('123');
		await saveButton(w)!.trigger('click');
		// México expects 10 digits; message comes from phoneValidationMessage.
		expect(w.text()).toContain('10 dígitos');
		expect(participantStore.updateParticipantPhones).not.toHaveBeenCalled();
	});

	it('patches only the changed field and re-emits the canonical result', async () => {
		participantStore.updateParticipantPhones.mockResolvedValue(CANONICAL_RESULT);
		const w = await openPopover();
		await w.find('#qp-emergencyContact2CellPhone').setValue('5511112222');
		await saveButton(w)!.trigger('click');
		await flushPromises();

		expect(participantStore.updateParticipantPhones).toHaveBeenCalledWith('p1', {
			emergencyContact2CellPhone: '5511112222',
		});
		expect(w.emitted('saved')).toEqual([[CANONICAL_RESULT]]);
		expect(w.find('#qp-cellPhone').exists()).toBe(false);
	});

	it('Enter with no changes closes without calling the store', async () => {
		const w = await openPopover();
		// Guardar is disabled with no changes; Enter is the keyboard path.
		expect(saveButton(w)!.attributes('disabled')).toBeDefined();
		await w.find('#qp-cellPhone').trigger('keydown.enter');
		await flushPromises();

		expect(participantStore.updateParticipantPhones).not.toHaveBeenCalled();
		expect(w.find('#qp-cellPhone').exists()).toBe(false);
	});

	it('keeps the popover open and emits nothing when the store fails', async () => {
		participantStore.updateParticipantPhones.mockRejectedValue(new Error('boom'));
		const w = await openPopover();
		await w.find('#qp-cellPhone').setValue('5500000000');
		await saveButton(w)!.trigger('click');
		await flushPromises();

		expect(w.emitted('saved')).toBeUndefined();
		expect(w.find('#qp-cellPhone').exists()).toBe(true);
	});
});
