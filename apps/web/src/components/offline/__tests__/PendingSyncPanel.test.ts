import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const syncMock = vi.hoisted(() => ({ flushOutbox: vi.fn() }));
vi.mock('@/offline/syncService', () => ({ flushOutbox: syncMock.flushOutbox }));

import PendingSyncPanel from '../PendingSyncPanel.vue';
import { createMemoryStore, getOfflineStore, setOfflineStoreForTests } from '@/offline/storage';
import { setCacheUser } from '@/offline/readCache';
import { _reloadOutboxForTests, outbox, persistOp } from '@/offline/outbox';
import { _resetConnectivityForTests } from '@/offline/connectivity';
import type { OutboxOp } from '@/offline/outboxKinds';

/** specs/offline-mode FR-14: the queue, the server's message, retry and explicit discard. */

function op(id: string, status: OutboxOp['status'], extra: Partial<OutboxOp> = {}): OutboxOp {
	return {
		id,
		key: `k-${id}`,
		kind: 'reception.checkin',
		method: 'put',
		url: '/participants/p1/checkin',
		body: { retreatId: 'r1', checkedIn: true },
		retreatId: 'r1',
		userId: 'u1',
		occurredAt: '2026-10-17T22:30:00.000Z',
		status,
		attempts: 0,
		lastError: null,
		lastStatus: null,
		meta: { participantId: 'p1', name: 'Ana López' },
		...extra,
	};
}

const mountPanel = () =>
	mount(PendingSyncPanel, {
		props: { open: true },
		global: { stubs: { teleport: true } },
	});

describe('PendingSyncPanel', () => {
	beforeEach(async () => {
		syncMock.flushOutbox.mockReset().mockResolvedValue(undefined);
		setOfflineStoreForTests(createMemoryStore());
		setCacheUser('u1');
		_resetConnectivityForTests(true);
		await _reloadOutboxForTests();
	});

	it('lists the changes in order with their state', async () => {
		outbox.ops.push(op('002', 'pending'), op('001', 'conflict', { lastError: 'Bed is already assigned' }));
		const wrapper = mountPanel();
		await flushPromises();

		const rows = wrapper.findAll('[data-testid="pending-op"]');
		expect(rows.map((r) => r.attributes('data-status'))).toEqual(['conflict', 'pending']);
		expect(rows[0].text()).toContain('offline.ops.checkin');
		expect(rows[0].text()).toContain('Bed is already assigned');
	});

	it('says there is nothing pending', () => {
		const wrapper = mountPanel();
		expect(wrapper.text()).toContain('offline.panel.empty');
	});

	it('"Enviar ahora" runs the sync', async () => {
		outbox.ops.push(op('001', 'pending'));
		const wrapper = mountPanel();
		await wrapper.find('[data-testid="pending-sync-now"]').trigger('click');
		await flushPromises();
		expect(syncMock.flushOutbox).toHaveBeenCalledTimes(1);
	});

	it('retry puts a conflict back in the queue and sends it', async () => {
		const conflict = op('001', 'conflict', { lastError: 'x', attempts: 5 });
		outbox.ops.push(conflict);
		await persistOp(conflict);
		const wrapper = mountPanel();

		await wrapper.findAll('[data-testid="pending-op"] button')[0].trigger('click');
		await flushPromises();

		expect(outbox.ops[0]).toMatchObject({ status: 'pending', attempts: 0, lastError: null });
		expect(syncMock.flushOutbox).toHaveBeenCalled();
	});

	it('discard only after an explicit confirmation', async () => {
		const conflict = op('001', 'conflict', { lastError: 'x' });
		outbox.ops.push(conflict);
		await persistOp(conflict);
		const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
		const wrapper = mountPanel();
		const discard = () => wrapper.findAll('[data-testid="pending-op"] button')[1].trigger('click');

		await discard();
		await flushPromises();
		expect(outbox.ops).toHaveLength(1);

		await discard();
		await flushPromises();
		expect(outbox.ops).toHaveLength(0);
		expect(await getOfflineStore().entries('outbox')).toHaveLength(0);
		confirm.mockRestore();
	});

	it('asks to log in when the session expired', async () => {
		outbox.ops.push(op('001', 'pending'));
		outbox.needsLogin = true;
		const wrapper = mountPanel();
		expect(wrapper.find('[data-testid="pending-needs-login"]').exists()).toBe(true);
	});
});
