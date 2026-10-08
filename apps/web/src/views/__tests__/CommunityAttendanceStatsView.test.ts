import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

// ---- Mocks (hoisted antes de importar el componente) ----

const mockGetStats = vi.fn();
const mockGetDuplicates = vi.fn();
vi.mock('@/services/api', () => ({
	getCommunityAttendanceStats: (...args: any[]) => mockGetStats(...args),
	getCommunityDuplicates: (...args: any[]) => mockGetDuplicates(...args),
}));

const mockCurrentCommunity = ref<any>({ id: 'comm-1', name: 'Buen despacho', timezone: 'America/Mexico_City' });
const mockIsOwner = ref(false);
const mockFetchCommunity = vi.fn();
vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		get currentCommunity() {
			return mockCurrentCommunity.value;
		},
		get isOwnerOrSuperadmin() {
			return mockIsOwner.value;
		},
		fetchCommunity: mockFetchCommunity,
	}),
}));

const mockReplace = vi.fn();
const mockQuery = ref<Record<string, string>>({});
vi.mock('vue-router', () => ({
	useRoute: () => ({
		get query() {
			return mockQuery.value;
		},
	}),
	useRouter: () => ({ replace: mockReplace }),
}));

// La gráfica no aporta nada al test y arrastra el registro de chart.js.
vi.mock('vue-chartjs', () => ({
	Line: { name: 'Line', template: '<div class="chart" />', props: ['data', 'options'] },
}));
vi.mock('chart.js', () => ({
	Chart: { register: vi.fn() },
	Title: {}, Tooltip: {}, Legend: {}, CategoryScale: {}, LinearScale: {},
	LineElement: {}, PointElement: {},
}));

vi.mock('lucide-vue-next', async () => {
	const actual: any = await vi.importActual('lucide-vue-next');
	const stub = (name: string) => ({ name, template: '<svg></svg>' });
	return {
		...actual,
		CalendarDays: stub('CalendarDays'),
		CalendarOff: stub('CalendarOff'),
		ChevronDown: stub('ChevronDown'),
		ChevronRight: stub('ChevronRight'),
		ChevronUp: stub('ChevronUp'),
		ChevronsUpDown: stub('ChevronsUpDown'),
		Download: stub('Download'),
		FileDown: stub('FileDown'),
		Loader2: stub('Loader2'),
		TrendingUp: stub('TrendingUp'),
		Users: stub('Users'),
		X: stub('X'),
	};
});

// El mock global de @repo/ui acepta cualquier prop y no renderiza contenido
// real, así que aquí se sustituyen por stubs que SÍ pintan el slot: si no, la
// tabla queda vacía y los asserts de texto no prueban nada.
vi.mock('@repo/ui', async () => {
	const actual: any = await vi.importActual('@repo/ui');
	const box = (name: string, tag = 'div') => ({ name, template: `<${tag}><slot /></${tag}>` });
	return {
		...actual,
		Card: box('Card'),
		CardContent: box('CardContent'),
		CardHeader: box('CardHeader'),
		CardTitle: box('CardTitle'),
		Badge: { name: 'Badge', template: '<span class="badge"><slot /></span>', props: ['variant'] },
		Button: { name: 'Button', template: '<button><slot /></button>', props: ['variant', 'size', 'disabled', 'asChild'] },
		Checkbox: {
			name: 'Checkbox',
			template: '<input type="checkbox" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
			props: ['modelValue'],
			emits: ['update:modelValue'],
		},
		Input: {
			name: 'Input',
			template: '<input :value="modelValue" :type="type" @input="$emit(\'update:modelValue\', $event.target.value)" />',
			props: ['modelValue', 'type'],
			emits: ['update:modelValue'],
		},
		Label: box('Label', 'label'),
		Progress: { name: 'Progress', template: '<div class="progress" />', props: ['value'] },
		Select: {
			name: 'Select',
			template: '<div class="select"><slot /></div>',
			props: ['modelValue'],
			emits: ['update:modelValue'],
			provide() {
				return { selectValue: (v: string) => (this as any).$emit('update:modelValue', v) };
			},
		},
		SelectTrigger: box('SelectTrigger'),
		SelectValue: box('SelectValue', 'span'),
		SelectContent: box('SelectContent'),
		SelectItem: {
			name: 'SelectItem',
			template: '<button class="select-item" :data-value="value" @click="selectValue(value)"><slot /></button>',
			props: ['value'],
			inject: ['selectValue'],
		},
		Table: box('Table', 'table'),
		TableHeader: box('TableHeader', 'thead'),
		TableBody: box('TableBody', 'tbody'),
		TableRow: box('TableRow', 'tr'),
		TableHead: box('TableHead', 'th'),
		TableCell: box('TableCell', 'td'),
		useToast: () => ({ toast: vi.fn() }),
	};
});

