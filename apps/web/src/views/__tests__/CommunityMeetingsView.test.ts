import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

// ---- Mocks (must be hoisted before importing the component) ----

const mockMeetings = ref<any[]>([]);
const mockCurrentCommunity = ref<any>({ id: 'comm-1', name: 'Test Community' });
const mockLoadingCommunity = ref(false);
const mockFetchCommunity = vi.fn();
const mockFetchMeetings = vi.fn();
const mockDeleteMeeting = vi.fn();
const mockCreateNextMeetingInstance = vi.fn();
const mockSetMeetingPhoto = vi.fn();
const mockDeleteMeetingPhoto = vi.fn();

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		currentCommunity: mockCurrentCommunity,
		meetings: mockMeetings,
		loadingCommunity: mockLoadingCommunity,
		fetchCommunity: mockFetchCommunity,
		fetchMeetings: mockFetchMeetings,
		deleteMeeting: mockDeleteMeeting,
		createNextMeetingInstance: mockCreateNextMeetingInstance,
		setMeetingPhoto: mockSetMeetingPhoto,
		deleteMeetingPhoto: mockDeleteMeetingPhoto,
	}),
}));

// router-replace para verificar persistencia URL
const mockReplace = vi.fn();
vi.mock('vue-router', () => ({
	useRoute: () => ({ query: {} }),
	useRouter: () => ({ replace: mockReplace }),
}));

// Stub child component pesado
vi.mock('@/components/community/MeetingFormModal.vue', () => ({
	default: { name: 'MeetingFormModal', template: '<div />' },
}));

// Iconos lucide-vue-next que el componente importa pero no están en el mock global.
vi.mock('lucide-vue-next', async () => {
	const actual: any = await vi.importActual('lucide-vue-next');
	const stub = (name: string) => ({ name, template: '<svg></svg>' });
	return {
		...actual,
		Calendar: stub('Calendar'),
		CalendarPlus: stub('CalendarPlus'),
		Clock: stub('Clock'),
		CheckSquare: stub('CheckSquare'),
		ChevronRight: stub('ChevronRight'),
		Pencil: stub('Pencil'),
		Trash2: stub('Trash2'),
		RefreshCw: stub('RefreshCw'),
		Share: stub('Share'),
		FileText: stub('FileText'),
		UserCheck: stub('UserCheck'),
		UserX: stub('UserX'),
		Search: stub('Search'),
		Loader2: stub('Loader2'),
		ImagePlus: stub('ImagePlus'),
	};
});

// Extender @repo/ui con Tabs reactivos para que v-model funcione en el test.
vi.mock('@repo/ui', async () => {
	const actual: any = await vi.importActual('@repo/ui');
	return {
		...actual,
		Tabs: {
			name: 'Tabs',
			template: '<div><slot /></div>',
			props: ['modelValue'],
			emits: ['update:modelValue'],
			provide() {
				return {
					setTabValue: (v: string) => (this as any).$emit('update:modelValue', v),
				};
			},
		},
		TabsList: { name: 'TabsList', template: '<div><slot /></div>' },
		TabsTrigger: {
			name: 'TabsTrigger',
			template:
				'<button :data-value="value" @click="setTabValue(value)"><slot /></button>',
			props: ['value'],
			inject: ['setTabValue'],
		},
		Input: {
			name: 'Input',
			template:
				'<input :value="modelValue" :type="type" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
			props: ['modelValue', 'placeholder', 'type'],
			emits: ['update:modelValue'],
		},
		Card: { name: 'Card', template: '<div class="card"><slot /></div>' },
		CardHeader: { name: 'CardHeader', template: '<div><slot /></div>' },
		CardTitle: { name: 'CardTitle', template: '<div><slot /></div>' },
		CardDescription: { name: 'CardDescription', template: '<div><slot /></div>' },
		Badge: { name: 'Badge', template: '<span><slot /></span>' },
		Button: { name: 'Button', template: '<button><slot /></button>' },
		Dialog: {
			name: 'Dialog',
			template: '<div v-if="open"><slot /></div>',
			props: ['open'],
		},
		DialogContent: { name: 'DialogContent', template: '<div><slot /></div>' },
		DialogHeader: { name: 'DialogHeader', template: '<div><slot /></div>' },
		DialogTitle: { name: 'DialogTitle', template: '<div><slot /></div>' },
		DialogDescription: { name: 'DialogDescription', template: '<div><slot /></div>' },
		DialogFooter: { name: 'DialogFooter', template: '<div><slot /></div>' },
		Tooltip: { name: 'Tooltip', template: '<div><slot /></div>' },
		TooltipContent: { name: 'TooltipContent', template: '<div><slot /></div>' },
		TooltipProvider: { name: 'TooltipProvider', template: '<div><slot /></div>' },
		TooltipTrigger: { name: 'TooltipTrigger', template: '<div><slot /></div>' },
		RadioGroup: {
			name: 'RadioGroup',
			template: '<div><slot /></div>',
			props: ['modelValue'],
			emits: ['update:modelValue'],
		},
		RadioGroupItem: { name: 'RadioGroupItem', template: '<input type="radio" />' },
		Label: { name: 'Label', template: '<label><slot /></label>' },
		useToast: () => ({ toast: vi.fn() }),
	};
});

