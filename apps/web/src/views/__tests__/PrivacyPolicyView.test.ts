/**
 * Regression for the frozen-locale lists: before the fix, every translated
 * list in PrivacyPolicyView (informationItems, useItems, sensitiveItems,
 * retentionItems, rightsItems) was a plain array built once with t() at setup
 * time — switching the locale left the page half in the old language. The
 * lists are computeds now, so they must re-render when the locale changes.
 *
 * The global vue-i18n mock in setup.ts creates a NEW locale ref per useI18n()
 * call and t: key => key, which cannot express reactivity — hence the
 * file-level re-mock with one shared, settable locale.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PrivacyPolicyView from '../PrivacyPolicyView.vue';

vi.mock('vue-i18n', async () => {
	const { ref } = await import('vue');
	const locale = ref('es');
	return {
		useI18n: () => ({ t: (key: string) => `${locale.value}::${key}`, locale }),
		// Test-side handles into the mock's shared state.
		__setLocale: (value: string) => {
			locale.value = value;
		},
		__t: (key: string) => `${locale.value}::${key}`,
	};
});

const mountView = async () => {
	const i18n = (await import('vue-i18n')) as any;
	const wrapper = mount(PrivacyPolicyView, {
		global: {
			stubs: { 'router-link': true },
			mocks: { $t: (key: string) => i18n.__t(key) },
		},
	});
	await nextTick();
	return wrapper;
};

describe('PrivacyPolicyView — locale reactivity', () => {
	it('renders the retention list under the active locale', async () => {
		const wrapper = await mountView();

		expect(wrapper.text()).toContain('es::privacy.retention.items.health');
	});

	it('re-renders the translated lists when the locale switches', async () => {
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('es::privacy.retention.items.health');

		const i18n = (await import('vue-i18n')) as any;
		i18n.__setLocale('en');
		await nextTick();

		// Before the fix the list items kept the locale they were built with.
		expect(wrapper.text()).toContain('en::privacy.retention.items.health');
		expect(wrapper.text()).not.toContain('es::privacy.retention.items.health');
	});
});
