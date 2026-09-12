/**
 * Tests de la pestaña "Programados" y la visibilidad del tiempo (M3):
 *  - A2: la tabla renderiza los mensajes materializados con su fecha en la TZ
 *    del retiro (la zona la resuelve el servidor; el cliente nunca la infiere).
 *  - A3: la bandeja WhatsApp pinta el scheduledFor del ítem.
 *  - A4: el editor muestra la fecha que tendría cada paso (schedule-preview).
 *  - A5: el badge "N programados" de una secuencia abre la pestaña filtrada,
 *    con chip de secuencia removible.
 */

import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

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
			if (n === 'useToast') return () => ({ toast: vi.fn() });
			if (n === 'toast') return vi.fn();
			if (n.startsWith('use')) return () => ({});
			// Button como <button> real: los tests de M4 clickean por texto.
			if (n === 'Button') return { name: n, template: '<button><slot /></button>' };
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

// Este test afirma sobre textos reales del locale es ('Pendiente',
// 'Programados'…); el setup global mockea vue-i18n con t = clave, así que se
// restaura el módulo real para este archivo.
vi.mock('vue-i18n', async (importOriginal) => await importOriginal());

// Mock de la API con objeto plano enumerando los named exports que usan la
// vista y sus stores (un Proxy como factory no sobrevive la síntesis de
// namespace de vite-node: las props no propias del target nunca llegan).
vi.mock('@/services/api', () => ({
	api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
	// messageSequenceStore
	getRetreatSequences: vi.fn(),
	createMessageSequence: vi.fn(),
	updateMessageSequence: vi.fn(),
	deleteMessageSequence: vi.fn(),
	getSequenceQueue: vi.fn(),
	getSequenceStats: vi.fn(),
	getScheduledMessageDetail: vi.fn(),
	runSequences: vi.fn(),
	regenerateSequenceQueue: vi.fn(),
	bulkResolveSequenceIssues: vi.fn(),
	dispatchScheduledMessage: vi.fn(),
	skipScheduledMessage: vi.fn(),
	retryScheduledMessage: vi.fn(),
	discardScheduledMessage: vi.fn(),
	openScheduledMessage: vi.fn(),
	assignScheduledMessage: vi.fn(),
	setParticipantDoNotContact: vi.fn(),
	fetchScheduledMessages: vi.fn(),
	rescheduleSequenceStep: vi.fn(),
	// globalMessageSequenceStore
	getGlobalSequences: vi.fn(),
	createGlobalSequence: vi.fn(),
	updateGlobalSequence: vi.fn(),
	deleteGlobalSequence: vi.fn(),
	toggleGlobalSequenceActive: vi.fn(),
	copyGlobalSequenceToRetreat: vi.fn(),
	// participantStore
	setAttendanceConfirmation: vi.fn(),
	// la vista
	previewSequenceStep: vi.fn(),
	previewSequenceSchedule: vi.fn(),
}));

const RETREAT_ID = 'retreat-1';

const PARTICIPANT = { id: 'p1', firstName: 'Ana', lastName: 'M3' };

const SEQ = {
	id: 'seq-1',
	name: 'Confirmación de camisetas',
	trigger: 'days_before_retreat',
	audience: 'server',
	isActive: true,
	steps: [{ id: 'st-1' }],
};

// 15:00Z = 9:00 en CDMX (UTC-6, sin DST desde 2022) → la UI debe pintar GMT-6.
const SCHED_PAGE = {
	items: [
		{
			id: 'sm-1',
			sequenceId: 'seq-1',
			stepId: 'st-1',
			participantId: 'p1',
			participantName: 'Ana M3',
			templateType: 'SHIRT_CONFIRMATION',
			channel: 'whatsapp',
			recipientTarget: 'participant',
			recipientName: null,
			status: 'pending',
			scheduledFor: '2026-09-25T15:00:00.000Z',
			error: null,
			stepOrder: 0,
			offsetDays: 5,
			sendHour: 9,
			updatedAt: '2026-09-12T10:00:00.000Z',
		},
	],
	total: 1,
	page: 1,
	totalPages: 1,
	timezone: 'America/Mexico_City',
};

const QUEUE_ITEM = {
	id: 'q-1',
	sequenceId: 'seq-1',
	stepId: 'st-1',
	participantId: 'p1',
	retreatId: RETREAT_ID,
	channel: 'whatsapp',
	templateType: 'SHIRT_CONFIRMATION',
	recipientTarget: 'participant',
	scheduledFor: '2026-10-09T15:00:00.000Z', // 9 oct, 9:00 CDMX
	status: 'queued',
	participant: { id: 'p1', firstName: 'Beto', lastName: 'M3' },
};

