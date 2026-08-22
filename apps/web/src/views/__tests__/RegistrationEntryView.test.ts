import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import RegistrationEntryView from '../RegistrationEntryView.vue';

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: () => 'http://localhost:3001',
}));

vi.mock('@/views/ParticipantRegistrationView.vue', () => ({
	default: {
		name: 'ParticipantRegistrationView',
		props: ['retreatId', 'slug', 'type'],
		template: '<div class="single-view" />',
	},
}));

vi.mock('@/views/CoupleRegistrationView.vue', () => ({
	default: {
		name: 'CoupleRegistrationView',
		props: ['retreatId', 'slug', 'type'],
		template: '<div class="couple-view" />',
	},
}));

const mockFetchRetreat = (retreat: Record<string, unknown> | null, ok = true) => {
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		json: () => Promise.resolve(retreat),
	}) as any;
};

describe('RegistrationEntryView (dispatcher por retreat_type)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('monta el wizard de pareja cuando retreat_type es couples', async () => {
		mockFetchRetreat({ id: 'r1', isPublic: true, retreat_type: 'couples' });
		const wrapper = mount(RegistrationEntryView, {
			props: { slug: 'sanjose', type: 'walker' },
		});
		await flushPromises();
		expect(wrapper.find('.couple-view').exists()).toBe(true);
		expect(wrapper.find('.single-view').exists()).toBe(false);
	});

	it('monta el wizard individual para los demás tipos', async () => {
		mockFetchRetreat({ id: 'r1', isPublic: true, retreat_type: 'men' });
		const wrapper = mount(RegistrationEntryView, {
			props: { slug: 'sanjose', type: 'walker' },
		});
		await flushPromises();
		expect(wrapper.find('.single-view').exists()).toBe(true);
		expect(wrapper.find('.couple-view').exists()).toBe(false);
	});

	it('monta el wizard individual sin retreat_type (retiros existentes)', async () => {
		mockFetchRetreat({ id: 'r1', isPublic: true });
		const wrapper = mount(RegistrationEntryView, {
			props: { retreatId: 'r1', type: 'server' },
		});
		await flushPromises();
		expect(wrapper.find('.single-view').exists()).toBe(true);
	});

	it('cae al wizard individual si la consulta del retiro falla', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('network')) as any;
		const wrapper = mount(RegistrationEntryView, {
			props: { slug: 'sanjose', type: 'walker' },
		});
		await flushPromises();
		expect(wrapper.find('.single-view').exists()).toBe(true);
	});

	it('pasa slug y type al hijo', async () => {
		mockFetchRetreat({ id: 'r1', isPublic: true, retreat_type: 'couples' });
		const wrapper = mount(RegistrationEntryView, {
			props: { slug: 'sanjose', type: 'server' },
		});
		await flushPromises();
		const child = wrapper.findComponent({ name: 'CoupleRegistrationView' });
		expect(child.props('slug')).toBe('sanjose');
		expect(child.props('type')).toBe('server');
	});
});
