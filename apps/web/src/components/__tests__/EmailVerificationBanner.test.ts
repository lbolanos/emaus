import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const { mockApi } = vi.hoisted(() => ({ mockApi: { post: vi.fn() } }));
vi.mock('@/services/api', () => ({ api: mockApi }));

import EmailVerificationBanner from '../EmailVerificationBanner.vue';
import { useAuthStore } from '@/stores/authStore';

const LOCAL_STORAGE_KEY = 'emailVerifyBanner.dismissedFor';

const baseUser = {
	id: 'user-1',
	email: 'me@test.local',
	displayName: 'Test',
};

describe('EmailVerificationBanner', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockApi.post.mockReset();
		mockApi.post.mockResolvedValue({ data: { message: 'sent' } });
		localStorage.clear();
	});

	it('does NOT render when user is null (logged out)', () => {
		const wrapper = mount(EmailVerificationBanner);
		expect(wrapper.find('[role="alert"]').exists()).toBe(false);
	});

	it('does NOT render when emailVerified=true', () => {
		const auth = useAuthStore();
		auth.user = { ...baseUser, emailVerified: true } as any;
		const wrapper = mount(EmailVerificationBanner);
		expect(wrapper.find('[role="alert"]').exists()).toBe(false);
	});

	it('does NOT render when emailVerified is undefined (legacy users)', () => {
		const auth = useAuthStore();
		auth.user = { ...baseUser } as any;
		const wrapper = mount(EmailVerificationBanner);
		expect(wrapper.find('[role="alert"]').exists()).toBe(false);
	});

	it('RENDERS when emailVerified=false', () => {
		const auth = useAuthStore();
		auth.user = { ...baseUser, emailVerified: false } as any;
		const wrapper = mount(EmailVerificationBanner);
		const banner = wrapper.find('[role="alert"]');
		expect(banner.exists()).toBe(true);
		// vue-i18n is globally mocked to return the key itself
		expect(banner.text()).toContain('emailVerify.banner.message');
	});

	it('clicking "Reenviar correo" calls POST /auth/resend-verification with user.email', async () => {
		const auth = useAuthStore();
		auth.user = { ...baseUser, emailVerified: false } as any;
		const wrapper = mount(EmailVerificationBanner);

		const button = wrapper.findAll('button').find((b) => b.text().includes('emailVerify.banner.resend'));
		expect(button).toBeTruthy();
		await button!.trigger('click');
		await flushPromises();

		expect(mockApi.post).toHaveBeenCalledWith('/auth/resend-verification', {
			email: baseUser.email,
		});
		expect(wrapper.text()).toContain('emailVerify.banner.sent');
	});

	it('shows "sent" state even when backend returns error (anti-enum behavior)', async () => {
		const auth = useAuthStore();
		auth.user = { ...baseUser, emailVerified: false } as any;
		mockApi.post.mockRejectedValueOnce(new Error('rate-limited'));
		const wrapper = mount(EmailVerificationBanner);

		const button = wrapper.findAll('button').find((b) => b.text().includes('emailVerify.banner.resend'));
		await button!.trigger('click');
		await flushPromises();

		expect(wrapper.text()).toContain('emailVerify.banner.sent');
	});

	it('dismiss persists per-user in localStorage and hides banner', async () => {
		const auth = useAuthStore();
		auth.user = { ...baseUser, emailVerified: false } as any;
		const wrapper = mount(EmailVerificationBanner);

		// Find the close (X) button by aria-label — value is i18n key in tests
		const closeBtn = wrapper.find('button[aria-label="emailVerify.banner.close"]');
		await closeBtn.trigger('click');
		await flushPromises();

		expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBe(baseUser.id);
		expect(wrapper.find('[role="alert"]').exists()).toBe(false);
	});

	it('dismiss is scoped per-user — different user sees banner again', async () => {
		localStorage.setItem(LOCAL_STORAGE_KEY, 'someone-else');
		const auth = useAuthStore();
		auth.user = { ...baseUser, emailVerified: false } as any;
		const wrapper = mount(EmailVerificationBanner);
		// dismissedForId from storage doesn't match current user → banner renders
		expect(wrapper.find('[role="alert"]').exists()).toBe(true);
	});
});