async function mountView(): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());
	// Locale fijada en es para poder afirmar sobre textos reales del locale.
	localStorage.setItem('preferred-locale', 'es');

	const apiMod: any = await import('@/services/api');
	apiMod.getRetreatSequences.mockResolvedValue([SEQ]);
	apiMod.getSequenceQueue.mockResolvedValue([QUEUE_ITEM]);
	apiMod.getSequenceStats.mockResolvedValue({ stats: { 'seq-1': { pending: 2 } }, issues: [] });
	apiMod.fetchScheduledMessages.mockResolvedValue(SCHED_PAGE);
	apiMod.previewSequenceSchedule.mockResolvedValue({
		dates: ['2026-09-25T15:00:00.000Z'],
		timezone: 'America/Mexico_City',
	});
	// Participantes por endpoint (el load() del onMounted rehidrata el store y
	// sin esto vacía participants → el participante de muestra desaparece);
	// el resto de GETs (plantillas, responsabilidades) devuelven vacío.
	apiMod.api.get.mockImplementation((url: string) =>
		Promise.resolve({ data: String(url).includes('/participants') ? [PARTICIPANT] : [] }),
	);

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const { useParticipantStore } = await import('@/stores/participantStore');

	const retreatStore = useRetreatStore();
	retreatStore.selectedRetreatId = RETREAT_ID;

	const participantStore = useParticipantStore();
	participantStore.participants = [PARTICIPANT] as any;

	const { default: i18n } = await import('@/i18n');
	const MessageSequencesView = (await import('@/views/MessageSequencesView.vue')).default;
	const wrapper = mount(MessageSequencesView, { global: { plugins: [i18n] } });
	await flushPromises();
	return wrapper;
}

/** Espera el debounce de 400ms de refreshStepDates (relojes reales). */
const waitForStepDates = () => new Promise((r) => setTimeout(r, 500));

describe('MessageSequencesView — pestaña Programados (A2/A3/A5)', () => {
	it('renderiza la fila con la fecha en la TZ del retiro y el hint de zona', async () => {
		const wrapper = await mountView();
		const text = wrapper.text();

		expect(text).toContain('Ana M3');
		// La zona horaria la trae la respuesta del servidor y se muestra tal cual.
		expect(text).toContain('America/Mexico_City');
		// 15:00Z = 9:00 CDMX → la hora del retiro, con su nombre corto de zona.
		expect(text).toContain('GMT-6');
		expect(text).toContain('9:00');
		// Badge de estado del mensaje en la TZ/lista (es).
		expect(text).toContain('Pendiente');
	});

	it('la bandeja WhatsApp pinta el scheduledFor del ítem (A3)', async () => {
		const wrapper = await mountView();
		const text = wrapper.text();

		// El ítem de la bandeja vence 9 oct (distinto del programado de sept).
		expect(text).toContain('Beto M3');
		expect(text).toMatch(/9 ?oct|09 ?oct/);
	});

	it('el contador del tab viene de stats (pending del retiro), no del filtro', async () => {
		const wrapper = await mountView();
		const tab = wrapper.findAll('button').find((b) => b.text().includes('Programados'));
		expect(tab).toBeTruthy();
		expect(tab!.text()).toContain('2');
	});

	it('click en el badge "programados" abre la pestaña filtrada por la secuencia', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.fetchScheduledMessages.mockClear();

		const badge = wrapper.findAll('button').find((b) => b.text().includes('programados'));
		expect(badge).toBeTruthy();
		await badge!.trigger('click');
		await flushPromises();

		expect(wrapper.vm.activeTab).toBe('scheduled');
		expect(wrapper.vm.schedSequenceFilter).toBe('seq-1');
		const calls = apiMod.fetchScheduledMessages.mock.calls;
		const last = calls[calls.length - 1];
		expect(last[0]).toBe(RETREAT_ID);
		expect(last[1].sequenceId).toBe('seq-1');
		expect(last[1].statuses).toEqual(['pending']);
		// El chip muestra el nombre legible de la secuencia.
		expect(wrapper.text()).toContain('Confirmación de camisetas');

		// Remover el chip refetch-ea sin el filtro de secuencia.
		apiMod.fetchScheduledMessages.mockClear();
		await wrapper.vm.clearSchedSequenceFilter();
		await flushPromises();
		expect(wrapper.vm.schedSequenceFilter).toBeNull();
		const calls2 = apiMod.fetchScheduledMessages.mock.calls;
		expect(calls2[calls2.length - 1][1].sequenceId).toBeUndefined();
	});
});

