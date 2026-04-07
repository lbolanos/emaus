import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ProfileView from '../ProfileView.vue';

// --- Mocks: axios / csrf / runtime config (patterns borrowed from LoginView test) ---
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
		initialize: vi.fn(() => Promise.resolve()),
	},
}));

// --- Mock the social API functions used by ProfileView ---
const getUserProfileMock = vi.fn();
const updateUserProfileMock = vi.fn();
const updateAvatarMock = vi.fn();
const removeAvatarMock = vi.fn();

vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
	getUserProfile: (...args: any[]) => getUserProfileMock(...args),
	updateUserProfile: (...args: any[]) => updateUserProfileMock(...args),
	updateAvatar: (...args: any[]) => updateAvatarMock(...args),
	removeAvatar: (...args: any[]) => removeAvatarMock(...args),
}));

// --- Mock the auth store so userEmail is available ---
vi.mock('@/stores/authStore', () => ({
	useAuthStore: () => ({
		user: { email: 'test@emaus.cc', displayName: 'Test User' },
	}),
}));

// --- Mock the child components to keep the unit isolated ---
vi.mock('@/components/social/AvatarUpload.vue', () => ({
	default: {
		name: 'AvatarUpload',
		props: ['currentAvatar', 'displayName', 'size', 'editable', 'maxSize'],
		emits: ['upload', 'remove'],
		template:
			'<div data-testid="avatar-upload">' +
			'<button data-testid="avatar-upload-btn" @click="$emit(\'upload\', \'new-avatar-url\')">Upload</button>' +
			'<button data-testid="avatar-remove-btn" @click="$emit(\'remove\')">Remove</button>' +
			'</div>',
	},
}));

vi.mock('@/components/social/UserTagList.vue', () => ({
	default: {
		name: 'UserTagList',
		props: ['tags', 'editable', 'variant', 'maxTags', 'add', 'remove'],
		template:
			'<div data-testid="user-tag-list">' +
			'<button data-testid="add-tag-btn" @click="add && add(\'new-tag\')">Add</button>' +
			'<button data-testid="remove-tag-btn" @click="tags[0] && remove && remove(tags[0])">Remove</button>' +
			'</div>',
	},
}));

vi.mock('@/components/social/TestimonialsVisibilityConfig.vue', () => ({
	default: {
		name: 'TestimonialsVisibilityConfig',
		template: '<div data-testid="testimonials-visibility-config"></div>',
	},
}));

// --- Mock @repo/ui to get real prop propagation for Switch ---
vi.mock('@repo/ui', () => ({
	Button: {
		name: 'Button',
		props: ['variant', 'size', 'disabled'],
		emits: ['click'],
		template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
	},
	Switch: {
		name: 'Switch',
		props: ['id', 'modelValue'],
		emits: ['update:modelValue'],
		template:
			'<button :id="id" type="button" role="switch" :aria-checked="modelValue" @click="$emit(\'update:modelValue\', !modelValue)"><slot /></button>',
	},
	Card: {
		name: 'Card',
		template: '<div class="card"><slot /></div>',
	},
	useToast: () => ({
		toast: vi.fn(),
	}),
}));

// --- Mock lucide icons used in ProfileView ---
vi.mock('lucide-vue-next', () => {
	const make = (name: string) => ({ name, template: '<svg></svg>' });
	return {
		User: make('User'),
		Sparkles: make('Sparkles'),
		Shield: make('Shield'),
		MapPin: make('MapPin'),
		Globe: make('Globe'),
		Mail: make('Mail'),
		CheckCircle2: make('CheckCircle2'),
		AlertCircle: make('AlertCircle'),
		Loader2: make('Loader2'),
	};
});

// --- Mock vue-router (setup.ts already does it, but be explicit) ---
vi.mock('vue-router', () => ({
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
	useRoute: () => ({ path: '/app/profile', name: 'profile', params: {}, query: {} }),
}));

// Helper: a typical profile payload returned by the API
const mockProfilePayload = {
	bio: 'Hola, soy un hermano de la Familia Emaús',
	location: 'Ciudad de México',
	website: 'https://emaus.cc',
	showEmail: false,
	showPhone: false,
	showRetreats: true,
	interests: ['oración', 'música'],
	skills: ['liderazgo'],
	avatarUrl: 'https://cdn/avatar.png',
	user: { displayName: 'Juan Pérez' },
};

const mountedWrappers: VueWrapper<any>[] = [];

async function mountProfileView(): Promise<VueWrapper<any>> {
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(ProfileView as any, {
		global: {
			plugins: [pinia],
			stubs: {
				transition: false,
				Transition: false,
			},
		},
	});
	mountedWrappers.push(wrapper);
	await flushPromises();
	await nextTick();
	return wrapper;
}

