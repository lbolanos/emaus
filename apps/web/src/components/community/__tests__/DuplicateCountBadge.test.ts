/**
 * Badge del botón "Duplicados": cuántos pares pendientes hay. El contrato es
 * fail-soft — sin duplicados o con el count caído (403 de un co-admin, red),
 * el botón queda como siempre; el badge sólo aparece cuando hay algo que
 * revisar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const mockCount = vi.fn();
vi.mock('@/services/api', () => ({
	getCommunityDuplicateCount: (...a: any[]) => mockCount(...a),
}));

import DuplicateCountBadge from '../DuplicateCountBadge.vue';

beforeEach(() => {
	mockCount.mockReset();
});

describe('DuplicateCountBadge', () => {
	it('muestra el número cuando hay duplicados pendientes', async () => {
		mockCount.mockResolvedValue(3);
		const wrapper = mount(DuplicateCountBadge, { props: { communityId: 'c-1' } });
		await flushPromises();

		expect(wrapper.text()).toContain('3');
	});

	it('no pinta nada con cero', async () => {
		mockCount.mockResolvedValue(0);
		const wrapper = mount(DuplicateCountBadge, { props: { communityId: 'c-1' } });
		await flushPromises();

		expect(wrapper.text()).toBe('');
	});

	it('no pinta nada si el count falla (403, red caída)', async () => {
		mockCount.mockRejectedValue(new Error('Request failed with status code 403'));
		const wrapper = mount(DuplicateCountBadge, { props: { communityId: 'c-1' } });
		await flushPromises();

		expect(wrapper.text()).toBe('');
	});

	it('refresca cuando cambia la comunidad', async () => {
		mockCount.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
		const wrapper = mount(DuplicateCountBadge, { props: { communityId: 'c-1' } });
		await flushPromises();
		expect(wrapper.text()).toContain('1');

		await wrapper.setProps({ communityId: 'c-2' });
		await flushPromises();
		expect(wrapper.text()).toContain('5');
	});
});