import CommunityMeetingsView from '../CommunityMeetingsView.vue';

const daysFromNow = (n: number) => {
	const d = new Date();
	d.setDate(d.getDate() + n);
	return d;
};

const baseMeeting = (overrides: Partial<any> = {}): any => ({
	id: crypto.randomUUID(),
	communityId: 'comm-1',
	title: 'Meeting',
	description: '',
	startDate: daysFromNow(7),
	durationMinutes: 60,
	isAnnouncement: false,
	isRecurrenceTemplate: false,
	parentMeetingId: null,
	exceptionType: null,
	...overrides,
});

const factory = () =>
	mount(CommunityMeetingsView, {
		props: { id: 'comm-1' },
		global: {
			mocks: { $t: (key: string) => key },
			stubs: {
				'router-link': { template: '<a><slot /></a>' },
			},
		},
	});

describe('CommunityMeetingsView — filters and view logic', () => {
	beforeEach(() => {
		mockMeetings.value = [];
		mockFetchCommunity.mockClear();
		mockFetchMeetings.mockClear();
		mockReplace.mockClear();
	});

	it('default tab is "upcoming" and counts past vs upcoming correctly', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Past 1', startDate: daysFromNow(-7) }),
			baseMeeting({ title: 'Past 2', startDate: daysFromNow(-14) }),
			baseMeeting({ title: 'Upcoming 1', startDate: daysFromNow(3) }),
			baseMeeting({ title: 'Upcoming 2', startDate: daysFromNow(10) }),
			baseMeeting({ title: 'Upcoming 3', startDate: daysFromNow(20) }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		// Counts visibles en triggers: (3) upcoming, (2) past, (5) all.
		const text = wrapper.text();
		expect(text).toContain('(3)'); // upcoming
		expect(text).toContain('(2)'); // past
		expect(text).toContain('(5)'); // all

		// Default tab muestra solo upcomings (3 cards visibles).
		const cards = wrapper.findAll('.card');
		expect(cards.length).toBe(3);
	});

	it('switching to past tab shows past meetings only', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Past A', startDate: daysFromNow(-5) }),
			baseMeeting({ title: 'Upcoming B', startDate: daysFromNow(5) }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		// Click en TabsTrigger value="past".
		const pastTrigger = wrapper.find('button[data-value="past"]');
		await pastTrigger.trigger('click');
		await nextTick();

		const cards = wrapper.findAll('.card');
		expect(cards.length).toBe(1);
		expect(cards[0].text()).toContain('Past A');
	});

	it('switching to all tab shows everything', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'P', startDate: daysFromNow(-1) }),
			baseMeeting({ title: 'U1', startDate: daysFromNow(1) }),
			baseMeeting({ title: 'U2', startDate: daysFromNow(2) }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		await wrapper.find('button[data-value="all"]').trigger('click');
		await nextTick();

		expect(wrapper.findAll('.card').length).toBe(3);
	});

	it('search filters by title (case-insensitive)', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Reunión Domingo', startDate: daysFromNow(3) }),
			baseMeeting({ title: 'Estudio Bíblico', startDate: daysFromNow(7) }),
			baseMeeting({ title: 'reunión miércoles', startDate: daysFromNow(10) }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		const searchInput = wrapper.find('input[type="search"]');
		await searchInput.setValue('reunión');
		await nextTick();

		const cards = wrapper.findAll('.card');
		expect(cards.length).toBe(2);
		const titles = cards.map((c) => c.text());
		expect(titles.some((t) => t.includes('Domingo'))).toBe(true);
		expect(titles.some((t) => t.includes('miércoles'))).toBe(true);
	});

	it('search also matches description content', async () => {
		mockMeetings.value = [
			baseMeeting({
				title: 'M1',
				description: 'Discutiremos el libro de Hechos',
				startDate: daysFromNow(3),
			}),
			baseMeeting({
				title: 'M2',
				description: 'Otro tema',
				startDate: daysFromNow(5),
			}),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		await wrapper.find('input[type="search"]').setValue('hechos');
		await nextTick();

		const cards = wrapper.findAll('.card');
		expect(cards.length).toBe(1);
		expect(cards[0].text()).toContain('M1');
	});

	it('upcoming tab sorts ascending (closest first)', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Far', startDate: daysFromNow(30) }),
			baseMeeting({ title: 'Near', startDate: daysFromNow(2) }),
			baseMeeting({ title: 'Mid', startDate: daysFromNow(15) }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		const cards = wrapper.findAll('.card');
		expect(cards.length).toBe(3);
		expect(cards[0].text()).toContain('Near');
		expect(cards[1].text()).toContain('Mid');
		expect(cards[2].text()).toContain('Far');
	});

	it('past tab sorts descending (most recent first)', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Old', startDate: daysFromNow(-30) }),
			baseMeeting({ title: 'Recent', startDate: daysFromNow(-2) }),
			baseMeeting({ title: 'Mid', startDate: daysFromNow(-15) }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();
		await wrapper.find('button[data-value="past"]').trigger('click');
		await nextTick();

		const cards = wrapper.findAll('.card');
		expect(cards.length).toBe(3);
		expect(cards[0].text()).toContain('Recent');
		expect(cards[2].text()).toContain('Old');
	});

	it('updates URL query when changing tab away from default', async () => {
		mockMeetings.value = [baseMeeting()];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		await wrapper.find('button[data-value="past"]').trigger('click');
		await nextTick();

		// Replace recibe `filter: 'past'`.
		expect(mockReplace).toHaveBeenCalled();
		const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
		expect(lastCall.query.filter).toBe('past');
	});

	it('returning to upcoming tab clears the URL filter param', async () => {
		mockMeetings.value = [baseMeeting()];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		await wrapper.find('button[data-value="past"]').trigger('click');
		await wrapper.find('button[data-value="upcoming"]').trigger('click');
		await nextTick();

		const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1][0];
		expect(lastCall.query.filter).toBeUndefined();
	});

	it('shows "no meetings match" state when search yields nothing', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Existing', startDate: daysFromNow(3) }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		await wrapper.find('input[type="search"]').setValue('zzzz-nothing');
		await nextTick();

		expect(wrapper.findAll('.card').length).toBe(0);
		expect(wrapper.text()).toContain('community.meeting.noMeetingsMatch');
	});

	it('clicking edit on a past meeting opens the past-edit confirmation dialog', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Historic', startDate: daysFromNow(-3) }),
		];
		const wrapper = factory();
		await flushPromises();
		// Switch to past tab to see the historic meeting.
		await wrapper.find('button[data-value="past"]').trigger('click');
		await nextTick();

		// The "edit" button is the one with the Pencil icon (svg). Use index: in the
		// stub, the action buttons render in order; we click the last visible action
		// that's NOT a router-link-wrapped one. Simpler: query inside the card the
		// button preceding the destructive one.
		const card = wrapper.find('.card');
		expect(card.exists()).toBe(true);

		// Buscamos el botón cuyo siguiente sibling es el destructivo (delete).
		const buttons = card.findAll('button');
		// El segundo a último botón (antes del delete) es Editar.
		const editButton = buttons[buttons.length - 2];
		await editButton.trigger('click');
		await nextTick();

		// El dialog de confirmación debe estar abierto.
		expect(wrapper.text()).toContain('community.meeting.editPastTitle');
	});
});

