import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/components/community/CreateMemberModal.vue', () => ({
	default: { name: 'CreateMemberModal', props: ['open', 'communityId'], template: '<div />' },
}));

// The icon allowlist in test/setup.ts does not know SlidersHorizontal (mobile filters button).
vi.mock('lucide-vue-next', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	SlidersHorizontal: { name: 'SlidersHorizontal', template: '<svg></svg>' },
}));

vi.mock('@/components/community/MemberPhotoDialog.vue', () => ({
	default: {
		name: 'MemberPhotoDialog',
		props: ['open', 'communityId', 'memberId', 'memberName', 'currentPhotoUrl'],
		emits: ['update:open', 'saved'],
		template: '<div />',
	},
}));

vi.mock('@/components/community/GroupPhotoAttendanceDialog.vue', () => ({
	default: {
		name: 'GroupPhotoAttendanceDialog',
		props: ['open', 'analyzing', 'result', 'members', 'confirming'],
		emits: ['update:open', 'confirm'],
		template: '<div />',
	},
}));

const mockPickFile = vi.hoisted(() => vi.fn());
vi.mock('@/utils/filePicker', () => ({ pickFile: mockPickFile, pickFiles: mockPickFile }));

// happy-dom has no canvas: the real resizers cannot run.
vi.mock('@/utils/imageResize', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/utils/imageResize')>()),
	resizeImageToDataUrl: vi.fn(async () => 'data:cover'),
	resizeImageForAnalysis: vi.fn(async () => 'data:analysis'),
}));

const mocks = vi.hoisted(() => ({
	community: { id: 'comm-1', name: 'Buen despacho', timezone: 'America/Mexico_City' } as Record<string, unknown>,
	setMeetingPhoto: vi.fn(),
	analyzeGroupPhoto: vi.fn(),
	confirmFaceMatch: vi.fn(),
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
			currentCommunity: ref(mocks.community),
			members: ref<any[]>(mocks.members),
			loadingCommunity: ref(false),
			fetchCommunity: mocks.fetchCommunity,
			fetchMembers: mocks.fetchMembers,
			fetchMeetings: mocks.fetchMeetings,
			fetchAttendance: mocks.fetchAttendance,
			recordSingleAttendance: mocks.recordSingleAttendance,
			setMeetingPhoto: mocks.setMeetingPhoto,
			analyzeGroupPhoto: mocks.analyzeGroupPhoto,
			confirmFaceMatch: mocks.confirmFaceMatch,
		})),
	};
});

import CommunityAttendanceView from '../CommunityAttendanceView.vue';
import { outbox } from '@/offline/outbox';
import { stashGroupPhoto } from '@/composables/useMeetingPhotoUpload';

