import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/components/community/CreateMemberModal.vue', () => ({
	default: { name: 'CreateMemberModal', props: ['open', 'communityId'], template: '<div />' },
}));

const mocks = vi.hoisted(() => ({
	members: [] as any[],
	fetchCommunity: vi.fn(),
	fetchMembers: vi.fn(),
	fetchMeetings: vi.fn(),
	fetchAttendance: vi.fn(),
	recordSingleAttendance: vi.fn(),
}));

// defineStore so storeToRefs in the view gets real refs.
vi.mock('@/stores/communityStore', async () => {
	const { defineStore } = await import('pinia');
	const { ref } = await import('vue');
	return {
		useCommunityStore: defineStore('community-attendance-mock', () => ({
			currentCommunity: ref({ id: 'comm-1', name: 'Buen despacho', timezone: 'America/Mexico_City' }),
			members: ref<any[]>(mocks.members),
			loadingCommunity: ref(false),
			fetchCommunity: mocks.fetchCommunity,
			fetchMembers: mocks.fetchMembers,
			fetchMeetings: mocks.fetchMeetings,
			fetchAttendance: mocks.fetchAttendance,
			recordSingleAttendance: mocks.recordSingleAttendance,
		})),
	};
});

import CommunityAttendanceView from '../CommunityAttendanceView.vue';

describe('CommunityAttendanceView', () => {
	let wrapper: VueWrapper<any>;

	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		mocks.members.splice(
			0,
			mocks.members.length,
			{
				id: 'm-1',
				photoUrl: 'https://s3.example.com/community-members/m-1.jpg?sig=abc',
				sourceRetreat: { id: 'r-1', parish: 'Buen Despacho', startDate: '2026-10-16T00:00:00.000Z' },
				participant: { firstName: 'Ana', lastName: 'López', email: 'ana@example.com' },
			},
			{
				id: 'm-2',
				photoUrl: null,
				participant: { firstName: 'Beto', lastName: 'Ruiz', email: 'beto@example.com' },
			},
		);
		mocks.fetchMeetings.mockResolvedValue([
			{ id: 'meet-1', title: 'Reunión semanal', startDate: '2026-10-20T01:00:00.000Z' },
		]);
		mocks.fetchAttendance.mockResolvedValue([]);
	});

	afterEach(() => {
		wrapper?.unmount();
	});

	const mountView = async () => {
		wrapper = mount(CommunityAttendanceView, {
			props: { id: 'comm-1', meetingId: 'meet-1' },
		});
		await flushPromises();
	};

	it('shows each member photo on their attendance card', async () => {
		await mountView();

		const cards = wrapper.findAll('.member-card');
		expect(cards).toHaveLength(2);

		const photo = cards[0].find('img');
		expect(photo.exists()).toBe(true);
		expect(photo.attributes('src')).toBe(mocks.members[0].photoUrl);
		expect(photo.attributes('alt')).toBe('Foto de Ana López');
	});

	it('falls back to initials when the member has no photo', async () => {
		await mountView();

		const card = wrapper.findAll('.member-card')[1];
		expect(card.find('img').exists()).toBe(false);
		expect(card.text()).toContain('BR');
	});

	it('shows the retreat the member was imported from, and nothing when there is none', async () => {
		await mountView();

		const [ana, beto] = wrapper.findAll('.member-card');
		expect(ana.text()).toMatch(/Retiro: Buen Despacho · oct\.? 2026/);
		expect(beto.text()).not.toContain('Retiro:');
	});
});