import CommunityAttendanceStatsView from '../CommunityAttendanceStatsView.vue';

const meeting = (overrides: Partial<any> = {}): any => ({
	id: crypto.randomUUID(),
	title: 'Preparacion Retiro',
	startDate: '2026-09-03T01:45:00.000Z',
	meetingType: 'preparation',
	attended: 12,
	eligible: 20,
	ratePercent: 60,
	...overrides,
});

const member = (overrides: Partial<any> = {}): any => ({
	memberId: crypto.randomUUID(),
	participantId: crypto.randomUUID(),
	firstName: 'Ana',
	lastName: 'Ramírez',
	state: 'active_member',
	attended: 3,
	total: 3,
	ratePercent: 100,
	frequency: 'high',
	retreatsServed: 2,
	...overrides,
});

const statsPayload = (overrides: Partial<any> = {}): any => ({
	filters: {},
	meetings: [meeting()],
	members: [member()],
	totals: { meetingCount: 1, memberCount: 1, averageRatePercent: 60 },
	availableTypes: [
		{ meetingType: 'preparation', count: 5 },
		{ meetingType: 'general', count: 5 },
	],
	retreats: [{ id: 'retreat-1', label: 'Buen Despacho Del Valle II', startDate: '2026-10-16' }],
	retreatLinkedMeetingCount: 3,
	...overrides,
});

const factory = () =>
	mount(CommunityAttendanceStatsView, {
		props: { id: 'comm-1' },
		global: {
			mocks: { $t: (key: string) => key },
			stubs: {
				'router-link': { template: '<a><slot /></a>' },
				// El dialog real arrastra reka-ui; para la vista basta con saber
				// que se abre con el par correcto.
				MergePairDialog: {
					name: 'MergePairDialog',
					template: '<div data-testid="merge-pair-dialog" :data-open="String(open)" :data-pair="pair ? pair.participants[0].id : \'\'" />',
					props: ['open', 'communityId', 'pair'],
				},
			},
		},
	});