describe('CommunityAttendanceView', () => {
	let wrapper: VueWrapper<any>;

	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		localStorage.clear();
		outbox.ops = [];
		delete mocks.community.faceRecognitionEnabled;
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
		mocks.fetchMembers.mockImplementation(async () => mocks.members);
		mocks.recordSingleAttendance.mockResolvedValue({});
	});

	afterEach(() => {
		wrapper?.unmount();
		vi.useRealTimers();
	});

	const mountView = async () => {
		wrapper = mount(CommunityAttendanceView, {
			props: { id: 'comm-1', meetingId: 'meet-1' },
		});
		await flushPromises();
		// The initial load reads the members once; the tests count what comes after.
		mocks.fetchMembers.mockClear();
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

	describe('tapping a card', () => {
		it('marks only that card and does not re-read the member list', async () => {
			await mountView();

			await wrapper.findAll('.member-card')[0].trigger('click');
			await flushPromises();

			expect(mocks.recordSingleAttendance).toHaveBeenCalledWith('comm-1', 'meet-1', 'm-1', true, {
				memberName: 'Ana López',
			});
			expect(mocks.fetchMembers).not.toHaveBeenCalled();
			expect(wrapper.findAll('.member-card')[0].classes()).toContain('bg-green-50');
		});

		it('refreshes the rates once, 4 s after the last tap', async () => {
			await mountView();
			vi.useFakeTimers();

			await wrapper.findAll('.member-card')[0].trigger('click');
			await vi.advanceTimersByTimeAsync(3000);
			await wrapper.findAll('.member-card')[1].trigger('click');
			await vi.advanceTimersByTimeAsync(3000);
			expect(mocks.fetchMembers).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1500);
			expect(mocks.fetchMembers).toHaveBeenCalledTimes(1);
			// The marks made in this session survive the refresh.
			expect(wrapper.findAll('.member-card').every((c) => c.classes().includes('bg-green-50'))).toBe(
				true,
			);
		});

		it('keeps the cards in place on refresh while sorting by attendance', async () => {
			mocks.members[0].lastMeetingsAttendanceRate = 50;
			mocks.members[1].lastMeetingsAttendanceRate = 10;
			await mountView();
			const selects = wrapper.findAllComponents({ name: 'Select' });
			selects[4].vm.$emit('update:modelValue', 'attendance');
			await flushPromises();
			const names = () => wrapper.findAll('.member-card').map((c) => c.find('.break-words').text());
			expect(names()).toEqual(['Ana López', 'Beto Ruiz']);

			vi.useFakeTimers();
			// After the tap Beto's rate overtakes Ana's: the list must not reorder.
			mocks.fetchMembers.mockImplementation(async () => {
				mocks.members[1] = { ...mocks.members[1], lastMeetingsAttendanceRate: 90 };
				return mocks.members;
			});
			await wrapper.findAll('.member-card')[1].trigger('click');
			await vi.advanceTimersByTimeAsync(4500);

			expect(mocks.fetchMembers).toHaveBeenCalledTimes(1);
			expect(names()).toEqual(['Ana López', 'Beto Ruiz']);
			expect(wrapper.findAll('.member-card')[1].text()).toContain('90%');
		});
	});

	describe('member photo', () => {
		it('opens the photo dialog from the avatar without marking attendance', async () => {
			await mountView();
			const dialog = wrapper.findComponent({ name: 'MemberPhotoDialog' });
			expect(dialog.props('open')).toBe(false);

			await wrapper.findAll('.member-card')[0].find('button[aria-label^="Cambiar la foto"]').trigger('click');
			await flushPromises();

			expect(mocks.recordSingleAttendance).not.toHaveBeenCalled();
			expect(dialog.props('open')).toBe(true);
			expect(dialog.props('memberId')).toBe('m-1');
			expect(dialog.props('memberName')).toBe('Ana López');
			expect(wrapper.findAllComponents({ name: 'MemberPhotoDialog' })).toHaveLength(1);
		});

		it('replaces the row with the saved member and keeps its attendance', async () => {
			await mountView();
			await wrapper.findAll('.member-card')[1].trigger('click');
			await flushPromises();

			wrapper
				.findComponent({ name: 'MemberPhotoDialog' })
				.vm.$emit('saved', { id: 'm-2', photoUrl: 'https://s3.example.com/community-members/m-2.jpg?sig=z' });
			await flushPromises();

			const card = wrapper.findAll('.member-card')[1];
			expect(card.find('img').attributes('src')).toBe(
				'https://s3.example.com/community-members/m-2.jpg?sig=z',
			);
			expect(card.classes()).toContain('bg-green-50');
			expect(card.text()).toContain('Beto Ruiz');
		});

		it('asks for fresh signatures when an image fails, at most once a minute', async () => {
			await mountView();
			vi.useFakeTimers();
			const fresh = 'https://s3.example.com/community-members/m-1.jpg?sig=fresh';
			mocks.fetchMembers.mockImplementation(async () => {
				mocks.members[0] = { ...mocks.members[0], photoUrl: fresh };
				return mocks.members;
			});

			await wrapper.findAll('.member-card')[0].find('img').trigger('error');
			await vi.advanceTimersByTimeAsync(0);
			expect(mocks.fetchMembers).toHaveBeenCalledTimes(1);
			// Expired refresh DOES replace the URL.
			expect(wrapper.findAll('.member-card')[0].find('img').attributes('src')).toBe(fresh);

			// The fresh signature fails too: no second read within the minute.
			const avatar = () => wrapper.findAllComponents({ name: 'MemberAvatar' })[0];
			avatar().vm.$emit('error');
			await vi.advanceTimersByTimeAsync(0);
			expect(mocks.fetchMembers).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(61_000);
			avatar().vm.$emit('error');
			await vi.advanceTimersByTimeAsync(0);
			expect(mocks.fetchMembers).toHaveBeenCalledTimes(2);
		});

		it('keeps the on-screen photo URL when a background refresh only re-signs it', async () => {
			await mountView();
			vi.useFakeTimers();
			const original = mocks.members[0].photoUrl;
			mocks.fetchMembers.mockImplementation(async () => {
				mocks.members[0] = {
					...mocks.members[0],
					photoUrl: 'https://s3.example.com/community-members/m-1.jpg?sig=resigned',
				};
				return mocks.members;
			});

			await wrapper.findAll('.member-card')[1].trigger('click');
			await vi.advanceTimersByTimeAsync(4500);

			expect(mocks.fetchMembers).toHaveBeenCalledTimes(1);
			expect(wrapper.findAll('.member-card')[0].find('img').attributes('src')).toBe(original);
		});
	});

	describe('taps saved without signal', () => {
		const queueOp = (memberId: string) =>
			outbox.ops.push({
				id: `op-${memberId}`,
				kind: 'community.attendance',
				status: 'pending',
				meta: { meetingId: 'meet-1', memberId },
			} as any);

		it('keeps the mark, shows "Pendiente" and does not report an error', async () => {
			queueOp('m-1');
			mocks.recordSingleAttendance.mockResolvedValue({ queued: true });
			await mountView();

			await wrapper.findAll('.member-card')[0].trigger('click');
			await flushPromises();

			const card = wrapper.findAll('.member-card')[0];
			expect(card.classes()).toContain('bg-green-50');
			expect(card.find('[data-testid="pending-badge"]').text()).toBe('Pendiente');
			expect(wrapper.findAll('[data-testid="pending-badge"]')).toHaveLength(1);
		});

		it('clears the badge when the operation leaves the queue', async () => {
			queueOp('m-1');
			mocks.recordSingleAttendance.mockResolvedValue({ queued: true });
			await mountView();
			await wrapper.findAll('.member-card')[0].trigger('click');
			await flushPromises();
			expect(wrapper.find('[data-testid="pending-badge"]').exists()).toBe(true);

			outbox.ops = [];
			await flushPromises();

			expect(wrapper.find('[data-testid="pending-badge"]').exists()).toBe(false);
			expect(wrapper.findAll('.member-card')[0].classes()).toContain('bg-green-50');
		});

		it('shows no badge for a tap that went straight to the server', async () => {
			await mountView();
			await wrapper.findAll('.member-card')[0].trigger('click');
			await flushPromises();
			expect(wrapper.find('[data-testid="pending-badge"]').exists()).toBe(false);
		});

		it('ignores queued taps of other meetings', async () => {
			outbox.ops.push({
				id: 'op-x',
				kind: 'community.attendance',
				status: 'pending',
				meta: { meetingId: 'other', memberId: 'm-2' },
			} as any);
			await mountView();
			expect(wrapper.find('[data-testid="pending-badge"]').exists()).toBe(false);
		});
	});

	describe('group photo', () => {
		const photoFile = new File([new Uint8Array([1])], 'grupo.jpg', { type: 'image/jpeg' });
		const uploadButton = () =>
			wrapper.findAll('button').find((b) => b.text().includes('Subir foto de la reunión'))!;
		const dialog = () => wrapper.findComponent({ name: 'GroupPhotoAttendanceDialog' });

		beforeEach(() => {
			mockPickFile.mockReset();
			mockPickFile.mockResolvedValue(photoFile);
			mocks.setMeetingPhoto.mockResolvedValue({ id: 'meet-1', photoUrl: 'https://s3.example.com/cover.jpg' });
		});

		it('uploads the cover only, with no review, when face recognition is off', async () => {
			await mountView();
			await uploadButton().trigger('click');
			await flushPromises();

			expect(mocks.setMeetingPhoto).toHaveBeenCalledWith('meet-1', 'data:cover');
			expect(mocks.analyzeGroupPhoto).not.toHaveBeenCalled();
			expect(dialog().props('open')).toBe(false);
			// The new cover shows without reloading.
			expect(wrapper.find('img[aria-label="Ver foto de la reunión"]').attributes('src')).toBe(
				'https://s3.example.com/cover.jpg',
			);
		});

		it('analyzes the photo and opens the review when it is on', async () => {
			mocks.community.faceRecognitionEnabled = true;
			const faces = [{ box: [0, 0, 1, 1], crop: 'data:c', suggestedMemberId: 'm-1' }];
			mocks.analyzeGroupPhoto.mockResolvedValue({ faces });
			await mountView();

			await uploadButton().trigger('click');
			await flushPromises();

			expect(mocks.analyzeGroupPhoto).toHaveBeenCalledWith('comm-1', 'meet-1', 'data:analysis');
			expect(dialog().props('open')).toBe(true);
			expect(dialog().props('analyzing')).toBe(false);
			expect(dialog().props('result')).toEqual({ faces });
		});

		it('opens the review in degraded mode when the analysis fails', async () => {
			mocks.community.faceRecognitionEnabled = true;
			vi.spyOn(console, 'error').mockImplementation(() => {});
			mocks.analyzeGroupPhoto.mockRejectedValue(new Error('503'));
			await mountView();

			await uploadButton().trigger('click');
			await flushPromises();

			expect(dialog().props('open')).toBe(true);
			expect(dialog().props('result')).toMatchObject({ faces: [], degraded: true });
		});

		it('analyzes the photo the meetings list left in memory', async () => {
			mocks.community.faceRecognitionEnabled = true;
			mocks.analyzeGroupPhoto.mockResolvedValue({ faces: [] });
			stashGroupPhoto({ communityId: 'comm-1', meetingId: 'meet-1', image: 'data:stashed' });

			await mountView();

			expect(mocks.analyzeGroupPhoto).toHaveBeenCalledWith('comm-1', 'meet-1', 'data:stashed');
			expect(dialog().props('open')).toBe(true);
		});

		it('confirms the review, marks those present without reloading and closes', async () => {
			mocks.community.faceRecognitionEnabled = true;
			mocks.analyzeGroupPhoto.mockResolvedValue({ faces: [] });
			mocks.confirmFaceMatch.mockResolvedValue({ attendanceMarked: 2 });
			await mountView();
			await uploadButton().trigger('click');
			await flushPromises();

			const payload = { present: ['m-2'], photos: [], tags: [] };
			dialog().vm.$emit('confirm', payload);
			await flushPromises();

			expect(mocks.confirmFaceMatch).toHaveBeenCalledWith('comm-1', 'meet-1', payload);
			expect(wrapper.findAll('.member-card')[1].classes()).toContain('bg-green-50');
			expect(wrapper.findAll('.member-card')[0].classes()).not.toContain('bg-green-50');
			expect(dialog().props('open')).toBe(false);
			expect(mocks.fetchMembers).not.toHaveBeenCalled();
		});

		it('re-reads the members with fresh photos when the review set new profile photos', async () => {
			mocks.community.faceRecognitionEnabled = true;
			mocks.analyzeGroupPhoto.mockResolvedValue({ faces: [] });
			mocks.confirmFaceMatch.mockResolvedValue({ attendanceMarked: 1 });
			await mountView();
			await uploadButton().trigger('click');
			await flushPromises();

			dialog().vm.$emit('confirm', {
				present: ['m-2'],
				photos: [{ memberId: 'm-2', crop: 'data:c' }],
				tags: [],
			});
			await flushPromises();

			expect(mocks.fetchMembers).toHaveBeenCalledTimes(1);
			expect(wrapper.findAll('.member-card')[1].classes()).toContain('bg-green-50');
		});
	});

	describe('filters', () => {
		const selects = () => wrapper.findAllComponents({ name: 'Select' });

		it('filters by photo and counts active filters in the mobile button', async () => {
			await mountView();
			expect(wrapper.text()).toContain('Filtros (0)');

			selects()[3].vm.$emit('update:modelValue', 'without');
			await flushPromises();

			expect(wrapper.findAll('.member-card')).toHaveLength(1);
			expect(wrapper.findAll('.member-card')[0].text()).toContain('Beto Ruiz');
			expect(wrapper.text()).toContain('Filtros (1)');
		});

		it('remembers filters and sort per community, but not the search', async () => {
			await mountView();
			selects()[3].vm.$emit('update:modelValue', 'with');
			selects()[4].vm.$emit('update:modelValue', 'joined');
			await wrapper.find('input').setValue('ana');
			await flushPromises();

			expect(JSON.parse(localStorage.getItem('emaus:community-attendance:comm-1')!)).toEqual({
				status: 'all',
				retreat: 'all',
				frequency: 'all',
				photo: 'with',
				sort: 'joined',
			});

			wrapper.unmount();
			await mountView();
			expect(wrapper.findAll('.member-card')).toHaveLength(1);
			expect((wrapper.find('input').element as HTMLInputElement).value).toBe('');
			expect(wrapper.text()).toContain('Filtros (1)');
		});

		it('ignores a remembered retreat that no longer exists', async () => {
			localStorage.setItem(
				'emaus:community-attendance:comm-1',
				JSON.stringify({ retreat: 'gone' }),
			);
			await mountView();
			expect(wrapper.findAll('.member-card')).toHaveLength(2);
		});
	});
});