describe('CommunityMeetingsView — meeting photo', () => {
	beforeEach(() => {
		mockMeetings.value = [];
		mockSetMeetingPhoto.mockReset();
		mockDeleteMeetingPhoto.mockReset();
	});

	it('muestra la miniatura cuando la reunión tiene photoUrl', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Con foto', startDate: daysFromNow(5), photoUrl: 'data:image/png;base64,AAA' }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.find('img[src="data:image/png;base64,AAA"]').exists()).toBe(true);
	});

	it('el botón dice "Subir foto" sin foto y "Cambiar foto" con foto', async () => {
		mockMeetings.value = [
			baseMeeting({ title: 'Sin foto', startDate: daysFromNow(5), photoUrl: null }),
			baseMeeting({ title: 'Con foto', startDate: daysFromNow(6), photoUrl: 'data:image/png;base64,AAA' }),
		];
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.find('button[aria-label="Subir foto"]').exists()).toBe(true);
		expect(wrapper.find('button[aria-label="Cambiar foto"]').exists()).toBe(true);
	});

	it('al elegir una imagen llama a setMeetingPhoto con el id y un data-URI', async () => {
		const meeting = baseMeeting({ title: 'Sin foto', startDate: daysFromNow(5), photoUrl: null });
		mockMeetings.value = [meeting];
		mockSetMeetingPhoto.mockResolvedValue({ ...meeting, photoUrl: 'data:image/png;base64,AAA' });

		const wrapper = factory();
		await flushPromises();
		await nextTick();

		// 1) Click en el botón fija la reunión objetivo.
		await wrapper.find('button[aria-label="Subir foto"]').trigger('click');

		// 2) Simular la selección de archivo en el input oculto compartido.
		const input = wrapper.find('input[type="file"]');
		const file = new File(['binarycontent'], 'foto.png', { type: 'image/png' });
		Object.defineProperty(input.element, 'files', { value: [file] });
		await input.trigger('change');
		// FileReader.onload es basado en eventos (no promesa): esperar un tick de macrotask.
		await new Promise((r) => setTimeout(r, 30));
		await flushPromises();

		expect(mockSetMeetingPhoto).toHaveBeenCalledTimes(1);
		expect(mockSetMeetingPhoto.mock.calls[0][0]).toBe(meeting.id);
		expect(mockSetMeetingPhoto.mock.calls[0][1]).toMatch(/^data:/);
	});

	it('rechaza archivos que no son imagen sin llamar a setMeetingPhoto', async () => {
		const meeting = baseMeeting({ title: 'Sin foto', startDate: daysFromNow(5), photoUrl: null });
		mockMeetings.value = [meeting];

		const wrapper = factory();
		await flushPromises();
		await nextTick();

		await wrapper.find('button[aria-label="Subir foto"]').trigger('click');
		const input = wrapper.find('input[type="file"]');
		const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });
		Object.defineProperty(input.element, 'files', { value: [file] });
		await input.trigger('change');
		await flushPromises();

		expect(mockSetMeetingPhoto).not.toHaveBeenCalled();
	});
});