describe('CommunityAttendanceStatsView', () => {
	beforeEach(() => {
		mockGetStats.mockReset();
		mockGetStats.mockResolvedValue(statsPayload());
		mockGetDuplicates.mockReset();
		mockGetDuplicates.mockResolvedValue([]);
		mockIsOwner.value = false;
		mockReplace.mockClear();
		mockFetchCommunity.mockClear();
		mockQuery.value = {};
	});

	it('carga las estadísticas al montar y pinta los totales', async () => {
		const wrapper = factory();
		// flushPromises, no nextTick: el onMounted es async y con nextTick el DOM
		// se queda en el estado de carga.
		await flushPromises();
		await nextTick();

		expect(mockGetStats).toHaveBeenCalledWith('comm-1', {
			meetingType: undefined,
			from: undefined,
			to: undefined,
		});
		expect(wrapper.text()).toContain('60%');
		expect(wrapper.text()).toContain('Ana');
	});

	it('arranca con el filtro que venga en la URL', async () => {
		mockQuery.value = { meetingType: 'preparation', from: '2026-08-01' };
		factory();
		await flushPromises();

		expect(mockGetStats).toHaveBeenCalledWith('comm-1', {
			meetingType: 'preparation',
			from: '2026-08-01',
			to: undefined,
		});
	});

	it('al elegir un tipo recarga y lo refleja en la URL', async () => {
		const wrapper = factory();
		await flushPromises();
		mockGetStats.mockClear();

		const option = wrapper
			.findAll('.select-item')
			.find((item) => item.attributes('data-value') === 'preparation');
		expect(option).toBeTruthy();
		await option!.trigger('click');
		await flushPromises();

		expect(mockGetStats).toHaveBeenCalledWith('comm-1', {
			meetingType: 'preparation',
			from: undefined,
			to: undefined,
		});
		expect(mockReplace).toHaveBeenCalledWith(
			expect.objectContaining({
				query: expect.objectContaining({ meetingType: 'preparation' }),
			}),
		);
	});

	it('ordena el ranking por porcentaje descendente', async () => {
		mockGetStats.mockResolvedValue(
			statsPayload({
				members: [
					member({ firstName: 'Baja', lastName: 'Asistencia', ratePercent: 20, frequency: 'low' }),
					member({ firstName: 'Alta', lastName: 'Asistencia', ratePercent: 90, frequency: 'high' }),
				],
				totals: { meetingCount: 1, memberCount: 2, averageRatePercent: 55 },
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		const names = wrapper.findAll('tbody tr').map((row) => row.text());
		const ranking = names.filter((text) => text.includes('Asistencia'));
		expect(ranking[0]).toContain('Alta');
		expect(ranking[ranking.length - 1]).toContain('Baja');
	});

	it('oculta a los miembros que declinaron salvo que se pidan', async () => {
		mockGetStats.mockResolvedValue(
			statsPayload({
				members: [
					member({ firstName: 'Activa', state: 'active_member' }),
					member({ firstName: 'Declinó', state: 'not_interested', ratePercent: 0, frequency: 'none' }),
				],
				totals: { meetingCount: 1, memberCount: 2, averageRatePercent: 50 },
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('Activa');
		expect(wrapper.text()).not.toContain('Declinó');

		await wrapper.find('input[type="checkbox"]').setValue(true);
		await nextTick();

		expect(wrapper.text()).toContain('Declinó');
	});

	// El filtro es una lista POSITIVA de estados del padrón, no una lista negativa
	// de declinados: con `NOT IN [declinados]` un estado nuevo entraría al ranking
	// por defecto sin que nadie lo decidiera (regla de `community-state-semantics`).
	it('un estado que no es del padrón tampoco se muestra por defecto', async () => {
		mockGetStats.mockResolvedValue(
			statsPayload({
				members: [
					member({ firstName: 'Activa', state: 'active_member' }),
					member({ firstName: 'Nueva', state: 'un_estado_que_no_existia' as any, ratePercent: 0, frequency: 'none' }),
				],
				totals: { meetingCount: 1, memberCount: 2, averageRatePercent: 50 },
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('Activa');
		expect(wrapper.text()).not.toContain('Nueva');

		await wrapper.find('input[type="checkbox"]').setValue(true);
		await nextTick();
		expect(wrapper.text()).toContain('Nueva');
	});

	it('acota el ranking al equipo servidor del retiro elegido', async () => {
		const wrapper = factory();
		await flushPromises();
		mockGetStats.mockClear();

		const option = wrapper
			.findAll('.select-item')
			.find((item) => item.attributes('data-value') === 'retreat-1');
		expect(option, 'el retiro de la comunidad debe estar en el selector').toBeTruthy();
		await option!.trigger('click');
		await flushPromises();

		expect(mockGetStats).toHaveBeenCalledWith(
			'comm-1',
			expect.objectContaining({ retreatId: 'retreat-1' }),
		);
	});

	it('muestra los retiros servidos por cada miembro', async () => {
		mockGetStats.mockResolvedValue(
			statsPayload({ members: [member({ firstName: 'Veterano', retreatsServed: 7 })] }),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		const row = wrapper.findAll('tbody tr').find((r) => r.text().includes('Veterano'));
		expect(row!.text()).toContain('7');
	});

	it('puede ordenar por retiros servidos', async () => {
		mockGetStats.mockResolvedValue(
			statsPayload({
				members: [
					member({ firstName: 'Novato', ratePercent: 100, retreatsServed: 0 }),
					member({ firstName: 'Veterano', ratePercent: 50, frequency: 'medium', retreatsServed: 9 }),
				],
				totals: { meetingCount: 1, memberCount: 2, averageRatePercent: 75 },
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		// Por defecto ordena por %, así que el de 100% va primero.
		let names = wrapper.findAll('tbody tr').map((r) => r.text());
		expect(names.find((n) => n.includes('Novato') || n.includes('Veterano'))).toContain('Novato');

		wrapper.vm.sortBy('served');
		await nextTick();

		names = wrapper.findAll('tbody tr').map((r) => r.text());
		expect(names.find((n) => n.includes('Novato') || n.includes('Veterano'))).toContain('Veterano');
	});

	it('distingue "sin sincronizar" de "no hubo reuniones"', async () => {
		mockQuery.value = { retreatId: 'retreat-1' };
		mockGetStats.mockResolvedValue(
			statsPayload({
				meetings: [],
				retreatLinkedMeetingCount: 0,
				totals: { meetingCount: 0, memberCount: 1, averageRatePercent: 0 },
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		// Un retiro sin preparaciones sincronizadas tiene un arreglo concreto, así
		// que el mensaje no puede ser el genérico de "no hubo reuniones".
		expect(wrapper.text()).toContain('community.attendanceStats.retreatNotSynced');
		expect(wrapper.text()).not.toContain('community.attendanceStats.noMeetingsHint');
	});

	it('renders the unenrolled candidates card when a retreat is filtered', async () => {
		mockQuery.value = { retreatId: 'retreat-1' };
		mockGetStats.mockResolvedValue(
			statsPayload({
				unenrolledCandidates: [member({ firstName: 'Asiste', lastName: 'SinInscribir' })],
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('community.attendanceStats.unenrolledTitle');
		expect(wrapper.text()).toContain('community.attendanceStats.unenrolledCount');
		expect(wrapper.text()).toContain('Asiste SinInscribir');
	});

	// The computed guards on the FILTER, not on the payload: a stale payload
	// carrying the array without retreatId must not render the section.
	it('does not render the candidates card without a retreat filter, even if the payload carries it', async () => {
		mockGetStats.mockResolvedValue(
			statsPayload({
				unenrolledCandidates: [member({ firstName: 'Asiste', lastName: 'SinInscribir' })],
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).not.toContain('community.attendanceStats.unenrolledTitle');
		expect(wrapper.text()).not.toContain('SinInscribir');
	});

	it('shows the candidates empty state when every attendee is already enrolled', async () => {
		mockQuery.value = { retreatId: 'retreat-1' };
		mockGetStats.mockResolvedValue(statsPayload({ unenrolledCandidates: [] }));
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('community.attendanceStats.unenrolledTitle');
		expect(wrapper.text()).toContain('community.attendanceStats.unenrolledEmpty');
	});

	// The card lives OUTSIDE the meetings branch: candidate attendance is
	// measured against the community's meetings, so it stays useful next to
	// the "retreat not synced" report of an upcoming retreat.
	it('keeps the candidates card visible when the retreat has no synced preparations', async () => {
		mockQuery.value = { retreatId: 'retreat-1' };
		mockGetStats.mockResolvedValue(
			statsPayload({
				meetings: [],
				retreatLinkedMeetingCount: 0,
				totals: { meetingCount: 0, memberCount: 1, averageRatePercent: 0 },
				unenrolledCandidates: [member({ firstName: 'Asiste', lastName: 'SinInscribir' })],
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('community.attendanceStats.retreatNotSynced');
		expect(wrapper.text()).toContain('community.attendanceStats.unenrolledTitle');
		expect(wrapper.text()).toContain('SinInscribir');
	});

	// The card has NO interactive sort: the backend sends the candidates
	// already sorted by rate (descending), so the view must paint the payload
	// order untouched.
	it('paints the candidates in the order the backend sends them', async () => {
		mockQuery.value = { retreatId: 'retreat-1' };
		mockGetStats.mockResolvedValue(
			statsPayload({
				unenrolledCandidates: [
					member({ firstName: 'Total', lastName: 'Candido' }),
					member({
						firstName: 'Medio',
						lastName: 'Candido',
						ratePercent: 50,
						frequency: 'medium',
						attended: 1,
						total: 2,
					}),
				],
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		const rows = wrapper.findAll('tbody tr').map((r) => r.text());
		const candidates = rows.filter((text) => text.includes('Candido'));
		expect(candidates).toHaveLength(2);
		expect(candidates[0]).toContain('Total');
		expect(candidates[1]).toContain('Medio');
	});

	it('muestra el estado vacío cuando no hay reuniones celebradas', async () => {
		mockGetStats.mockResolvedValue(
			statsPayload({
				meetings: [],
				totals: { meetingCount: 0, memberCount: 1, averageRatePercent: 0 },
			}),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(wrapper.text()).toContain('community.attendanceStats.noMeetings');
		expect(wrapper.find('.chart').exists()).toBe(false);
	});

	// --- Hint de duplicados (M1): síntoma → solución ---

	const duplicatePairFor = (participantId: string) => ({
		matchedBy: 'phone' as const,
		participants: [
			{
				id: participantId, firstName: 'Asiste', lastName: 'SinInscribir', email: null,
				cellPhone: '5511', references: 4, hasUser: false, isCommunityMember: true,
			},
			{
				id: 'p-other', firstName: 'Asiste', lastName: 'SinInscribir', email: null,
				cellPhone: '5511', references: 1, hasUser: false, isCommunityMember: false,
			},
		],
	});

	it('owner: marca al candidato que está en un par de duplicados y abre la fusión', async () => {
		mockIsOwner.value = true;
		const participantId = '11111111-2222-3333-4444-555555555555';
		mockQuery.value = { retreatId: 'retreat-1' };
		mockGetStats.mockResolvedValue(
			statsPayload({
				unenrolledCandidates: [member({ firstName: 'Asiste', lastName: 'SinInscribir', participantId })],
			}),
		);
		mockGetDuplicates.mockResolvedValue([duplicatePairFor(participantId)]);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		// Fetch one-shot: una sola llamada aunque la recarga de filtros dispare
		// el watch varias veces.
		expect(mockGetDuplicates).toHaveBeenCalledTimes(1);
		expect(mockGetDuplicates).toHaveBeenCalledWith('comm-1');
		expect(wrapper.text()).toContain('community.attendanceStats.duplicateHint');

		const mergeButton = wrapper
			.findAll('button')
			.find((b) => b.text() === 'community.duplicates.merge');
		expect(mergeButton, 'el hint trae el botón de fusionar').toBeTruthy();
		await mergeButton!.trigger('click');
		await nextTick();

		const dialog = wrapper.find('[data-testid="merge-pair-dialog"]');
		expect(dialog.attributes('data-open')).toBe('true');
		expect(dialog.attributes('data-pair')).toBe(participantId);
	});

	it('si la llamada de duplicados falla, la vista funciona igual (fail-soft)', async () => {
		mockIsOwner.value = true;
		mockQuery.value = { retreatId: 'retreat-1' };
		mockGetStats.mockResolvedValue(
			statsPayload({ unenrolledCandidates: [member({ firstName: 'Asiste', lastName: 'SinInscribir' })] }),
		);
		mockGetDuplicates.mockRejectedValue(new Error('boom'));
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		// Sin hint y sin error: la lista de candidatos se pinta igual.
		expect(wrapper.text()).toContain('Asiste SinInscribir');
		expect(wrapper.text()).not.toContain('community.attendanceStats.duplicateHint');
		expect(wrapper.text()).toContain('community.attendanceStats.unenrolledTitle');
	});

	it('co-admin: ni fetch de duplicados ni hint (el merge es owner-only)', async () => {
		mockQuery.value = { retreatId: 'retreat-1' };
		mockGetStats.mockResolvedValue(
			statsPayload({ unenrolledCandidates: [member({ firstName: 'Asiste', lastName: 'SinInscribir' })] }),
		);
		const wrapper = factory();
		await flushPromises();
		await nextTick();

		expect(mockGetDuplicates).not.toHaveBeenCalled();
		expect(wrapper.text()).not.toContain('community.attendanceStats.duplicateHint');
		expect(wrapper.text()).toContain('Asiste SinInscribir');
	});
});