describe('MessageSequencesView — timeline del editor (A4)', () => {
	it('el header del paso muestra la fecha resuelta por el servidor', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');

		wrapper.vm.openCreate();
		wrapper.vm.addStep();
		await flushPromises();
		await waitForStepDates();
		await flushPromises();

		expect(apiMod.previewSequenceSchedule).toHaveBeenCalled();
		expect(wrapper.vm.stepDates).toHaveLength(1);
		expect(wrapper.vm.stepDates[0]).toBe('2026-09-25T15:00:00.000Z');
		const text = wrapper.text();
		expect(text).toContain('→');
		expect(text).toContain('GMT-6');
	});

	it('un paso sin fecha (falta el dato del disparador) lo dice explícitamente', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.previewSequenceSchedule.mockResolvedValue({
			dates: [null],
			timezone: 'America/Mexico_City',
		});

		wrapper.vm.openCreate();
		wrapper.vm.addStep();
		await flushPromises();
		await waitForStepDates();
		await flushPromises();

		expect(wrapper.vm.stepDates).toEqual([null]);
		expect(wrapper.text()).toContain('sin fecha');
	});
});

describe('MessageSequencesView — reprogramar y encolar ya (M4)', () => {
	it('el diálogo abre con los defaults de la fila y confirma el payload exacto', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.rescheduleSequenceStep.mockResolvedValue({
			affected: 2,
			scheduledFor: '2026-09-30T15:00:00.000Z',
		});
		apiMod.fetchScheduledMessages.mockClear();

		const btn = wrapper.findAll('button').find((b) => b.text().includes('Reprogramar'));
		expect(btn).toBeTruthy();
		await btn!.trigger('click');
		await flushPromises();

		// Defaults = pared del scheduledFor de la fila (15:00Z = 25 sep, 9:00 CDMX).
		expect(wrapper.vm.reschedDialog).toBe(true);
		expect(wrapper.vm.reschedDate).toBe('2026-09-25');
		expect(wrapper.vm.reschedHour).toBe(9);
		// El hint nombra el paso (nombre de la secuencia · plantilla).
		expect(wrapper.text()).toContain('Confirmación de camisetas');
		// Aviso de catch-up: la comparación es de pared, no de instantes.
		wrapper.vm.reschedDate = '2020-01-01';
		expect(wrapper.vm.reschedIsPast).toBe(true);

		wrapper.vm.reschedDate = '2026-09-30';
		wrapper.vm.reschedHour = 10;
		await wrapper.vm.confirmReschedule();
		await flushPromises();

		expect(apiMod.rescheduleSequenceStep).toHaveBeenCalledWith('st-1', {
			date: '2026-09-30',
			hour: 10,
		});
		expect(wrapper.vm.reschedDialog).toBe(false);
		// La pestaña Programados se refresca tras mover las filas.
		expect(apiMod.fetchScheduledMessages).toHaveBeenCalled();
	});

	it('"Encolar ya" manda immediate y refresca la pestaña', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.rescheduleSequenceStep.mockResolvedValue({
			affected: 2,
			scheduledFor: '2026-09-12T18:00:00.000Z',
			processed: 2,
		});
		apiMod.fetchScheduledMessages.mockClear();

		const btn = wrapper.findAll('button').find((b) => b.text().includes('Encolar ya'));
		expect(btn).toBeTruthy();
		await btn!.trigger('click');
		await flushPromises();

		expect(apiMod.rescheduleSequenceStep).toHaveBeenCalledWith('st-1', { immediate: true });
		expect(apiMod.fetchScheduledMessages).toHaveBeenCalled();
	});
});

describe('MessageSequencesView — guardar con cambios estructurales (M5)', () => {
	it('el PUT con cancelledPendingCount/archivedStepCount refresca programados+stats', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.updateMessageSequence.mockResolvedValue({
			...SEQ,
			cancelledPendingCount: 3,
			archivedStepCount: 1,
			archivedPendingCount: 2,
		});
		apiMod.fetchScheduledMessages.mockClear();
		apiMod.getSequenceStats.mockClear();

		wrapper.vm.openEdit(SEQ);
		await wrapper.vm.saveDraft();
		await flushPromises();

		expect(apiMod.updateMessageSequence).toHaveBeenCalledWith('seq-1', expect.objectContaining({
			retreatId: RETREAT_ID,
			steps: expect.any(Array),
		}));
		// Las filas materializadas cambiaron → stats y Programados se refrescan.
		expect(apiMod.getSequenceStats).toHaveBeenCalledWith(RETREAT_ID);
		expect(apiMod.fetchScheduledMessages).toHaveBeenCalled();
		expect(wrapper.vm.isEditorOpen).toBe(false);
	});

	it('un cambio inocuo (sin counts) no refetch-ea programados', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.updateMessageSequence.mockResolvedValue({ ...SEQ, cancelledPendingCount: 0, archivedStepCount: 0 });
		apiMod.fetchScheduledMessages.mockClear();
		apiMod.getSequenceStats.mockClear();

		wrapper.vm.openEdit(SEQ);
		await wrapper.vm.saveDraft();
		await flushPromises();

		expect(apiMod.updateMessageSequence).toHaveBeenCalled();
		expect(apiMod.fetchScheduledMessages).not.toHaveBeenCalled();
		expect(apiMod.getSequenceStats).not.toHaveBeenCalled();
	});
});
