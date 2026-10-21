import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ConnectivityChip from '../ConnectivityChip.vue';
import OfflineBanner from '../OfflineBanner.vue';
import HealthNeedsConnection from '../HealthNeedsConnection.vue';
import {
	_resetConnectivityForTests,
	reportMissingOfflineData,
	reportNetworkFailure,
	reportServedFromCache,
	reportSuccess,
} from '@/offline/connectivity';
import { useParticipantStore } from '@/stores/participantStore';
import { createMemoryStore, setOfflineStoreForTests } from '@/offline/storage';
import { setCacheUser } from '@/offline/readCache';
import { _reloadOutboxForTests, outbox } from '@/offline/outbox';

/** specs/offline-mode D11 and the health decision of 2026-10-19. */

describe('ConnectivityChip', () => {
	const chip = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-testid="connectivity-chip"]');

	beforeEach(async () => {
		_resetConnectivityForTests(true);
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser('u1');
		await _reloadOutboxForTests();
	});
	afterEach(() => vi.unstubAllGlobals());

	it('says online while requests get answers', () => {
		const wrapper = mount(ConnectivityChip);
		expect(chip(wrapper).attributes('data-state')).toBe('online');
		expect(chip(wrapper).text()).toContain('offline.chip.online');
	});

	it('switches to offline and probes on tap', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		vi.stubGlobal('fetch', fetchMock);
		const wrapper = mount(ConnectivityChip);

		reportNetworkFailure();
		await wrapper.vm.$nextTick();
		expect(chip(wrapper).attributes('data-state')).toBe('offline');
		expect(chip(wrapper).text()).toContain('offline.chip.offline');

		await chip(wrapper).trigger('click');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('does not probe on tap when already online', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const wrapper = mount(ConnectivityChip);
		await chip(wrapper).trigger('click');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('counts the changes waiting and the ones the server rejected', async () => {
		outbox.ops.push(op('a', 'pending'), op('b', 'pending'), op('c', 'conflict'), op('d', 'pending', 'other-user'));
		const wrapper = mount(ConnectivityChip);
		await wrapper.vm.$nextTick();
		expect(chip(wrapper).attributes('data-pending')).toBe('2');
		expect(chip(wrapper).attributes('data-conflicts')).toBe('1');
		expect(chip(wrapper).text()).toContain('offline.chip.conflicts');
	});

	it('collapsed sidebar: dot only', () => {
		const wrapper = mount(ConnectivityChip, { props: { collapsed: true } });
		expect(chip(wrapper).text()).toBe('');
	});
});

function op(id: string, status: 'pending' | 'conflict', userId = 'u1') {
	return {
		id,
		key: `k-${id}`,
		kind: 'bags.bagMade' as const,
		method: 'patch' as const,
		url: '/history/retreat/r1/participant/p1/bag-made',
		body: { bagMade: true },
		retreatId: 'r1',
		userId,
		occurredAt: '2026-10-17T10:00:00.000Z',
		status,
		attempts: 0,
		lastError: null,
		lastStatus: null,
		meta: { participantId: 'p1', name: 'Ana' },
	};
}

describe('OfflineBanner', () => {
	beforeEach(() => _resetConnectivityForTests(true));

	it('is hidden while online', () => {
		const wrapper = mount(OfflineBanner);
		expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(false);
	});

	it('offline without saved answers yet: says only saved data will show', async () => {
		const wrapper = mount(OfflineBanner);
		reportNetworkFailure();
		await wrapper.vm.$nextTick();
		expect(wrapper.text()).toContain('offline.banner.noCache');
	});

	it('offline with saved answers: says how old they are', async () => {
		const wrapper = mount(OfflineBanner);
		reportNetworkFailure();
		reportServedFromCache(Date.now() - 20 * 60_000);
		await wrapper.vm.$nextTick();
		expect(wrapper.text()).toContain('offline.banner.stale');
	});

	it('mentions screens without saved data', async () => {
		const wrapper = mount(OfflineBanner);
		reportNetworkFailure();
		reportMissingOfflineData();
		await wrapper.vm.$nextTick();
		expect(wrapper.text()).toContain('offline.banner.missing');
	});

	it('disappears when the signal comes back', async () => {
		const wrapper = mount(OfflineBanner);
		reportNetworkFailure();
		await wrapper.vm.$nextTick();
		reportSuccess();
		await wrapper.vm.$nextTick();
		expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(false);
	});
});

describe('HealthNeedsConnection', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		_resetConnectivityForTests(false);
	});

	it('explains why the report is not shown and retries on demand', async () => {
		const store = useParticipantStore();
		store.filters.retreatId = 'r1';
		const fetchSpy = vi.spyOn(store, 'fetchParticipants').mockResolvedValue(undefined);
		const wrapper = mount(HealthNeedsConnection);

		expect(wrapper.text()).toContain('offline.healthNeedsConnection');
		expect(fetchSpy).not.toHaveBeenCalled();

		await wrapper.find('button').trigger('click');
		await flushPromises();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('retries by itself when the signal comes back', async () => {
		const store = useParticipantStore();
		store.filters.retreatId = 'r1';
		const fetchSpy = vi.spyOn(store, 'fetchParticipants').mockResolvedValue(undefined);
		mount(HealthNeedsConnection);

		reportSuccess();
		await flushPromises();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});
