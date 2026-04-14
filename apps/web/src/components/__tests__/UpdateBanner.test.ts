import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import UpdateBanner from '../UpdateBanner.vue';
import { useVersionStore } from '@/stores/versionStore';

describe('UpdateBanner', () => {
	let store: ReturnType<typeof useVersionStore>;

	beforeEach(() => {
		setActivePinia(createPinia());
		store = useVersionStore();
	});

	function mountBanner() {
		return mount(UpdateBanner, {
			global: {
				stubs: {
					Transition: {
						template: '<div><slot /></div>',
					},
				},
				mocks: {
					$t: (key: string) => key,
				},
			},
		});
	}

	it('is hidden when no update is available', () => {
		const wrapper = mountBanner();
		expect(wrapper.find('.bg-amber-500').exists()).toBe(false);
	});

	it('shows the banner when updateAvailable is true', () => {
		store.updateAvailable = true;
		const wrapper = mountBanner();
		expect(wrapper.find('.bg-amber-500').exists()).toBe(true);
	});

	it('displays translated message and update button', () => {
		store.updateAvailable = true;
		const wrapper = mountBanner();
		expect(wrapper.text()).toContain('versionBanner.message');
		expect(wrapper.text()).toContain('versionBanner.update');
	});

	it('hides banner after dismiss is clicked', async () => {
		store.updateAvailable = true;
		const wrapper = mountBanner();

		const dismissBtn = wrapper.find('button[aria-label="common.close"]');
		expect(dismissBtn.exists()).toBe(true);

		await dismissBtn.trigger('click');
		expect(store.dismissed).toBe(true);
		expect(wrapper.find('.bg-amber-500').exists()).toBe(false);
	});

	it('calls reloadForUpdate when update button is clicked', async () => {
		store.updateAvailable = true;
		const reloadSpy = vi.spyOn(store, 'reloadForUpdate').mockResolvedValue();

		const wrapper = mountBanner();
		const updateBtn = wrapper.find('button.bg-white');
		await updateBtn.trigger('click');

		expect(reloadSpy).toHaveBeenCalled();
	});

	it('stays hidden when dismissed even if updateAvailable is true', () => {
		store.updateAvailable = true;
		store.dismissed = true;
		const wrapper = mountBanner();
		expect(wrapper.find('.bg-amber-500').exists()).toBe(false);
	});
});
