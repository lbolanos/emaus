/**
 * Briefing de tareas de la vista de responsabilidades: el botón "Enviar tareas"
 * lista solo servidores con asignaciones y al elegir uno abre el MessageDialog
 * prellenado (plantilla SERVER_ASSIGNMENTS_BRIEFING + {assignments.*}).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

// Spy del singleton del MessageDialog: asserts sobre (participant, opts).
const openSpy = vi.fn();
const toastSpy = vi.fn();
const assignmentDocumentsSpy = vi.fn();
vi.mock('@/composables/useParticipantMessageDialog', () => ({
	useParticipantMessageDialog: () => ({ open: openSpy }),
}));

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: {} }),
	useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: toastSpy });
			if (n === 'toast') return vi.fn();
			if (n.startsWith('use')) return () => ({});
			return { name: n, template: '<div><slot /></div>' };
		},
		has: () => true,
	},
));

vi.mock('lucide-vue-next', () => new Proxy(
	{},
	{
		get: (_t, name) => (name === '__esModule' ? false : { name: String(name), template: '<svg />' }),
		has: () => true,
	},
));

vi.mock('@/services/api', () => ({
	api: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
	exportResponsibilitiesToDocx: vi.fn(),
	getResponsibilityDocumentation: vi.fn(async () => ({ content: '' })),
	listResponsibilityDocumentationKeys: vi.fn(async () => ({ keys: [] })),
	responsabilityAttachmentApi: { list: vi.fn(async () => []), upload: vi.fn(), remove: vi.fn() },
	retreatScheduleApi: { assignmentDocuments: (...args: unknown[]) => assignmentDocumentsSpy(...args) },
}));

// El dialog real arrastra media app; basta un stub para el mount.
vi.mock('@/components/MessageDialog.vue', () => ({
	default: { name: 'MessageDialog', props: ['open', 'context', 'retreatId', 'participant', 'assignmentsData', 'forceTemplateType'], template: '<div class="message-dialog-stub" />' },
}));

const RETREAT_ID = 'retreat-1';

const jose = {
	id: 's1',
	firstName: 'José Luis',
	lastName: 'García Ramírez',
	type: 'server',
	isCancelled: false,
};
const maria = {
	id: 's2',
	firstName: 'María',
	lastName: 'López',
	type: 'server',
	isCancelled: false,
};
// Servidor cancelado con responsabilidad: no es candidato.
const cancelled = {
	id: 's3',
	firstName: 'Cancelado',
	lastName: 'Prueba',
	type: 'server',
	isCancelled: true,
};
// Caminante: nunca es candidato.
const walker = {
	id: 'w1',
	firstName: 'Pedro',
	lastName: 'Caminante',
	type: 'walker',
	isCancelled: false,
};

const responsibilities = [
	{ id: 'r1', name: 'Cocina', responsabilityType: 'cocina', participantId: 's1', isActive: true, priority: 0, retreatId: RETREAT_ID },
	{ id: 'r2', name: 'Música', responsabilityType: 'musica', participant: null, retreatId: RETREAT_ID },
	{ id: 'r3', name: 'Vieja', responsabilityType: 'other', participantId: 's3', isActive: false, priority: 0, retreatId: RETREAT_ID },
];

const teams = [
	{
		id: 'team-1',
		name: 'Música y Alabanza',
		teamType: 'musica',
		retreatId: RETREAT_ID,
		leaderId: 's1',
		leader: jose,
		members: [
			// El líder repetido en members (pasa en prod): el equipo cuenta UNA vez.
			{ id: 'm-0', serviceTeamId: 'team-1', participantId: 's1', role: null, participant: jose },
			{ id: 'm-1', serviceTeamId: 'team-1', participantId: 's2', role: 'ayudante', participant: maria },
		],
		isActive: true,
		priority: 0,
	},
];

async function mountView(): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	(retreatStore as any).retreats = [{ id: RETREAT_ID, parish: 'Test' }];
	retreatStore.selectedRetreatId = RETREAT_ID;

	const { useServiceTeamStore } = await import('@/stores/serviceTeamStore');
	useServiceTeamStore().teams = teams as any;

	const ResponsabilitiesView = (await import('@/views/ResponsabilitiesView.vue')).default;
	const wrapper = mount(ResponsabilitiesView, { global: { mocks: { $t: (k: string) => k } } });
	await flushPromises();
	wrapper.vm.responsibilities = responsibilities;
	wrapper.vm.participants = [jose, maria, cancelled, walker];
	await nextTick();
	await nextTick();
	return wrapper;
}

describe('ResponsabilitiesView - enviar tareas por servidor', () => {
	let wrapper: VueWrapper<any>;

	beforeEach(() => vi.clearAllMocks());
	afterEach(() => {
		wrapper?.unmount();
	});

	it('lista solo servidores activos con al menos una asignación, con conteos', async () => {
		wrapper = await mountView();
		const candidates = wrapper.vm.assignmentsCandidates;
		const ids = candidates.map((c: any) => c.participant.id);
		// José: 1 responsabilidad + líder del equipo. María: 1 equipo (miembro).
		// El cancelado (responsabilidad inactiva) y el caminante no entran.
		expect(ids).toEqual(['s1', 's2']);
		const byId = Object.fromEntries(candidates.map((c: any) => [c.participant.id, c]));
		expect(byId.s1.responsibilitiesCount).toBe(1);
		expect(byId.s1.teamsCount).toBe(1);
		expect(byId.s2.responsibilitiesCount).toBe(0);
		expect(byId.s2.teamsCount).toBe(1);
	});

	it('filtra la lista por búsqueda normalizada', async () => {
		wrapper = await mountView();
		wrapper.vm.assignmentsSearch = 'jose garcia';
		await nextTick();
		expect(wrapper.vm.assignmentsCandidates.map((c: any) => c.participant.id)).toEqual(['s1']);
		wrapper.vm.assignmentsSearch = 'zzz';
		await nextTick();
		expect(wrapper.vm.assignmentsCandidates).toHaveLength(0);
	});

	it('al elegir un servidor abre el MessageDialog con plantilla y assignmentsData', async () => {
		wrapper = await mountView();
		// El Popover stub renderiza su contenido: el botón de la lista de María.
		const buttons = wrapper.findAll('button');
		const mariaBtn = buttons.find((b) => b.text().includes('María'));
		expect(mariaBtn).toBeTruthy();
		await mariaBtn!.trigger('click');
		await flushPromises();

		expect(openSpy).toHaveBeenCalledTimes(1);
		const [participant, opts] = openSpy.mock.calls[0];
		expect(participant.id).toBe('s2');
		expect(opts.templateType).toBe('SERVER_ASSIGNMENTS_BRIEFING');
		// {assignments.*} armados con los datos de la vista: María es miembro
		// del equipo de música (rol textual) y no tiene responsabilidades.
		expect(opts.assignmentsData.responsibilities).toEqual([]);
		expect(opts.assignmentsData.teams).toHaveLength(1);
		expect(opts.assignmentsData.teams[0].name).toBe('Música y Alabanza');
		expect(opts.assignmentsData.teams[0].role).toBe('Miembro (ayudante)');
	});

	// specs/assignment-documents: momentos y documentos del Minuto a Minuto.
	describe('documentos del Minuto a Minuto', () => {
		const docsFor = (url: string) => ({
			moments: [
				{ dayLabel: 'Sábado', time: '20:15', name: 'Dinámica La Pared', documents: [{ label: 'Pared', url }] },
			],
			responsibilityDocuments: [],
			table: null,
		});
		const clickServer = async (name: string) => {
			const btn = wrapper.findAll('button').find((b) => b.text().includes(name));
			expect(btn).toBeTruthy();
			await btn!.trigger('click');
			await flushPromises();
		};

		it('al abrir el Popover carga los documentos y los mezcla en assignmentsData', async () => {
			assignmentDocumentsSpy.mockResolvedValue({ s2: docsFor('https://s3/pared.pdf') });
			wrapper = await mountView();
			wrapper.vm.assignmentsBriefingOpen = true;
			await flushPromises();

			expect(assignmentDocumentsSpy).toHaveBeenCalledWith(RETREAT_ID);
			const maria = wrapper.vm.assignmentsCandidates.find((c: any) => c.participant.id === 's2');
			expect(maria.documentsCount).toBe(1);

			await clickServer('María');
			const [, opts] = openSpy.mock.calls[0];
			expect(opts.assignmentsData.moments.map((m: any) => m.name)).toEqual(['Dinámica La Pared']);
			// Lo que arma la vista se conserva.
			expect(opts.assignmentsData.teams).toHaveLength(1);
			// El spy de toast lo comparten los stores: aseguro sobre el aviso de documentos.
			expect(toastSpy).not.toHaveBeenCalledWith(
				expect.objectContaining({ title: 'responsibilities.sendTasks.documentsError' }),
			);
		});

		it('incluye a los servidores parciales y a quien solo tiene momentos', async () => {
			const angel = { id: 'p1', firstName: 'Ángel', lastName: 'Parcial', type: 'partial_server', isCancelled: false };
			const pablo = { id: 's4', firstName: 'Pablo', lastName: 'Mesa', type: 'server', isCancelled: false };
			assignmentDocumentsSpy.mockResolvedValue({ s4: docsFor('https://s3/d1.pdf'), w1: docsFor('https://s3/x.pdf') });
			wrapper = await mountView();
			wrapper.vm.participants = [jose, maria, cancelled, walker, angel, pablo];
			wrapper.vm.responsibilities = [
				...responsibilities,
				{ id: 'r4', name: 'Palanquitas', responsabilityType: 'other', participantId: 'p1', isActive: true, priority: 0, retreatId: RETREAT_ID },
			];
			wrapper.vm.assignmentsBriefingOpen = true;
			await flushPromises();

			const ids = wrapper.vm.assignmentsCandidates.map((c: any) => c.participant.id);
			expect(ids).toEqual(expect.arrayContaining(['p1', 's4']));
			// Un caminante nunca es candidato, aunque le llegaran datos.
			expect(ids).not.toContain('w1');
			expect(ids).not.toContain('s3');
		});

		it('si la carga falla avisa con un toast y abre el mensaje sin documentos', async () => {
			assignmentDocumentsSpy.mockRejectedValue(new Error('500'));
			wrapper = await mountView();
			wrapper.vm.assignmentsBriefingOpen = true;
			await flushPromises();

			await clickServer('María');
			expect(toastSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'responsibilities.sendTasks.documentsError',
					variant: 'destructive',
				}),
			);
			const [, opts] = openSpy.mock.calls[0];
			expect(opts.assignmentsData.moments).toBeUndefined();
			expect(opts.assignmentsData.teams).toHaveLength(1);
		});
	});
});
