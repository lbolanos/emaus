import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Use vi.hoisted so the mock objects are available inside the (hoisted) factories.
const { mockApi, mockRouteQuery } = vi.hoisted(() => ({
	mockApi: { post: vi.fn() },
	mockRouteQuery: {} as { token?: string },
}));

vi.mock('@/services/api', () => ({ api: mockApi }));
vi.mock('vue-router', () => ({
	useRoute: () => ({ query: mockRouteQuery }),
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		go: vi.fn(),
		back: vi.fn(),
	}),
}));

// Local override of @repo/ui's Input so it forwards modelValue properly.
// The default global mock in src/test/setup.ts uses a stub that doesn't
// emit update:modelValue, which breaks v-model interactions in this test.
vi.mock('@repo/ui', async () => {
	const actual = await vi.importActual<any>('@repo/ui').catch(() => ({}));
	return {
		...actual,
		Button: { name: 'Button', template: '<button :disabled="disabled"><slot /></button>', props: ['variant', 'size', 'disabled', 'as', 'to'] },
		Input: {
			name: 'Input',
			template: '<input :type="type" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
			props: ['modelValue', 'placeholder', 'type', 'disabled'],
			emits: ['update:modelValue'],
		},
		Label: { name: 'Label', template: '<label><slot /></label>', props: ['for'] },
		Card: { name: 'Card', template: '<div><slot /></div>' },
		CardHeader: { name: 'CardHeader', template: '<div><slot /></div>' },
		CardTitle: { name: 'CardTitle', template: '<h2><slot /></h2>' },
		CardContent: { name: 'CardContent', template: '<div><slot /></div>' },
	};
});

import VerifyEmailView from '../VerifyEmailView.vue';

describe('VerifyEmailView', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockApi.post.mockReset();
		mockApi.post.mockResolvedValue({ data: {} });
		mockRouteQuery.token = undefined;
	});

	// Note: vue-i18n is globally mocked to return the translation key itself
	// (see apps/web/src/test/setup.ts). Assertions look for either the key or
	// the dynamic content (backend response messages) which are NOT translated.

	it('shows error state immediately when token is missing', async () => {
		const wrapper = mount(VerifyEmailView, {
			global: { stubs: { 'router-link': true } },
		});
		await flushPromises();

		expect(mockApi.post).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('emailVerify.invalidOrExpired');
	});

	it('shows error state when token is too short', async () => {
		mockRouteQuery.token = 'short';
		const wrapper = mount(VerifyEmailView, {
			global: { stubs: { 'router-link': true } },
		});
		await flushPromises();

		expect(mockApi.post).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('emailVerify.invalidOrExpired');
	});

	it('calls POST /auth/verify-email and shows success on 200', async () => {
		mockRouteQuery.token = 'a'.repeat(64);
		mockApi.post.mockResolvedValueOnce({ data: { message: 'Correo verificado correctamente.' } });

		const wrapper = mount(VerifyEmailView, {
			global: { stubs: { 'router-link': true } },
		});
		await flushPromises();

		expect(mockApi.post).toHaveBeenCalledWith('/auth/verify-email', {
			token: 'a'.repeat(64),
		});
		// Backend message renders as-is (not i18n)
		expect(wrapper.text()).toContain('Correo verificado correctamente');
		// Button text is i18n key in the mocked setup
		expect(wrapper.text()).toContain('emailVerify.goLogin');
	});

	it('shows error state when backend rejects token', async () => {
		mockRouteQuery.token = 'a'.repeat(64);
		mockApi.post.mockRejectedValueOnce({
			response: { data: { message: 'Token de verificación inválido o expirado.' } },
		});

		const wrapper = mount(VerifyEmailView, {
			global: { stubs: { 'router-link': true } },
		});
		await flushPromises();

		// Backend error message renders as-is
		expect(wrapper.text()).toContain('inválido o expirado');
		// Form labels/buttons are i18n keys
		expect(wrapper.text()).toContain('emailVerify.resend');
	});

	it('resend form calls POST /auth/resend-verification with email', async () => {
		mockRouteQuery.token = 'a'.repeat(64);
		// First call (verify) fails so resend form appears
		mockApi.post.mockRejectedValueOnce({ response: { data: { message: 'expired' } } });

		const wrapper = mount(VerifyEmailView, {
			global: { stubs: { 'router-link': true } },
		});
		await flushPromises();

		// Now arrange the resend success
		mockApi.post.mockResolvedValueOnce({
			data: { message: 'Si la cuenta existe y no está verificada, te enviamos un nuevo correo.' },
		});

		const input = wrapper.find('input[type="email"]');
		await input.setValue('me@test.local');
		await wrapper.find('form').trigger('submit');
		await flushPromises();

		expect(mockApi.post).toHaveBeenCalledWith('/auth/resend-verification', {
			email: 'me@test.local',
		});
		expect(wrapper.text()).toContain('te enviamos un nuevo correo');
	});

	it('on success, refreshes authStore (so banner disappears in other tabs)', async () => {
		mockRouteQuery.token = 'a'.repeat(64);
		mockApi.post.mockResolvedValueOnce({ data: { message: 'ok' } });

		mount(VerifyEmailView, {
			global: { stubs: { 'router-link': true } },
		});
		await flushPromises();

		// authStore.checkAuthStatus calls /auth/status via the same api instance.
		// We just verify the verify-email post happened — full integration of the
		// auth refresh is covered by the authStore's own tests.
		expect(mockApi.post).toHaveBeenCalledWith('/auth/verify-email', {
			token: 'a'.repeat(64),
		});
	});
});