describe('ProfileView', () => {
	beforeEach(() => {
		getUserProfileMock.mockReset();
		updateUserProfileMock.mockReset();
		updateAvatarMock.mockReset();
		removeAvatarMock.mockReset();
		getUserProfileMock.mockResolvedValue(mockProfilePayload);
		updateUserProfileMock.mockResolvedValue({});
		updateAvatarMock.mockResolvedValue({});
		removeAvatarMock.mockResolvedValue({});
	});

	afterEach(() => {
		// Unmount every wrapper created in this test so its window listeners
		// (keydown, beforeunload) are removed and can't leak into the next test.
		while (mountedWrappers.length) {
			const w = mountedWrappers.pop();
			try {
				w?.unmount();
			} catch {
				/* ignore */
			}
		}
		vi.restoreAllMocks();
	});

	describe('loading & rendering', () => {
		it('calls getUserProfile on mount and renders the loaded data', async () => {
			const wrapper = await mountProfileView();

			expect(getUserProfileMock).toHaveBeenCalledTimes(1);

			const bio = wrapper.find('#bio-field').element as HTMLTextAreaElement;
			expect(bio.value).toBe(mockProfilePayload.bio);

			const location = wrapper.find('#location-field').element as HTMLInputElement;
			expect(location.value).toBe(mockProfilePayload.location);

			const website = wrapper.find('#website-field').element as HTMLInputElement;
			expect(website.value).toBe(mockProfilePayload.website);
		});

		it('renders the display name and email from the auth store', async () => {
			const wrapper = await mountProfileView();
			const text = wrapper.text();
			expect(text).toContain('Juan Pérez');
			expect(text).toContain('test@emaus.cc');
		});

		it('does NOT show the sticky save bar when there are no unsaved changes', async () => {
			const wrapper = await mountProfileView();
			// The sticky bar is inside a <Transition>; it only renders its child when hasChanges is true.
			expect(wrapper.text()).not.toContain('social.unsavedChangesLabel');
			expect(wrapper.text()).not.toContain('social.savedLabel');
		});
	});

	describe('unsaved changes tracking', () => {
		it('marks profile as unsaved when bio field is edited', async () => {
			const wrapper = await mountProfileView();
			const bio = wrapper.find('#bio-field');
			await bio.setValue('Nueva biografía');
			await nextTick();
			expect(wrapper.text()).toContain('social.unsavedChangesLabel');
		});

		it('marks profile as unsaved when location field is edited', async () => {
			const wrapper = await mountProfileView();
			await wrapper.find('#location-field').setValue('Guadalajara');
			await nextTick();
			expect(wrapper.text()).toContain('social.unsavedChangesLabel');
		});

		it('marks profile as unsaved when a tag is added via UserTagList', async () => {
			const wrapper = await mountProfileView();
			// The first add-tag-btn belongs to interests, the second to skills
			const addBtns = wrapper.findAll('[data-testid="add-tag-btn"]');
			expect(addBtns.length).toBeGreaterThan(0);
			await addBtns[0].trigger('click');
			await nextTick();
			expect(wrapper.text()).toContain('social.unsavedChangesLabel');
		});

		it('marks profile as unsaved when a tag is removed via UserTagList', async () => {
			const wrapper = await mountProfileView();
			const removeBtns = wrapper.findAll('[data-testid="remove-tag-btn"]');
			await removeBtns[0].trigger('click');
			await nextTick();
			expect(wrapper.text()).toContain('social.unsavedChangesLabel');
		});

		it('marks profile as unsaved when a privacy switch is toggled', async () => {
			const wrapper = await mountProfileView();
			const emailSwitch = wrapper.find('#show-email');
			await emailSwitch.trigger('click');
			await nextTick();
			expect(wrapper.text()).toContain('social.unsavedChangesLabel');
		});
	});

	describe('save flow', () => {
		it('calls updateUserProfile with the current profile payload when Save is clicked', async () => {
			const wrapper = await mountProfileView();

			await wrapper.find('#bio-field').setValue('Biografía actualizada');
			await nextTick();

			// Find the Save button inside the sticky bar (it shows "social.saveProfile")
			const buttons = wrapper.findAll('button');
			const saveBtn = buttons.find((b) => b.text() === 'social.saveProfile');
			expect(saveBtn).toBeDefined();
			await saveBtn!.trigger('click');
			await flushPromises();

			expect(updateUserProfileMock).toHaveBeenCalledTimes(1);
			const payload = updateUserProfileMock.mock.calls[0][0];
			expect(payload.bio).toBe('Biografía actualizada');
			expect(payload.location).toBe(mockProfilePayload.location);
		});

		it('shows the saved state briefly after a successful save', async () => {
			const wrapper = await mountProfileView();

			await wrapper.find('#bio-field').setValue('Algo nuevo');
			await nextTick();
			const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'social.saveProfile');
			await saveBtn!.trigger('click');
			await flushPromises();
			await nextTick();

			expect(wrapper.text()).toContain('social.savedLabel');
			expect(wrapper.text()).not.toContain('social.unsavedChangesLabel');
		});

		it('does not call updateUserProfile if there are no unsaved changes', async () => {
			const wrapper = await mountProfileView();
			// No edit → sticky bar not visible → nothing to click. Simulate via Ctrl+S shortcut.
			const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
			window.dispatchEvent(event);
			await flushPromises();
			expect(updateUserProfileMock).not.toHaveBeenCalled();
		});
	});

	describe('keyboard shortcuts', () => {
		it('saves via Ctrl+S when there are unsaved changes', async () => {
			const wrapper = await mountProfileView();
			await wrapper.find('#bio-field').setValue('Cambio por atajo');
			await nextTick();

			const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
			window.dispatchEvent(event);
			await flushPromises();

			expect(updateUserProfileMock).toHaveBeenCalledTimes(1);
		});

		it('saves via Cmd+S (metaKey) on Mac when there are unsaved changes', async () => {
			const wrapper = await mountProfileView();
			await wrapper.find('#bio-field').setValue('Mac shortcut');
			await nextTick();

			const event = new KeyboardEvent('keydown', { key: 's', metaKey: true });
			window.dispatchEvent(event);
			await flushPromises();

			expect(updateUserProfileMock).toHaveBeenCalledTimes(1);
		});

		it('removes the keyboard listener on unmount', async () => {
			const removeSpy = vi.spyOn(window, 'removeEventListener');
			const wrapper = await mountProfileView();
			wrapper.unmount();
			expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
			expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
		});
	});

	describe('discard flow', () => {
		it('reloads profile when user confirms discard', async () => {
			const wrapper = await mountProfileView();
			await wrapper.find('#bio-field').setValue('Cambios a tirar');
			await nextTick();

			const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
			getUserProfileMock.mockClear();

			const discardBtn = wrapper
				.findAll('button')
				.find((b) => b.text() === 'social.discardChanges');
			expect(discardBtn).toBeDefined();
			await discardBtn!.trigger('click');
			await flushPromises();

			expect(confirmSpy).toHaveBeenCalled();
			expect(getUserProfileMock).toHaveBeenCalledTimes(1);
			confirmSpy.mockRestore();
		});

		it('does NOT reload profile when user cancels discard', async () => {
			const wrapper = await mountProfileView();
			await wrapper.find('#bio-field').setValue('Cambios');
			await nextTick();

			const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
			getUserProfileMock.mockClear();

			const discardBtn = wrapper
				.findAll('button')
				.find((b) => b.text() === 'social.discardChanges');
			await discardBtn!.trigger('click');
			await flushPromises();

			expect(confirmSpy).toHaveBeenCalled();
			expect(getUserProfileMock).not.toHaveBeenCalled();
			confirmSpy.mockRestore();
		});
	});

	describe('avatar actions', () => {
		it('calls updateAvatar when AvatarUpload emits upload', async () => {
			const wrapper = await mountProfileView();
			await wrapper.find('[data-testid="avatar-upload-btn"]').trigger('click');
			await flushPromises();
			expect(updateAvatarMock).toHaveBeenCalledWith('new-avatar-url');
		});

		it('calls removeAvatar when AvatarUpload emits remove', async () => {
			const wrapper = await mountProfileView();
			await wrapper.find('[data-testid="avatar-remove-btn"]').trigger('click');
			await flushPromises();
			expect(removeAvatarMock).toHaveBeenCalledTimes(1);
		});
	});

	describe('error handling', () => {
		it('does not crash when getUserProfile fails on mount', async () => {
			getUserProfileMock.mockRejectedValueOnce(new Error('network down'));
			const wrapper = await mountProfileView();
			// Form still renders (even if with empty defaults) and loading state is gone
			expect(wrapper.html()).toBeTruthy();
		});

		it('keeps hasChanges=true when updateUserProfile fails', async () => {
			updateUserProfileMock.mockRejectedValueOnce(new Error('save failed'));
			const wrapper = await mountProfileView();
			await wrapper.find('#bio-field').setValue('Intento fallido');
			await nextTick();

			const saveBtn = wrapper.findAll('button').find((b) => b.text() === 'social.saveProfile');
			await saveBtn!.trigger('click');
			await flushPromises();

			// Sticky bar should still show the unsaved label, not the saved one
			expect(wrapper.text()).toContain('social.unsavedChangesLabel');
			expect(wrapper.text()).not.toContain('social.savedLabel');
		});
	});
});
